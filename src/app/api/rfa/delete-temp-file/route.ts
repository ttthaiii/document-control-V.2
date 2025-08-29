// src/app/api/rfa/delete-temp-file/route.ts
import { NextResponse } from "next/server";
import { adminBucket } from "@/lib/firebase/admin";
import { getAuth } from "firebase-admin/auth";

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
    const { filePath } = await req.json();

    if (!filePath) {
      return NextResponse.json({ error: "Missing filePath" }, { status: 400 });
    }
    
    // ✅ ตรวจสอบเพื่อความปลอดภัยสูงสุด: User ต้องเป็นเจ้าของไฟล์เท่านั้นถึงจะลบได้
    if (!filePath.startsWith(`temp/${uid}/`)) {
        return NextResponse.json({ error: "Permission denied." }, { status: 403 });
    }

    const fileRef = adminBucket.file(filePath);
    await fileRef.delete();

    return NextResponse.json({ success: true, message: `File deleted: ${filePath}` });

  } catch (err: any) {
    console.error("Temp file delete Error:", err);
    if (err.code === 404) {
        return NextResponse.json({ success: true, message: "File already deleted." });
    }
    return NextResponse.json({ error: "Internal Server Error", details: err.message }, { status: 500 });
  }
}