// src/lib/utils/activityLogger.ts
// Server-side only utility — ใช้ใน API routes เท่านั้น (ผ่าน Firebase Admin SDK)

import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { LogActivityParams } from '@/types/activity-log';

/**
 * บันทึก Activity Log ลง Firestore collection 'activityLogs'
 * ใช้ได้เฉพาะฝั่ง server (Next.js API routes) เท่านั้น
 * Non-blocking: ใช้ fire-and-forget เพื่อไม่ให้ log ส่งผลต่อ response time
 */
export async function logActivity(params: LogActivityParams): Promise<void> {
  try {
    const logEntry = {
      userId: params.userId,
      userEmail: params.userEmail,
      userName: params.userName || null,
      userRole: params.userRole,
      siteId: params.siteId || null,
      siteName: params.siteName || null,
      action: params.action,
      resourceType: params.resourceType || null,
      resourceId: params.resourceId || null,
      resourceName: params.resourceName || null,
      resourceTitle: params.resourceTitle || null,
      description: params.description,
      metadata: params.metadata || null,
      createdAt: FieldValue.serverTimestamp(),
    };

    await adminDb.collection('activityLogs').add(logEntry);
  } catch (error) {
    // Log error ไว้แต่ไม่ throw — ไม่ให้ log failure ขัด main operation
    console.error('[ActivityLogger] Failed to write log:', error);
  }
}

/**
 * Helper: สร้าง description ภาษาไทยสำหรับ action ต่างๆ
 */
export function buildDescription(
  action: LogActivityParams['action'],
  resourceName?: string,
  extra?: string
): string {
  const res = resourceName ? `"${resourceName}"` : '';
  const descriptions: Record<string, string> = {
    LOGIN: 'เข้าสู่ระบบ',
    LOGOUT: 'ออกจากระบบ',
    VIEW_DETAIL: `เปิดดูรายละเอียดเอกสาร ${res}`,
    PREVIEW_FILE: `เปิดดูไฟล์เอกสาร ${res}`,
    DOWNLOAD_FILE: `ดาวน์โหลดไฟล์เอกสาร ${res}`,
    CREATE_DOCUMENT: `สร้างเอกสาร ${res}`,
    SUBMIT_DOCUMENT: `ส่งเอกสาร ${res} เพื่อขออนุมัติ`,
    APPROVE_DOCUMENT: `อนุมัติเอกสาร ${res}`,
    REJECT_DOCUMENT: `ไม่อนุมัติเอกสาร ${res}`,
    REQUEST_REVISION: `ขอแก้ไขเอกสาร ${res}`,
    CREATE_WORK_REQUEST: `สร้าง Work Request ${res}`,
    APPROVE_WORK_REQUEST: `อนุมัติ Work Request ${res}`,
    REJECT_WORK_REQUEST: `ไม่อนุมัติ Work Request ${res}`,
    INVITE_USER: `เชิญผู้ใช้งาน ${extra || ''}`,
    UPDATE_USER: `อัปเดตข้อมูลผู้ใช้งาน ${extra || ''}`,
  };
  return descriptions[action] || action;
}
