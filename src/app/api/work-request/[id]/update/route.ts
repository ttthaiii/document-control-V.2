import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { WorkRequestStatus } from '@/types/work-request';
import { ROLES, REVIEWER_ROLES } from '@/lib/config/workflow';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const docId = params.id;
    const { action, payload } = await request.json();

    const docRef = adminDb.collection('workRequests').doc(docId);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return NextResponse.json({ success: false, error: 'Document not found' }, { status: 404 });
    }
    const docData = docSnap.data()!;

    let newStatus: WorkRequestStatus | null = null;
    const updates: { [key: string]: any } = {};
    let canPerformAction = false;

    switch (action) {
        
      case 'SUBMIT_WORK':
        // เปลี่ยนเงื่อนไขจาก `userId === docData.assignedTo` เป็น `userData.role === ROLES.BIM`
        if (userData.role === ROLES.BIM && (docData.status === WorkRequestStatus.IN_PROGRESS || docData.status === WorkRequestStatus.REVISION_REQUESTED)) {
            canPerformAction = true;
            newStatus = WorkRequestStatus.PENDING_ACCEPTANCE;
        }
        break;

      case 'REQUEST_REVISION':
        if (REVIEWER_ROLES.includes(userData.role) && docData.status === WorkRequestStatus.PENDING_ACCEPTANCE) {
          canPerformAction = true;
          newStatus = WorkRequestStatus.REVISION_REQUESTED;
        }
        break;

      case 'COMPLETE':
        if (REVIEWER_ROLES.includes(userData.role) && docData.status === WorkRequestStatus.PENDING_ACCEPTANCE) {
          canPerformAction = true;
          newStatus = WorkRequestStatus.COMPLETED;
        }
        break;
    }

    if (!canPerformAction || !newStatus) {
      return NextResponse.json({ success: false, error: 'Permission denied or invalid action' }, { status: 403 });
    }

    const workflowStep = {
      action,
      status: newStatus,
      userId,
      userName: userData.email,
      role: userData.role,
      timestamp: new Date().toISOString(),
      comments: payload.comments || '',
      files: payload.files || [],
    };

    updates.status = newStatus;
    updates.workflow = FieldValue.arrayUnion(workflowStep);
    updates.updatedAt = FieldValue.serverTimestamp();
    
    await docRef.update(updates);

    return NextResponse.json({ success: true, newStatus });

  } catch (error) {
    console.error(`Error updating work request ${params.id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}