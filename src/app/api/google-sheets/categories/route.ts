// app/api/google-sheets/categories/route.ts (แก้ไขแล้ว)
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, bimTrackingDb } from '@/lib/firebase/admin';

export async function POST(request: NextRequest) {
  try {
    // ... (ส่วนการยืนยันตัวตนเหมือนเดิม) ...
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

    const projectsQuery = bimTrackingDb.collection('projects').where('name', '==', projectName).limit(1);
    const projectsSnapshot = await projectsQuery.get();

    if (projectsSnapshot.empty) {
      console.log(`[DEBUG] Project with name "${projectName}" not found.`);
      return NextResponse.json({ success: true, data: { categories: [] } });
    }
    
    const projectId = projectsSnapshot.docs[0].id;
    console.log(`[DEBUG] Found project "${projectName}" with ID: ${projectId}`);

    // --- 🔽 แก้ไขตรงนี้: เปลี่ยนจาก projectID เป็น projectId 🔽 ---
    const tasksQuery = bimTrackingDb.collection('tasks').where('projectId', '==', projectId);
    const tasksSnapshot = await tasksQuery.get();

    if (tasksSnapshot.empty) {
      console.log(`[DEBUG] No tasks found for projectId "${projectId}".`);
      return NextResponse.json({ success: true, data: { categories: [] } });
    }

    // ... (ส่วนที่เหลือของโค้ดเหมือนเดิม) ...
    const allCategories = Array.from(new Set(
      tasksSnapshot.docs.map(doc => doc.data().taskCategory).filter(Boolean)
    ));
    
    const getRequiredPrefix = (type: string): string[] => {
        switch(type) {
            case 'RFA-SHOP': return ['shop_', 'as-built_'];
            case 'RFA-MAT': return ['mat_'];
            case 'RFA-GEN': return ['gen_'];
            default: return [];
        }
    }
    const requiredPrefixes = getRequiredPrefix(rfaType);
    const categories = allCategories.filter((category: string) => {
        const categoryLower = category.toLowerCase();
        return requiredPrefixes.some(prefix => categoryLower.startsWith(prefix));
    }).sort();

    return NextResponse.json({
      success: true,
      data: {
        categories,
        projectName,
        totalCategories: categories.length,
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