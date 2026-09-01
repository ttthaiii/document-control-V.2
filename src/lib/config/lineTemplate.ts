// ── Configurable approval-line templates (T-016) ────────────────────────────────
// The "line approve" an admin configures per module (optionally scoped to one project).
// A template is pure configuration: it seeds a live ExternalChain (workflow.ts) at
// document time. Nothing here is written per-document — the running instance lives on
// the document's `externalChain`. Approach C (frozen-past / updatable-future) keys off
// `version`: a chain records the templateVersion it was seeded from, and the admin
// impact-check compares that against the current template version.
//
// Two levels:
//   Stage  (this file) = a ROLE that must act, in order  → the MAIN line.
//   Member (Phase B)   = the specific PEOPLE inside a stage → the person-level SUB-line.
// Phase A ships the Stage level only; the sub-line fields (`subLineMode` here,
// `members` on ExternalApprovalStep) are defined but inert.

import type { Role } from './workflow';
import { ROLES } from './workflow';

/** Which module a line template governs. */
export type LineModule = 'RFA' | 'RFI';

/**
 * How a stage's person-level sub-line resolves (Phase B — inert in Phase A).
 * ALL = every listed member must act; ANY = one member acting satisfies the stage.
 */
export type SubLineMode = 'ALL' | 'ANY';

/** One ordered stage in a line template = a role that must act at this position. */
export interface LineStageTemplate {
  order: number;              // 0-based position in the line
  role: Role;                 // the role that acts at this stage
  mandatory: boolean;         // mandatory stages cannot be removed by a per-document override
  subLineMode?: SubLineMode;  // person-level sub-line resolution (Phase B) — inert for now
}

/**
 * A per-module approval-line template. `id` is stable; `version` bumps on every admin
 * edit so in-flight documents can be impact-checked against the change (Approach C).
 *
 * T-016: keyed by (module [+ siteId]) only — the document "category" dimension is gone.
 * `siteId` scopes the template to ONE project. Absent/undefined = the system-wide DEFAULT
 * template (which ALWAYS exists and is un-deletable — see SYSTEM_DEFAULT_LINE_STAGES). A
 * project template overrides the default for that module; the default is the fallback.
 * Only INTERNAL projects use these — EXTERNAL projects have no external flow (resolve
 * short-circuits to 'none').
 */
export interface LineTemplate {
  id: string;
  module: LineModule;
  siteId?: string;            // T-016: project scope; absent = system-wide default
  version: number;            // bumps on each admin edit; impact-check keys off this
  stages: LineStageTemplate[];
}

/**
 * The built-in system default line — the pure, code-level fallback that guarantees an
 * INTERNAL document ALWAYS resolves to a real line even when no Firestore template doc
 * exists yet. Admins can edit the persisted system-default doc (S3 ensures it exists and
 * blocks its deletion), but this constant is the floor it is seeded from and the last
 * resort if the doc is somehow missing. T-016: NO hardcoded CM-final tail — CM leads,
 * then Designer, then Owner; the admin reshapes freely from there.
 */
export const SYSTEM_DEFAULT_LINE_STAGES: LineStageTemplate[] = [
  { order: 0, role: ROLES.CM, mandatory: true },
  { order: 1, role: ROLES.DESIGNER, mandatory: false },
  { order: 2, role: ROLES.OWNER, mandatory: false },
];
