import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { ROLES, RFA_CM_VISIBLE_STATUSES } from '@/lib/config/workflow';

export const dynamic = 'force-dynamic';

// GET /api/rfa/[id]/activity  (T-027)
// Returns the access/audit logs for ONE RFA document, authorized by the SAME read-access
// rule as GET /api/rfa/[id] (site membership + CM visible-status). Consumed by the nested
// access log in the RFA history modal. Anyone who may VIEW the document may read its access log.
export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ success: false, error: 'Missing authorization' }, { status: 401 });
        }
        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await adminAuth.verifyIdToken(token);
        const userId = decodedToken.uid;

        const userDoc = await adminDb.collection('users').doc(userId).get();
        if (!userDoc.exists) return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
        const userData = userDoc.data()!;
        const userSites = userData.sites || [];

        const rfaDoc = await adminDb.collection('rfaDocuments').doc(params.id).get();
        if (!rfaDoc.exists) return NextResponse.json({ success: false, error: 'RFA document not found' }, { status: 404 });
        const rfaData = rfaDoc.data()!;

        // Same read-access gate as GET /api/rfa/[id] (this route also uses the Admin SDK, which
        // bypasses firestore.rules, so the check must be enforced in code):
        // 1) site membership — admin bypasses.
        if (userData.role !== ROLES.ADMIN && !userSites.includes(rfaData.siteId)) {
            return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
        }
        // 2) CM only ever sees documents that have reached them.
        if (userData.role === ROLES.CM && !RFA_CM_VISIBLE_STATUSES.includes(rfaData.status)) {
            return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
        }

        // Index-free query: a single equality filter uses the automatic single-field index, so no
        // composite index has to be provisioned. Per-document log volume is modest — cap at 500 to
        // bound the payload and sort chronologically in memory.
        const snap = await adminDb.collection('activityLogs')
            .where('resourceId', '==', params.id)
            .limit(500)
            .get();

        // Resolve each author's CURRENT display name from their users profile, so the log shows the
        // real name (not the value frozen at write time) and updates retroactively once a profile
        // gains a name. Batched getAll by doc ref → no composite index. Falls back to the stored
        // userName, then email, when the profile has no name (e.g. non-invitation accounts).
        const authorIds = [...new Set(snap.docs.map((d) => d.data().userId).filter(Boolean))] as string[];
        const nameByUid = new Map<string, string>();
        if (authorIds.length > 0) {
            const userRefs = authorIds.map((uid) => adminDb.collection('users').doc(uid));
            const userSnaps = await adminDb.getAll(...userRefs);
            for (const u of userSnaps) {
                const n = u.exists ? (u.data()?.name || '') : '';
                if (n) nameByUid.set(u.id, String(n));
            }
        }

        const logs = snap.docs
            .map((d) => {
                const data = d.data();
                const createdAt = data.createdAt?.toDate?.() ?? null;
                return {
                    id: d.id,
                    userId: data.userId ?? '',
                    userName: nameByUid.get(data.userId) || data.userName || data.userEmail || '',
                    userEmail: data.userEmail ?? '',
                    userRole: data.userRole ?? '',
                    action: data.action,
                    resourceType: data.resourceType,
                    resourceId: data.resourceId,
                    resourceName: data.resourceName ?? '',
                    description: data.description ?? '',
                    metadata: data.metadata ?? {},
                    createdAt: createdAt ? createdAt.toISOString() : null,
                };
            })
            .filter((l) => l.resourceType === 'RFA')
            .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));

        return NextResponse.json({ success: true, logs });
    } catch (error: any) {
        console.error('[rfa/[id]/activity] GET error:', error?.message || error);
        return NextResponse.json({ success: false, error: 'Failed to fetch activity logs' }, { status: 500 });
    }
}
