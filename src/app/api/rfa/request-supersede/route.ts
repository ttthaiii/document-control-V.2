// src/app/api/rfa/request-supersede/route.ts
// API สำหรับ Approver ขอแก้ไขเอกสารที่ "อนุมัติ" แล้ว → เปิด Revision Loop ใหม่
import { NextResponse } from 'next/server';
import { adminDb, adminBucket, adminAuth } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { STATUSES, APPROVER_ROLES, ROLES } from '@/lib/config/workflow';
import { getFileUrl } from '@/lib/utils/storage';
import { Role } from '@/lib/config/workflow';

export const dynamic = 'force-dynamic';

// สถานะที่อนุญาตให้ขอแก้ไขได้
const SUPERSEDABLE_STATUSES = [
  STATUSES.APPROVED,
  STATUSES.APPROVED_WITH_COMMENTS,
  STATUSES.APPROVED_REVISION_REQUIRED,
];

export async function POST(req: Request) {
  // --- Auth Check ---
  const authHeader = req.headers.get('authorization') || '';
  const match = authHeader.match(/^Bearer (.+)$/i);
  if (!match) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(match[1]);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { docId, comment, uploadedFiles, suspendOldDoc } = body;

    // Validate input
    if (!docId || !comment?.trim()) {
      return NextResponse.json(
        { error: 'กรุณาระบุ docId และ comment ก่อนขอแก้ไข' },
        { status: 400 }
      );
    }
    if (!uploadedFiles || uploadedFiles.length === 0) {
      return NextResponse.json(
        { error: 'กรุณาแนบไฟล์หลักฐานคำสั่งแก้ไขอย่างน้อย 1 ไฟล์' },
        { status: 400 }
      );
    }

    // --- Load User and Document ---
    const [userDoc, rfaDoc] = await Promise.all([
      adminDb.collection('users').doc(uid).get(),
      adminDb.collection('rfaDocuments').doc(docId).get(),
    ]);

    if (!userDoc.exists) return NextResponse.json({ error: 'User not found' }, { status: 403 });
    if (!rfaDoc.exists) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

    const userData = userDoc.data()!;
    const rfaData = rfaDoc.data()!;
    const userRole = userData.role as Role;

    // --- Permission Check ---
    // เฉพาะ Site (Approver roles) และ Admin เท่านั้นที่ขอแก้ไขเอกสารที่อนุมัติแล้วได้
    // BIM ไม่มีสิทธิ์ ไม่ว่าเอกสารนั้นจะสร้างโดย BIM หรือไม่
    const isBimDocument =
      rfaData.workflow?.[0]?.role === ROLES.BIM ||
      rfaData.createdByInfo?.role === ROLES.BIM;

    const isAdmin = userRole === ROLES.ADMIN;
    const isApprover = (APPROVER_ROLES as readonly string[]).includes(userRole);

    const hasPermission =
      isAdmin ||
      isApprover;

    if (!hasPermission) {
      return NextResponse.json(
        { error: 'เฉพาะทีม Site เท่านั้นที่มีสิทธิ์ขอแก้ไขเอกสารที่อนุมัติแล้ว' },
        { status: 403 }
      );
    }

    // --- Status Check ---
    if (!SUPERSEDABLE_STATUSES.includes(rfaData.status)) {
      return NextResponse.json(
        { error: `ไม่สามารถขอแก้ไขเอกสารที่มีสถานะ "${rfaData.status}" ได้` },
        { status: 400 }
      );
    }

    if (rfaData.supersededStatus === 'SUSPENDED') {
      return NextResponse.json(
        { error: 'เอกสารนี้อยู่ระหว่างการขอแก้ไขอยู่แล้ว' },
        { status: 400 }
      );
    }

    // --- Move evidence files from temp to permanent storage ---
    const finalFilesData = [];
    for (const tempFile of uploadedFiles) {
      const sourcePath = tempFile.filePath;
      if (!sourcePath || !sourcePath.startsWith(`temp/${uid}/`)) continue;

      const destinationPath = `sites/${rfaData.siteId}/rfa/${rfaData.documentNumber}/supersede-evidence/${Date.now()}_${tempFile.fileName}`;
      await adminBucket.file(sourcePath).move(destinationPath);

      finalFilesData.push({
        ...tempFile,
        fileUrl: getFileUrl(destinationPath),
        filePath: destinationPath,
        uploadedAt: new Date().toISOString(),
        uploadedBy: uid,
      });
    }

    // --- Update document status ---
    const newSupersededStatus = suspendOldDoc ? 'SUSPENDED' : 'ACTIVE';

    const timestampIso = new Date().toISOString();

    await adminDb.collection('rfaDocuments').doc(docId).update({
      supersededStatus: newSupersededStatus,
      supersededComment: comment.trim(),
      supersededFiles: finalFilesData,
      supersededRequestedBy: uid,
      supersededRequestedAt: timestampIso,
      updatedAt: FieldValue.serverTimestamp(),
      workflow: FieldValue.arrayUnion({
        step: STATUSES.REVISION_REQUESTED,
        status: STATUSES.REVISION_REQUESTED,
        action: 'REQUEST_REVISION',
        userId: uid,
        userName: userData.profile?.name || userData.email || 'Unknown User',
        userRole: userRole,
        role: userRole,
        timestamp: timestampIso,
        comments: comment.trim(),
        files: finalFilesData,
        revisionNumber: rfaData.revisionNumber
      })
    });

    return NextResponse.json({
      success: true,
      message: 'บันทึกคำขอแก้ไขสำเร็จ',
      data: {
        docId,
        newSupersededStatus,
        // ส่ง rfaData กลับไปเพื่อให้ UI pre-fill ฟอร์ม Rev. ใหม่
        originalDocument: {
          documentNumber: rfaData.documentNumber,
          title: rfaData.title,
          description: rfaData.description,
          siteId: rfaData.siteId,
          category: rfaData.category,
          rfaType: rfaData.rfaType,
          revisionNumber: rfaData.revisionNumber,
          taskData: rfaData.taskData,
          isBimDocument,
        },
      },
    });

  } catch (err: any) {
    console.error('[request-supersede] Error:', err);
    return NextResponse.json(
      { error: 'Internal Server Error', details: err.message },
      { status: 500 }
    );
  }
}
