// app/api/bim-tracking/tasks/route.ts (เวอร์ชันสำหรับดีบัก)
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, bimTrackingDb } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authorization required' }, { status: 401 });
    }
    const token = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1]);

    const { projectName, category } = await request.json();

    // --- 🔽 เพิ่ม Log จุดที่ 1: ดูว่า Frontend ส่งอะไรมา 🔽 ---
    console.log(`[TASKS_DEBUG] Received projectName: "${projectName}", category: "${category}"`);

    if (!projectName || !category) {
      return NextResponse.json({ error: 'Project Name and Category are required' }, { status: 400 });
    }

    const projectsQuery = bimTrackingDb.collection('projects').where('name', '==', projectName).limit(1);
    const projectsSnapshot = await projectsQuery.get();

    if (projectsSnapshot.empty) {
      console.log(`[TASKS_DEBUG] Project with name "${projectName}" not found.`);
      return NextResponse.json({ success: true, data: { tasks: [] } });
    }
    const projectId = projectsSnapshot.docs[0].id;
    console.log(`[TASKS_DEBUG] Found project ID: "${projectId}"`);


    const tasksQuery = bimTrackingDb.collection('tasks')
      .where('projectId', '==', projectId)
      .where('taskCategory', '==', category);

    const tasksSnapshot = await tasksQuery.get();

    if (tasksSnapshot.empty) {
      return NextResponse.json({ success: true, data: { tasks: [] } });
    }

    const REV_PATTERN = /[\s_]+REV\.\d+$/i;

    const tasks = tasksSnapshot.docs
      .filter(doc => !doc.data().link)
      .filter(doc => !REV_PATTERN.test(doc.data().taskName || ''))
      .map(doc => {
        const data = doc.data();
        return {
          taskUid: doc.id,
          taskCategory: data.taskCategory || '',
          taskName: data.taskName || '',
          projectName: data.projectName || '',
          startDate: data.startDate || '',
          finishDate: data.finishDate || '',
          percentComplete: data.percentComplete || 0
        };
      });

    return NextResponse.json({
      success: true,
      data: {
        tasks,
        projectName,
        category,
        totalTasks: tasks.length,
        userId: token.uid
      }
    });

  } catch (error: any) {
    console.error('❌ Firestore tasks API error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}