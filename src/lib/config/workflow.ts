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
  PENDING_FINAL_APPROVAL: 'PENDING_FINAL_APPROVAL',
  SUPERSEDED: 'SUPERSEDED',  // ถูกแทนที่โดย Rev. ใหม่
  SUSPENDED: 'SUSPENDED',    // รอ Rev. ใหม่ (ระงับชั่วคราว)
  REVISION_REQUESTED: 'REVISION_REQUESTED', // ขอแก้ไขแบบ
};

/**
 * Statuses that mean a document has actually reached CM (or, for EXTERNAL projects,
 * the Reviewer acting on CM's behalf) — as opposed to PENDING_REVIEW/REVISION_REQUIRED,
 * which are SITE/BIM's internal loop before anything is sent out (roadmap T-008).
 *
 * No document can move BACK to PENDING_REVIEW/REVISION_REQUIRED once it reaches any of
 * these (see api/rfa/[id]/route.ts's status transitions) — a fresh revision instead
 * creates a NEW document starting over, so this list is safe to use as a permanent
 * per-document "has CM seen this" test, unlike RFI which needed a separate sticky flag.
 */
export const RFA_CM_VISIBLE_STATUSES: string[] = [
  STATUSES.PENDING_CM_APPROVAL,
  STATUSES.PENDING_FINAL_APPROVAL,
  STATUSES.APPROVED,
  STATUSES.APPROVED_WITH_COMMENTS,
  STATUSES.APPROVED_REVISION_REQUIRED,
  STATUSES.REJECTED,
];

export const WR_STATUSES = {
  DRAFT: 'DRAFT',
  REJECTED_BY_PM: 'REJECTED_BY_PM',
  PENDING_BIM: 'PENDING_BIM',
  REJECTED_BY_BIM: 'REJECTED_BY_BIM',
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
  [STATUSES.SUPERSEDED]: 'ถูกแทนที่ (Rev. ใหม่อนุมัติแล้ว)',
  [STATUSES.SUSPENDED]: 'กำลังขอแก้ไข (รอ Rev. ใหม่)',
  [STATUSES.REVISION_REQUESTED]: 'ขอแก้ไขเอกสาร',
  [WR_STATUSES.DRAFT]: 'รออนุมัติ (PM)',
  [WR_STATUSES.REJECTED_BY_PM]: 'ไม่อนุมัติ (PM)',
  [WR_STATUSES.PENDING_BIM]: 'รอ BIM รับงาน',
  [WR_STATUSES.REJECTED_BY_BIM]: 'ไม่อนุมัติ (BIM)',
  [WR_STATUSES.IN_PROGRESS]: 'BIM กำลังดำเนินการ',
  [WR_STATUSES.PENDING_ACCEPTANCE]: 'รอตรวจรับ (Site)',
  [WR_STATUSES.REVISION_REQUESTED]: 'ขอแก้ไข (WR)',
  [WR_STATUSES.COMPLETED]: 'เสร็จสิ้น',
};

/**
 * CM only ever needs to know a document was "approved with comments" — the further
 * split into revision-required vs not is SITE's own internal round-2 classification
 * (PENDING_FINAL_APPROVAL loop) and was never a decision CM made or needs to track.
 * Every CM-facing status display should route through this instead of a raw
 * STATUS_LABELS lookup, so the two internal statuses always read the same to CM.
 */
const CM_APPROVED_WITH_COMMENTS_LABEL = 'อนุมัติตามคอมเมนต์';

// From CM's perspective, "อนุมัติตามคอมเมนต์" is the end of their involvement — the
// PENDING_FINAL_APPROVAL round-2 loop that follows is SITE's own internal
// classification (revision-required vs not) and never something CM acts on or
// should perceive as a separate, still-pending step.
const CM_COLLAPSED_STATUSES: string[] = [
  STATUSES.PENDING_FINAL_APPROVAL,
  STATUSES.APPROVED_WITH_COMMENTS,
  STATUSES.APPROVED_REVISION_REQUIRED,
];

export function getRfaStatusLabelForRole(status: string, role?: string): string {
  if (role === ROLES.CM && CM_COLLAPSED_STATUSES.includes(status)) {
    return CM_APPROVED_WITH_COMMENTS_LABEL;
  }
  return STATUS_LABELS[status] || status;
}

/** Same collapse as getRfaStatusLabelForRole, but on the status VALUE — for grouping
 * (e.g. chart counts) where CM's two internal-round statuses must merge into one
 * bucket rather than just relabel two separate ones identically. */
export function normalizeRfaStatusForRole(status: string, role?: string): string {
  if (role === ROLES.CM && CM_COLLAPSED_STATUSES.includes(status)) {
    return STATUSES.APPROVED_WITH_COMMENTS;
  }
  return status;
}

export const STATUS_COLORS: { [key: string]: string } = {
  [STATUSES.PENDING_REVIEW]: '#3B82F6', // Blue-500 (รอตรวจสอบ - สีฟ้า)

  // 🟢 แก้ไข: เปลี่ยนจาก Teal (#00C49F) เป็น Violet (#8B5CF6) เพื่อไม่ให้กลืนกับสีเขียว
  [STATUSES.PENDING_CM_APPROVAL]: '#8B5CF6', // Violet-500 (รออนุมัติ - สีม่วง)

  [STATUSES.REVISION_REQUIRED]: '#F59E0B', // Amber-500 (แก้ไข - สีเหลืองส้ม)
  [STATUSES.APPROVED]: '#22C55E', // Green-500 (อนุมัติ - สีเขียวสด)
  [STATUSES.REJECTED]: '#EF4444', // Red-500 (ไม่อนุมัติ - สีแดง)

  // สีเขียวเข้ม สำหรับอนุมัติแบบมีคอมเมนต์
  [STATUSES.APPROVED_WITH_COMMENTS]: '#15803d', // Green-700

  [STATUSES.APPROVED_REVISION_REQUIRED]: '#F97316', // Orange-500
  [STATUSES.PENDING_FINAL_APPROVAL]: '#6366F1', // Indigo-500
  [STATUSES.SUSPENDED]: '#F97316',   // Orange-500 (กำลังขอแก้ไข)
  [STATUSES.SUPERSEDED]: '#9CA3AF', // Gray-400 (ถูกแทนที่แล้ว)
  [STATUSES.REVISION_REQUESTED]: '#E11D48', // Rose-600

  // Work Request Colors (คงเดิมหรือปรับให้เข้าชุดกัน)
  [WR_STATUSES.DRAFT]: '#6B7280',
  [WR_STATUSES.REJECTED_BY_PM]: '#EF4444',
  [WR_STATUSES.PENDING_BIM]: '#3B82F6',
  [WR_STATUSES.REJECTED_BY_BIM]: '#EF4444',
  [WR_STATUSES.IN_PROGRESS]: '#F59E0B',
  [WR_STATUSES.PENDING_ACCEPTANCE]: '#A855F7',
  [WR_STATUSES.REVISION_REQUESTED]: '#F97316',
  [WR_STATUSES.COMPLETED]: '#22C55E',
};

/**
 * The RFA-SHOP categories BIM Tracking may offer. These name the DISCIPLINES, which is
 * why the RFI module derives its own discipline list from this array rather than
 * declaring a second one (see rfi-workflow.ts deriveRfiDisciplines).
 *
 * Moved here from api/bim-tracking/categories/route.ts so RFA and RFI read one array.
 * A third copy is still inline in components/rfa/CreateRFAForm.tsx:480 — switching it
 * over is roadmap task T-001 (site 7); it is untouched because it is live RFA UI.
 */
export const RFA_SHOP_CATEGORIES: string[] = [
  'Structural Drawings',
  'Architectural Drawings',
  'Landscape Drawings',
  'Structural Asbuilt',
  'Architectural Asbuilt',
  'Landscape Asbuilt',
  'Interior Drawings',
  'Interior Drawings Asbuilt',
];
