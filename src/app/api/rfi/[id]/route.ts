// src/app/api/rfi/[id]/route.ts
//
// GET one RFI (with the buttons the caller is allowed to press) and PUT one action.
// Modelled on api/rfa/[id]/route.ts, with four deliberate differences:
//
//   1. ONE function decides what is allowed — `evaluateAction` — and both GET and PUT
//      call it. RFA writes the same branching twice in one file (roadmap T-001 site 1),
//      which is how a button can appear that the API then rejects.
//   2. The rules are READ from RFI_TRANSITIONS, not restated in a switch. Adding an
//      action means adding a row to that table.
//   3. NO notification code. LINE and push live in the Cloud Function (roadmap T-003),
//      so a notification failure can never block the click.
//   4. Files ACCUMULATE instead of replacing. An RFI is a conversation: BIM's question,
//      SITE's answer, and CM's reply all stay attached, each tagged with its `audience`.
//      RFA replaces because a new revision supersedes the old drawing; nothing here does.

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth, adminBucket } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { ROLES, Role } from '@/lib/config/workflow';
import {
  RFI_ACTIONS,
  RFI_ACTION_LABELS,
  RFI_TRANSITIONS,
  RFI_PARTY_ROLES,
  RFI_SITE_ROLES,
  askerParty,
  hasSiteMiddleman,
  isFullyClosed,
  RFIAction,
  RFIOrigin,
  RFIStatus,
  RFIFileAudience,
} from '@/lib/config/rfi-workflow';
import { RFIFile, RFIPermissions } from '@/types/rfi';
import { getFileUrl } from '@/lib/utils/storage';
import { logActivity } from '@/lib/utils/activityLogger';
import { LogAction } from '@/types/activity-log';

export const dynamic = 'force-dynamic';

/** Every action except CREATE, which belongs to api/rfi/create. */
type WorkflowAction = Exclude<RFIAction, 'CREATE'>;

/** Which flag in the GET response each action controls. */
const PERMISSION_KEY: Record<WorkflowAction, keyof RFIPermissions> = {
  [RFI_ACTIONS.ANSWER]: 'canAnswer',
  [RFI_ACTIONS.FORWARD_TO_CM]: 'canForwardToCm',
  [RFI_ACTIONS.ANSWER_AND_FORWARD]: 'canAnswerAndForward',
  [RFI_ACTIONS.CM_REPLY]: 'canRecordCmReply',
  [RFI_ACTIONS.ACKNOWLEDGE]: 'canAcknowledge',
  [RFI_ACTIONS.REQUEST_MORE_INFO]: 'canRequestMoreInfo',
};

/**
 * The activity log's action list is shared with RFA and has no RFI-specific entries,
 * so each RFI action is filed under its closest match. The exact action is preserved
 * in the log's `metadata.rfiAction` and in the human-readable description.
 */
const LOG_ACTION: Record<WorkflowAction, LogAction> = {
  [RFI_ACTIONS.ANSWER]: 'SUBMIT_DOCUMENT',
  [RFI_ACTIONS.FORWARD_TO_CM]: 'SUBMIT_DOCUMENT',
  [RFI_ACTIONS.ANSWER_AND_FORWARD]: 'SUBMIT_DOCUMENT',
  [RFI_ACTIONS.CM_REPLY]: 'SUBMIT_DOCUMENT',
  [RFI_ACTIONS.ACKNOWLEDGE]: 'APPROVE_DOCUMENT',
  [RFI_ACTIONS.REQUEST_MORE_INFO]: 'REQUEST_REVISION',
};

const VALID_AUDIENCES: RFIFileAudience[] = [null, 'BIM', 'CM'];

interface ActionContext {
  role: Role;
  status: string;
  awaitingCm: boolean;
  /** Which side raised the question. Decides who may close it (actorIsAsker). */
  origin: RFIOrigin;
  /** EXTERNAL projects have no CM user in the system; SITE records the reply instead. */
  cmSystemType: 'INTERNAL' | 'EXTERNAL';
}

interface Verdict {
  allowed: boolean;
  reason: string;
}

/**
 * Is this action available to this user on this document RIGHT NOW?
 *
 * Deliberately covers role + state ONLY. The document-number requirement is checked in
 * PUT against the request body, not here: SITE types that number INTO the forward
 * dialog, so a document without one must still show the button.
 */
function evaluateAction(action: WorkflowAction, ctx: ActionContext): Verdict {
  const transition = RFI_TRANSITIONS[action];
  if (!transition) return { allowed: false, reason: `Unknown action: ${action}` };

  // --- Who may act ---
  // Closing and asking-for-more belong to whoever RAISED the question, so their party
  // comes from the document's origin rather than the table's fixed `actor`. This is
  // what stops an ME user from closing a question BIM raised.
  const actorParty = transition.actorIsAsker
    ? askerParty(ctx.origin)
    : transition.actor;

  let actorAllowed = RFI_PARTY_ROLES[actorParty].includes(ctx.role);

  // On EXTERNAL-CM projects the CM is outside the system: they answer by email or
  // paper, and SITE records what came back. Without this, an EXTERNAL project would
  // have no one able to close the CM track at all.
  if (
    !actorAllowed &&
    action === RFI_ACTIONS.CM_REPLY &&
    ctx.cmSystemType === 'EXTERNAL' &&
    RFI_SITE_ROLES.includes(ctx.role)
  ) {
    actorAllowed = true;
  }

  if (!actorAllowed) {
    return { allowed: false, reason: `บทบาท ${ctx.role} ไม่มีสิทธิ์ทำรายการนี้` };
  }

  // --- State gate ---
  // `from: null` means the action is not gated on `status`. CM_REPLY is the only one:
  // it belongs to the parallel CM track, so it is gated on awaitingCm instead. A
  // question can be closed on the BIM side while CM still owes an answer.
  if (transition.from === null) {
    if (action === RFI_ACTIONS.CM_REPLY && !ctx.awaitingCm) {
      return { allowed: false, reason: 'เอกสารนี้ไม่ได้รออยู่ที่ CM' };
    }
    return { allowed: true, reason: '' };
  }

  if (!transition.from.includes(ctx.status as never)) {
    return { allowed: false, reason: 'ไม่สามารถทำรายการนี้ได้ในสถานะปัจจุบัน' };
  }

  // "Ask for more information" hands the question back to SITE, which only exists on a
  // BIM-raised document. ME / SN / SITE went straight to CM, so there is no SITE step
  // to return to — offering the button there would send the document somewhere nobody
  // is watching.
  if (transition.requiresSiteMiddleman && !hasSiteMiddleman(ctx.origin)) {
    return { allowed: false, reason: 'เอกสารนี้ไม่ได้ผ่านทาง SITE' };
  }

  return { allowed: true, reason: '' };
}

function buildPermissions(ctx: ActionContext): RFIPermissions {
  const permissions: RFIPermissions = {
    canView: true,
    canDownloadFiles: true,
    canAnswer: false,
    canForwardToCm: false,
    canAnswerAndForward: false,
    canRecordCmReply: false,
    canAcknowledge: false,
    canRequestMoreInfo: false,
  };

  // Same function PUT uses, so a visible button is always an accepted button.
  (Object.keys(PERMISSION_KEY) as WorkflowAction[]).forEach(action => {
    permissions[PERMISSION_KEY[action]] = evaluateAction(action, ctx).allowed;
  });

  return permissions;
}

async function authenticate(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1]);
    return decoded.uid;
  } catch {
    return null;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await authenticate(request);
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const userDoc = await adminDb.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }
    const userData = userDoc.data()!;
    const userRole: Role = userData.role;

    const rfiDoc = await adminDb.collection('rfiDocuments').doc(params.id).get();
    if (!rfiDoc.exists) {
      return NextResponse.json({ success: false, error: 'RFI not found' }, { status: 404 });
    }
    const rfiData = rfiDoc.data()!;

    const userSites: string[] = userData.sites || [];
    if (userRole !== ROLES.ADMIN && !userSites.includes(rfiData.siteId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    let siteInfo = { id: rfiData.siteId, name: 'N/A', cmSystemType: 'INTERNAL' as const };
    let cmSystemType: 'INTERNAL' | 'EXTERNAL' = 'INTERNAL';

    if (rfiData.siteId) {
      const siteDoc = await adminDb.collection('sites').doc(rfiData.siteId).get();
      if (siteDoc.exists) {
        const siteData = siteDoc.data();
        cmSystemType = siteData?.cmSystemType === 'EXTERNAL' ? 'EXTERNAL' : 'INTERNAL';
        siteInfo = {
          id: siteDoc.id,
          name: siteData?.name || 'Unknown Site',
          cmSystemType: cmSystemType as 'INTERNAL',
        };
      }
    }

    const permissions = buildPermissions({
      role: userRole,
      status: rfiData.status,
      awaitingCm: rfiData.awaitingCm === true,
      origin: (rfiData.origin || 'BIM') as RFIOrigin,
      cmSystemType,
    });

    return NextResponse.json({
      success: true,
      document: {
        id: rfiDoc.id,
        ...rfiData,
        site: siteInfo,
        category: {
          id: rfiData.categoryId,
          categoryCode: rfiData.categoryCode || rfiData.categoryName || 'N/A',
          categoryName: rfiData.categoryName || '',
        },
        permissions,
        currentUser: {
          id: userId,
          role: userRole,
          isCreator: rfiData.createdBy === userId,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching RFI:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await authenticate(request);
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const userDoc = await adminDb.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }
    const userData = userDoc.data()!;
    const userRole: Role = userData.role;

    const body = await request.json().catch(() => ({}));
    const { action, comments, newFiles } = body as {
      action?: WorkflowAction;
      comments?: string;
      newFiles?: RFIFile[];
    };
    let { documentNumber } = body as { documentNumber?: string };

    if (!action) {
      return NextResponse.json({ success: false, error: 'Action is required' }, { status: 400 });
    }
    const transition = RFI_TRANSITIONS[action];
    if (!transition) {
      return NextResponse.json(
        { success: false, error: `ไม่รู้จักรายการ "${action}"`, allowed: Object.keys(RFI_TRANSITIONS) },
        { status: 400 }
      );
    }

    const rfiRef = adminDb.collection('rfiDocuments').doc(params.id);
    const rfiDoc = await rfiRef.get();
    if (!rfiDoc.exists) {
      return NextResponse.json({ success: false, error: 'RFI not found' }, { status: 404 });
    }
    const docData = rfiDoc.data()!;

    const userSites: string[] = userData.sites || [];
    if (userRole !== ROLES.ADMIN && !userSites.includes(docData.siteId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const siteDoc = await adminDb.collection('sites').doc(docData.siteId).get();
    const siteData = siteDoc.data();
    const cmSystemType: 'INTERNAL' | 'EXTERNAL' =
      siteData?.cmSystemType === 'EXTERNAL' ? 'EXTERNAL' : 'INTERNAL';

    // --- The same gate GET used to decide whether to show this button ---
    const verdict = evaluateAction(action, {
      role: userRole,
      status: docData.status,
      awaitingCm: docData.awaitingCm === true,
      origin: (docData.origin || 'BIM') as RFIOrigin,
      cmSystemType,
    });
    if (!verdict.allowed) {
      return NextResponse.json({ success: false, error: verdict.reason }, { status: 403 });
    }

    // --- Evidence ---
    if (transition.requiresFiles && (!Array.isArray(newFiles) || newFiles.length === 0)) {
      return NextResponse.json(
        { success: false, error: `"${RFI_ACTION_LABELS[action]}" ต้องแนบไฟล์อย่างน้อย 1 ไฟล์` },
        { status: 400 }
      );
    }

    // --- CM-facing number (D-03). Checked here, not in evaluateAction, because the
    // number arrives WITH this request: SITE types it into the forward dialog. ---
    if (documentNumber) {
      documentNumber = String(documentNumber).trim().replace(/\s+/g, '-');
    }
    const effectiveDocNumber = documentNumber || docData.documentNumber || '';

    if (transition.requiresCmNumber && !effectiveDocNumber) {
      return NextResponse.json(
        { success: false, error: 'กรุณาระบุเลขที่เอกสารสำหรับส่งให้ CM' },
        { status: 400 }
      );
    }

    // A new number must not collide with another document in the same project.
    // Same known gap as RFA: this read is outside a transaction, so two people
    // submitting the same number in the same instant can both pass (roadmap T-001).
    if (documentNumber && documentNumber !== docData.documentNumber) {
      const clash = await adminDb
        .collection('rfiDocuments')
        .where('siteId', '==', docData.siteId)
        .where('documentNumber', '==', documentNumber)
        .limit(1)
        .get();
      if (!clash.empty && clash.docs[0].id !== params.id) {
        return NextResponse.json(
          { success: false, error: `เลขที่เอกสาร "${documentNumber}" ถูกใช้ไปแล้วในโครงการนี้` },
          { status: 409 }
        );
      }
    }

    // --- Files ---
    // Fallback is runningNumber, never a shared 'temp' folder (roadmap T-002): a
    // BIM-raised RFI has no documentNumber for most of its life.
    const docNumForPath = effectiveDocNumber || docData.runningNumber;
    const movedFiles: RFIFile[] = [];

    if (Array.isArray(newFiles) && newFiles.length > 0) {
      for (const tempFile of newFiles) {
        const audience = (tempFile.audience ?? null) as RFIFileAudience;
        if (!VALID_AUDIENCES.includes(audience)) {
          return NextResponse.json(
            { success: false, error: `ปลายทางของไฟล์ไม่ถูกต้อง: ${audience}` },
            { status: 400 }
          );
        }

        const sourcePath = tempFile.filePath;
        if (!sourcePath || !sourcePath.startsWith(`temp/${userId}/`)) {
          console.warn(`[RFI ${action}] Skipping unauthorized file path: ${sourcePath}`);
          continue;
        }

        const destinationPath =
          `sites/${docData.siteId}/rfi/${docNumForPath}/${Date.now()}_${tempFile.fileName}`;
        await adminBucket.file(sourcePath).move(destinationPath);

        movedFiles.push({
          ...tempFile,
          fileUrl: getFileUrl(destinationPath),
          filePath: destinationPath,
          uploadedAt: new Date().toISOString(),
          uploadedBy: userId,
          // Which side this file is for. ANSWER_AND_FORWARD sends two sets at once,
          // so the flag has to live on the file, not on the workflow entry.
          audience,
        } as RFIFile);
      }

      if (movedFiles.length === 0 && transition.requiresFiles) {
        return NextResponse.json(
          { success: false, error: 'ไม่พบไฟล์ที่อัปโหลดได้ กรุณาลองแนบไฟล์อีกครั้ง' },
          { status: 400 }
        );
      }
    }

    // --- Apply the transition. Everything comes from the table; `null` means leave alone. ---
    // toStatusWhenFrom wins over toStatus when the current status is listed: CM_REPLY
    // leaves `status` alone in general (so it cannot reopen a closed question) but DOES
    // move a document that is still sitting at PENDING_CM back to whoever asked.
    const overrideStatus = transition.toStatusWhenFrom?.[docData.status as RFIStatus];
    const newStatus: string = overrideStatus ?? transition.toStatus ?? docData.status;
    const newAwaitingCm: boolean =
      transition.setAwaitingCm === null ? docData.awaitingCm === true : transition.setAwaitingCm;

    const existingFiles: RFIFile[] = docData.files || [];
    const allFiles = [...existingFiles, ...movedFiles];

    const nowIso = new Date().toISOString();

    const workflowEntry = {
      action,
      status: newStatus,
      userId,
      userName: userData.email || '',
      role: userRole,
      timestamp: nowIso,
      comments: comments || '',
      files: movedFiles,
      awaitingCm: newAwaitingCm,
    };

    const updates: Record<string, unknown> = {
      status: newStatus,
      currentStep: newStatus,
      awaitingCm: newAwaitingCm,
      workflow: FieldValue.arrayUnion(workflowEntry),
      updatedBy: userId,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (documentNumber) updates.documentNumber = documentNumber;

    if (movedFiles.length > 0) {
      updates.files = allFiles;
      updates.filesCount = allFiles.length;
      updates.totalFileSize = allFiles.reduce((sum, f) => sum + (f.size || 0), 0);
    }

    // First answer wins — answeredAt records when the question was first answered,
    // not when it was last touched.
    const isAnswering: WorkflowAction[] = [
      RFI_ACTIONS.ANSWER,
      RFI_ACTIONS.ANSWER_AND_FORWARD,
      RFI_ACTIONS.CM_REPLY,
    ];
    if (isAnswering.includes(action) && !docData.answeredAt) {
      updates.answeredAt = FieldValue.serverTimestamp();
    }

    // Closed means BOTH tracks are settled. ACKNOWLEDGE alone does not qualify while
    // CM still owes a reply, which is why this is computed after the transition.
    const nowFullyClosed = isFullyClosed({ status: newStatus, awaitingCm: newAwaitingCm });
    if (nowFullyClosed && !docData.closedAt) {
      updates.closedAt = FieldValue.serverTimestamp();
    } else if (!nowFullyClosed && docData.closedAt) {
      // REQUEST_MORE_INFO can reopen a closed question.
      updates.closedAt = null;
    }

    await rfiRef.update(updates);

    // No notification call here on purpose — see the header note (roadmap T-003).
    // on-rfi-update reacts to this write and owns LINE.

    const resourceName = effectiveDocNumber || docData.runningNumber;
    logActivity({
      userId,
      userEmail: userData.email || '',
      userRole,
      siteId: docData.siteId,
      siteName: siteData?.name || '',
      action: LOG_ACTION[action],
      resourceType: 'RFI',
      resourceId: params.id,
      resourceName,
      resourceTitle: docData.title || '',
      description: `${RFI_ACTION_LABELS[action]} เอกสาร "${resourceName}"`,
      metadata: {
        rfiAction: action,
        fromStatus: docData.status,
        toStatus: newStatus,
        awaitingCm: newAwaitingCm,
        filesAdded: movedFiles.length,
      },
    });

    return NextResponse.json({
      success: true,
      id: params.id,
      action,
      status: newStatus,
      awaitingCm: newAwaitingCm,
      closed: nowFullyClosed,
    });
  } catch (error) {
    console.error('RFI Action Error:', error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: 'Internal Server Error', details },
      { status: 500 }
    );
  }
}
