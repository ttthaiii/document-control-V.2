// src/app/api/activity-logs/route.ts
// GET: ดึง activity logs (สำหรับ PM, PD, Admin เท่านั้น)
// POST: บันทึก login log จาก client (ผ่าน token verification)

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { ROLES } from '@/lib/config/workflow';
import { LogActivityParams } from '@/types/activity-log';

export const dynamic = 'force-dynamic';

// Roles ที่มีสิทธิ์ดู Activity Log
const LOG_VIEWER_ROLES = [ROLES.PM, ROLES.PD, ROLES.ADMIN];

// --- Helper: verify token + ดึงข้อมูล user ---
async function verifyAndGetUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: 'Unauthorized', status: 401, user: null };
  }
  const token = authHeader.split('Bearer ')[1];
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const userDoc = await adminDb.collection('users').doc(decoded.uid).get();
    if (!userDoc.exists) return { error: 'User not found', status: 404, user: null };
    return { error: null, status: 200, user: { id: decoded.uid, ...userDoc.data() } as any };
  } catch {
    return { error: 'Invalid token', status: 401, user: null };
  }
}

// --- GET: ดึง logs (PM/PD/Admin เท่านั้น) ---
export async function GET(request: NextRequest) {
  const { error, status, user } = await verifyAndGetUser(request);
  if (error) return NextResponse.json({ success: false, error }, { status });

  // ตรวจสอบ role
  if (!LOG_VIEWER_ROLES.includes(user.role)) {
    return NextResponse.json({ success: false, error: 'Access denied: insufficient role' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get('siteId');
  const userId = searchParams.get('userId');
  const action = searchParams.get('action');
  const dateFrom = searchParams.get('dateFrom'); // ISO string
  const dateTo = searchParams.get('dateTo');     // ISO string
  const limitParam = parseInt(searchParams.get('limit') || '200');
  const limit = Math.min(limitParam, 500); // cap ที่ 500

  try {
    let query: FirebaseFirestore.Query = adminDb.collection('activityLogs');

    // PM/PD เห็นแค่ site ของตัวเอง
    if (user.role !== ROLES.ADMIN) {
      const userSites: string[] = user.sites || [];
      if (userSites.length === 0) {
        return NextResponse.json({ success: true, logs: [] });
      }
      // filter siteId ที่อยู่ใน userSites
      if (siteId && userSites.includes(siteId)) {
        query = query.where('siteId', '==', siteId);
      } else if (!siteId) {
        // ถ้ามีแค่ 1 site ใช้ == ได้เลย; ถ้าหลาย site ใช้ array-contains ไม่ได้กับ collection
        // จึง filter ด้วย siteId แรก + filter ฝั่ง client สำหรับกรณี multi-site
        if (userSites.length === 1) {
          query = query.where('siteId', '==', userSites[0]);
        } else {
          // Firestore ไม่รองรับ 'in' มากกว่า 10 ค่า แต่ปกติ PM มีไม่กี่ site
          query = query.where('siteId', 'in', userSites.slice(0, 10));
        }
      } else {
        // siteId ที่ request ไม่อยู่ใน userSites → ไม่มีสิทธิ์
        return NextResponse.json({ success: false, error: 'Access denied to this site' }, { status: 403 });
      }
    } else {
      // Admin: filter siteId ถ้ามี
      if (siteId) {
        query = query.where('siteId', '==', siteId);
      }
    }

    // Filter โดย userId
    if (userId) {
      query = query.where('userId', '==', userId);
    }

    // Filter action type
    if (action) {
      query = query.where('action', '==', action);
    }

    // Filter วันที่ (default = วันนี้ถ้าไม่ระบุ)
    const now = new Date();
    const defaultFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const fromDate = dateFrom ? new Date(dateFrom) : defaultFrom;
    const toDate = dateTo ? new Date(dateTo) : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    query = query
      .where('createdAt', '>=', Timestamp.fromDate(fromDate))
      .where('createdAt', '<=', Timestamp.fromDate(toDate))
      .orderBy('createdAt', 'desc')
      .limit(limit);

    const snapshot = await query.get();

    const logs = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
      };
    });

    return NextResponse.json({ success: true, logs, total: logs.length });

  } catch (err: any) {
    console.error('[activity-logs GET] Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// --- POST: บันทึก log (ใช้สำหรับ LOGIN จาก client side) ---
export async function POST(request: NextRequest) {
  const { error, status, user } = await verifyAndGetUser(request);
  if (error) return NextResponse.json({ success: false, error }, { status });

  try {
    const body: Partial<LogActivityParams> = await request.json();

    // Validate required fields
    if (!body.action) {
      return NextResponse.json({ success: false, error: 'action is required' }, { status: 400 });
    }

    // Security: บังคับใช้ userId จาก token เสมอ (ป้องกัน spoof)
    const logEntry = {
      userId: user.id,
      userEmail: user.email,
      userName: user.name || null,
      userRole: user.role,
      siteId: body.siteId || null,
      siteName: body.siteName || null,
      action: body.action,
      resourceType: body.resourceType || null,
      resourceId: body.resourceId || null,
      resourceName: body.resourceName || null,
      resourceTitle: body.resourceTitle || null,
      description: body.description || body.action,
      metadata: body.metadata || null,
      createdAt: FieldValue.serverTimestamp(),
    };

    const docRef = await adminDb.collection('activityLogs').add(logEntry);

    return NextResponse.json({ success: true, id: docRef.id });

  } catch (err: any) {
    console.error('[activity-logs POST] Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
