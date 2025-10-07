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
  SE: 'SE',
  ADMIN_SITE_2: 'Adminsite2',
} as const;

type ObjectValues<T> = T[keyof T];
export type Role = ObjectValues<typeof ROLES>;

// ✅ 2. อัปเดต Role Groups เดิมให้เรียกใช้ค่าจาก ROLES Object และใช้ Type ใหม่
export const CREATOR_ROLES: Role[] = [ROLES.BIM, ROLES.ME, ROLES.SN];
export const REVIEWER_ROLES: Role[] = [ROLES.SITE_ADMIN, ROLES.ADMIN_SITE_2, ROLES.OE, ROLES.PE];
export const APPROVER_ROLES: Role[] = [ROLES.CM];
export const OBSERVER_ALL_ROLES: Role[] = [ROLES.PM];
export const OBSERVER_FINISHED_ROLES: Role[] = [ROLES.SE];

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

export const STATUS_LABELS: { [key: string]: string } = {
  [STATUSES.PENDING_REVIEW]: 'รอตรวจสอบ',
  [STATUSES.PENDING_CM_APPROVAL]: 'ส่ง CM', // <-- มีแค่ Label นี้ที่เดียว
  [STATUSES.REVISION_REQUIRED]: 'แก้ไข',
  [STATUSES.APPROVED]: 'อนุมัติ',
  [STATUSES.APPROVED_WITH_COMMENTS]: 'อนุมัติตามคอมเมนต์ (ไม่แก้ไข)',
  [STATUSES.APPROVED_REVISION_REQUIRED]: 'อนุมัติตามคอมเมนต์ (ต้องแก้ไข)',
  [STATUSES.REJECTED]: 'ไม่อนุมัติ',
  [STATUSES.PENDING_FINAL_APPROVAL]: 'รอ SITE อนุมัติขั้นสุดท้าย',
};

export const STATUS_COLORS: { [key: string]: string } = {
  [STATUSES.PENDING_REVIEW]: '#0088FE',
  [STATUSES.PENDING_CM_APPROVAL]: '#00C49F',
  [STATUSES.REVISION_REQUIRED]: '#FFBB28',
  [STATUSES.APPROVED]: '#28A745',
  [STATUSES.REJECTED]: '#DC3545',
  [STATUSES.APPROVED_WITH_COMMENTS]: '#2f3e3aff',
  [STATUSES.APPROVED_REVISION_REQUIRED]: '#FD7E14',
};