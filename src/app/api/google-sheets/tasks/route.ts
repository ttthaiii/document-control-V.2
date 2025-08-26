// app/api/google-sheets/tasks/route.ts (ไฟล์ใหม่)
import { NextRequest, NextResponse } from 'next/server';
import { googleSheetsService } from '@/lib/google-sheets/service';
import { adminAuth } from '@/lib/firebase/admin';

export async function POST(request: NextRequest) {
  try {
    // ตรวจสอบ auth token
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authorization required' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(token);

    // รับ parameters
    const { sheetId, projectName, category, sheetName } = await request.json();
    
    if (!sheetId || !projectName || !category) {
      return NextResponse.json({ 
        error: 'Sheet ID, Project Name and Category are required' 
      }, { status: 400 });
    }

    // ดึงชื่องาน
    const tasks = await googleSheetsService.getTasksByProjectAndCategory(
      sheetId,
      projectName,
      category,
      sheetName || 'DB_TaskOverview'
    );

    return NextResponse.json({
      success: true,
      data: {
        tasks,
        projectName,
        category,
        totalTasks: tasks.length,
        userId: decodedToken.uid
      }
    });

  } catch (error: any) {
    console.error('❌ Google Sheets tasks API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message 
      }, 
      { status: 500 }
    );
  }
}