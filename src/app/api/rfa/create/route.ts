// src/app/api/rfa/create/route.ts
import { NextResponse } from "next/server";
// 🔽 1. Import adminAuth เข้ามาด้วย 🔽
import { adminDb, adminBucket, adminAuth } from "@/lib/firebase/admin";
// 🗑️ 2. ลบ getAuth ที่ไม่ได้ใช้แล้วออกไป 🗑️
// import { getAuth } from "firebase-admin/auth";
import { FieldValue } from 'firebase-admin/firestore';
import { ROLES, REVIEWER_ROLES, STATUSES, Role } from '@/lib/config/workflow';
import { getFileUrl } from '@/lib/utils/storage';

export const dynamic = 'force-dynamic';

// ... (ฟังก์ชัน toSlugId, ensureCategory ไม่ต้องแก้ไข) ...
function toSlugId(input: string): string {
  if (!input) return '';
  return input.trim().replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "").toUpperCase();
}

async function ensureCategory(siteId: string, categoryIdOrName: string, defaults?: Partial<{ name: string; description: string; createdBy: string; rfaType: string; }>): Promise<{ id: string; created: boolean }> {
  const docId = toSlugId(categoryIdOrName);
  const ref = adminDb.doc(`sites/${siteId}/categories/${docId}`);
  const snap = await ref.get();
  if (snap.exists) {
    return { id: docId, created: false };
  }
  await ref.set({
    name: defaults?.name ?? categoryIdOrName,
    categoryCode: categoryIdOrName,
    categoryName: defaults?.name ?? categoryIdOrName,
    description: defaults?.description ?? "",
    rfaTypes: defaults?.rfaType ? [defaults.rfaType] : [],
    active: true,
    // 👇 [สำคัญมาก] ต้องเพิ่มบรรทัดนี้ครับ ไม่งั้น Filter จะมองไม่เห็น
    siteId: siteId,
    // -----------------------------------------------------
    createdAt: FieldValue.serverTimestamp(),
    createdBy: defaults?.createdBy ?? "SYSTEM",
  });
  return { id: docId, created: true };
}


async function verifyIdTokenFromHeader(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer (.+)$/i);
  if (!match) return null;
  try {
    // 🔽 3. เปลี่ยนไปใช้ adminAuth ที่เรา import เข้ามา 🔽
    const decoded = await adminAuth.verifyIdToken(match[1]);
    return decoded.uid;
  } catch {
    return null;
  }
}

async function readRequest(req: Request): Promise<any> {
  return req.json().catch(() => ({}));
}


export async function POST(req: Request) {
  const uid = await verifyIdTokenFromHeader(req);
  if (!uid) {
    // แก้ไข: ส่ง Response ที่มี success: false กลับไปเพื่อให้ Frontend จับ Error ได้ง่ายขึ้น
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  let docId: string | null = null;
  const tempFilePathsToDelete: string[] = [];

  try {
    const userDoc = await adminDb.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 403 });
    }
    const userData = userDoc.data();
    const userRole = userData?.role;

    const body = await readRequest(req);
    const { payload } = body;
    const { rfaType, siteId, categoryId, title, description, taskData, revisionNumber, uploadedFiles } = payload || {};
    let { documentNumber } = payload || {};

    if (documentNumber) {
      // แทนที่ Space (\s) และ Tab (\t) ที่กดมาผิดกลายเป็นช่องว่าง ให้เป็นขีด (-) เพื่อให้เป็นมาตรฐาน
      documentNumber = documentNumber.trim().replace(/\s+/g, '-');
    }

    if (!rfaType || !siteId || !title || !uploadedFiles || uploadedFiles.length === 0 || !categoryId) {
      return NextResponse.json({ error: "Missing required fields. Required: rfaType, siteId, categoryId, title, uploadedFiles." }, { status: 400 });
    }

    if (documentNumber) {
      const existingDocQuery = adminDb.collection('rfaDocuments')
        .where('siteId', '==', siteId)
        .where('documentNumber', '==', documentNumber.trim());

      const existingDocSnapshot = await existingDocQuery.get();

      if (!existingDocSnapshot.empty) {
        return NextResponse.json(
          { success: false, error: `เลขที่เอกสาร "${documentNumber.trim()}" นี้ถูกใช้ไปแล้วในโครงการนี้` },
          { status: 409 } // 409 Conflict เป็น HTTP Status ที่เหมาะสม
        );
      }
    }

    const runningNumber = await adminDb.runTransaction(async (transaction) => {
      const siteRef = adminDb.collection('sites').doc(siteId);
      const siteDoc = await transaction.get(siteRef);
      if (!siteDoc.exists) throw new Error(`Site not found: ${siteId}`);
      let siteShortName = siteDoc.data()?.shortName;

      // Fallback for emulator testing if shortName is missing
      if (!siteShortName) {
        if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true') {
          siteShortName = `TS-${siteId.substring(0, 3)}`.toUpperCase();
          console.warn(`[Emulator] Using fallback shortName: ${siteShortName} for site: ${siteId}`);
        } else {
          throw new Error(`'shortName' is not configured for site ID: ${siteId}`);
        }
      }

      const counterId = `${siteId}_${rfaType}`;
      const counterRef = adminDb.collection('counters').doc(counterId);
      const counterDoc = await transaction.get(counterRef);

      let nextNumber = 1;
      if (counterDoc.exists) {
        nextNumber = (counterDoc.data()?.currentNumber || 0) + 1;
      }

      transaction.set(counterRef, { currentNumber: nextNumber }, { merge: true });
      const formattedNumber = String(nextNumber).padStart(4, '0');
      return `${rfaType}-${siteShortName}-${formattedNumber}`;
    });

    const rawCategoryKey = categoryId || taskData?.taskCategory || rfaType;
    const { id: finalCategoryId } = await ensureCategory(siteId, categoryId, {
      name: categoryId,
      createdBy: uid,
      rfaType,
    });

    const docNumForPath = documentNumber || runningNumber;

    const finalFilesData = [];

    for (const tempFile of uploadedFiles) {
      const sourcePath = tempFile.filePath;
      if (!sourcePath || !sourcePath.startsWith(`temp/${uid}/`)) {
        console.warn(`Skipping invalid or unauthorized file path: ${sourcePath}`);
        continue;
      }

      tempFilePathsToDelete.push(sourcePath);

      const originalName = tempFile.fileName;
      const timestamp = Date.now();
      const destinationPath = `sites/${siteId}/rfa/${docNumForPath}/${timestamp}_${originalName}`;

      await adminBucket.file(sourcePath).move(destinationPath);

      finalFilesData.push({
        ...tempFile,
        fileUrl: getFileUrl(destinationPath),
        filePath: destinationPath,
        uploadedAt: new Date().toISOString(),
        uploadedBy: uid,
      });
    }

    let initialStatus = STATUSES.PENDING_REVIEW;
    let initialAction = "CREATE";

    // ใช้ (userRole as Role) เพื่อยืนยัน Type ให้ TypeScript
    const isReviewer = REVIEWER_ROLES.includes(userRole as Role);
    const isEngineer = userRole === ROLES.ME || userRole === ROLES.SN;

    // Case 1: Engineer สร้าง RFA-SHOP, จะถูกส่งไป CM เลย
    if (rfaType === 'RFA-SHOP' && isEngineer) {
      initialStatus = STATUSES.PENDING_CM_APPROVAL;
      initialAction = "CREATE_AND_SUBMIT_TO_CM";
    }
    // Case 2: Reviewer (Site Admin, OE, etc.) สร้างเอกสาร, จะถูกส่งไป CM เลย
    else if (isReviewer && ['RFA-MAT', 'RFA-GEN', 'RFA-SHOP'].includes(rfaType)) {
      initialStatus = STATUSES.PENDING_CM_APPROVAL;
      initialAction = "CREATE_AND_SUBMIT";
    }

    const rfaRef = adminDb.collection("rfaDocuments").doc();
    docId = rfaRef.id;

    await rfaRef.set({
      siteId, rfaType, categoryId: finalCategoryId, title, description: description || "",
      taskData: taskData || null, documentNumber: documentNumber || "", status: initialStatus,
      currentStep: initialStatus, createdBy: uid,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      workflow: [{
        action: initialAction, status: initialStatus, userId: uid,
        userName: userData?.email, role: userRole,
        timestamp: new Date().toISOString(),
        files: finalFilesData
      }],
      files: finalFilesData,
      runningNumber: runningNumber,
      revisionNumber: parseInt(revisionNumber, 10) || 0,
      isLatest: true,
    });

    return NextResponse.json({ success: true, id: rfaRef.id, runningNumber: runningNumber }, { status: 201 });

  } catch (err: any) {
    console.error("RFA Create Finalization Error:", err);
    if (docId) {
      await adminDb.collection("rfaDocuments").doc(docId).delete().catch(e => console.error("Cleanup failed for doc:", e));
    }
    return NextResponse.json({ error: "Internal Server Error", details: err.message }, { status: 500 });
  }
}