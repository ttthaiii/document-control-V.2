import { NextRequest, NextResponse } from 'next/server';
// 1. เพิ่ม adminBucket
import { adminDb, adminAuth, adminBucket } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
// 2. เพิ่ม STATUS_LABELS
import { CREATOR_ROLES, REVIEWER_ROLES, APPROVER_ROLES, STATUSES, STATUS_LABELS, ROLES, Role } from '@/lib/config/workflow';
import { RFAFile } from '@/types/rfa';
import { sendPushNotification } from '@/lib/utils/push-notification';
import { PERMISSION_KEYS } from '@/lib/config/permissions';

export const dynamic = 'force-dynamic';

// Helper Check Permission
const checkPermission = (
    userRole: string, 
    userOverrides: any, 
    group: string, 
    key: string,   
    defaultAllowedRoles: string[]
): boolean => {
    const overrideValue = userOverrides?.[group]?.[key];
    if (overrideValue !== undefined) {
        return overrideValue;
    }
    return defaultAllowedRoles.includes(userRole as Role);
};

// --- GET Function ---
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ success: false, error: 'Missing authorization' }, { status: 401 });
        }
        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await adminAuth.verifyIdToken(token);
        const userId = decodedToken.uid;

        const userDoc = await adminDb.collection('users').doc(userId).get();
        if (!userDoc.exists) return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
        const userData = userDoc.data()!;
        const userSites = userData.sites || [];

        const rfaDoc = await adminDb.collection('rfaDocuments').doc(params.id).get();
        if (!rfaDoc.exists) return NextResponse.json({ success: false, error: 'RFA document not found' }, { status: 404 });
        const rfaData = rfaDoc.data()!;

        if (userData.role !== ROLES.ADMIN && !userSites.includes(rfaData.siteId)) {
            return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
        }
        
        let siteInfo: any = { id: rfaData.siteId, name: 'N/A' };
        let userOverrides = {};
        let cmSystemType = 'INTERNAL'; // Default

        if (rfaData.siteId) {
            const siteDoc = await adminDb.collection('sites').doc(rfaData.siteId).get();
            if (siteDoc.exists) {
                const siteData = siteDoc.data();
                siteInfo = { 
                    id: siteDoc.id, 
                    name: siteData?.name || 'Unknown Site',
                    cmSystemType: siteData?.cmSystemType || 'INTERNAL'
                };
                cmSystemType = siteData?.cmSystemType || 'INTERNAL';
                userOverrides = siteData?.userOverrides?.[userId] || {};
            }
        }
        
        const categoryInfo = { 
            id: rfaData.categoryId, 
            categoryCode: rfaData.taskData?.taskCategory || rfaData.categoryId || 'N/A' 
        };
        
        // --- Logic การแสดงปุ่ม (Permissions) ---
        const userRole = userData.role;
        const status = rfaData.status;

        const isReviewer = REVIEWER_ROLES.includes(userRole as Role);
        const isCM = userRole === ROLES.CM || userRole === ROLES.ADMIN;
        const canApproveOverride = checkPermission(userRole, userOverrides, 'RFA', PERMISSION_KEYS.RFA.APPROVE, APPROVER_ROLES);

        let canApprove = false;
        let canReject = false;

        if (cmSystemType === 'INTERNAL') {
            // INTERNAL FLOW: 2 รอบ
            if (status === STATUSES.PENDING_CM_APPROVAL) {
                // รอบ 1: ต้องเป็น CM (หรือ Override)
                canApprove = isCM || canApproveOverride;
                canReject = isCM || canApproveOverride;
            } else if (status === STATUSES.PENDING_FINAL_APPROVAL) {
                // รอบ 2: ต้องเป็น Site Admin / PE / OE (Reviewer)
                canApprove = isReviewer || canApproveOverride;
                canReject = isReviewer || canApproveOverride;
            }
        } else {
            // EXTERNAL FLOW: 1 รอบ
            if (status === STATUSES.PENDING_CM_APPROVAL) {
                // รอบเดียว: Site Admin / PE / OE กดอนุมัติได้เลย
                canApprove = isReviewer || canApproveOverride;
                canReject = isReviewer || canApproveOverride;
            }
        }

        const permissions = {
            canView: true,
            canEdit: CREATOR_ROLES.includes(userData.role as Role) && rfaData.status === STATUSES.REVISION_REQUIRED,
            canSendToCm: isReviewer && rfaData.status === STATUSES.PENDING_REVIEW,
            canRequestRevision: isReviewer && rfaData.status === STATUSES.PENDING_REVIEW,
            canApprove,
            canReject,
            canDownloadFiles: true
        };
        
        return NextResponse.json({ success: true, document: { 
            id: rfaDoc.id, ...rfaData, site: siteInfo, category: categoryInfo, permissions 
        }});

    } catch (error) {
        console.error('Error fetching RFA:', error);
        return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
}

// --- PUT Function ---
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
        if (!rfaDoc.exists) return NextResponse.json({ error: 'RFA not found' }, { status: 404 });
        
        const docData = rfaDoc.data()!;
        const siteDoc = await adminDb.collection('sites').doc(docData.siteId).get();
        const siteData = siteDoc.data();
        const cmSystemType = siteData?.cmSystemType || 'INTERNAL';
        const siteName = siteData?.name || 'โครงการทั่วไป';
        const documentTitle = docData?.title || 'ไม่ระบุชื่อเรื่อง';
        const userOverrides = siteData?.userOverrides?.[userId] || {};

        let newStatus = docData.status;
        let canPerformAction = false;
        
        // 1. Reviewer Actions (ส่งไป CM)
        const isReviewer = REVIEWER_ROLES.includes(userRole as Role);
        if (isReviewer && docData.status === STATUSES.PENDING_REVIEW) {
            if (['SEND_TO_CM', 'REQUEST_REVISION'].includes(action)) {
                canPerformAction = true;
            }
        }

        // 2. Creator Actions (แก้ไขงาน)
        if (CREATOR_ROLES.includes(userRole as Role) && docData.createdBy === userId && docData.status === STATUSES.REVISION_REQUIRED) {
            if (action === 'SUBMIT_REVISION') {
                canPerformAction = true;
            }
        }

        // 3. Approval Actions
        const isCM = userRole === ROLES.CM || userRole === ROLES.ADMIN;
        const canApproveOverride = checkPermission(userRole, userOverrides, 'RFA', PERMISSION_KEYS.RFA.APPROVE, APPROVER_ROLES);
        const approvalActions = ['APPROVE', 'APPROVE_WITH_COMMENTS', 'REJECT', 'APPROVE_REVISION_REQUIRED'];

        if (approvalActions.includes(action)) {
            if (cmSystemType === 'INTERNAL') {
                // INTERNAL: มี 2 รอบ
                if (docData.status === STATUSES.PENDING_CM_APPROVAL) {
                    // รอบ 1: ต้องเป็น CM
                    if (isCM || canApproveOverride) canPerformAction = true;
                } else if (docData.status === STATUSES.PENDING_FINAL_APPROVAL) {
                    // รอบ 2: ต้องเป็น Reviewer (Site Admin/OE/PE)
                    if (isReviewer || canApproveOverride) canPerformAction = true;
                }
            } else {
                // EXTERNAL: มี 1 รอบ
                if (docData.status === STATUSES.PENDING_CM_APPROVAL) {
                    // รอบเดียว: Reviewer อนุมัติได้เลย
                    if (isReviewer || canApproveOverride) canPerformAction = true;
                }
            }
        }

        if (!canPerformAction) {
          return NextResponse.json({ success: false, error: 'Permission denied or invalid status.' }, { status: 403 });
        }
        
        // --- Logic การเปลี่ยนสถานะ ---
        switch(action) {
            case 'SEND_TO_CM': newStatus = STATUSES.PENDING_CM_APPROVAL; break;
            case 'REQUEST_REVISION': newStatus = STATUSES.REVISION_REQUIRED; break;
            case 'SUBMIT_REVISION': newStatus = STATUSES.PENDING_REVIEW; break;
            case 'REJECT': newStatus = STATUSES.REJECTED; break;
            case 'APPROVE_REVISION_REQUIRED': newStatus = STATUSES.APPROVED_REVISION_REQUIRED; break;
            
            case 'APPROVE':
            case 'APPROVE_WITH_COMMENTS':
                if (cmSystemType === 'INTERNAL' && docData.status === STATUSES.PENDING_CM_APPROVAL) {
                    // Internal: ผ่าน CM แล้ว -> ไปรอ Final Approval
                    newStatus = STATUSES.PENDING_FINAL_APPROVAL;
                } else {
                    // Internal (รอบ 2) OR External (รอบเดียว) -> จบที่ Approved
                    newStatus = action === 'APPROVE' ? STATUSES.APPROVED : STATUSES.APPROVED_WITH_COMMENTS;
                }
                break;
        }
        
        // ... (ส่วนจัดการไฟล์) ...
        let finalDocFiles: RFAFile[] = docData.files || [];
        let workflowFiles: RFAFile[] = [];

        if (newFiles && Array.isArray(newFiles) && newFiles.length > 0) {
            const cdnUrlBase = "https://ttsdoc-cdn.ttthaiii30.workers.dev";
            for (const tempFile of newFiles) {
                const sourcePath = tempFile.filePath;
                if (!sourcePath || !sourcePath.startsWith(`temp/${userId}/`)) continue;
                const docNumForPath = documentNumber || docData.documentNumber || 'temp';
                const destinationPath = `sites/${docData.siteId}/rfa/${docNumForPath}/${Date.now()}_${tempFile.fileName}`;
                // ใช้ adminBucket ที่ import มาถูกต้องแล้ว
                await adminBucket.file(sourcePath).move(destinationPath);
                const movedFile = {
                    fileName: tempFile.fileName, fileUrl: `${cdnUrlBase}/${destinationPath}`,
                    filePath: destinationPath, size: tempFile.size, fileSize: tempFile.size,
                    contentType: tempFile.contentType, uploadedAt: new Date().toISOString(), uploadedBy: userId,
                };
                workflowFiles.push(movedFile);
                finalDocFiles.push(movedFile);
            }
        }
    
        const workflowEntry = {
          action, status: newStatus, userId, userName: userData.email, role: userRole,
          timestamp: new Date().toISOString(), comments: comments || '',
          files: workflowFiles,
        };
    
        const updates: { [key: string]: any } = {
          status: newStatus,
          currentStep: newStatus,
          workflow: FieldValue.arrayUnion(workflowEntry),
          updatedAt: FieldValue.serverTimestamp(),
        };
        if (documentNumber) updates.documentNumber = documentNumber;
        if (workflowFiles.length > 0) updates.files = finalDocFiles;
        
        await rfaDocRef.update(updates);

        // ... (Notification Logic) ...
        const notifyStatuses = [STATUSES.APPROVED, STATUSES.APPROVED_WITH_COMMENTS, STATUSES.APPROVED_REVISION_REQUIRED, STATUSES.PENDING_FINAL_APPROVAL];
        if (notifyStatuses.includes(newStatus)) {
             const targetUserIds: string[] = [];
             const usersSnapshot = await adminDb.collection('users')
                .where('sites', 'array-contains', docData.siteId).where('status', '==', 'ACTIVE').get();
             
             usersSnapshot.forEach(doc => {
                 const role = doc.data().role as Role;
                 // ถ้าเป็น Pending Final -> แจ้ง Site Admin / PE / OE
                 if (newStatus === STATUSES.PENDING_FINAL_APPROVAL) {
                     if (REVIEWER_ROLES.includes(role)) targetUserIds.push(doc.id);
                 } 
                 // ถ้าจบแล้ว -> แจ้ง SE/FM
                 else if (['SE', 'FM'].includes(role)) {
                     targetUserIds.push(doc.id);
                 }
             });
             
             if (targetUserIds.length > 0) {
                 let notiTitle = `📣 อัปเดตสถานะ: ${documentNumber || docData.documentNumber}`;
                 if (newStatus === STATUSES.PENDING_FINAL_APPROVAL) notiTitle = `⏳ รออนุมัติขั้นสุดท้าย: ${documentNumber || docData.documentNumber}`;
                 if (newStatus === STATUSES.APPROVED) notiTitle = `✅ อนุมัติแล้ว: ${documentNumber || docData.documentNumber}`;

                 // ใช้ STATUS_LABELS แทน STATUSES เพื่อแก้ Type Error และได้ข้อความภาษาไทย
                 const statusLabel = STATUS_LABELS[newStatus] || newStatus;
                 const notiBody = `โครงการ: ${siteName}\nสถานะ: ${statusLabel}`;
                 
                 await sendPushNotification(targetUserIds, { title: notiTitle, body: notiBody, url: `/dashboard/rfa/${params.id}` });
             }
        }

        return NextResponse.json({ success: true, message: `Action completed`, newStatus });
    
      } catch (error) {
        console.error('Error updating RFA:', error);
        return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
      }
}