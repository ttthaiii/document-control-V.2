// src/app/api/rfa/[id]/route.ts (ฉบับแก้ไขสมบูรณ์)
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminBucket, adminAuth } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { ROLES, CREATOR_ROLES, REVIEWER_ROLES, APPROVER_ROLES, STATUSES } from '@/lib/config/workflow'; // 👈 Import
import { RFAFile } from '@/types/rfa';

export const dynamic = 'force-dynamic';

// --- GET Function (ฉบับแก้ไข) ---
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // --- ส่วนยืนยันตัวตน (Authentication) ---
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: 'Missing or invalid authorization header' }, { status: 401 });
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

    // --- ส่วนดึงข้อมูล RFA หลัก ---
    const rfaDoc = await adminDb.collection('rfaDocuments').doc(params.id).get();
    if (!rfaDoc.exists) {
      return NextResponse.json({ success: false, error: 'RFA document not found' }, { status: 404 });
    }
    const rfaData = rfaDoc.data()!;

    if (!userSites.includes(rfaData.siteId)) {
      return NextResponse.json({ success: false, error: 'Access denied to this site' }, { status: 403 });
    }
    
    // --- ดึงข้อมูล Site Info เพิ่มเติม ---
    let siteInfo: any = { id: rfaData.siteId, name: 'N/A' };
    if (rfaData.siteId) {
      const siteDoc = await adminDb.collection('sites').doc(rfaData.siteId).get();
      if (siteDoc.exists) {
        siteInfo = { 
          id: siteDoc.id, 
          name: siteDoc.data()?.name || 'Unknown Site',
          cmSystemType: siteDoc.data()?.cmSystemType || 'INTERNAL' // เพิ่ม cmSystemType
        };
      }
    }
    
    // --- ดึงข้อมูล Creator Role ---
    const creatorRole = rfaData.workflow?.[0]?.role || 'BIM';

    const categoryInfo = { 
      id: rfaData.categoryId, 
      categoryCode: rfaData.taskData?.taskCategory || rfaData.categoryId || 'N/A' 
    };
    
    // Logic การกำหนด Permissions
    const permissions = {
      canView: true,
      canEdit: CREATOR_ROLES.includes(userData.role) && rfaData.status === STATUSES.REVISION_REQUIRED,
      canSendToCm: REVIEWER_ROLES.includes(userData.role) && rfaData.status === STATUSES.PENDING_REVIEW,
      canRequestRevision: REVIEWER_ROLES.includes(userData.role) && rfaData.status === STATUSES.PENDING_REVIEW,
      canApprove: APPROVER_ROLES.includes(userData.role) && rfaData.status === STATUSES.PENDING_CM_APPROVAL,
      canReject: APPROVER_ROLES.includes(userData.role) && rfaData.status === STATUSES.PENDING_CM_APPROVAL,
      canDownloadFiles: true
    };
    
    const responseData = { 
        id: rfaDoc.id, 
        ...rfaData, 
        site: siteInfo, 
        category: categoryInfo, 
        permissions,
        creatorRole: creatorRole, // ส่ง creatorRole ไปด้วย
    };

    return NextResponse.json({ success: true, document: responseData });

  } catch (error) {
    console.error('Error fetching RFA document:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// --- PUT Function (ฉบับแก้ไขที่เก็บไฟล์ทั้งหมด) ---
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
    try {
        // --- Authentication (เหมือนเดิม) ---
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await adminAuth.verifyIdToken(token);
        const userId = decodedToken.uid;
    
        const userDoc = await adminDb.collection('users').doc(userId).get();
        if (!userDoc.exists) return NextResponse.json({ error: 'User not found' }, { status: 404 });
        
        const userData = userDoc.data()!;
        const userRole = userData.role;
        const body = await request.json();
        const { action, comments, newFiles } = body; 

        if (!action) return NextResponse.json({ error: 'Action is required' }, { status: 400 });
        
        const rfaDocRef = adminDb.collection('rfaDocuments').doc(params.id);
        const rfaDoc = await rfaDocRef.get();
        if (!rfaDoc.exists) return NextResponse.json({ error: 'RFA document not found' }, { status: 404 });
        
        const docData = rfaDoc.data()!;
        const siteDoc = await adminDb.collection('sites').doc(docData.siteId).get();
        const cmSystemType = siteDoc.data()?.cmSystemType || 'INTERNAL';

        let newStatus = docData.status;
        let canPerformAction = false;
        
        // ✅ เปลี่ยนจากการเช็ค string ตรงๆ มาเป็นการใช้ Role Group
        if (REVIEWER_ROLES.includes(userRole)) {
            if (docData.status === STATUSES.PENDING_REVIEW && (action === 'SEND_TO_CM' || action === 'REQUEST_REVISION')) {
                canPerformAction = true;
            }
            else if (docData.status === STATUSES.PENDING_CM_APPROVAL && cmSystemType === 'EXTERNAL' && ['APPROVE', 'APPROVE_WITH_COMMENTS', 'APPROVE_REVISION_REQUIRED', 'REJECT'].includes(action)) {
                canPerformAction = true;
            }
            else if (docData.status === STATUSES.PENDING_FINAL_APPROVAL && cmSystemType === 'INTERNAL' && ['APPROVE', 'APPROVE_WITH_COMMENTS', 'APPROVE_REVISION_REQUIRED', 'REJECT'].includes(action)) {
                canPerformAction = true;
            }
        }
        else if (APPROVER_ROLES.includes(userRole) && docData.status === STATUSES.PENDING_CM_APPROVAL && cmSystemType === 'INTERNAL') {
            if (['APPROVE', 'APPROVE_WITH_COMMENTS', 'REJECT'].includes(action)) {
                canPerformAction = true;
            }
        }
        else if (CREATOR_ROLES.includes(userRole) && docData.createdBy === userId) {
            if (docData.status === STATUSES.REVISION_REQUIRED && action === 'SUBMIT_REVISION') {
                canPerformAction = true;
            }
        }

        if (!canPerformAction) {
          return NextResponse.json({ success: false, error: 'Permission denied for this action or invalid document status.' }, { status: 403 });
        }
        
        // --- 2. กำหนดสถานะใหม่ (New Status) ---
        switch(action) {
            case 'SEND_TO_CM': newStatus = STATUSES.PENDING_CM_APPROVAL; break;
            case 'REQUEST_REVISION': newStatus = STATUSES.REVISION_REQUIRED; break;
            case 'SUBMIT_REVISION': newStatus = STATUSES.PENDING_REVIEW; break;
            case 'REJECT': newStatus = STATUSES.REJECTED; break;
            case 'APPROVE_REVISION_REQUIRED': newStatus = STATUSES.APPROVED_REVISION_REQUIRED; break;
            
            case 'APPROVE':
                if (userRole === 'CM' && cmSystemType === 'INTERNAL') {
                    newStatus = STATUSES.PENDING_FINAL_APPROVAL;
                } else {
                    newStatus = STATUSES.APPROVED;
                }
                break;
            case 'APPROVE_WITH_COMMENTS':
                if (userRole === 'CM' && cmSystemType === 'INTERNAL') {
                    newStatus = STATUSES.PENDING_FINAL_APPROVAL;
                } else {
                    newStatus = STATUSES.APPROVED_WITH_COMMENTS;
                }
                break;
        }
        
        // ... (ส่วนจัดการไฟล์และบันทึกข้อมูลที่เหลือเหมือนเดิมทุกประการ) ...
        let finalDocFiles: RFAFile[] = docData.files || [];
        let workflowFiles: RFAFile[] = [];

        if (newFiles && Array.isArray(newFiles) && newFiles.length > 0) {
            const cdnUrlBase = "https://ttsdoc-cdn.ttthaiii30.workers.dev";
            const movedFiles: RFAFile[] = [];

            for (const tempFile of newFiles) {
                const sourcePath = tempFile.filePath;
                if (!sourcePath || !sourcePath.startsWith(`temp/${userId}/`)) continue;
                const destinationPath = `sites/${docData.siteId}/rfa/${docData.documentNumber}/${Date.now()}_${tempFile.fileName}`;
                await adminBucket.file(sourcePath).move(destinationPath);
                
                movedFiles.push({
                    fileName: tempFile.fileName, fileUrl: `${cdnUrlBase}/${destinationPath}`,
                    filePath: destinationPath, size: tempFile.size, fileSize: tempFile.size,
                    contentType: tempFile.contentType, uploadedAt: new Date().toISOString(), uploadedBy: userId,
                });
            }
            
            workflowFiles = movedFiles;
            finalDocFiles.push(...movedFiles);
        }
    
        const workflowEntry = {
          action, status: newStatus, userId, userName: userData.email, role: userRole,
          timestamp: new Date().toISOString(), comments: comments || '',
          files: workflowFiles,
        };
    
        await rfaDocRef.update({
          status: newStatus,
          currentStep: newStatus,
          files: finalDocFiles,
          workflow: FieldValue.arrayUnion(workflowEntry),
          updatedAt: FieldValue.serverTimestamp(),
        });
    
        return NextResponse.json({ success: true, message: `Action [${action}] completed successfully`, newStatus });
    
      } catch (error) {
        console.error('Error updating RFA document:', error);
        const errorMessage = error instanceof Error ? error.message : 'Internal server error';
        return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
      }
}
