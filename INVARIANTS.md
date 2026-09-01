# INVARIANTS.md — Hard Constraints for This Codebase

> These rules apply to ALL agents and ALL sessions. No exceptions.
> Source of truth for destructive-action gates. CLAUDE.md + AGENTS.md reference this file.

---

## I1 · Destructive Action Gate

Before executing any action below → emit gate and WAIT for user confirmation.

| Action | Why |
|---|---|
| Delete or overwrite any file in `src/` or `knowledge/` | Irreversible without git |
| Any edit to files in `src/db/` | Changes DB structure or data shape |
| Change/rename/remove TypeScript type or interface with DB column fields | Drizzle derives schema from TS types — silent breakage |
| Any symbol in `index_variables.json` with type `DBTable`, `DBColumn`, or `DrizzleSchema` | Cascading data corruption |
| Batch operations affecting >5 files at once | Hard to audit and roll back |
| Any action outside current roadmap task scope | Scope creep risk |

Gate format — emit and pause:
```
[gate] Action: `<what>` · Scope: `<files/tables affected>` · Risk: `<why>` · Waiting: confirm
```
Do NOT proceed until user confirms.

---

## I2 · DB Structure Hard Stop

**Any trigger below = HALT immediately. Do NOT touch anything until user says "yes" explicitly.**

Triggers (any one is enough):
- Edit to any file in `src/db/` (schema, migration, seed, connection, queries)
- Rename, remove, or change TypeScript type/interface that has DB column fields
- Any symbol in `index_variables.json` with type `DBTable`, `DBColumn`, or `DrizzleSchema`
- Adding/removing columns, changing column types, altering table relationships

Gate — emit and WAIT before any tool call:
```
[db-gate] File: `<path>` · Symbol: `<name>` · Change: `<what will change>`
          DB impact: `<tables/columns affected>` · Data risk: `<what could break>`
          → Waiting for explicit "yes" — NOT proceeding until confirmed
```

On user confirm → proceed (still subject to I1 gate).
On unclear or no response → treat as deny. Re-state impact and ask again.

**"It's just a TypeScript type" is NOT an exemption.**
Drizzle derives DB schema from TypeScript types — a type rename silently breaks migrations and queries.

---

## I3 · Knowledge Index Sync

After any symbol create/delete/rename → MUST update both indexes before closing task:
- `knowledge/index_variables.json` — symbol entry + line numbers
- `knowledge/index_files.json` — backlinks

Run: `python scripts/symbol_indexer.py` to regenerate.

---

## I4 · Pre-Edit Symbol Check (Required)

Before editing any symbol that appears in `knowledge/index_variables.json`:

```bash
grep -A 8 '"SymbolName"' knowledge/index_variables.json   # check used_in array
```

Emit and log:
```
[pre-edit] Symbol: `<name>` · used_in: <N files> · safe to edit: <yes|needs review>
```

---

## I5 · Roadmap Entry Required

Every task (bug fix, feature, enhancement) must exist in `docs/master_roadmap.md` before execution.
Never duplicate task IDs. grep roadmap before creating.

---

## Protected Zones

| Path | Status | Rule |
|---|---|---|
| `src/db/` | PROTECTED | I2 Hard Stop |
| `knowledge/` | PROTECTED | I1 Gate required |
| `src/` | GUARDED | I1 Gate for delete/overwrite |
| `.agents/` | GUARDED | I1 Gate for structural changes |

---

## I6 · Sequential Roadmap ID Assignment (Parallel Agents)

In parallel fan-out, orchestrator MUST pre-assign roadmap IDs before spawning:
1. `grep -c "\[ \] T-" docs/master_roadmap.md` → identify current last T-N
2. Pre-assign T-N+1, T-N+2 ... for each planned section in this Cycle
3. Write ALL entries as `[ ]` in roadmap BEFORE any spawn call
4. Pass assigned T-ID to each sub-agent in the Delegation Contract

**Sub-agents MUST NOT self-assign roadmap IDs.** Parallel agents reading the same roadmap simultaneously will generate duplicate T-IDs.

---

## I7 · Cycle Token Merge (After Every Cycle N)

After orchestrator reads all cycle_N_*.json results:
1. Sum `tokens_estimated` from every result file in the Cycle
2. Add sum to SESSION_TOTAL in working memory
3. Write updated SESSION_TOTAL to `.sessions/session_tokens.md`
4. Check R3 threshold immediately after write

If any result file is missing `tokens_estimated` → add 2,000 tokens flat as conservative buffer.
**Missing this step = SESSION_TOTAL silently undercounts parallel work → threshold triggers missed (CFP-009)**

---

## I8 · CFP ID Pre-Assignment (Parallel Agents)

When spawning parallel sub-agents where any might log a CFP entry:
1. Before spawning: `grep -c "^## CFP-" CODING_FAILURE_PATTERNS.md` → get current count N
2. Pre-assign CFP-(N+1), CFP-(N+2) … for each sub-agent that may log
3. Write empty placeholder `<!-- CFP-<ID> reserved -->` at end of file BEFORE spawn
4. Pass assigned CFP-ID to each sub-agent in Delegation Contract
5. Sub-agents MUST NOT self-assign CFP IDs (race condition risk — same pattern as T-IDs)

On merge: orchestrator verifies each placeholder was filled. Missing fill = sub-agent did not log → remove placeholder.
If sub-agent logs beyond its assigned range → orchestrator renumbers on merge and updates CODING_FAILURE_PATTERNS.md.

**Missing this step = duplicate CFP numbers when ≥2 agents both call `grep -c` simultaneously (V6 vulnerability)**

---

## I9 · Fail-Open Must Be Loud (T-355)

Every gate hook (`danger_gate` · `skill_gate` · `phase_gate` · `spawn_gate` · `cfp_fix_plan_gate` · `init_gate` · `git_guard`) fails **open** — an unexpected exception in the gate allows the action rather than bricking the loop. That safety valve stays. What is **forbidden** is a *silent* fail-open: a gate that dies on an exception must never be indistinguishable from a gate that passed (scrutinize #1 — a dead gate could go unnoticed for weeks).

Rule: a gate's outermost `except` MUST call `gatelib.report_fail_open("<gate>", exc)` **before** it allows the action. That helper (1) appends a durable event to `.sessions/gate_health.jsonl` and (2) emits a visible `[gate-error]` line; `boot_init.sh` surfaces the day's events as `[gate-health]`.

- Preserve fail-open (still allow) — never convert a gate to fail-closed to make it loud.
- Re-raise `SystemExit` first, so intentional block(2)/allow(0) exit codes are untouched — only genuine unexpected crashes are reported.
- Guard the `import gatelib` (F1): a missing/broken helper must fall back to a plain `[gate-error]` stderr line, never crash the live gate.
- `report_fail_open` is best-effort and never raises into the caller; the log is bounded (rotated) and boot shows only **today's** events so the notice can never decay into permanent noise (F3).

**A new gate added without a loud outermost fail-open = this invariant violated.**
