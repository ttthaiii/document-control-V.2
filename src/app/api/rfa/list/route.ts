// src/app/api/rfa/list/route.ts (with Debugging)
import { NextRequest, NextResponse } from 'next/server'
import { adminDb, adminAuth } from '@/lib/firebase/admin'
import { STATUSES } from '@/lib/config/workflow';

export async function GET(request: NextRequest) {
  // ✅ 1. เพิ่ม Log เพื่อดูว่า API ถูกเรียกใช้หรือไม่
  console.log("\n--- [API LOG] Received request for approved documents ---");

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
      console.log("[API LOG] User has no assigned sites. Returning empty array.");
      return NextResponse.json({ success: true, documents: [] });
    }
    
    const { searchParams } = new URL(request.url)
    const view = searchParams.get('view');
    
    if (view !== 'approved') {
        return NextResponse.json({ success: false, error: 'Invalid view parameter' }, { status: 400 });
    }

    // ✅ 2. เพิ่ม Log เพื่อดู Filter ที่ได้รับ
    const siteId = searchParams.get('siteId');
    const categoryId = searchParams.get('categoryId');
    console.log(`[API LOG] Filters received: siteId=${siteId}, categoryId=${categoryId}`);


    let firestoreQuery: FirebaseFirestore.Query = adminDb.collection('rfaDocuments');

    // บังคับเงื่อนไข `isLatest` และ `status`
    const approvedStatuses = [
      STATUSES.APPROVED,
      STATUSES.APPROVED_WITH_COMMENTS,
      STATUSES.APPROVED_REVISION_REQUIRED
    ];
    firestoreQuery = firestoreQuery
                        .where('isLatest', '==', true)
                        .where('status', 'in', approvedStatuses);

    // กรองตาม Site
    if (siteId && siteId !== 'ALL') {
      if (userSites.includes(siteId)) {
        firestoreQuery = firestoreQuery.where('siteId', '==', siteId);
      } else {
        console.log(`[API LOG] Access denied for requested siteId: ${siteId}. Returning empty array.`);
        return NextResponse.json({ success: true, documents: [] });
      }
    } else {
      firestoreQuery = firestoreQuery.where('siteId', 'in', userSites);
    }

    // กรองตาม Category
    if (categoryId && categoryId !== 'ALL') {
        firestoreQuery = firestoreQuery.where('categoryId', '==', categoryId);
    }

    firestoreQuery = firestoreQuery.orderBy('updatedAt', 'desc');
    
    console.log("[API LOG] Executing Firestore query...");
    const documentsSnapshot = await firestoreQuery.get();

    // ✅ 3. เพิ่ม Log เพื่อดูผลลัพธ์จากการ Query
    console.log(`[API LOG] Query finished. Found ${documentsSnapshot.size} documents.`);

    const documents: any[] = [];
    documentsSnapshot.forEach(doc => {
      documents.push({ id: doc.id, ...doc.data() });
    });
    
    console.log("[API LOG] Sending successful response to client.");
    return NextResponse.json({
      success: true,
      documents: documents,
    });

  } catch (error) {
    // ✅ 4. เพิ่ม Log เพื่อจับ Error ทุกชนิด
    console.error('--- [API LOG] UNEXPECTED ERROR ---', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}