import { NextRequest, NextResponse } from 'next/server';
import { InvitationService } from '@/lib/auth/invitation-service';
import { sendInvitationEmail } from '@/lib/utils/email'; // 👈 Import
import { adminAuth, adminDb } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // 1. ตรวจสอบสิทธิ์
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(token);
    const inviterDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
    const inviterName = inviterDoc.data()?.name || inviterDoc.data()?.email || 'Admin';

    // 2. รับข้อมูล (รวม Name/ID)
    const { email, role, sites, name, employeeId } = await request.json();

    if (!email || !role || !sites || !name || !employeeId) {
      return NextResponse.json(
        { error: 'กรุณากรอกข้อมูลให้ครบถ้วน (อีเมล, ชื่อ, รหัสพนักงาน, ตำแหน่ง, โครงการ)' },
        { status: 400 }
      );
    }

    const usersRef = adminDb.collection('users');
    
    // เช็คอีเมลซ้ำ
    const emailCheck = await usersRef.where('email', '==', email).limit(1).get();
    if (!emailCheck.empty) {
      return NextResponse.json({ error: `อีเมล ${email} มีอยู่ในระบบแล้ว` }, { status: 409 });
    }

    // เช็ครหัสพนักงานซ้ำ
    const empIdCheck = await usersRef.where('employeeId', '==', employeeId).limit(1).get();
    if (!empIdCheck.empty) {
      return NextResponse.json({ error: `รหัสพนักงาน ${employeeId} มีอยู่ในระบบแล้ว` }, { status: 409 });
    }
    
    // 3. สร้าง Invite ใน DB
    const result = await InvitationService.createInvitation({
      email, role, sites, name, employeeId
    });

    // 4. ส่งอีเมล
    try {
      await sendInvitationEmail(
        email, 
        result.invitationUrl!, 
        inviterName, 
        { name, role }
      );
    } catch (emailError) {
      console.error('Failed to send email:', emailError);
      // คืนค่า Warning แทน Error เพื่อให้ UI รู้ว่าสร้างสำเร็จแต่ส่งเมลไม่ผ่าน
      return NextResponse.json({ 
        ...result, 
        warning: 'สร้างคำเชิญสำเร็จ แต่ระบบส่งอีเมลขัดข้อง กรุณาส่งลิงก์ด้วยตนเอง' 
      });
    }

    return NextResponse.json({ ...result, success: true });

  } catch (error) {
    console.error('Error in invite API:', error);
    return NextResponse.json({ error: 'Failed to create invitation' }, { status: 500 });
  }
}