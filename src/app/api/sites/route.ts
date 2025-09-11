// src/app/api/sites/route.ts (Fixed Version)
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authorization required' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(token);
    const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
    const userProfile = userDoc.data();

    if (!userProfile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    const sitesSnapshot = await adminDb.collection('sites').get();
    
    const sites = sitesSnapshot.docs
      // ✅ 1. แก้ไข Logic การ Filter ให้ถูกต้อง (members เป็น array of objects)
      .filter((doc: any) => {
        const members = doc.data().members || [];
        return members.some((member: any) => member.userId === decodedToken.uid);
      })
      // ✅ 2. แก้ไขการ map ข้อมูล ส่ง sheetId ไปให้ Frontend
      .map((doc: any) => {
        const data = doc.data();
        return {
          id: doc.id,
          name: data.name,
          // ดึงค่า sheetId จาก object ที่ซ้อนกันอยู่
          sheetId: data.settings?.googleSheetsConfig?.spreadsheetId || null,
          sheetName: data.settings?.googleSheetsConfig?.sheetName || null,
        };
      });

    return NextResponse.json({
      success: true,
      sites: sites
    });

  } catch (error: any) {
    console.error('❌ Sites API error:', error);
    return NextResponse.json(
      { success: false, error: error.message }, 
      { status: 500 }
    );
  }
}