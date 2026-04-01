// src/app/api/work-request/[id]/update/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth, adminBucket } from '@/lib/firebase/admin'; // ✅ เพิ่ม adminBucket
import { FieldValue } from 'firebase-admin/firestore';
import { WR_STATUSES, WR_APPROVER_ROLES, REVIEWER_ROLES, ROLES } from '@/lib/config/workflow';
import { WorkRequestStatus } from '@/types/work-request';
import { getFileUrl } from '@/lib/utils/storage';
import { logActivity, buildDescription } from '@/lib/utils/activityLogger';

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

    // --- ตรวจสอบ Action (Code เดิมของคุณ) ---
    switch (action) {
      case 'APPROVE_DRAFT':
        if (WR_APPROVER_ROLES.includes(userData.role) && docData.status === WR_STATUSES.DRAFT) {
          canPerformAction = true;
          newStatus = WR_STATUSES.PENDING_BIM;
        }
        break;
      case 'REJECT_DRAFT':
        if (WR_APPROVER_ROLES.includes(userData.role) && docData.status === WR_STATUSES.DRAFT) {
          if (!payload || !payload.comments || payload.comments.trim() === '') {
            return NextResponse.json({ success: false, error: 'Comment is required when rejecting.' }, { status: 400 });
          }
          canPerformAction = true;
          newStatus = WR_STATUSES.REJECTED_BY_PM;
        }
        break;
      case 'SUBMIT_WORK':
        if (userData.role === ROLES.BIM && docData.status === WR_STATUSES.IN_PROGRESS) {
          canPerformAction = true;
          newStatus = WR_STATUSES.PENDING_ACCEPTANCE;
        }
        break;
      case 'REQUEST_REVISION':
        if (REVIEWER_ROLES.includes(userData.role) && docData.status === WR_STATUSES.PENDING_ACCEPTANCE) {
          canPerformAction = true;
          newStatus = WR_STATUSES.REVISION_REQUESTED;
        }
        break;
      case 'COMPLETE':
        if (REVIEWER_ROLES.includes(userData.role) && docData.status === WR_STATUSES.PENDING_ACCEPTANCE) {
          canPerformAction = true;
          newStatus = WR_STATUSES.COMPLETED;
        }
        break;
    }

    if (!canPerformAction || !newStatus) {
      return NextResponse.json({ success: false, error: 'Permission denied or invalid action.' }, { status: 403 });
    }

    // 🔥🔥🔥 [เริ่มส่วนแก้ไข] จัดการย้ายไฟล์จาก Temp -> Permanent 🔥🔥🔥
    let finalFiles: any[] = [];

    // ตรวจสอบว่ามีไฟล์แนบมาใน payload หรือไม่ (สำหรับ action SUBMIT_WORK หรืออื่นๆ)
    if (payload?.files && Array.isArray(payload.files) && payload.files.length > 0) {
      for (const tempFile of payload.files) {
        // ถ้านามสกุลไฟล์หรือ path บ่งบอกว่าเป็นไฟล์ใหม่ใน temp
        if (tempFile.filePath && tempFile.filePath.startsWith('temp/')) {
          const destinationPath = `sites/${docData.siteId}/work-requests/${docData.documentNumber}/${Date.now()}_${tempFile.fileName}`;

          try {
            // สั่งย้ายไฟล์ใน Google Storage
            await adminBucket.file(tempFile.filePath).move(destinationPath);

            // อัปเดตข้อมูลไฟล์ให้ชี้ไปที่ Path ใหม่
            finalFiles.push({
              ...tempFile,
              fileUrl: getFileUrl(destinationPath),
              filePath: destinationPath,
              uploadedAt: new Date().toISOString(),
              uploadedBy: userId,
            });
          } catch (moveError) {
            console.error(`Failed to move file ${tempFile.filePath}:`, moveError);
            // กรณี Error อาจจะเลือกข้าม หรือ throw error ก็ได้
          }
        } else {
          // ถ้าเป็นไฟล์เก่าที่ path ถูกต้องอยู่แล้ว ให้ใส่กลับเข้าไปเหมือนเดิม
          finalFiles.push(tempFile);
        }
      }
    }
    // 🔥🔥🔥 [สิ้นสุดส่วนแก้ไข] 🔥🔥🔥

    const workflowStep = {
      action,
      status: newStatus,
      userId,
      userName: userData.email,
      role: userData.role,
      timestamp: new Date().toISOString(),
      comments: payload?.comments || '',
      files: finalFiles, // ✅ ใช้ไฟล์ที่ย้ายแล้ว (finalFiles) แทน payload.files
    };

    updates.status = newStatus;
    updates.workflow = FieldValue.arrayUnion(workflowStep);
    updates.updatedAt = FieldValue.serverTimestamp();

    // อัปเดตไฟล์หลัก เฉพาะตอน Submit Work
    if (action === 'SUBMIT_WORK' && finalFiles.length > 0) {
      // ✅ ใช้ finalFiles ที่ย้ายแล้ว
      updates.files = FieldValue.arrayUnion(...finalFiles);
    }

    await docRef.update(updates);

    const wrLogActionMap: Record<string, string> = {
      'APPROVE_DRAFT': 'APPROVE_WORK_REQUEST',
      'REJECT_DRAFT':  'REJECT_WORK_REQUEST',
    };
    const wrLogAction = wrLogActionMap[action];
    if (wrLogAction) {
      const siteDoc = await adminDb.collection('sites').doc(docData.siteId).get();
      logActivity({
        userId,
        userEmail: userData.email,
        userRole: userData.role,
        siteId: docData.siteId,
        siteName: siteDoc.data()?.name || '',
        action: wrLogAction as any,
        resourceType: 'WORK_REQUEST',
        resourceId: params.id,
        resourceName: docData.documentNumber,
        resourceTitle: docData.taskName,
        description: buildDescription(wrLogAction as any, docData.documentNumber),
        metadata: { newStatus },
      });
    }

    return NextResponse.json({ success: true, newStatus });

  } catch (error) {
    console.error(`Error updating work request ${params.id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}