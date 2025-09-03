import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { getAuth } from 'firebase-admin/auth'
import { APPROVER_ROLES, OBSERVER_FINISHED_ROLES, STATUSES } from '@/lib/config/workflow';

export async function GET(request: NextRequest) {
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
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      )
    }

    const userData = userDoc.data();
    const userRole = userData?.role;
    const userSites = userData?.sites || [];

    if (userSites.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No site access' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const siteId = searchParams.get('siteId')
    const rfaType = searchParams.get('rfaType')
    const status = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Build query with proper typing
    let firestoreQuery: any = adminDb.collection('rfaDocuments')
    firestoreQuery = firestoreQuery.where('siteId', 'in', userSites)

    if (APPROVER_ROLES.includes(userRole)) { // CM
      firestoreQuery = firestoreQuery.where('status', 'in', [
        STATUSES.PENDING_CM_APPROVAL,
        STATUSES.APPROVED,
        STATUSES.REJECTED,
        STATUSES.APPROVED_WITH_COMMENTS,
        STATUSES.APPROVED_REVISION_REQUIRED,
      ]);
    } else if (OBSERVER_FINISHED_ROLES.includes(userRole)) { // SE
      firestoreQuery = firestoreQuery.where('status', 'in', [
        STATUSES.APPROVED,
        STATUSES.REJECTED,
        STATUSES.APPROVED_WITH_COMMENTS,
        STATUSES.APPROVED_REVISION_REQUIRED,
      ]);
    }
        
    // Filter by site (user must have access)
    if (siteId && siteId !== 'ALL') { // เพิ่มเงื่อนไขเช็ค 'ALL'
      if (!userSites.includes(siteId)) {
        return NextResponse.json(
          { success: false, error: 'No access to specified site' },
          { status: 403 }
        )
      }
      firestoreQuery = firestoreQuery.where('siteId', '==', siteId)
    } else {
      // Filter by user's sites
      firestoreQuery = firestoreQuery.where('siteId', 'in', userSites)
    }

    if (rfaType && rfaType !== 'ALL') { // เพิ่มเงื่อนไขเช็ค 'ALL'
        firestoreQuery = firestoreQuery.where('rfaType', '==', rfaType)
    }

    if (status && status !== 'ALL') { // เพิ่มเงื่อนไขเช็ค 'ALL'
      const validStatuses = ['DRAFT', 'PENDING_SITE_ADMIN', 'PENDING_CM', 'APPROVED', 'REJECTED']
      if (validStatuses.includes(status)) {
        firestoreQuery = firestoreQuery.where('status', '==', status)
      }
    }

    // Add ordering and pagination
    firestoreQuery = firestoreQuery
      .orderBy('updatedAt', 'desc')
      .limit(limit)
      .offset(offset)

    const documentsSnapshot = await firestoreQuery.get()
    const documents: any[] = []

    // Process each document
    for (const doc of documentsSnapshot.docs) {
      const documentData = doc.data()
      
      // Get site information
      let siteInfo: any = { id: documentData.siteId, name: 'Unknown Site' }
      try {
        const siteDoc = await adminDb.collection('sites').doc(documentData.siteId).get()
        if (siteDoc.exists) {
          const siteData = siteDoc.data()
          siteInfo = {
            id: siteDoc.id,
            name: siteData?.name || 'Unknown Site',
            description: siteData?.description
          }
        }
      } catch (error) {
        console.error('Error fetching site:', error)
      }

      // Get category information
      let categoryInfo: any = { 
        id: documentData.categoryId || '', 
        categoryCode: 'Unknown', 
        categoryName: 'Unknown Category',
        rfaTypes: []
      }

      try {
        if (documentData.categoryId) {
          const categoryDoc = await adminDb
            .collection('sites')
            .doc(documentData.siteId)
            .collection('categories')
            .doc(documentData.categoryId)
            .get()
          
          if (categoryDoc.exists) {
            const catData = categoryDoc.data()
            categoryInfo = {
              id: categoryDoc.id,
              categoryCode: catData?.categoryCode || 'Unknown',
              categoryName: catData?.categoryName || 'Unknown Category',
              rfaTypes: catData?.rfaTypes || []
            }
          }
        }
      } catch (error) {
        console.error('Error fetching category:', error)
      }

      // Get creator information
      let creatorInfo: any = { email: 'Unknown', role: 'Unknown' }
      try {
        if (documentData.createdBy) {
          const creatorDoc = await adminDb.collection('users').doc(documentData.createdBy).get()
          if (creatorDoc.exists) {
            const creatorData = creatorDoc.data()
            creatorInfo = {
              email: creatorData?.email || 'Unknown',
              role: creatorData?.role || 'Unknown'
            }
          }
        }
      } catch (error) {
        console.error('Error fetching creator:', error)
      }

      // Get assigned user information
      let assignedUserInfo: any = null
      if (documentData.assignedTo) {
        try {
          const assignedDoc = await adminDb.collection('users').doc(documentData.assignedTo).get()
          if (assignedDoc.exists) {
            const assignedData = assignedDoc.data()
            assignedUserInfo = {
              email: assignedData?.email || 'Unknown',
              role: assignedData?.role || 'Unknown'
            }
          }
        } catch (error) {
          console.error('Error fetching assigned user:', error)
        }
      }

      // Role-based filtering for complex permissions
      let shouldInclude = true
      // ส่วนนี้ยังคงไว้เพื่อให้ User แต่ละ Role เห็นเอกสารตามสิทธิ์ของตัวเอง
      switch (userRole) {
        case 'BIM':
          shouldInclude = documentData.createdBy === userId || ['APPROVED', 'REJECTED'].includes(documentData.status)
          break
        case 'Site Admin':
          shouldInclude = documentData.assignedTo === userId || documentData.createdBy === userId || ['SITE_ADMIN_REVIEW', 'PENDING_SITE_ADMIN'].includes(documentData.currentStep) || documentData.rfaType === 'RFA-MAT'
          break
        case 'CM':
          shouldInclude = documentData.assignedTo === userId || ['CM_APPROVAL', 'PENDING_CM'].includes(documentData.currentStep) || ['APPROVED', 'REJECTED'].includes(documentData.status)
          break
        case 'Admin':
          shouldInclude = true
          break
      }

      if (shouldInclude) {
        // Add document to results
        documents.push({
          id: doc.id,
          documentNumber: documentData.documentNumber || '',
          rfaType: documentData.rfaType || '',
          title: documentData.title || '',
          description: documentData.description || '',
          status: documentData.status || 'DRAFT',
          currentStep: documentData.currentStep || '',
          revisionNumber: documentData.revisionNumber,
          site: siteInfo,
          category: categoryInfo,
          createdBy: documentData.createdBy || '',
          createdByInfo: creatorInfo,
          assignedTo: documentData.assignedTo,
          assignedUserInfo: assignedUserInfo,
          files: documentData.files?.map((file: any) => ({
            fileName: file.fileName || '',
            fileUrl: file.fileUrl || '',
            filePath: file.filePath || '',
            size: file.size || 0,
            contentType: file.contentType || '',
            uploadedAt: file.uploadedAt || '',
            uploadedBy: file.uploadedBy || ''
          })) || [],
          filesCount: documentData.files?.length || 0,
          totalFileSize: documentData.metadata?.totalFileSize || 0,
          createdAt: documentData.createdAt,
          updatedAt: documentData.updatedAt,
          workflow: documentData.workflow?.map((step: any) => ({
            step: step.action || step.step || '',
            status: step.status || '',
            userId: step.userId || '',
            userRole: step.role || step.userRole || '',
            timestamp: step.timestamp || '',
            comments: step.comments || ''
          })) || [],
          permissions: {
            canView: true,
            canEdit: documentData.createdBy === userId && ['DRAFT', 'PENDING_SITE_ADMIN'].includes(documentData.status),
            canApprove: (
              (userRole === 'Site Admin' && documentData.currentStep === 'SITE_ADMIN_REVIEW') ||
              (userRole === 'CM' && documentData.currentStep === 'CM_APPROVAL')
            ),
            canReject: (
              (userRole === 'Site Admin' && documentData.currentStep === 'SITE_ADMIN_REVIEW') ||
              (userRole === 'CM' && documentData.currentStep === 'CM_APPROVAL')
            ),
            canForward: (
              (userRole === 'Site Admin' && documentData.currentStep === 'SITE_ADMIN_REVIEW') ||
              userRole === 'Admin'
            ),
            canAddFiles: documentData.createdBy === userId && 
                         ['DRAFT', 'PENDING_SITE_ADMIN'].includes(documentData.status),
            canDownloadFiles: true
          },
          currentUser: {
            id: userId,
            role: userRole,
            isCreator: documentData.createdBy === userId,
            isAssigned: documentData.assignedTo === userId
          }
        })
      }
    }

    // Get total count for pagination (simplified)
    const totalCount = documents.length

    return NextResponse.json({
      success: true,
      documents: documents,
      pagination: {
        total: totalCount,
        limit: limit,
        offset: offset,
        hasMore: totalCount === limit
      },
      filters: {
        siteId,
        rfaType,
        status,
        userRole,
        userSites
      }
    })

  } catch (error) {
    console.error('Error fetching RFA documents:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}