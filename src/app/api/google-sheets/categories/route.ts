// app/api/google-sheets/categories/route.ts (แก้ไขตามชื่อหมวดงาน)
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, bimTrackingDb } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

// --- 👇 [เพิ่ม] รายชื่อหมวดงานที่อนุญาตสำหรับ RFA-SHOP ---
const ALLOWED_SHOP_CATEGORIES = [
  "Structural Drawings",
  "Architectural Drawings",
  "Landscape Drawings",
  "Structural Asbuilt",
  "Architectural Asbuilt",
  "Landscape Asbuilt",
  "Interior Drawings",
  "Interior Drawings Asbuilt"
];
// --- 👆 สิ้นสุดการเพิ่ม ---


export async function POST(request: NextRequest) {
  try {
    // --- Authentication (เหมือนเดิม) ---
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authorization required' }, { status: 401 });
    }
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(token);

    const { projectName, rfaType } = await request.json();

    if (!projectName || !rfaType) {
      return NextResponse.json({
        error: 'Project Name and RFA Type are required'
      }, { status: 400 });
    }

    // --- ค้นหา Project ID (เหมือนเดิม) ---
    const projectsQuery = bimTrackingDb.collection('projects').where('name', '==', projectName).limit(1);
    const projectsSnapshot = await projectsQuery.get();

    if (projectsSnapshot.empty) {
      console.log(`[DEBUG] Project with name "${projectName}" not found.`);
      return NextResponse.json({ success: true, data: { categories: [] } });
    }

    const projectId = projectsSnapshot.docs[0].id;
    console.log(`[DEBUG] Found project "${projectName}" with ID: ${projectId}`);

    // --- ดึง Task ทั้งหมดใน Project (เหมือนเดิม) ---
    const tasksQuery = bimTrackingDb.collection('tasks').where('projectId', '==', projectId);
    const tasksSnapshot = await tasksQuery.get();

    if (tasksSnapshot.empty) {
      console.log(`[DEBUG] No tasks found for projectId "${projectId}".`);
      return NextResponse.json({ success: true, data: { categories: [] } });
    }

    // --- 👇 [แก้ไข] Logic การกรอง Category ใหม่ ---
    // 1. ดึง taskCategory ทั้งหมดที่มีอยู่จริง (ไม่ซ้ำ)
    const allCategoriesInProject = Array.from(new Set(
      tasksSnapshot.docs.map(doc => doc.data().taskCategory).filter(Boolean)
    ));

    let filteredCategories: string[];

    // 2. ตรวจสอบ rfaType
    if (rfaType === 'RFA-SHOP') {
      // ถ้าเป็น RFA-SHOP ให้กรองเอาเฉพาะชื่อที่อยู่ใน ALLOWED_SHOP_CATEGORIES
      filteredCategories = allCategoriesInProject.filter((category: string) =>
        ALLOWED_SHOP_CATEGORIES.includes(category)
      );
    } else if (rfaType === 'RFA-MAT') {
      // ถ้าเป็น RFA-MAT ให้ใช้ Logic เดิม (กรอง Prefix mat_)
      filteredCategories = allCategoriesInProject.filter((category: string) =>
        category.toLowerCase().startsWith('mat_')
      );
    } else if (rfaType === 'RFA-GEN') {
      // ถ้าเป็น RFA-GEN ให้ใช้ Logic เดิม (กรอง Prefix gen_)
      filteredCategories = allCategoriesInProject.filter((category: string) =>
        category.toLowerCase().startsWith('gen_')
      );
    } else {
      // กรณีอื่นๆ (เช่น RFA Type ไม่ถูกต้อง) ให้คืนค่าว่าง
      filteredCategories = [];
    }

    // 3. เรียงลำดับผลลัพธ์
    const sortedCategories = filteredCategories.sort();
    // --- 👆 สิ้นสุดการแก้ไข ---


    return NextResponse.json({
      success: true,
      data: {
        categories: sortedCategories, // <-- ใช้ Array ที่กรองและเรียงลำดับแล้ว
        projectName,
        totalCategories: sortedCategories.length,
        userId: decodedToken.uid
      }
    });

  } catch (error: any) {
    console.error('❌ Firestore categories API error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}