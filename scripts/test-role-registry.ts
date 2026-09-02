// scripts/test-role-registry.ts
//
// P1 parity test for the role registry (run: `npx tsx scripts/test-role-registry.ts`).
// No unit-test framework is installed, so this follows the project's existing
// tsx-script test pattern (test:env / test:admin) and asserts with node:assert.
//
// Covers:
//   A. Derived group arrays === the pre-P1 hardcoded literals (set-equality).
//   B. roleRequiresSiteReview flag matrix (the Option B decision input).
//   C. Registry exhaustiveness — every ROLES value has an entry.
//   D. resolveSubmitRevisionStatus routing via the PUBLIC transition API, asserting
//      the agreed Option B matrix (ME/SN skip Site for ALL types) + unchanged rest.

import assert from 'node:assert';
import {
  ROLES,
  STATUSES,
  CREATOR_ROLES,
  REVIEWER_ROLES,
  APPROVER_ROLES,
  EXTERNAL_APPROVER_ROLES,
  findRfaTransition,
  resolveRfaStatus,
  type Role,
  type RfaActionContext,
} from '../src/lib/config/workflow';
import { ROLE_REGISTRY, roleRequiresSiteReview } from '../src/lib/config/roleRegistry';

const sortedSet = (xs: string[]) => [...new Set(xs)].sort();
const sameSet = (a: string[], b: string[], label: string) =>
  assert.deepStrictEqual(sortedSet(a), sortedSet(b), `set mismatch: ${label}`);

// ── A. Derived arrays === pre-P1 literals (hardcoded snapshot of the old values) ──
const ORIG = {
  creator: [ROLES.BIM, ROLES.ME, ROLES.SN, ROLES.SITE_ADMIN, ROLES.ADMIN, ROLES.PM, ROLES.PE, ROLES.OE],
  reviewer: [ROLES.SITE_ADMIN, ROLES.ADMIN_SITE_2, ROLES.OE, ROLES.PE, ROLES.ADMIN],
  approver: [ROLES.CM, ROLES.ADMIN, ROLES.SITE_ADMIN, ROLES.PM, ROLES.PE, ROLES.OE],
  externalApprover: [ROLES.DESIGNER, ROLES.OWNER],
};
sameSet(CREATOR_ROLES, ORIG.creator, 'CREATOR_ROLES');
sameSet(REVIEWER_ROLES, ORIG.reviewer, 'REVIEWER_ROLES');
sameSet(APPROVER_ROLES, ORIG.approver, 'APPROVER_ROLES');
sameSet(EXTERNAL_APPROVER_ROLES, ORIG.externalApprover, 'EXTERNAL_APPROVER_ROLES');

// ── B. requiresSiteReview flag matrix (Option B: only ME/SN skip Site) ──
const SKIP_SITE: Role[] = [ROLES.ME, ROLES.SN];
for (const role of Object.values(ROLES)) {
  const expected = !SKIP_SITE.includes(role as Role); // false only for ME/SN
  assert.strictEqual(
    roleRequiresSiteReview(role as Role),
    expected,
    `roleRequiresSiteReview(${role}) expected ${expected}`,
  );
}

// ── C. Registry exhaustiveness ──
for (const role of Object.values(ROLES)) {
  assert.ok(ROLE_REGISTRY[role as Role], `ROLE_REGISTRY missing role: ${role}`);
}

// ── D. resolveSubmitRevisionStatus routing via the public transition API ──
const row = findRfaTransition('SUBMIT_REVISION', STATUSES.REVISION_REQUIRED, 'INTERNAL');
assert.ok(row, 'SUBMIT_REVISION/REVISION_REQUIRED/INTERNAL transition row must exist');

const rowEXT = findRfaTransition('SUBMIT_REVISION', STATUSES.REVISION_REQUIRED, 'EXTERNAL');
assert.ok(rowEXT, 'SUBMIT_REVISION/REVISION_REQUIRED/EXTERNAL transition row must exist');

function ctx(over: Partial<RfaActionContext>): RfaActionContext {
  return {
    userRole: ROLES.BIM,
    status: STATUSES.REVISION_REQUIRED,
    cmSystemType: 'INTERNAL',
    rfaType: 'RFA-MAT',
    isReviewer: false,
    isCM: false,
    isCreatorOwner: true,
    canSendToCm: false,
    canRequestRevision: false,
    canApprove: false,
    canApproveAsReviewer: false,
    ...over,
  };
}

const CM_INTERNAL = STATUSES.PENDING_EXTERNAL_APPROVAL; // resolveReachedCmStatus(INTERNAL)
const SITE = STATUSES.PENDING_REVIEW;

const cases: Array<[string, RfaActionContext, string]> = [
  // Option B — ME/SN (งานระบบ) skip Site for ALL types (MAT/GEN previously went to Site):
  ['ME + MAT -> CM (B change)', ctx({ userRole: ROLES.ME, rfaType: 'RFA-MAT' }), CM_INTERNAL],
  ['ME + GEN -> CM (B change)', ctx({ userRole: ROLES.ME, rfaType: 'RFA-GEN' }), CM_INTERNAL],
  ['SN + SHOP -> CM (was already)', ctx({ userRole: ROLES.SN, rfaType: 'RFA-SHOP' }), CM_INTERNAL],
  // Unchanged — BIM (requires Site) always goes to Site as a plain creator:
  ['BIM + MAT -> Site', ctx({ userRole: ROLES.BIM, rfaType: 'RFA-MAT' }), SITE],
  ['BIM + SHOP -> Site', ctx({ userRole: ROLES.BIM, rfaType: 'RFA-SHOP' }), SITE],
  // Unchanged — a Reviewer forwarding MAT/GEN/SHOP still skips Site:
  ['Reviewer(SiteAdmin) + MAT -> CM', ctx({ userRole: ROLES.SITE_ADMIN, isReviewer: true, rfaType: 'RFA-MAT' }), CM_INTERNAL],
  // Unchanged — plain non-ME/SN creator, non-reviewer, goes to Site:
  ['PM + GEN -> Site', ctx({ userRole: ROLES.PM, rfaType: 'RFA-GEN' }), SITE],
];

for (const [label, c, expected] of cases) {
  assert.strictEqual(resolveRfaStatus(row!, c), expected, `routing: ${label}`);
}

// EXTERNAL system: ME still skips Site, but "reached CM" resolves to the legacy status.
assert.strictEqual(
  resolveRfaStatus(rowEXT!, ctx({ userRole: ROLES.ME, rfaType: 'RFA-MAT', cmSystemType: 'EXTERNAL' })),
  STATUSES.PENDING_CM_APPROVAL,
  'routing: ME + EXTERNAL -> legacy CM status',
);

console.log('OK — role registry parity: all assertions passed');
