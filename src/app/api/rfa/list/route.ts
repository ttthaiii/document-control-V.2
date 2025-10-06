// src/app/api/rfa/list/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { adminDb, adminAuth } from '@/lib/firebase/admin'
import { STATUSES } from '@/lib/config/workflow';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: 'Missing or invalid authorization header' }, { status: 401 })
    }
    const token = authHeader.split('Bearer ')[1]
    const decodedToken = await adminAuth.verifyIdToken(token)
    const userId = decodedToken.uid

    const userDoc = await adminDb.collection('users').doc(userId).get()
    if (!userDoc.exists) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
    }
    const userData = userDoc.data()!;
    const userSites = userData.sites || [];

    if (userSites.length === 0) {
      return NextResponse.json({ success: true, documents: [] });
    }
    
    const { searchParams } = new URL(request.url)
    const view = searchParams.get('view');
    
    if (view !== 'approved') {
        return NextResponse.json({ success: false, error: 'Invalid view parameter for this endpoint' }, { status: 400 });
    }

    let firestoreQuery: FirebaseFirestore.Query = adminDb.collection('rfaDocuments');

    // 1. บังคับเงื่อนไข `isLatest` และ `status` เสมอ
    const approvedStatuses = [
      STATUSES.APPROVED,
      STATUSES.APPROVED_WITH_COMMENTS,
      STATUSES.APPROVED_REVISION_REQUIRED
    ];
    firestoreQuery = firestoreQuery
                        .where('isLatest', '==', true)
                        .where('status', 'in', approvedStatuses);

    // 2. กรองตาม Site
    const siteId = searchParams.get('siteId');
    if (siteId && siteId !== 'ALL') {
      if (userSites.includes(siteId)) {
        firestoreQuery = firestoreQuery.where('siteId', '==', siteId);
      } else {
        return NextResponse.json({ success: true, documents: [] });
      }
    } else {
      firestoreQuery = firestoreQuery.where('siteId', 'in', userSites);
    }

    // 3. กรองตาม Category
    const categoryId = searchParams.get('categoryId');
    if (categoryId && categoryId !== 'ALL') {
        firestoreQuery = firestoreQuery.where('categoryId', '==', categoryId);
    }

    // 4. เรียงลำดับ
    firestoreQuery = firestoreQuery.orderBy('updatedAt', 'desc');

    const documentsSnapshot = await firestoreQuery.get();
    const documents: any[] = [];
    
    documentsSnapshot.forEach(doc => {
      const documentData = doc.data();
      
      documents.push({
        id: doc.id,
        documentNumber: documentData.documentNumber,
        title: documentData.title,
        status: documentData.status,
        updatedAt: documentData.updatedAt,
        rfaType: documentData.rfaType,
        site: { id: documentData.siteId, name: documentData.siteName || 'N/A' },
        category: { id: documentData.categoryId, categoryCode: documentData.taskData?.taskCategory || documentData.categoryId || 'N/A' },
        files: documentData.files || [],
      });
    });
    
    return NextResponse.json({
      success: true,
      documents: documents,
    });

  } catch (error) {
    console.error('Error fetching approved RFA documents:', error);
    if (error instanceof Error && error.message.includes('FAILED_PRECONDITION')) {
        return NextResponse.json({ success: false, error: 'Firestore query requires a composite index. Please check the server logs for the creation link.' }, { status: 400 });
    }
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}