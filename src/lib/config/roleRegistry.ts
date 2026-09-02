// src/lib/config/roleRegistry.ts
//
// Central role registry (P1 roles foundation, prerequisite of T-018).
//
// This is the LEAF of the role dependency graph: it owns ROLES + Role and the
// role -> behaviour-group mapping. workflow.ts re-exports ROLES/Role and the
// derived group arrays from here, so the ~40 files that import them from
// workflow.ts keep working unchanged (transparent re-export). Keeping the
// registry as the leaf (nothing here imports workflow.ts) avoids a runtime
// import cycle: workflow.ts -> roleRegistry.ts is a single direction.
//
// Config-in-code is step 1 of the agreed Hybrid path. A later Firestore/admin-UI
// swap replaces ONLY the ROLE_REGISTRY seed + accessors below, not the ~40
// consumers, because every consumer reads through the accessors / derived views.

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

// A role's default RFA behaviour. A role may belong to more than one group
// (e.g. Site Admin creates, reviews, and approves). A role with NO group is a
// non-actor in the RFA flow (e.g. SE/FM are approved-doc observers, PD unused) —
// an empty groups[] is intentional, never a missing seed.
export type BehaviourGroup = 'creator' | 'reviewer' | 'approver' | 'externalApprover';

export interface RoleMeta {
  groups: BehaviourGroup[];
  // Creator-only: does a document created by this role pass the Site review step
  // before reaching the approver chain? true = Create -> Site -> chain (e.g. BIM);
  // false = Create -> chain directly (e.g. งานระบบ ME/SN). Meaningless for
  // non-creator roles (they never hit the creator routing branch).
  requiresSiteReview?: boolean;
}

// Seeded EXACTLY from the pre-P1 hardcoded arrays in workflow.ts:
//   CREATOR_ROLES  = BIM, ME, SN, Site Admin, Admin, PM, PE, OE
//   REVIEWER_ROLES = Site Admin, Adminsite2, OE, PE, Admin
//   APPROVER_ROLES = CM, Admin, Site Admin, PM, PE, OE
//   EXTERNAL_APPROVER_ROLES = Designer, Owner
// requiresSiteReview: true for every creator (parity — they went to Site before),
// except ME/SN = false (งานระบบ, Option B 2026-09-01: skip Site for ALL rfa types).
// Set-equality against those originals is asserted by the parity test (S4).
export const ROLE_REGISTRY: Record<Role, RoleMeta> = {
  [ROLES.ADMIN]:        { groups: ['creator', 'reviewer', 'approver'], requiresSiteReview: true },
  [ROLES.BIM]:          { groups: ['creator'], requiresSiteReview: true },
  [ROLES.SITE_ADMIN]:   { groups: ['creator', 'reviewer', 'approver'], requiresSiteReview: true },
  [ROLES.CM]:           { groups: ['approver'] },
  [ROLES.ME]:           { groups: ['creator'], requiresSiteReview: false },
  [ROLES.SN]:           { groups: ['creator'], requiresSiteReview: false },
  [ROLES.OE]:           { groups: ['creator', 'reviewer', 'approver'], requiresSiteReview: true },
  [ROLES.PE]:           { groups: ['creator', 'reviewer', 'approver'], requiresSiteReview: true },
  [ROLES.PM]:           { groups: ['creator', 'approver'], requiresSiteReview: true },
  [ROLES.PD]:           { groups: [] },
  [ROLES.SE]:           { groups: [] }, // approved-doc observer (no RFA behaviour)
  [ROLES.FM]:           { groups: [] }, // approved-doc observer (no RFA behaviour)
  [ROLES.ADMIN_SITE_2]: { groups: ['reviewer'] },
  [ROLES.DESIGNER]:     { groups: ['externalApprover'] },
  [ROLES.OWNER]:        { groups: ['externalApprover'] },
};

// ── Accessors (the single read surface — a later DB swap changes only these) ──

// All roles in a behaviour group, in ROLES declaration order.
export function rolesInGroup(group: BehaviourGroup): Role[] {
  return (Object.keys(ROLE_REGISTRY) as Role[]).filter((role) =>
    ROLE_REGISTRY[role].groups.includes(group),
  );
}

// Is this role a member of the given behaviour group?
export function isInGroup(role: Role, group: BehaviourGroup): boolean {
  return ROLE_REGISTRY[role]?.groups.includes(group) ?? false;
}

// Does a document created by this role pass Site review first?
// Default true (parity-safe) — only an explicit false (ME/SN) skips Site.
export function roleRequiresSiteReview(role: Role): boolean {
  return ROLE_REGISTRY[role]?.requiresSiteReview !== false;
}
