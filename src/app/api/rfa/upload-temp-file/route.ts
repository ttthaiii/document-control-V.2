// src/app/api/rfa/upload-temp-file/route.ts
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
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    const timestamp = Date.now();
    const originalName = file.name || "file";
    // เก็บไฟล์ใน path ชั่วคราวที่ไม่ซ้ำกันโดยใช้ UID ของ user
    const tempPath = `temp/${uid}/${timestamp}_${originalName}`;
    
    const fileRef = adminBucket.file(tempPath);
    const buffer = Buffer.from(await file.arrayBuffer());

    await fileRef.save(buffer, {
      contentType: file.type || "application/octet-stream",
    });

    // ส่ง URL ของ CDN และข้อมูลที่จำเป็นกลับไปให้ Frontend
    const cdnUrlBase = "https://ttsdoc-cdn.ttthaiii30.workers.dev";
    const fileUrl = `${cdnUrlBase}/${tempPath}`;

    return NextResponse.json({
      success: true,
      fileData: {
        fileName: originalName,
        fileUrl: fileUrl,
        filePath: tempPath, // ส่ง path กลับไปเพื่อให้ใช้ในการลบหรือย้ายไฟล์
        size: file.size,
        contentType: file.type,
      },
    });

  } catch (err: any) {
    console.error("Temp file upload Error:", err);
    return NextResponse.json({ error: "Internal Server Error", details: err.message }, { status: 500 });
  }
}