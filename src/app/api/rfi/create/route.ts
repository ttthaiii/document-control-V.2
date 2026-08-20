// src/app/api/rfi/create/route.ts
//
// Creates an RFI. Modelled on api/rfa/create/route.ts, with four deliberate differences:
//
//   1. The creator's ROLE decides where the document goes (D-04). There is no UI choice,
//      and the routing table lives in rfi-workflow.ts rather than in an if/else here.
//   2. Storage path falls back to `runningNumber`, never to a shared 'temp' folder.
//      RFA uses 'temp' (roadmap T-002) and RFI must not inherit that.
//   3. The "one BIM Tracking task = one RFI" rule is enforced HERE, not only in the form.
//   4. Site membership is verified before writing.

import { NextResponse } from 'next/server';
import { adminDb, adminBucket, adminAuth } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { ROLES, Role } from '@/lib/config/workflow';
import {
  RFI_ACTIONS,
  RFI_CREATE_ROUTES,
  RFI_ONE_PER_TASK,
  getOriginForRole,
  isValidRfiDiscipline,
  RFI_DISCIPLINES_BY_ORIGIN,
  rfiCounterId,
  buildRfiRunningNumber,
} from '@/lib/config/rfi-workflow';
import { getFileUrl } from '@/lib/utils/storage';
import { ensureCategory } from '@/lib/utils/category';
import { logActivity, buildDescription } from '@/lib/utils/activityLogger';

export const dynamic = 'force-dynamic';

async function verifyIdTokenFromHeader(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('authorization') || '';
  const match = authHeader.match(/^Bearer (.+)$/i);
  if (!match) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(match[1]);
    return decoded.uid;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const uid = await verifyIdTokenFromHeader(req);
  if (!uid) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  let docId: string | null = null;

  try {
    const userDoc = await adminDb.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 403 });
    }
    const userData = userDoc.data()!;
    const userRole: Role = userData.role;

    // --- Routing: the role decides the destination (D-04) ---
    const origin = getOriginForRole(userRole);
    if (!origin) {
      return NextResponse.json(
        { success: false, error: 'บทบาทของคุณไม่มีสิทธิ์สร้างเอกสาร RFI' },
        { status: 403 }
      );
    }
    const route = RFI_CREATE_ROUTES[origin];

    const body = await req.json().catch(() => ({}));
    const { payload } = body;
    const {
      siteId,
      categoryId,
      title,
      description,
      dueDate,
      taskData,
      uploadedFiles,
    } = payload || {};
    let { documentNumber } = payload || {};

    if (!siteId || !categoryId || !title || !uploadedFiles || uploadedFiles.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'ข้อมูลไม่ครบ ต้องมี siteId, categoryId, title และไฟล์แนบอย่างน้อย 1 ไฟล์',
        },
        { status: 400 }
      );
    }

    // --- Discipline (D-07) ---
    // Validated against THIS TEAM's list, not the whole system: BIM works in the four
    // RFA disciplines, ME in Mechanical/Electrical, SN in Sanitary/Plumbing, and
    // Interior + Landscape are shared by all three. So an ME user cannot file a
    // Structural question, and the check is per-origin rather than global.
    const allowedDisciplines = RFI_DISCIPLINES_BY_ORIGIN[origin];
    const discipline = String(categoryId || '').trim();
    if (!isValidRfiDiscipline(discipline, origin)) {
      return NextResponse.json(
        {
          success: false,
          error: `หมวดงาน "${discipline}" ไม่ถูกต้องสำหรับผู้สร้างเอกสารนี้`,
          allowed: allowedDisciplines,
        },
        { status: 400 }
      );
    }

    // --- Site membership ---
    const userSites: string[] = userData.sites || [];
    if (userRole !== ROLES.ADMIN && !userSites.includes(siteId)) {
      return NextResponse.json(
        { success: false, error: 'คุณไม่มีสิทธิ์เข้าถึงโครงการนี้' },
        { status: 403 }
      );
    }

    // --- CM-facing document number (D-03) ---
    if (documentNumber) {
      documentNumber = String(documentNumber).trim().replace(/\s+/g, '-');
    }

    // SITE-created RFIs go straight to CM, so they must carry the number CM replies against.
    if (route.requiresCmNumber && !documentNumber) {
      return NextResponse.json(
        { success: false, error: 'กรุณาระบุเลขที่เอกสารสำหรับส่งให้ CM' },
        { status: 400 }
      );
    }

    if (documentNumber) {
      const existing = await adminDb
        .collection('rfiDocuments')
        .where('siteId', '==', siteId)
        .where('documentNumber', '==', documentNumber)
        .limit(1)
        .get();

      if (!existing.empty) {
        return NextResponse.json(
          { success: false, error: `เลขที่เอกสาร "${documentNumber}" ถูกใช้ไปแล้วในโครงการนี้` },
          { status: 409 }
        );
      }
    }

    // --- BIM Tracking link. Only BIM-created RFIs carry a task (spec section 8). ---
    const finalTaskData = route.linksBimTracking ? taskData || null : null;

    if (RFI_ONE_PER_TASK && finalTaskData?.taskUid) {
      const taskTaken = await adminDb
        .collection('rfiDocuments')
        .where('siteId', '==', siteId)
        .where('taskData.taskUid', '==', finalTaskData.taskUid)
        .limit(1)
        .get();

      if (!taskTaken.empty) {
        return NextResponse.json(
          { success: false, error: 'งานนี้มี RFI ในระบบแล้ว หนึ่งงานถามได้หนึ่งเรื่อง' },
          { status: 409 }
        );
      }
    }

    // --- Running number: RFI-<project code>-<sequence>, one shared counter per project ---
    // BIM and SITE draw from the SAME counter, so the project has one continuous
    // sequence and the number identifies the project, not the team (see rfi-workflow.ts).
    //
    // Both reads and the write happen inside this transaction, which is what makes
    // simultaneous creation safe: Firestore locks the counter document, so a second
    // writer waits and then reads the incremented value. Never move this read out.
    const runningNumber = await adminDb.runTransaction(async (transaction) => {
      const siteRef = adminDb.collection('sites').doc(siteId);
      const siteDoc = await transaction.get(siteRef);
      if (!siteDoc.exists) throw new Error(`Site not found: ${siteId}`);

      let siteShortName: string | undefined = siteDoc.data()?.shortName;

      // Same emulator fallback as RFA, so local testing does not need seeded sites.
      if (!siteShortName) {
        if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true') {
          siteShortName = `TS-${siteId.substring(0, 3)}`.toUpperCase();
          console.warn(`[Emulator] Using fallback shortName: ${siteShortName}`);
        } else {
          throw new Error(`'shortName' is not configured for site ID: ${siteId}`);
        }
      }

      const counterRef = adminDb.collection('counters').doc(rfiCounterId(siteId));
      const counterDoc = await transaction.get(counterRef);

      const nextNumber = counterDoc.exists
        ? (counterDoc.data()?.currentNumber || 0) + 1
        : 1;

      transaction.set(counterRef, { currentNumber: nextNumber }, { merge: true });

      return buildRfiRunningNumber(siteShortName, nextNumber);
    });

    // Category doc keeps the CODE as its id and the Thai label as its name, so the
    // existing category filter (api/sites/[siteId]/categories) lists RFI disciplines
    // alongside RFA's without a second mechanism.
    // Category doc id is the slug of the discipline ('Structural' -> 'STRUCTURAL'),
    // written into the same sites/{siteId}/categories collection RFA uses, so the
    // existing category-filter endpoint lists RFI disciplines without a second mechanism.
    const { id: finalCategoryId } = await ensureCategory(siteId, discipline, {
      name: discipline,
      createdBy: uid,
      docType: 'RFI',
    });

    // --- Move files out of temp into the document's own folder ---
    // Fallback is runningNumber, never 'temp': a BIM-created RFI has no documentNumber
    // for most of its life, so 'temp' would collect files from every document at once.
    const docNumForPath = documentNumber || runningNumber;
    const finalFilesData = [];

    for (const tempFile of uploadedFiles) {
      const sourcePath = tempFile.filePath;
      if (!sourcePath || !sourcePath.startsWith(`temp/${uid}/`)) {
        console.warn(`[RFI Create] Skipping unauthorized file path: ${sourcePath}`);
        continue;
      }

      const destinationPath = `sites/${siteId}/rfi/${docNumForPath}/${Date.now()}_${tempFile.fileName}`;
      await adminBucket.file(sourcePath).move(destinationPath);

      finalFilesData.push({
        ...tempFile,
        fileUrl: getFileUrl(destinationPath),
        filePath: destinationPath,
        uploadedAt: new Date().toISOString(),
        uploadedBy: uid,
        // Files attached at creation have a single obvious recipient.
        audience: null,
      });
    }

    if (finalFilesData.length === 0) {
      return NextResponse.json(
        { success: false, error: 'ไม่พบไฟล์ที่อัปโหลดได้ กรุณาลองแนบไฟล์อีกครั้ง' },
        { status: 400 }
      );
    }

    // --- Write ---
    const rfiRef = adminDb.collection('rfiDocuments').doc();
    docId = rfiRef.id;

    const nowIso = new Date().toISOString();

    await rfiRef.set({
      siteId,
      categoryId: finalCategoryId,
      categoryCode: discipline,
      categoryName: discipline,
      title,
      description: description || '',

      runningNumber,
      documentNumber: documentNumber || '',

      // Hidden from the UI (D-01); drives permissions and routing only.
      origin,

      status: route.status,
      currentStep: route.status,
      awaitingCm: route.awaitingCm,

      dueDate: dueDate ? new Date(dueDate) : null,
      answeredAt: null,
      closedAt: null,

      taskData: finalTaskData,

      files: finalFilesData,
      filesCount: finalFilesData.length,
      totalFileSize: finalFilesData.reduce(
        (sum: number, f: { size?: number }) => sum + (f.size || 0),
        0
      ),

      workflow: [
        {
          action: RFI_ACTIONS.CREATE,
          status: route.status,
          userId: uid,
          userName: userData.email,
          role: userRole,
          timestamp: nowIso,
          comments: '',
          files: finalFilesData,
          awaitingCm: route.awaitingCm,
        },
      ],

      createdBy: uid,
      updatedBy: uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const siteDoc = await adminDb.collection('sites').doc(siteId).get();
    const siteName = siteDoc.data()?.name || '';
    const resourceName = documentNumber || runningNumber;

    logActivity({
      userId: uid,
      userEmail: userData.email || '',
      userRole,
      siteId,
      siteName,
      action: 'CREATE_DOCUMENT',
      resourceType: 'RFI',
      resourceId: rfiRef.id,
      resourceName,
      resourceTitle: title,
      description: buildDescription('CREATE_DOCUMENT', resourceName),
      metadata: { origin, status: route.status, awaitingCm: route.awaitingCm },
    });

    return NextResponse.json(
      { success: true, id: rfiRef.id, runningNumber, documentNumber: documentNumber || '' },
      { status: 201 }
    );
  } catch (err) {
    console.error('RFI Create Error:', err);
    if (docId) {
      await adminDb
        .collection('rfiDocuments')
        .doc(docId)
        .delete()
        .catch((e) => console.error('[RFI Create] Cleanup failed:', e));
    }
    const details = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: 'Internal Server Error', details },
      { status: 500 }
    );
  }
}
