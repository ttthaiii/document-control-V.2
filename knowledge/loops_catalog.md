# Harness Loops — Catalog

These are the documented control loops of the harness. Each loop is a discrete, repeating cycle with named stages, enforcement status, and links to the real artifacts it governs. All 9 follow the schema defined in `docs/session_templates/loop_doc_schema.md`.

---

## Session Lifecycle Loops

| Loop | File | One-line description |
|---|---|---|
| Boot | [boot_loop](boot_loop.md) [[boot_loop]] | B1→B4 sequence that orients every session before the first response |
| Per-Turn Routing | [per_turn_routing_loop](per_turn_routing_loop.md) [[per_turn_routing_loop]] | C0→C3 gate that fires before every turn — compact, complaint, token ceiling, topic switch |
| Info Gather | [info_gather_loop](info_gather_loop.md) [[info_gather_loop]] | Phase 1: G0 clarity → G1 scan → G2 batch grep → G3 assess → gather_complete.md |
| MECE Plan | [mece_plan_loop](mece_plan_loop.md) [[mece_plan_loop]] | Phase 2: M1–M6 build and confirm the execution plan, write mece_plan.md from schema |
| REACT Execution | [react_execution_loop](react_execution_loop.md) [[react_execution_loop]] | Phase 3: L1 Select → L2 Execute → L3 Observe → L4 Verify → L4.5 Purge → L5 Decide |
| Session Close | [session_close_loop](session_close_loop.md) [[session_close_loop]] | 8-stage close: gate → scope-creep → Verify-N → handoff → compact_state → /compact → clear → done |

## Cross-Cutting Loops

| Loop | File | One-line description |
|---|---|---|
| Token Tracking | [token_tracking_loop](token_tracking_loop.md) [[token_tracking_loop]] | Per-turn hook accumulates SESSION/CHAT/LOOP_WEIGHT; agent reads, writes JSONL, checks R3 |
| Error / Debug | [error_debug_loop](error_debug_loop.md) [[error_debug_loop]] | R9: recurrence check → pre-debug greps → ID → rank hypotheses → disproof-first → escalate |
| Self-Improvement | [self_improvement_loop](self_improvement_loop.md) [[self_improvement_loop]] | 8-stage CFP immune-system: Detect → Log → Escalate → Fix → Record → Verify → Measure → Re-open |

---

> All 9 loop docs follow the template in [docs/session_templates/loop_doc_schema.md](../docs/session_templates/loop_doc_schema.md).

## See also (sibling knowledge)

- [harness_authoring_techniques](harness_authoring_techniques.md) [[harness_authoring_techniques]] — the 13 instruction-*writing* technique families used to build the rules these loops run on (contracts, signals, phase-gating, …) with strengths/weaknesses + external contrast.
- [skill_authoring_principles](skill_authoring_principles.md) [[skill_authoring_principles]] — how to author a single SKILL.md package.
