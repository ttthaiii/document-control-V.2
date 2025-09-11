// src/app/api/sites/route.ts (Corrected and Optimized Version)
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

    // ✅ [KEY CHANGE] ดึง ID ของ Site ที่ User มีสิทธิ์จาก Profile โดยตรง
    const userSiteIds = userProfile.sites || [];

    if (userSiteIds.length === 0) {
      // ถ้า User ไม่มี Site เลย ก็ส่ง Array ว่างกลับไป
      return NextResponse.json({ success: true, sites: [] });
    }

    // ✅ ดึงข้อมูลเฉพาะ Site ที่มี ID ตรงกันเท่านั้น
    const sitesPromises = userSiteIds.map((siteId: string) => 
      adminDb.collection('sites').doc(siteId).get()
    );
    const siteSnapshots = await Promise.all(sitesPromises);

    const sites = siteSnapshots
      .filter(doc => doc.exists) // กรองเอาเฉพาะ Site ที่มีอยู่จริง
      .map(doc => {
        const data = doc.data()!;
        return {
          id: doc.id,
          name: data.name,
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