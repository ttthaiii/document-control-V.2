// src/app/api/rfi/used-tasks/route.ts
//
// Lists the BIM Tracking task UIDs that already carry an RFI for a given site.
// The create form uses this to HIDE already-used tasks from the selectable list
// (one BIM task carries exactly one RFI — RFI_ONE_PER_TASK).
//
// The client cannot read `rfiDocuments` directly (security rules), so this runs
// with the admin SDK — mirroring the auth of `api/rfi/check-duplicate`.
// UI-only: `api/rfi/create` still enforces uniqueness server-side.

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
      await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1]);
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { siteId } = await request.json();

    if (!siteId) {
      return NextResponse.json({ error: 'siteId is required.' }, { status: 400 });
    }

    const snapshot = await adminDb
      .collection('rfiDocuments')
      .where('siteId', '==', siteId)
      .get();

    const taskUids = Array.from(
      new Set(
        snapshot.docs
          .map((doc) => doc.data().taskData?.taskUid)
          .filter((uid): uid is string => Boolean(uid))
      )
    );

    return NextResponse.json({ taskUids });
  } catch (error) {
    console.error('RFI used-tasks error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
