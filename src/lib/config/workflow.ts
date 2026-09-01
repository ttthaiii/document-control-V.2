// src/lib/config/workflow.ts

// Type-only import (erased at compile — lineTemplate.ts imports Role back from here, but a
// type-only cycle produces no runtime require cycle). T-016 (A2) seeds chains from templates.
import type { LineTemplate } from './lineTemplate';

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
  // ── T-016 (A1) — optional, defaulted so every existing call-site still compiles ──
  mandatory?: boolean;           // seeded from the template stage; a mandatory stage cannot be
                                 // removed by a per-document override. undefined ⇒ not mandatory.
  members?: string[];            // person-level sub-line (Phase B) — the specific userIds inside
                                 // this stage. INERT in Phase A; nothing reads it yet.
}

// ── T-016 (A1) — a send-back (Rewind) round on the chain ──────────────────────────
// Appended, never mutated, each time the line is sent back to an earlier stage. Named
// "RevisionRecord" (not "revision") to stay distinct from an RFA DOCUMENT revision
// (rfa.ts revisionNumber). Preserves the acks that were rolled back so the audit trail
// is NEVER lost (INVARIANT). Written by sendBackChain in A2.
export interface RevisionRecord {
  revisionNumber: number;             // 1-based send-back round on THIS chain
  sentBackBy: string;                 // userId who triggered the send-back
  sentBackByRole?: Role;              // their role (for the audit line)
  reason: string;                     // why it was sent back
  targetOrder: number;                // the stage order the line was rewound to
  sentBackAt: string;                 // ISO timestamp
  rolledBackSteps?: ExternalApprovalStep[]; // snapshot of the acks that were rolled back
}

// The chain CM configures at review time (step 2 of the flow). Sequential: exactly one
// step is "current" at a time, tracked by currentStepIndex.
export interface ExternalChain {
  steps: ExternalApprovalStep[];
  currentStepIndex: number;      // index of the active step; === steps.length ⇒ chain complete (back to CM)
  configuredBy: string;          // CM userId who built the chain
  configuredAt: string;          // ISO timestamp
  // ── T-016 (A1) — optional, defaulted so every existing call-site still compiles ──
  overrideLocked?: boolean;      // set true on the FIRST send-back of this doc; locks per-doc
                                 // override editing thereafter. undefined ⇒ unlocked.
  sendBackHistory?: RevisionRecord[]; // append-only send-back (Rewind) rounds; preserves rolled-back acks
  templateId?: string;           // the LineTemplate this chain was seeded from (Approach C)
  templateVersion?: number;      // template version at seed time; impact-check compares vs current
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

// Build a chain from an ordered role list. Sorts by order (re-indexed 0-based), every step
// PENDING, starts at index 0. Validates only: ≥1 step. Any role, repeats allowed (T-016).
export function configureExternalChain(
  config: { role: Role; order: number }[],
  configuredBy: string,
): ExternalChain {
  if (!config || config.length === 0) {
    throw new Error('External chain requires at least one step');
  }
  // T-016 (RFA rebuild): the line is fully admin-configurable — ANY role may be a stage, and
  // a role may repeat (e.g. CM → Designer → Owner → CM). No role-domain or uniqueness gate
  // here anymore; CM is just another stage, not a fixed entry/final.
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

// ── T-016 (A2): line-template engine (pure — never mutate inputs) ─────────────────
// Three primitives the routes + admin server route call:
//   seedChainFromTemplate — build a live chain from a configured template (Approach C stamp)
//   sendBackChain         — Rewind to an earlier stage, preserving rolled-back acks (audit)
//   impactCheckChain      — reconcile ONE in-flight chain against an edited template

// T-016 (A2): PURE layered resolver. Given the two candidate templates a server helper
// already fetched (project-scoped + system-wide default), pick which one applies — gating
// cmSystemType FIRST. EXTERNAL projects have NO external flow, so they always resolve to
// 'none' (no line, no pre-fill, no seed) regardless of what templates exist. INTERNAL:
// a project template overrides the default; the default is the fallback; neither = 'none'.
// No Firestore here — the IO lives in the server helper (keeps workflow.ts pure).
export function selectTemplate(
  cmSystemType: 'INTERNAL' | 'EXTERNAL',
  projectTemplate: LineTemplate | null,
  defaultTemplate: LineTemplate | null,
): { template: LineTemplate | null; source: 'project' | 'default' | 'none' } {
  if (cmSystemType === 'EXTERNAL') return { template: null, source: 'none' };
  if (projectTemplate) return { template: projectTemplate, source: 'project' };
  if (defaultTemplate) return { template: defaultTemplate, source: 'default' };
  return { template: null, source: 'none' };
}

// T-016: PURE projection of a template into a {role, order} editor config. Mirrors
// seedChainFromTemplate (RFA rebuild): EVERY stage is projected — any role incl CM, repeats
// allowed — so an editor and the server-side seed agree on the whole line. Emits the 1-based
// {role, order} shape (ExternalChainConfig normalizes to 1..n).
export function externalChainConfigFromTemplate(
  template: LineTemplate,
): { role: Role; order: number }[] {
  return [...template.stages]
    .sort((a, b) => a.order - b.order)
    .map((s, i) => ({ role: s.role, order: i + 1 }));
}

// Build the line from a project/default template. EVERY configured stage becomes a step —
// any role (incl CM), in any order, repeats allowed (T-016 RFA rebuild: the whole line is
// admin-configured, CM is just another stage). Preserves the stage `mandatory` flag and
// stamps templateId/templateVersion so a later admin edit can impact-check this chain
// (Approach C). Validates only: ≥1 stage.
export function seedChainFromTemplate(
  template: LineTemplate,
  configuredBy: string,
): ExternalChain {
  const orderedStages = [...template.stages]
    .sort((a, b) => a.order - b.order);
  if (orderedStages.length === 0) {
    throw new Error(`Template ${template.id} has no stages`);
  }
  // T-016 (RFA rebuild): EVERY stage becomes a step — any role (incl CM), repeats allowed.
  const steps: ExternalApprovalStep[] = orderedStages.map((s, i) => ({
    role: s.role,
    order: i,                         // re-index 0-based across the external segment
    status: EXTERNAL_STEP_STATUSES.PENDING,
    mandatory: s.mandatory,
  }));
  return {
    steps,
    currentStepIndex: 0,
    configuredBy,
    configuredAt: new Date().toISOString(),
    templateId: template.id,
    templateVersion: template.version,
  };
}

// Rewind the chain to an earlier stage (send-back). Re-opens every step in
// [targetOrder .. reached] back to PENDING, snapshots the acks it rolled back into a
// RevisionRecord (audit is NEVER lost — INVARIANT), appends that record with an
// incremented revisionNumber, and LOCKS per-document override (overrideLocked=true) —
// the lock is irreversible for this doc's lifetime. Returns a NEW chain.
// `reached` = the step the doc had gotten to; when the chain is already complete
// (currentStepIndex === steps.length, i.e. back at CM final) it rewinds from the last step.
export function sendBackChain(
  chain: ExternalChain,
  targetOrder: number,
  byUser: { userId: string; role?: Role },
  reason: string,
): ExternalChain {
  const targetIndex = chain.steps.findIndex((s) => s.order === targetOrder);
  if (targetIndex < 0) {
    throw new Error(`sendBackChain: no step with order ${targetOrder}`);
  }
  const reachedIndex = Math.min(chain.currentStepIndex, chain.steps.length - 1);
  if (targetIndex > reachedIndex) {
    throw new Error(`sendBackChain: target order ${targetOrder} is ahead of the current position`);
  }
  const rolledBackSteps: ExternalApprovalStep[] = [];
  const steps = chain.steps.map((s, i) => {
    if (i >= targetIndex && i <= reachedIndex) {
      if (s.status !== EXTERNAL_STEP_STATUSES.PENDING || s.actedAt) {
        rolledBackSteps.push({ ...s }); // preserve the ack exactly as it was BEFORE re-opening
      }
      // Re-open: back to PENDING, outcome fields cleared. Config (mandatory/members) kept.
      return {
        role: s.role,
        order: s.order,
        status: EXTERNAL_STEP_STATUSES.PENDING,
        mandatory: s.mandatory,
        members: s.members,
      };
    }
    return s;
  });
  const revisionNumber = (chain.sendBackHistory?.length ?? 0) + 1;
  const record: RevisionRecord = {
    revisionNumber,
    sentBackBy: byUser.userId,
    sentBackByRole: byUser.role,
    reason,
    targetOrder,
    sentBackAt: new Date().toISOString(),
    rolledBackSteps: rolledBackSteps.length ? rolledBackSteps : undefined,
  };
  return {
    ...chain,
    steps,
    currentStepIndex: targetIndex,
    overrideLocked: true,
    sendBackHistory: [...(chain.sendBackHistory ?? []), record],
  };
}

export type ImpactClassification = 'unaffected' | 'affected-future';

export interface ChainImpactResult {
  classification: ImpactClassification;
  chain: ExternalChain;            // unchanged when unaffected; future-rebuilt when affected
  changedFromOrder: number | null; // first future order that was rewritten, else null
}

// Approach C reconciliation of ONE in-flight chain against an edited template. Past steps
// (index < currentStepIndex) AND the ACTIVE step (=== currentStepIndex) are FROZEN — never
// touched, even if the template changed them; mutating a step someone is acting on corrupts
// the doc (risk R4). Only steps STRICTLY AFTER the active one are rebuilt from the new
// template. Returns a NEW chain (pure) + a classification for the admin impact report.
export function impactCheckChain(
  chain: ExternalChain,
  newTemplate: LineTemplate,
): ChainImpactResult {
  const newFuture = [...newTemplate.stages]
    .sort((a, b) => a.order - b.order)
    .map((s, i) => ({ role: s.role, order: i, mandatory: s.mandatory }));

  const active = chain.currentStepIndex;              // may === steps.length when complete
  const frozen = chain.steps.slice(0, active + 1);    // past + active (whole array if complete)
  const oldFuture = chain.steps.slice(active + 1);
  const wantFuture = newFuture.slice(active + 1);      // new template's steps beyond the active one

  let changedFromOrder: number | null = null;
  if (oldFuture.length !== wantFuture.length) {
    changedFromOrder = wantFuture.length ? wantFuture[0].order : (oldFuture[0]?.order ?? null);
  } else {
    for (let i = 0; i < wantFuture.length; i++) {
      if (
        oldFuture[i].role !== wantFuture[i].role ||
        oldFuture[i].order !== wantFuture[i].order ||
        (oldFuture[i].mandatory ?? false) !== (wantFuture[i].mandatory ?? false)
      ) {
        changedFromOrder = wantFuture[i].order;
        break;
      }
    }
  }

  const versionSame = chain.templateVersion === newTemplate.version;
  if (changedFromOrder === null && versionSame) {
    return { classification: 'unaffected', chain, changedFromOrder: null };
  }

  const rebuiltFuture: ExternalApprovalStep[] = wantFuture.map((s) => ({
    role: s.role,
    order: s.order,
    status: EXTERNAL_STEP_STATUSES.PENDING,
    mandatory: s.mandatory,
  }));
  const nextChain: ExternalChain = {
    ...chain,
    steps: [...frozen, ...rebuiltFuture],
    templateId: newTemplate.id,
    templateVersion: newTemplate.version,
  };
  return {
    // structurally identical but version differed ⇒ just a re-stamp, not a real impact
    classification: changedFromOrder === null ? 'unaffected' : 'affected-future',
    chain: nextChain,
    changedFromOrder,
  };
}

// One proposed future step in a per-document override (role-level; person-level = Phase B).
export interface OverrideStepInput {
  role: Role;
  mandatory?: boolean; // ignored for a NEWLY-added step (only admin templates set mandatory);
                       // a preserved step keeps its own mandatory flag regardless of this.
}

// Per-document line override (A3): the person about to advance reshapes the FUTURE tail of
// THIS document's chain — add/remove not-yet-reached steps. INVARIANTS mirrored from
// impactCheckChain: past steps AND the ACTIVE step are FROZEN (never touched). A MANDATORY
// future step cannot be removed. Any role may be a step (T-016 — no EXTERNAL_APPROVER_ROLES
// restriction); the per-document override still requires roles unique across the resulting
// chain (a Phase-A override limitation — the MAIN admin line already supports repeats).
// Refused once the chain is overrideLocked
// (the lock is set by the first send-back). Returns a NEW chain (pure); does NOT lock and
// leaves currentStepIndex + sendBackHistory untouched — who edited is captured by the route's
// activity log, not a chain field. Permission (does the caller hold the active step?) is the
// route's gate via canEditLineOverride; this stays purely structural.
export function applyLineOverride(
  chain: ExternalChain,
  newFutureSteps: OverrideStepInput[],
): ExternalChain {
  if (chain.overrideLocked) {
    throw new Error('applyLineOverride: chain override is locked (a send-back has occurred)');
  }
  const active = chain.currentStepIndex;
  const frozen = chain.steps.slice(0, active + 1);   // past + active — untouched
  const oldFuture = chain.steps.slice(active + 1);

  // A mandatory future step must be preserved (matched by role) — override can't remove it.
  const keptRoles = new Set(newFutureSteps.map((s) => s.role));
  for (const s of oldFuture) {
    if (s.mandatory && !keptRoles.has(s.role)) {
      throw new Error(`applyLineOverride: cannot remove mandatory step (${s.role})`);
    }
  }

  // Proposed future: external roles only, unique across the WHOLE resulting chain.
  const frozenRoles = new Set(frozen.map((s) => s.role));
  const seen = new Set<Role>();
  for (const s of newFutureSteps) {
    // T-016 (RFA rebuild): any role may be added to the tail (incl CM). NOTE: the per-document
    // override still keeps roles UNIQUE across the resulting chain (the preservation + rebuild
    // below is role-keyed). Repeats are supported on the admin template line, not yet on a
    // per-doc override (Phase B) — the main configured line has no such restriction.
    if (frozenRoles.has(s.role) || seen.has(s.role)) {
      throw new Error(`applyLineOverride: duplicate role in the line (${s.role})`);
    }
    seen.add(s.role);
  }

  // Rebuild the tail: a preserved step keeps its own mandatory flag; a newly-added step is
  // never mandatory. Everything re-opened to PENDING, orders re-indexed after the frozen head.
  const oldByRole = new Map(oldFuture.map((s) => [s.role, s]));
  const rebuiltFuture: ExternalApprovalStep[] = newFutureSteps.map((s, i) => ({
    role: s.role,
    order: frozen.length + i,
    status: EXTERNAL_STEP_STATUSES.PENDING,
    mandatory: oldByRole.get(s.role)?.mandatory ?? false,
  }));

  return { ...chain, steps: [...frozen, ...rebuiltFuture] };
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
 * PENDING_EXTERNAL_APPROVAL is listed as its OWN bucket (never collapsed) so CM can
 * filter to external-in-progress docs; the chart already counts it via the same
 * normalizeRfaStatusForRole passthrough (T-017).
 */
export const RFA_CM_FILTER_STATUSES: string[] = [
  STATUSES.PENDING_CM_APPROVAL,
  STATUSES.PENDING_EXTERNAL_APPROVAL,
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

// ── T-016 · RFA declarative transition table (Option 2) ──────────────────────────
// Single source of truth for RFA's (fromStatus, action, role) → (may-act, newStatus),
// mirroring RFI's RFI_TRANSITIONS. Before this, WHO-may-act lived in a branchy guard
// block and WHAT-status-results lived in a separate switch inside api/rfa/[id]/route.ts —
// you had to cross-reference two places to read one transition. Now each ROW co-locates
// both. Behavior is IDENTICAL to the pre-table code (verified by an exhaustive
// (status, action, role, system) diff — see the T-016 plan Verify-2).
//
// Genuinely imperative side-effects are NOT in the table — they stay in the route, keyed
// off `action` as before: FORWARD_EXTERNAL builds the chain from body.chainConfig; the
// EXT_* verdict writes the step outcome + advances the chain AFTER files move; file moves,
// workflow[] append, isLatestApproved. The table drives ONLY the permission gate + status.

// Guard ids — each maps to a predicate over RfaActionContext (see checkRfaGuard). Kept as
// named ids (not inline lambdas) so the table stays plain, serialisable data.
export type RfaTransitionGuard =
  | 'reviewerOrSendToCm'    // isReviewer OR the CAN_SEND_TO_CM override
  | 'reviewerOrRequestRev'  // isReviewer OR the CAN_REQUEST_REVISION override
  | 'creatorOwner'          // a CREATOR role that owns the doc (createdBy === acting user)
  | 'cmApprove'             // isCM OR the APPROVE override — INTERNAL round-1 decision
  | 'reviewerApprove'       // isReviewer OR the APPROVE-as-reviewer override — round-2 / EXTERNAL round-1
  | 'cmOnly'                // isCM ONLY (no override) — cm-final decision + FORWARD_EXTERNAL
  | 'externalStepHolder';   // whichever role currently holds the external-chain step

export interface RfaTransitionRow {
  action: string;
  from: string[];                                   // valid current statuses for THIS row
  guard: RfaTransitionGuard;
  // Resulting status. A string is static; a function resolves a context-dependent status
  // (SUBMIT_REVISION routing, external-chain advance). One row = one deterministic outcome.
  to: string | ((ctx: RfaActionContext) => string);
  // Restrict the row to one CM system. undefined ⇒ applies to BOTH INTERNAL and EXTERNAL.
  cmSystemType?: 'INTERNAL' | 'EXTERNAL';
}

// Everything the guards + status resolvers need, computed once in the route and passed in.
// Keeps workflow.ts pure: the route resolves the override booleans (via its checkPermission
// helper) and role flags, then hands them over — no permissions.ts import cycle here.
export interface RfaActionContext {
  userRole: Role;
  status: string;
  cmSystemType: 'INTERNAL' | 'EXTERNAL';
  rfaType?: string;
  isReviewer: boolean;
  isCM: boolean;
  isCreatorOwner: boolean;              // CREATOR role AND createdBy === acting user
  chain?: ExternalChain;
  // Per-permission overrides, pre-resolved by the route's checkPermission():
  canSendToCm: boolean;
  canRequestRevision: boolean;
  canApprove: boolean;                  // APPROVE override vs APPROVER_ROLES (CM round)
  canApproveAsReviewer: boolean;        // APPROVE override vs REVIEWER_ROLES (SITE round)
}

// The whole RFA state machine, as data. Rows are matched by (action, status, cmSystemType);
// at most one row matches any concrete (action, status, system) — no ambiguity.
// T-018: an INTERNAL document always has its `externalChain` seeded at creation (S2) — it
// enters the chain directly, landing on whichever stage is index 0 (CM by default), and never
// visits PENDING_CM_APPROVAL at all. Confirmed with the user that production has no document
// currently sitting at PENDING_CM_APPROVAL or mid an old-style forwarded chain, so the old
// INTERNAL round-1 CM-direct-approve fork and FORWARD_EXTERNAL are removed outright rather than
// kept gated off. EXTERNAL cmSystemType is untouched (never gets a chain, keeps PENDING_CM_APPROVAL).
export const RFA_TRANSITIONS: RfaTransitionRow[] = [
  // SITE/BIM internal loop (both systems) ────────────────────────────────────────
  { action: 'SEND_TO_CM',       from: [STATUSES.PENDING_REVIEW],    guard: 'reviewerOrSendToCm',   to: (ctx) => resolveSendToCmStatus(ctx) },
  { action: 'REQUEST_REVISION', from: [STATUSES.PENDING_REVIEW],    guard: 'reviewerOrRequestRev', to: STATUSES.REVISION_REQUIRED },
  { action: 'SUBMIT_REVISION',  from: [STATUSES.REVISION_REQUIRED], guard: 'creatorOwner',         to: (ctx) => resolveSubmitRevisionStatus(ctx) },

  // Approval — INTERNAL cm-final (after external chain, at PENDING_CM_FINAL) ───────
  // Plain isCM, NO override (matches the pre-table gate — override must NOT unlock this).
  { action: 'APPROVE',               from: [STATUSES.PENDING_CM_FINAL], cmSystemType: 'INTERNAL', guard: 'cmOnly', to: STATUSES.APPROVED },
  { action: 'APPROVE_WITH_COMMENTS', from: [STATUSES.PENDING_CM_FINAL], cmSystemType: 'INTERNAL', guard: 'cmOnly', to: STATUSES.PENDING_FINAL_APPROVAL },
  { action: 'REJECT',                from: [STATUSES.PENDING_CM_FINAL], cmSystemType: 'INTERNAL', guard: 'cmOnly', to: STATUSES.REJECTED },

  // Approval — INTERNAL round 2 (SITE classifies at PENDING_FINAL_APPROVAL) ────────
  { action: 'APPROVE_WITH_COMMENTS',     from: [STATUSES.PENDING_FINAL_APPROVAL], cmSystemType: 'INTERNAL', guard: 'reviewerApprove', to: STATUSES.APPROVED_WITH_COMMENTS },
  { action: 'APPROVE_REVISION_REQUIRED', from: [STATUSES.PENDING_FINAL_APPROVAL], cmSystemType: 'INTERNAL', guard: 'reviewerApprove', to: STATUSES.APPROVED_REVISION_REQUIRED },

  // Approval — EXTERNAL single round (Reviewer at PENDING_CM_APPROVAL) ─────────────
  { action: 'APPROVE',               from: [STATUSES.PENDING_CM_APPROVAL], cmSystemType: 'EXTERNAL', guard: 'reviewerApprove', to: STATUSES.APPROVED },
  { action: 'APPROVE_WITH_COMMENTS', from: [STATUSES.PENDING_CM_APPROVAL], cmSystemType: 'EXTERNAL', guard: 'reviewerApprove', to: STATUSES.APPROVED_WITH_COMMENTS },
  { action: 'REJECT',                from: [STATUSES.PENDING_CM_APPROVAL], cmSystemType: 'EXTERNAL', guard: 'reviewerApprove', to: STATUSES.REJECTED },

  // External approval chain (INTERNAL only) ───────────────────────────────────────
  // T-018: FORWARD_EXTERNAL removed — a new-model doc's chain is seeded at creation (S2),
  // it enters PENDING_EXTERNAL_APPROVAL directly via SEND_TO_CM/SUBMIT_REVISION above, so
  // there is no separate "forward" dispatch action left to perform.
  { action: 'EXT_APPROVE',               from: [STATUSES.PENDING_EXTERNAL_APPROVAL], cmSystemType: 'INTERNAL', guard: 'externalStepHolder', to: (ctx) => resolveExternalAdvanceStatus(ctx) },
  { action: 'EXT_APPROVE_WITH_COMMENTS', from: [STATUSES.PENDING_EXTERNAL_APPROVAL], cmSystemType: 'INTERNAL', guard: 'externalStepHolder', to: (ctx) => resolveExternalAdvanceStatus(ctx) },
  // T-016 (RFA rebuild): a stage reject ends the document (REJECTED, terminal) — no CM-final
  // adjudication tail. Send-back / revision remain available before a reject.
  { action: 'EXT_REJECT',                from: [STATUSES.PENDING_EXTERNAL_APPROVAL], cmSystemType: 'INTERNAL', guard: 'externalStepHolder', to: STATUSES.REJECTED },

  // Send-back Rewind (INTERNAL only · T-016 A2) — rewinds the external chain to an earlier
  // stage, preserving audit (sendBackChain side-effect in the route). The table drives only
  // the gate + status: the doc returns to PENDING_EXTERNAL_APPROVAL with an earlier holder.
  // EXT_SEND_BACK: the current external holder rewinds within the chain.
  // CM_SEND_BACK : CM at final reopens the (complete) chain back to an earlier external stage.
  { action: 'EXT_SEND_BACK', from: [STATUSES.PENDING_EXTERNAL_APPROVAL], cmSystemType: 'INTERNAL', guard: 'externalStepHolder', to: STATUSES.PENDING_EXTERNAL_APPROVAL },
  { action: 'CM_SEND_BACK',  from: [STATUSES.PENDING_CM_FINAL],          cmSystemType: 'INTERNAL', guard: 'cmOnly',            to: STATUSES.PENDING_EXTERNAL_APPROVAL },
  // EXT_OVERRIDE_LINE: the current external holder reshapes the FUTURE tail (add/remove
  // not-yet-reached steps). Status is unchanged — only the chain object is mutated (route side-effect).
  { action: 'EXT_OVERRIDE_LINE', from: [STATUSES.PENDING_EXTERNAL_APPROVAL], cmSystemType: 'INTERNAL', guard: 'externalStepHolder', to: STATUSES.PENDING_EXTERNAL_APPROVAL },
];

// T-018: "going to CM" means entering the chain directly once one is seeded (new-model doc) —
// otherwise the pre-T-018 PENDING_CM_APPROVAL. Shared by SEND_TO_CM and SUBMIT_REVISION so the
// two entry points never disagree on what "reached CM" resolves to.
function resolveReachedCmStatus(ctx: RfaActionContext): string {
  return ctx.cmSystemType === 'INTERNAL' ? STATUSES.PENDING_EXTERNAL_APPROVAL : STATUSES.PENDING_CM_APPROVAL;
}

// SEND_TO_CM routing (T-018): the SITE/BIM internal loop hands the document to CM.
function resolveSendToCmStatus(ctx: RfaActionContext): string {
  return resolveReachedCmStatus(ctx);
}

// SUBMIT_REVISION routing (unchanged from the pre-table switch): SHOP + ME/SN, or a
// Reviewer on MAT/GEN/SHOP, skips the SITE review step and goes straight to CM.
function resolveSubmitRevisionStatus(ctx: RfaActionContext): string {
  const isMEorSN = ctx.userRole === ROLES.ME || ctx.userRole === ROLES.SN;
  if (ctx.rfaType === 'RFA-SHOP' && isMEorSN) return resolveReachedCmStatus(ctx);
  if (ctx.isReviewer && ['RFA-MAT', 'RFA-GEN', 'RFA-SHOP'].includes(ctx.rfaType || '')) {
    return resolveReachedCmStatus(ctx);
  }
  return STATUSES.PENDING_REVIEW;
}

// External step verdict (T-016 RFA rebuild): an approval advances the line. When the LAST
// stage approves, the document is APPROVED outright — there is no hardcoded CM-final tail
// anymore (CM, if configured, is just another stage). Otherwise the next stage holds it.
// Uses the pre-act chain (docData.externalChain).
function resolveExternalAdvanceStatus(ctx: RfaActionContext): string {
  if (!ctx.chain) return STATUSES.PENDING_EXTERNAL_APPROVAL;
  return advanceExternalChain(ctx.chain).done
    ? STATUSES.APPROVED
    : STATUSES.PENDING_EXTERNAL_APPROVAL;
}

// Find the single transition row for a concrete (action, status, system), or null.
export function findRfaTransition(
  action: string,
  status: string,
  cmSystemType: 'INTERNAL' | 'EXTERNAL',
): RfaTransitionRow | null {
  return RFA_TRANSITIONS.find(
    (r) =>
      r.action === action &&
      r.from.includes(status) &&
      (r.cmSystemType === undefined || r.cmSystemType === cmSystemType),
  ) ?? null;
}

// Does this actor pass the row's guard? Pure over the pre-computed context.
export function checkRfaGuard(row: RfaTransitionRow, ctx: RfaActionContext): boolean {
  switch (row.guard) {
    case 'reviewerOrSendToCm':   return ctx.isReviewer || ctx.canSendToCm;
    case 'reviewerOrRequestRev': return ctx.isReviewer || ctx.canRequestRevision;
    case 'creatorOwner':         return ctx.isCreatorOwner;
    case 'cmApprove':            return ctx.isCM || ctx.canApprove;
    case 'reviewerApprove':      return ctx.isReviewer || ctx.canApproveAsReviewer;
    case 'cmOnly':               return ctx.isCM;
    case 'externalStepHolder':   return canActOnExternalStep(ctx.chain, ctx.userRole);
    default:                     return false;
  }
}

// Resolve the resulting status for a row (static string or context function).
export function resolveRfaStatus(row: RfaTransitionRow, ctx: RfaActionContext): string {
  return typeof row.to === 'function' ? row.to(ctx) : row.to;
}
