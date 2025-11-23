import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { ROLES } from '@/lib/config/workflow';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(token);

    const adminDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
    if (!adminDoc.exists || adminDoc.data()?.role !== ROLES.ADMIN) return NextResponse.json({ error: 'Permission denied' }, { status: 403 });

    const snapshot = await adminDb.collection('users').get();
    const users = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        email: data.email,
        name: data.name || '',             // 👈 ส่ง name
        employeeId: data.employeeId || '', // 👈 ส่ง employeeId
        role: data.role,
        status: data.status,
        sites: data.sites || [],
        createdAt: (data.createdAt || data.acceptedAt)?.toDate?.().toISOString() || null,
        lastLogin: data.lastLogin?.toDate?.().toISOString() || null,
      };
    });

    users.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
    });

    return NextResponse.json({ success: true, users });
  } catch (error: any) { return NextResponse.json({ success: false, error: error.message }, { status: 500 }); }
}