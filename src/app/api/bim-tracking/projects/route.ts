// app/api/bim-tracking/projects/route.ts (แก้ไขแล้ว)
import { NextRequest, NextResponse } from 'next/server';
// 🔽 1. เปลี่ยน import: นำเข้า bimTrackingDb และ adminAuth
import { adminAuth, bimTrackingDb } from '@/lib/firebase/admin';



export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // --- ส่วนการยืนยันตัวตนยังคงเหมือนเดิม ---
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authorization required' }, { status: 401 });
    }
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(token);

    // --- 🔽 3. เปลี่ยน Logic การดึงข้อมูล ---
    // ไม่ต้องใช้ sheetId จาก body อีกต่อไป
    // const { sheetId, sheetName } = await request.json();

    // Query ไปยัง collection 'projects' ใน Firestore ของ BIM-Tracking
    const projectsSnapshot = await bimTrackingDb.collection('projects').get();

    if (projectsSnapshot.empty) {
      return NextResponse.json({
        success: true,
        data: {
          projects: [],
          totalProjects: 0,
          userId: decodedToken.uid
        }
      });
    }

    // Map ข้อมูลที่ได้จาก Firestore ให้อยู่ในรูปแบบที่ Frontend ต้องการ (array of strings)
    const projects = projectsSnapshot.docs.map(doc => doc.data().name);

    return NextResponse.json({
      success: true,
      data: {
        projects,
        totalProjects: projects.length,
        userId: decodedToken.uid
      }
    });

  } catch (error: any) {
    console.error('❌ Firestore projects API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message
      },
      { status: 500 }
    );
  }
}