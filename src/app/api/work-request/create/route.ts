import { NextResponse, NextRequest } from "next/server";
import { adminDb, adminBucket, adminAuth } from "@/lib/firebase/admin";
import { FieldValue } from 'firebase-admin/firestore';
import { WorkRequestStatus } from '@/types/work-request';

export const dynamic = 'force-dynamic';

// Helper function to verify user token from request header
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

export async function POST(req: NextRequest) {
    const uid = await verifyIdTokenFromHeader(req);
    if (!uid) {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    try {
        // 1. Get User and Request Data
        const userDoc = await adminDb.collection('users').doc(uid).get();
        if (!userDoc.exists) {
            return NextResponse.json({ success: false, error: 'User not found' }, { status: 403 });
        }
        const userData = userDoc.data()!;
        const payload = await req.json();
        const { siteId, taskName, description, priority, files: uploadedFiles, taskData } = await req.json();

        if (!siteId || !taskName || !priority) { // เอา description ออกจากการตรวจสอบ
            return NextResponse.json({ success: false, error: "Missing required fields (siteId, taskName, priority)." }, { status: 400 });
        }

        // 3. Generate Running Number (WR-<SiteShortName>-XXXX)
        const runningNumber = await adminDb.runTransaction(async (transaction) => {
            const siteRef = adminDb.collection('sites').doc(siteId);
            const siteDoc = await transaction.get(siteRef);
            if (!siteDoc.exists) throw new Error("Site not found");
            const siteShortName = siteDoc.data()?.shortName;
            if (!siteShortName) throw new Error(`'shortName' is not configured for site ID: ${siteId}`);

            const counterId = `${siteId}_WR`; // Use a specific counter for Work Requests
            const counterRef = adminDb.collection('counters').doc(counterId);
            const counterDoc = await transaction.get(counterRef);
            
            const nextNumber = (counterDoc.data()?.currentNumber || 0) + 1;
            
            transaction.set(counterRef, { currentNumber: nextNumber }, { merge: true });
            return String(nextNumber).padStart(4, '0');
        });
        
        const documentNumber = `WR-${(await adminDb.collection('sites').doc(siteId).get()).data()?.shortName}-${runningNumber}`;

        // 4. Move Files from Temp to Permanent Storage
        const finalFilesData = [];
        if (uploadedFiles && uploadedFiles.length > 0) {
            const cdnUrlBase = "https://ttsdoc-cdn.ttthaiii30.workers.dev";
            for (const tempFile of uploadedFiles) {
                const sourcePath = tempFile.filePath;
                if (!sourcePath || !sourcePath.startsWith(`temp/${uid}/`)) continue;

                const destinationPath = `sites/${siteId}/work-requests/${documentNumber}/${Date.now()}_${tempFile.fileName}`;
                await adminBucket.file(sourcePath).move(destinationPath);
                
                // Also delete the original temp file
                await adminBucket.file(sourcePath).delete({ ignoreNotFound: true });

                finalFilesData.push({
                    ...tempFile,
                    fileUrl: `${cdnUrlBase}/${destinationPath}`,
                    filePath: destinationPath,
                    uploadedAt: new Date().toISOString(),
                    uploadedBy: uid,
                });
            }
        }
        
        // 5. Create the Work Request Document
        const newWorkRequestRef = adminDb.collection("workRequests").doc();
        const initialStatus = WorkRequestStatus.PENDING_BIM;

        await newWorkRequestRef.set({
            documentNumber,
            runningNumber,
            siteId,
            taskName,
            description: description || '',
            priority,
            status: initialStatus,
            createdBy: uid,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            revisionNumber: 0,
            isLatest: true,
            files: finalFilesData,
            taskData: taskData || null, // <-- บันทึก taskData ที่ได้รับมา
            workflow: [{
                action: "CREATE",
                status: initialStatus,
                userId: uid,
                userName: userData.email,
                role: userData.role,
                timestamp: new Date().toISOString(),
                files: finalFilesData,
                comments: description || '',
            }],
            usersInfo: { [uid]: { email: userData.email, role: userData.role } }
        });

        return NextResponse.json({ 
            success: true, 
            id: newWorkRequestRef.id, 
            documentNumber: documentNumber 
        }, { status: 201 });

    } catch (err: any) {
        console.error("Work Request Create Error:", err);
        return NextResponse.json({ success: false, error: "Internal Server Error", details: err.message }, { status: 500 });
    }
}