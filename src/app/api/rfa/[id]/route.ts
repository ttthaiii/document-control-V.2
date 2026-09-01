import { NextRequest, NextResponse } from 'next/server';
// 1. เพิ่ม adminBucket
import { adminDb, adminAuth, adminBucket } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
// 2. เพิ่ม STATUS_LABELS
import { CREATOR_ROLES, REVIEWER_ROLES, APPROVER_ROLES, STATUSES, STATUS_LABELS, ROLES, Role, RFA_CM_VISIBLE_STATUSES, EXTERNAL_STEP_STATUSES, ExternalChain, canActOnExternalStep, applyExternalStep, advanceExternalChain, sendBackChain, applyLineOverride, OverrideStepInput, serializeExternalChainForViewer, RfaActionContext, findRfaTransition, checkRfaGuard, resolveRfaStatus } from '@/lib/config/workflow';
import { RFAFile } from '@/types/rfa';
import { sendPushNotification } from '@/lib/utils/push-notification';
import { PERMISSION_KEYS } from '@/lib/config/permissions';
import { getFileUrl } from '@/lib/utils/storage';
import { extractCadFiles } from '@/lib/utils/extractCadFiles';
import { logActivity, buildDescription } from '@/lib/utils/activityLogger';


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

        // CM only ever sees documents that have reached them (roadmap T-008). This
        // route uses the Admin SDK, which bypasses firestore.rules entirely, so the
        // same check must be enforced here too — otherwise opening the URL directly
        // would bypass the dashboard's query filter.
        if (userData.role === ROLES.CM && !RFA_CM_VISIBLE_STATUSES.includes(rfaData.status)) {
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
            categoryCode: (rfaData.categoryName || rfaData.taskData?.taskCategory || (rfaData.categoryId ? rfaData.categoryId.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') : 'N/A')).trim()
        };

        // --- Logic การแสดงปุ่ม (Permissions) ---
        const userRole = userData.role;
        const status = rfaData.status;

        const APPROVED_STATUSES = [STATUSES.APPROVED, STATUSES.APPROVED_WITH_COMMENTS, STATUSES.APPROVED_REVISION_REQUIRED];

        const isReviewer = REVIEWER_ROLES.includes(userRole as Role);
        const isCM = userRole === ROLES.CM || userRole === ROLES.ADMIN;
        const canApproveOverride = checkPermission(userRole, userOverrides, 'RFA', PERMISSION_KEYS.RFA.APPROVE, APPROVER_ROLES);
        // APPROVER_ROLES (used above) includes CM by design, for round 1's CM check —
        // reusing that same override for a Reviewer-only gate would default-allow CM
        // there too (checkPermission falls back to defaultAllowedRoles.includes(role)
        // when no explicit per-user override exists). Round 2 / EXTERNAL's single
        // round are Reviewer-only actions, so they must check against REVIEWER_ROLES
        // instead, or CM silently keeps approve rights past round 1.
        const canApproveAsReviewerOverride = checkPermission(userRole, userOverrides, 'RFA', PERMISSION_KEYS.RFA.APPROVE, REVIEWER_ROLES);

        let canApprove = false;
        let canReject = false;

        if (cmSystemType === 'INTERNAL') {
            // INTERNAL FLOW: 2 รอบ
            if (status === STATUSES.PENDING_CM_APPROVAL) {
                // รอบ 1: ต้องเป็น CM (หรือ Override)
                canApprove = isCM || canApproveOverride;
                canReject = isCM || canApproveOverride;
            } else if (status === STATUSES.PENDING_FINAL_APPROVAL) {
                // รอบ 2: ต้องเป็น Site Admin / PE / OE (Reviewer) — CM ต้องไม่ผ่านรอบนี้
                canApprove = isReviewer || canApproveAsReviewerOverride;
                canReject = isReviewer || canApproveAsReviewerOverride;
            }
        } else {
            // EXTERNAL FLOW: 1 รอบ
            if (status === STATUSES.PENDING_CM_APPROVAL) {
                // รอบเดียว: Site Admin / PE / OE กดอนุมัติได้เลย (ไม่มี CM ในระบบ EXTERNAL อยู่แล้ว)
                canApprove = isReviewer || canApproveAsReviewerOverride;
                canReject = isReviewer || canApproveAsReviewerOverride;
            }
        }

        const canSendToCmOverride = checkPermission(userRole, userOverrides, 'RFA', PERMISSION_KEYS.RFA.CAN_SEND_TO_CM, []);
        const canRequestRevisionOverride = checkPermission(userRole, userOverrides, 'RFA', PERMISSION_KEYS.RFA.CAN_REQUEST_REVISION, []);
        const canRequestSupersedeOverride = checkPermission(userRole, userOverrides, 'RFA', PERMISSION_KEYS.RFA.CAN_REQUEST_SUPERSEDE, []);

        // External approval chain (INTERNAL sites only). CM forwards at round 1; the current
        // role-holder acts while the doc is at PENDING_EXTERNAL_APPROVAL; CM finalizes at
        // PENDING_CM_FINAL. Non-CM viewers get a redacted chain (location only) in the response.
        const canActExternalStep = cmSystemType === 'INTERNAL' && status === STATUSES.PENDING_EXTERNAL_APPROVAL
            && canActOnExternalStep(rfaData.externalChain, userRole as Role);
        const canFinalizeExternal = cmSystemType === 'INTERNAL' && isCM && status === STATUSES.PENDING_CM_FINAL;

        const permissions = {
            canView: true,
            canEdit: CREATOR_ROLES.includes(userData.role as Role) && rfaData.status === STATUSES.REVISION_REQUIRED,
            canSendToCm: (isReviewer || canSendToCmOverride) && rfaData.status === STATUSES.PENDING_REVIEW,
            canRequestRevision: (isReviewer || canRequestRevisionOverride) && rfaData.status === STATUSES.PENDING_REVIEW,
            canApprove,
            canReject,
            canDownloadFiles: true,
            canRequestSupersede:
                APPROVED_STATUSES.includes(rfaData.status) &&
                rfaData.supersededStatus !== 'SUSPENDED' &&
                (isCM || canApproveOverride || canRequestSupersedeOverride),
            canActExternalStep,
            canFinalizeExternal,
        };

        // T-018: the FORWARD_EXTERNAL dispatch + its read-only lineTemplate preview are gone —
        // an INTERNAL document's externalChain is seeded at creation, so CM (and every other
        // stage holder) already sees the real live chain from the start, not a preview of one.

        let isFromSupersedeRequest = rfaData.isFromSupersedeRequest || false;

        // Backwards compatibility for old documents missing the flag
        if (typeof rfaData.isFromSupersedeRequest === 'undefined' && rfaData.previousRevisionId) {
            const hasSupersedeWorkflow = (rfaData.workflow || []).some(
                (w: any) => w.step === STATUSES.REVISION_REQUESTED || w.status === STATUSES.REVISION_REQUESTED
            );
            if (hasSupersedeWorkflow) {
                isFromSupersedeRequest = true;
            }
        }

        return NextResponse.json({
            success: true, document: {
                id: rfaDoc.id, ...rfaData, isFromSupersedeRequest, site: siteInfo, category: categoryInfo, permissions,
                // Override the raw spread above: CM sees the full chain, everyone else gets
                // location-only (per-approver outcomes are hidden until CM's final decision).
                externalChain: serializeExternalChainForViewer(rfaData.externalChain, isCM),
            }
        });

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
        const { action, comments, newFiles, documentNumber, supersededAt, suspendPreviousRevision } = body;

        if (!action) return NextResponse.json({ error: 'Action is required' }, { status: 400 });

        const rfaDocRef = adminDb.collection('rfaDocuments').doc(params.id);
        const rfaDoc = await rfaDocRef.get();
        if (!rfaDoc.exists) return NextResponse.json({ error: 'RFA not found' }, { status: 404 });

        const docData = rfaDoc.data()!;

        // --- SUPERSEDE Action: ซ่อน Rev. เก่าหลัง Rev. ใหม่อนุมัติ (Modal #2) ---
        // ไม่ต้องตรวจสอบ Permission แบบเดิม เพราะนี่คือการทำด้วย Token ที่ผ่าน Auth แล้ว
        if (action === 'SUPERSEDE') {
            await rfaDocRef.update({
                supersededStatus: 'SUPERSEDED',
                supersededAt: supersededAt || new Date().toISOString(),
                updatedAt: FieldValue.serverTimestamp(),
            });
            return NextResponse.json({ success: true, message: 'Document superseded successfully.' });
        }
        const siteDoc = await adminDb.collection('sites').doc(docData.siteId).get();
        const siteData = siteDoc.data();
        const cmSystemType = siteData?.cmSystemType || 'INTERNAL';
        const siteName = siteData?.name || 'โครงการทั่วไป';
        const documentTitle = docData?.title || 'ไม่ระบุชื่อเรื่อง';
        const userOverrides = siteData?.userOverrides?.[userId] || {};

        // --- T-016 · declarative transition gate (Option 2) ---
        // WHO-may-act + WHAT-status-results both come from RFA_TRANSITIONS (workflow.ts),
        // replacing the old hand-branched guard block + status switch. Behavior is identical
        // to the pre-table code — verified by the exhaustive (status, action, role, system)
        // diff in the T-016 plan (Verify-2). The imperative side-effects (chain build,
        // EXT_* apply, file moves) stay inline below, keyed off `action` as before.
        const isReviewer = REVIEWER_ROLES.includes(userRole as Role);
        const isCM = userRole === ROLES.CM || userRole === ROLES.ADMIN;
        const isCreatorOwner = CREATOR_ROLES.includes(userRole as Role) && docData.createdBy === userId;
        // Normalize exactly like the pre-table code: INTERNAL only when === 'INTERNAL',
        // every other value falls to EXTERNAL (the old `else` branch).
        const normalizedCmSystemType: 'INTERNAL' | 'EXTERNAL' = cmSystemType === 'INTERNAL' ? 'INTERNAL' : 'EXTERNAL';
        const extStepActions = ['EXT_APPROVE', 'EXT_APPROVE_WITH_COMMENTS', 'EXT_REJECT'];

        const actionCtx: RfaActionContext = {
            userRole: userRole as Role,
            status: docData.status,
            cmSystemType: normalizedCmSystemType,
            rfaType: docData.rfaType,
            isReviewer,
            isCM,
            isCreatorOwner,
            chain: docData.externalChain,
            canSendToCm: checkPermission(userRole, userOverrides, 'RFA', PERMISSION_KEYS.RFA.CAN_SEND_TO_CM, []),
            canRequestRevision: checkPermission(userRole, userOverrides, 'RFA', PERMISSION_KEYS.RFA.CAN_REQUEST_REVISION, []),
            // Two separate overrides so CM's APPROVER_ROLES default never leaks into the
            // Reviewer-only round-2 / EXTERNAL gate (same fix as the GET handler).
            canApprove: checkPermission(userRole, userOverrides, 'RFA', PERMISSION_KEYS.RFA.APPROVE, APPROVER_ROLES),
            canApproveAsReviewer: checkPermission(userRole, userOverrides, 'RFA', PERMISSION_KEYS.RFA.APPROVE, REVIEWER_ROLES),
        };

        const transition = findRfaTransition(action, docData.status, normalizedCmSystemType);
        if (!transition || !checkRfaGuard(transition, actionCtx)) {
            return NextResponse.json({ success: false, error: 'Permission denied or invalid status.' }, { status: 403 });
        }

        const newStatus = resolveRfaStatus(transition, actionCtx);

        const actionsRequiringFiles = [
            'SEND_TO_CM',
            'REQUEST_REVISION',
            'SUBMIT_REVISION',
            'APPROVE',
            'APPROVE_WITH_COMMENTS',
            'APPROVE_REVISION_REQUIRED',
            'REJECT',
            // External chain verdicts — every one needs a supporting file (user rule;
            // client mirrors this in RFADetailModal actionsRequiringFile).
            ...extStepActions,
        ];

        // SITE's round-2 classification (PENDING_FINAL_APPROVAL) finalizes using
        // whatever CAD CM already attached at round 1 — it never uploads a new file,
        // so this must not be a hard requirement here (frontend mirrors this check).
        const isSiteRound2Classification = docData.status === STATUSES.PENDING_FINAL_APPROVAL
            && ['APPROVE_WITH_COMMENTS', 'APPROVE_REVISION_REQUIRED'].includes(action);

        if (actionsRequiringFiles.includes(action) && !isSiteRound2Classification) {
            // เช็คว่ามีไฟล์แนบมาหรือไม่
            if (!newFiles || !Array.isArray(newFiles) || newFiles.length === 0) {
                return NextResponse.json(
                    { success: false, error: `Action '${action}' requires at least one file attachment.` },
                    { status: 400 }
                );
            }
        }

        // T-018: FORWARD_EXTERNAL removed — an INTERNAL document's externalChain is already
        // seeded at creation, so there is no separate dispatch step left to build one here.
        let updatedExternalChain: ExternalChain | undefined;

        // Default: REPLACE doc.files with the new upload (historical files stay in `workflow`).
        // Exception — SITE's round-2 finalize: when SITE attaches a file at the final step,
        // MERGE it with the files CM already published (docData.files) instead of replacing,
        // so downstream viewers (BIM/FM) see BOTH CM's file and SITE's added CAD. Scoped to
        // this case only; every other approval keeps the "latest upload replaces" behavior.
        const hasNewFiles = newFiles && Array.isArray(newFiles) && newFiles.length > 0;
        const isRound2Finalize = docData.status === STATUSES.PENDING_FINAL_APPROVAL
            && ['APPROVE_WITH_COMMENTS', 'APPROVE_REVISION_REQUIRED'].includes(action);

        let finalDocFiles: RFAFile[] = hasNewFiles
            ? (isRound2Finalize ? [...(docData.files || [])] : [])
            : (docData.files || []);
        let workflowFiles: RFAFile[] = [];

        if (hasNewFiles) {
            for (const tempFile of newFiles) {
                const sourcePath = tempFile.filePath;
                if (!sourcePath || !sourcePath.startsWith(`temp/${userId}/`)) continue;
                const docNumForPath = documentNumber || docData.documentNumber || 'temp';
                const destinationPath = `sites/${docData.siteId}/rfa/${docNumForPath}/${Date.now()}_${tempFile.fileName}`;
                // ใช้ adminBucket ที่ import มาถูกต้องแล้ว
                await adminBucket.file(sourcePath).move(destinationPath);
                const movedFile = {
                    fileName: tempFile.fileName, fileUrl: getFileUrl(destinationPath),
                    filePath: destinationPath, size: tempFile.size, fileSize: tempFile.size,
                    contentType: tempFile.contentType, uploadedAt: new Date().toISOString(), uploadedBy: userId,
                };
                workflowFiles.push(movedFile);
                finalDocFiles.push(movedFile);
            }
        }

        // External step outcome: written now (files are moved) but the chain is only advanced
        // — never short-circuited on a reject. Result persisted to `updates.externalChain` below.
        if (extStepActions.includes(action)) {
            const extStatus = action === 'EXT_APPROVE'
                ? EXTERNAL_STEP_STATUSES.APPROVED
                : action === 'EXT_APPROVE_WITH_COMMENTS'
                    ? EXTERNAL_STEP_STATUSES.APPROVED_WITH_COMMENTS
                    : EXTERNAL_STEP_STATUSES.REJECTED;
            const acted = applyExternalStep(docData.externalChain, {
                status: extStatus,
                userId,
                userName: userData.email,
                comment: comments || '',
                files: workflowFiles,
                actedAt: new Date().toISOString(),
            });
            updatedExternalChain = advanceExternalChain(acted).chain;
        }

        // Send-back Rewind (T-016 A2): rewind the chain to `targetOrder`, preserving the
        // rolled-back acks as audit + locking per-doc override. Status returns to
        // PENDING_EXTERNAL_APPROVAL (resolved by the table); this only mutates the chain.
        const sendBackActions = ['EXT_SEND_BACK', 'CM_SEND_BACK'];
        if (sendBackActions.includes(action)) {
            const targetOrder = body?.targetOrder;
            if (typeof targetOrder !== 'number') {
                return NextResponse.json({ success: false, error: 'Send-back requires a numeric targetOrder.' }, { status: 400 });
            }
            if (!comments || !comments.trim()) {
                return NextResponse.json({ success: false, error: 'Send-back requires a reason (comments).' }, { status: 400 });
            }
            if (!docData.externalChain) {
                return NextResponse.json({ success: false, error: 'No external chain to send back.' }, { status: 400 });
            }
            try {
                updatedExternalChain = sendBackChain(
                    docData.externalChain,
                    targetOrder,
                    { userId, role: userRole as Role },
                    comments,
                );
            } catch (e: any) {
                return NextResponse.json({ success: false, error: e?.message || 'Invalid send-back target.' }, { status: 400 });
            }
        }

        // Per-document line override (T-016 A3): the current step-holder reshapes the FUTURE
        // tail (add/remove not-yet-reached steps). No status change — the table keeps the doc
        // in PENDING_EXTERNAL_APPROVAL. applyLineOverride freezes past+active, refuses removing
        // a mandatory step, and throws when the chain is overrideLocked (a send-back happened).
        if (action === 'EXT_OVERRIDE_LINE') {
            const futureSteps = body?.overrideFutureSteps;
            if (!Array.isArray(futureSteps)) {
                return NextResponse.json({ success: false, error: 'Override requires overrideFutureSteps[].' }, { status: 400 });
            }
            if (!docData.externalChain) {
                return NextResponse.json({ success: false, error: 'No external chain to override.' }, { status: 400 });
            }
            try {
                updatedExternalChain = applyLineOverride(docData.externalChain, futureSteps as OverrideStepInput[]);
            } catch (e: any) {
                return NextResponse.json({ success: false, error: e?.message || 'Invalid line override.' }, { status: 400 });
            }
        }

        const workflowEntry = {
            action, status: newStatus, userId, userName: userData.email, role: userRole,
            timestamp: new Date().toISOString(), comments: comments || '',
            // On round-2 finalize the entry carries the MERGED set (CM's + SITE's files) so
            // `latestFiles` (which reads the latest workflow step) shows them together.
            files: isRound2Finalize && hasNewFiles ? finalDocFiles : workflowFiles,
            revisionNumber: docData.revisionNumber || 0,
        };

        // T-018 fix: derive "did this action land on a terminal approved status" from
        // newStatus directly, not from an `action` allowlist. The old allowlist
        // (['APPROVE', 'APPROVE_WITH_COMMENTS', 'APPROVE_REVISION_REQUIRED']) never
        // included EXT_APPROVE/EXT_APPROVE_WITH_COMMENTS — so a document that reached
        // APPROVED by completing the external chain's LAST stage (any role, not just CM)
        // never got isLatestApproved set and never triggered auto-supersede of the
        // previous revision (ApprovedDocumentLibrary.tsx queries isLatestApproved==true,
        // so those documents silently never appeared there). This was already reachable
        // pre-T-018 via FORWARD_EXTERNAL + a full chain walk; T-018 makes it the primary
        // path for every new INTERNAL document, so it needed fixing here.
        const TERMINAL_APPROVED_STATUSES = [
            STATUSES.APPROVED,
            STATUSES.APPROVED_WITH_COMMENTS,
            STATUSES.APPROVED_REVISION_REQUIRED,
        ];
        const isFinalApproval = TERMINAL_APPROVED_STATUSES.includes(newStatus);

        const updates: { [key: string]: any } = {
            status: newStatus,
            currentStep: newStatus,
            workflow: FieldValue.arrayUnion(workflowEntry),
            updatedAt: FieldValue.serverTimestamp(),
            isMigration: FieldValue.delete(), // ลบ flag migration ออกทันทีที่ user แตะเอกสาร เพื่อให้ LINE notification ทำงานได้ปกติ
        };
        if (documentNumber) {
            updates.documentNumber = documentNumber.trim().replace(/\s+/g, '-');
        }
        if (workflowFiles.length > 0) updates.files = finalDocFiles;
        // Persist the (re)built external chain on forward and on every external step.
        if (updatedExternalChain !== undefined) updates.externalChain = updatedExternalChain;

        // Set isLatestApproved if this action completes the workflow
        if (isFinalApproval) {
            updates.isLatestApproved = true;
        }

        // 🟢 ล้างไฟล์ CAD เก่าทิ้งเมื่อมีการขอแก้ไขหรือส่งแก้ไขใหม่
        // เพื่อให้ตอนอนุมัติ Rev. ใหม่ ระบบจะดึงไฟล์จาก Rev. ใหม่ไป extract
        if (['SUBMIT_REVISION', 'REQUEST_REVISION', 'REJECT'].includes(action)) {
            updates.cadFiles = FieldValue.delete();
        }

        await rfaDocRef.update(updates);

        // --- Sync Comment & Suspend Status to Previous Revision from PENDING_REVIEW (Site) ---
        if (['SEND_TO_CM', 'REQUEST_REVISION'].includes(action) && docData.previousRevisionId) {
            try {
                const prevUpdate: any = {
                    updatedAt: FieldValue.serverTimestamp(),
                };
                
                // ถ้าระบุว่าให้ระงับ ก็บันทึกสถานะระงับ
                if (suspendPreviousRevision === true) {
                    prevUpdate.supersededStatus = 'SUSPENDED';
                }
                
                // ถ้ามีคอมเมนต์พิมพ์มา ให้บันทึกเป็น supersededComment ในเอกสารเก่าด้วย
                if (comments && comments.trim() !== '') {
                    prevUpdate.supersededComment = comments.trim();
                }

                if (Object.keys(prevUpdate).length > 1) { // More than just updatedAt
                    await adminDb.collection('rfaDocuments').doc(docData.previousRevisionId).update(prevUpdate);
                }
            } catch (err) {
                console.error('[PUT] Failed to update previous revision:', err);
            }
        }

        // --- Activity Log ---
        const docNumber = documentNumber || docData.documentNumber || '';
        const logActionMap: Record<string, any> = {
          'APPROVE': 'APPROVE_DOCUMENT',
          'APPROVE_WITH_COMMENTS': 'APPROVE_DOCUMENT',
          'APPROVE_REVISION_REQUIRED': 'APPROVE_DOCUMENT',
          'REJECT': 'REJECT_DOCUMENT',
          'REQUEST_REVISION': 'REQUEST_REVISION',
          'SEND_TO_CM': 'SUBMIT_DOCUMENT',
          'SUBMIT_REVISION': 'SUBMIT_DOCUMENT',
        };
        const mappedLogAction = logActionMap[action];
        if (mappedLogAction) {
          logActivity({
            userId,
            userEmail: userData.email,
            userRole,
            siteId: docData.siteId,
            siteName,
            action: mappedLogAction,
            resourceType: 'RFA',
            resourceId: params.id,
            resourceName: docNumber,
            resourceTitle: documentTitle,
            description: buildDescription(mappedLogAction, docNumber),
            metadata: { rfaType: docData.rfaType, newStatus, comments: comments || '' },
          });
        }

        // --- Auto-Supersede: ถ้าอนุมัติ Rev.ใหม่ ให้ Mark Rev.เก่าเป็น SUPERSEDED อัตโนมัติ ---
        // (ตามหลัก Document Control: Rev.ใหม่อนุมัติ = Rev.เก่า Obsolete ทันที ไม่ต้องถาม User)
        if (isFinalApproval && docData.previousRevisionId) {
            try {
                const prevRef = adminDb.collection('rfaDocuments').doc(docData.previousRevisionId);
                const prevDoc = await prevRef.get();
                if (prevDoc.exists) {
                    await prevRef.update({
                        supersededStatus: 'SUPERSEDED',
                        supersededById: params.id,
                        supersededByRevision: docData.revisionNumber || 1,
                        supersededAt: new Date().toISOString(),
                        updatedAt: FieldValue.serverTimestamp(),
                        isLatestApproved: false
                    });
                }
            } catch (supersedeErr) {
                // Non-critical: log but don't fail the main action
                console.error('[PUT] Failed to auto-supersede old revision:', supersedeErr);
            }
        }

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