// src/app/api/work-request/create_revision/route.ts
import { NextResponse, NextRequest } from "next/server";
import { getAdminDb, getBimTrackingDb, getAdminAuth, getAdminBucket } from "@/lib/firebase/admin"; // ✅ เพิ่ม getAdminBucket
import { FieldValue } from 'firebase-admin/firestore';
import { WR_STATUSES } from '@/lib/config/workflow';
import { getFileUrl } from '@/lib/utils/storage';

export const dynamic = 'force-dynamic';

async function verifyIdTokenFromHeader(req: NextRequest): Promise<string | null> {
    const authHeader = req.headers.get("authorization") || "";
    const match = authHeader.match(/^Bearer (.+)$/i);
    if (!match) return null;
    try {
        const adminAuth = getAdminAuth();
        const decoded = await adminAuth.verifyIdToken(match[1]);
        return decoded.uid;
    } catch {
        return null;
    }
}

export async function POST(req: NextRequest) {
    const uid = await verifyIdTokenFromHeader(req);
    if (!uid) {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { originalDocId, uploadedFiles, verifiedTaskId, comments } = await req.json();

        const adminDb = getAdminDb();
        const bimTrackingDb = getBimTrackingDb();
        const adminBucket = getAdminBucket(); // ✅ เรียกใช้ Bucket

        const userDoc = await adminDb.collection('users').doc(uid).get();
        if (!userDoc.exists) {
            return NextResponse.json({ success: false, error: 'User not found' }, { status: 403 });
        }
        const userData = userDoc.data()!;

        if (!originalDocId || !uploadedFiles || uploadedFiles.length === 0 || !verifiedTaskId) {
            return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
        }

        const originalWrRef = adminDb.collection("workRequests").doc(originalDocId);

        const newRevisionDoc = await adminDb.runTransaction(async (transaction) => {
            const originalDoc = await transaction.get(originalWrRef);
            if (!originalDoc.exists) throw new Error("Original document not found");

            const originalData = originalDoc.data()!;

            // ดึงข้อมูล Site
            const siteDoc = await adminDb.collection('sites').doc(originalData.siteId).get();
            if (!siteDoc.exists) throw new Error(`Site not found.`);
            const siteData = siteDoc.data()!;

            // ตรวจสอบ Task
            const taskDoc = await bimTrackingDb.collection('tasks').doc(verifiedTaskId).get();
            if (!taskDoc.exists) throw new Error(`Verified Task ID not found.`);

            const newTaskData = {
                ...originalData.taskData,
                taskUid: verifiedTaskId,
                taskName: taskDoc.data()?.taskName || originalData.taskName,
                projectName: siteData.name,
            };

            const newRevisionNumber = (originalData.revisionNumber || 0) + 1;
            const docNumPrefix = originalData.documentNumber.split('-REV')[0];
            const newDocumentNumber = `${docNumPrefix}-REV${String(newRevisionNumber).padStart(2, '0')}`;

            // 🔥🔥🔥 [เริ่มส่วนแก้ไข] ย้ายไฟล์จาก Temp -> Permanent 🔥🔥🔥
            const finalFilesData = [];

            for (const file of uploadedFiles) {
                if (file.filePath && file.filePath.startsWith('temp/')) {
                    const destinationPath = `sites/${originalData.siteId}/work-requests/${newDocumentNumber}/${Date.now()}_${file.fileName}`;
                    try {
                        // ⚠️ หมายเหตุ: การ move ไฟล์ใน Transaction อาจจะทำไม่ได้โดยตรง หรือไม่แนะนำ 
                        // แต่ในเคสนี้เราทำนอก transaction block ยากเพราะต้องรอเลข DocumentNumber
                        // ดังนั้นเราจะ move จริงๆ ตรงนี้ (ถ้า transaction fail ไฟล์อาจจะถูกย้ายไปแล้ว แต่ก็ยังดีกว่าไฟล์หาย)
                        await adminBucket.file(file.filePath).move(destinationPath);

                        finalFilesData.push({
                            ...file,
                            fileUrl: getFileUrl(destinationPath),
                            filePath: destinationPath,
                            uploadedAt: new Date().toISOString(),
                            uploadedBy: uid,
                        });
                    } catch (e) {
                        console.error("File move failed", e);
                        // ถ้าพลาดจริงๆ อาจจะต้องเก็บ path เดิม หรือ throw error
                        throw new Error("Failed to process file upload.");
                    }
                } else {
                    finalFilesData.push(file);
                }
            }
            // 🔥🔥🔥 [สิ้นสุดส่วนแก้ไข] 🔥🔥🔥

            const newWrRef = adminDb.collection("workRequests").doc();
            const newStatus = WR_STATUSES.PENDING_ACCEPTANCE;

            const newDocData = {
                ...originalData,
                documentNumber: newDocumentNumber,
                taskData: newTaskData,
                revisionNumber: newRevisionNumber,
                status: newStatus,
                isLatest: true,
                parentWorkRequestId: originalData.parentWorkRequestId || originalDoc.id,
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
                files: finalFilesData, // ✅ ใช้ไฟล์ที่ย้ายแล้ว
                workflow: [
                    ...originalData.workflow,
                    {
                        action: "CREATE_REVISION",
                        status: newStatus,
                        userId: uid,
                        userName: userData.email,
                        role: userData.role,
                        timestamp: new Date().toISOString(),
                        comments: comments || `สร้างและส่ง Revision ${newRevisionNumber}`,
                        files: finalFilesData // ✅ ใช้ไฟล์ที่ย้ายแล้ว
                    }
                ],
            };

            transaction.set(newWrRef, newDocData);
            transaction.update(originalWrRef, { isLatest: false, status: WR_STATUSES.COMPLETED });

            return { id: newWrRef.id, documentNumber: newDocumentNumber };
        });

        return NextResponse.json({
            success: true,
            message: "New revision created",
            newDocumentId: newRevisionDoc.id,
            newDocumentNumber: newRevisionDoc.documentNumber
        }, { status: 201 });

    } catch (err: any) {
        console.error("Revision Error:", err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}