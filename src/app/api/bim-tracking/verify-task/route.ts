import { NextRequest, NextResponse } from "next/server";
import { adminAuth, getBimTrackingDb } from "@/lib/firebase/admin";

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // 1. ตรวจสอบสิทธิ์ผู้ใช้
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: 'Authorization required' }, { status: 401 });
    }
    const token = authHeader.split('Bearer ')[1];
    await adminAuth.verifyIdToken(token);

    // 2. รับข้อมูลสำหรับใช้ค้นหา
    const { documentNumber, projectName, rev, taskName } = await request.json();
    if (!documentNumber || !projectName || rev === undefined || !taskName) {
      return NextResponse.json({ success: false, error: 'Missing required fields for verification' }, { status: 400 });
    }
    
    // 3. เชื่อมต่อฐานข้อมูล BIM Tracking
    const bimTrackingDb = getBimTrackingDb();

    // 3.1 ค้นหา Project ID จาก Project Name
    const projectsQuery = bimTrackingDb.collection("projects").where("name", "==", projectName).limit(1);
    const projectsSnapshot = await projectsQuery.get();

    if (projectsSnapshot.empty) {
      return NextResponse.json({ success: true, exists: false, message: `ไม่พบโปรเจกต์ '${projectName}' ในระบบ BIM Tracking` });
    }
    const projectId = projectsSnapshot.docs[0].id;

    // --- 👇 LOGIC ที่แก้ไขใหม่ ---
    // 3.2 ใช้ projectId ค้นหา Task โดยเปรียบเทียบ rev เป็น String
    const tasksQuery = bimTrackingDb.collection("tasks")
      .where("documentNumber", "==", documentNumber)
      .where("projectId", "==", projectId)
      .where("rev", "==", String(rev).padStart(2, '0')) // <-- ใช้เงื่อนไขนี้
      // .where("taskName", "==", taskName) // <--- บรรทัดนี้ถูกลบออก
      .limit(1);

    const tasksSnapshot = await tasksQuery.get();

    if (tasksSnapshot.empty) {
      return NextResponse.json({ success: true, exists: false, message: 'ไม่พบ Task ที่ตรงกันในระบบ BIM Tracking' });
    } else {
      const taskId = tasksSnapshot.docs[0].id;
      return NextResponse.json({ success: true, exists: true, taskId: taskId });
    }

  } catch (error: any) {
    console.error('BIM Tracking Verification Error:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}