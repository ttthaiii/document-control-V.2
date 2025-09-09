// src/lib/config/workflow.ts (แก้ไขแล้ว)

// (ส่วน ROLES เหมือนเดิม)
export const CREATOR_ROLES = ['BIM', 'ME', 'SN'];
export const REVIEWER_ROLES = ['Adminsite', 'Adminsite2', 'OE', 'PE'];
export const APPROVER_ROLES = ['CM'];
export const OBSERVER_ALL_ROLES = ['PM'];
export const OBSERVER_FINISHED_ROLES = ['SE'];

// --- ✅ 1. เปลี่ยนกลับไปใช้ Key เป็นค่าหลัก ---
export const STATUSES = {
  PENDING_REVIEW: 'PENDING_REVIEW',
  PENDING_CM_APPROVAL: 'PENDING_CM_APPROVAL',
  REVISION_REQUIRED: 'REVISION_REQUIRED',
  APPROVED: 'APPROVED',
  APPROVED_WITH_COMMENTS: 'APPROVED_WITH_COMMENTS',
  APPROVED_REVISION_REQUIRED: 'APPROVED_REVISION_REQUIRED',
  REJECTED: 'REJECTED',
};

// --- ✅ 2. เพิ่ม Object นี้สำหรับแสดงผลเป็นภาษาไทย ---
export const STATUS_LABELS: { [key: string]: string } = {
  [STATUSES.PENDING_REVIEW]: 'รอตรวจสอบ',
  [STATUSES.PENDING_CM_APPROVAL]: 'ส่ง CM',
  [STATUSES.REVISION_REQUIRED]: 'แก้ไข',
  [STATUSES.APPROVED]: 'อนุมัติ',
  [STATUSES.APPROVED_WITH_COMMENTS]: 'อนุมัติตามคอมเมนต์ (ไม่แก้ไข)',
  [STATUSES.APPROVED_REVISION_REQUIRED]: 'อนุมัติตามคอมเมนต์ (ต้องแก้ไข)',
  [STATUSES.REJECTED]: 'ไม่อนุมัติ',
};