// src/app/api/admin/users/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { ROLES } from '@/lib/config/workflow';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // 1. ตรวจสอบสิทธิ์ Admin
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

    // 2. ดึงรายชื่อ User ทั้งหมด (เอา orderBy ออก เพื่อให้ได้ข้อมูลครบ)
    const usersSnapshot = await adminDb.collection('users').get();
    
    const users = usersSnapshot.docs.map(doc => {
      const data = doc.data();
      
      // Logic: ถ้าไม่มี createdAt ให้ใช้ acceptedAt แทน
      const createdDate = data.createdAt?.toDate() || data.acceptedAt?.toDate() || null;

      return {
        id: doc.id,
        ...data,
        // ส่งกลับเป็น String เพื่อให้ Frontend ใช้งานง่าย
        createdAt: createdDate ? createdDate.toISOString() : null,
        lastLogin: data.lastLogin?.toDate().toISOString() || null,
        // เก็บค่า timestamp ไว้ใช้ sort ในขั้นตอนถัดไป
        _sortDate: createdDate ? createdDate.getTime() : 0 
      };
    });

    // 3. เรียงลำดับข้อมูลเอง (ใหม่สุดขึ้นก่อน)
    users.sort((a, b) => b._sortDate - a._sortDate);

    // ลบ field ชั่วคราวออกก่อนส่งกลับ
    const sanitizedUsers = users.map(({ _sortDate, ...user }) => user);

    return NextResponse.json({ success: true, users: sanitizedUsers });

  } catch (error: any) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}