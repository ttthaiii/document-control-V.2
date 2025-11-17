// src/app/api/work-request/[id]/update/route.ts (แก้ไขแล้ว)
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
// --- 👇 [แก้ไข] Import เพิ่มเติม ---
import { WR_STATUSES, WR_APPROVER_ROLES, REVIEWER_ROLES, ROLES } from '@/lib/config/workflow';
import { WorkRequestStatus } from '@/types/work-request'; // Import Type ด้วย
// --- 👆 สิ้นสุดการแก้ไข ---


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

    let newStatus: WorkRequestStatus | null = null; // <-- ใช้ Type WorkRequestStatus
    const updates: { [key: string]: any } = {};
    let canPerformAction = false;

    switch (action) {

      // --- 👇 [เพิ่ม] Action ใหม่สำหรับ PD/PM ---
      case 'APPROVE_DRAFT':
        if (WR_APPROVER_ROLES.includes(userData.role) && docData.status === WR_STATUSES.DRAFT) {
          canPerformAction = true;
          newStatus = WR_STATUSES.PENDING_BIM; // เปลี่ยนเป็นรอ BIM รับงาน
        }
        break;

      case 'REJECT_DRAFT':
        if (WR_APPROVER_ROLES.includes(userData.role) && docData.status === WR_STATUSES.DRAFT) {
          // ตรวจสอบว่ามี Comment มาด้วยหรือไม่
          if (!payload || !payload.comments || payload.comments.trim() === '') {
             return NextResponse.json({ success: false, error: 'Comment is required when rejecting.' }, { status: 400 });
          }
          canPerformAction = true;
          newStatus = WR_STATUSES.REJECTED_BY_PM; // เปลี่ยนเป็น Reject by PM
        }
        break;
      // --- 👆 สิ้นสุดการเพิ่ม ---

      // --- Actions เดิม (ทำงานหลังสถานะ DRAFT) ---
      case 'SUBMIT_WORK':
        if (userData.role === ROLES.BIM && docData.status === WR_STATUSES.IN_PROGRESS) {
            canPerformAction = true;
            newStatus = WR_STATUSES.PENDING_ACCEPTANCE;
        }
        break;

      case 'REQUEST_REVISION':
        // แก้ไข: ใช้ REVIEWER_ROLES จาก workflow.ts
        if (REVIEWER_ROLES.includes(userData.role) && docData.status === WR_STATUSES.PENDING_ACCEPTANCE) {
          canPerformAction = true;
          newStatus = WR_STATUSES.REVISION_REQUESTED;
        }
        break;

      case 'COMPLETE':
        // แก้ไข: ใช้ REVIEWER_ROLES จาก workflow.ts
        if (REVIEWER_ROLES.includes(userData.role) && docData.status === WR_STATUSES.PENDING_ACCEPTANCE) {
          canPerformAction = true;
          newStatus = WR_STATUSES.COMPLETED;
        }
        break;
    }

    if (!canPerformAction || !newStatus) {
      console.warn(`Action "${action}" denied for user ${userId} (Role: ${userData.role}) on doc ${docId} (Status: ${docData.status})`);
      return NextResponse.json({ success: false, error: 'Permission denied or invalid action for current status.' }, { status: 403 });
    }

    const workflowStep = {
      action,
      status: newStatus,
      userId,
      userName: userData.email,
      role: userData.role,
      timestamp: new Date().toISOString(),
      comments: payload?.comments || '', // ใช้ Optional chainingเผื่อ payload ไม่มี
      files: payload?.files || [],     // ใช้ Optional chainingเผื่อ payload ไม่มี
    };

    updates.status = newStatus;
    updates.workflow = FieldValue.arrayUnion(workflowStep);
    updates.updatedAt = FieldValue.serverTimestamp();

    // อัปเดตไฟล์หลัก เฉพาะตอน Submit Work (Logic เดิม)
    if (action === 'SUBMIT_WORK' && payload?.files && Array.isArray(payload.files) && payload.files.length > 0) {
        updates.files = FieldValue.arrayUnion(...payload.files);
    }

    await docRef.update(updates);

    return NextResponse.json({ success: true, newStatus });

  } catch (error) {
    console.error(`Error updating work request ${params.id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}