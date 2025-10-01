// src/app/api/rfa/[id]/route.ts (แก้ไขแล้ว)
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminBucket, adminAuth } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { CREATOR_ROLES, REVIEWER_ROLES, APPROVER_ROLES, STATUSES } from '@/lib/config/workflow';
import { RFAFile } from '@/types/rfa';

// --- GET Function (ไม่มีการเปลี่ยนแปลง) ---
// src/app/api/rfa/[id]/route.ts

// --- GET Function (ฉบับแก้ไข) ---
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // --- ส่วนยืนยันตัวตน (Authentication) เหมือนเดิม ---
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

    // --- ส่วนดึงข้อมูล RFA หลัก เหมือนเดิม ---
    const rfaDoc = await adminDb.collection('rfaDocuments').doc(params.id).get();
    if (!rfaDoc.exists) {
      return NextResponse.json({ success: false, error: 'RFA document not found' }, { status: 404 });
    }
    const rfaData = rfaDoc.data()!;

    if (!userSites.includes(rfaData.siteId)) {
      return NextResponse.json({ success: false, error: 'Access denied to this site' }, { status: 403 });
    }
    
    // ✅ --- จุดแก้ไขสำคัญอยู่ตรงนี้ครับ --- ✅
    let siteInfo = { id: rfaData.siteId, name: 'N/A' }; // 1. กำหนดค่าเริ่มต้น
    if (rfaData.siteId) {
      // 2. นำ siteId ไปค้นหาข้อมูลจาก collection 'sites'
      const siteDoc = await adminDb.collection('sites').doc(rfaData.siteId).get();
      if (siteDoc.exists) {
        // 3. ถ้าเจอ ให้สร้าง object siteInfo ที่สมบูรณ์
        siteInfo = { 
          id: siteDoc.id, 
          name: siteDoc.data()?.name || 'Unknown Site' 
        };
      }
    }
    // ✅ --- สิ้นสุดจุดแก้ไข ---

    // --- ส่วนที่เหลือเหมือนเดิม แต่จะใช้ siteInfo ที่เราสร้างขึ้นใหม่ ---
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
    
    // 4. ส่ง responseData ที่มีข้อมูล site ที่ถูกต้องกลับไป
    const responseData = { 
        id: rfaDoc.id, 
        ...rfaData, 
        site: siteInfo, // <--- ใช้ตัวแปรใหม่นี้
        category: categoryInfo, 
        permissions 
    };

    return NextResponse.json({ success: true, document: responseData });

  } catch (error) {
    console.error('Error fetching RFA document:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}


// --- 👇 PUT Function (แก้ไขใหม่ทั้งหมด) 👇 ---
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
        const { action, comments, newFiles } = body; 

        if (!action) return NextResponse.json({ error: 'Action is required' }, { status: 400 });
        
        const rfaDocRef = adminDb.collection('rfaDocuments').doc(params.id);
        const rfaDoc = await rfaDocRef.get();
        if (!rfaDoc.exists) return NextResponse.json({ error: 'RFA document not found' }, { status: 404 });
        
        const docData = rfaDoc.data()!;

        // 1. ดึงข้อมูล Site และผู้สร้าง
        const siteDoc = await adminDb.collection('sites').doc(docData.siteId).get();
        const siteData = siteDoc.data();
        const cmSystemType = siteData?.cmSystemType || 'INTERNAL'; // Default to INTERNAL if not set
        const creatorRole = docData.workflow?.[0]?.role || 'BIM';

        let newStatus = docData.status;
        let canPerformAction = false;
        
        // 2. Logic การตัดสินใจใหม่ทั้งหมด
        // Flow: ME/SN -> CM (จบเลย)
        if (['ME', 'SN'].includes(creatorRole)) {
            if (userRole === 'CM' && docData.status === STATUSES.PENDING_CM_APPROVAL) {
                switch(action) {
                    case 'APPROVE': newStatus = STATUSES.APPROVED; canPerformAction = true; break;
                    case 'APPROVE_WITH_COMMENTS': newStatus = STATUSES.APPROVED_WITH_COMMENTS; canPerformAction = true; break;
                    case 'REJECT': newStatus = STATUSES.REJECTED; canPerformAction = true; break;
                }
            }
        } 
        // Flow: BIM -> ...
        else if (creatorRole === 'BIM') {
            // โครงการที่ CM มีระบบของตัวเอง
            if (cmSystemType === 'EXTERNAL') {
                if (userRole === 'Site Admin') {
                    if (docData.status === STATUSES.PENDING_REVIEW) {
                        if (action === 'SEND_TO_EXTERNAL_CM') {
                            newStatus = STATUSES.SENT_TO_EXTERNAL_CM;
                            canPerformAction = true;
                        }
                    } else if (docData.status === STATUSES.SENT_TO_EXTERNAL_CM) {
                        switch(action) {
                            case 'APPROVE': newStatus = STATUSES.APPROVED; canPerformAction = true; break;
                            case 'APPROVE_WITH_COMMENTS': newStatus = STATUSES.APPROVED_WITH_COMMENTS; canPerformAction = true; break;
                            case 'APPROVE_REVISION_REQUIRED': newStatus = STATUSES.APPROVED_REVISION_REQUIRED; canPerformAction = true; break;
                            case 'REJECT': newStatus = STATUSES.REJECTED; canPerformAction = true; break;
                        }
                    }
                }
            }
            // โครงการที่ CM ใช้ระบบร่วมกับเรา
            else { // cmSystemType === 'INTERNAL'
                if (userRole === 'Site Admin') {
                    if (docData.status === STATUSES.PENDING_REVIEW) {
                        if (action === 'SEND_TO_CM') {
                            newStatus = STATUSES.PENDING_CM_APPROVAL;
                            canPerformAction = true;
                        }
                    } else if (docData.status === STATUSES.PENDING_FINAL_APPROVAL) {
                         switch(action) {
                            case 'APPROVE': newStatus = STATUSES.APPROVED; canPerformAction = true; break;
                            case 'APPROVE_WITH_COMMENTS': newStatus = STATUSES.APPROVED_WITH_COMMENTS; canPerformAction = true; break;
                            case 'APPROVE_REVISION_REQUIRED': newStatus = STATUSES.APPROVED_REVISION_REQUIRED; canPerformAction = true; break;
                            case 'REJECT': newStatus = STATUSES.REJECTED; canPerformAction = true; break;
                        }
                    }
                } else if (userRole === 'CM' && docData.status === STATUSES.PENDING_CM_APPROVAL) {
                    switch(action) {
                        case 'APPROVE':
                        case 'APPROVE_WITH_COMMENTS':
                            newStatus = STATUSES.PENDING_FINAL_APPROVAL; // กลับไปให้ SITE
                            canPerformAction = true;
                            break;
                        case 'REJECT':
                            newStatus = STATUSES.REJECTED;
                            canPerformAction = true;
                            break;
                    }
                }
            }
        }

        // Logic เดิมสำหรับส่งกลับไปแก้ไข (ใช้ได้กับทุก Flow)
        if (action === 'REQUEST_REVISION' && REVIEWER_ROLES.includes(userRole) && docData.status === STATUSES.PENDING_REVIEW) {
            newStatus = STATUSES.REVISION_REQUIRED;
            canPerformAction = true;
        }
        if (action === 'SUBMIT_REVISION' && CREATOR_ROLES.includes(userRole) && docData.status === STATUSES.REVISION_REQUIRED && docData.createdBy === userId) {
            newStatus = STATUSES.PENDING_REVIEW;
            canPerformAction = true;
        }
    
        if (!canPerformAction) {
          return NextResponse.json({ success: false, error: 'Permission denied for this action or invalid document status' }, { status: 403 });
        }
        
        // 3. ส่วนของการจัดการไฟล์ (เหมือนเดิม แต่ตรวจสอบ newFiles)
        let finalFilesData: RFAFile[] = docData.files || []; // เริ่มจากไฟล์เดิม
        if (newFiles && Array.isArray(newFiles) && newFiles.length > 0) {
            const cdnUrlBase = "https://ttsdoc-cdn.ttthaiii30.workers.dev";
            const movedFiles = [];

            for (const tempFile of newFiles) {
                const sourcePath = tempFile.filePath;
                if (!sourcePath || !sourcePath.startsWith(`temp/${userId}/`)) continue;

                const destinationPath = `sites/${docData.siteId}/rfa/${docData.documentNumber}/${Date.now()}_${tempFile.fileName}`;
                await adminBucket.file(sourcePath).move(destinationPath);
                
                movedFiles.push({
                    fileName: tempFile.fileName,
                    fileUrl: `${cdnUrlBase}/${destinationPath}`,
                    filePath: destinationPath,
                    size: tempFile.size,
                    fileSize: tempFile.size, // ✅ [FIX] เพิ่มบรรทัดนี้เข้าไป
                    contentType: tempFile.contentType,
                    uploadedAt: new Date().toISOString(),
                    uploadedBy: userId,
                });
            }
            finalFilesData = movedFiles;
        }
    
        const workflowEntry = {
          action,
          status: newStatus,
          userId,
          userName: userData.email,
          role: userRole,
          timestamp: new Date().toISOString(),
          comments: comments || '',
          files: finalFilesData, // บันทึกไฟล์ชุดล่าสุดลงใน history
        };
    
        await rfaDocRef.update({
          status: newStatus,
          currentStep: newStatus,
          files: finalFilesData, // อัปเดต field files หลัก
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