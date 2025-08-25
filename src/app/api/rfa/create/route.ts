// src/app/api/rfa/create/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { getAuth } from 'firebase-admin/auth'
import { getStorage } from 'firebase-admin/storage'
import { FieldValue } from 'firebase-admin/firestore'

interface RFACreateRequest {
  rfaType: 'RFA-SHOP' | 'RFA-GEN' | 'RFA-MAT'
  categoryId: string
  title: string
  description: string
  files: File[]
}

// Role-based permissions for RFA types
const RFA_PERMISSIONS = {
  'RFA-SHOP': ['BIM', 'Admin'],
  'RFA-GEN': ['BIM', 'Site Admin', 'Admin'],
  'RFA-MAT': ['Site Admin', 'Admin']
}

export async function POST(request: NextRequest) {
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

    // Parse form data
    const formData = await request.formData()
    const rfaType = formData.get('rfaType') as string
    const categoryId = formData.get('categoryId') as string
    const title = formData.get('title') as string
    const description = formData.get('description') as string
    const files = formData.getAll('files') as File[]

    // Validate required fields
    if (!rfaType || !categoryId || !title || !description) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Validate RFA type
    if (!['RFA-SHOP', 'RFA-GEN', 'RFA-MAT'].includes(rfaType)) {
      return NextResponse.json(
        { success: false, error: 'Invalid RFA type' },
        { status: 400 }
      )
    }

    // Check user permission for RFA type
    const allowedRoles = RFA_PERMISSIONS[rfaType as keyof typeof RFA_PERMISSIONS]
    if (!allowedRoles.includes(userRole)) {
      return NextResponse.json(
        { success: false, error: `Access denied. ${rfaType} requires: ${allowedRoles.join(', ')}` },
        { status: 403 }
      )
    }

    // Validate category exists and user has access
    let categoryData = null
    let siteId = null

    for (const site of userSites) {
      const categoryDoc = await adminDb
        .collection('sites')
        .doc(site)
        .collection('categories')
        .doc(categoryId)
        .get()

      if (categoryDoc.exists) {
        const data = categoryDoc.data()
        if (data?.active && data?.rfaTypes?.includes(rfaType)) {
          categoryData = data
          siteId = site
          break
        }
      }
    }

    if (!categoryData || !siteId) {
      return NextResponse.json(
        { success: false, error: 'Invalid category or no access' },
        { status: 400 }
      )
    }

    // Generate document number
    const documentNumber = await generateDocumentNumber(siteId, rfaType)

    // Upload files to Firebase Storage
    const uploadedFiles = []
    if (files && files.length > 0) {
      for (const file of files) {
        if (file.size > 0) {
          try {
            const uploadedFile = await uploadFileToStorage(file, siteId, documentNumber, userId)
            uploadedFiles.push(uploadedFile)
          } catch (uploadError) {
            console.error('File upload error:', uploadError)
            // Continue with other files, don't fail the entire request
          }
        }
      }
    }

    // Determine initial workflow step based on RFA type
    let currentStep = 'BIM_DRAFT'
    let status = 'DRAFT'
    let assignedTo = userId

    switch (rfaType) {
      case 'RFA-SHOP':
        if (userRole === 'BIM') {
          currentStep = 'BIM_DRAFT'
          status = 'DRAFT'
          assignedTo = userId
        } else if (userRole === 'Site Admin' || userRole === 'Admin') {
          currentStep = 'SITE_ADMIN_REVIEW'
          status = 'PENDING_SITE_ADMIN'
          // Find Site Admin to assign to (simplified - assign to creator for now)
          assignedTo = userId
        }
        break
      case 'RFA-GEN':
        currentStep = 'CREATED'
        status = 'PENDING_CM'
        // Find CM to assign to (simplified - assign to creator for now)
        assignedTo = userId
        break
      case 'RFA-MAT':
        currentStep = 'SITE_ADMIN_CREATED'
        status = 'PENDING_CM'
        assignedTo = userId
        break
    }

    // Create RFA document in Firestore
    const rfaDocRef = await adminDb.collection('rfaDocuments').add({
      siteId: siteId,
      rfaType: rfaType,
      categoryId: categoryId,
      categoryCode: categoryData.categoryCode,
      documentNumber: documentNumber,
      revisionNumber: '01',
      title: title,
      description: description,
      currentStep: currentStep,
      status: status,
      createdBy: userId,
      assignedTo: assignedTo,
      files: uploadedFiles,
      workflow: [
        {
          step: currentStep,
          status: status,
          userId: userId,
          userRole: userRole,
          timestamp: FieldValue.serverTimestamp(),
          action: 'Created',
          remarks: 'RFA document created'
        }
      ],
      metadata: {
        filesCount: uploadedFiles.length,
        totalFileSize: uploadedFiles.reduce((sum, f) => sum + (f.size || 0), 0),
        lastModifiedBy: userId
      },
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    })

    // Create notification for assigned user (if different from creator)
    if (assignedTo !== userId) {
      await createNotification({
        type: 'RFA_CREATED',
        recipientId: assignedTo,
        documentId: rfaDocRef.id,
        documentNumber: documentNumber,
        rfaType: rfaType,
        title: title,
        createdBy: userId,
        siteId: siteId
      })
    }

    return NextResponse.json({
      success: true,
      documentId: rfaDocRef.id,
      documentNumber: documentNumber,
      status: status,
      currentStep: currentStep,
      filesUploaded: uploadedFiles.length,
      message: 'RFA document created successfully'
    })

  } catch (error) {
    console.error('Error creating RFA:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Helper function to generate document number
async function generateDocumentNumber(siteId: string, rfaType: string): Promise<string> {
  const counterDoc = adminDb.collection('counters').doc(`${siteId}_${rfaType}`)
  
  try {
    const result = await adminDb.runTransaction(async (transaction) => {
      const doc = await transaction.get(counterDoc)
      
      if (!doc.exists) {
        // Create counter if doesn't exist
        const prefix = rfaType === 'RFA-SHOP' ? 'RFS' :
                      rfaType === 'RFA-GEN' ? 'RFG' : 'RFM'
        
        transaction.set(counterDoc, {
          siteId: siteId,
          documentType: rfaType,
          prefix: prefix,
          currentNumber: 1,
          lastUsed: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp()
        })
        
        return `${prefix}-001`
      } else {
        const data = doc.data()
        const newNumber = (data?.currentNumber || 0) + 1
        const prefix = data?.prefix || 'RFA'
        
        transaction.update(counterDoc, {
          currentNumber: newNumber,
          lastUsed: FieldValue.serverTimestamp()
        })
        
        return `${prefix}-${newNumber.toString().padStart(3, '0')}`
      }
    })
    
    return result
  } catch (error) {
    console.error('Error generating document number:', error)
    // Fallback to timestamp-based number
    const timestamp = Date.now().toString().slice(-6)
    const prefix = rfaType === 'RFA-SHOP' ? 'RFS' :
                  rfaType === 'RFA-GEN' ? 'RFG' : 'RFM'
    return `${prefix}-${timestamp}`
  }
}

// Helper function to upload file to Firebase Storage
async function uploadFileToStorage(
  file: File, 
  siteId: string, 
  documentNumber: string, 
  userId: string
) {
  const storage = getStorage()
  const bucket = storage.bucket()
  const fileName = `${Date.now()}_${file.name}`
  const filePath = `sites/${siteId}/rfa/${documentNumber}/${fileName}`
  
  const fileBuffer = Buffer.from(await file.arrayBuffer())
  const fileRef = bucket.file(filePath)
  
  await fileRef.save(fileBuffer, {
    metadata: {
      contentType: file.type,
      metadata: {
        originalName: file.name,
        uploadedBy: userId,
        documentNumber: documentNumber,
        siteId: siteId
      }
    }
  })
  
  // Get download URL
  const [downloadURL] = await fileRef.getSignedUrl({
    action: 'read',
    expires: '03-01-2500' // Long-term access
  })
  
  return {
    fileName: file.name,
    originalName: file.name,
    fileUrl: downloadURL,
    filePath: filePath,
    size: file.size,
    contentType: file.type,
    uploadMethod: 'direct',
    uploadedBy: userId,
    uploadedAt: FieldValue.serverTimestamp()
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
  createdBy: string
  siteId: string
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