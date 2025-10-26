// src/app/api/work-request/create_revision/route.ts (Corrected)
import { NextResponse, NextRequest } from "next/server";
import { getAdminDb, getBimTrackingDb, getAdminAuth } from "@/lib/firebase/admin";
import { FieldValue } from 'firebase-admin/firestore';
import { WorkRequestStatus } from "@/types/work-request";
import * as admin from "firebase-admin";

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

        // --- Get Firebase Service Instances ---
        const adminDb = getAdminDb();
        const bimTrackingDb = getBimTrackingDb();
        const adminAuth = getAdminAuth();
        // Note: adminBucket is not used in the new logic, but if needed, you would get it via a getter.

        const userDoc = await adminDb.collection('users').doc(uid).get();
        if (!userDoc.exists) {
            return NextResponse.json({ success: false, error: 'User not found' }, { status: 403 });
        }
        const userData = userDoc.data()!;

        if (!originalDocId || !uploadedFiles || uploadedFiles.length === 0 || !verifiedTaskId) {
            return NextResponse.json({ success: false, error: "Missing required fields for revision" }, { status: 400 });
        }
        
        const originalWrRef = adminDb.collection("workRequests").doc(originalDocId);
        
        const newRevisionDoc = await adminDb.runTransaction(async (transaction) => {
            const originalDoc = await transaction.get(originalWrRef);
            if (!originalDoc.exists) {
                throw new Error("Original document not found");
            }

            const originalData = originalDoc.data()!;
            
            // ดึงข้อมูล Site
            const siteDoc = await adminDb.collection('sites').doc(originalData.siteId).get();
            if (!siteDoc.exists) {
                throw new Error(`Site with ID ${originalData.siteId} not found.`);
            }
            const siteData = siteDoc.data()!;
            
            // ตรวจสอบ Task ใน BIM Tracking
            const taskDoc = await bimTrackingDb.collection('tasks').doc(verifiedTaskId).get();
            if (!taskDoc.exists) {
                throw new Error(`Verified Task ID ${verifiedTaskId} not found in BIM Tracking.`);
            }

            const taskDetails = taskDoc.data();
            
            // 👇 แก้ตรงนี้ - ใช้วิธีเดียวกับ RFA
            const newTaskData = {
                ...originalData.taskData, // copy ข้อมูลเดิมมาก่อน
                taskUid: verifiedTaskId,  // อัปเดตเฉพาะ taskUid เป็น Task ใหม่
                taskName: taskDetails?.taskName || originalData.taskName, // อัปเดต taskName ถ้ามี
                projectName: siteData.name, // อัปเดต projectName
            };
            // 👆

            const newRevisionNumber = (originalData.revisionNumber || 0) + 1;
            const docNumPrefix = originalData.documentNumber.split('-REV')[0];
            const newDocumentNumber = `${docNumPrefix}-REV${String(newRevisionNumber).padStart(2, '0')}`;

            const finalFilesData = uploadedFiles.map((file: any) => ({
                ...file,
                uploadedAt: new Date().toISOString(),
                uploadedBy: uid,
            }));

            const newWrRef = adminDb.collection("workRequests").doc();
            const newStatus = WorkRequestStatus.PENDING_ACCEPTANCE;

            const newDocData = {
                ...originalData,
                documentNumber: newDocumentNumber,
                taskData: newTaskData, // ใช้ taskData ที่อัปเดต taskUid แล้ว
                revisionNumber: newRevisionNumber,
                status: newStatus,
                isLatest: true,
                parentWorkRequestId: originalData.parentWorkRequestId || originalDoc.id,
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
                files: finalFilesData,
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
                        files: finalFilesData
                    }
                ],
            };
            
            transaction.set(newWrRef, newDocData);
            transaction.update(originalWrRef, { isLatest: false, status: WorkRequestStatus.COMPLETED });
            
            return { id: newWrRef.id, documentNumber: newDocumentNumber };
        });

        return NextResponse.json({ 
            success: true, 
            message: "New revision created and submitted successfully.",
            newDocumentId: newRevisionDoc.id,
            newDocumentNumber: newRevisionDoc.documentNumber
        }, { status: 201 });

    } catch (err: any) {
        console.error("Create Work Request Revision Error:", err);
        return NextResponse.json({ success: false, error: "Internal Server Error", details: err.message }, { status: 500 });
    }
}