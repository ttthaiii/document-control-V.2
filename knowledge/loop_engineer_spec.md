# Loop Engineer — Production Spec (reference)
<!-- DOC-MAP:START (auto · gen_doc_labels.py) -->
<!-- topic: doc_navigation · jump: python3 scripts/lookup.py "<label>" -->
- L47 · ## 0. One-line
- L55 · ## 1. The 4 traps a naive build falls into
- L66 · ## 2. State model — single source = `mece_plan.md`
- L68 · ### 2.1 Single-writer rule (round-1 point 1)
- L71 · ### 2.2 Plan header carries live counters (orchestrator-only)
- L79 · ### 2.3 `[/]` IS the lock (round-1 point 2)
- L86 · ### 2.4 reasoning_round — the real runaway backstop
- L91 · ### 2.5 The only two files outside mece_plan.md
- L99 · ## 3. Budget & context management (round-3 points 2 & 3)
- L103 · ### 3A. Weekly spend cap — the STOP-the-week guard
- L114 · ### 3B. Context-window compact policy — the per-wave control (round-3 point 3)
- L122 · ## 4. Permissions & Out-of-Scope (round-2 points 4 & 5)
- L137 · ## 5. Phase 0 — Preflight Gate (cheap, every trigger)
- L150 · ## 6. Phase 1 — Task Intake
- L152 · ### 6.1 Selection rule (round-3 point 1 + round-5 point 1 — explicit priority)
- L159 · ### 6.2 Task Standard — every new task (round-5 point 1 — the headers the loop needs)
- L209 · ### 6.3 Upstream: ticket-intake skill (planned — NOT built here)
- L212 · ### 6.4 Runtime intake card (round-1 step 1 — what the loop reads when it picks the task)
- L226 · ### 6.5 Small-Tasks Pool (the standing bucket for small work)
- L236 · ## 7. Phase 2 — Tight MECE Plan
- L241 · ### 7.1 Per sub-task block (round-1 step 2 — orchestrator writes into `mece_plan.md`)
- L250 · ### 7.2 Auto-confirm policy (full autonomy)
- L259 · ## 8. Phase 3 — Execution (guarded wave loop · Workflow script)
- L281 · ### 8.1 The hard guards (read/written from disk)
- L290 · ### 8.2 Danger gates (R14/R15) headless = HALT → PR. Never auto-yes.
- L294 · ## 9. Phase 4 — Close
- L307 · ## 10. Escalation → PR
- L314 · ## 11. Guard-rail system at a glance
- L334 · ## 12. What to build / change
- L336 · ### NEW
- L346 · ### MODIFY
- L354 · ### OPEN DECISIONS still needed
- L361 · ## 13. Reuse map (don't rebuild)
<!-- DOC-MAP:END -->


> Status: DRAFT v3 for production confirmation · revised 2026-06-30 (round 3)
> Decisions locked: **Trigger = CronCreate (this machine), 10 min** · **Full autonomy** (full tool permission; safe self-approve; danger → PR) · **State = mece_plan.md, single-writer** · **Budget = DAILY 10M tok/day under WEEKLY 100M ceiling (dual odometer)** · **No per-run token slice — compact between waves + at 150k instead** · **Selection by roadmap POSITION, not T-number** · **Notify = Telegram**
> Related: [[mece_plan_loop]] · `docs/session_templates/mece_plan_schema.md` · scrutinize · skeptical_reviewer · delegate skills
> BOUNDARY (single-source · T-310): This spec OWNS the autonomous ENGINE — trigger · selection §6.1 · task standard §6.2 · budget §3 · locks §2 · wave loop §8 · escalation §10. The mece_plan.md FILE SHAPE (section block · Close · PATH A/B/C) → `mece_plan_schema.md`; point to it, never re-define.

---

## 0. One-line

An **autonomous, scheduled** harness skill. Every 10 minutes a cron trigger wakes it headless; it claims the next pending roadmap task (by priority position), plans it in `mece_plan.md` under a tight MECE with hard loop+token guards, executes via parallel sub-agent waves, verifies against the task's own Goal/How-Check, then closes the task or — if stuck or at a danger gate — stops and opens a PR for a human.

Design rule: **never burn tokens we cannot see; never take an irreversible action without a human.**

---

## 1. The 4 traps a naive build falls into

| Trap | Why it bites | Fix |
|---|---|---|
| State in memory | Each trigger = fresh session, context resets. | **mece_plan.md on disk is the brain;** counters in its header. |
| Two agents writing the plan | Parallel writers shift each other's lines → corruption. | **Single-writer rule:** only the orchestrator writes the plan. |
| Orphan `[/]` lock | Task finishes but plan never flips `[/]→[X]` → locked forever. | **Atomic close + heartbeat** orphan detection. |
| Selecting by Task Number | A number is an ID, not a priority — new tasks append last. | **Select by roadmap POSITION + `depends_on`.** (§6.1) |

---

## 2. State model — single source = `mece_plan.md`

### 2.1 Single-writer rule (round-1 point 1)
- `mece_plan.md` = one source of truth. **Only the orchestrator writes it.** Sub-agents return results to their own scratch files; orchestrator consolidates once per wave.

### 2.2 Plan header carries live counters (orchestrator-only)
```markdown
<!-- loop-engineer state -->
task: T-<N> · phase: execute · wave: 2
reasoning_round: 0          # re-plan attempts on a failing sub-task; reset to 0 when a wave passes verify
hb: 2026-06-30T14:32:10Z    # heartbeat — stamped each wave (orphan-lock detection)
```

### 2.3 `[/]` IS the lock (round-1 point 2)
- A trigger that sees `[/]` ends immediately (a run is active).
- **The one failure to prevent:** a finished task whose `[/]` never flips to `[X]` → orphan lock. Defenses:
  1. **Atomic close** — flip `[/]→[X]` + write final summary in the orchestrator's single LAST action.
  2. **Heartbeat** — `[/]` with stale `hb` (> 25 min) **and no open PR** = orphan → open a PR (don't silently resume).
- So `[/]` means EXACTLY: (a) running (fresh hb), or (b) stopped at forever-loop with a PR open. Never "done but unmarked."

### 2.4 reasoning_round — the real runaway backstop
- Counts re-plan attempts after a failed Verification.
- **A wave that passes Verification resets it to 0.**
- A single sub-task that keeps failing until `reasoning_round == 10` → forever-loop → **pause ALL → open PR.**

### 2.5 The only two files outside mece_plan.md
| File | Why |
|---|---|
| `.sessions/loop_token_ledger.json` | cross-task, cross-week cumulative spend (§3A) |
| `.sessions/loop_scratch/<run_id>/<subtaskID>.md` | per-sub-agent output before consolidation (§8) |

---

## 3. Budget & context management (round-3 points 2 & 3)

**Two DIFFERENT axes — do not confuse them.**

### 3A. Weekly spend cap — the STOP-the-week guard
The client shows **two separate meters** (do not confuse them):
- **Context window** = `157.9k / 1.0M (16%)` — how full THIS chat's working memory is. Readable by `real_context.py` (from the transcript `usage` record). Plenty of room.
- **Weekly · all models** = `82%, resets Jul 1` — the **plan's weekly quota**. This is the one to budget against.

⚠️ **Verified constraint:** a background script **cannot read the Weekly %**. `real_context.py` reads only the transcript `usage` (context fill); the Weekly figure comes from API rate-limit headers the client displays but the transcript does not expose. **So Loop Engineer is blind to the plan's weekly quota.** Design around it:

1. **Loop's own budget — DAILY cap under a WEEKLY ceiling (LOCKED)** — `WEEKLY_TOKEN_LIMIT = 100,000,000` tok/week (plan quota, user-estimated) → spread evenly so `LOOP_DAILY_BUDGET = 10,000,000` tok/day (≈ 100M ÷ 10 days — keeps the loop from burning the whole week in one day). The loop measures **its own** spend from the transcript `usage` (this IS readable) → accumulates into `loop_token_ledger.json` with TWO odometers: **day** (resets at local midnight) and **week** (resets weekly). Phase 0 EXITs if either today's spend ≥ `LOOP_DAILY_BUDGET` **or** this week's spend ≥ `WEEKLY_TOKEN_LIMIT`. Both numbers are user-set constants because the plan % is not script-readable (verified).
2. **Manual pause flag** — because the loop can't see the plan %, a `.sessions/loop_paused` file makes Phase 0 exit. Drop it whenever your Weekly meter is running low (like 82% today); delete it to resume. This is the human's lever over the meter the loop can't read.
3. *Future option:* if the platform ever exposes rate-limit headers to a reader, swap rule 1 to live Weekly-% gating.

### 3B. Context-window compact policy — the per-wave control (round-3 point 3)
- **No fixed per-run token slice** — job size is unknown; a hard slice would cut work mid-way.
- **Compact between EVERY wave**: the orchestrator keeps only the consolidated summary in `mece_plan.md` and drops raw sub-agent output → context stays lean wave-to-wave. (Workflow sub-agents already run in isolated contexts, so the orchestrator only holds summaries — compacting between waves is natural.)
- **If a wave in progress exceeds 150k tokens → compact before continuing.**
- The genuine forever-loop backstop is **10 reasoning rounds** (§2.4), not a token slice.

---

## 4. Permissions & Out-of-Scope (round-2 points 4 & 5)

Headless = **FULL tool permission** (can't pause for a prompt). Safety comes from this boundary + danger gates, not from prompts. NEVER autonomous; each → **STOP + PR**:

| ❌ OUT OF SCOPE (always → PR) | ✅ IN SCOPE (may self-approve) |
|---|---|
| DB writes / migrations (R15 db-gate) | code edits inside `src/` |
| delete / overwrite protected paths, force-push, batch > 5 files (R14) | docs / knowledge edits |
| edit harness core rules (CLAUDE.md, AGENTS.md, INVARIANTS.md) | add / fix tests |
| secrets, credentials, deploy, external publish | the task's **declared** `Files` only |
| a task with no clear Goal / How-Check | read / analyze anything |
| any file NOT in the task's declared `Files` (scope-creep) | |

---

## 5. Phase 0 — Preflight Gate (cheap, every trigger)

`scripts/loop_engineer_preflight.py` — bails BEFORE model spend.
```
P0.1  no task at [/]?            no → EXIT (run active · stale orphan → PR)
P0.2  not blocked / no loop PR awaiting human / no .sessions/loop_paused flag?   no → EXIT
P0.3  today's spend < LOOP_DAILY_BUDGET (10M) AND week's spend < WEEKLY_TOKEN_LIMIT (100M)?   no → EXIT + Telegram
P0.4  roadmap has a pending [ ]? no → EXIT (idle)
P0.5  ALL pass → mark chosen task [/] + stamp hb → continue ↓
```

---

## 6. Phase 1 — Task Intake

### 6.1 Selection rule (round-3 point 1 + round-5 point 1 — explicit priority)
**Selection order (the loop reads, never guesses):** filter ELIGIBLE (`depends_on` all `[X]`) → sort by **explicit `priority` tag** (`P0 > P1 > P2`) → tie-break by document position (top first).
- ⚠️ **Why an explicit tag, not position alone:** a Task Number is only an **identity tag**, not a priority — new tasks append with the next free number (T-300, T-301…). Position *almost* works, BUT once a ticket-intake skill (§6.3) auto-appends tasks, blind-append puts an urgent task at the bottom. An explicit `P0/P1/P2` tag is what the running loop SEES — independent of where the line sits.
- `priority: P0|P1|P2` (required on a loop-eligible task): P0 = urgent/blocking · P1 = normal · P2 = nice-to-have. Missing tag → treated as P2.
- `depends_on: T-x` (optional): a `[ ]` task is **not eligible** until every `depends_on` is `[X]`. Unmet → skip to next eligible + flag.
- Existing free-text one-liner tasks (no priority/Goal/How-Check) are **NOT loop-eligible** — see §6.2: the loop refuses them to PR rather than run blind.

### 6.2 Task Standard — every new task (round-5 point 1 — the headers the loop needs)
**This is the standard for EVERY new roadmap task** (single source — other files point here, never redefine the field set). Every NEW roadmap Task MUST carry these fields. Legacy free-text one-liners (`- [ ] T-N: desc`) stay as-is for already-finished tasks, but are NOT the go-forward default and are NOT loop-eligible (human-only).

**Grain rule** — what earns a roadmap Task: a *Task* = BIG work (**≥3 steps OR complex** — multi-file / src overwrite-delete). MECE splits ONE Task into sections at Phase 2; those sections live in `mece_plan.md`, **NOT** on the roadmap. Small work (**<3 steps AND simple**) does not earn its own Task — it collects under the standing **Small-Tasks Pool** (§6.5).
> NOTE (T-300 · done 2026-07-03): sections stay in mece_plan.md, NEVER on the roadmap. Per-section roadmap registration was REMOVED — mece S2-B + the Close-gate now register/annotate only the parent §6.2 Task.

**Field reference**
| Field | Required? | Meaning |
|---|---|---|
| `- [ ] T-N` | yes | checkbox + the task id (identity tag) |
| `· P0\|P1\|P2` | yes | priority the loop sorts by (missing → treated P2) |
| `· depends_on: T-x[, T-y]` | optional | not eligible until every listed task is `[X]` |
| `Title:` | yes | one-line what (the old desc) |
| `ContextTask:` | yes | background/detail the loop needs to break the task down — mirrors the per-section `Context` field (mece_plan_schema.md §S<N>, via §7.1); the loop has NO chat history, so intent must live here |
| `Goal:` | yes | measurable done-state — the loop must be able to tell DONE from not-done |
| `How-Check:` | yes | the exact command/observation that proves Goal — drives the final verify wave · **behavior-change task → MUST include a Case-Task Run+Expect (a REAL end-to-end run whose observable behaviour IS the Goal), not only a unit/self-test — see §Behavioral Case Task below** |
| `Out-of-Scope:` | optional | explicit "do NOT touch" boundary — a headless run cannot ask mid-way, so this feeds the scope-creep guard |
| `Relate File:` | optional | seed paths (loop also derives more from `index_files.json`) |

**Skeleton**
```
- [ ] T-<N> · <P0|P1|P2> · depends_on: <T-x | none>
    Title:        <one-line what>
    ContextTask:  <background/detail so the loop can decompose — it has no chat history>
    Goal:         <measurable done-state — the target + what it measures>
    How-Check:    <exact command / steps that prove Goal>
    Out-of-Scope: <what NOT to touch — optional; feeds the scope guard>
    Relate File:  <path(s) | (derive)>
```

**Worked example** (a real roadmap one-liner — T-268 — rewritten into a loop-eligible task)
```
- [ ] T-268 · P1 · depends_on: none
    Title:        Harden backlink_analyzer.py against silent data loss
    ContextTask:  backlink_analyzer recomputes related[] from a doc's topics; today it
                  silently overwrites a hand-curated non-empty related[], losing data
                  (surfaced by CFP-046). Add a guard around the write path only.
    Goal:         backlink_analyzer never silently overwrites a non-empty related[];
                  it WARNs on a differing computed value, emits [islanded-doc] for any
                  entry with topics but related:[], and supports --dry-run.
    How-Check:    python3 scripts/backlink_analyzer.py --dry-run on a seeded fixture
                  → stdout shows [islanded-doc] + a WARN line; exit code 0; no file written.
    Out-of-Scope: do NOT change how related[] is computed — only the write/overwrite guard.
    Relate File:  scripts/backlink_analyzer.py
```
- **Contrast with a SubTask (§7.1):** a *Task* = the whole roadmap item (one Goal, one How-Check, runs across many waves). A *SubTask* = one slice inside a wave (its own Skill/Tool, Model tier, DoD, token+loop report). Task answers "what are we delivering"; SubTask answers "who does this one piece, how, and how do we know it passed".
- **Producer = the future ticket-intake skill (§6.3)** — converts a user painpoint/ticket into this complete block. Until it exists, a human writes the block, or the loop PRs the task as under-specified.
- **No Goal/How-Check → out of scope → PR** (never auto-run a blind task).
- **§Behavioral Case Task (T-414 · non-negotiable for behaviour-change tasks):** when a task changes observable BEHAVIOUR (a gate that must now block, a loop that must now spawn, a hook that must now fire), its `Goal:` + `How-Check:` MUST carry a **Case Task** — a real end-to-end run whose observable result IS the promised behaviour — written at ticket-creation time, IN ADDITION to any unit/self-test. A passing self-test proves the PARTS work in isolation; it does NOT prove the whole behaviour changed (self-test = "the key turns"; Case Task = "you actually walked into the house"). A How-Check of only `--self-test`/grep on the edited file is a smell for a behaviour-change task → the final verify wave (and `plan_lint [verify-logic-only]`, mece_plan_schema §Verify-N mechanism-vs-behaviour) flags it. Origin: this feedback recurred T-401 → T-413 because it lived only in chat/memory, never in the template — closing the self-improve loop's back half. **TICKET-TIME enforcement (T-415 · authoring-first):** the requirement is caught WHERE the weak test is born — at ticket-write time. `roadmap_lint.py` carries a SOFT advisory `[ticket-verify-logic-only]` that flags a pending §6.2 behaviour-change ticket whose How-Check `Run:` is only `--self-test`/read-only-grep on its own `Relate File:` (report-only · exit code untouched · doc/theoretical Relate File exempt — a linter can't read intent, so advisory not hard-block). MECE then CARRIES that Case-Task How-Check into the section `Verify-N` (M2), and the agent runs what's written. There is deliberately NO runtime close-gate / proof artifact — the root failure was authoring a weak test, so enforcement lives at authoring, not close.

### 6.3 Upstream: ticket-intake skill (planned — NOT built here)
A future skill that takes a raw user painpoint/ticket → emits a §6.2-complete task block (Goal + How-Check + priority + depends_on) appended at the correct priority. It is the **single producer** that guarantees every loop-eligible task is complete. Out of scope for this spec; noted so the schema above is forward-compatible.

### 6.4 Runtime intake card (round-1 step 1 — what the loop reads when it picks the task)
| Field | Source |
|---|---|
| TaskID | the `T-N` id (identity only) |
| Priority | the `P0/P1/P2` tag (§6.1) |
| Dedup | `index_sessions.json`: completed → reconcile `[X]`, skip |
| Context Task | the §6.2 `ContextTask:` field (was: bare roadmap line + notes) |
| Relate File | `index_files.json` |
| Goal | the §6.2 `Goal:` field |
| How Check | the §6.2 `How-Check:` field → drives final verify wave |
| Out-of-Scope | the §6.2 `Out-of-Scope:` field → bounds the scope-creep guard |

Claim: `[ ]→[/]` + stamp `hb` + write `gather_complete.md` (today). Missing Goal/How-Check → out of scope → PR.

### 6.5 Small-Tasks Pool (the standing bucket for small work)
Small work (**<3 steps AND not complex**) never earns its own Task. It collects under **ONE standing, loop-eligible umbrella Task** — the **Small-Tasks Pool** (roadmap: `T-299`). Rules:
- The Pool block carries the §6.2 fields (Title/ContextTask/Goal/How-Check) plus a `## Items` list.
- **Each item = one checklist line carrying its own 1-line `How-Check`** — that line IS the item's definition-of-done.
- **Re-openable lifecycle:** the Pool is a normal `[ ]→[X]` block. It is marked `[X]` **only when its item-list is momentarily empty**; filing a new small item **re-opens it to `[ ]`** — so it is "never permanently done" without breaking the loop's `[ ]`-selector.
- The loop **claims the Pool, then works ITEMS one at a time** (no preflight/loop-code change — loop-eligible as-is).
- **Graduate:** when an item grows to **≥3 steps or complex**, promote it out of the Pool into its own §6.2 Task.

---

## 7. Phase 2 — Tight MECE Plan

1. **Group sub-tasks into parallel waves** — decompose FROM the task's `ContextTask` (the loop has no chat history, so `ContextTask` is the sole source of intent that seeds the waves); last wave = the Goal/How-Check test.
2. **skeptical_reviewer MANDATORY** → `go | revise | reject`.

### 7.1 Per sub-task block (round-1 step 2 — orchestrator writes into `mece_plan.md`)
Section block = **`mece_plan_schema.md §S<N>`** (single owner of the field shape · kept readable in one place). The loop writes the SAME S<N> block and adds ONLY its headless-only fields (below). Plan-header live counters (reasoning_round · wave · hb) → §2.2, not per sub-task.
```markdown
#### SubTask T-<N>.S<k>
- (common fields Context · Skill/Tool · Model · Relate File · Verification → mece_plan_schema.md §S<N> · single owner)
- Summary Report: (orchestrator fills after Observe, from the sub-agent's scratch file)
    - what done / problems / fix · Token: <used> · Action Loops: <count>
```

### 7.2 Auto-confirm policy (full autonomy)
```
go AND in-scope AND no danger gate  → AUTO-CONFIRM → Phase 3
revise                              → adjust ONCE → re-review (reasoning_round +1)
reject OR out-of-scope OR gate      → STOP + PR (never auto-yes)
```

---

## 8. Phase 3 — Execution (guarded wave loop · Workflow script)

> A `wave` here = schema's `Cycle grouping` (a serial/parallel group of sections) — same concept, this doc's term.

```
for each wave:
  1. REASON      — orchestrator plans the wave
  2. SPAWN       — sub-agents per Model; EACH writes ONLY its own scratch file
                   (.sessions/loop_scratch/<run>/<subtaskID>.md — count = max parallel sub-agents)
                   parallel = read/analyze · edits sequential/worktree-isolated · mechanical → delegate(Haiku)
  3. OBSERVE     — wait for the whole wave; read every scratch file; accumulate tokens (hook → ledger)
  4. VERIFY      — run each sub-task's DoD (the runnable check)
  5. DECIDE:  fail → reasoning_round++ → re-plan (do NOT record/close)
              pass → go to SCRUTINIZE ↓
  6. SCRUTINIZE  — MANDATORY every wave (not just final close): load `scrutinize`, review the
                   finished sub-task artifacts, tidy any loose ends it flags.
  7. RECORD      — ONLY after scrutinize clean: the SINGLE orchestrator writes ALL results + Summary
                   → mece_plan.md in ONE write (single-writer) · mark sub-tasks done · reasoning_round = 0
  8. COMPACT     — compact before the next wave (drop raw output, keep summary).
                   Also compact immediately if the wave's context exceeded 150k mid-way.
```

### 8.1 The hard guards (read/written from disk)
| Guard | Limit | Trip |
|---|---|---|
| a sub-task that won't finish (reasoning_round) | == 10 | forever-loop → STOP all → PR |
| same action repeating (action_loop_count) | > 10 | STOP run → summarize |
| daily ledger | ≥ 10M today | STOP day → Telegram |
| weekly ledger | ≥ 100M this week | STOP week → Telegram |
| context size mid-wave | > 150k | **compact** (not stop) → continue |

### 8.2 Danger gates (R14/R15) headless = HALT → PR. Never auto-yes.

---

## 9. Phase 4 — Close

```
FINAL WAVE = How-Check on the big Goal
  pass → ATOMIC CLOSE (loop-owned §2.3 · one write): roadmap [/]→[X] + final Summary + heartbeat orphan-guard
       → shared mechanics ONLY: reuse the PATH A *clear command* + R8 sync from `mece_plan_schema.md §PATH A`
         (NOT its interactive close-gate steps — ask-user / feedback / reflection / `user typed /compact` = N/A headless)
       → index_sessions.json → session_handoff + active_thread done → wait next trigger
  fail → reasoning_round++ → back to Phase 3 (unless a guard tripped)
```

---

## 10. Escalation → PR

**Triggers:** reasoning_round == 10 · action_loop > 10 · reviewer reject · R14/R15 gate · out-of-scope · daily ≥ 10M OR weekly ≥ 100M · under-specified task · orphan `[/]`.
**Action:** branch `loop-engineer/T-N-escalation` → commit WIP → `gh pr create` (body = state dump) → **Telegram notify** → roadmap stays `[/] parked` → STOP.

---

## 11. Guard-rail system at a glance

| # | Guard | Stored | Limit | On trip |
|---|---|---|---|---|
| 1 | lock = `[/]` | plan / roadmap | 1 active | trigger exits |
| 2 | orphan heartbeat | `hb:` | 25 min | stale + no PR → PR |
| 3 | action_loop_count | plan header | > 10 | STOP run |
| 4 | reasoning_round (reset on wave pass) | plan header | == 10 | STOP + PR |
| 5 | daily token odometer | loop_token_ledger.json | ≥ 10M today | STOP day + Telegram |
| 5b | weekly token odometer | loop_token_ledger.json | ≥ 100M this week | STOP week + Telegram |
| 6 | context compact | live context | between waves · > 150k | **compact** (not stop) |
| 7 | single-writer | orchestrator only | — | sub-agents → scratch |
| 8 | scope / out-of-scope | `.scope_baseline` + §4 + task `Out-of-Scope:` | files ⊆ declared AND none match `Out-of-Scope:` | revert / PR |
| 9 | R14/R15 gates | domain pack | any match | STOP + PR |
| 10 | skeptical_reviewer | Phase 2 | reject | STOP + PR |
| 11 | scrutinize | EVERY wave (post-verify, pre-record) | per sub-task | block record/close |
| 12 | selection | eligible → priority P0>P1>P2 → position | depends_on met | skip blocked + flag |

---

## 12. What to build / change

### NEW
- `.agents/skills/harness/loop_engineer/SKILL.md` (+ SKILL_detail.md)
- `scripts/loop_engineer_preflight.py`
- a Workflow script (Phase 3 waves + per-wave compact)
- `.sessions/loop_token_ledger.json` + `.sessions/loop_scratch/`
- CronCreate entry: every 10 min → preflight → if green, invoke skill
- config: `WEEKLY_TOKEN_LIMIT` (100M) + `LOOP_DAILY_BUDGET` (10M)
- **roadmap task schema**: loop-eligible tasks carry `· P0|P1|P2 · depends_on:` + `Goal:` + `How-Check:` (§6.2) — current one-liners stay human-only / PR'd by the loop
- *(exists as a separate skill · not part of loop_engineer's core)* `ticket_intake` — user painpoint → complete §6.2 task block (the upstream producer)

### MODIFY
- `skill-manifest.json` + `registry.md`
- `knowledge/index_files.json` (R8)
- `docs/master_roadmap.md` — build task(s); add `depends_on:` convention
- `scripts/posttool_track.py` — tag loop-only spend into the ledger
- CLAUDE.md — clause: *"headless mode: danger gate auto-escalates to PR, never auto-confirmed"*
- `mece_plan_schema.md` — headless variant note (single-writer + mandatory skeptical_reviewer + state header + per-wave compact)

### OPEN DECISIONS still needed
*(none — all resolved)*

(Resolved: `WEEKLY_TOKEN_LIMIT = 100,000,000` · `LOOP_DAILY_BUDGET = 10,000,000` (dual day+week odometer) · selection = roadmap position + `depends_on` · no per-run slice → compact between waves + at 150k · stale-lock = 25 min · notify = Telegram · concurrency = one task · state = mece_plan single-writer.)

---

## 13. Reuse map (don't rebuild)

| Need | Reuse |
|---|---|
| parallel waves + budget | **Workflow tool** |
| plan check | **skeptical_reviewer** |
| pre-close review | **scrutinize** |
| cheap mechanical sub-tasks | **delegate** (Haiku) |
| scope check | **.scope_baseline** |
| token accounting | **posttool_track.py** |
| phase-gate | **PreToolUse hook** |
| dedup | **index_sessions.json** |
| user notify | **Telegram** |
