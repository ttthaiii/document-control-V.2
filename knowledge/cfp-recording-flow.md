# CFP Recording Flow — How a mistake becomes a permanent guardrail
# Purpose: single reference for WHAT a CFP stores + HOW it is recorded (which file is read/written per step).
# Scope: the R16 self-improve + harness_doctor recording path. Enforcement hooks live elsewhere (see Cross-refs).
# date_created: 2026-07-08
# topic: self-improvement

---

## 1. What one CFP stores (8 fields)

A single CFP entry in `CODING_FAILURE_PATTERNS.md` records:

| Field | Meaning |
|---|---|
| `Symptom` | The observable failure — what actually went wrong. |
| `Root` | Why it happened (the underlying cause, not the surface). |
| `Prevention` | The rule/behavior that stops it recurring. |
| `Detection` | The signal that says it is about to recur. |
| `topic` | Canonical topic bucket (e.g. `boot-routing`). One topic per CFP. |
| `count` | How many times this failure has occurred (the counter). |
| `recurrences[]` | Append-only log: each repeat with date + context. |
| `status` / `Fixed-by` | Whether a structural fix shipped, and which Task shipped it. |

---

## 2. Recording flow (read/write per step)

The chain of thought when a failure signal arrives (R16):

| Step | Action | READ | WRITE |
|---|---|---|---|
| ① TRIGGER | Detect failure signal → emit `[self-improve]` | `CLAUDE.md §R16` (signal list + rules) | — |
| ② DOCTOR (find-existing-first) | Avoid duplicate CFPs — search before creating | `knowledge/index_cfp_fix.json` (grep symptom) · `knowledge/cfp_topics.md` (keyword→topic) | — |
| ③ Match found | Log a recurrence instead of a new entry | — | `knowledge/index_cfp_fix.json` (`count++`, `last_seen`, `recurrences[]`) |
| ④ No match → new + verify | Open a new entry, then count to confirm | `grep -c "^## CFP-"` on the same `.md` | `CODING_FAILURE_PATTERNS.md` (`## CFP-N+1` + 8 fields) → emit `[✓ CFP-N]` |
| ⑤ Threshold reached | Stop relying on memory; ship a real fix | — | `CODING_FAILURE_PATTERNS.md` (`status: fixed`, `Fixed-by T-N`) + new `scripts/<fix>.py` / hook |

---

## 3. Counter thresholds (escalation ladder)

The counter is what turns a logbook into a learning system — it measures repetition, not just records it.

| `count` | State | Action |
|---|---|---|
| `< 3` | logged | Just record the recurrence. |
| `≥ 3` | fix-required | Must ship a structural fix (code/hook), not another note. |
| `≥ 5` | fix-escalated | Urgent — escalate. |

Example: `CFP-044` (a skill invoked without loading its local `SKILL.md`) recurred 3 times → hit `fix-required` → shipped `scripts/skill_gate.py` (a PreToolUse hook that hard-blocks close when a demanded review skill was never loaded) → closed as `Fixed-by T-263`.

---

## 4. Supporting scripts (automatic — no manual invocation)

| Script | Role |
|---|---|
| `scripts/boot_init.sh` | Reads and reports `CFP_COUNT` at boot. |
| `scripts/cfp_recurrence.py` | Logs a recurrence (`count++`). |
| `scripts/cfp_fix_probe.py` | Checks whether `count` reached the fix threshold. |
| `scripts/cfp_decay.py` | Decays `window_count` for stale CFPs over time. |
| `scripts/rule_indexer.py` · `scripts/index_reconcile.py` | Keep the `.md` and `.json` in sync (safety net at session close). |

---

## 5. Two files, one source of truth

CFP data lives in two places on purpose:

- `CODING_FAILURE_PATTERNS.md` — **the human-authored source of truth** (prose the agent reads and writes).
- `knowledge/index_cfp_fix.json` — a **machine-countable index** derived from it (fast grep, counters, thresholds).

If both were edited independently their numbers would drift. So `rule_indexer.py` / `index_reconcile.py` reconcile the `.json` back to the `.md` — the `.md` is the master, the `.json` is a synced copy. This is the single-source-of-truth rule: one master, everything else is a derived copy that must be reconciled, never independently authored.

---

## Cross-refs
- Rule: `CLAUDE.md §R16` (Self-Improvement + Doctor Flow BC-A/BC-B/BC-E)
- Topic registry: `knowledge/cfp_topics.md`
- Fix index: `knowledge/index_cfp_fix.json`
- Entries: `CODING_FAILURE_PATTERNS.md`
- Enforcement hooks: `scripts/skill_gate.py`, `scripts/phase_gate.py`, `scripts/posttool_track.py`
- Related flow docs: `knowledge/file-lifecycle-flow.md`, `knowledge/boot_loop.md`, `knowledge/error_debug_loop.md`
