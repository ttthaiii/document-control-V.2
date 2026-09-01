---
type: knowledge
domain: harness
topics:
  major: [self_improvement, knowledge_base]
  minor: [skill_sharing, cross_project, closed_learning_loop]
description: Design concept for a cross-machine "Agent Dev Wiki" — a shared, schema'd journal where each machine records the skills/tools it invented (project kind, task, painpoint, build, steps, result, relates_to) so other agents can read it and self-improve. Raw journal is separated from central engine skills by a mandatory Distill+Gate step. Backing task = T-319.
last_built: 2026-07-13
status: design-concept · refined 2026-07-13 → two-track split (not yet built — roadmap T-319, now P1)
---

# Agent Dev Wiki — Cross-Machine Skill/Tool Knowledge-Sharing

> Design concept captured 2026-07-10. **Not built.** Tracked as roadmap **T-319** (P2).
> This is the SUCCESS half of the [[closed-learning-loop]] — the failure half (CFP) already exists.

## 0. One-line

Every machine keeps a shared, schema'd **journal** of the skills/tools it invented while doing real work. The journals sync across machines over the existing plugin channel. Other agents read them to self-improve — but a raw entry only becomes a central engine skill after a mandatory **Distill + Gate** step. The goal is a central engine that gets **sharper, not fatter**.

## 1. Why (the gap)

The harness today learns from **failures** — `CODING_FAILURE_PATTERNS.md` (CFP) records bugs seen ≥N times and promotes fixes up. It does **not** learn from **successes**: a skill or tool invented while doing one project dies locally and never flows back to the central engine. Every new agent re-solves the same problems from scratch.

## 2. Three pieces already exist — but disconnected + single-machine

| Piece | What it does today | Limitation |
|---|---|---|
| `.sessions/self_improve_log.md` | Diary of "what I fixed" | **Local + failure-focused** (CFP), not a skill-birth story |
| `.sessions/promotions.md` (`scripts/session_analyzer.py`) | Counts patterns; ≥3 occurrences → promotion candidate → tool-script vs skill-rule | **Within a single project only** |
| `~/.claude/knowledge-shared` (`scripts/learning_profile.py:35`, `_SHARED_HOME`) | A machine-wide shared store | Today holds **only the user learning profile**, not a skill journal |

The vision = the **glue** that merges these into one cross-machine, narrative, schema'd journal.

## 3. Journal entry schema (versioned, central)

The `relates_to[]` field is the key edge — it turns a flat log into a **skill/tool MAP (graph)**, not a list.

| Field | Meaning |
|---|---|
| `project_kind` | What kind of project the user does (domain/shape) |
| `task` | The named piece of work |
| `painpoint` | What hurt / what was missing |
| `built` | The skill or tool that was created |
| `steps` | The working steps taken |
| `result` | The outcome |
| `relates_to[]` | Links to other skills/tools — makes the corpus a navigable map |

The schema itself is **versioned** and is a single source of truth (one definition, everyone conforms).

## 4. Two strict layers — never conflate

- **Layer 1 — Raw Journal / Wiki**: append-only, every machine reads it. Rich narrative. This is INPUT, not truth.
- **Layer 2 — Central Engine Skills/Tools** (in the plugin): only reached through **Gate + Distill**.

**Hard rule: reading a journal entry MUST NOT auto-adopt it.** Reading the diary ≠ changing your own skills.

### Gate + Distill (the guardrail that makes-or-breaks it)

| Step | Purpose | Example |
|---|---|---|
| Gate | Only promote if reused across ≥N projects AND generalizable AND no hardcoded project specifics | "LMS payroll calc" skill → REJECTED (LMS-specific) |
| Distill | Strip project specifics, keep the reusable pattern inside | From "payroll calc" → distill "time-range overlap check" → THAT is promotable |

Classification (already in `promotions.md`): deterministic → tool script · contextual → skill rule.

## 5. Federation — reuse the pipe, don't build a server

The plugin marketplace is already the shared distribution channel. A machine writes entries → they ride the plugin repo → other machines receive them on `/plugin update`. **No new server, no new DB.**

## 6. Privacy

Entries describe what the **user** does (project kind, painpoints) = confidential. Cross-machine sharing must be **opt-in** and **sanitized** (strip identifying detail) before an entry leaves the machine.

## 7. Skill changes required (answer to "do we update self_improve?")

**Yes.** `self_improve` today fires only on failures (CFP). It has no "a new skill/tool was BORN → write a journal entry" trigger. Required changes:

- `self_improve` (`.agents/skills/harness/self_improve/SKILL.md`): add a SUCCESS / skill-born trigger + a journal-write step in the central schema.
- `harness_doctor` and `session_analyzer.py`: plug into the same `~/.claude/knowledge-shared` store instead of local-only.

## 8. Closed loop (the whole thing in 4 steps)

1. A project invents a new skill → log a journal entry (skill-born event).
2. The central journal aggregates entries **across projects/machines**.
3. Threshold reached → **Distill + Gate** → human/AI review (never auto).
4. Passes → added to the central engine → `/plugin update` → every machine gets it → agents get sharper.

## 9. Reality check

Real build touching the engine in ≥4 places (schema · `knowledge-shared` store · `self_improve`/`harness_doctor` skills · plugin sync) plus a privacy design. **Must go through Phase 1 (gather) → Phase 2 (MECE plan, user-confirmed) before any code.** See roadmap **T-319**.

## 10. Refinement — 2026-07-13 (two-track split + precise birth trigger)

Clarified with the user. The single "journal" above splits into **TWO strictly separate stores in SEPARATE files** so their updates never collide:

- **Track 1 · CFP (failures)** — failure data ONLY (not skill creation). Lifted from per-project repos to machine-local single-source, in a versioned **export-ready** schema. Machines hand each other their CFP; on merge, **counts ADD across machines** (2+2→4 crosses the ≥3 must-fix line a single machine never reaches).
- **Track 2 · Skill/Tool wiki (successes)** — a separate store that **learns from Track 1**. Precise birth trigger = the existing **`[skill-miss]`** in the match-first manifest flow (boot B2): every task matches skill/tool first; when nothing fits AND the new-approach work **completes successfully**, THAT is the record point → an entry into `promotions` (lifted machine-wide) → ≥3 → candidate → Distill+Gate → central skill/tool.

**"Apply" has two levels** (resolves the read-vs-adopt tension): (A) use-now to inform the current task — no gate; (B) bake permanently into the central engine — Gate required. Reading ≠ adopting.

**Sync mechanics (both tracks):** central files are **append-only** (never overwrite in place) so concurrent writes never clobber; dedup uses a **consumer-side bookmark** (each machine records "received source-machine X up to seq N") — the shared file is never written back to; entry id = **timestamp + machine-id + sequence**. Federation stays **on-demand** (receive file → then learn), not real-time, over the existing plugin channel.

> Related: [[closed-learning-loop]] · [[single-source-of-truth]] · `.agents/skills/harness/self_improve/SKILL.md` · `.sessions/promotions.md` · `scripts/session_analyzer.py` · `scripts/learning_profile.py`

## 11 STAGE 1 built — 2026-07-13 (Track 1 CFP foundation)

STAGE 1 shipped the **foundation + Track 1 (CFP failure sharing)**. Track 2 (skill/tool
success wiki) and the Distill/Gate/privacy plumbing are NOT built yet.

**What exists now (3 scripts + one shared store):**
- `scripts/harness_paths.py` — now the **single source** of the machine-wide shared root
  (`shared_home()` = `~/.claude/knowledge-shared`, override `HARNESS_SHARED_HOME`), plus
  `shared_cfp_dir()` and a generate-once `machine_id()` (random 12-hex, not the hostname).
  `learning_profile.py`'s old duplicate hardcode of that path was removed and repointed here.
- `scripts/cfp_export.py` — reads the LOCAL CFP ledger (`knowledge/index_cfp_fix.json`),
  aggregates own counts **by topic** (topics are the cross-machine vocabulary; CFP ids are
  machine-local), and writes an **allow-listed** export (`{topic, own_count, n_patterns}` only —
  no free-text symptom/root, so nothing leaks) to `<shared>/cfp/export_<machine_id>.json`.
- `scripts/cfp_import.py` — folds another machine's export into `<shared>/cfp/merged/<origin>.json`
  and reports `effective_count(topic) = local own + Σ(other origins)`, emitting
  `[fix-required]` (≥3) / `[fix-escalated]` (≥5) as a **proof-of-mechanism**.

**Correction to §5 / §10 sync mechanics — the CFP track uses PER-ORIGIN REPLACE, not
append-only + consumer bookmark + seq.** A skeptical review (2026-07-13) showed the
append+bookmark design double-counts across ≥3 machines (transitivity) and is clock-skew
fragile. The shipped model instead stores each origin's contribution as one file that an
import **overwrites wholesale** — so it is **idempotent by construction** (no seq, no cursor),
and exports carry **own-origin counts only** (never re-export merged-in foreign counts), which
kills transitive double-count. Our own machine_id is excluded at compute time, so an export
imported back is a no-op. Merge key = **topic**; a foreign topic unseen locally is
**created on the fly** (local own = 0).

**STAGE-1 boundary (deliberately deferred):** cfp_import COMPUTES the effective count and
emits the signals, but does **not** rewire the LIVE 90-day `window_count` escalation in
`cfp_recurrence.py` (whose +1/reopened semantics are wrong for a cross-machine merge). Wiring
the cross-machine total into live self-improvement escalation is **STAGE 2**, along with
Track 2 (skill wiki birth on `[skill-miss]` + successful new-approach), the two-level apply
(use-now vs bake-permanently), and sanitize/opt-in transport over the plugin channel.

> Verified: `cfp_export.py --self-test` (8 checks) + `cfp_import.py --self-test` (9 checks) +
> end-to-end export→import round-trip all PASS (2026-07-13).

## 12 STAGE 2 built — 2026-07-14 (live wire-in + Track 2 + transport)

**STAGE 2a — 2026-07-13 (correctness core · Track 1 goes LIVE).** The STAGE-1 boundary is lifted:
- **S1** `cfp_export.py` now exports the **90-day `window_count`** (fallback to lifetime `count` for
  un-migrated ledgers), not the lifetime count — so cross-machine sums are apples-to-apples with each
  machine's live 90-day window. `exported_at` IS the staleness anchor (no redundant field).
- **S2** the **`unclassified` catch-all is dropped** from export AND discarded in `compute_effective`
  (defense-in-depth). Untopic'd failures still escalate LOCALLY — they just never merge cross-machine
  (topic is the only merge key).
- **S3** `scripts/cfp_effective.py` (NEW) is the live consumer: escalation decides `≥3`/`≥5` from the
  **effective 90-day count = own window + Σ every OTHER machine's FRESH (≤90d) window**. A foreign origin
  whose export is older than 90 days (or dateless) contributes **0** — a machine gone quiet stops
  inflating the total. Wired into `self_improve` §2 Step 2b (the recurrence decision). No shared store /
  all foreign stale → effective == local (byte-for-byte backward-compat). scrutinize deduped the merged
  dir-walk so `load_merged(fresh_as_of, window_days)` is the ONE place freshness lives (single-source).

**STAGE 2b — 2026-07-14 (Track 2 + transport).**
- **S4** `scripts/skill_success.py` (NEW) — Track 2, the mirror of CFP for **successes**. `record()`
  logs a winning new-approach to a **machine-local** ledger (`~/.claude/harness_skill_success.json` —
  never the synced folder; context is stored as an 8-hex hash, never raw). It **reuses the S1–S3 merge
  engine verbatim** (`cfp_import.load_merged` + `compute_effective` + `sanitize_topics` + `_SAFE_ORIGIN`
  — no merge code duplicated · the S3-scrutinize lesson). `≥3` fresh machines agree → **`[promotion-candidate]`**.
  - **Loop closure (M4 #2):** a candidate is a **PROPOSAL a human approves** (`skill_success.py --report`
    lists them), NEVER an auto-created skill (R14) — exactly like CFP's `[fix-required]` being a signal a
    human acts on. This is what stops S4 from being a write-only notebook (the reason S5 stayed deferred).
  - **Hard trigger (M4 #3):** birth does NOT rely on the agent remembering to call the script — the
    `record()`/`export_own()` calls are wired into the opt-in S6 session-close hook (a guardrail, not a
    remembered rule).
- **S5** two-level apply — still **DEFERRED**: S3 already IS the apply, no second consumer appeared.
- **S6** sanitize + **opt-in transport** — the physical channel is a **synced folder** (user points
  `~/.claude/knowledge-shared` at iCloud/Dropbox/a network drive; the OS's file sync IS the transport, so
  NO network/git protocol code is written). A `share.enabled` flag (**DEFAULT OFF** — nothing leaves the
  machine unless turned on) gates a **fail-open** session-close hook that refreshes this machine's CFP +
  skill export blocks. Fail-open = any error inside it is swallowed and never blocks/slows session close.
