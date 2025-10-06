// src/app/api/rfa/delete-temp-file/route.ts (แก้ไขแล้ว)
import { NextResponse } from "next/server";
import { adminBucket, adminAuth } from "@/lib/firebase/admin"; // 🔽 1. Import adminAuth เข้ามา

// 🗑️ 2. ลบ getAuth ที่ไม่ได้ใช้แล้วออกไป
// import { getAuth } from "firebase-admin/auth";

export const dynamic = 'force-dynamic';

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
    
    if (!filePath.startsWith(`temp/${uid}/`)) {
        return NextResponse.json({ error: "Permission denied." }, { status: 403 });
    }

    const fileRef = adminBucket.file(filePath);
    await fileRef.delete();

    return NextResponse.json({ success: true, message: `File deleted: ${filePath}` });

  } catch (err: any) {
    console.error("Temp file delete Error:", err);
    if ((err as any).code === 404) {
        return NextResponse.json({ success: true, message: "File already deleted." });
    }
    return NextResponse.json({ error: "Internal Server Error", details: err.message }, { status: 500 });
  }
}