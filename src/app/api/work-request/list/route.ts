import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(token);
    const userId = decodedToken.uid;

    const userDoc = await adminDb.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }
    const userData = userDoc.data()!;
    const userSites = userData.sites || [];

    if (userSites.length === 0 && userData.role !== 'Admin') {
      return NextResponse.json({ success: true, documents: [] });
    }

    let firestoreQuery: FirebaseFirestore.Query = adminDb.collection('workRequests');

    if (userData.role !== 'Admin') {
        firestoreQuery = firestoreQuery.where('siteId', 'in', userSites);
        // For non-admins with the 'in' filter, we cannot order by another field.
        // Sorting will be handled on the client-side.
    } else {
        // Admins can have server-side sorting because there is no 'in' filter.
        firestoreQuery = firestoreQuery.orderBy('updatedAt', 'desc');
    }

    const documentsSnapshot = await firestoreQuery.get();
    const documents: any[] = [];
    
    documentsSnapshot.forEach(doc => {
      const docData = doc.data();
      documents.push({
        id: doc.id,
        documentNumber: docData.documentNumber,
        taskName: docData.taskName,
        status: docData.status,
        priority: docData.priority,
        updatedAt: docData.updatedAt.toDate(),
        site: { id: docData.siteId, name: 'Loading...' }, 
      });
    });

    // If sorting was not done on the server, do it here before sending.
    if (userData.role !== 'Admin') {
      documents.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }
    
    return NextResponse.json({
      success: true,
      documents: documents,
    });

  } catch (error) {
    console.error('Error fetching work requests:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}