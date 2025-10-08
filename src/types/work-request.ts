// src/types/work-request.ts

import { RFAFile, RFASite, RFAUserInfo } from './rfa';
import { Role } from '@/lib/config/workflow';

/**
 * Interface for data from BIM Tracking system
 */
export interface TaskData {
  taskUid?: string;
  taskCategory: string;
  taskName: string;
  projectName: string;
}

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
  files?: RFAFile[];
}

/**
 * โครงสร้างหลักของเอกสาร Work Request แต่ละฉบับ
 */
export interface WorkRequest {
  id: string;
  documentNumber: string;
  runningNumber: string;
  site: RFASite;
  taskName: string;
  description: string;
  priority: WorkRequestPriority;
  status: WorkRequestStatus;
  
  createdAt: any;
  updatedAt: any;
  createdBy: string;
  assignedTo?: string;

  // --- 👇 นี่คือส่วนที่เพิ่มเข้ามา ---
  taskData?: TaskData | null; // สำหรับเก็บข้อมูลจาก BIM Tracking
  // --- 👆 สิ้นสุดส่วนที่เพิ่มเข้ามา ---

  // การจัดการ Revision
  revisionNumber: number;
  isLatest: boolean;
  parentWorkRequestId?: string;
  
  // ไฟล์และ Workflow
  files: RFAFile[];
  workflow: WorkRequestWorkflowStep[];
  
  // ข้อมูลเพิ่มเติม
  usersInfo: Record<string, RFAUserInfo>;
}