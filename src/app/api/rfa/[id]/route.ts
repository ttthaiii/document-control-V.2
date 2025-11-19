// src/app/api/rfa/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminBucket, adminAuth } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { ROLES, CREATOR_ROLES, REVIEWER_ROLES, APPROVER_ROLES, STATUSES } from '@/lib/config/workflow';
import { RFAFile } from '@/types/rfa';
// 1. ✅ Import ฟังก์ชันส่งแจ้งเตือน
import { sendPushNotification } from '@/lib/utils/push-notification';

export const dynamic = 'force-dynamic';

// --- GET Function (คงเดิม) ---
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
    // ... (เนื้อหา GET เหมือนเดิมทุกประการ ไม่ต้องแก้) ...
    try {
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

        const rfaDoc = await adminDb.collection('rfaDocuments').doc(params.id).get();
        if (!rfaDoc.exists) {
            return NextResponse.json({ success: false, error: 'RFA document not found' }, { status: 404 });
        }
        const rfaData = rfaDoc.data()!;

        if (!userSites.includes(rfaData.siteId)) {
            return NextResponse.json({ success: false, error: 'Access denied to this site' }, { status: 403 });
        }
        
        let siteInfo: any = { id: rfaData.siteId, name: 'N/A' };
        if (rfaData.siteId) {
            const siteDoc = await adminDb.collection('sites').doc(rfaData.siteId).get();
            if (siteDoc.exists) {
                siteInfo = { 
                    id: siteDoc.id, 
                    name: siteDoc.data()?.name || 'Unknown Site',
                    cmSystemType: siteDoc.data()?.cmSystemType || 'INTERNAL'
                };
            }
        }
        
        const creatorRole = rfaData.workflow?.[0]?.role || 'BIM';

        const categoryInfo = { 
            id: rfaData.categoryId, 
            categoryCode: rfaData.taskData?.taskCategory || rfaData.categoryId || 'N/A' 
        };
        
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
            creatorRole: creatorRole,
        };

        return NextResponse.json({ success: true, document: responseData });

    } catch (error) {
        console.error('Error fetching RFA document:', error);
        return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
}

// --- PUT Function (อัปเดต) ---
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
    try {
        // --- Authentication ---
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
        const { action, comments, newFiles, documentNumber } = body;

        if (!action) return NextResponse.json({ error: 'Action is required' }, { status: 400 });
        
        const rfaDocRef = adminDb.collection('rfaDocuments').doc(params.id);
        const rfaDoc = await rfaDocRef.get();
        if (!rfaDoc.exists) return NextResponse.json({ error: 'RFA document not found' }, { status: 404 });
        
        const docData = rfaDoc.data()!;
        const siteDoc = await adminDb.collection('sites').doc(docData.siteId).get();
        const cmSystemType = siteDoc.data()?.cmSystemType || 'INTERNAL';
        // 2. ✅ เตรียมตัวแปรชื่อโครงการและชื่อเรื่อง
        const siteName = siteDoc.data()?.name || 'โครงการทั่วไป';
        const documentTitle = docData?.title || 'ไม่ระบุชื่อเรื่อง';

        let newStatus = docData.status;
        let canPerformAction = false;
        
        // Check Permission Logic (เหมือนเดิม)
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
        
        // Update Status Logic (เหมือนเดิม)
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
        
        // Handle Files (เหมือนเดิม)
        let finalDocFiles: RFAFile[] = docData.files || [];
        let workflowFiles: RFAFile[] = [];

        if (newFiles && Array.isArray(newFiles) && newFiles.length > 0) {
            const cdnUrlBase = "https://ttsdoc-cdn.ttthaiii30.workers.dev";
            const movedFiles: RFAFile[] = [];

            for (const tempFile of newFiles) {
                const sourcePath = tempFile.filePath;
                if (!sourcePath || !sourcePath.startsWith(`temp/${userId}/`)) continue;
                
                const docNumForPath = documentNumber || docData.documentNumber || docData.runningNumber;
                const destinationPath = `sites/${docData.siteId}/rfa/${docNumForPath}/${Date.now()}_${tempFile.fileName}`;
                
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
    
        // Construct Updates
        const updates: { [key: string]: any } = {
          status: newStatus,
          currentStep: newStatus,
          workflow: FieldValue.arrayUnion(workflowEntry),
          updatedAt: FieldValue.serverTimestamp(),
        };

        if (documentNumber) {
          updates.documentNumber = documentNumber;
        }
        if (workflowFiles.length > 0) {
            updates.files = finalDocFiles;
        }
        
        // Save to DB
        await rfaDocRef.update(updates);

        // 3. ส่วนส่งแจ้งเตือน (Notification Logic)
        // ตรวจสอบว่าเป็นสถานะที่ควรแจ้งเตือนหรือไม่
        const notifyStatuses = [
            STATUSES.APPROVED, 
            STATUSES.APPROVED_WITH_COMMENTS, 
            STATUSES.APPROVED_REVISION_REQUIRED
        ];
        
        if (notifyStatuses.includes(newStatus)) {
             
             // -------------------------------------------------------
             // 🔍 ส่วนที่แก้ไข: ค้นหา User ที่เป็น SE และ FM ในโครงการนี้
             // -------------------------------------------------------
             const targetUserIds: string[] = [];
             
             try {
                 // 1. ดึง Users ที่มี siteId ตรงกับเอกสาร และสถานะ Active
                 // หมายเหตุ: เราดึงคนใน Site มาก่อน แล้วค่อยกรอง Role ใน Code (เพื่อเลี่ยงปัญหา Index ของ Firestore)
                 const usersSnapshot = await adminDb.collection('users')
                    .where('sites', 'array-contains', docData.siteId)
                    .where('status', '==', 'ACTIVE')
                    .get();

                 // 2. กรองเอาเฉพาะ SE และ FM
                 const targetRoles = ['SE', 'FM'];
                 
                 usersSnapshot.forEach(doc => {
                     const userData = doc.data();
                     if (targetRoles.includes(userData.role)) {
                         targetUserIds.push(doc.id);
                     }
                 });
                 
                 console.log(`🎯 Found ${targetUserIds.length} targets (SE/FM) for notification in site ${docData.siteId}`);

             } catch (err) {
                 console.error('Error fetching target users:', err);
             }
             // -------------------------------------------------------


             // ถ้าเจอคนรับ ให้ส่งแจ้งเตือน
             if (targetUserIds.length > 0) {
                 const docNum = documentNumber || docData.documentNumber || 'RFA-xxxx';
                 
                 // สร้างข้อความ
                 let notiTitle = `✅ อนุมัติแล้ว: ${docNum}`;
                 let notiBody = `โครงการ: ${siteName}\nเอกสารเรื่อง "${documentTitle}" ได้รับการอนุมัติแล้ว พร้อมใช้งาน`;
    
                 if (newStatus === STATUSES.APPROVED) {
                     notiBody = `โครงการ: ${siteName}\nเอกสารเรื่อง "${documentTitle}" ได้รับการอนุมัติ (Approved)`;
                 } 
                 else if (newStatus === STATUSES.APPROVED_WITH_COMMENTS) {
                     notiTitle = `⚠️ อนุมัติตามคอมเมนต์: ${docNum}`;
                     notiBody = `โครงการ: ${siteName}\nเอกสารเรื่อง "${documentTitle}" อนุมัติโดยมีเงื่อนไข (Approved with comments)`;
                 } 
                 else if (newStatus === STATUSES.APPROVED_REVISION_REQUIRED) {
                     notiTitle = `⚠️ อนุมัติ (ต้องแก้ไข): ${docNum}`;
                     notiBody = `โครงการ: ${siteName}\nเอกสารเรื่อง "${documentTitle}" อนุมัติให้ดำเนินการได้ แต่ต้องแก้ไขเอกสารตามแนบ (Approved & Revise)`;
                 }
    
                 await sendPushNotification(targetUserIds, {
                    title: notiTitle,
                    body: notiBody,
                    url: `/dashboard/rfa/${params.id}`,
                 });
             } else {
                 console.log('⚠️ No SE or FM found in this site to notify.');
             }
        }

        return NextResponse.json({ success: true, message: `Action [${action}] completed successfully`, newStatus });
    
      } catch (error) {
        console.error('Error updating RFA document:', error);
        const errorMessage = error instanceof Error ? error.message : 'Internal server error';
        return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
      }
}