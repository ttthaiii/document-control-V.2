// src/app/api/admin/permissions/override/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { ROLES } from '@/lib/config/workflow';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // 1. Check Admin Permission
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(token);
    
    const requestUserDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
    if (!requestUserDoc.exists || requestUserDoc.data()?.role !== ROLES.ADMIN) {
        return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // 2. Get Data from Body
    const { siteId, targetUserId, overrides } = await request.json();

    if (!siteId || !targetUserId || !overrides) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 3. Update Site Document
    // โครงสร้างข้อมูล: userOverrides.[userId] = { RFA: {...}, WORK_REQUEST: {...} }
    const updatePath = `userOverrides.${targetUserId}`;
    
    await adminDb.collection('sites').doc(siteId).update({
        [updatePath]: overrides
    });

    return NextResponse.json({ success: true, message: 'Permissions updated successfully' });

  } catch (error: any) {
    console.error('Error updating permissions:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}