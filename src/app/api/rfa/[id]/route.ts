// src/app/api/rfa/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { adminDb, adminBucket } from '@/lib/firebase/admin'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue } from 'firebase-admin/firestore'
import { CREATOR_ROLES, REVIEWER_ROLES, APPROVER_ROLES, STATUSES } from '@/lib/config/workflow';

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
    
    // ✅ [KEY CHANGE] Construct site and category info to ensure consistent data shape
    const siteInfo = { id: rfaData.siteId, name: rfaData.siteName || 'N/A' };
    const categoryInfo = { id: rfaData.categoryId, categoryCode: rfaData.taskData?.taskCategory || 'N/A' };

    const permissions = {
      canView: true,
      canEdit: CREATOR_ROLES.includes(userRole) && rfaData.status === STATUSES.REVISION_REQUIRED,
      canSendToCm: REVIEWER_ROLES.includes(userRole) && rfaData.status === STATUSES.PENDING_REVIEW,
      canRequestRevision: REVIEWER_ROLES.includes(userRole) && rfaData.status === STATUSES.PENDING_REVIEW,
      canApprove: APPROVER_ROLES.includes(userRole) && rfaData.status === STATUSES.PENDING_CM_APPROVAL,
      canReject: APPROVER_ROLES.includes(userRole) && rfaData.status === STATUSES.PENDING_CM_APPROVAL,
      canDownloadFiles: true
    }

    const responseData = {
      id: rfaDoc.id,
      ...rfaData,
      site: siteInfo,       // Add constructed site object
      category: categoryInfo, // Add constructed category object
      permissions
    };

    return NextResponse.json({ success: true, document: responseData })

  } catch (error) {
    console.error('Error fetching RFA document:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}


// PUT - Update RFA document
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
    // This function remains the same as the last version I provided.
    // You can copy the PUT function from the previous response.
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await getAuth().verifyIdToken(token);
        const userId = decodedToken.uid;
    
        const userDoc = await adminDb.collection('users').doc(userId).get();
        if (!userDoc.exists) return NextResponse.json({ error: 'User not found' }, { status: 404 });
        
        const userData = userDoc.data()!;
        const userRole = userData.role;
    
        const body = await request.json();
        const { action, comments, newFiles } = body; 
    
        if (!action) return NextResponse.json({ error: 'Action is required' }, { status: 400 });
    
        if (!newFiles || !Array.isArray(newFiles) || newFiles.length === 0) {
            return NextResponse.json({ error: 'Attaching new files is required for this action' }, { status: 400 });
        }
    
        const rfaDocRef = adminDb.collection('rfaDocuments').doc(params.id);
        const rfaDoc = await rfaDocRef.get();
        if (!rfaDoc.exists) return NextResponse.json({ error: 'RFA document not found' }, { status: 404 });
        
        const docData = rfaDoc.data()!;
        let newStatus = docData.status;
        let newAssignedTo = docData.assignedTo;
        let canPerformAction = false;
    
        // Workflow Logic
        switch (action) {
          case 'SEND_TO_CM':
            canPerformAction = REVIEWER_ROLES.includes(userRole) && docData.status === STATUSES.PENDING_REVIEW;
            if (canPerformAction) {
              newStatus = STATUSES.PENDING_CM_APPROVAL;
              newAssignedTo = null; 
            }
            break;
    
          case 'REQUEST_REVISION':
            canPerformAction = (REVIEWER_ROLES.includes(userRole) && docData.status === STATUSES.PENDING_REVIEW) || 
                               (APPROVER_ROLES.includes(userRole) && docData.status === STATUSES.PENDING_CM_APPROVAL);
            if (canPerformAction) {
              newStatus = STATUSES.REVISION_REQUIRED;
              newAssignedTo = null; 
            }
            break;
    
          case 'SUBMIT_REVISION':
            canPerformAction = CREATOR_ROLES.includes(userRole) && docData.status === STATUSES.REVISION_REQUIRED;
            if (canPerformAction) {
                newStatus = STATUSES.PENDING_REVIEW;
                newAssignedTo = null;
            }
            break;
            
          case 'APPROVE':
            canPerformAction = APPROVER_ROLES.includes(userRole) && docData.status === STATUSES.PENDING_CM_APPROVAL;
            if (canPerformAction) {
                newStatus = STATUSES.APPROVED;
                newAssignedTo = null;
            }
            break;
    
          case 'REJECT':
            canPerformAction = APPROVER_ROLES.includes(userRole) && docData.status === STATUSES.PENDING_CM_APPROVAL;
            if (canPerformAction) {
                newStatus = STATUSES.REJECTED;
                newAssignedTo = null;
            }
            break;
          
          case 'APPROVE_WITH_COMMENTS':
            canPerformAction = APPROVER_ROLES.includes(userRole) && docData.status === STATUSES.PENDING_CM_APPROVAL;
            if (canPerformAction) {
                newStatus = STATUSES.APPROVED_WITH_COMMENTS;
                newAssignedTo = null;
            }
            break;
            
          case 'APPROVE_REVISION_REQUIRED':
            canPerformAction = APPROVER_ROLES.includes(userRole) && docData.status === STATUSES.PENDING_CM_APPROVAL;
            if (canPerformAction) {
                newStatus = STATUSES.APPROVED_REVISION_REQUIRED;
                newAssignedTo = null;
            }
            break;
    
          default:
            return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
        }
    
        if (!canPerformAction) {
          return NextResponse.json({ success: false, error: 'Permission denied for this action' }, { status: 403 });
        }
    
        const finalFilesData = [];
        const cdnUrlBase = "https://ttsdoc-cdn.ttthaiii30.workers.dev";
    
        for (const tempFile of newFiles) {
            const sourcePath = tempFile.filePath;
            if (!sourcePath || !sourcePath.startsWith(`temp/${userId}/`)) {
                console.warn(`Skipping invalid file path: ${sourcePath}`);
                continue;
            }
            const originalName = tempFile.fileName;
            const timestamp = Date.now();
            const destinationPath = `sites/${docData.siteId}/rfa/${docData.documentNumber}/${timestamp}_${originalName}`;
            await adminBucket.file(sourcePath).move(destinationPath);
            finalFilesData.push({
                ...tempFile,
                fileUrl: `${cdnUrlBase}/${destinationPath}`,
                filePath: destinationPath,
                uploadedAt: new Date().toISOString(),
                uploadedBy: userId,
            });
        }
    
        const workflowEntry = {
          action,
          status: newStatus,
          userId,
          userName: userData.email,
          role: userRole,
          timestamp: new Date().toISOString(),
          comments: comments || '',
          files: finalFilesData,
        };
    
        await rfaDocRef.update({
          status: newStatus,
          currentStep: newStatus,
          assignedTo: newAssignedTo,
          files: finalFilesData,
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