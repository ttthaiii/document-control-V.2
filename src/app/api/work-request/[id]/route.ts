import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { ROLES } from '@/lib/config/workflow';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // --- User Authentication ---
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

    // --- Fetch Work Request Data ---
    const docId = params.id;
    const docRef = adminDb.collection('workRequests').doc(docId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({ success: false, error: 'Document not found' }, { status: 404 });
    }

    const docData = docSnap.data()!;

    // --- Authorization Check ---
    if (userData.role !== ROLES.ADMIN && !userSites.includes(docData.siteId)) {
        return NextResponse.json({ success: false, error: 'Access to this document is denied' }, { status: 403 });
    }

    // --- Fetch Additional Info (Site, Users) ---
    const siteSnap = await adminDb.collection('sites').doc(docData.siteId).get();
    
    // --- 👇 นี่คือจุดที่แก้ไข ---
    const siteData = siteSnap.exists ? { id: siteSnap.id, ...siteSnap.data() } : { id: docData.siteId, name: 'Unknown Site' };
    // --- 👆 สิ้นสุดการแก้ไข ---

    const userIds = Array.from(new Set(docData.workflow.map((step: any) => step.userId)));
    const userPromises = userIds.map(uid => adminDb.collection('users').doc(uid as string).get());
    const userDocs = await Promise.all(userPromises);
    
    const usersInfo: Record<string, any> = {};
    userDocs.forEach(userSnap => {
        if (userSnap.exists) {
            const uData = userSnap.data()!;
            usersInfo[userSnap.id] = { email: uData.email, role: uData.role };
        }
    });

    return NextResponse.json({
      success: true,
      document: {
        id: docSnap.id,
        ...docData,
        site: siteData,
        usersInfo,
      },
    });

  } catch (error) {
    console.error(`Error fetching work request ${params.id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}