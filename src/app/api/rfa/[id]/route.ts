// src/app/api/rfa/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminBucket, adminAuth } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { ROLES, CREATOR_ROLES, REVIEWER_ROLES, APPROVER_ROLES, STATUSES, Role } from '@/lib/config/workflow';
import { RFAFile } from '@/types/rfa';
import { sendPushNotification } from '@/lib/utils/push-notification';
import { PERMISSION_KEYS } from '@/lib/config/permissions'; // ✅ Import Keys

export const dynamic = 'force-dynamic';

// ✅ Helper: ฟังก์ชันตรวจสอบสิทธิ์แบบ Hybrid (Override > Role)
const checkPermission = (
    userRole: string, 
    userOverrides: any, 
    group: string, // 'RFA' or 'WR'
    key: string,   // 'create_shop', 'can_approve' etc.
    defaultAllowedRoles: string[]
): boolean => {
    // 1. เช็ค Override ก่อน
    const overrideValue = userOverrides?.[group]?.[key];
    if (overrideValue !== undefined) {
        return overrideValue;
    }
    // 2. ถ้าไม่มี Override ให้เช็คตาม Role ปกติ
    return defaultAllowedRoles.includes(userRole);
};

// --- GET Function ---
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

        // Access Check
        if (userData.role !== ROLES.ADMIN && !userSites.includes(rfaData.siteId)) {
            return NextResponse.json({ success: false, error: 'Access denied to this site' }, { status: 403 });
        }
        
        let siteInfo: any = { id: rfaData.siteId, name: 'N/A' };
        let userOverrides = {}; // เก็บค่า Override ของ User คนนี้ใน Site นี้

        if (rfaData.siteId) {
            const siteDoc = await adminDb.collection('sites').doc(rfaData.siteId).get();
            if (siteDoc.exists) {
                const siteData = siteDoc.data();
                siteInfo = { 
                    id: siteDoc.id, 
                    name: siteData?.name || 'Unknown Site',
                    cmSystemType: siteData?.cmSystemType || 'INTERNAL'
                };
                // ✅ ดึง userOverrides ของ User คนนี้ออกมา
                userOverrides = siteData?.userOverrides?.[userId] || {};
            }
        }
        
        const creatorRole = rfaData.workflow?.[0]?.role || 'BIM';
        const categoryInfo = { 
            id: rfaData.categoryId, 
            categoryCode: rfaData.taskData?.taskCategory || rfaData.categoryId || 'N/A' 
        };
        
        // ✅ คำนวณ Permissions ใหม่โดยใช้ checkPermission
        // เราเช็คเฉพาะ canApprove/canReject ให้ดูตัวอย่าง ที่เหลือใช้ Logic เดิมได้ หรือจะเปลี่ยนก็ได้
        const canApproveOverride = checkPermission(
            userData.role, 
            userOverrides, 
            'RFA', 
            PERMISSION_KEYS.RFA.APPROVE, 
            APPROVER_ROLES
        );

        const permissions = {
            canView: true,
            canEdit: CREATOR_ROLES.includes(userData.role) && rfaData.status === STATUSES.REVISION_REQUIRED,
            canSendToCm: REVIEWER_ROLES.includes(userData.role) && rfaData.status === STATUSES.PENDING_REVIEW,
            canRequestRevision: REVIEWER_ROLES.includes(userData.role) && rfaData.status === STATUSES.PENDING_REVIEW,
            // ✅ ใช้ค่าที่คำนวณจาก Override
            canApprove: canApproveOverride && rfaData.status === STATUSES.PENDING_CM_APPROVAL,
            canReject: canApproveOverride && rfaData.status === STATUSES.PENDING_CM_APPROVAL,
            canDownloadFiles: true
        };
        
        const responseData = { 
            id: rfaDoc.id, 
            ...rfaData, 
            site: siteInfo, 
            category: categoryInfo, 
            permissions, // ส่ง permission ที่ถูกต้องกลับไป
            creatorRole: creatorRole,
        };

        return NextResponse.json({ success: true, document: responseData });

    } catch (error) {
        console.error('Error fetching RFA document:', error);
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
        const siteData = siteDoc.data();
        const cmSystemType = siteData?.cmSystemType || 'INTERNAL';
        const siteName = siteData?.name || 'โครงการทั่วไป';
        const documentTitle = docData?.title || 'ไม่ระบุชื่อเรื่อง';

        // ✅ ดึง Overrides มาเช็คสิทธิ์ขา Backend ด้วย
        const userOverrides = siteData?.userOverrides?.[userId] || {};

        let newStatus = docData.status;
        let canPerformAction = false;
        
        // Permission Check Logic (Updated)
        
        // 1. กลุ่ม Reviewer (Site Admin)
        if (REVIEWER_ROLES.includes(userRole)) {
            if (docData.status === STATUSES.PENDING_REVIEW && (action === 'SEND_TO_CM' || action === 'REQUEST_REVISION')) {
                canPerformAction = true;
            }
            // Site Admin สามารถ Approve แทน CM ได้ถ้าเป็น External หรือถ้ามีสิทธิ์
            // (Logic นี้อาจซับซ้อน แต่เราจะเน้นที่ Checkbox Override เป็นหลักในข้อต่อไป)
        }

        // 2. กลุ่ม Approver (CM/PD) หรือผู้ได้รับสิทธิ์ Override
        const canApprove = checkPermission(userRole, userOverrides, 'RFA', PERMISSION_KEYS.RFA.APPROVE, APPROVER_ROLES);
        
        if (canApprove && docData.status === STATUSES.PENDING_CM_APPROVAL && cmSystemType === 'INTERNAL') {
            if (['APPROVE', 'APPROVE_WITH_COMMENTS', 'REJECT', 'APPROVE_REVISION_REQUIRED'].includes(action)) {
                canPerformAction = true;
            }
        }

        // 3. กลุ่ม Creator (แก้ไขงาน)
        if (CREATOR_ROLES.includes(userRole) && docData.createdBy === userId) {
            if (docData.status === STATUSES.REVISION_REQUIRED && action === 'SUBMIT_REVISION') {
                canPerformAction = true;
            }
        }

        if (!canPerformAction) {
          return NextResponse.json({ success: false, error: 'Permission denied for this action or invalid document status.' }, { status: 403 });
        }
        
        // ... (Logic Update Status และ Files ส่วนที่เหลือเหมือนเดิม ไม่ต้องแก้ไข) ...
        switch(action) {
            case 'SEND_TO_CM': newStatus = STATUSES.PENDING_CM_APPROVAL; break;
            case 'REQUEST_REVISION': newStatus = STATUSES.REVISION_REQUIRED; break;
            case 'SUBMIT_REVISION': newStatus = STATUSES.PENDING_REVIEW; break;
            case 'REJECT': newStatus = STATUSES.REJECTED; break;
            case 'APPROVE_REVISION_REQUIRED': newStatus = STATUSES.APPROVED_REVISION_REQUIRED; break;
            
            case 'APPROVE':
                // ถ้าเป็น CM External หรือ Internal ก็จบที่ Approved เหมือนกัน (ปรับตาม Business Logic)
                newStatus = STATUSES.APPROVED; 
                break;
            case 'APPROVE_WITH_COMMENTS':
                newStatus = STATUSES.APPROVED_WITH_COMMENTS;
                break;
        }
        
        // ... (ส่วนจัดการไฟล์และการบันทึกลง DB เหมือนเดิมเป๊ะๆ) ...
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
    
        const updates: { [key: string]: any } = {
          status: newStatus,
          currentStep: newStatus,
          workflow: FieldValue.arrayUnion(workflowEntry),
          updatedAt: FieldValue.serverTimestamp(),
        };
        if (documentNumber) updates.documentNumber = documentNumber;
        if (workflowFiles.length > 0) updates.files = finalDocFiles;
        
        await rfaDocRef.update(updates);

        // Notification Logic (เหมือนเดิม)
        const notifyStatuses = [STATUSES.APPROVED, STATUSES.APPROVED_WITH_COMMENTS, STATUSES.APPROVED_REVISION_REQUIRED];
        if (notifyStatuses.includes(newStatus)) {
             const targetUserIds: string[] = [];
             try {
                 const usersSnapshot = await adminDb.collection('users')
                    .where('sites', 'array-contains', docData.siteId)
                    .where('status', '==', 'ACTIVE')
                    .get();
                 const targetRoles = ['SE', 'FM'];
                 usersSnapshot.forEach(doc => {
                     const uData = doc.data();
                     if (targetRoles.includes(uData.role)) targetUserIds.push(doc.id);
                 });
             } catch (err) { console.error('Error fetching target users:', err); }

             if (targetUserIds.length > 0) {
                 const docNum = documentNumber || docData.documentNumber || 'RFA-xxxx';
                 let notiTitle = `✅ อนุมัติแล้ว: ${docNum}`;
                 let notiBody = `โครงการ: ${siteName}\nเอกสารเรื่อง "${documentTitle}" ได้รับการอนุมัติแล้ว`;
    
                 if (newStatus === STATUSES.APPROVED_WITH_COMMENTS) {
                     notiTitle = `⚠️ อนุมัติตามคอมเมนต์: ${docNum}`;
                 } else if (newStatus === STATUSES.APPROVED_REVISION_REQUIRED) {
                     notiTitle = `⚠️ อนุมัติ (ต้องแก้ไข): ${docNum}`;
                 }
                 await sendPushNotification(targetUserIds, { title: notiTitle, body: notiBody, url: `/dashboard/rfa/${params.id}` });
             }
        }

        return NextResponse.json({ success: true, message: `Action [${action}] completed successfully`, newStatus });
    
      } catch (error) {
        console.error('Error updating RFA document:', error);
        return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
      }
}