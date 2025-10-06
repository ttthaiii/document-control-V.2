// src/app/api/sites/route.ts (แก้ไขแล้ว)
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { ROLES } from '@/lib/config/workflow';

export const dynamic = 'force-dynamic';

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

    let siteSnapshots: FirebaseFirestore.DocumentSnapshot[];

    // --- 👇 จุดที่แก้ไขคือตรงนี้ครับ 👇 ---
    if (userProfile.role === ROLES.ADMIN) { 
      // 1. ถ้าเป็น Admin: ให้ดึงข้อมูลจาก collection 'sites' มาทั้งหมด
      const allSitesSnapshot = await adminDb.collection('sites').get();
      siteSnapshots = allSitesSnapshot.docs;
    } else {
      // 2. ถ้าเป็น Role อื่น: ใช้ Logic เดิม คือดึงจาก userProfile.sites
      const userSiteIds = userProfile.sites || [];
      if (userSiteIds.length === 0) {
        return NextResponse.json({ success: true, sites: [] });
      }
      const sitesPromises = userSiteIds.map((siteId: string) => 
        adminDb.collection('sites').doc(siteId).get()
      );
      siteSnapshots = await Promise.all(sitesPromises);
    }
    // --- สิ้นสุดจุดที่แก้ไข ---

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