// src/app/api/rfa/create_revision/route.ts (แก้ไขแล้ว)
import { NextResponse } from "next/server";
import { adminDb, adminBucket } from "@/lib/firebase/admin";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, Transaction } from 'firebase-admin/firestore';
import { STATUSES } from '@/lib/config/workflow';

async function verifyIdTokenFromHeader(req: Request): Promise<string | null> {
    const authHeader = req.headers.get("authorization") || "";
    const match = authHeader.match(/^Bearer (.+)$/i);
    if (!match) return null;
    try {
        const decoded = await getAuth().verifyIdToken(match[1]);
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
        const { originalDocId, uploadedFiles } = await req.json();

        if (!originalDocId || !uploadedFiles || uploadedFiles.length === 0) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }
        
        const userDoc = await adminDb.collection('users').doc(uid).get();
        const userData = userDoc.data();
        if (!userData) return NextResponse.json({ error: 'User not found' }, { status: 403 });

        const originalRfaRef = adminDb.collection("rfaDocuments").doc(originalDocId);
        
        await adminDb.runTransaction(async (transaction) => {
            const originalDoc = await transaction.get(originalRfaRef);
            if (!originalDoc.exists) {
                throw new Error("Original document not found");
            }

            const originalData = originalDoc.data()!;
            
            // 1. คำนวณ Revision ใหม่
            const newRevisionNumber = (originalData.revisionNumber || 0) + 1;
             const newDocumentNumber = originalData.documentNumber;

            // 2. ย้ายไฟล์ใหม่จาก Temp ไปยัง Permanent Storage
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

            // 3. สร้างเอกสารฉบับใหม่ (New Revision)
            const newRfaRef = adminDb.collection("rfaDocuments").doc();
            const newStatus = STATUSES.PENDING_REVIEW;

            transaction.set(newRfaRef, {
                ...originalData,
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

            // 4. อัปเดตเอกสารฉบับเก่า
            // ✅ KEY CHANGE: ไม่เปลี่ยนสถานะ แต่กำหนดให้ isLatest เป็น false
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