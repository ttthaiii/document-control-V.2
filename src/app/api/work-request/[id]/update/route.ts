// src/app/api/work-request/[id]/update/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { WR_STATUSES } from '@/lib/config/workflow'; // ❌ ลบ ROLES, WR_... ออก
import { WorkRequestStatus } from '@/types/work-request';
// 👇 1. Import checkPermission
import { checkPermission } from '@/lib/auth/permission-check';

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
    let isPermissionGranted = false;

    // --- ✅ ส่วนที่แก้ไข: ตรวจสอบสิทธิ์ด้วย checkPermission ---

    // 1. กลุ่มอนุมัติ Draft (PD, PM)
    if (action === 'APPROVE_DRAFT' || action === 'REJECT_DRAFT') {
        isPermissionGranted = await checkPermission(
            docData.siteId, 
            userData.role, 
            'WORK_REQUEST', 
            'approve_draft',
            userId
        );
    }
    // 2. กลุ่มปฏิบัติงาน (BIM)
    else if (action === 'SUBMIT_WORK') {
        isPermissionGranted = await checkPermission(
            docData.siteId, 
            userData.role, 
            'WORK_REQUEST', 
            'execute',
            userId
        );
    }
    // 3. กลุ่มตรวจรับงาน (Site, PE, OE)
    else if (action === 'COMPLETE' || action === 'REQUEST_REVISION') {
        // 💡 Note: เราใช้ key 'inspect' สำหรับสิทธิ์ในการตรวจรับงาน
        // (ถ้าใน DB ยังไม่มี key นี้ ระบบจะไปอ่านจาก Default ใน permission-check.ts)
        isPermissionGranted = await checkPermission(
            docData.siteId, 
            userData.role, 
            'WORK_REQUEST', 
            'inspect',
            userId
        );
    }

    if (!isPermissionGranted) {
         return NextResponse.json({ success: false, error: `Permission denied for action: ${action}` }, { status: 403 });
    }

    // --- จบส่วนตรวจสอบสิทธิ์ ---


    // --- ตรวจสอบ Status Flow (Business Logic) ---
    // ถึงจะมีสิทธิ์ แต่ต้องกดให้ถูกจังหวะของสถานะด้วย
    let isValidStatus = false;

    switch (action) {
      case 'APPROVE_DRAFT':
        if (docData.status === WR_STATUSES.DRAFT) {
          isValidStatus = true;
          newStatus = WR_STATUSES.PENDING_BIM;
        }
        break;

      case 'REJECT_DRAFT':
        if (docData.status === WR_STATUSES.DRAFT) {
          if (!payload || !payload.comments || payload.comments.trim() === '') {
             return NextResponse.json({ success: false, error: 'Comment is required when rejecting.' }, { status: 400 });
          }
          isValidStatus = true;
          newStatus = WR_STATUSES.REJECTED_BY_PM;
        }
        break;

      case 'SUBMIT_WORK':
        // BIM ต้องกดตอน In Progress เท่านั้น
        if (docData.status === WR_STATUSES.IN_PROGRESS) {
            isValidStatus = true;
            newStatus = WR_STATUSES.PENDING_ACCEPTANCE;
        }
        break;

      case 'REQUEST_REVISION':
        // Site กดตอนงานส่งมาแล้ว (Pending Acceptance)
        if (docData.status === WR_STATUSES.PENDING_ACCEPTANCE) {
          isValidStatus = true;
          newStatus = WR_STATUSES.REVISION_REQUESTED;
        }
        break;

      case 'COMPLETE':
        // Site กดตอนงานส่งมาแล้ว (Pending Acceptance)
        if (docData.status === WR_STATUSES.PENDING_ACCEPTANCE) {
          isValidStatus = true;
          newStatus = WR_STATUSES.COMPLETED;
        }
        break;
    }

    if (!isValidStatus || !newStatus) {
      return NextResponse.json({ success: false, error: 'Invalid action for current document status.' }, { status: 400 });
    }

    // --- บันทึกข้อมูล (เหมือนเดิม) ---
    const workflowStep = {
      action,
      status: newStatus,
      userId,
      userName: userData.email,
      role: userData.role,
      timestamp: new Date().toISOString(),
      comments: payload?.comments || '',
      files: payload?.files || [],
    };

    updates.status = newStatus;
    updates.workflow = FieldValue.arrayUnion(workflowStep);
    updates.updatedAt = FieldValue.serverTimestamp();

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