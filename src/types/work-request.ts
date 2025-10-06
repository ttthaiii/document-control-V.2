// src/types/work-request.ts

import { RFAFile, RFASite, RFAUserInfo } from './rfa';
import { Role } from '@/lib/config/workflow';

/**
 * ระดับความสำคัญของงาน
 */
export enum WorkRequestPriority {
  NORMAL = 'NORMAL',   // ปกติ
  HIGH = 'HIGH',       // ด่วน
  URGENT = 'URGENT',     // ด่วนที่สุด
}

/**
 * สถานะของ Work Request ในกระบวนการ
 */
export enum WorkRequestStatus {
  PENDING_BIM = 'PENDING_BIM',           // Site สร้างคำขอแล้ว รอ BIM รับงาน
  IN_PROGRESS = 'IN_PROGRESS',           // BIM กำลังทำงาน
  PENDING_ACCEPTANCE = 'PENDING_ACCEPTANCE', // BIM ส่งงานแล้ว รอ Site ตรวจรับ
  REVISION_REQUESTED = 'REVISION_REQUESTED', // Site ขอให้แก้ไข
  COMPLETED = 'COMPLETED',               // Site กดรับงานแล้ว (กระบวนการสิ้นสุด)
}

/**
 * ข้อมูลในแต่ละขั้นตอนของ Workflow
 */
export interface WorkRequestWorkflowStep {
  action: string;
  status: WorkRequestStatus;
  userId: string;
  userName: string;
  role: Role;
  timestamp: string; // ISO Date String
  comments?: string;
  files?: RFAFile[]; // ไฟล์ที่แนบในขั้นตอนนี้ (ถ้ามี)
}

/**
 * โครงสร้างหลักของเอกสาร Work Request แต่ละฉบับ
 */
export interface WorkRequest {
  id: string;
  documentNumber: string; // WR-<ชื่อย่อโครงการ>-<Running number>
  runningNumber: string;  // <Running number> ล้วนๆ
  site: RFASite;          // ข้อมูลโครงการ
  taskName: string;          // ชื่องาน
  description: string;    // รายละเอียดความต้องการ
  priority: WorkRequestPriority; // ความเร่งด่วน
  status: WorkRequestStatus;     // สถานะปัจจุบัน
  
  createdAt: any;       // Firestore Timestamp
  updatedAt: any;       // Firestore Timestamp
  createdBy: string;      // User ID ของ Site ที่สร้าง
  assignedTo?: string;     // User ID ของ BIM ที่รับผิดชอบ (อาจจะยังไม่มีในตอนแรก)

  // การจัดการ Revision
  revisionNumber: number;       // เริ่มที่ 0, 1, 2, ...
  isLatest: boolean;            // true ถ้าเป็นฉบับล่าสุด
  parentWorkRequestId?: string; // ID ของเอกสารตั้งต้น (สำหรับ Rev.1 เป็นต้นไป)
  
  // ไฟล์และ Workflow
  files: RFAFile[];
  workflow: WorkRequestWorkflowStep[];
  
  // ข้อมูลเพิ่มเติม
  usersInfo: Record<string, RFAUserInfo>; // เก็บข้อมูล user ทุกคนที่เกี่ยวข้อง
}