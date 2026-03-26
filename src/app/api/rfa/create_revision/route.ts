// src/app/api/rfa/create_revision/route.ts (แก้ไขแล้วสำหรับ Workflow ใหม่)
import { NextResponse } from "next/server";
import { adminDb, adminBucket, adminAuth } from "@/lib/firebase/admin";
import { FieldValue } from 'firebase-admin/firestore';
import { STATUSES } from '@/lib/config/workflow';
import { getFileUrl } from '@/lib/utils/storage';

export const dynamic = 'force-dynamic';

async function verifyIdTokenFromHeader(req: Request): Promise<string | null> {
    const authHeader = req.headers.get("authorization") || "";
    const match = authHeader.match(/^Bearer (.+)$/i);
    if (!match) return null;
    try {
        const decoded = await adminAuth.verifyIdToken(match[1]);
        return decoded.uid;
    } catch {
        return null;
    }
}

export async function POST(req: Request) {
    const uid = await verifyIdTokenFromHeader(req);
    if (!uid) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        // รับ verifiedTaskId และ comments จาก request body
        const { originalDocId, uploadedFiles, verifiedTaskId, comments, suspendOldDoc } = await req.json();

        const userDoc = await adminDb.collection('users').doc(uid).get();
        const userData = userDoc.data();
        if (!userData) return NextResponse.json({ error: 'User not found' }, { status: 403 });

        const isBimUser = userData.role === 'BIM';

        if (!originalDocId || !uploadedFiles || uploadedFiles.length === 0) {
            return NextResponse.json({ error: "Missing required fields (originalDocId, uploadedFiles)" }, { status: 400 });
        }

        const originalRfaRef = adminDb.collection("rfaDocuments").doc(originalDocId);
        let newDocId: string = '';

        await adminDb.runTransaction(async (transaction) => {
            const originalDoc = await transaction.get(originalRfaRef);
            if (!originalDoc.exists) {
                throw new Error("Original document not found");
            }

            const originalData = originalDoc.data()!;

            // ตรวจสอบสถานะที่อนุญาต: รองรับทั้ง REJECTED (flow เดิม) และ APPROVED family (flow ใหม่)
            const allowedOriginStatuses = [
                STATUSES.REJECTED,
                STATUSES.APPROVED,
                STATUSES.APPROVED_WITH_COMMENTS,
                STATUSES.APPROVED_REVISION_REQUIRED,
            ];
            const isSuspended = originalData.supersededStatus === 'SUSPENDED';

            if (!allowedOriginStatuses.includes(originalData.status) && !isSuspended) {
                throw new Error(`ไม่สามารถสร้าง Revision จากเอกสารที่มีสถานะ "${originalData.status}" ได้`);
            }

            // สร้าง taskData ใหม่: ใช้ verifiedTaskId ที่ได้รับมา ถ้าไม่มีใช้ของเดิม
            const newTaskData = verifiedTaskId ? {
                ...originalData.taskData,
                taskUid: verifiedTaskId,
            } : originalData.taskData;

            const newRevisionNumber = (originalData.revisionNumber || 0) + 1;
            const newDocumentNumber = originalData.documentNumber;

            // Move temp files to permanent storage
            const finalFilesData = [];
            for (const tempFile of uploadedFiles) {
                const sourcePath = tempFile.filePath;
                if (!sourcePath || !sourcePath.startsWith(`temp/${uid}/`)) continue;

                const destinationPath = `sites/${originalData.siteId}/rfa/${newDocumentNumber}/${Date.now()}_${tempFile.fileName}`;
                await adminBucket.file(sourcePath).move(destinationPath);

                finalFilesData.push({
                    ...tempFile,
                    fileUrl: getFileUrl(destinationPath),
                    filePath: destinationPath,
                    uploadedAt: new Date().toISOString(),
                    uploadedBy: uid,
                });
            }

            const newRfaRef = adminDb.collection("rfaDocuments").doc();
            newDocId = newRfaRef.id;
            let newStatus = STATUSES.PENDING_REVIEW;
            let initialAction = "CREATE_REVISION";

            // ใช้ Role จาก userData เพื่อกำหนดว่าจะข้ามการตรวจสอบของ Site หรือไม่
            const isReviewer = ['ADMIN', 'CM', 'OE', 'PE', 'SA', 'SE', 'FM'].includes(userData.role);
            const isEngineer = userData.role === 'ME' || userData.role === 'SN';

            if (originalData.rfaType === 'RFA-SHOP' && isEngineer) {
                newStatus = STATUSES.PENDING_CM_APPROVAL;
                initialAction = "CREATE_REVISION_AND_SUBMIT_TO_CM";
            } else if (isReviewer && ['RFA-MAT', 'RFA-GEN', 'RFA-SHOP'].includes(originalData.rfaType)) {
                newStatus = STATUSES.PENDING_CM_APPROVAL;
                initialAction = "CREATE_REVISION_AND_SUBMIT";
            }

            // ตัด cadFiles ของเอกสารเก่าออก เพื่อให้ Rev. ใหม่สามารถแตกไฟล์ตั้งต้นใหม่ได้
            const { cadFiles: _oldCadFiles, ...copiedOriginalData } = originalData;

            // สร้างเอกสาร Rev. ใหม่
            transaction.set(newRfaRef, {
                ...copiedOriginalData,
                taskData: newTaskData,
                revisionNumber: newRevisionNumber,
                documentNumber: newDocumentNumber,
                status: newStatus,
                currentStep: newStatus,
                isLatest: true,
                parentRfaId: originalData.parentRfaId || originalDoc.id,
                revisionHistory: [...(originalData.revisionHistory || []), originalDoc.id],
                previousRevisionId: originalDoc.id, // link กลับไป Rev. เก่า
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
                files: finalFilesData,
                // Reset supersede fields สำหรับ Rev. ใหม่
                supersededStatus: null,
                supersededById: null,
                supersededByRevision: null,
                supersededAt: null,
                supersededComment: null,
                supersededFiles: null,
                supersededRequestedBy: null,
                supersededRequestedAt: null,
                // ✅ track whether the previous revision was already suspended before this revision was created
                previousRevisionSuspended: originalData.supersededStatus === 'SUSPENDED',
                workflow: [
                    ...((originalData.workflow || []).map((w: any) => ({
                        ...w,
                        revisionNumber: w.revisionNumber ?? (originalData.revisionNumber || 0)
                    }))),
                    {
                        action: initialAction,
                        status: newStatus,
                        userId: uid,
                        userName: userData.email,
                        role: userData.role,
                        timestamp: new Date().toISOString(),
                        comments: comments || '',
                        files: finalFilesData,
                        revisionNumber: newRevisionNumber,
                    }
                ],
            });

            // อัปเดตเอกสารเดิม: isLatest = false + link ไป Rev. ใหม่
            transaction.update(originalRfaRef, {
                isLatest: false,
                supersededById: newRfaRef.id,
                supersededByRevision: newRevisionNumber,
                supersededStatus: originalData.status === STATUSES.APPROVED_REVISION_REQUIRED ? 'ACTIVE' : (suspendOldDoc ? 'SUSPENDED' : 'ACTIVE'),
                updatedAt: FieldValue.serverTimestamp(),
            });
        });

        return NextResponse.json({ success: true, message: "New revision created successfully.", newDocId }, { status: 201 });

    } catch (err: any) {
        console.error("Create Revision Error:", err);
        return NextResponse.json({ error: "Internal Server Error", details: err.message }, { status: 500 });
    }
}