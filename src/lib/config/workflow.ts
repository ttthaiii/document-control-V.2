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
  // External approval chain roles (M1 foundation): the "external" side beyond CM.
  // CM forwards a document to these for review; they are NOT internal approvers.
  DESIGNER: 'Designer',
  OWNER: 'Owner',
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

// External approval-chain roles (M1 foundation). Kept as a SEPARATE group and
// deliberately NOT merged into APPROVER_ROLES: Designer/Owner only ever act inside a
// CM-configured external chain (per document), never as standalone RFA approvers.
// Merging them would reopen the same permission-leak class just fixed for CM.
export const EXTERNAL_APPROVER_ROLES: Role[] = [ROLES.DESIGNER, ROLES.OWNER];

// ── External approval chain data model (M1 foundation) ──────────────────────────
// Shared here (not in the per-module type files) so RFA types, RFI types, and the
// Cloud Function mirror all reference ONE definition. Additive only in M1: nothing
// writes these yet (that starts in M2).

export const EXTERNAL_STEP_STATUSES = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  APPROVED_WITH_COMMENTS: 'APPROVED_WITH_COMMENTS',
  REJECTED: 'REJECTED',
  // RFI only: a Designer/Owner chain step is a REPLY (answer + attached document),
  // never an approval verdict. RFA uses APPROVED/APPROVED_WITH_COMMENTS/REJECTED;
  // RFI records ANSWERED so the shared chain can carry a non-verdict step.
  ANSWERED: 'ANSWERED',
} as const;
export type ExternalStepStatus = ObjectValues<typeof EXTERNAL_STEP_STATUSES>;

// One approver's slot in the chain (a Designer or an Owner). A REJECTED step does NOT
// short-circuit the chain — every configured step still runs; CM sees all outcomes and
// decides at the end (PENDING_CM_FINAL).
export interface ExternalApprovalStep {
  role: Role;                    // ROLES.DESIGNER | ROLES.OWNER
  order: number;                 // 0-based position in the sequential run
  status: ExternalStepStatus;    // PENDING until this approver acts
  userId?: string;               // resolved system user for this role, per site
  userName?: string;
  comment?: string;
  // Attachments this approver added. Loosely typed on purpose: the concrete file
  // shape (RFAFile / RFIFile) lives in the per-module type files, which would create
  // an import cycle if referenced here. Each module can narrow at use-site.
  files?: any[];
  actedAt?: string;              // ISO timestamp when this approver acted
}

// The chain CM configures at review time (step 2 of the flow). Sequential: exactly one
// step is "current" at a time, tracked by currentStepIndex.
export interface ExternalChain {
  steps: ExternalApprovalStep[];
  currentStepIndex: number;      // index of the active step; === steps.length ⇒ chain complete (back to CM)
  configuredBy: string;          // CM userId who built the chain
  configuredAt: string;          // ISO timestamp
}

// Who currently holds the document inside the external chain, or null if the chain is
// absent / already complete (i.e. it is back with CM). Location only — not an outcome.
export function getExternalChainHolder(chain?: ExternalChain): Role | null {
  if (!chain) return null;
  const step = chain.steps[chain.currentStepIndex];
  return step ? step.role : null;
}

// ── M2: external-chain operations (pure — never mutate inputs) ───────────────────
// CM builds the chain at review time by picking ROLES (Designer and/or Owner) + order,
// NOT specific people. Any project user holding that role can act on the matching step;
// the actual actor is recorded on the step only when they act (applyExternalStep).
// A REJECTED step never short-circuits — every configured step runs, then the chain
// returns to CM (advanceExternalChain reports done) for the final decision.

// Build the chain from CM's picks. Sorts by order (re-indexed 0-based), every step PENDING,
// starts at index 0. Validates: ≥1 step, roles ∈ EXTERNAL_APPROVER_ROLES, no duplicate role.
export function configureExternalChain(
  config: { role: Role; order: number }[],
  configuredBy: string,
): ExternalChain {
  if (!config || config.length === 0) {
    throw new Error('External chain requires at least one step');
  }
  const seen = new Set<Role>();
  for (const c of config) {
    if (!EXTERNAL_APPROVER_ROLES.includes(c.role)) {
      throw new Error(`Invalid external approver role: ${c.role}`);
    }
    if (seen.has(c.role)) {
      throw new Error(`Duplicate external approver role: ${c.role}`);
    }
    seen.add(c.role);
  }
  const steps: ExternalApprovalStep[] = [...config]
    .sort((a, b) => a.order - b.order)
    .map((c, i) => ({
      role: c.role,
      order: i,
      status: EXTERNAL_STEP_STATUSES.PENDING,
    }));
  return {
    steps,
    currentStepIndex: 0,
    configuredBy,
    configuredAt: new Date().toISOString(),
  };
}

// Role-based gate: true when the acting user's role IS the current step's role. Anyone
// holding that role in the project passes — no per-person assignment.
export function canActOnExternalStep(chain: ExternalChain | undefined, role: Role): boolean {
  return getExternalChainHolder(chain) === role;
}

// Write the current step's outcome immutably. Does NOT advance the chain (caller decides
// when to advance). Returns a NEW chain; inputs are untouched.
export function applyExternalStep(
  chain: ExternalChain,
  outcome: {
    status: ExternalStepStatus;
    userId?: string;
    userName?: string;
    comment?: string;
    files?: any[];
    actedAt?: string;
  },
): ExternalChain {
  const idx = chain.currentStepIndex;
  const steps = chain.steps.map((s, i) =>
    i === idx
      ? {
          ...s,
          status: outcome.status,
          userId: outcome.userId,
          userName: outcome.userName,
          comment: outcome.comment,
          files: outcome.files,
          actedAt: outcome.actedAt ?? new Date().toISOString(),
        }
      : s,
  );
  return { ...chain, steps };
}

// Move to the next step. done=true once past the last step (chain complete ⇒ back to CM).
// NEVER inspects step.status — a reject does not short-circuit the walk.
export function advanceExternalChain(chain: ExternalChain): { chain: ExternalChain; done: boolean } {
  const nextIndex = chain.currentStepIndex + 1;
  const done = nextIndex >= chain.steps.length;
  return { chain: { ...chain, currentStepIndex: nextIndex }, done };
}

// Redact the chain for a viewer. CM sees everything; internal viewers (SITE/BIM) see only
// LOCATION + progress (which role holds it now, which slots are passed) — never the
// per-approver outcome. status is masked to PENDING (kept required-valid), and
// comment/files/userName/userId are dropped. actedAt is kept only for already-passed steps
// (progress, not outcome).
export function serializeExternalChainForViewer(
  chain: ExternalChain | undefined,
  isCm: boolean,
): ExternalChain | undefined {
  if (!chain) return undefined;
  if (isCm) return chain;
  const steps: ExternalApprovalStep[] = chain.steps.map((s, i) => ({
    role: s.role,
    order: s.order,
    status: EXTERNAL_STEP_STATUSES.PENDING,
    actedAt: i < chain.currentStepIndex ? s.actedAt : undefined,
  }));
  return {
    steps,
    currentStepIndex: chain.currentStepIndex,
    configuredBy: chain.configuredBy,
    configuredAt: chain.configuredAt,
  };
}
// ────────────────────────────────────────────────────────────────────────────────

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
  // External approval chain (M1 foundation) — INTERNAL cmSystemType sites only.
  PENDING_EXTERNAL_APPROVAL: 'PENDING_EXTERNAL_APPROVAL', // document is inside the CM-configured Designer/Owner chain
  PENDING_CM_FINAL: 'PENDING_CM_FINAL',                   // chain complete, back with CM for the final decision
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
  // External chain statuses — CM owns these (configures + finalizes) (M1 foundation).
  STATUSES.PENDING_EXTERNAL_APPROVAL,
  STATUSES.PENDING_CM_FINAL,
];

/**
 * Terminal CM decisions — the document's outcome is settled. These are visible to
 * EVERYONE (incl. external Designer/Owner approvers), unlike the internal-loop and
 * in-progress statuses. Used by the RFA dashboard to let Designer/Owner see finished
 * docs while hiding in-progress internal docs that never involved them.
 */
export const RFA_FINAL_DECISION_STATUSES: string[] = [
  STATUSES.APPROVED,
  STATUSES.APPROVED_WITH_COMMENTS,
  STATUSES.APPROVED_REVISION_REQUIRED,
  STATUSES.REJECTED,
];

/**
 * The CM-facing status buckets for the RFA dashboard chart + status filter — the
 * COLLAPSED view of RFA_CM_VISIBLE_STATUSES. PENDING_FINAL_APPROVAL and
 * APPROVED_REVISION_REQUIRED are SITE's internal round-2 classifications that CM never
 * acts on, so they fold into APPROVED_WITH_COMMENTS ("อนุมัติตามคอมเมนต์") — exactly the
 * merge that normalizeRfaStatusForRole(status, 'CM') / CM_COLLAPSED_STATUSES perform. Keep
 * this list in sync with that collapse so the chart, the filter dropdown, and the table all
 * show CM the same buckets. Ordered for the dropdown (pending → approved → rejected).
 */
export const RFA_CM_FILTER_STATUSES: string[] = [
  STATUSES.PENDING_CM_APPROVAL,
  STATUSES.APPROVED,
  STATUSES.APPROVED_WITH_COMMENTS,
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
  [STATUSES.PENDING_EXTERNAL_APPROVAL]: 'อยู่ระหว่างพิจารณา (ภายนอก)',
  [STATUSES.PENDING_CM_FINAL]: 'รอ CM สรุปขั้นสุดท้าย',
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

/**
 * Per-DOCUMENT status label. While a document sits in the external chain
 * (PENDING_EXTERNAL_APPROVAL), name the role that currently holds the step
 * ("รอ Designer พิจารณา" / "รอ Owner พิจารณา") instead of the lumped
 * "อยู่ระหว่างพิจารณา (ภายนอก)". Every other status falls back to the role-aware
 * label. Takes the chain (not the whole RFADocument) to avoid an import cycle —
 * callers pass doc.externalChain.
 */
export function getRfaStatusLabelForDoc(
  status: string,
  viewerRole?: string,
  chain?: ExternalChain,
): string {
  if (status === STATUSES.PENDING_EXTERNAL_APPROVAL) {
    const holder = getExternalChainHolder(chain);
    if (holder) return `รอ ${holder} พิจารณา`;
  }
  return getRfaStatusLabelForRole(status, viewerRole);
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

  // External chain statuses (M1 foundation · palette refined in M4)
  [STATUSES.PENDING_EXTERNAL_APPROVAL]: '#0EA5E9', // Sky-500 (external review in progress)
  [STATUSES.PENDING_CM_FINAL]: '#7C3AED',          // Violet-600 (CM final — near CM's approval violet)

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
