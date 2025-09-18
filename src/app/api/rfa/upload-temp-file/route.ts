// src/app/api/rfa/upload-temp-file/route.ts (แก้ไขแล้ว)
import { NextResponse } from "next/server";
import { adminBucket, adminAuth } from "@/lib/firebase/admin"; // 🔽 1. Import adminAuth เข้ามา

// 🗑️ 2. ลบ getAuth ที่ไม่ได้ใช้แล้วออกไป
// import { getAuth } from "firebase-admin/auth";

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
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    const timestamp = Date.now();
    const originalName = file.name || "file";
    const tempPath = `temp/${uid}/${timestamp}_${originalName}`;
    
    const fileRef = adminBucket.file(tempPath);
    const buffer = Buffer.from(await file.arrayBuffer());

    await fileRef.save(buffer, {
      contentType: file.type || "application/octet-stream",
    });

    const cdnUrlBase = "https://ttsdoc-cdn.ttthaiii30.workers.dev";
    const fileUrl = `${cdnUrlBase}/${tempPath}`;

    return NextResponse.json({
      success: true,
      fileData: {
        fileName: originalName,
        fileUrl: fileUrl,
        filePath: tempPath,
        size: file.size,
        contentType: file.type,
      },
    });

  } catch (err: any) {
    console.error("Temp file upload Error:", err);
    return NextResponse.json({ error: "Internal Server Error", details: err.message }, { status: 500 });
  }
}