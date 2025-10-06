// src/app/api/dashboard/stats/route.ts (New Version)
import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { STATUSES } from '@/lib/config/workflow';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) { // Changed to accept request object
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
      return NextResponse.json({
        success: true,
        stats: {
          responsibleParty: { BIM: 0, SITE: 0, CM: 0, APPROVED: 0 },
          categories: {},
        }
      });
    }

    // ✅ [KEY CHANGE] Read filters from URL query parameters
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const categoryId = searchParams.get('categoryId');
    const rfaType = searchParams.get('rfaType');

    // ✅ [KEY CHANGE] Start building a dynamic query
    let rfaQuery: FirebaseFirestore.Query = adminDb.collection('rfaDocuments')
      .where('siteId', 'in', userSites);

    if (rfaType && rfaType !== 'ALL') {
      rfaQuery = rfaQuery.where('rfaType', '==', rfaType);
    }      
    // Apply filters to the query if they exist and are not 'ALL'
    if (status && status !== 'ALL') {
      rfaQuery = rfaQuery.where('status', '==', status);
    }
    if (categoryId && categoryId !== 'ALL') {
      rfaQuery = rfaQuery.where('categoryId', '==', categoryId);
    }
    
    const rfaSnapshot = await rfaQuery.get();

    const stats = {
      responsibleParty: { BIM: 0, SITE: 0, CM: 0, APPROVED: 0 },
      categories: {} as Record<string, number>,
    };

    // The aggregation logic remains the same, but now operates on filtered data
    for (const doc of rfaSnapshot.docs) {
        const data = doc.data();

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