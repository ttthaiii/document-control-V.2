// src/app/api/sites/route.ts
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

    if (userProfile.role === ROLES.ADMIN) { 
      const allSitesSnapshot = await adminDb.collection('sites').get();
      siteSnapshots = allSitesSnapshot.docs;
    } else {
      const userSiteIds = userProfile.sites || [];
      if (userSiteIds.length === 0) {
        return NextResponse.json({ success: true, sites: [] });
      }
      const sitesPromises = userSiteIds.map((siteId: string) => 
        adminDb.collection('sites').doc(siteId).get()
      );
      siteSnapshots = await Promise.all(sitesPromises);
    }

    const sites = siteSnapshots
      .filter(doc => doc.exists)
      .map(doc => {
        const data = doc.data()!;
        return {
          id: doc.id,
          name: data.name,
          sheetId: data.settings?.googleSheetsConfig?.spreadsheetId || null,
          sheetName: data.settings?.googleSheetsConfig?.sheetName || null,
          // 👇 ✅ เพิ่มบรรทัดนี้: ส่ง roleSettings กลับไปด้วย
          roleSettings: data.roleSettings || null 
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