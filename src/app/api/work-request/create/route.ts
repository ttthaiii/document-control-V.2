import { NextResponse, NextRequest } from "next/server";
import { adminDb, adminBucket, adminAuth } from "@/lib/firebase/admin";
import { FieldValue } from 'firebase-admin/firestore';
import { WR_STATUSES } from '@/lib/config/workflow'; // 👈 เอา WR_CREATOR_ROLES ออกแล้ว
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

export async function POST(req: NextRequest) {
    const uid = await verifyIdTokenFromHeader(req);
    if (!uid) {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    try {
        const userDoc = await adminDb.collection('users').doc(uid).get();
        if (!userDoc.exists) {
            return NextResponse.json({ success: false, error: 'User not found' }, { status: 403 });
        }
        const userData = userDoc.data()!;
        const { siteId, taskName, description, dueDate, files: uploadedFiles } = await req.json();

        if (!siteId || !taskName || !dueDate) {
            return NextResponse.json({ success: false, error: "Missing required fields (siteId, taskName, dueDate)." }, { status: 400 });
        }

        // ✅ ตรวจสอบสิทธิ์แบบ Dynamic (อ่านจาก DB)
        const canCreate = await checkPermission(
            siteId, 
            userData.role, 
            'WORK_REQUEST', 
            'create',
            uid // 👈 เพิ่มบรรทัดนี้
        );

        if (!canCreate) {
             return NextResponse.json({
                success: false,
                error: `Permission denied. Role '${userData.role}' cannot create Work Requests in this site.`
            }, { status: 403 });
        }
        
        // --- กำหนดสถานะเริ่มต้นเป็น DRAFT ---
        const initialStatus = WR_STATUSES.DRAFT;
        const assignedTo = null;

        const { documentNumber, runningNumber } = await adminDb.runTransaction(async (transaction) => {
            const siteRef = adminDb.collection('sites').doc(siteId);
            const siteDoc = await transaction.get(siteRef);
            if (!siteDoc.exists) throw new Error("Site not found");
            const siteShortName = siteDoc.data()?.shortName;
            if (!siteShortName) throw new Error(`'shortName' is not configured for site ID: ${siteId}`);

            const counterId = `${siteId}_WR`;
            const counterRef = adminDb.collection('counters').doc(counterId);
            const counterDoc = await transaction.get(counterRef);

            const nextNumber = (counterDoc.data()?.currentNumber || 0) + 1;

            transaction.set(counterRef, { currentNumber: nextNumber }, { merge: true });

            const paddedNumber = String(nextNumber).padStart(4, '0');
            const fullDocumentNumber = `WR-${siteShortName}-${paddedNumber}`;

            return { documentNumber: fullDocumentNumber, runningNumber: paddedNumber };
        });

        const finalFilesData: any[] = [];
        if (uploadedFiles && uploadedFiles.length > 0) {
            const cdnUrlBase = "https://ttsdoc-cdn.ttthaiii30.workers.dev";
            for (const tempFile of uploadedFiles) {
                const sourcePath = tempFile.filePath;
                if (!sourcePath || !sourcePath.startsWith(`temp/${uid}/`)) {
                    console.warn(`Skipping invalid file path during WR creation: ${sourcePath}`);
                    continue;
                }
                const destinationPath = `sites/${siteId}/work-requests/${documentNumber}/${Date.now()}_${tempFile.fileName}`;
                try {
                    await adminBucket.file(sourcePath).move(destinationPath);
                    finalFilesData.push({
                        ...tempFile,
                        fileUrl: `${cdnUrlBase}/${destinationPath}`,
                        filePath: destinationPath,
                        uploadedAt: new Date().toISOString(),
                        uploadedBy: uid,
                    });
                } catch (moveError) {
                    console.error(`Failed to move file ${sourcePath} to ${destinationPath}:`, moveError);
                }
            }
        }

        const newWorkRequestRef = adminDb.collection("workRequests").doc();

        await newWorkRequestRef.set({
            documentNumber,
            runningNumber,
            siteId,
            taskName,
            description: description || '',
            status: initialStatus,
            createdBy: uid,
            assignedTo,
            planStartDate: null,
            dueDate: new Date(dueDate),
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            revisionNumber: 0,
            isLatest: true,
            files: finalFilesData,
            taskData: null,
            workflow: [{
                action: "CREATE_DRAFT",
                status: initialStatus,
                userId: uid,
                userName: userData.email,
                role: userData.role,
                timestamp: new Date().toISOString(),
                files: finalFilesData,
                comments: description || 'สร้างเอกสารฉบับร่าง',
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