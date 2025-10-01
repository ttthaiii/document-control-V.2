// src/lib/config/workflow.ts (แก้ไขแล้ว)

// (ส่วน ROLES เหมือนเดิม)
export const CREATOR_ROLES = ['BIM', 'ME', 'SN'];
export const REVIEWER_ROLES = ['Site Admin', 'Adminsite2', 'OE', 'PE'];
export const APPROVER_ROLES = ['CM'];
export const OBSERVER_ALL_ROLES = ['PM'];
export const OBSERVER_FINISHED_ROLES = ['SE'];

export const STATUSES = {
  PENDING_REVIEW: 'PENDING_REVIEW',
  PENDING_CM_APPROVAL: 'PENDING_CM_APPROVAL',
  REVISION_REQUIRED: 'REVISION_REQUIRED',
  APPROVED: 'APPROVED',
  APPROVED_WITH_COMMENTS: 'APPROVED_WITH_COMMENTS',
  APPROVED_REVISION_REQUIRED: 'APPROVED_REVISION_REQUIRED',
  REJECTED: 'REJECTED',
  // --- 👇 เพิ่ม 2 สถานะใหม่ 👇 ---
  SENT_TO_EXTERNAL_CM: 'SENT_TO_EXTERNAL_CM',       // สำหรับ Flow ที่ SITE กดส่งให้ CM ภายนอก
  PENDING_FINAL_APPROVAL: 'PENDING_FINAL_APPROVAL'  // สำหรับ Flow ที่ CM อนุมัติแล้วส่งกลับให้ SITE ตรวจสอบสุดท้าย
};

export const STATUS_LABELS: { [key: string]: string } = {
  [STATUSES.PENDING_REVIEW]: 'รอตรวจสอบ',
  [STATUSES.PENDING_CM_APPROVAL]: 'ส่ง CM',
  [STATUSES.REVISION_REQUIRED]: 'แก้ไข',
  [STATUSES.APPROVED]: 'อนุมัติ',
  [STATUSES.APPROVED_WITH_COMMENTS]: 'อนุมัติตามคอมเมนต์ (ไม่แก้ไข)',
  [STATUSES.APPROVED_REVISION_REQUIRED]: 'อนุมัติตามคอมเมนต์ (ต้องแก้ไข)',
  [STATUSES.REJECTED]: 'ไม่อนุมัติ',
  // --- 👇 เพิ่ม Label ภาษาไทยสำหรับสถานะใหม่ 👇 ---
  [STATUSES.SENT_TO_EXTERNAL_CM]: 'ส่งให้ CM (ภายนอก)',
  [STATUSES.PENDING_FINAL_APPROVAL]: 'รอ SITE อนุมัติขั้นสุดท้าย',
};

export const STATUS_COLORS: { [key: string]: string } = {
  [STATUSES.PENDING_REVIEW]: '#0088FE',
  [STATUSES.PENDING_CM_APPROVAL]: '#00C49F',
  [STATUSES.REVISION_REQUIRED]: '#FFBB28',
  [STATUSES.APPROVED]: '#28A745',
  [STATUSES.REJECTED]: '#DC3545',
  [STATUSES.APPROVED_WITH_COMMENTS]: '#20C997',
  [STATUSES.APPROVED_REVISION_REQUIRED]: '#FD7E14',
};