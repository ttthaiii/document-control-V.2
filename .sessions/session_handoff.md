# Session Handoff

skill: agent
CFP_COUNT: 51
task: T-018 P1 — roles foundation (central role registry + Creator requiresSiteReview flag)
mece_plan_hash: 3123d137
resume_at: done (P1 complete) → next P2 (runtime follows configured line)

## Objective
Make role→behaviour-group mapping data-driven behind ONE central accessor, and move the
"pass Site review?" creator decision from hardcoded (rfaType+role) into a per-role flag —
without changing existing behaviour, except one user-approved change (Option B).

## Outcome — DONE
- NEW `src/lib/config/roleRegistry.ts` (leaf): owns ROLES + Role + ROLE_REGISTRY (role→behaviour
  groups + requiresSiteReview) + accessors rolesInGroup / isInGroup / roleRequiresSiteReview.
- `src/lib/config/workflow.ts`: re-exports ROLES/Role from the registry; CREATOR/REVIEWER/
  APPROVER/EXTERNAL_APPROVER_ROLES now derived via rolesInGroup() (backward-compat — ~40 consumer
  imports unchanged). resolveSubmitRevisionStatus routes on roleRequiresSiteReview() instead of
  the hardcoded RFA-SHOP&&(ME|SN) case.
- NEW `scripts/test-role-registry.ts`: tsx parity test (no vitest/jest in project).

## Key decision (Option B, 2026-09-01)
ME/SN (งานระบบ) requiresSiteReview=false → skip Site for ALL rfa types. This is an INTENTIONAL
behaviour change for RFA-MAT/RFA-GEN (previously went to Site). BIM + other creators = true
(parity). Reviewer-forward branch unchanged.

## Architecture notes (deviations from the written plan, all API-preserving)
- ROLES moved into roleRegistry.ts (the leaf) so the registry is the single source with no
  runtime import cycle; workflow.ts re-exports. External import paths unchanged.
- SE/FM/PD have groups:[] (SE/FM = approved-doc observers; a future observer group likely in P3).
- Test at scripts/test-role-registry.ts (tsx pattern), not src/lib/config/__tests__/.

## Validation
- `npx tsc --noEmit` → clean (exit 0).
- `npx tsx scripts/test-role-registry.ts` → all assertions pass (derived-array set-equality +
  requiresSiteReview matrix + registry exhaustiveness + SUBMIT_REVISION routing via public API).
- Independent haiku reviewer re-ran both (Verify-N gate).
