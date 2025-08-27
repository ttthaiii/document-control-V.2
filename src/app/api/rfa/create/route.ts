// app/api/rfa/create/route.ts
import { NextResponse } from "next/server";
import { adminDb, adminBucket } from "@/lib/firebase/admin"; // ปรับ path ให้ตรงโปรเจกต์
import { getAuth } from "firebase-admin/auth";

// -------------------- Utils --------------------
function toSlugId(input: string): string {
  // ทำเป็น ID ที่ปลอดภัยสำหรับ docId (UPPER_SNAKE_CASE)
  return input
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "_") // เว้นวรรค/เครื่องหมาย → _
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

async function ensureCategory(
  siteId: string,
  categoryIdOrName: string,
  defaults?: Partial<{
    name: string;
    description: string;
    createdBy: string;
    rfaType: string; // ใช้ประกอบเมตาดาต้า เช่น "RFA-SHOP"
  }>
): Promise<{ id: string; created: boolean }> {
  // แปลงชื่อ/คีย์จาก taskCategory เป็น docId ที่ปลอดภัย
  const docId = toSlugId(categoryIdOrName);
  const ref = adminDb.doc(`sites/${siteId}/categories/${docId}`);
  const snap = await ref.get();

  if (snap.exists) {
    return { id: docId, created: false };
  }

  // ถ้าไม่มี สร้างด้วยค่าเริ่มต้นบางอย่าง
  const now = new Date();
  await ref.set({
    name: defaults?.name ?? categoryIdOrName,
    description: defaults?.description ?? "",
    rfaType: defaults?.rfaType ?? null,
    createdAt: now.toISOString(),
    createdBy: defaults?.createdBy ?? null,
    // คุณจะใส่สิทธิ์/role matrix ต่อได้ตามที่ใช้จริง เช่น allowedRoles: [...]
  });

  return { id: docId, created: true };
}

// อ่าน request ได้ทั้ง FormData และ JSON (ยืดหยุ่น)
async function readRequest(req: Request): Promise<{
  isFormData: boolean;
  payload: any;
  files: File[];
}> {
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();

    const jsonOr = (v: FormDataEntryValue | null) => {
      if (typeof v === "string") {
        try { return JSON.parse(v); } catch { return v; }
      }
      return v;
    };

    const files: File[] = [];
    (form.getAll("files") || []).forEach((f) => {
      if (f instanceof File) files.push(f);
    });

    const payload = {
      rfaType: form.get("rfaType") as string | null,
      siteId: form.get("siteId") as string | null,
      categoryId: form.get("categoryId") as string | null, // อาจไม่มี
      title: form.get("title") as string | null,
      description: form.get("description") as string | null,
      taskData: jsonOr(form.get("taskData")) as any, // อาจเป็น object หรือ string
    };

    return { isFormData: true, payload, files };
  } else {
    const body = await req.json().catch(() => ({}));
    return { isFormData: false, payload: body, files: body.files ?? [] };
  }
}

async function verifyIdTokenFromHeader(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("authorization") || "";
  const m = authHeader.match(/^Bearer (.+)$/i);
  if (!m) return null;
  try {
    const decoded = await getAuth().verifyIdToken(m[1]);
    return decoded.uid;
  } catch {
    return null;
  }
}

// -------------------- Handler --------------------
export async function POST(req: Request) {
  try {
    const uid = await verifyIdTokenFromHeader(req); // แนะนำให้ใช้ header เสมอ
    const { isFormData, payload, files } = await readRequest(req);

    const {
      rfaType,        // "RFA-SHOP" | "RFA-GEN" | "RFA-MAT"
      siteId,         // "O4GN2NuHj72uq2Z8WKp4"
      categoryId,     // อาจว่าง ถ้าอยากให้ derive จาก taskData
      title,
      description,
      taskData,       // { taskCategory?: "...", ... }
    } = payload || {};

    // ---------- Validate ขั้นต้น ----------
    const missing: string[] = [];
    if (!rfaType) missing.push("rfaType");
    if (!siteId) missing.push("siteId");
    if (!title) missing.push("title");
    if (!description) missing.push("description");
    if (!uid) missing.push("authToken/uid");
    // ถ้าบังคับต้องมีไฟล์:
    if (!files || files.length === 0) missing.push("files");

    if (missing.length) {
      return NextResponse.json({ error: "Missing required fields", missing }, { status: 400 });
    }

    // ---------- ตัดสินใจ category ----------
    // 1) ใช้ค่าที่ client ส่งมาก่อน (ถ้ามี)
    // 2) ถ้าไม่มี ให้ลองหยิบจาก taskData.taskCategory
    // 3) ถ้ายังไม่มี สุดท้าย fallback เป็น rfaType (เช่น "RFA-SHOP") เพื่อไม่ให้ตกหล่น
    const rawCategoryKey: string =
      categoryId ||
      (taskData?.taskCategory as string | undefined) ||
      rfaType;

    // ✅ ขั้นตอนสำคัญ: upsert category อัตโนมัติ
    const { id: finalCategoryId, created: categoryCreated } = await ensureCategory(siteId, rawCategoryKey, {
      name: rawCategoryKey,
      description: taskData?.taskName || "",
      createdBy: uid ?? undefined,
      rfaType, // เก็บไว้เป็นเมตาดาต้า
    });

    // ---------- (ตัวอย่าง) อัปโหลดไฟล์ไป Firebase Storage ----------
    // เก็บไฟล์ใต้ path: rfa/<siteId>/<docId>/<filename>
    // ระดับนี้ยังไม่รู้ docId (ต้องสร้างเอกสารก่อน) — คุณอาจ:
    //   A) อัปโหลดด้วย tempId แล้วค่อย patch path หลังสร้าง doc
    //   B) หรือสร้าง doc ก่อนเอา docId มาใช้ path
    // ด้านล่างนี้ตัวอย่างแบบสร้าง doc ก่อน (แนะนำ)

    // ---------- สร้างเอกสาร RFA ก่อน ----------
    const countersRef = adminDb.doc(`counters/${siteId}_RFA-${rfaType.split("RFA-")[1]}`);
    // ดึง running number (อย่างง่าย)
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(countersRef);
      const num = (snap.exists ? (snap.data()?.value ?? 0) : 0) + 1;
      tx.set(countersRef, { value: num, prefix: rfaType === "RFA-SHOP" ? "RFS" : rfaType === "RFA-GEN" ? "RFG" : "RFM" }, { merge: true });
    });

    const counterSnap = await countersRef.get();
    const currentNum: number = counterSnap.data()?.value ?? 1;
    const prefix: string = counterSnap.data()?.prefix ?? "RFA";

    const docNumber = `${prefix}-${String(currentNum).padStart(3, "0")}`;
    const rfaRef = adminDb.collection("rfaDocuments").doc();
    const docId = rfaRef.id;

    await rfaRef.set({
      siteId,
      rfaType,
      categoryId: finalCategoryId,
      title,
      description,
      taskData: taskData ?? null,
      number: docNumber,
      status: "DRAFT",
      createdBy: uid,
      createdAt: new Date().toISOString(),
    });

    // ---------- อัปโหลดไฟล์ (ตัวอย่างแบบง่าย) ----------
    const uploaded: Array<{ name: string; path: string; size: number; contentType: string }> = [];

    for (const f of files as File[]) {
      const arrayBuf = await f.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      const name = f.name || "file";
      const contentType = f.type || "application/octet-stream";
      const path = `rfa/${siteId}/${docId}/${name}`;
      const file = adminBucket.file(path);

      await file.save(buffer, { contentType, resumable: false, public: false });
      // ถ้าอยาก set metadata/cache headers เพิ่ม เรียกผ่าน storage-metadata.ts ของคุณได้
      uploaded.push({ name, path, size: buffer.length, contentType });
    }

    // ---------- อัปเดตเอกสาร RFA ให้มีรายการไฟล์ ----------
    await rfaRef.update({
      files: uploaded,
      categoryAutoCreated: categoryCreated, // บอก client ว่าสร้าง category ให้ใหม่ด้วยไหม
    });

    return NextResponse.json(
      { ok: true, id: docId, number: docNumber, categoryId: finalCategoryId, categoryAutoCreated: categoryCreated },
      { status: 201 }
    );
  } catch (err) {
    console.error("RFA Create Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
