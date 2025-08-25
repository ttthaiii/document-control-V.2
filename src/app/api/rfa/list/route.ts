// src/app/api/rfa/list/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { getAuth } from 'firebase-admin/auth'

export async function GET(request: NextRequest) {
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
    
    // Verify Firebase token
    const decodedToken = await getAuth().verifyIdToken(token)
    const userId = decodedToken.uid

    // Get user data from Firestore
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

    if (userSites.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No site access' },
        { status: 403 }
      )
    }

    // Get query parameters
    const { searchParams } = new URL(request.url)
    const siteId = searchParams.get('siteId')
    const rfaType = searchParams.get('rfaType')
    const status = searchParams.get('status')
    const assignedToMe = searchParams.get('assignedToMe') === 'true'
    const createdByMe = searchParams.get('createdByMe') === 'true'
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Build query - Fix TypeScript Query type issue
    const baseQuery = adminDb.collection('rfaDocuments')
    let firestoreQuery: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = baseQuery

    // Filter by site (user must have access)
    if (siteId) {
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

    // Filter by RFA type
    if (rfaType && ['RFA-SHOP', 'RFA-GEN', 'RFA-MAT'].includes(rfaType)) {
      firestoreQuery = firestoreQuery.where('rfaType', '==', rfaType)
    }

    // Filter by status
    if (status) {
      const validStatuses = ['DRAFT', 'PENDING_SITE_ADMIN', 'PENDING_CM', 'APPROVED', 'REJECTED']
      if (validStatuses.includes(status)) {
        firestoreQuery = firestoreQuery.where('status', '==', status)
      }
    }

    // Filter by assignment or creation
    if (assignedToMe) {
      firestoreQuery = firestoreQuery.where('assignedTo', '==', userId)
    } else if (createdByMe) {
      firestoreQuery = firestoreQuery.where('createdBy', '==', userId)
    } else {
      // Show documents user has access to based on role and current step
      // This is a simplified version - you might want more complex logic
      switch (userRole) {
        case 'BIM':
          // BIM can see their own documents and approved documents
          firestoreQuery = firestoreQuery.where('createdBy', '==', userId)
          break
        case 'Site Admin':
          // Site Admin can see documents assigned to them or in their workflow
          // For simplicity, we'll fetch all and filter later
          break
        case 'CM':
          // CM can see documents that reach CM approval stage
          // For simplicity, we'll fetch all and filter later
          break
        case 'Admin':
          // Admin can see all documents (no additional filter)
          break
      }
    }

    // Order by creation date (newest first)
    firestoreQuery = firestoreQuery.orderBy('createdAt', 'desc')

    // Apply limit
    if (limit && limit > 0) {
      firestoreQuery = firestoreQuery.limit(Math.min(limit, 100)) // Max 100 per request
    }

    // Execute query
    const snapshot = await firestoreQuery.get()
    const documents: any[] = []

    // Process documents
    for (const doc of snapshot.docs) {
      const documentData = doc.data()
      
      // Additional role-based filtering
      let canView = false
      
      switch (userRole) {
        case 'BIM':
          canView = documentData.createdBy === userId || 
                   ['APPROVED', 'REJECTED'].includes(documentData.status)
          break
        case 'Site Admin':
          canView = documentData.assignedTo === userId ||
                   documentData.createdBy === userId ||
                   ['SITE_ADMIN_REVIEW', 'PENDING_SITE_ADMIN'].includes(documentData.currentStep) ||
                   documentData.rfaType === 'RFA-MAT'
          break
        case 'CM':
          canView = documentData.assignedTo === userId ||
                   ['CM_APPROVAL', 'PENDING_CM'].includes(documentData.currentStep) ||
                   ['APPROVED', 'REJECTED'].includes(documentData.status)
          break
        case 'Admin':
          canView = true
          break
        default:
          canView = false
      }

      if (canView) {
        // Get category information
        let categoryInfo = null
        try {
          const categoryDoc = await adminDb
            .collection('sites')
            .doc(documentData.siteId)
            .collection('categories')
            .doc(documentData.categoryId)
            .get()
          
          if (categoryDoc.exists) {
            const catData = categoryDoc.data()
            categoryInfo = {
              categoryCode: catData?.categoryCode,
              categoryName: catData?.categoryName
            }
          }
        } catch (error) {
          console.error('Error fetching category:', error)
        }

        // Get creator information
        let creatorInfo = null
        try {
          const creatorDoc = await adminDb.collection('users').doc(documentData.createdBy).get()
          if (creatorDoc.exists) {
            const creatorData = creatorDoc.data()
            creatorInfo = {
              email: creatorData?.email,
              role: creatorData?.role
            }
          }
        } catch (error) {
          console.error('Error fetching creator:', error)
        }

        // Get assigned user information
        let assignedUserInfo = null
        if (documentData.assignedTo && documentData.assignedTo !== documentData.createdBy) {
          try {
            const assignedDoc = await adminDb.collection('users').doc(documentData.assignedTo).get()
            if (assignedDoc.exists) {
              const assignedData = assignedDoc.data()
              assignedUserInfo = {
                email: assignedData?.email,
                role: assignedData?.role
              }
            }
          } catch (error) {
            console.error('Error fetching assigned user:', error)
          }
        }

        documents.push({
          id: doc.id,
          documentNumber: documentData.documentNumber,
          rfaType: documentData.rfaType,
          title: documentData.title,
          description: documentData.description,
          status: documentData.status,
          currentStep: documentData.currentStep,
          revisionNumber: documentData.revisionNumber,
          category: categoryInfo,
          createdBy: documentData.createdBy,
          createdByInfo: creatorInfo,
          assignedTo: documentData.assignedTo,
          assignedUserInfo: assignedUserInfo,
          filesCount: documentData.files?.length || 0,
          totalFileSize: documentData.metadata?.totalFileSize || 0,
          createdAt: documentData.createdAt,
          updatedAt: documentData.updatedAt,
          // Include workflow for detailed view
          workflow: documentData.workflow || [],
          // User permissions for this document
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
            )
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
        hasMore: totalCount === limit // Simplified check
      },
      filters: {
        siteId,
        rfaType,
        status,
        assignedToMe,
        createdByMe,
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