import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { sendPasswordResetEmail } from '@/lib/utils/email';

export async function POST(request: NextRequest) {
    try {
        const { email } = await request.json();

        if (!email) {
            return NextResponse.json({ error: 'กรุณาระบุอีเมล' }, { status: 400 });
        }

        // To prevent email enumeration, we always return success.
        const successResponse = NextResponse.json({ success: true, message: 'หากมีอีเมลนี้อยู่ในระบบ ระบบได้ส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปให้แล้ว' });

        try {
            // 1. ตรวจสอบว่ามีผู้ใช้นี้ใน Firebase Auth หรือไม่ (ถ้าไม่มี จะ throw error)
            const userRecord = await adminAuth.getUserByEmail(email);

            // 2. ดึงชื่อผู้ใช้จาก Firestore มาแสดงในอีเมลเพื่อความสวยงาม (ถ้ามี)
            let userName = userRecord.displayName || 'ผู้ใช้งาน';
            try {
                const userDoc = await adminDb.collection('users').doc(userRecord.uid).get();
                if (userDoc.exists && userDoc.data()?.name) {
                    userName = userDoc.data()?.name;
                }
            } catch (dbError) {
                console.warn(`Could not fetch user name from Firestore for ${email}:`, dbError);
                // Continue even if Firestore fetch fails
            }

            // 3. สร้าง Password Reset Link (อายุ 1 ชั่วโมงตามค่าเริ่มต้นของ Firebase)
            const fullLink = await adminAuth.generatePasswordResetLink(email);

            // ดึง oobCode ออกมาจาก Link ของ Firebase
            const urlObj = new URL(fullLink);
            const oobCode = urlObj.searchParams.get('oobCode');

            // สร้างลิงก์ใหม่ชี้มาที่เว็บของเราเอง (ใช้โดเมนของ Firebase Hosting เป็นค่าเริ่มต้น)
            let appDomain = process.env.NEXT_PUBLIC_APP_URL || 'https://ttsdocumentcontrol.web.app';
            // ถ้าบน Server (Production) ดึงค่า localhost มาบังเอิญ ให้แก้เป็น Domain จริงทันที
            if (appDomain.includes('localhost') && process.env.NODE_ENV !== 'development') {
                appDomain = 'https://ttsdocumentcontrol.web.app';
            }
            const customResetLink = `${appDomain}/reset-password?oobCode=${oobCode}`;

            // 4. ส่งอีเมลด้วย Template สีส้มของเรา
            await sendPasswordResetEmail(email, customResetLink, userName);

            console.log(`Password reset email sent to ${email}`);
        } catch (authError: any) {
            // ถ้า Error เพราะไม่พบอีเมลในระบบ (auth/user-not-found) เราก็ทำเป็นเงียบๆ ไว้ เพื่อป้องกัน Email Enumeration
            if (authError.code === 'auth/user-not-found') {
                console.log(`Password reset requested for non-existent email: ${email}`);
            } else {
                // ส่วน Error อื่นๆ (เช่น เครือข่ายล่ม, ส่งเมลไม่ผ่าน) บันทึกไว้ตรวจสอบได้
                console.error('Error generating or sending password reset link:', authError);
                // ใน Production ควร Return Success เหมือนกันเพื่อไม่ให้ Attacker เดาได้
                // แต่ในโหมด Dev หรือถ้าต้องการให้ผู้ใช้รู้ว่ามีปัญหา อาจจะ return error
            }
        }

        // คืนค่า Success เสมอ ไม่ว่าจะเกิด Error อะไรที่ไม่คาดคิดใน Auth หรือไม่ก็ตาม
        return successResponse;

    } catch (error: any) {
        console.error('Forgot password endpoint error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to process forgot password request' },
            { status: 500 }
        );
    }
}
