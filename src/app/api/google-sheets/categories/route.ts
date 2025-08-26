// app/api/google-sheets/categories/route.ts (ไฟล์ใหม่)
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
    const { sheetId, projectName, sheetName } = await request.json();
    
    if (!sheetId || !projectName) {
      return NextResponse.json({ 
        error: 'Sheet ID and Project Name are required' 
      }, { status: 400 });
    }

    // ดึงหมวดงาน
    const categories = await googleSheetsService.getTaskCategoriesByProject(
      sheetId,
      projectName, 
      sheetName || 'DB_TaskOverview'
    );

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
    console.error('❌ Google Sheets categories API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message 
      }, 
      { status: 500 }
    );
  }
}