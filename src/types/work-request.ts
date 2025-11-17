// src/types/work-request.ts

import { RFAFile, RFASite, RFAUserInfo } from './rfa';
import { Role, WorkRequestStatus } from '@/lib/config/workflow';
export type { WorkRequestStatus }; // <-- เพิ่มบรรทัดนี้เพื่อ export Type

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
  status: WorkRequestStatus;
  
  createdAt: any;
  updatedAt: any;
  createdBy: string;
  assignedTo?: string;

  // --- 👇 นี่คือส่วนที่เพิ่มเข้ามา ---
  planStartDate?: any; // วันที่เริ่มงาน (แผน)
  dueDate?: any;       // วันที่กำหนดส่ง
  taskData?: TaskData | null;
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
  syncError?: string;
}