// src/app/api/rfa/create/route.ts
import { NextResponse } from "next/server";
import { adminDb, adminBucket } from "@/lib/firebase/admin";
import { getAuth } from "firebase-admin/auth";
import { FieldValue } from 'firebase-admin/firestore';

// (Helper functions toSlugId, ensureCategory, verifyIdTokenFromHeader, readRequest ไม่มีการเปลี่ยนแปลง)
function toSlugId(input: string): string {
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
        description: defaults?.description ?? "",
        rfaTypes: defaults?.rfaType ? [defaults.rfaType] : [],
        active: true,
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
        const decoded = await getAuth().verifyIdToken(match[1]);
        return decoded.uid;
    } catch {
        return null;
    }
}

async function readRequest(req: Request): Promise<{ payload: any }> {
    const body = await req.json().catch(() => ({}));
    return { payload: body };
}


export async function POST(req: Request) {
  const uid = await verifyIdTokenFromHeader(req);
  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let docId: string | null = null;
  const tempFilePathsToDelete: string[] = []; // <--- เพิ่มบรรทัดนี้ที่ขาดไป

  try {
    const userDoc = await adminDb.collection('users').doc(uid).get();
    if (!userDoc.exists) {
        return NextResponse.json({ error: 'User not found' }, { status: 403 });
    }
    const userData = userDoc.data();

    const { payload } = await readRequest(req);
    const { rfaType, siteId, categoryId, title, description, taskData, documentNumber, uploadedFiles } = payload || {};

    // --- Validation ---
    const missing: string[] = [];
    if (!rfaType) missing.push("rfaType");
    if (!siteId) missing.push("siteId");
    if (!title) missing.push("title");
    if (!documentNumber) missing.push("documentNumber");
    if (!uploadedFiles || !Array.isArray(uploadedFiles) || uploadedFiles.length === 0) {
        missing.push("uploadedFiles");
    }
    if (missing.length > 0) {
        return NextResponse.json({ error: "Missing required fields", missing }, { status: 400 });
    }
    
    // --- Category Handling ---
    const rawCategoryKey = categoryId || taskData?.taskCategory || rfaType;
    const { id: finalCategoryId } = await ensureCategory(siteId, rawCategoryKey, {
      name: taskData?.taskCategory || rfaType,
      createdBy: uid,
      rfaType,
    });
    
    // --- File Handling Logic ---
    const finalFilesData = [];
    const cdnUrlBase = "https://ttsdoc-cdn.ttthaiii30.workers.dev";

    for (const tempFile of uploadedFiles) {
        const sourcePath = tempFile.filePath;
        if (!sourcePath || !sourcePath.startsWith(`temp/${uid}/`)) {
            console.warn(`Skipping invalid or unauthorized file path: ${sourcePath}`);
            continue;
        }
        
        tempFilePathsToDelete.push(sourcePath);

        const originalName = tempFile.fileName;
        const timestamp = Date.now();
        const destinationPath = `sites/${siteId}/rfa/${documentNumber}/${timestamp}_${originalName}`;

        await adminBucket.file(sourcePath).move(destinationPath);

        finalFilesData.push({
            ...tempFile,
            fileUrl: `${cdnUrlBase}/${destinationPath}`,
            filePath: destinationPath,
            uploadedAt: new Date().toISOString(),
            uploadedBy: uid,
        });
    }
    
    let initialStatus = "DRAFT";
    let initialWorkflowAction = "CREATE_DRAFT";

    switch (rfaType) {
      case 'RFA-SHOP':
        initialStatus = "PENDING_SITE_ADMIN";
        initialWorkflowAction = "SUBMIT";
        break;
      case 'RFA-GEN':
      case 'RFA-MAT':
        initialStatus = "PENDING_CM";
        initialWorkflowAction = "SUBMIT";
        break;
    }

    // --- Create RFA document ---
    const rfaRef = adminDb.collection("rfaDocuments").doc();
    docId = rfaRef.id;

    await rfaRef.set({
      siteId, 
      rfaType, 
      categoryId: finalCategoryId, 
      title, 
      description: description || "",
      taskData: taskData || null, 
      documentNumber, 
      status: initialStatus,
      createdBy: uid,
      createdAt: FieldValue.serverTimestamp(), 
      updatedAt: FieldValue.serverTimestamp(),
      workflow: [{
          action: initialWorkflowAction,
          status: initialStatus,
          userId: uid,
          userName: userData?.email, 
          role: userData?.role,
          timestamp: new Date().toISOString(),
      }],
      files: finalFilesData,
    });

    return NextResponse.json({ success: true, id: docId, documentNumber }, { status: 201 });

  } catch (err: any) {
    console.error("RFA Create Finalization Error:", err);
    
    if (docId) {
        await adminDb.collection("rfaDocuments").doc(docId).delete().catch(e => console.error("Cleanup failed for doc:", e));
    }
    
    return NextResponse.json({ error: "Internal Server Error", details: err.message }, { status: 500 });
  }
}