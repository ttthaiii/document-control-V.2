// src/app/api/rfa/create_revision/route.ts
import { NextResponse } from "next/server";
import { adminDb, adminBucket, adminAuth } from "@/lib/firebase/admin";
import { FieldValue } from 'firebase-admin/firestore';
import { STATUSES, Role } from '@/lib/config/workflow';
// 👇 1. Import checkPermission
import { checkPermission } from '@/lib/auth/permission-check';

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
        const { originalDocId, uploadedFiles, verifiedTaskId } = await req.json();

        const userDoc = await adminDb.collection('users').doc(uid).get();
        if (!userDoc.exists) return NextResponse.json({ error: 'User not found' }, { status: 403 });
        const userData = userDoc.data()!;
        const userRole = userData.role as Role;

        // Check manual flow for legacy logic
        const isManualFlow = userRole === 'ME' || userRole === 'SN';

        if (!originalDocId || !uploadedFiles || uploadedFiles.length === 0 || (!isManualFlow && !verifiedTaskId)) {
            return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
        }
        
        // 👇 2. ดึงข้อมูลเอกสารเดิมมาเช็คสิทธิ์ก่อนเริ่ม Transaction
        const originalRfaRef = adminDb.collection("rfaDocuments").doc(originalDocId);
        const originalDocSnap = await originalRfaRef.get();
        
        if (!originalDocSnap.exists) {
             return NextResponse.json({ error: "Original document not found" }, { status: 404 });
        }
        const originalData = originalDocSnap.data()!;

        // ตรวจสอบความเป็นเจ้าของ (Optional: ปกติคนแก้ควรเป็นคนสร้าง)
        if (originalData.createdBy !== uid && userRole !== 'Admin') {
             return NextResponse.json({ error: "Only the document creator can submit a revision." }, { status: 403 });
        }

        // 👇 3. ตรวจสอบสิทธิ์แบบ Dynamic (ว่า Role นี้ยังสร้าง RFA ประเภทนี้ได้อยู่ไหม)
        let actionKey = '';
        switch (originalData.rfaType) {
            case 'RFA-SHOP': actionKey = 'create_shop'; break;
            case 'RFA-GEN': actionKey = 'create_gen'; break;
            case 'RFA-MAT': actionKey = 'create_mat'; break;
            default: actionKey = '';
        }

        if (actionKey) {
            const canRevise = await checkPermission(
                originalData.siteId,
                userRole,
                'RFA',
                actionKey,
                uid
            );

            if (!canRevise) {
                return NextResponse.json({
                    success: false,
                    error: `Permission denied. Role '${userRole}' cannot create/revise ${originalData.rfaType} in this site.`
                }, { status: 403 });
            }
        }
        // 👆 จบส่วนตรวจสอบสิทธิ์

        await adminDb.runTransaction(async (transaction) => {
            // ... (Logic ใน Transaction เหมือนเดิมทุกประการ ไม่ต้องแก้) ...
            const originalDoc = await transaction.get(originalRfaRef);
            if (!originalDoc.exists) throw new Error("Original document not found");
            
            const currentData = originalDoc.data()!; // ใช้ข้อมูลล่าสุดใน Transaction
            
            const newTaskData = verifiedTaskId ? {
                ...currentData.taskData,
                taskUid: verifiedTaskId,
            } : currentData.taskData;

            const newRevisionNumber = (currentData.revisionNumber || 0) + 1;
            const newDocumentNumber = currentData.documentNumber;

            const finalFilesData = [];
            const cdnUrlBase = "https://ttsdoc-cdn.ttthaiii30.workers.dev";
            for (const tempFile of uploadedFiles) {
                const sourcePath = tempFile.filePath;
                if (!sourcePath || !sourcePath.startsWith(`temp/${uid}/`)) continue;

                const destinationPath = `sites/${currentData.siteId}/rfa/${newDocumentNumber}/${Date.now()}_${tempFile.fileName}`;
                await adminBucket.file(sourcePath).move(destinationPath);

                finalFilesData.push({
                    ...tempFile,
                    fileUrl: `${cdnUrlBase}/${destinationPath}`,
                    filePath: destinationPath,
                    uploadedAt: new Date().toISOString(),
                    uploadedBy: uid,
                });
            }

            const newRfaRef = adminDb.collection("rfaDocuments").doc();
            const newStatus = STATUSES.PENDING_REVIEW;

            transaction.set(newRfaRef, {
                ...currentData,
                taskData: newTaskData,
                revisionNumber: newRevisionNumber,
                documentNumber: newDocumentNumber,
                status: newStatus,
                currentStep: newStatus,
                isLatest: true,
                parentRfaId: currentData.parentRfaId || originalDocId,
                revisionHistory: [...(currentData.revisionHistory || []), originalDocId],
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
                files: finalFilesData,
                workflow: [{
                    action: "CREATE_REVISION",
                    status: newStatus,
                    userId: uid,
                    userName: userData.email,
                    role: userData.role,
                    timestamp: new Date().toISOString(),
                    files: finalFilesData
                }],
            });

            transaction.update(originalRfaRef, {
                isLatest: false,
                updatedAt: FieldValue.serverTimestamp(),
            });
        });

        return NextResponse.json({ success: true, message: "New revision created successfully." }, { status: 201 });

    } catch (err: any) {
        console.error("Create Revision Error:", err);
        return NextResponse.json({ error: "Internal Server Error", details: err.message }, { status: 500 });
    }
}