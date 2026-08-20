// src/app/api/rfi/check-duplicate/route.ts
//
// Live duplicate check for the create form. Handles both uniqueness rules:
//   documentNumber — the CM-facing number, unique per site
//   taskUid        — one BIM Tracking task carries exactly one RFI (RFI_ONE_PER_TASK)
//
// This is UI feedback only. `api/rfi/create` re-checks both server-side, so a client
// that skips this endpoint still cannot create a duplicate.

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // The RFA equivalent has no auth check, which lets anyone probe whether a document
    // number exists. Requiring a token here costs nothing and closes that.
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
      await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1]);
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { siteId, documentNumber, taskUid } = await request.json();

    if (!siteId) {
      return NextResponse.json({ error: 'siteId is required.' }, { status: 400 });
    }
    if (!documentNumber && !taskUid) {
      return NextResponse.json(
        { error: 'Either documentNumber or taskUid is required.' },
        { status: 400 }
      );
    }

    const field = documentNumber ? 'documentNumber' : 'taskData.taskUid';
    const value = documentNumber ? String(documentNumber).trim() : String(taskUid).trim();

    const snapshot = await adminDb
      .collection('rfiDocuments')
      .where('siteId', '==', siteId)
      .where(field, '==', value)
      .limit(1)
      .get();

    return NextResponse.json({
      isDuplicate: !snapshot.empty,
      field: documentNumber ? 'documentNumber' : 'taskUid',
    });
  } catch (error) {
    console.error('RFI check-duplicate error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
