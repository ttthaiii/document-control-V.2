# CODING_FAILURE_PATTERNS.md — Known Agent Failure Modes

> Each pattern: what happened, why it broke, how to prevent it.
> Add new patterns after post-mortems. Never delete entries.
> CFP-001–CFP-004 archived → knowledge/cfp_archive.md (2026-05-26)

---

## CFP Entry Template
```
## CFP-<N+1> · <title>
topic: <topic_id>          ← REQUIRED · must match a topic in knowledge/cfp_topics.md
count: 0                   ← recurrence count · doctor increments on each new occurrence
recurrences: []            ← list of {date, cause} appended by doctor §1

**Symptom:** <what the agent did wrong>
**Root cause:** <why it happened>
**Prevention:** <rule or BC that prevents it>
**Detection signal:** <keyword/emit that doctor §1 matches against>
```
> topic must be one of: phase-gate-skip · mece-lifecycle · token-tracking · boot-routing · behavior-contract · harness-file-edit · session-close · data-safety
> count + recurrences are managed by harness_doctor — do NOT edit manually.

---

## CFP-005 · Skipping MECE Plan / Modifying Code Without Plan Alignment

**Symptom:** Agent starts modifying or creating source files without first creating, updating, or aligning on a MECE plan (`.sessions/mece_plan.md` or similar). This leads to missed constraints, incorrect file edits, and tool/procedural violations.

**Root cause:**
- Attempting to speed up execution by skipping Phase 2 (MECE Plan) of the Loop Architecture.
- Initiating file modifications during the info-gathering or diagnostics phase before the planning gates are cleared.

**Prevention:**
1. Under Loop Phase 2, always build a section-based plan that maps 1:1 to target Skill sections.
2. Document this plan in `.sessions/mece_plan.md` before making any source code edits.
3. Ensure the user confirms the plan or has explicitly approved the roadmap before starting execution (Phase 3).

**Detection signal:** Agent begins file edits without `[✓ MECE]` trace emitted, or `.sessions/mece_plan.md` is absent or not dated today.

---

## CFP-006 · Unbounded Loop → Token Exhaustion

**What happened:** Agent entered a loop (Phase 1 gather, verify-retry, or skill re-route) with no exit condition. It repeated the same tool calls until SESSION_TOTAL reached the halt threshold.

**Why it broke:** Three root causes:
1. Phase 1 Info Gather Loop had no iteration cap — agent kept judging context "insufficient" and re-reading the same files
2. Retry counter not persisted in session_handoff.md — after resume, retry budget reset to 0, allowing infinite retry across sessions
3. Skill re-route had no cycle guard — A→B→A→B re-routing possible without depth limit

**Prevention:**
- Phase 1: max 3 gather iterations → `[gather-stalled]` + ask user (see CLAUDE.md)
- Retry: write `attempt_count` to session_handoff.md → restore on resume (see session_manager/SKILL.md)
- Re-route: compare target skill vs previous section's skill → skip if same (see CLAUDE.md re-route guard)
- Verify: non-empty output ≠ pass — must match defined condition (see mece/SKILL.md)

**Detection signal:** SESSION_TOTAL approaches threshold but REACT loop doesn't pause; token warnings are skipped or `[loop]` emits continue without exit condition.

---

## CFP-007 · Using Local Date/Time APIs Without Gregorian Safety → Buddhist Year Corruption

**Symptom:**
In applications where dates are compared as strings (`YYYY-MM-DD` or `YYYY-MM`), or stored in the database in Gregorian format, client browsers configured to use local calendars (such as the Thai Buddhist calendar, common in Thailand) will return the local year (e.g. `2569`) instead of the Gregorian year (e.g. `2026`) via `new Date().getFullYear()` or `date.toLocaleDateString()`. This causes comparison logic to break (evaluating `2569 > 2026` as true) or writes corrupted Buddhist era dates into the database.

**Root cause:**
- `new Date().getFullYear()` returns the local calendar year on client browsers like Safari on iOS/macOS when the device calendar is set to Buddhist.
- Using simple string splitting or standard date APIs without enforcing a Gregorian/ISO calendar formatting.

**Prevention:**
1. Never use `new Date().getFullYear()` directly to get a Gregorian year for database/API communications or configurations.
2. Use safe utilities that adjust timezone and force UTC methods (like `utcAdjustedDate.getUTCFullYear()`) or format explicitly using `Intl.DateTimeFormat("en-US", { calendar: "gregory" })`.
3. In this project, use `getLocalGregorianString(new Date())` from `src/lib/date-utils.ts` and parse the year from it.

**Detection signal:** Output contains Buddhist year (≥ 2567) in a Gregorian context, or `date.getFullYear()` used without UTC/Gregorian conversion.

---

## CFP-008 · MECE Plan Staleness on Resume → Edits Target Wrong Lines

**Symptom:** Agent resumes from a previous session and executes Phase 3 on an old MECE plan. Source files were modified externally between sessions (git pull, manual edit). Agent edits wrong line numbers or targets renamed/moved symbols.

**Root cause:**
- Resume flow checks only for pending sections in mece_plan.md (grep count > 0)
- No validation that source files match the state when the plan was created
- Stale line numbers in plan → Edit tool targets wrong context → corrupts file

**Prevention:**
1. Session handoff must store `mece_plan_hash: <sha1 of mece_plan.md at plan creation>`
2. On resume: compare stored hash vs `sha1sum .sessions/mece_plan.md | cut -d' ' -f1`
3. If hash mismatch OR `git status --short src/` shows changes → emit [plan-stale] → ask user
4. User confirms stale plan → proceed · User says rebuild → run Phase 2 again

**Detection signal:** `[plan-stale]` trace emitted at resume

---

## CFP-009 · Parallel Sub-agent Token Accounting Gap → Missed Threshold Triggers

**Symptom:** Session runs parallel fan-out (≥2 sub-agents). After Cycle completes, SESSION_TOTAL reads ~45k but actual total is ~72k. 60k threshold never fires. Session continues past safe limit silently.

**Root cause:**
- Sub-agents estimate tokens independently with no merge coordination
- Orchestrator receives cycle results but does not add sub-agent `tokens_estimated` to SESSION_TOTAL
- Each parallel Cycle widens the gap — SESSION_TOTAL is increasingly stale

**Prevention:**
1. Sub-agent result file must include `tokens_estimated: N` (estimate of that sub-agent's total)
2. Orchestrator: after reading all cycle_N_*.json → sum `tokens_estimated` → add to SESSION_TOTAL
3. Write updated SESSION_TOTAL to session_tokens.md immediately (INVARIANTS.md §I7)
4. Apply R3 threshold check after every merge

**Detection signal:** SESSION_TOTAL suspiciously low after a multi-agent Cycle despite large output volume.

---

## CFP-010 · Skipping Loop Architecture Phases 1 & 2 (Info Gather & MECE Plan)

**Symptom:** Agent jumps to proposing an overall implementation plan artifact without running the Loop Architecture's Phase 1 Info Gather loop (checking files, verifying constraints) and Phase 2 MECE Plan (creating mece_plan.md with 1:1 section mapping and DoD verify criteria).

**Root cause:**
- Attempting to accelerate the task by jumping straight to a high-level design plan instead of strictly executing the MECE-structured planner in `.sessions/mece_plan.md`.
- Conflating the agent-facing MECE plan / task.md tracking with user-facing implementation plans.

**Prevention:**
1. Always follow the Loop Architecture: repeat Info Gather (Phase 1) until context is sufficient, then build a MECE Plan (Phase 2) mapping 1:1 to the target Skill sections in `.sessions/mece_plan.md`.
2. Define a clear `Verify-N` command/criterion for each section in the DoD.
3. Obtain explicit user confirmation on BOTH plan steps and verify criteria before execution (Phase 3).

**Detection signal:** User message complains with "ทำไมไม่ทำตามกระบวนการ" or "you forgot" + missing step name.

---

## CFP-011 · Creating Implementation Plan Artifact Before MECE Plan Approval (Recurrence of CFP-005/CFP-010)

**Symptom:** Agent creates the user-facing `implementation_plan.md` artifact before writing and obtaining approval for the section-based `.sessions/mece_plan.md`.

**Root cause:**
- Jumping directly to the final `implementation_plan.md` design artifact under planning mode rules, while violating the strict harness constraint that requires `.sessions/mece_plan.md` to be created and approved first.

**Prevention:**
1. Under Loop Phase 2, always write the MECE plan to `.sessions/mece_plan.md` first.
2. Never create or edit `implementation_plan.md` or any source code before the MECE plan is approved.

**Detection signal:** User message contains "ทำไมไม่ทำ mece_plan" or "ทำไมไม่ทำตาม" or "rule says" + "mece_plan".

---

## CFP-012 · Skipping MECE Plan for Bug Fixes and Follow-up Tasks

**Symptom:** Agent skipped Phase 2 MECE Plan for a bug fix/follow-up request on an approved task, and immediately edited source files without user permission or confirmation.

**Root cause:**
- Misinterpreting the "minor follow-up" planning exemption and failing to generate a MECE plan when the user requested to follow the process ("ตามกระบวนการของเราเลย mece plan").

**Prevention:**
1. If the user explicitly asks to follow the MECE plan process or complains about a missing plan, always build a `.sessions/mece_plan.md` first.
2. Never skip MECE planning for bugs that involve multi-component integration (such as DB API and React state routing).

**Detection signal:** User message contains "ทำไมไม่วางแผน mece มา" or "ทำไมไม่ทำตามกระบวนการ".

---

## CFP-013 · Omitting Harness Trace Tokens During Implementation → Silent Execution

**Symptom:** Agent executes multi-step tasks (Read, Edit, Write, Bash) without emitting required trace tokens. User sees only results — no `[pre-read]`, `[post-read]`, `[✓ written]`, or `[loop]` markers in responses.

**Root cause:**
- Agent shifts into "implementation mode" when handling many sequential tool calls
- Treats trace emission as optional rather than mandatory per-call obligation
- `[pre-read]` gate before Read and `[post-read]` verdict after Read are skipped silently
- `[✓ written]` grep-verify step omitted after Edit/Write calls
- `[loop]` section progress marker not emitted at section boundaries

**Prevention:**
1. Before every Read call: emit `[pre-read] Target: X · Line: <N>` — no exceptions
2. After every Read result is processed: emit `[post-read] File: X · Verdict: relevant|partial|irrelevant`
3. After every Edit/Write: run `grep` to confirm change exists → emit `[✓ written]`
4. At each MECE section boundary: emit `[loop] Section N done · → Section N+1 next`
5. High tool-call volume is NOT an exemption — traces are more important during dense execution

**Detection signal:** User message contains "ไม่เห็นแสดง" or "ไม่ได้ emit" + trace token name ([pre-read]/[post-read]/[loop]/[✓ written]).

---

## CFP-014 · Closing Session with Incomplete/Unchecked MECE Plan or Compilation Errors

**Symptom:** Agent marks a task/session as complete in `session_handoff.md` and the master roadmap, but leaves sections or steps in `.sessions/mece_plan.md` as unchecked (`[ ]`), or leaves syntax/compilation errors in the modified code (such as missing imports of used functions like `eq`).

**Root cause:**
- Rushing to close the session or perform a handoff without verifying that every single section and step in `.sessions/mece_plan.md` has been checked off (`[x]`).
- Omitting project-wide syntax or type checks (e.g. build checks) before declaring a task completed, leading to broken files being checked into the branch.

**Prevention:**
1. Under Loop Phase 3 Completion Gate, always verify that the active thread task has all MECE plan steps marked as `[x]`.
2. Proactively double check all files modified during the session for missing imports or type errors.
3. Never hand off a session with a status of "completed" in `session_handoff.md` if any MECE plan steps or roadmap items for the session are still open or unchecked.

**Detection signal:** User message contains "ทำไมเหมือนมีงานค้าง" or "ยังไม่เสร็จทำไมข้าม" or "mece_plan ยังไม่เสร็จ".


---

## CFP-015 · MECE Plan Written to Chat/Artifact Instead of .sessions/mece_plan.md (Recurrence of CFP-005/CFP-010/CFP-011)

**Symptom:** Agent displays MECE plan in the chat response or in an `implementation_plan.md` artifact but does NOT write it to `.sessions/mece_plan.md`. The session file remains empty or contains a stale previous task's plan.

**Root cause:**
- Agent treated chat output as equivalent to the required session file write
- Skipped the mandatory `write_to_file` call to `.sessions/mece_plan.md` during Phase 2 M2/M3
- Also violated R11 by mixing Thai text into session files (English only rule)
- Also skipped M4 roadmap entry write before proceeding

**Prevention:**
1. Phase 2 M2: always call `write_to_file` to `.sessions/mece_plan.md` — never substitute with chat text
2. Session files must be English only — no Thai task names, descriptions, or step text
3. M4 (roadmap entries) must be written to `docs/master_roadmap.md` BEFORE asking user to confirm
4. Gate check: before starting Phase 3, verify `.sessions/mece_plan.md` exists and contains current task sections

**Detection signal:** User message contains "ไม่เขียนลง mece_plan.md" or "ทำนอกเหนือ harness" or points to `.sessions/mece_plan.md` still showing old content.

---

## CFP-016 · Skipping Per-Turn Routing (C1-C3) Checks and Working Before Boot in Subsequent Turns

**Symptom:** Agent starts editing files, running grep/find commands, or making database schema/routing actions in subsequent turns of a session without executing the Per-Turn Routing protocol (C1-C3, checking `active_thread.md`, and matching topic switches).

**Root cause:**
- The agent assumed that once the session had booted (B1-B3 run in the first turn), subsequent turns within the same user session did not require running the Per-Turn Routing checks (C1-C3) before performing file edits and tool calls.
- Violated the "Per-Turn Routing (every user message)" constraint: "Run C0 -> C1 -> C2 -> C3 before any work. No exceptions."

**Prevention:**
1. In every single turn, before calling ANY tools (like grep, view, edit), always read `.sessions/active_thread.md` using `view_file` to verify the current task topic and check if a topic switch or plan confirmation is needed.
2. The orchestrator must enforce this check immediately as the first tool call of every turn.

**Detection signal:** User message contains "ทำไมทำงานก่อนขั้น [Boot]" or "VBoot ก่อน" or "ลืมเช็ค boot" or "didn't run C1".

---

## CFP-017 · Skipping Boot Sequence, Per-Turn Routing, and Info Gather/MECE Plan Loop on Task Resumption/Topic Switch

**Symptom:** Agent starts writing `implementation_plan.md` or modifying code immediately on task resumption or when a new request is made, without displaying the Boot reply line 1, running C1-C3 per-turn routing, performing Phase 1 gather loop (`[✓ gather]`), or writing a section-based plan to `.sessions/mece_plan.md`.

**Root cause:**
- Attempting to skip to user-facing implementation plans or file edits without establishing thread phase context or executing the mandatory harness steps first.
- Forgetting that every task switch or task resumption requires a new Boot sequence check, per-turn routing check, and the execution of Phase 1 (Info Gather) and Phase 2 (MECE Plan) of the loop architecture.

**Prevention:**
1. At the start of every session/turn, check if the session needs to boot and emit the boot line 1.
2. Execute C1-C3 per-turn routing checking `active_thread.md`.
3. Run Phase 1 gather loop and emit `[✓ gather]`.
4. Run Phase 2 MECE Plan: write the step-by-step plan mapping 1:1 to skill sections in `.sessions/mece_plan.md` and get user confirmation before any code changes.

**Detection signal:** User message complains with "คุณกำลังละเมิดสิ่งที่เรากำหนดไว้ใน harness" or "ทำไมไม่ทำตามกระบวนการ".

---

## CFP-018 · Missing Resume Staleness Gate Check on Task Resumption

**Symptom:** Agent resumes execution on a previously in-progress task but fails to check if workspace code has changed since the last session or if the MECE plan hash matches, leading to working on stale context.

**Root cause:**
- Neglecting the resume staleness gate check described in the Boot Sequence.
- Directly starting work in Phase 3 without checking `git status` or matching plan hash.

**Prevention:**
1. On boot, if `phase == in_progress`, run `git status` to verify if there are any changes to files.
2. Compare the `mece_plan_hash` to ensure it is up to date, and if stale, ask the user to reconfirm the plan.

**Detection signal:** User complains about stale plan or code mismatch on resumption.

---

## CFP-019 · Incorrect MECE Plan Format or Placement

**Symptom:** MECE plan is not written to `.sessions/mece_plan.md` in the exact format defined, or the agent skips writing the plan to `.sessions/mece_plan.md` and only lists it in chat or chat artifacts.

**Root cause:**
- Omitting step-by-step section planning mapped 1:1 to skill sections inside the designated session file.
- Disregarding the requirement to get user confirmation on both the plan steps and DoD (Verify-N criteria) before making changes.

**Prevention:**
1. Always write the MECE plan to `.sessions/mece_plan.md`.
2. Format the plan with structured sections and Verify-N criteria for each section, and await user approval.

**Detection signal:** User or system warns about invalid MECE plan format or placement.

**Recurrences:** count:2
- 2026-07-07 · T-272/T-189 group-A round 2 · wrote mece_plan.md from the PREVIOUS task's structure held in context instead of reading `docs/session_templates/mece_plan_schema.md` at M3. Result: a plausible-but-simplified plan MISSING schema-mandated blocks — per-section `Avoid:`/`Token:`/`Input_From:`, Files-Read tables (Phase 1+2), full LOOP_WEIGHT CHECK BC, Phase 3 Execution-Complete-Pause BC, and Close-Checklist items (kcc for the new knowledge/ file, harness_doctor gate, reflection, Close-Gate BC, exact PATH A command). Caught by user ("ทำไมไม่เป็นไปตาม schema"). Fix: re-read schema → rewrote plan compliant. **Reinforced prevention: "structure I already have in context" ≠ exempt from M3 — ALWAYS Read the schema file at M3, even mid-session, even when a recent good plan exists.**
- 2026-08-03 · T-365 (wave-loop dogfood) · wrote mece_plan.md sections as `- [ ] S<n>` checkboxes instead of `### S<n>` headers (skipped M3 schema read AGAIN). Caught this time NOT by the user but by the dogfood's own tooling — `plan_lint._section_blocks` / `execution_schedule.parse_section_models` parsed 0 sections → `skill_gate` Gate 1 / T-362 `_plan_authorizes_owner_edit` silently fail-closed (masked only by the incidentally-loaded owner). Fix: read the schema → rewrote in `### S<n>` → `plan_auth` returned True. **Loop-closure: this recurrence MOTIVATED a structural guard — plan_lint now emits `PLAN-NO-SECTIONS` when `- [ ] S<n>` checkbox lines exist but 0 `### S<n>` headers parse (T-365 S4), so the next drift is caught loudly, not silent.**

---

## CFP-020 · Harness File Edits Without Invoking harness_editor Skill First

**Symptom:** Agent begins editing harness configuration files (CLAUDE.md, AGENTS.md, SKILL.md, knowledge/, Implement/) without first routing to `harness_editor` at B2 skill resolution. The MECE plan is built as a generic task, bypassing harness_editor's Refusal Contract checks (mece_plan.md gate, T-ID check, wc-l scope probe, File Size Contract).

**Root cause:**
- Skill routing at B2 matches intent as a general task rather than recognizing harness file edits as a harness_editor trigger.
- Keywords like "edit backlink", "update index", "add to knowledge/" not listed in skill-manifest.json → manifest match fails → generic plan built.
- Agent proceeds with MECE planning before confirming `skill_name=harness_editor`, skipping behavioral contract invocation gate entirely.

**Prevention:**
1. Any task touching CLAUDE.md · AGENTS.md · SKILL.md · knowledge/ · Implement/ · index_files.json · topic_registry.json MUST resolve `skill_name=harness_editor` at B2 before any MECE planning.
2. Implement/04 Invocation Gate (⚡) must be checked: if harness files appear in task scope → route first.
3. skill-manifest.json harness_editor keywords must cover: "edit knowledge/", "update index_files", "backlink", "topic_registry", "update Implement/".

**Detection signal:** MECE plan exists (mece_plan.md) but `[Boot]` trace shows `Skill: <other>` while edited files include CLAUDE.md / AGENTS.md / SKILL.md / knowledge/ / Implement/. Or: harness files modified without `[harness-edit-done]` emitted.

**Fixed (T-263 · 2026-06-24):** harness/skill file edits are now HARD-GATED by `scripts/skill_gate.py` (PreToolUse). The manifest `owns_paths` field declares `harness_editor` owns the core harness files (CLAUDE.md, AGENTS.md, scripts/**, Implement/**, knowledge/**, .agents/skills/**, ...) — an Edit/Write to any of them is BLOCKED unless `harness_editor` is active in `.sessions/.active_skill` today. Ownership is enforced structurally, not by remembering to route at B2.

---

## CFP-021 · mece_plan.md Sections Not Marked [X] During REACT Loop Execution

**Symptom:** Agent completes all task sections (all [✓ written] + Verify-N pass) but `.sessions/mece_plan.md` sections remain `- [ ] S<N>` throughout. On next boot or C2 routing check, the harness reads pending `[ ]` sections and either re-executes or wrongly reports task as incomplete.

**Root cause:**
- AGENTS.md Phase 3 L5 DECIDE lacked an explicit "mark mece_plan.md [X]" step.
- Agent tracked section completion only in memory/chat — file state was never updated.
- Consequence: gather_complete.md and mece_plan.md from previous tasks persist into next task, making Phase Transition Gate stale.

**Prevention:**
1. After every section's [✓ written] + Verify-N BOTH pass → immediately write `- [ ] S<N>` → `- [X] S<N>` to `.sessions/mece_plan.md` (file write, not just memory).
2. Phase 3 close step 0 (CLAUDE.md): verify all sections [X] before writing session_handoff.md.
3. L5 DECIDE in AGENTS.md now includes: `→ mark mece_plan.md: - [ ] S<N> → - [X] S<N> (file write)`.

**Detection signal:** After task reports done — `grep "^\- \[ \]" .sessions/mece_plan.md` returns results. Or: `active_thread.md phase: done` but mece_plan still has pending `[ ]` sections.

---

## CFP-022 · CHAT_TOTAL Boot Init Gap — Reset to 0 Instead of system_fixed (7,300)

**Symptom:** After compact-restore or fresh session start, CHAT_TOTAL is initialized to 0 and boot reply shows `Chat: ~0k`. Correct value should be `~7.3k` (system_fixed overhead always present in context).

**Root cause:**
- B1 command writes `CHAT_TOTAL: 0` to `.sessions/session_tokens.md` on compact-restore OR phase≠in_progress.
- No explicit step re-initializes CHAT_TOTAL to system_fixed=7,300 after reset.
- R1 formula documents "CHAT_TOTAL starts at system_fixed = 7,300" as a comment only — no harness enforcement.
- Model relies on working memory to apply system_fixed, but boot response showed 0 instead of 7,300.

**Prevention:**
1. B1 command must write `CHAT_TOTAL: 7300` (not 0) on compact-restore OR phase≠in_progress.
2. Boot reply `Chat: ~NNk` reads from session_tokens.md — correctly shows ~7k after fix.
3. system_fixed = CLAUDE.md ~2.6k + AGENTS.md ~3.4k + skills ~1.3k = 7,300 (one-time context overhead).

**Detection signal:** Boot reply shows `Chat: ~0k` after /compact or fresh session start. Or: `CHAT_TOTAL` in session_tokens.md = 0 immediately after B1 runs (should be 7300).

---

## CFP-023 · harness_editor Step 5 Docs Close Skipped — flow_updated Not Enforced

**Symptom:** harness_editor completes Edit+Verify steps ([pre-edit] + [✓ written]) but Step 5 (Docs Close: harness_flow + Implement/ update) is skipped. [harness-edit-done] emits without enforcing flow_updated=yes. T-034, T-035, T-036 all exhibited this pattern.

**Root cause:**
- harness_editor Output Contract has `flow_updated: <yes|no>` as a descriptive field — no gate prevents [harness-edit-done] if flow_updated=no.
- No Refusal Contract rule blocks task completion when Step 5 is incomplete.
- self_improve §4 says "apply via harness_editor" but has no explicit mece_plan gate or Step 5 check.
- Result: diagnosis/proposal skills (harness_doctor, self_improve) skip Step 5 silently.

**Prevention:**
1. harness_editor Refusal Contract: emit [harness-refused] if task about to close with flow_updated=no → complete Step 5 first.
2. self_improve §4: write mece_plan.md + T-ID in roadmap BEFORE delegating edits to harness_editor.
3. harness_doctor §5: already has mece_plan gate — verify it's followed.

**Recurrence:** 2026-06-22 T-221 — a harness-behavior change (token signal-box) ran under the generic `agent` skill, not `harness_editor`; Step-5 docs-close (harness_flow Y-entry + affected Implement/ sweep — 07_platform field list) was skipped and only caught when the user asked "why didn't I see Implement/ edited". Confirms the root: the Step-5 gate is skill-gated — when skill≠harness_editor it never arms. Coupled with the B2 skill-routing miss (harness file edits not recognized as a harness_editor trigger). Backfilled same turn. Stronger fix candidate: B2 must hard-route harness/Implement/CLAUDE/AGENTS edits to harness_editor regardless of keyword match.

**Detection signal:** Task marked done but harness_flow_*.md has no new entry matching task date. Or: grep "flow_updated: no" in session after harness file edits.

---

## CFP-024 · M5 Skip — mece_plan.md Not Written Before [✓ MECE] Emitted

**Symptom:** Agent emits [✓ MECE] and/or sends plan to user via chat response, but never calls Write/Edit tool to actually write .sessions/mece_plan.md. File either missing or stale (prior task date).

**Root cause:**
- Agent constructs plan content in response text → "feels done" because content exists in output
- No hard block prevents response from being sent before mece_plan.md is written
- self-improve fires → logs intent → but next session model has no memory of it
- Rule lives in AGENTS.md M5 which may be summarized lossy in long sessions

**Prevention:**
1. Before emitting [✓ MECE]: tool call Write mece_plan.md MUST precede the emit in same response
2. C2 routing check: if new task detected → grep .sessions/mece_plan.md date field → if not today → Phase 2 mandatory before any response claiming plan exists
3. [✓ MECE] is a file-write confirmation signal, not a declaration — treat like [✓ written]

**Detection signal:** `grep "^date:" .sessions/mece_plan.md` returns date ≠ today after plan was "confirmed". Or: [✓ MECE] emitted but file shows prior task content.

---

## CFP-025 · mece_plan.md Clear = Stripped Content Instead of Blank Template Reset

**Symptom:** After task complete, "Clear mece_plan.md" step writes minimal/stripped content (e.g. `# MECE Plan — (cleared)`) instead of resetting to the proper blank template from `docs/session_templates/mece_plan_schema.md`.

**Root cause:**
- Agent interprets "Clear" as "delete content" rather than "reset to reusable blank state"
- No explicit pointer to schema template in the Close Checklist item
- "Clear mece_plan.md Phase 1–3 (keep Phase 0 [X])" is ambiguous — doesn't say "use template"

**Prevention:**
1. Close Checklist item must read: "Clear mece_plan.md → Write blank template from `docs/session_templates/mece_plan_schema.md` (Phase 0 [X] kept · Phase 1–3 blank)"
2. Before writing: Read mece_plan_schema.md → copy blank Phase 1–3 sections → Write to mece_plan.md

**Detection signal:** `wc -l .sessions/mece_plan.md` returns < 20 lines after Clear step. Or: file missing Phase 1/Phase 2/Phase 3 headers.

## CFP-026 · Condition/Trigger Written Without Behavior Contract

**Symptom:** Rules like `>30 → emit [compact-warn]` or `IF X → do Y` appear as table rows, inline notes, or `→` shorthand — with no Pre-condition gate, no mandatory enforcement, no Post verification.

**Root cause:** AI writes conditions *descriptively* (as documentation/reference) rather than *contractually* (with enforcement gates). Reader understands what SHOULD happen but nothing enforces it actually fires.

**Prevention:** Every condition/trigger MUST follow BC structure:
```
Pre:      when/how to check (read which file · run which command)
Contract: exact action when condition met (not "emit" — "MUST emit before any response")
Post:     what verifies it happened (what fields must be present · what blocks if absent)
Enforce:  where in the flow this gate sits (C0.5 · PreToolUse hook · Phase gate)
```

**Detection signal:** grep for `→ emit\|>.*compact\|>.*HALT\|>.*STOP\|>.*warn` in rule files → check if adjacent lines contain `Pre:\|Contract:\|Post:\|Enforce:` — if not = CFP-026 violation.

**How to apply:** Before writing any `IF condition → action` rule anywhere in harness (CLAUDE.md/AGENTS.md/SKILL.md/schema templates): first draft Pre/Contract/Post/Enforce — THEN write the rule. Never write the shorthand first and "add contract later."

## CFP-027 · MECE Plan Presented to User Without Being Written to File

**Symptom:** AI presents a MECE plan in chat response (markdown table/sections) and asks user to confirm — but `.sessions/mece_plan.md` is never written. User sees the plan, confirms, and AI starts executing without a written plan file.

**Root cause:** AI treats "presenting the plan" as equivalent to "writing the plan." Phase 2 M5 requires the file to be written BEFORE or AT SAME TIME as asking user to confirm — not after.

**Prevention:** M5 order is strict:
1. Write `gather_complete.md` (Phase 1 close)
2. Write `mece_plan.md` using full template (Phase 2 M5)
3. THEN present plan summary to user + ask confirm
Never present plan in chat before mece_plan.md exists on disk.

**Detection signal:** User confirms plan → AI starts executing → `cat .sessions/mece_plan.md` missing or stale date → CFP-027 violation.

**How to apply:** At M5: Write tool call to `.sessions/mece_plan.md` MUST appear before the response text that presents the plan to the user. If Write fails → stop → fix → never skip to execution.

topic: mece-plan-write-before-present
count: 1
recurrences: [2026-07-09]

**Recurrence (2026-07-09 · T-314):** AI presented a central-constitution plan in chat across 4 turns (tables + open decisions + "confirm?") without ever writing gather_complete.md/mece_plan.md — on a HARNESS-path task (constitution/scripts/), not src/. User had to catch it manually TWICE. Confirms the prose "How to apply" has no teeth on non-src/ tasks → escalate to STRUCTURAL fix (mirror CFP-028's hook-based repair). [fix-required]

**Fix APPLIED · T-315 (2026-07-09):** root cause was NOT scope (phase_gate already gated all non-.sessions/ edits) — it was the EXIT CODE. The gate printed its block message but `sys.exit(1)`, which Claude Code treats as non-blocking, so the tool ran anyway. Fix = block-path `exit(1)->exit(2)` in all 3 gates: `scripts/phase_gate.py` (5 paths) + the inline PreToolUse copy in `.claude/settings.json` (5 paths, offset-aware Read guard added) + `scripts/skill_gate.py` (return 1->2, CFP-044 same bug). Re-test 20/20 (block=2, allow=0, offset-read=0, self-host-safe, loop-safe). **If this recurs AGAIN (count>=2):** prose failed -> hook-exit-code applied this round -> NEXT escalation is a plan-time TRIGGER (T-316) that makes harness_editor detect a CFP-fix task and fold the self_improve loop-closure subtasks into mece_plan — because the deeper miss was planning a CFP fix WITHOUT loading self_improve (see CFP-048).

## CFP-028 · Footer Omitted or Missing Loop_W Field
> **Superseded/mitigated by T-221**: signal-box (4 drift-proof booleans) is now the PRIMARY compact trigger; the footer's char-estimate fields are secondary display only, so a missing/stale Loop_W field can no longer drive a wrong compact decision.

**Symptom:** Response footer missing entirely, or shows `*(Turn: N | Session: ~NNNk | Chat: ~NNNk)*` without `Loop_W: N` field.

**Root cause:** Footer rule written as prose (`Emit ... every response`) without Behavior Contract enforcement — AI treats it as advisory not mandatory.

**Prevention:** Footer rule MUST use BC structure (Pre/Contract/Post/Enforce). `Contract:` must say "MUST append" not "emit." `Post:` must say "missing = invalid response."

**Detection signal:** Any response ending without `*(Turn:` line · or footer present but no `Loop_W:` field.

**How to apply:** Last step of every response: check footer is present with all fields (Turn · Loop_W · Session · Chat). If missing → re-emit before sending. No exceptions.

**Fix applied (T-177 · 2026-06-12 · structural):** The recurring variant of this CFP was a *frozen* counter — SESSION_TOTAL stuck at 0, CHAT_TOTAL frozen at the boot value — because no hook wrote per-turn increments and the rule said both "agent must persist every turn" AND "use hook values · NEVER estimate" (deadlock). Fix: PostToolUse hook extracted to `scripts/posttool_track.py`, now estimates tool-I/O chars and accumulates SESSION_TOTAL + CHAT_TOTAL atomically per tool call (lower bound · misses model output). CLAUDE.md R1 L29/L31 reworded so hook-estimate is the source of truth, labelled approximate. Verified live: SESSION 0→50k+, CHAT 14k→89k across a session. status → resolved-pending (watch for over-count: CHAT ×0.45 grows fast; recalibrate if it overshoots real context). **T-178 fix (2026-06-12):** root over-count resolved — hook now reuses token_estimator's per-provider multiplier (anthropic 0.3 / openai 0.27 / google / generic) read from detected.md, instead of a flat 0.3; the ad-hoc CHAT ×1.5 factor was dropped (chat_delta = session_delta). True API context still ≈1.5–2× this lower bound — kept as a doc note, not baked into the counter.

## CFP-029 · Phase 3 Close Sequence Skipped Before mece_plan Clear

**Symptom:** Agent runs `Clear mece_plan.md Phase 1–3` without completing the full Phase 3 close checklist — skipping Reviewer spawn, compact_state.md write, CFP count check, harness_doctor check, and Feedback delivery.

**Root cause:** Close treated as a single "clear" action rather than a 7-step checklist sequence. Agent shortcuts to the clear command without verifying all preceding steps are done.

**Prevention:** Phase 3 close block in mece/SKILL_detail.md §Phase 3 close block is a SEQUENTIAL checklist — every `- [ ]` must be ticked before the next step. Clear command is step 4 of 7, not the final step.

**Detection signal:** User says "เรียกหมอ" after close · or compact_state.md missing/stale after clear · or CFP count not verified after close.

**How to apply:** Before running Clear command — verify in order: ① Reviewer PASS ② active_thread phase:done ③ THEN clear ④ compact_state.md written ⑤ SESSION_TOTAL written ⑥ CFP count check ⑦ Feedback + Ask user.

**count:** 1
**recurrences:** ["2026-06-23 T-253: NEW ANGLE — close was completed once, then post-close work continued (user-coach quiz + `learning_profile.py record` wrote user_learning_profile.json; user_modeling_grounding.md created in planning). The git commit step was ordered BEFORE these final state-writes → their output was structurally guaranteed uncommitted + never index-synced (both knowledge/ files absent from index_files.json). Root extension: (a) commit must be the LAST mutating step, OR any post-commit state-write must re-trigger a mini-close (re-stage + re-index + re-commit); (b) R8 index-sync must include knowledge/ file CREATE, not only code symbols. User caught it via 'เรียกหมอ' + 'forgot to close session'. Fix this session: ran index_reconcile.py (auto backlink+regen), backfilled both knowledge entries, re-committed surgically."]
**status:** recurrence-logged (count 1 → prevention extended: commit-last + knowledge-file index-sync)

## CFP-030 · Session Close BC Skipped — No session_*.json + No index_sessions Update

**Symptom:** Task completes (mece_plan cleared, active_thread phase:done) but no new `session_<NNN>.json` written and `python scripts/session_indexer.py` never run. Session history and index_sessions.json remain stale.

**Root cause:** Session close treated as optional bookkeeping — no Behavior Contract enforcing it. AI clears mece_plan and stops without checking session file creation or index update.

**Prevention:** mece_plan_schema PATH A/C and mece/SKILL_detail.md Phase 3 close block MUST include Session Close Behavior Contract (Pre/Contract/Post/Enforce). Contract: src/ changed → session_*.json write + session_indexer.py = MANDATORY before clear.

**Detection signal:** `ls .sessions/session_*.json | wc -l` unchanged after close when src/ was modified · or user says "ไม่มี session file" · or index_sessions.json timestamp stale.

**How to apply:** Before clearing mece_plan — run: `ls .sessions/session_*.json | wc -l` → if count unchanged AND task modified src/ → write session_<NNN>.json + `python scripts/session_indexer.py` → verify count +1 → then clear.

**count:** 1
**recurrences:** ["2026-06-15 T-199: confirmed root recurrence — session_close.py manual + unrun since 8 Jun (last detail file = session_003). STRUCTURAL FIX SHIPPED: session_close.py now has --record-only mode + the Stop-hook reconciler (index_reconcile.py session_close_guard) auto-fires it once when phase==done AND task not yet recorded (guarded + idempotent). Close is no longer a manual step the AI can forget — it self-heals at the same rhythm as backlink/symbol/repo_map. Detail file enriched (files_changed/task_ids/skill/summary); index_sessions thinned to a pointer."]
**status:** structurally-resolved (auto-heal · no longer reliance on AI memory)

## CFP-031 · Loop_W Shows Stale Value (0) — File Not Read Before Footer
> **Superseded/mitigated by T-221**: the compact decision now keys off drift-proof boolean signals (signal-box), not the Loop_W / CHAT numbers — a stale estimate field can no longer cause a false ceiling.

**Symptom:** Footer shows `Loop_W: 0` even after turn 2+ · PostToolUse hook has incremented the file · but response uses cached/estimated value instead of live file read.

**Root cause:** Footer BC says "MUST run grep … before footer" but AI appends footer using in-context remembered value from boot (0) instead of running the grep. File is updated by hook but AI never re-reads it.

**Prevention:** Footer step MUST be a live file read — not recalled from memory. Bash grep must run as a tool call in the SAME response, result used directly for Loop_W value. **(T-157) persist-every-turn:** AI MUST write SESSION_TOTAL + CHAT_TOTAL → session_tokens.md EVERY turn before the footer — not only at pause/halt/gate — so the footer never reads a stale file.

**Reset-timing root cause (T-157):** Separate defect under the same topic — SESSION_TOTAL was reset on EVERY boot via a date-match on compact_state.md. A stale/leftover compact_state.md from a *prior, completed* task therefore wrongly triggered a mid-task reset (SESSION→0 when it should have been preserved). **Marker prevention:** reset is now gated by a consume-once `session_reset=armed` field in compact_state.md — armed only by PATH B (genuine /compact at a mece checkpoint) or task-done close, consumed exactly once at the next boot by B1 / the UserPromptSubmit hook (flips →consumed). Stale compact_state with marker absent/consumed → SESSION preserved, never re-reset.

**Detection signal:** `Loop_W: 0` in footer when TURN_COUNT > 1 · OR user says "Loop_W ไม่นับ" / "Loop_W stuck" · OR footer grep result differs from displayed value · OR SESSION_TOTAL drops to 0 mid-task without a genuine /compact (reset-timing defect).

**How to apply:** Before every footer: `grep -E "^(SESSION_TOTAL|LOOP_WEIGHT):" .sessions/session_tokens.md` → use ONLY those values → never use boot-cached value. Loop_W: 0 on turn 2+ = immediate re-read signal. Reset only when marker `session_reset=armed` is consumed — never on a bare date-match.

topic: token-tracking · count: 2 · recurrences: [2026-06-02, {date: 2026-06-08, session: T-157, note: reset-timing defect — SESSION reset on every boot via date-match; stale compact_state.md wrongly reset mid-task. Fix: consume-once session_reset=armed marker (B1 + UserPromptSubmit hook) + persist-every-turn}]

## CFP-032 · R2 Tool Budget Overflow — Multi-Section Work in Single Response
Symptom: Executed S2→S6 (5 sections) in one response with ~37 tool calls, violating R2 ≤5 tool calls/turn. LOOP_WEIGHT spiked to 84.
Root cause: No per-turn budget check between sections; task continued without pausing for user. Budget limit treated as advisory not hard stop.
Prevention: After completing each MECE section, pause response and present result to user before proceeding to next section. Never chain S2→S3→…→SN in a single response.
Detection signal: LOOP_WEIGHT >30 mid-response; multiple [X] marks in mece_plan.md within same response.
topic: behavior-contract
count: 1
recurrences: [{date: 2026-06-04, session: T-085, note: S2-S6 all in one response}]

## CFP-033 · L4.5 PURGE Skipped — Tool Results Retained in Context After Verdict
Symptom: Read/Bash results kept in context after [post-read] or verify verdict emitted; no [dropped] signal; CHAT_TOTAL grows unnecessarily.
Root cause: L4.5 PURGE step treated as optional; no habit of explicitly dropping after verdict. Partial/irrelevant reads stay in context.
Prevention: After every [post-read] irrelevant → immediately note [dropped]; after verify bash → drop output; offload >50L via exec_log. Treat PURGE as mandatory step same weight as L4 VERIFY.
Detection signal: [post-read] verdict emitted with no subsequent [dropped] or [result-offloaded]; tool result >50L without offload path.
topic: token-tracking
count: 2
recurrences: [{date: 2026-06-04, session: T-085, note: multiple Read results kept; no [dropped] emitted}, {date: 2026-06-04, session: T-088, note: harness_doctor inline run — Read/grep results retained; [dropped] not emitted after verdicts}]

## CFP-034 · R5 Index-First [pre-read] Emitted Inconsistently (~60% compliance)
Symptom: [pre-read] Target/Line signal emitted before ~60% of Read calls; skipped on ~40% — especially under time pressure or when anchor line is already known from grep output.
Root cause: [pre-read] treated as optional annotation instead of mandatory gate; when line is "obvious" from grep context, emission skipped to save tokens.
Prevention: Make [pre-read] mechanical syntax — even one-line emit before every Read, no exceptions. Cost: 10 tokens. Skipping cost: R5 violation + rerun.
Detection signal: Bash grep output followed directly by Read tool call without intervening [pre-read] line in response.
topic: behavior-contract
count: 2
recurrences: [{date: 2026-06-04, session: T-085, note: ~40% of Read calls missing [pre-read]}, {date: 2026-06-04, session: T-088, note: harness_doctor inline — pre-read emitted inconsistently; skipped on known-line reads during fix execution}]

## CFP-035 · R6/Bash Filter — safe_run.py Not Applied Consistently
Symptom: Diagnostic bash calls (grep, python3, find) made without safe_run.py wrapper or grep filter, even when output could be >40L. Only S6 symbol_indexer used safe_run.py.
Root cause: safe_run.py associated mentally with "scripts that scan" not "any bash with unknown output length"; diagnostic commands assumed short.
Prevention: Before every Bash call — assess: could output be >40L? If yes → use safe_run.py or pipe \`2>&1 | grep -iE "error|warn|fail" | tail -20\`. Apply to ALL python3 script calls and find commands.
Detection signal: Bash call with python3/find/git log/npm/yarn without grep filter or safe_run.py prefix.
topic: behavior-contract
count: 1
recurrences: [{date: 2026-06-04, session: T-085, note: grep/find calls without filter; only symbol_indexer filtered}]

## CFP-036 · Workflow Step Skip — Fix Applied Before Mandatory Log/Audit Step
Symptom: AI jumps to a later step (fix/edit/write) without completing an earlier mandatory ordered step first (e.g. harness_doctor: log-to-optimization_logs.md → self-heal, not self-heal → log).
Root: Multi-step workflow protocols (doctor, M5, R8) not enforced as strict sequence — AI treats them as optional checklist rather than ordered gates.
Prevention: Every multi-step workflow with a mandatory order must have a BC Pre/Contract/Post/Enforce. Enforce field must reference the specific "step N must complete before step N+1" constraint explicitly.
Detection: Response applies a fix (Edit/Write to offending file) before any [audit-finding] or [✓ written] log emit — grep response for Edit/Write without preceding audit/log signal.
topic: workflow-step-skip
count: 1
recurrences: ["2026-06-04 T-086 harness_doctor — fixed SKILL.md file_manager ref without writing optimization_logs.md first"]

## CFP-037 · Premature Close — Phase 3 Close Sequence Without User Confirm
> **Superseded/mitigated by T-221**: false ceilings from an un-reset counter no longer block work — signal-box (turns/files/outputs/steps-left) is the PRIMARY trigger; the char-counter is only a hard-ceiling backstop.
Symptom: AI marks task done / clears mece_plan / emits [harness-edit-done] without reading Close Checklist from mece_plan_schema.md — skips Reviewer spawn, [mece-audit], [session-health], knowledge_conflict_checker, Implement/ check
Root: (1) Completion Gate BC misread as auto-trigger · (2) Close Checklist treated as "already known" — never actually read from schema file · AI self-certifies done without running items
Prevention: MUST Read mece_plan_schema.md §Close Checklist EVERY close — not from memory · tick each item explicitly · [harness-edit-done] only after ALL items verified
Detection: grep response for [mece-audit] AND [session-health] AND [r8-sync-check] → any missing after [harness-edit-done] = violation
topic: premature-close
count: 7
recurrences: ["2026-06-04 T-086 harness_doctor — fixed SKILL.md without optimization_logs.md", "2026-06-04 T-095 harness_editor — reported Close Checklist done without reading schema · skipped Reviewer/mece-audit/session-health/kcc", "2026-06-14 T-191 session_manager manual-close run from memory — handoff w/o 5-field contract + reflections.md skipped + no [handoff-valid]; gap: CFP-037 fix was harness_editor-side, manual-close path uncovered"]

## CFP-038 · [fix-required] Signal Emitted But harness_doctor Not Triggered
Symptom: AI emits [fix-required] CFP-N (count≥3) or [fix-escalated] (count≥5) in same response, then proceeds without triggering harness_doctor — threshold signal disconnected from mandatory escalation action
Root: Threshold detection (count++) and escalation action (→ harness_doctor) treated as separate optional steps — AI logs the signal but concludes "not needed" without checking trigger definition
Prevention: [fix-required] OR [fix-escalated] emitted → MUST immediately emit [doctor-invoked] + BLOCK (HALT all work) until [doctor-verdict] received · no exceptions · no deferral · "ไม่ต้องหมอ" = violation
Detection: grep response for [fix-required]\|[fix-escalated] → next action MUST be [doctor-invoked] + HALT · anything else = violation · BC-doctor-gate in mece_plan_schema.md enforces this at Close
topic: workflow-step-skip
count: 2
recurrences: ["2026-06-04 T-088: CFP-028 count=3 → [fix-required] emitted → AI said 'ไม่ต้องหมอ' and proceeded", "2026-06-04 T-095: CFP-037 count=4 → [fix-required] emitted → AI asked user permission instead of invoking immediately"]

## CFP-039 · Close Checklist Run Without Output Display
Symptom: AI completes Close Checklist items internally but shows no per-item result table to user — user cannot verify what was checked or passed.
Root: "งานเสร็จ" summary replaces per-item output; AI conflates running checklist with reporting it.
Prevention: After every Close Checklist run — MUST emit per-item table (item · result · note) before writing phase:done. Silent completion = violation.
Detection: grep response for checklist table (| R8 | or | Roadmap | or | harness_doctor |) after every [session-health] — missing = violation → backfill immediately
topic: session-close
count: 1
recurrences: []

## CFP-040 · Stale Token Counter After /compact — False [compact-STOP] Ceiling
Symptom: After a /compact, CHAT_TOTAL stays at the pre-compact value (e.g. 178k) → [compact-STOP] fires every turn at that stale number, blocking work even though the real context is now small. The counter never recomputes because /compact is invisible to the model (the CLI intercepts it) and the UserPromptSubmit hook PRESERVED the old CHAT on session_reset=armed.
Root: Only B1 boot recomputed CHAT = compact_size + sys_fixed; no actor reset it immediately after the compact. Logic lived in two places (B1 + the hook) and drifted — the hook reset SESSION/LOOP but not CHAT.
Prevention: Single-source scripts/compact_reset.py recomputes session_tokens.md (CHAT=compact_size+sys_fixed, LOOP=0, SESSION=0 if armed-marker or phase:done else preserve; flips armed→consumed). Wired into the SessionStart:compact hook (claude-code, automatic) and the C0 plain-text confirm path ("compact แล้ว"/"compacted"/"เคลียร์แล้ว", other providers). Every reset prints a visible [compact-reset] line. Stuck-counter guard (C0.5): [compact-STOP] with ~same CHAT (±2k) across ≥2 turns = didn't-reset bug, not a real ceiling → run compact_reset.py instead of re-nagging.
Detection: [compact-STOP] repeats with ~identical CHAT across ≥2 turns; OR a /compact is known to have happened but no [compact-reset] line was surfaced; OR CHAT_TOTAL unchanged across a SessionStart:compact event.
topic: token-tracking
count: 0
recurrences: []

## CFP-041 · [token-state] Is a Turn-Boundary Snapshot — Mid-Turn Decisions Use Stale Numbers
> **Superseded/mitigated by T-221** (masked the symptom): the PRIMARY trigger is now signal-box — TURN_COUNT increments only on real user turns + per-tool counters; immune to the start-of-turn-snapshot lag and subagent pollution that made the char-estimate fragile.
> **ROOT-FIXED by T-235** (2026-06-22): the subagent-pollution half is now eliminated at source — `scripts/posttool_track.py` early-exits when the PostToolUse payload carries `agent_id` (= a subagent's internal tool call), so subagents no longer write the main `session_tokens.md`. env CANNOT distinguish a subagent (shared session_id + identical env); `agent_id` in the hook stdin is the only reliable signal. Proven by integer check (subagent 3 Reads → main FILES_READ unchanged). The remaining `[token-state]` ≤1-turn snapshot lag is a separate, benign display property — grep LIVE session_tokens.md at decision points (now reliable on any turn).
Symptom: The [token-state] line the agent trusts is surfaced by the UserPromptSubmit hook only at the START of each turn, so it reflects the PRIOR turn's END total. The PostToolUse hook updates session_tokens.md live DURING the turn, but the agent keeps making token decisions (compact_checkpoint, R3/C0.5 thresholds, footer) off the stale start-of-turn value. On a heavy-tool turn (clone / bulk copy / many reads) the real growth is invisible until the next turn. T-207 migration: agent judged "CHAT ~50k, continue" at the post-S2 compact_checkpoint while the turn actually crossed the 120k ceiling — only seen next turn as a single jump 47k→128k. Display lags reality by exactly 1 turn (user-observed, confirmed).
Root: [token-state] is a turn-boundary snapshot treated as if it were a live gauge. No mid-turn re-read of the live PostToolUse-updated session_tokens.md at decision points; footer prints prior-turn-end without labelling it as such, so it reads as "current".
Prevention: (a) at ANY mid-turn token decision point (compact_checkpoint · R3/C0.5 threshold check · before continuing a heavy-tool turn) → grep .sessions/session_tokens.md for the LIVE value, do NOT reuse the start-of-turn [token-state]; (b) footer value labelled explicitly "start-of-turn / prior-turn total (this turn's tool I/O not yet counted)"; (c) heavy-tool turns (≥5 tool calls OR clone/bulk-copy) force one mid-turn live re-check before proceeding past a checkpoint.
Detection: single-turn CHAT jump >40k between consecutive [token-state] reports; OR a compact_checkpoint / threshold decision made on a turn that then ran ≥5 tool calls with no mid-turn live re-check emitted.
topic: token-tracking
count: 2
recurrences: ["2026-06-22 (user-observed): footer showed hand-estimated ~55k while the header [token-state] / session_tokens.md held 139k — agent COMPUTED the footer instead of echoing the single source. Verified session_tokens.md is the ONE hook-written source (posttool_track.py writes it live every tool call; header is its start-of-turn snapshot). Fix (corrected by same-session scrutinize): footer must ECHO the [token-state] header values VERBATIM (= a start-of-turn snapshot, exactly as CLAUDE.md R1 already mandates) — so header and footer are one number shown twice, never divergent. A live `grep session_tokens.md` is reserved for MID-TURN DECISION points (R3/C0.5 thresholds, compact_checkpoint), NOT for the footer display. Initial in-session attempt over-corrected the other way (footer = live grep → more current than header → header≠footer again); scrutinize caught it. No new file/rule — R1 already prescribes echo-[token-state]; both failures (turn-1 fabricate-low, turn-2 grep-too-fresh) were discipline drift around the existing rule's middle path.", "2026-06-29 T-286 (root-fix, not a discipline failure): closed the false-ceiling family's LAST hard-stop path. settings.json no longer emits [compact-STOP] — the estimate (start-of-turn snapshot OR live grep) is now advisory ONLY and can NEVER stop the session, so CFP-041's stale-snapshot lag can no longer cause a false ceiling under any path. Root of the original conflation: WIN=128000 was treated as the model context WINDOW; it is actually the per-room token_budget (spend cap), distinct from context_window (1M for Opus 4.8, now in detected.md). Client meter (real %) = single source for any ceiling/compact decision. Supersedes the T-221/T-235 mitigations with a structural fix."]

## CFP-042 · New SKILL.md Declared Done Without the Proactive skill_auditor 9arm Audit
Symptom: harness_editor creates a new SKILL.md, runs only light Verify-N (test -f + grep keyword), then declares the skill "complete / publishable" and closes — the mandatory proactive skill_auditor pass (9arm framework) is never run. The skill ships with absent standard components (e.g. Output Tone, Hard Rules) that a real audit would have caught. T-217 scrutinize: closed as done; a user "did you audit?" prompt forced a retro-audit that returned CONDITIONAL with 3 gaps (2 absent components + 1 prerequisite self-contradiction).
Root: file-exists + grep-keyword conflated with quality verification. skill_auditor's SKILL.md explicitly says "Proactively: after harness_editor creates or edits any SKILL.md" — but the proactive trigger has no enforcing gate in the close path, so it is silently skipped. Distinct from CFP-037 (skips the generic mece Close Checklist) — this is specifically the skill_auditor 9arm pass after SKILL.md creation. Related: [[CFP-037]] · [[CFP-036]].
Prevention: harness_editor Stage 4 Close — when the changed artifact is a NEW or heavily-edited SKILL.md → MUST run skill_auditor (spawn or inline) and surface its verdict (PASS / CONDITIONAL / FAIL) BEFORE emitting [harness-edit-done]. A SKILL.md close with only test -f + grep = incomplete. Verdict CONDITIONAL/FAIL → fix flagged gaps, then re-confirm.
Detection: grep response for [harness-edit-done] on a turn that created/edited a SKILL.md → there MUST be a preceding skill_auditor verdict signal ([scrutinize-verdict] is unrelated — look for an audit PASS/CONDITIONAL/FAIL or [handoff-wait]). Missing = violation → run audit now → backfill.
topic: skill-quality
count: 1
recurrences: ["2026-06-17 T-217 scrutinize: skill closed as done with only test -f + grep; user 'ได้เช็ค Audit ยัง' forced retro-audit → CONDITIONAL, 3 gaps (Output Tone absent, Hard Rules absent, Prerequisites scope self-contradiction) → all 3 fixed same session"]

## CFP-043 · Skill Merge/Delete Leaves Stale Doc-Prose Refs — No Backlink Fires for Doc→Skill Mentions
Symptom: Merging/deleting a skill (T-238 file_manager+variable_manager → index_manager), the curated "live routing" set verifies clean (grep=0), but a later REPO-WIDE grep reveals ~10 live docs (Implement/00-08, REPO_MAP.md, domain/<pack>.md, session_templates/*) still name the deleted skill → would orphan on rm.
Root: (1) R8 "fire index_manager on every file op" was batched to the close section, not fired per-operation. (2) backlink_analyzer.py computes only topic-based related[], NOT doc-prose reference backlinks → a doc that merely *mentions* a skill name is invisible to index/backlink. (3) Stop-hook reconciler runs at session close only → mid-session drift uncaught.
Prevention: On ANY skill rename/merge/delete, BEFORE the destructive step run a repo-wide grep for the bare skill name (*.md/*.json/*.py/*.sh, minus history paths), classify live-vs-history, rename all live docs first. Scope = whole Implement/ + REPO_MAP + active domain pack + session_templates, NOT just .agents/skills + manifest.
Detection: pre-delete `grep -rln '<skill>' . --include=*.md --include=*.json | grep -v <history>` must be 0 before [gate] R14 confirm.
Fixed (T-252 · 2026-06-23): the PreToolUse close-gate now AUTO-runs this detection — `index_reconcile.py --check` greps live *.md prose for any deleted-skill-dir name (stale_skillname_refs) and BLOCKS the `phase: done` write on a hit (escape: HARNESS_SKIP_INDEX_BLOCK=1). No longer relies on the human remembering the manual pre-delete grep.
topic: index_sync
count: 0
recurrences: []

## CFP-044 · Skill Invoked From Memory/External Source — Local SKILL.md Never Loaded → Wrong Skill Applied — FIXED-BY T-263
Symptom: Agent announced/performed a "scrutinize" pass but never loaded `.agents/skills/harness/scrutinize/SKILL.md` and never emitted `[skill-active]`. It improvised the method from an in-context EXTERNAL summary (9arm-skills web research) whose same-named concept has a DIFFERENT scope. Result: the wrong skill's definition was applied — the necessity/wrong-layer/flaw review of a PLAN-before-execution it ran is, by our taxonomy, `skeptical_reviewer`'s job (M4.5 gate); our `scrutinize` = Outsider Pass + Simpler-Way on a FINISHED artifact. The mandatory Outsider Pass was skipped entirely. Caught by user: "ทำไมไม่อ้างอิง Skill scrutinize เวลาเรียกใช้".
Root: (1) No forcing function loads the local SKILL.md when a skill is invoked by name mid-conversation — skills are opt-in, not gated (the same exists-but-not-gated gap under repair this session). (2) Boot skill was the generic `agent` fallback; a user/self invocation of a skill NAME never triggered a B2-style re-route + SKILL.md load + `[skill-active]`. (3) Agent routed off an in-context external-research summary instead of the skill registry, importing a same-name/different-scope definition without checking the skill's own "When NOT to Use" boundary.
Prevention: When ANY skill is invoked by name (user phrase OR self-initiated "let me <skill> this"), BEFORE running its method: resolve against `.agents/skills/skill-manifest.json` → Read the local SKILL.md (offset≤80) → emit `[skill-active] <name>`. NEVER run a skill's method from memory or an external source. When two skills share a name/concept (scrutinize vs skeptical_reviewer), the LOCAL registry definition wins — read the target skill's "When NOT to Use" + "Distinct from" lines before applying, to confirm it is the right tool.
Detection: agent text says "scrutinize / review-as-outsider / <skill> this" OR emits a skill's verdict/output WITHOUT a preceding SKILL.md Read + `[skill-active]` emit in the same turn · OR user asks "why didn't you reference Skill <X>" · OR a skill is run whose `When NOT to Use` boundary actually excludes the current case.
topic: boot-routing
count: 5
recurrences: ["2026-06-23 post-T254-plan: agent verified the T-254 mece_plan with a bare-eye file read — invoked NO skill at all (worse than the origin case, which loaded the wrong one). Correct tool = skeptical_reviewer (M4.5 adversarial plan gate). Caught by user: 'คุณตรวจสอบแผนเรียกใช้สกิลอะไร'. Confirms the root: skill-by-name invocation is still opt-in, not force-loaded — T-254's own fix-validation pattern is the structural answer to this class.", "2026-06-24 T-261 plan-check: agent verified the T-261 mece_plan by hand (bare-eye reads + ad-hoc reasoning) — invoked no skill. Double miss: also mis-named scrutinize as the tool when the pre-execution plan gate is skeptical_reviewer (M4.5) — scrutinize's own 'When NOT to Use' excludes plan-before-execution. Caught by user: 'คุณได้ตรวจสอบโดยใช้ Skill ใช่ไหม ใช้ Skill นะครับไม่คิดเอง'. Same root: skill invocation still opt-in, not force-loaded at the M4.5 gate.", "2026-06-24 T-262 post-build audit: agent 'audited all its T-262 edits' by hand-running bash verify commands — invoked NO skill again. Owner of post-build / finished-artifact outsider review + mandatory simpler-way pass is `scrutinize`; agent ran trace+verify ad-hoc, skipped the Outsider Pass, never emitted `[skill-active] scrutinize`. Caught by user: 'คุณตรวจสอบด้วย skill อะไร ทำไมเหมือนไม่ได้ใช้ skill'. 3rd recurrence → fix-required: a verify/audit step must STRUCTURALLY force-route to scrutinize (finished artifact) or skeptical_reviewer (plan) — not rely on agent remembering to invoke it.", "2026-07-13 T-319 STAGE 1 close: agent 'verified' the 3 finished scripts at close by (a) re-running its OWN self-tests and (b) spawning a haiku reviewer that ALSO only re-ran those same self-tests — never loaded scrutinize, never ran an Outsider/Simpler-Way pass. Caught by user: 'ผ่านการตรวจสอบ...ตามหลัก scrutinize ใช่ไหม'. When scrutinize WAS then loaded it immediately found a real path-traversal hole (foreign origin_machine_id used as a filename) that the test-rerun could never surface. GAP EXPOSED IN THE T-263 FIX: skill_gate.py only hard-blocks when `.review_intent` is armed (user demanded a review UP FRONT). A close with NO up-front review demand is NOT gated, so the agent can substitute a self-test-rerun for scrutinize's mandatory proactive-at-close offer. The T-263 gate covers demanded-review; it does NOT cover the scrutinize skill's own 'proactive trigger: after a build completes, before close → offer scrutinize'. 4th recurrence of the same class → the structural fix is incomplete for the proactive-close case.", "2026-08-03 T-366 dogfood (found via a FRESH scrutinize on d861688): even when the close-gate FIRES (2a, review demanded), it was satisfied by a STALE same-session scrutinize/skeptical LOAD merely present in the today-set — NOT by a review of the CURRENT artifact. Distinct from #4 (proactive/undemanded, closed by the 2b build-review trigger / T-324): this is the DEMANDED path accepting an unrelated prior load. Fix (T-366): skill_gate._fresh_review_proof ties 2a to the current stripped-plan-hash appearing in .skeptical_ok/.scrutinize_log; a stale load no longer clears it. Fail-open when no plan hash + 2a-only (2b keeps the today-set test to avoid a leftover-stub over-block, T-252). Self-tested (gate2/2a stale-load-only -> BLOCK, hash-match -> ALLOW, no-plan -> ALLOW, 2b -> ALLOW)."]
Fixed (T-263 · 2026-06-24): structural forcing function shipped. (1) `scripts/posttool_track.py` now writes a real `.sessions/.active_skill` today-set marker on every SKILL.md Read (skill activation = file artifact, no longer invisible text). (2) `scripts/skill_gate.py` (PreToolUse) HARD-BLOCKS a `phase: done` close when a review was demanded (`.review_intent` armed) but no scrutinize/skeptical_reviewer was loaded. (3) `scripts/review_intent.py` (UserPromptSubmit) detects review/audit asks → injects a non-skippable reminder + arms the gate. Skill invocation is no longer opt-in — the gate makes loading the owning skill non-optional.
status: PREVENTION STRENGTHENED (T-263 → T-324 → T-366). Recurrence #4 (proactive/undemanded close) closed by the 2b build-review trigger (T-324): a `phase: done` close with src/ or scripts/ changed vs the baseline now requires a review OR an explicit `scrutinize-skip:` token. Recurrence #5 (a DEMANDED close satisfied by a STALE same-session skill load) closed by T-366: 2a is now tied to the current-plan-hash proof (`_fresh_review_proof` — the current stripped-plan-hash must appear in `.skeptical_ok`/`.scrutinize_log`), fail-open when no plan hash, 2a-only. Honest scope: the gate now proves a review ENGAGED this plan version (2a) and that an undemanded build is reviewed (2b); it does NOT prove the FULL close scrutinize specifically ran. Review-gate completeness remains an evolving surface — reopen if a new bypass is found.

## CFP-045 · Designed a Fix Without Querying the Index / Reading the Owner-Spec — Asked the User Instead
Symptom: tasked with fixing token tracking, the agent designed NEW constants/thresholds (cap=5000, WIN=128k, CF=1.75) from greps + chat reasoning, never reading the canonical single source. When it needed "what else is related," it ASKED THE USER ("are there other files I should read?") instead of querying `knowledge/index_files.json` + backlinks — the harness's own retrieval system. Index-first would have surfaced the owner immediately: the dedicated `token_tracker` skill + `Implement/03_config.md §R1` (formulas/tiers/CHAT×1.5) + `CLAUDE.md §R3` (thresholds). User: "หลักการเราเขียนไปแล้วไม่ใช่หรอ ... มันมี single source" then "คุณไม่ดู index_file หรือค้น backlink ล่ะ ... ทำไมนึกไม่ถึง".
Root: (1) grep-for-edit-location ≠ read-for-existing-rules — treated a single-source doc as a write target, not a read-first authority. (2) Default-to-asking-the-human for "what's related" instead of the index/backlink that exists precisely for that — a conversational reflex overriding the harness retrieval path. (3) Over-confidence ("I already understand tokens from one doc") suppressed the index lookup that would have found the OWNER skill. The masked real bug: doc↔code drift (03_config spec = tiered ×0.3/0.5 + CHAT(+700,×1.5); hook = flat ×0.3, CHAT=SESSION) invisible without reading the owner-spec and diffing it against the code.
Prevention: before designing ANY change to a subsystem, Phase 1 G2 MUST: (a) `grep index_files.json` + backlinks for the topic → identify the OWNER (skill/doc) — never ask the user "what's related" when the index answers it; (b) FULL targeted READ of the owner-spec (not a grep for edit points); (c) diff spec vs code — if they disagree, the task is "reconcile the drift," not "add new logic." New constants for an area that already has a canonical spec = smell → reconcile first, invent last.
Detection: a plan introduces named constants/thresholds for an area with an existing spec · OR design built from greps + chat with no full owner-spec read in the Files-Read table · OR the agent asks the user "which files should I read / are there others?" for a topic the index covers · OR user says "we already wrote this / use index / why didn't you think of it".
topic: phase1-gather
count: 0
recurrences: []

## CFP-046 · New knowledge doc islanded in backlink graph — off-vocabulary/file-name topics + hand-set related[] silently overwritten
Symptom: A newly created knowledge doc (T-267 harness_authoring_techniques.md) showed related:[] in index_files.json after backlink_analyzer.py ran, despite having obvious sibling docs. A manually-set related[] was silently wiped by the analyzer run.
Root: Two compounding causes. (1) The doc's index topics used OFF-VOCABULARY tags ("authoring_techniques", not in topic_registry.json) plus FILE-NAMES as minor topics ("self_improvement_loop", "skill_authoring_principles"). backlink_analyzer.py computes related[] purely from CLOSED-VOCABULARY topic overlap (major=2 / minor=1, needs score>=2) — file-name "topics" match nothing -> islanded. (2) backlink_analyzer.py (line ~219) overwrites related[] for EVERY path unconditionally, including emptying it, so any hand-set related[] never survives a run (and the Stop-hook reconciler index_reconcile.py re-runs it at close). Initial mis-fix wrongly assumed the analyzer keyed on key_claims — it does not (that is kcc's field).
Prevention: (a) assign topics to a new doc ONLY from topic_registry.json's closed vocabulary, never invent tags or use file-names as topics; (b) NEVER hand-set related[] — it is analyzer-owned output, set TOPICS and let the analyzer compute related; (c) verify related[] is populated AFTER running backlink_analyzer, not before.
Detection: after creating a knowledge doc + running backlink_analyzer, grep the doc's index entry -> related:[] while known siblings exist = islanded (bad topics); an off-vocabulary WARN in analyzer output = topic not in registry.
topic: index_sync
count: 0
recurrences: []

## CFP-047 · Post-task quiz + clarifying questions delivered as plain-text options instead of clickable AskUserQuestion
Symptom: At task close the agent wrote the learning quiz and an optional decision ("record observe trait?") as a markdown list of lettered options (ก/ข/ค) in plain prose, forcing the user to type the answer. User flagged it: "ทำไมไม่ถามเป็น Ark" (= why not ask via AskUserQuestion).
Root: feedback-post-task-learning-quiz.md carries a HARD delivery-format rule — quizzes (and any pick-one decision offered to the user) MUST be rendered via the AskUserQuestion tool (clickable choices), never as typed text options. The agent knew the quiz content rule but dropped the DELIVERY-FORMAT half of the rule, defaulting to prose because it is the cheaper path. The clickable format matters: it is lower-friction for a non-technical user and the only form the user-coach learning loop can reliably parse as a recorded answer.
Prevention: any time the agent offers the user a pick-one/pick-many CHOICE — post-task quiz, an optional trait-record decision, an A/B approach question — deliver it through AskUserQuestion, not a markdown list. Plain-text options are reserved for open-ended free-text asks only. At Completion Gate "Feedback delivered" step, if a quiz is owed, the tool used MUST be AskUserQuestion.
Detection: a turn that ends with lettered/bulleted options (ก/ข/ค, a/b/c) addressed to the user AND no AskUserQuestion tool call that turn = format violation; user replies with a "why not Ark / why not buttons" complaint.
topic: user_modeling
count: 0
recurrences: []

## CFP-045
- Symptom: a Verify-N / test suite PASSES but the logic is still broken in production, because the test fixtures used a simpler INPUT SHAPE than the real caller emits (e.g. relative paths in tests vs the absolute file_path Claude Code's Edit/Write actually send). A safety guard shipped half-blind.
- Root: test inputs hand-written to the easiest shape, not the shape the production producer actually emits. Verification confirmed the test, not the requirement.
- Prevention: when testing an interceptor/hook/parser, build fixtures from the REAL producer's payload. For PreToolUse hooks: include an ABSOLUTE-path case + an alternate-vector case (python delete, git checkout), not just the obvious relative rm.
- Detection: a post-build scrutinize/trace pass that walks the real caller's payload end-to-end (not the diff) before marking a guard done.
- topic: verification-fixture-realism
- count: 0
- recurrences: []

## CFP-46: User preference persisted in memory body only — owning skill never updated, rule silently violated
Symptom: post-task quiz delivered as plain text; user had agreed (2026-06-29) it must use AskUserQuestion (interactive choices). The rule existed in the memory note body but the quiz still went out as text.
Root: the rule WAS persisted — but only in the memory note body (feedback-post-task-learning-quiz.md "DELIVERY FORMAT hard"). The OWNING skill (user-coach SKILL.md) was never updated, and at quiz time the agent consults the skill, not the memory body. A rule stored where it is not read = a rule not stored.
Prevention: a user interaction-preference must land in the file the agent actually LOADS at act time — the owning SKILL.md — with the memory note as backup; update both in the same response. Check: does the owning skill contain the delivery contract verbatim?
Detection: user says "เราเคยคุยกันว่า..." / "we agreed..." about a behavior not found in any skill/memory file → this pattern.
topic: user-pref-persistence
count: 0
recurrences: []

## CFP-047
Symptom: Under user time-pressure ("รีบ"), agent collapsed mandatory Phase-2 harness steps — presented the plan in chat before writing mece_plan.md, skipped the M4 skeptical review despite risk_flags (a destructive section), and did not register the parent task on the roadmap (M6).
Root: Treated "user is in a hurry" as license to drop write-first + reviewer + roadmap. Optimized speed by skipping safety ceremony instead of by running it leanly.
Prevention: Hurry compresses HOW (lean, sub-agent, terse), never WHETHER. Write-first mece_plan, roadmap registration, and reviewer-when-risk_flags are non-skippable regardless of urgency.
Detection: plan presented without mece_plan.md written today · risk_flags present but no [skeptical] review · parent task absent from roadmap at M5.
topic: harness-phase2-compliance
count:0
recurrences:[]

## CFP-048 · CFP-fix planned without loading self_improve → mece_plan omits loop-closure subtasks

**APPLIED (T-316 · 2026-07-09):** structural fix shipped — harness_editor Stage 2 now carries the CFP-fix fold-in rule (SKILL.md + SKILL_detail §"Stage 2 · CFP-fix fold-in"), and a NEW PreToolUse hard-block hook `scripts/cfp_fix_plan_gate.py` (registered in `.claude/settings.json`) blocks (exit 2) any CFP-fix `mece_plan.md` that lacks a loop-closure section (test 7/7 PASS). The plan-time trigger now exists structurally, not prose-only — this very task (T-316) dogfooded the rule to close itself.

**Symptom:** When a task IS a CFP structural fix (e.g. T-315 fixing CFP-027), the agent plans it under harness_editor and the mece_plan has NO subtasks for closing the learning loop — no Stage 3.6 fix-validation, no SI-N log entry, no cfp_topics keyword, and the CFP entry is left marked "proposed" with a stale/wrong fix description. The user has to manually catch that the loop was never closed.

**Root cause:** self_improve activates ONLY at session_close (auto) or on a manual keyword ("review CFP"/"improve harness"). There is NO plan-time trigger connecting "the task I am about to plan IS a CFP fix" -> the self_improve recording discipline. harness_editor DOES own a CFP-fix stage (Stage 3.6 FIX VALIDATION + escalate->self_improve §1-3) but nothing forces the planner to fold it into mece_plan at Phase 2, so it is silently omitted.

**Prevention (structural · T-316):** harness_editor must DETECT at Phase 2 whether the task edits a CFP entry / CODING_FAILURE_PATTERNS.md / is tagged a CFP-or-ERR fix; if so, it MUST read the self_improve trigger + fold the loop-closure subtasks (fix-validation re-run, CFP entry APPLIED update, SI-N log, cfp_topics + index_cfp_fix sync) into mece_plan BEFORE presenting. Until T-316 lands, prose prevention: any CFP-fix task -> load self_improve SKILL.md during Phase 1.

**Detection signal:** task closes a CFP but self_improve was never [skill-active] this session, OR mece_plan for a CFP-fix task has no fix-validation / SI-N subtask -> CFP-048.

**How to apply:** At Phase 1 of any task whose goal is "fix CFP-N" or which edits CODING_FAILURE_PATTERNS.md, emit [skill-active] self_improve alongside harness_editor and add the loop-closure subtasks to mece_plan.

topic: cfp-fix-skips-self-improve
count: 0
recurrences: []

## CFP-049 · File-touching MECE plan omits GENERAL R8/index/backlink sync fold-in (only per-case fold-ins exist)

**Symptom:** A task creates/edits files that are NOT `knowledge/*.md` (e.g. a `.svg` asset, new `scripts/*.py`) and NOT a CFP-fix. At Phase 2 the mece_plan has no section for R8 sync (index_files.json + symbol_indexer + backlink) of those new files — the agent only adds it AFTER the user asks "did you cover index/backlink/tag?". (T-321 dogfood: diagram `.svg` + 2 new scripts were omitted from the plan until the user prompted.)

**Root cause:** Phase-2 fold-in forcing-functions are PER-CASE, not general — a single-source-of-truth gap. `cfp_fix_plan_gate.py` (T-316 · CFP-048) folds loop-closure ONLY for CFP-fix tasks; mece Rule 9 (T-320) folds tag-registration ONLY for `knowledge/*.md`. There is NO general rule "a file-touching plan must fold in the R8/index/backlink sync for ALL touched paths." Any file category outside those two special cases relies on the close-time `index_reconcile --check` gate (reactive · catches drift at close, not at plan-time) + agent memory (soft) → silently omitted from the plan.

**Prevention (structural · CORRECTED per user 2026-07-10 — original idea was WRONG-LAYER):** Sync is a CONSEQUENCE of the file-mutation EVENT, not a planning item — so the fix is NOT a plan-gate that forces the plan to contain a sync section (that keeps it plan-centric and still leaks per file-type). The create/edit/delete TRIGGER must auto-run the FULL sync every time (index_files/TOC + backlink + symbol + code_graph + topic/label where applicable), so no plan ever needs a sync section. Current state: close-batched only — the Stop-hook `index_reconcile.py` auto-regenerates rule/backlink/code_graph/symbol + repo_map at session close (automatic but once, at close), and topic/label auto-enforce covers ONLY `knowledge/*.md` via the PreToolUse tag-gate; PostToolUse does NO index sync. REAL fix = complete the mutation trigger: a PostToolUse hook on Edit/Write/delete (or guaranteed close-time coverage for ALL paths × all index kinds) that makes sync unconditional and plan-free. Do NOT add "plan must contain a sync section" gates.

**Detection signal:** mece_plan has ≥1 section creating/editing a non-`.sessions` file but no R8/index-sync section → CFP-049. Also: user asks "did you cover index/backlink/tag?" after the plan is presented.

topic: plan-omits-general-r8-foldin
count: 0
recurrences: []

## CFP-050 · danger_gate blocked a READ-ONLY Bash command because a protected-path literal appeared in the command string
status: APPLIED (T-372)

**Symptom:** A read-only Bash command (e.g. `grep -n "rm\|mv" knowledge/x`, or `grep foo knowledge/ > /tmp/out`) is HARD-BLOCKED by the danger gate as "destructive Bash touching protected path knowledge/" — even though it only READS the protected path (the destructive keyword lives inside the grep PATTERN) or writes ELSEWHERE (the `>` targets /tmp, not the protected path). Money_Assistance dogfood 2026-07-30; re-confirmed live 2026-08-04 while fixing this — the unfixed gate even blocked a harmless `.sessions/`-only python command that merely mentioned "knowledge/" + "rm" as string data.

**Root cause:** danger_gate's Bash block path (`match_gate`) decided with `DESTRUCTIVE_BASH.search(raw)` (a destructive verb ANYWHERE, incl. inside a quoted grep pattern) AND `bash_hits_protected(raw)` (the protected path as a boundary SUBSTRING ANYWHERE) — the two need not be related to each other. It never adopted the write-TARGET discipline the PHASE gate got in T-346 (`bash_write_targets`, which quote-strips and reports only paths a command WRITES). The two sibling gates DIVERGED: phase_gate smart, danger_gate crude. Same detect-only / crude-substring family as T-370/T-371.

**Prevention (structural):** A protected path is gated ONLY when it is a genuine destructive TARGET, never by mere presence — the write-vs-read distinction. `_bash_destructive_target` (T-372) requires: (A) the path is a real write target per `bash_write_targets`, OR (B) it is the arg of a destructive verb `bash_write_targets` does not model (git checkout|clean|reset · shred · truncate · unlink · rmtree · find -delete) matched on the QUOTE-STRIPPED command — EXCEPT an interpreter exec (`python -c`, `bash -c`) is scanned RAW so an interpreter-hidden `rmtree`/`rm` is still caught. The outer `DESTRUCTIVE_BASH.search` guard is kept so the change only REMOVES false positives, never adds a new block.

**Detection signal:** a read-only command (grep/cat with no redirect INTO the protected path) blocks with "destructive Bash touching protected path"; OR the same command passes only after rewording/splitting. Regression coverage: `python3 scripts/danger_gate.py --self-test` — the `t372-fp-*` cases must ALLOW and the `t372-ctl-*` cases must BLOCK.

topic: danger_gate-read-only-false-positive
count: 0
recurrences: []

## CFP-051 · Replied in the wrong language — English output to a Thai-writing user (R11 reply-mirror miss)
status: LOGGED (T-403)

**Symptom:** The user writes in Thai ("ลุย T-403 ได้เลยครับ") and the agent replies in English for the whole turn (Boot line, plan tables, summary). User flags it: "ทำไมไม่ตอบเป็นภาษาไทย ... นอกเหนือคำสั่งอีกแล้ว" ("again"). Recurring — the internal-artifacts-are-English rule bleeds into the USER-FACING reply, which must mirror the user.

**Root cause:** R11 is the ONE authoritative language rule but it is prose-discipline with no enforcement point. Two languages coexist by design (user-facing = mirror the user · internal `.sessions/`/knowledge/commits = English-only). Under a heavy harness/engine task the agent anchors on the English internal artifacts it is editing and carries that language into the reply — defaulting to English instead of reading the user's actual message language. No hook checks that reply-language matches the inbound-message language.

**Prevention (structural):** At C0/per-turn, before composing the reply, read the language of the USER's latest message and mirror it — Thai in → Thai out — independently of the (English) internal files being edited. The mirror applies to the reply + work-summary only, never to stored artifacts. Candidate hard enforcement (future ticket): a UserPromptSubmit/Stop hook that detects the inbound message script (Thai Unicode range present) and emits a `[lang-mirror] expected:th` reminder when the drafted reply is predominantly ASCII — the same detect-then-nudge shape as the token/skill gates. Until then this is a per-turn discipline anchored here.

**Detection signal:** user says "ตอบเป็นภาษาไทย" / "ทำไมไม่ตอบไทย" / "นอกเหนือคำสั่ง" + language; OR a Thai-inbound turn produces an English-majority reply.

topic: r11-reply-language-mirror-miss
count: 0
recurrences: []

