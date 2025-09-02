// src/app/api/rfa/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue } from 'firebase-admin/firestore'

// GET - Get RFA document details
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get auth token from header
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

    // Get user data
    const userDoc = await adminDb.collection('users').doc(userId).get()
    if (!userDoc.exists) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      )
    }

    const userData = userDoc.data()
    const userRole = userData?.role
    const userSites = userData?.sites || []

    // Get RFA document
    const rfaDoc = await adminDb.collection('rfaDocuments').doc(params.id).get()
    
    if (!rfaDoc.exists) {
      return NextResponse.json(
        { success: false, error: 'RFA document not found' },
        { status: 404 }
      )
    }

    const rfaData = rfaDoc.data()
    if (!rfaData) {
      return NextResponse.json(
        { success: false, error: 'Document data not found' },
        { status: 404 }
      )
    }

    // Check if user has access to this site
    if (!userSites.includes(rfaData.siteId)) {
      return NextResponse.json(
        { success: false, error: 'No access to this document' },
        { status: 403 }
      )
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
      canEdit: rfaData.createdBy === userId && 
               ['DRAFT'].includes(rfaData.status) &&
               userRole !== 'CM', // CM cannot edit documents
      canDelete: rfaData.createdBy === userId && 
                 rfaData.status === 'DRAFT' &&
                 userRole === 'Admin',
      canApprove: (
        (userRole === 'Site Admin' && rfaData.currentStep === 'SITE_ADMIN_REVIEW') ||
        (userRole === 'CM' && rfaData.currentStep === 'CM_APPROVAL') ||
        userRole === 'Admin'
      ),
      canReject: (
        (userRole === 'Site Admin' && rfaData.currentStep === 'SITE_ADMIN_REVIEW') ||
        (userRole === 'CM' && rfaData.currentStep === 'CM_APPROVAL') ||
        userRole === 'Admin'
      ),
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
      documentNumber: rfaData.documentNumber,
      rfaType: rfaData.rfaType,
      title: rfaData.title,
      description: rfaData.description || '', // เพิ่ม default value
      status: rfaData.status,
      currentStep: rfaData.currentStep,
      revisionNumber: rfaData.revisionNumber,
      
      // Related information
      site: siteInfo,
      category: categoryInfo,
      
      // Users
      createdBy: rfaData.createdBy,
      assignedTo: rfaData.assignedTo,
      createdByInfo: usersInfo[rfaData.createdBy] || { email: 'Unknown', role: 'Unknown' },
      assignedUserInfo: rfaData.assignedTo ? usersInfo[rfaData.assignedTo] : null,
      usersInfo: usersInfo,
      
      // Files - เพิ่มการแปลง format
      files: rfaData.files?.map((file: any) => ({
        fileName: file.fileName,
        fileUrl: file.fileUrl,
        filePath: file.filePath,
        size: file.size,
        contentType: file.contentType,
        uploadedAt: file.uploadedAt,
        uploadedBy: file.uploadedBy
      })) || [],
      filesCount: rfaData.files?.length || 0,
      totalFileSize: rfaData.metadata?.totalFileSize || 0,
      
      // Workflow - เพิ่มการแปลง format
      workflow: rfaData.workflow?.map((step: any) => ({
        step: step.action || step.step,
        status: step.status,
        userId: step.userId,
        userRole: step.role || step.userRole,
        timestamp: step.timestamp,
        comments: step.comments
      })) || [],
      
      // Timestamps
      createdAt: rfaData.createdAt,
      updatedAt: rfaData.updatedAt,
      
      // Metadata
      metadata: rfaData.metadata || {},
      
      // Permissions for current user
      permissions: permissions,
      
      // Current user context
      currentUser: {
        id: userId,
        role: userRole,
        isCreator: rfaData.createdBy === userId,
        isAssigned: rfaData.assignedTo === userId
      }
    }

    return NextResponse.json({
      success: true,
      document: responseData
    })

  } catch (error) {
    console.error('Error fetching RFA document:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT - Update RFA document (status, workflow, etc.)
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get auth token from header
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

    // Get user data
    const userDoc = await adminDb.collection('users').doc(userId).get()
    if (!userDoc.exists) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      )
    }

    const userData = userDoc.data()
    const userRole = userData?.role

    // Parse request body
    const body = await request.json()
    const { action, comments, remarks, newAssignee } = body
    const finalRemarks = comments || remarks || '' // Support both comments and remarks

    if (!action) {
      return NextResponse.json(
        { success: false, error: 'Action is required' },
        { status: 400 }
      )
    }

    // Get RFA document
    const rfaDocRef = adminDb.collection('rfaDocuments').doc(params.id)
    const rfaDoc = await rfaDocRef.get()
    
    if (!rfaDoc.exists) {
      return NextResponse.json(
        { success: false, error: 'RFA document not found' },
        { status: 404 }
      )
    }

    const documentData = rfaDoc.data()
    if (!documentData) {
      return NextResponse.json(
        { success: false, error: 'Document data not found' },
        { status: 404 }
      )
    }

    // Check permissions based on action
    let canPerformAction = false
    let newStatus = documentData.status
    let newCurrentStep = documentData.currentStep
    let newAssignedTo = documentData.assignedTo

    switch (action) {
      case 'approve':
        canPerformAction = (
          (userRole === 'Site Admin' && documentData.currentStep === 'SITE_ADMIN_REVIEW') ||
          (userRole === 'CM' && documentData.currentStep === 'CM_APPROVAL') ||
          userRole === 'Admin'
        )
        
        if (canPerformAction) {
          if (documentData.currentStep === 'SITE_ADMIN_REVIEW') {
            newStatus = 'PENDING_CM'
            newCurrentStep = 'CM_APPROVAL'
            // Find CM user to assign (simplified - keep current assignee for now)
          } else if (documentData.currentStep === 'CM_APPROVAL') {
            newStatus = 'APPROVED'
            newCurrentStep = 'APPROVED'
            newAssignedTo = documentData.createdBy // Return to creator
          }
        }
        break

      case 'reject':
        canPerformAction = (
          (userRole === 'Site Admin' && documentData.currentStep === 'SITE_ADMIN_REVIEW') ||
          (userRole === 'CM' && documentData.currentStep === 'CM_APPROVAL') ||
          userRole === 'Admin'
        )
        
        if (canPerformAction) {
          newStatus = 'REJECTED'
          newCurrentStep = 'REJECTED'
          newAssignedTo = documentData.createdBy // Return to creator
        }
        break

      case 'submit':
        canPerformAction = (
          documentData.createdBy === userId && 
          documentData.status === 'DRAFT'
        )
        
        if (canPerformAction) {
          // Determine next step based on RFA type
          switch (documentData.rfaType) {
            case 'RFA-SHOP':
              newStatus = 'PENDING_SITE_ADMIN'
              newCurrentStep = 'SITE_ADMIN_REVIEW'
              // Find Site Admin to assign
              break
            case 'RFA-GEN':
              newStatus = 'PENDING_CM'
              newCurrentStep = 'CM_APPROVAL'
              // Find CM to assign
              break
            case 'RFA-MAT':
              newStatus = 'PENDING_CM'
              newCurrentStep = 'CM_APPROVAL'
              // Find CM to assign
              break
          }
        }
        break

      case 'return_to_creator':
        canPerformAction = (
          (userRole === 'Site Admin' && documentData.currentStep === 'SITE_ADMIN_REVIEW') ||
          (userRole === 'CM' && documentData.currentStep === 'CM_APPROVAL') ||
          userRole === 'Admin'
        )
        
        if (canPerformAction) {
          newStatus = 'DRAFT'
          newCurrentStep = 'BIM_DRAFT'
          newAssignedTo = documentData.createdBy
        }
        break

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        )
    }

    if (!canPerformAction) {
      return NextResponse.json(
        { success: false, error: 'No permission to perform this action' },
        { status: 403 }
      )
    }

    // Update document
    const workflowEntry = {
      step: newCurrentStep,
      status: newStatus,
      userId: userId,
      userRole: userRole,
      timestamp: FieldValue.serverTimestamp(),
      action: action,
      comments: finalRemarks
    }

    const updateData = {
      status: newStatus,
      currentStep: newCurrentStep,
      assignedTo: newAssignedTo,
      workflow: FieldValue.arrayUnion(workflowEntry),
      'metadata.lastModifiedBy': userId,
      updatedAt: FieldValue.serverTimestamp()
    }

    await rfaDocRef.update(updateData)

    // Send notifications based on status change
    if (newStatus !== documentData.status) {
      try {
        console.log(`Status changed from ${documentData.status} to ${newStatus}`)
        
        // Create notification for new assignee (if changed and not the same as current user)
        if (newAssignedTo && newAssignedTo !== userId && newAssignedTo !== documentData.assignedTo) {
          await createNotification({
            type: `RFA_${action.toUpperCase()}`,
            recipientId: newAssignedTo,
            documentId: params.id,
            documentNumber: documentData.documentNumber,
            rfaType: documentData.rfaType,
            title: documentData.title,
            actionBy: userId,
            siteId: documentData.siteId,
            remarks: finalRemarks
          })
        }
      } catch (notificationError) {
        console.error('Notification failed:', notificationError)
      }
    }

    return NextResponse.json({
      success: true,
      message: `RFA ${action} completed successfully`,
      newStatus: newStatus,
      newCurrentStep: newCurrentStep,
      newAssignedTo: newAssignedTo
    })

  } catch (error) {
    console.error('Error updating RFA document:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
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