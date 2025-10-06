// src/app/api/rfa/create_revision/route.ts (แก้ไขสมบูรณ์)
import { NextResponse } from "next/server";
import { adminDb, adminBucket, adminAuth } from "@/lib/firebase/admin";
import { FieldValue } from 'firebase-admin/firestore';
import { STATUSES } from '@/lib/config/workflow';

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
        // --- 🔽 [แก้ไขจุดที่ 1] 🔽 ---
        // รับ verifiedTaskId เพิ่มจาก request body
        const { originalDocId, uploadedFiles, verifiedTaskId } = await req.json();

        // ตรวจสอบ `verifiedTaskId` เพิ่มเติม (สำหรับ Role ที่ไม่ใช่ Manual Flow)
        const userDoc = await adminDb.collection('users').doc(uid).get();
        const userData = userDoc.data();
        if (!userData) return NextResponse.json({ error: 'User not found' }, { status: 403 });

        const isManualFlow = userData.role === 'ME' || userData.role === 'SN';

        if (!originalDocId || !uploadedFiles || uploadedFiles.length === 0 || (!isManualFlow && !verifiedTaskId)) {
            return NextResponse.json({ error: "Missing required fields (originalDocId, uploadedFiles, and verifiedTaskId for non-manual flow)" }, { status: 400 });
        }
        
        const originalRfaRef = adminDb.collection("rfaDocuments").doc(originalDocId);
        
        await adminDb.runTransaction(async (transaction) => {
            const originalDoc = await transaction.get(originalRfaRef);
            if (!originalDoc.exists) {
                throw new Error("Original document not found");
            }

            const originalData = originalDoc.data()!;
            
            // --- 🔽 [แก้ไขจุดที่ 2] 🔽 ---
            // สร้าง object taskData ใหม่ โดยใช้ verifiedTaskId ที่ได้รับมา
            // ถ้าเป็น Manual Flow จะไม่มี verifiedTaskId ก็ให้ใช้ของเดิมไป
            const newTaskData = verifiedTaskId ? {
                ...originalData.taskData,
                taskUid: verifiedTaskId,
            } : originalData.taskData;
            // --- 👆 [สิ้นสุดการแก้ไข] 👆 ---


            const newRevisionNumber = (originalData.revisionNumber || 0) + 1;
            const newDocumentNumber = originalData.documentNumber;

            const finalFilesData = [];
            const cdnUrlBase = "https://ttsdoc-cdn.ttthaiii30.workers.dev";
            for (const tempFile of uploadedFiles) {
                const sourcePath = tempFile.filePath;
                if (!sourcePath || !sourcePath.startsWith(`temp/${uid}/`)) continue;

                const destinationPath = `sites/${originalData.siteId}/rfa/${newDocumentNumber}/${Date.now()}_${tempFile.fileName}`;
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
                ...originalData,
                taskData: newTaskData, // <-- ใช้ taskData ที่อัปเดตแล้ว
                revisionNumber: newRevisionNumber,
                documentNumber: newDocumentNumber,
                status: newStatus,
                currentStep: newStatus,
                isLatest: true,
                parentRfaId: originalData.parentRfaId || originalDoc.id,
                revisionHistory: [...(originalData.revisionHistory || []), originalDoc.id],
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