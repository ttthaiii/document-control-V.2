// src/lib/config/workflow.ts (แก้ไขแล้ว)

export const ROLES = {
  ADMIN: 'Admin',
  BIM: 'BIM',
  SITE_ADMIN: 'Site Admin',
  CM: 'CM',
  ME: 'ME',
  SN: 'SN',
  OE: 'OE',
  PE: 'PE',
  PM: 'PM',
  PD: 'PD',
  SE: 'SE',
  ADMIN_SITE_2: 'Adminsite2',
} as const;

type ObjectValues<T> = T[keyof T];
export type Role = ObjectValues<typeof ROLES>;

// ✅ 2. อัปเดต Role Groups เดิมให้เรียกใช้ค่าจาก ROLES Object และใช้ Type ใหม่
export const CREATOR_ROLES: Role[] = [ROLES.BIM, ROLES.ME, ROLES.SN];
export const REVIEWER_ROLES: Role[] = [ROLES.SITE_ADMIN, ROLES.ADMIN_SITE_2, ROLES.OE, ROLES.PE];
export const APPROVER_ROLES: Role[] = [ROLES.CM, ROLES.PD];
export const OBSERVER_ALL_ROLES: Role[] = [ROLES.PM];
export const OBSERVER_FINISHED_ROLES: Role[] = [ROLES.SE];
export const WR_CREATOR_ROLES: Role[] = [ROLES.PE, ROLES.OE, ROLES.ADMIN];
export const WR_APPROVER_ROLES: Role[] = [ROLES.PD, ROLES.PM, ROLES.ADMIN];

export const STATUSES = {
  PENDING_REVIEW: 'PENDING_REVIEW',
  PENDING_CM_APPROVAL: 'PENDING_CM_APPROVAL', // <-- สถานะเดียวสำหรับรอ CM
  REVISION_REQUIRED: 'REVISION_REQUIRED',
  APPROVED: 'APPROVED',
  APPROVED_WITH_COMMENTS: 'APPROVED_WITH_COMMENTS',
  APPROVED_REVISION_REQUIRED: 'APPROVED_REVISION_REQUIRED',
  REJECTED: 'REJECTED',
  PENDING_FINAL_APPROVAL: 'PENDING_FINAL_APPROVAL'
};

export const WR_STATUSES = {
  DRAFT: 'DRAFT',                       // PE/OE สร้าง รอ PD/PM อนุมัติ
  REJECTED_BY_PM: 'REJECTED_BY_PM',     // PD/PM ไม่อนุมัติ
  PENDING_BIM: 'PENDING_BIM',           // PD/PM อนุมัติ รอ BIM รับงาน
  IN_PROGRESS: 'IN_PROGRESS',           // BIM กำลังทำงาน
  PENDING_ACCEPTANCE: 'PENDING_ACCEPTANCE', // BIM ส่งงาน รอ Site ตรวจรับ
  REVISION_REQUESTED: 'REVISION_REQUESTED', // Site ขอแก้ไข
  COMPLETED: 'COMPLETED',               // Site ตรวจรับงานแล้ว
} as const; // <-- เพิ่ม as const
export type WorkRequestStatus = ObjectValues<typeof WR_STATUSES>;

export const STATUS_LABELS: { [key: string]: string } = {
  [STATUSES.PENDING_REVIEW]: 'รอตรวจสอบ',
  [STATUSES.PENDING_CM_APPROVAL]: 'ส่ง CM', // <-- มีแค่ Label นี้ที่เดียว
  [STATUSES.REVISION_REQUIRED]: 'แก้ไข',
  [STATUSES.APPROVED]: 'อนุมัติ',
  [STATUSES.APPROVED_WITH_COMMENTS]: 'อนุมัติตามคอมเมนต์ (ไม่แก้ไข)',
  [STATUSES.APPROVED_REVISION_REQUIRED]: 'อนุมัติตามคอมเมนต์ (ต้องแก้ไข)',
  [STATUSES.REJECTED]: 'ไม่อนุมัติ',
  [STATUSES.PENDING_FINAL_APPROVAL]: 'รอ SITE อนุมัติขั้นสุดท้าย',
  [WR_STATUSES.DRAFT]: 'รออนุมัติ (PM)',
  [WR_STATUSES.REJECTED_BY_PM]: 'ไม่อนุมัติ (PM)',
  [WR_STATUSES.PENDING_BIM]: 'รอ BIM รับงาน',
  [WR_STATUSES.IN_PROGRESS]: 'BIM กำลังดำเนินการ',
  [WR_STATUSES.PENDING_ACCEPTANCE]: 'รอตรวจรับ (Site)',
  [WR_STATUSES.REVISION_REQUESTED]: 'ขอแก้ไข (WR)',
  [WR_STATUSES.COMPLETED]: 'เสร็จสิ้น',
};

export const STATUS_COLORS: { [key: string]: string } = {
  [STATUSES.PENDING_REVIEW]: '#0088FE',
  [STATUSES.PENDING_CM_APPROVAL]: '#00C49F',
  [STATUSES.REVISION_REQUIRED]: '#FFBB28',
  [STATUSES.APPROVED]: '#28A745',
  [STATUSES.REJECTED]: '#DC3545',
  [STATUSES.APPROVED_WITH_COMMENTS]: '#2f3e3aff',
  [STATUSES.APPROVED_REVISION_REQUIRED]: '#FD7E14',
  [WR_STATUSES.DRAFT]: '#6c757d',              // Gray
  [WR_STATUSES.REJECTED_BY_PM]: '#DC3545',      // Red
  [WR_STATUSES.PENDING_BIM]: '#0088FE',          // Blue
  [WR_STATUSES.IN_PROGRESS]: '#FFBB28',        // Yellow
  [WR_STATUSES.PENDING_ACCEPTANCE]: '#AF19FF',  // Violet
  [WR_STATUSES.REVISION_REQUESTED]: '#FD7E14',// Orange
  [WR_STATUSES.COMPLETED]: '#28A745',
};