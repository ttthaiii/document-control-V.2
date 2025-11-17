// src/app/api/work-request/batch-update/route.ts (New API Route)
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { FieldValue, WriteBatch } from 'firebase-admin/firestore';
import { WR_STATUSES, WR_APPROVER_ROLES } from '@/lib/config/workflow';
import { WorkRequestStatus } from '@/types/work-request';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let updatedCount = 0;
  let errorCount = 0;
  const errors: { id: string; error: string }[] = [];
  let ids: string[] = [];

  try {
    // --- Authentication ---
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(token);
    const userId = decodedToken.uid;

    const userDoc = await adminDb.collection('users').doc(userId).get();
    if (!userDoc.exists || !WR_APPROVER_ROLES.includes(userDoc.data()!.role)) {
      return NextResponse.json({ success: false, error: 'Permission denied. Approver role required.' }, { status: 403 });
    }
    const userData = userDoc.data()!;

    // --- Get Data from Request Body ---
    const body = await request.json();
    ids = body.ids; // Assign ค่าให้ ids ที่ประกาศไว้นอก try
    const action = body.action;
    const payload = body.payload;

    if (!Array.isArray(ids) || ids.length === 0 || !action) {
      return NextResponse.json({ success: false, error: 'Missing required fields: ids (array), action.' }, { status: 400 });
    }
    if (action !== 'APPROVE_DRAFT' && action !== 'REJECT_DRAFT') {
        return NextResponse.json({ success: false, error: 'Invalid action.' }, { status: 400 });
    }
    if (action === 'REJECT_DRAFT' && (!payload || !payload.comments || payload.comments.trim() === '')) {
        return NextResponse.json({ success: false, error: 'Comment is required when rejecting.' }, { status: 400 });
    }

    const newStatus: WorkRequestStatus = action === 'APPROVE_DRAFT' ? WR_STATUSES.PENDING_BIM : WR_STATUSES.REJECTED_BY_PM;

    // --- Process Updates using Batched Writes ---
    const batch: WriteBatch = adminDb.batch();
    const workRequestsCollection = adminDb.collection('workRequests');

    // Fetch all documents first to verify status (optional but safer)
    const docRefs = ids.map(id => workRequestsCollection.doc(id));
    const docSnaps = await adminDb.getAll(...docRefs);

    for (const docSnap of docSnaps) {
        const docId = docSnap.id;
        if (!docSnap.exists) {
            console.warn(`[Batch Update WR/${docId}] Document not found.`);
            errorCount++;
            errors.push({ id: docId, error: 'Document not found' });
            continue;
        }

        const docData = docSnap.data()!;

        // Verify if the document is actually in DRAFT status
        if (docData.status !== WR_STATUSES.DRAFT) {
            console.warn(`[Batch Update WR/${docId}] Document not in DRAFT status (Current: ${docData.status}). Skipping.`);
            errorCount++;
            errors.push({ id: docId, error: `Invalid status: ${docData.status}` });
            continue; // Skip this document
        }

        // Prepare update data for this document
        const workflowStep = {
            action,
            status: newStatus,
            userId,
            userName: userData.email,
            role: userData.role,
            timestamp: new Date().toISOString(),
            comments: payload?.comments || '',
            files: [], // Batch actions typically don't involve file uploads
        };

        const updates = {
            status: newStatus,
            workflow: FieldValue.arrayUnion(workflowStep),
            updatedAt: FieldValue.serverTimestamp(),
        };

        // Add update operation to the batch
        batch.update(docSnap.ref, updates);
        updatedCount++;
    }

    // Commit the batch
    if (updatedCount > 0) {
        await batch.commit();
        console.log(`[Batch Update WR] Successfully updated ${updatedCount} documents.`);
    } else {
        console.log(`[Batch Update WR] No documents were updated.`);
    }

    // --- Return Response ---
    return NextResponse.json({
        success: true,
        message: `Processed ${ids.length} items. Updated: ${updatedCount}, Errors: ${errorCount}.`,
        updatedCount,
        errorCount,
        errors: errorCount > 0 ? errors : undefined,
    });

  } catch (error) {
    console.error('[Batch Update WR] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({
        success: false,
        error: errorMessage,
        updatedCount, // Include counts even on error
        errorCount: errorCount + (ids.length - updatedCount - errorCount), // Estimate remaining as errors
        errors,
    }, { status: 500 });
  }
}