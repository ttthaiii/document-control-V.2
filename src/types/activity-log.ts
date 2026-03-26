// src/types/activity-log.ts

export type LogAction =
  | 'LOGIN'
  | 'LOGOUT'
  // Document Viewing (Accountability)
  | 'VIEW_DETAIL'     // เปิดดูรายละเอียดเอกสาร (modal/detail page)
  | 'PREVIEW_FILE'    // เปิด PDF จริง
  | 'DOWNLOAD_FILE'   // ดาวน์โหลดไฟล์
  // Document Actions
  | 'CREATE_DOCUMENT'
  | 'SUBMIT_DOCUMENT'
  | 'APPROVE_DOCUMENT'
  | 'REJECT_DOCUMENT'
  | 'REQUEST_REVISION'
  // Work Request
  | 'CREATE_WORK_REQUEST'
  | 'APPROVE_WORK_REQUEST'
  | 'REJECT_WORK_REQUEST'
  // Admin
  | 'INVITE_USER'
  | 'UPDATE_USER';

export type ResourceType = 'RFA' | 'WORK_REQUEST' | 'USER' | 'SYSTEM';

export interface ActivityLog {
  id: string;
  userId: string;
  userEmail: string;
  userName?: string;
  userRole: string;
  siteId?: string;
  siteName?: string;
  action: LogAction;
  resourceType?: ResourceType;
  resourceId?: string;
  resourceName?: string;    // เช่น 'ST2-RFA-001 REV.02' (ใช้อ้างอิงใน dispute)
  description: string;      // ข้อความอธิบาย ภาษาไทย
  metadata?: Record<string, any>;
  createdAt: Date;
}

export interface LogActivityParams {
  userId: string;
  userEmail: string;
  userName?: string;
  userRole: string;
  siteId?: string;
  siteName?: string;
  action: LogAction;
  resourceType?: ResourceType;
  resourceId?: string;
  resourceName?: string;
  description: string;
  metadata?: Record<string, any>;
}
