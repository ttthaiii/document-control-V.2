// src/app/api/rfa/lookup/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { ROLES } from '@/lib/config/workflow';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(token);
    const userId = decodedToken.uid;

    const userDoc = await adminDb.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }
    
    const userData = userDoc.data()!;
    const userSites = userData.sites || [];
    
    // Check role (Must be PM, PD, or ADMIN for this global lookup)
    const LOG_VIEWER_ROLES = [ROLES.PM, ROLES.PD, ROLES.ADMIN];
    if (!LOG_VIEWER_ROLES.includes(userData.role)) {
       return NextResponse.json({ success: false, error: 'Permission denied' }, { status: 403 });
    }

    if (userData.role !== ROLES.ADMIN && userSites.length === 0) {
      return NextResponse.json({ success: true, documents: [] });
    }

    // 1. Fetch sites dictionaries to map siteId to siteName
    const sitesSnapshot = await adminDb.collection('sites').get();
    const siteMap: Record<string, string> = {};
    sitesSnapshot.docs.forEach(doc => {
      siteMap[doc.id] = doc.data().name || doc.id;
    });

    // 2. Query ALL RFAs (Latest revision of each document)
    let firestoreQuery: FirebaseFirestore.Query = adminDb.collection('rfaDocuments').where('isLatest', '==', true);

    // If not Admin, restrict to user's assigned sites
    if (userData.role !== ROLES.ADMIN) {
      // Note: 'in' query supports max 10 values, but typical PM handles < 10 sites.
      // If PM has > 10 sites, we would need to batch it, but assuming standard scale here.
      firestoreQuery = firestoreQuery.where('siteId', 'in', userSites.slice(0, 10));
    }

    // Since we only need minimal fields for the Dropdown (Title, DocNo, SiteName),
    // we use a lean projection to save bandwidth
    const snapshot = await firestoreQuery.select('title', 'documentNumber', 'siteId').get();

    const documents = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        title: data.title || '',
        documentNumber: data.documentNumber || '',
        siteId: data.siteId,
        siteName: siteMap[data.siteId] || data.siteId,
      };
    });

    return NextResponse.json({ success: true, documents });

  } catch (err: any) {
    console.error('[rfa lookup GET] Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
