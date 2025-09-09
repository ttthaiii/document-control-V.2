// src/app/api/rfa/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue } from 'firebase-admin/firestore'
import { REVIEWER_ROLES, APPROVER_ROLES, STATUSES } from '@/lib/config/workflow';

// GET - Get RFA document details
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid authorization header' },
        { status: 401 }
      )
    }

    const token = authHeader.split('Bearer ')[1]
    const decodedToken = await getAuth().verifyIdToken(token)
    const userId = decodedToken.uid

    const userDoc = await adminDb.collection('users').doc(userId).get()
    if (!userDoc.exists) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
    }
    const userData = userDoc.data()!
    const userRole = userData.role
    const userSites = userData.sites || []

    const rfaDoc = await adminDb.collection('rfaDocuments').doc(params.id).get()
    if (!rfaDoc.exists) {
      return NextResponse.json({ success: false, error: 'RFA document not found' }, { status: 404 })
    }
    const rfaData = rfaDoc.data()!

    if (!userSites.includes(rfaData.siteId)) {
      return NextResponse.json({ success: false, error: 'Access denied to this site' }, { status: 403 })
    }

    // Check role-based permissions
    let canView = false
    switch (userRole) {
      case 'BIM':
        canView = rfaData.createdBy === userId || 
                 ['APPROVED', 'REJECTED'].includes(rfaData.status)
        break
      case 'Site Admin':
        canView = rfaData.assignedTo === userId ||
                 rfaData.createdBy === userId ||
                 ['SITE_ADMIN_REVIEW', 'PENDING_SITE_ADMIN'].includes(rfaData.currentStep) ||
                 rfaData.rfaType === 'RFA-MAT'
        break
      case 'CM':
        canView = rfaData.assignedTo === userId ||
                 ['CM_APPROVAL', 'PENDING_CM'].includes(rfaData.currentStep) ||
                 ['APPROVED', 'REJECTED'].includes(rfaData.status)
        break
      case 'Admin':
        canView = true
        break
    }

    if (!canView) {
      return NextResponse.json(
        { success: false, error: 'No permission to view this document' },
        { status: 403 }
      )
    }

    // Get category information
    let categoryInfo = null
    try {
      const categoryDoc = await adminDb
        .collection('sites')
        .doc(rfaData.siteId)
        .collection('categories')
        .doc(rfaData.categoryId)
        .get()
      
      if (categoryDoc.exists) {
        const catData = categoryDoc.data()
        categoryInfo = {
          id: categoryDoc.id,
          categoryCode: catData?.categoryCode,
          categoryName: catData?.categoryName,
          rfaTypes: catData?.rfaTypes
        }
      }
    } catch (error) {
      console.error('Error fetching category:', error)
    }

    // Get site information
    let siteInfo = null
    try {
      const siteDoc = await adminDb.collection('sites').doc(rfaData.siteId).get()
      if (siteDoc.exists) {
        const siteDataDoc = siteDoc.data()
        siteInfo = {
          id: siteDoc.id,
          name: siteDataDoc?.name,
          description: siteDataDoc?.description
        }
      }
    } catch (error) {
      console.error('Error fetching site:', error)
    }

    // Get user information for workflow - Fix Set iteration issue
    const userIdSet = new Set<string>()
    if (rfaData.createdBy) userIdSet.add(rfaData.createdBy)
    if (rfaData.assignedTo) userIdSet.add(rfaData.assignedTo)
    
    // Add workflow user IDs
    if (rfaData.workflow) {
      rfaData.workflow.forEach((step: any) => {
        if (step.userId) userIdSet.add(step.userId)
      })
    }

    // Fetch user information - Convert Set to Array for iteration
    const usersInfo: Record<string, any> = {}
    const userIdArray = Array.from(userIdSet)
    
    for (const uid of userIdArray) {
      try {
        const userDoc = await adminDb.collection('users').doc(uid).get()
        if (userDoc.exists) {
          const userData = userDoc.data()
          usersInfo[uid] = {
            email: userData?.email,
            role: userData?.role,
            profile: userData?.profile
          }
        }
      } catch (error) {
        console.error(`Error fetching user ${uid}:`, error)
      }
    }

    // Calculate user permissions
    const permissions = {
      canView: true,
      canEdit: rfaData.createdBy === userId && rfaData.status === STATUSES.REVISION_REQUIRED,
      canSendToCm: REVIEWER_ROLES.includes(userRole) && rfaData.status === STATUSES.PENDING_REVIEW,
      canRequestRevision: REVIEWER_ROLES.includes(userRole) && rfaData.status === STATUSES.PENDING_REVIEW,

      canDelete: rfaData.createdBy === userId && 
                 rfaData.status === 'DRAFT' &&
                 userRole === 'Admin',
      canApprove: APPROVER_ROLES.includes(userRole) && rfaData.status === STATUSES.PENDING_CM_APPROVAL,
      canReject: APPROVER_ROLES.includes(userRole) && rfaData.status === STATUSES.PENDING_CM_APPROVAL,
      canForward: (
        (userRole === 'Site Admin' && rfaData.currentStep === 'SITE_ADMIN_REVIEW') ||
        userRole === 'Admin'
      ),
      canAddFiles: rfaData.createdBy === userId && 
                   ['DRAFT', 'PENDING_SITE_ADMIN'].includes(rfaData.status),
      canDownloadFiles: true // All viewers can download
    }

    // Prepare response data
    const responseData = {
      id: rfaDoc.id,
      ...rfaData,
      permissions
    };

    return NextResponse.json({ success: true, document: responseData })

  } catch (error) {
    console.error('Error fetching RFA document:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}


// PUT - Update RFA document (status, workflow, etc.)
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await getAuth().verifyIdToken(token);
    const userId = decodedToken.uid;

    const userDoc = await adminDb.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const userData = userDoc.data()!;
    const userRole = userData.role;

    const body = await request.json();
    const { action, comments } = body;

    if (!action) {
      return NextResponse.json({ error: 'Action is required' }, { status: 400 });
    }

    const rfaDocRef = adminDb.collection('rfaDocuments').doc(params.id);
    const rfaDoc = await rfaDocRef.get();

    if (!rfaDoc.exists) {
      return NextResponse.json({ error: 'RFA document not found' }, { status: 404 });
    }
    const docData = rfaDoc.data()!;

    let newStatus = docData.status;
    let newAssignedTo = docData.assignedTo; // ยังไม่มี logic หาคน assign จริงจัง
    let canPerformAction = false;

    // Workflow Logic
    switch (action) {
      case 'SEND_TO_CM':
        canPerformAction = REVIEWER_ROLES.includes(userRole) && docData.status === STATUSES.PENDING_REVIEW;
        if (canPerformAction) {
          newStatus = STATUSES.PENDING_CM_APPROVAL;
          // TODO: Implement logic to find and assign to a CM user
        }
        break;

      case 'REQUEST_REVISION':
        canPerformAction = (REVIEWER_ROLES.includes(userRole) && docData.status === STATUSES.PENDING_REVIEW) || 
                           (APPROVER_ROLES.includes(userRole) && docData.status === STATUSES.PENDING_CM_APPROVAL);
        if (canPerformAction) {
          newStatus = STATUSES.REVISION_REQUIRED;
          newAssignedTo = docData.createdBy; // ส่งกลับไปให้ผู้สร้าง
        }
        break;

      case 'SUBMIT_REVISION':
        canPerformAction = docData.createdBy === userId && docData.status === STATUSES.REVISION_REQUIRED;
        if (canPerformAction) {
            newStatus = STATUSES.PENDING_REVIEW; // กลับไปให้ Reviewer ตรวจสอบอีกครั้ง
            // TODO: Implement logic to assign back to a Reviewer
        }
        break;
        
      case 'APPROVE':
        canPerformAction = APPROVER_ROLES.includes(userRole) && docData.status === STATUSES.PENDING_CM_APPROVAL;
        if (canPerformAction) newStatus = STATUSES.APPROVED;
        break;

      case 'REJECT':
        canPerformAction = APPROVER_ROLES.includes(userRole) && docData.status === STATUSES.PENDING_CM_APPROVAL;
        if (canPerformAction) newStatus = STATUSES.REJECTED;
        break;
      
      case 'APPROVE_WITH_COMMENTS':
        canPerformAction = APPROVER_ROLES.includes(userRole) && docData.status === STATUSES.PENDING_CM_APPROVAL;
        if (canPerformAction) newStatus = STATUSES.APPROVED_WITH_COMMENTS;
        break;
        
      case 'APPROVE_REVISION_REQUIRED':
        canPerformAction = APPROVER_ROLES.includes(userRole) && docData.status === STATUSES.PENDING_CM_APPROVAL;
        if (canPerformAction) {
            newStatus = STATUSES.APPROVED_REVISION_REQUIRED;
            newAssignedTo = docData.createdBy; // ส่งกลับไปให้ผู้สร้าง
        }
        break;

      default:
        return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
    }

    if (!canPerformAction) {
      return NextResponse.json({ success: false, error: 'Permission denied for this action' }, { status: 403 });
    }

    // Update document
    const workflowEntry = {
      action,
      status: newStatus,
      userId,
      userName: userData.email,
      role: userRole,
      timestamp: new Date().toISOString(),
      comments: comments || '',
      files: docData.files
    };

    await rfaDocRef.update({
      status: newStatus,
      currentStep: newStatus, // ใช้ status เป็น step ไปก่อนเพื่อความง่าย
      assignedTo: newAssignedTo,
      workflow: FieldValue.arrayUnion(workflowEntry),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      message: `Action [${action}] completed successfully`,
      newStatus,
    });

  } catch (error) {
    console.error('Error updating RFA document:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

// Helper function to create notification
async function createNotification(notificationData: {
  type: string
  recipientId: string
  documentId: string
  documentNumber: string
  rfaType: string
  title: string
  actionBy: string
  siteId: string
  remarks?: string
}) {
  try {
    await adminDb.collection('notifications').add({
      ...notificationData,
      read: false,
      createdAt: FieldValue.serverTimestamp()
    })
  } catch (error) {
    console.error('Error creating notification:', error)
    // Don't fail the main request for notification errors
  }
}