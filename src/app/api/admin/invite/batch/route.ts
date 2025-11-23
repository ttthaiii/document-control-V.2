import { NextRequest, NextResponse } from 'next/server';
import { InvitationService } from '@/lib/auth/invitation-service';
import { sendInvitationEmail } from '@/lib/utils/email';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { Role } from '@/lib/config/workflow';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // 1. ตรวจสอบสิทธิ์
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(token);
    const inviterDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
    const inviterName = inviterDoc.data()?.name || 'Admin';

    // 2. รับข้อมูลเป็น Array
    const { users, sites } = await request.json(); // users = [{ email, name, employeeId, role }, ...], sites = [siteId1, siteId2]

    if (!Array.isArray(users) || users.length === 0 || !Array.isArray(sites)) {
      return NextResponse.json({ error: 'Invalid data format' }, { status: 400 });
    }

    const results = {
      success: 0,
      failed: 0,
      details: [] as any[]
    };

    const usersRef = adminDb.collection('users'); // เตรียม Reference
    
    // 3. วนลูปสร้าง Invite
    for (const user of users) {
      try {
        if (!user.email || !user.name || !user.employeeId || !user.role) {
            throw new Error(`ข้อมูลไม่ครบ: ${user.email || 'Unknown'}`);
        }

        const emailCheck = await usersRef.where('email', '==', user.email).limit(1).get();
        if (!emailCheck.empty) {
            throw new Error(`อีเมล ${user.email} มีอยู่แล้ว`);
        }

        const empIdCheck = await usersRef.where('employeeId', '==', user.employeeId).limit(1).get();
        if (!empIdCheck.empty) {
            throw new Error(`รหัสพนักงาน ${user.employeeId} มีอยู่แล้ว`);
        }
        
        const inviteResult = await InvitationService.createInvitation({
          email: user.email,
          name: user.name,
          employeeId: user.employeeId,
          role: user.role as Role,
          sites: sites // ใช้ Site ชุดเดียวกันกับที่เลือกหน้าเว็บ
        });

        // ส่งอีเมล
        await sendInvitationEmail(
          user.email,
          inviteResult.invitationUrl!,
          inviterName,
          { name: user.name, role: user.role }
        );

        results.success++;
        results.details.push({ email: user.email, status: 'success' });

      } catch (err: any) {
        console.error(`Failed to invite ${user.email}:`, err);
        results.failed++;
        results.details.push({ email: user.email, status: 'error', reason: err.message });
      }
    }

    return NextResponse.json({ success: true, summary: results });

  } catch (error: any) {
    console.error('Batch invite error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}