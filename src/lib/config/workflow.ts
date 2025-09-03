// กำหนดทีมตามบทบาท
export const CREATOR_ROLES = ['BIM', 'ME', 'SN'];
export const REVIEWER_ROLES = ['Adminsite', 'Adminsite2', 'OE', 'PE'];
export const APPROVER_ROLES = ['CM'];
export const OBSERVER_ALL_ROLES = ['PM']; // PM, PE, OE เดิม แต่ PE, OE ย้ายไป Reviewer
export const OBSERVER_FINISHED_ROLES = ['SE'];

// กำหนดสถานะทั้งหมดในระบบ (ใช้ key เป็นภาษาอังกฤษเพื่อง่ายต่อการเขียนโค้ด)
export const STATUSES = {
  PENDING_REVIEW: 'รอตรวจสอบ',
  PENDING_CM_APPROVAL: 'ส่ง CM',
  REVISION_REQUIRED: 'แก้ไข',
  APPROVED: 'อนุมัติ',
  APPROVED_WITH_COMMENTS: 'อนุมัติตามคอมเมนต์ (ไม่ต้องแก้ไข)',
  APPROVED_REVISION_REQUIRED: 'อนุมัติตามคอมเมนต์ (ต้องแก้ไข)',
  REJECTED: 'ไม่อนุมัติ',
};