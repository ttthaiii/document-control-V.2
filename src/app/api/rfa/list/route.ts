// src/app/api/rfa/list/route.ts (แก้ไขแล้ว)
import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { getAuth } from 'firebase-admin/auth'
import {
  CREATOR_ROLES,
  REVIEWER_ROLES,
  APPROVER_ROLES,
  OBSERVER_ALL_ROLES,
  OBSERVER_FINISHED_ROLES,
  STATUSES
} from '@/lib/config/workflow';

export async function GET(request: NextRequest) {
  try {
    // (ส่วนของการยืนยันตัวตนและดึงข้อมูล User ยังคงเดิม)
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: 'Missing or invalid authorization header' }, { status: 401 })
    }
    const token = authHeader.split('Bearer ')[1]
    const decodedToken = await getAuth().verifyIdToken(token)
    const userId = decodedToken.uid
    const userDoc = await adminDb.collection('users').doc(userId).get()
    if (!userDoc.exists) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
    }
    const userData = userDoc.data()!;
    const userRole = userData.role;
    const userSites = userData.sites || [];
    if (userSites.length === 0) {
      return NextResponse.json({ success: false, error: 'No site access' }, { status: 403 })
    }
    
    // (ส่วนของการ Query ข้อมูลจาก Firestore ยังคงเดิม)
    const { searchParams } = new URL(request.url)
    const rfaType = searchParams.get('rfaType')
    const status = searchParams.get('status')
    
    let firestoreQuery: any = adminDb.collection('rfaDocuments');
    firestoreQuery = firestoreQuery.where('siteId', 'in', userSites);

    if (rfaType && rfaType !== 'ALL') {
        firestoreQuery = firestoreQuery.where('rfaType', '==', rfaType)
    }
    firestoreQuery = firestoreQuery.orderBy('updatedAt', 'desc');

    const documentsSnapshot = await firestoreQuery.get();
    const documents: any[] = [];
    const finishedStatuses = [
        STATUSES.APPROVED,
        STATUSES.REJECTED,
        STATUSES.APPROVED_WITH_COMMENTS,
        STATUSES.APPROVED_REVISION_REQUIRED,
    ];

    for (const doc of documentsSnapshot.docs) {
      const documentData = doc.data();
      
      // (ส่วน Logic การกรอง shouldInclude ยังคงเดิม)
      let shouldInclude = false;
      if (userRole === 'Admin' || OBSERVER_ALL_ROLES.includes(userRole) || REVIEWER_ROLES.includes(userRole) || CREATOR_ROLES.includes(userRole)) {
        shouldInclude = true;
      } else if (APPROVER_ROLES.includes(userRole)) {
        const relevantStatuses = [STATUSES.PENDING_CM_APPROVAL, ...finishedStatuses];
        if (relevantStatuses.includes(documentData.status)) shouldInclude = true;
      } else if (OBSERVER_FINISHED_ROLES.includes(userRole)) {
         if (finishedStatuses.includes(documentData.status)) shouldInclude = true;
      }
      if (shouldInclude && status && status !== 'ALL') {
          if (documentData.status !== status) shouldInclude = false;
      }

      if (shouldInclude) {
        // --- ✅ นี่คือส่วนที่แก้ไข: เพิ่มการสร้างออบเจ็กต์ permissions ---
        const permissions = {
          canView: true,
          canEdit: documentData.createdBy === userId && documentData.status === STATUSES.REVISION_REQUIRED,
          canSendToCm: REVIEWER_ROLES.includes(userRole) && documentData.status === STATUSES.PENDING_REVIEW,
          canRequestRevision: REVIEWER_ROLES.includes(userRole) && documentData.status === STATUSES.PENDING_REVIEW,
          canApprove: APPROVER_ROLES.includes(userRole) && documentData.status === STATUSES.PENDING_CM_APPROVAL,
          canReject: APPROVER_ROLES.includes(userRole) && documentData.status === STATUSES.PENDING_CM_APPROVAL,
        };
        
        // (ส่วนการดึงข้อมูล site, category สามารถนำกลับมาใช้ได้ถ้าต้องการ)
        // เพื่อความรวดเร็วในการแสดงผล list อาจจะยังไม่ดึงข้อมูลย่อยเหล่านี้มา
        const siteInfo = { id: documentData.siteId, name: documentData.siteName || 'N/A' };
        const categoryInfo = { id: documentData.categoryId, categoryCode: documentData.taskData?.taskCategory || 'N/A' };
        const createdByInfo = { email: documentData.workflow[0]?.userName || 'N/A', role: documentData.workflow[0]?.role || 'N/A' };
        const assignedUserInfo = null;

        documents.push({
          id: doc.id,
          ...documentData,
          site: siteInfo,
          category: categoryInfo,
          createdByInfo: createdByInfo,
          assignedUserInfo: assignedUserInfo,
          permissions: permissions // <-- เพิ่ม permissions เข้าไปในข้อมูลที่ส่งกลับ
        });
      }
    }
    
    return NextResponse.json({
      success: true,
      documents: documents,
    });

  } catch (error) {
    console.error('Error fetching RFA documents:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}