// src/app/dashboard/stats/route.ts
import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { STATUSES } from '@/lib/config/workflow';

export async function GET() {
  try {
    const headersList = headers()
    const authorization = headersList.get('authorization')

    if (!authorization?.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: 'No authorization token' }, { status: 401 });
    }

    const token = authorization.split('Bearer ')[1]
    const decodedToken = await adminAuth.verifyIdToken(token)
    const userId = decodedToken.uid

    const userDoc = await adminDb.collection('users').doc(userId).get()
    if (!userDoc.exists) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    const userData = userDoc.data()
    const userSites = userData?.sites || []

    if (userSites.length === 0) {
      // ถ้า user ไม่มี site, ส่งค่า default กลับไป
      return NextResponse.json({
        success: true,
        stats: {
          responsibleParty: { BIM: 0, SITE: 0, CM: 0, APPROVED: 0 },
          categories: {},
        }
      });
    }

    // ดึงเอกสาร RFA ทั้งหมดที่ user มีสิทธิ์เห็นใน site
    const rfaSnapshot = await adminDb.collection('rfaDocuments')
      .where('siteId', 'in', userSites)
      .get();

    const stats = {
      responsibleParty: {
        BIM: 0, // ใน workflow ใหม่คือสถานะ 'แก้ไข' ที่ส่งกลับไปหาผู้สร้าง
        SITE: 0, // สถานะ 'รอตรวจสอบ'
        CM: 0, // สถานะ 'ส่ง CM'
        APPROVED: 0, // สถานะ 'อนุมัติ' ทั้งหมด
      },
      categories: {} as Record<string, number>,
    };

    for (const doc of rfaSnapshot.docs) {
        const data = doc.data();

        // 1. นับตามผู้รับผิดชอบ (Responsible Party)
        switch (data.status) {
            case STATUSES.PENDING_REVIEW:
                stats.responsibleParty.SITE += 1;
                break;
            case STATUSES.PENDING_CM_APPROVAL:
                stats.responsibleParty.CM += 1;
                break;
            case STATUSES.REVISION_REQUIRED:
            case STATUSES.APPROVED_REVISION_REQUIRED:
                stats.responsibleParty.BIM += 1;
                break;
            case STATUSES.APPROVED:
            case STATUSES.APPROVED_WITH_COMMENTS:
                stats.responsibleParty.APPROVED += 1;
                break;
        }

        // 2. นับตามหมวดหมู่ (Category)
        const categoryCode = data.taskData?.taskCategory || 'N/A';
        if (categoryCode) {
            stats.categories[categoryCode] = (stats.categories[categoryCode] || 0) + 1;
        }
    }

    return NextResponse.json({
      success: true,
      stats: stats,
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}