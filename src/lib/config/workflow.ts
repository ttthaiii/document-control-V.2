// src/lib/config/workflow.ts

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
  FM: 'FM',
  ADMIN_SITE_2: 'Adminsite2',
} as const;

type ObjectValues<T> = T[keyof T];
export type Role = ObjectValues<typeof ROLES>;

// Creators (RFA): BIM, ME, SN, Site Admin, PM, PE, OE, Admin
export const CREATOR_ROLES: Role[] = [
  ROLES.BIM, ROLES.ME, ROLES.SN, 
  ROLES.SITE_ADMIN, ROLES.ADMIN, 
  ROLES.PM, ROLES.PE, ROLES.OE
];

// Reviewers: ยังคงสถานะเดิมไว้สำหรับการตรวจสอบเบื้องต้น (ถ้ามี workflow นี้)
export const REVIEWER_ROLES: Role[] = [
  ROLES.SITE_ADMIN, ROLES.ADMIN_SITE_2, 
  ROLES.OE, ROLES.PE, ROLES.ADMIN
];

// Approvers (RFA Final): CM, Site Admin, PM, PE, OE, Admin
export const APPROVER_ROLES: Role[] = [
  ROLES.CM, ROLES.ADMIN, 
  ROLES.SITE_ADMIN, ROLES.PM, ROLES.PE, ROLES.OE
];

export const OBSERVER_ALL_ROLES: Role[] = [ROLES.PM, ROLES.ADMIN];
export const OBSERVER_FINISHED_ROLES: Role[] = [ROLES.SE, ROLES.FM];

// Work Request Roles
export const WR_CREATOR_ROLES: Role[] = [ROLES.PE, ROLES.OE, ROLES.ADMIN];
export const WR_APPROVER_ROLES: Role[] = [ROLES.PM, ROLES.ADMIN];

// Viewer Roles
export const VIEWER_ROLES: Role[] = [ROLES.PD, ROLES.SE, ROLES.FM]; 

export const STATUSES = {
  PENDING_REVIEW: 'PENDING_REVIEW',
  PENDING_CM_APPROVAL: 'PENDING_CM_APPROVAL',
  REVISION_REQUIRED: 'REVISION_REQUIRED',
  APPROVED: 'APPROVED',
  APPROVED_WITH_COMMENTS: 'APPROVED_WITH_COMMENTS',
  APPROVED_REVISION_REQUIRED: 'APPROVED_REVISION_REQUIRED',
  REJECTED: 'REJECTED',
  PENDING_FINAL_APPROVAL: 'PENDING_FINAL_APPROVAL'
};

export const WR_STATUSES = {
  DRAFT: 'DRAFT',
  REJECTED_BY_PM: 'REJECTED_BY_PM',
  PENDING_BIM: 'PENDING_BIM',
  IN_PROGRESS: 'IN_PROGRESS',
  PENDING_ACCEPTANCE: 'PENDING_ACCEPTANCE',
  REVISION_REQUESTED: 'REVISION_REQUESTED',
  COMPLETED: 'COMPLETED',
} as const;
export type WorkRequestStatus = ObjectValues<typeof WR_STATUSES>;

export const STATUS_LABELS: { [key: string]: string } = {
  [STATUSES.PENDING_REVIEW]: 'รอตรวจสอบ',
  [STATUSES.PENDING_CM_APPROVAL]: 'รออนุมัติ (CM/Approver)',
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
  [WR_STATUSES.DRAFT]: '#6c757d',
  [WR_STATUSES.REJECTED_BY_PM]: '#DC3545',
  [WR_STATUSES.PENDING_BIM]: '#0088FE',
  [WR_STATUSES.IN_PROGRESS]: '#FFBB28',
  [WR_STATUSES.PENDING_ACCEPTANCE]: '#AF19FF',
  [WR_STATUSES.REVISION_REQUESTED]: '#FD7E14',
  [WR_STATUSES.COMPLETED]: '#28A745',
};