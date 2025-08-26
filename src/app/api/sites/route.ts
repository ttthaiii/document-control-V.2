// app/api/sites/route.ts (ไฟล์ใหม่)
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authorization required' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(token);

    // ดึง user profile
    const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
    const userProfile = userDoc.data();

    if (!userProfile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    // ดึง sites ที่ user มีสิทธิ์เข้าถึง
    const sitesSnapshot = await adminDb.collection('sites').get();
    const sites = sitesSnapshot.docs
      .map((doc: any) => ({ id: doc.id, ...doc.data() }))
      .filter((site: any) => site.members?.includes(decodedToken.uid));

    return NextResponse.json({
      success: true,
      sites: sites
    });

  } catch (error: any) {
    console.error('❌ Sites API error:', error);
    return NextResponse.json(
      { success: false, error: error.message }, 
      { status: 500 }
    );
  }
}