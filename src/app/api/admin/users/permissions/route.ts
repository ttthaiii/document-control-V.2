import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { ROLES } from '@/lib/config/workflow';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // 1. Auth Check
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(token);
    
    // ตรวจสอบว่าเป็น Admin
    const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
    if (!userDoc.exists || userDoc.data()?.role !== ROLES.ADMIN) {
        return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // 2. Get Data
    const { siteId, targetUserId, overrides } = await request.json();

    if (!siteId || !targetUserId || !overrides) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 3. Prepare Update Data
    // Firestore Nested Map Update: "userOverrides.{userId}"
    // เราจะบันทึกทับ Object ของ User คนนั้นใน Site นั้นไปเลย
    const updateField = `userOverrides.${targetUserId}`;

    await adminDb.collection('sites').doc(siteId).update({
        [updateField]: overrides
    });

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Update permissions error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}