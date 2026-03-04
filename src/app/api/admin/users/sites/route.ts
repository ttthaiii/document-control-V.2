import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { ROLES } from '@/lib/config/workflow';

export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await adminAuth.verifyIdToken(token);

        // ตรวจสอบสิทธิ์ Admin 
        const adminDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
        if (!adminDoc.exists || adminDoc.data()?.role !== ROLES.ADMIN) {
            return NextResponse.json({ success: false, error: 'Access denied: Admin role required' }, { status: 403 });
        }

        const data = await request.json();
        const { targetUserId, sites } = data;

        if (!targetUserId || !Array.isArray(sites)) {
            return NextResponse.json({ success: false, error: 'Missing or invalid targetUserId or sites' }, { status: 400 });
        }

        // 1. ตรวจสอบว่ามี User นี้ใน Firebase Auth หรือไม่ (เพื่อความมั่นใจ)
        try {
            await adminAuth.getUser(targetUserId);
        } catch (authError) {
            return NextResponse.json({ success: false, error: 'User not found in Authentication system' }, { status: 404 });
        }

        // 2. อัปเดตข้อมูล sites ลงใน Firestore collection 'users'
        const targetUserRef = adminDb.collection('users').doc(targetUserId);

        // เราใช้ set(..., { merge: true }) เพื่อให้แน่ใจว่าฟิลด์ sites ถูกเขียนทับ/อัปเดต โดยไม่ลบข้อมูลเดิมที่เหลืออยู่
        await targetUserRef.set({
            sites: sites,
            updatedAt: new Date().toISOString()
        }, { merge: true });

        return NextResponse.json({
            success: true,
            message: 'User sites assigned successfully',
            updatedSitesCount: sites.length
        });

    } catch (error: any) {
        console.error('Error assigning user sites:', error);
        return NextResponse.json({ success: false, error: error.message || 'Internal server error' }, { status: 500 });
    }
}
