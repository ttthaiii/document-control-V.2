import { NextRequest, NextResponse } from "next/server";
import { adminAuth, getBimTrackingDb } from "@/lib/firebase/admin";

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: 'Authorization required' }, { status: 401 });
    }
    await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1]);

    const { projectName } = await request.json();
    if (!projectName) {
      return NextResponse.json({ success: false, error: 'Project Name is required' }, { status: 400 });
    }
    
    const bimTrackingDb = getBimTrackingDb();

    const projectsQuery = bimTrackingDb.collection("projects").where("name", "==", projectName).limit(1);
    const projectsSnapshot = await projectsQuery.get();

    if (projectsSnapshot.empty) {
      return NextResponse.json({ success: true, tasks: [] });
    }
    const projectId = projectsSnapshot.docs[0].id;

    // --- 👇 นี่คือส่วนที่แก้ไข ---
    // 1. ดึง Task ทั้งหมดที่ตรงกับ Category ก่อน โดยไม่สนใจ field 'link'
    const tasksQuery = bimTrackingDb.collection("tasks")
      .where("projectId", "==", projectId)
      .where("taskCategory", "==", "Work Request");
      
    const tasksSnapshot = await tasksQuery.get();

    if (tasksSnapshot.empty) {
      return NextResponse.json({ success: true, tasks: [] });
    }

    // 2. นำผลลัพธ์มากรองในโค้ดอีกที: เลือกเฉพาะ Task ที่ไม่มี 'link' หรือ 'link' เป็นค่าว่าง
    const tasks = tasksSnapshot.docs
      .filter(doc => !doc.data().link) // ตรวจสอบว่าไม่มี field 'link' หรือมีค่าเป็น null, undefined, ""
      .map(doc => {
          const data = doc.data();
          return {
              taskUid: doc.id,
              taskCategory: data.taskCategory || '',
              taskName: data.taskName || '',
              projectName: data.projectName || '',
          };
      });
    // --- 👆 สิ้นสุดการแก้ไข ---

    return NextResponse.json({ success: true, tasks });

  } catch (error: any) {
    console.error('BIM Tracking Work Request Tasks Error:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}