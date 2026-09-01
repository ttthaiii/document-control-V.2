---
title: Harness Authoring Techniques — a plain-language catalog
date: 2026-06-24
topic: authoring_techniques
type: knowledge
task: T-267
related: [self_improvement_loop, loops_catalog, skill_authoring_principles, boot_loop, per_turn_routing_loop, token_tracking_loop]
---

# Harness Authoring Techniques
<!-- DOC-MAP:START (auto · gen_doc_labels.py) -->
<!-- topic: doc_navigation · jump: python3 scripts/lookup.py "<label>" -->
- L44 · ## What "writing a harness" even means
- L74 · ### The 13 families at a glance
- L96 · ### Scope boundary (single source of truth)
- L106 · ### 1. Behavioral Contracts
- L133 · ### 2. Forced Audit Signals
- L162 · ### 3. Pointer Delegation (single source of truth)
- L190 · ### 4. Planning & Proof (MECE + Verify-N)
- L220 · ### 5. Deterministic Routing
- L248 · ### 6. Graduated Escalation
- L276 · ### 7. Self-Repair Loop
- L307 · ### 8. Phase-Gating
- L334 · ### 9. Context Economy
- L361 · ### 10. Session Continuity
- L389 · ### 11. Skill-Invocation Enforcement
- L415 · ### 12. Model-Cost Tiering
- L445 · ### 13. User-Facing Adaptation
- L471 · ## How others do it (external contrast)
- L491 · ## The one rule under all the rules
- L507 · ## Related
<!-- DOC-MAP:END -->


A field guide to *how this harness is written* — the recurring techniques used to
turn "please remember to…" into rules a model actually follows. Plain language,
honest about what each one costs, grounded in real files (no invented behavior).

> **Audience note:** written for someone learning AI-harness engineering, not just
> for the machine. Every category has an everyday analogy and an honest weakness.

---

## What "writing a harness" even means

A *harness* is the layer of instructions wrapped around the model — CLAUDE.md,
AGENTS.md, the SKILL.md files, the hooks and scripts. The model is the engine; the
harness is the **rails, dashboard, and seatbelts**. Good harness writing is less
about clever wording and more about one question:

> *"When the model is tired/long-context/distracted, will it still do this?"*

Three ideas run through every technique below — the **spine** of the whole catalog:

1. **Enforced, not remembered.** A rule the model has to *choose* to follow will
   eventually be skipped on a long session. A rule a *script* checks cannot be.
   The strongest techniques convert a polite request into a gate, a hook, or a
   required output token. (This is why you'll see 🟢 vs 🟡 everywhere.)
2. **Fail-closed vs fail-open.** When something is unclear, does the harness *stop*
   (fail-closed — safe, e.g. destructive gates) or *continue* (fail-open — cheap,
   e.g. an optional hint)? Each technique picks a default on purpose.
3. **Honesty about cost.** Every guardrail buys reliability with *tokens* and
   *ceremony*. A technique that costs more than it saves is a net loss — so each
   category carries a one-line 💰 cost/benefit verdict.

**Legend** — used throughout:

| Mark | Meaning |
|---|---|
| 🟢 | **Enforced** — a hook/script/required-token makes skipping it visible or impossible |
| 🟡 | **Advisory** — relies on the model choosing to comply (honor system) |
| 💪 | Strength | ⚠️ Honest weakness | 💰 | Does it buy more than it costs? |

### The 13 families at a glance

A map before the territory — skim this, then dive into any family below.

| # | Family | In one line | Enforced? |
|---|---|---|---|
| 1 | Behavioral Contracts | rules written as Pre/Contract/Post/Enforce slots, not prose | 🟢 with hook |
| 2 | Forced Audit Signals | emit a token to *force* the check + leave a trail | 🟡 |
| 3 | Pointer Delegation | one owner per fact; everyone else points to it | 🟡 |
| 4 | Planning & Proof | MECE split + runnable Verify-N, not prose promises | 🟢 |
| 5 | Deterministic Routing | lookup + tie-break instead of in-the-moment judgment | 🟢 |
| 6 | Graduated Escalation | note → recommend → hard-stop ladder + attempt cap | 🟢 |
| 7 | Self-Repair Loop | count recurring failures, escalate on repeat | 🟡 |
| 8 | Phase-Gating | block work until prerequisite files physically exist | 🟢 |
| 9 | Context Economy | never full-load · offload · density · English-first | 🟡 |
| 10 | Session Continuity | hash-guarded resume + consume-once reset marker | 🟢 |
| 11 | Skill-Invocation Enforcement | a script checks the right skill was actually loaded | 🟢 |
| 12 | Model-Cost Tiering | match the brain to the job + a medium-model floor | 🟡 |
| 13 | User-Facing Adaptation | gloss jargon · plain language for the human reader | 🟡 |

---

### Scope boundary (single source of truth)

This doc covers **harness-wide** techniques — patterns that span CLAUDE.md, AGENTS.md,
hooks, and the loop machinery. It does **not** re-explain how to write an individual
SKILL.md package — that lives in [[skill_authoring_principles]] (and must not be
duplicated here · CFP-019). For the *control loops* these techniques operate inside,
see [[loops_catalog]].

---

### 1. Behavioral Contracts

**The family:** instead of describing a rule in prose, you write it as a tiny
*contract* with fixed slots: **Pre** (what triggers it) · **Contract** (what must
happen) · **Post** (the end state) · **Enforce** (what counts as a violation). The
model reads it like a checklist, not a paragraph.

> **Analogy:** a recipe card vs a cooking story. "Add salt to taste" (prose) gets
> ignored under pressure; "Pre: water boiling → add 10g salt → Post: dissolved"
> doesn't. The slots remove the wiggle room.

| Technique | How it works | 💪 Strength | ⚠️ Weakness |
|---|---|---|---|
| Pre/Contract/Post/Enforce gate-spec (R14/R15) | Each destructive/domain rule written as 4 named slots in CLAUDE.md | No ambiguity about *when* it fires or *what* a violation is | Verbose — every rule costs ~5 lines; too many contracts bloat the prompt |
| HALT-until-confirm | Contract says "emit `[gate]` + wait for explicit word" before acting | 🟢 Pairs with a script that blocks the tool call | Only as strong as the enforcing hook; a prose-only contract is still 🟡 |

**Marquee — the destructive gate (R14).** Before deleting/overwriting protected
paths, the contract forces: *emit `[gate] Action·Scope·Risk·Waiting:confirm` and
HALT — no execution until the user confirms.* The Enforce line makes a missing
`[gate]` a `[violation]`. This is **fail-closed** on purpose: the safe default when
unsure is *stop*, because the action is irreversible.

💰 **Cost/benefit:** high ceremony per rule, but reserved for irreversible actions
where one mistake is catastrophic. Worth it there; a waste for routine steps.

---

### 2. Forced Audit Signals

**The family:** require the model to *emit a short bracketed token* (`[pre-read]`,
`[post-read]`, `[dropped]`, `[Boot]`, `[violation]`) at specific moments. The token
itself does nothing — but **producing it forces the model to actually do the check**,
and it leaves a visible trail in the transcript.

> **Analogy:** a pilot's spoken checklist — "flaps… set. Gear… down." Saying it out
> loud is the safeguard. You can't honestly say "flaps set" without looking at the
> flaps. The words *force the glance*.

| Technique | How it works | 💪 Strength | ⚠️ Weakness |
|---|---|---|---|
| Forcing-function emits | `[pre-read]` before every Read, `[post-read]` verdict after | Makes a silent skip impossible to hide — it's a missing line | 🟡 Model can still emit the token *without* doing the work (theatre) |
| PURGE token (L4.5) | After every tool result, emit `[dropped]`/`[kept:N]`/`[offloaded]` | Forces a keep-or-drop decision → context stays lean | Adds a line per tool call; on huge sessions the trail itself costs tokens |
| `[violation]` self-report | Model names its own rule-break with the rule ID | Cheap audit signal; feeds the self-repair loop (cat. 7) | Depends on the model noticing — misses what it doesn't catch |

**Marquee — `[pre-read]` / `[post-read]`.** Before a Read: `[pre-read] Target·Line`.
After: `[post-read] Verdict: relevant|partial|irrelevant`. The verdict forces an
explicit *was this worth loading?* judgment, so junk gets dropped instead of
silently bloating context. It's a **fail-open** technique: if skipped, nothing
breaks immediately — it just degrades, which is why a hook also nags about it.

💰 **Cost/benefit:** very cheap (a few tokens) for a large reliability gain on
long sessions. One of the best ratios in the harness — but only when paired with a
hook that notices a *missing* signal, otherwise it's pure honor-system.

---

### 3. Pointer Delegation (single source of truth)

**The family:** never state the same rule in two places. One file *owns* the detail;
everyone else **points** to it (`→ Implement/03_config.md §R8`, "see AGENTS.md").
CLAUDE.md stays a thin index; the heavy detail lives once, downstream.

> **Analogy:** a phone contact saved once. If you wrote a friend's number on twenty
> sticky notes, changing it means hunting all twenty — and you'll miss one. Save it
> once, reference the contact everywhere.

| Technique | How it works | 💪 Strength | ⚠️ Weakness |
|---|---|---|---|
| Pointer-not-prose | Summary line + `→ file §section` instead of restating | One edit updates everywhere; no drift | A broken/stale pointer sends you to the wrong place silently |
| Tiered detail (CLAUDE→AGENTS→Implement) | Hot rules thin & top; detail pushed down a level | Keeps the always-loaded prompt small | Detail is one hop away — costs a lookup when you genuinely need it |

**Marquee — the CFP-019 discipline.** "Ground every claim in a real file; never
write a plan or doc from memory." When prose is *duplicated* instead of *pointed to*,
the copies drift — one says "12 categories", the master says "13" — and the model
trusts whichever it read last. The fix is structural: keep exactly one authoritative
copy. This very doc obeys it (see the Scope boundary above — SKILL.md authoring is
*pointed to*, not copied).

💰 **Cost/benefit:** near-free to maintain, huge payoff — drift is one of the most
common and most expensive harness bugs. The only cost is the occasional extra hop
to read the owning file.

---

### 4. Planning & Proof (MECE + Verify-N)

**The family:** before touching anything, decompose the work into **MECE** sections
(Mutually Exclusive, Collectively Exhaustive — no overlap, no gaps) and attach to
each a **Verify-N**: a *runnable shell check*, never a prose promise. "Done" means
the check passed, not that the model believes it's done.

> **Analogy:** a building inspector's punch-list. Each item is pass/fail by
> measurement ("does the door close? — yes/no"), not by the contractor's opinion
> ("looks good to me"). The plan splits the job into non-overlapping rooms; the
> checklist proves each one.

| Technique | How it works | 💪 Strength | ⚠️ Weakness |
|---|---|---|---|
| MECE decomposition | Split task into non-overlapping, gap-free sections | Each piece is independently checkable; safe to parallelize | Up-front cost; over-splitting a tiny task is pure overhead |
| Verify-N as shell | Each section ends with `grep -c …`/`json.load` etc. | 🟢 Proof is objective — the command passes or it doesn't | A weak check (`grep -c "###" ≥1`) gives false confidence |
| Dependency map + cycles | Mark which sections are serial vs safe-parallel | Maximizes safe concurrency; flags shared-file hazards | Wrong dependency = silent corruption when two writers race |

**Marquee — Verify-N must be runnable.** A prose "verify the doc has all categories"
can be rationalized as passed. `grep -c "^### " file ≥ 13 AND grep -c "💰" ≥ 13`
cannot — it's a number that either clears the bar or doesn't. This is **fail-closed**:
a failing check stops the section from being marked `[X]`. (This catalog's own S1/S2
are gated exactly this way.)

💰 **Cost/benefit:** the planning tax is real on small jobs, but on anything
multi-step it prevents the most expensive failure — *thinking* you're done when
you're not. Scale it to the task: skip for one-line edits, mandatory for >3 steps.

---

### 5. Deterministic Routing

**The family:** when the harness must *choose* (which skill? which model tier? which
provider rules?), replace judgment with a **lookup + a tie-breaker**. Same inputs →
same choice, every time, with no chat history needed.

> **Analogy:** a vending machine vs asking a barista. B4 buys you exactly what the
> code says; no "the model felt like picking the other skill today". Predictable beats
> clever when you need the same answer twice.

| Technique | How it works | 💪 Strength | ⚠️ Weakness |
|---|---|---|---|
| Manifest keyword match + tie-break | B2 greps skill keywords; ties → "last in manifest order" | Removes the multi-match stall (T-234); reproducible | A bad keyword set routes confidently to the *wrong* skill |
| Provider profile table | B4 maps platform→provider→cache/token rules from a table | No cross-provider rule mixups; safe `unknown` fallback | Table must be kept current as providers change |
| `[skill-miss]` forcing function | No match → must name the default + reason, can't proceed silently | Surfaces routing gaps instead of hiding them | Still picks a default — a wrong-but-confident route looks fine |

**Marquee — the tie-break rule.** Two skills match? The harness doesn't deliberate;
it picks the last in manifest order and emits `[skill-match-tie]`. This is **fail-open**
and deterministic: it never *stalls*, and the choice is auditable after the fact. The
cost is that determinism can be confidently wrong — which is exactly what the
self-repair loop (cat. 7) exists to catch.

💰 **Cost/benefit:** cheap to run, and the payoff is *no stalls + reproducibility*.
The hidden cost is maintenance — the lookup tables only stay correct if someone updates
them. Worth it for any choice the harness makes more than once.

---

### 6. Graduated Escalation

**The family:** don't go from "fine" straight to "STOP". Define a **ladder** of
thresholds, each with a louder response — a gentle note, a strong recommendation, a
hard halt — and an **attempt cap** so the model can't loop forever.

> **Analogy:** a kettle. A little steam (note) → a whistle (recommendation) → auto
> shut-off (hard stop). You get warned long before anything actually fails, and there's
> a final cutoff that doesn't depend on you hearing the whistle.

| Technique | How it works | 💪 Strength | ⚠️ Weakness |
|---|---|---|---|
| Threshold ladder (R3 tokens) | `[compact-note]` → `[compact-rec]` → `[compact-STOP]` by severity | Warns early; only the top rung actually stops work | Too many rungs → alarm fatigue; the user tunes them out |
| Attempt cap (R13) | 2nd failure → HALT + `[blocked]`; no silent 3rd try | Stops infinite retry loops cold | A real fix on attempt 3 is blocked too — cap can be over-tight |
| Two-condition hard stop | `[compact-STOP]` needs estimate ≥90% **AND** signal-box ≥2 | Avoids stopping on a lone bad estimate (T-261) | More logic = more places a threshold can be mis-set |

**Marquee — the AND-gated ceiling.** The single hard stop in the token system fires
*only* when a window-anchored estimate is ≥90% full **and** at least 2 of 4
drift-proof signals agree. Requiring two independent witnesses prevents a noisy
estimate from halting good work — a direct fix for false ceilings. This is the
harness's most deliberate **fail-closed** point, and it's intentionally hard to trip.

💰 **Cost/benefit:** the ladder's lower rungs are nearly free and prevent surprise
halts; the danger is *too many* warnings becoming background noise. Keep the loud
rungs rare and they stay meaningful.

---

### 7. Self-Repair Loop

**The family:** when the harness catches itself breaking a rule, it doesn't just
apologize — it **records the failure pattern, counts recurrences, and escalates** if
the same miss keeps happening. The harness learns from its own mistakes, in the same
response.

> **Analogy:** a hospital's incident log. One slip gets noted; the *third* time the
> same slip happens, it triggers a mandatory process change — not another apology.
> Counting is what turns "oops" into "fix the system".

| Technique | How it works | 💪 Strength | ⚠️ Weakness |
|---|---|---|---|
| Recurrence-counted CFP | Each failure → a `## CFP-N` entry with `count` + `recurrences[]` | Distinguishes a one-off from a chronic bug | The log only grows if the model *notices* it slipped (cat. 2 dependency) |
| Same-response backfill (R16) | On a complaint, fix the missed step *now* + log it this turn | No "I'll do it later" — the repair is immediate | Adds work to the very turn the user is already frustrated |
| Escalation by count | count ≥3 → `[fix-required]`, ≥5 → `[fix-escalated]` | Forces a structural fix once a pattern is undeniable | Thresholds are arbitrary; a rare-but-severe bug under-escalates |

**Marquee — count-then-escalate.** A failure pattern at `count:1` is a note; at `≥3`
it *demands* a fix; at `≥5` it escalates. This is the back half of the learning loop —
and it's the harness's own honest weak spot: the *front* half (catching + logging) is
well enforced, but "did the fix actually work?" is still largely manual (see
[[self_improvement_loop]]). A loop that records but never measures its repairs is only
half-closed.

💰 **Cost/benefit:** the logging is cheap and compounding — every recorded pattern is a
bug that gets prevented next time. The unclosed measurement half means some "fixes"
are unverified, so the payoff is real but currently overstated. Net positive, with a
known gap.

---

### 8. Phase-Gating

**The family:** stop work from starting until prerequisites *physically exist*. A
script checks that the right files are present and dated *today* before it lets an
edit through — you can't skip the planning step, because the door is locked until the
plan file is on disk.

> **Analogy:** a construction permit. You can't pour concrete until the signed permit
> is filed — and the inspector checks the *paper*, not your word that you planned it.

| Technique | How it works | 💪 Strength | ⚠️ Weakness |
|---|---|---|---|
| File-dated gate | PreToolUse hook blocks `src/` edits unless gather+mece files dated today | 🟢 Hook-enforced — planning literally can't be skipped | Date check is coarse; a today-dated *stale* plan still passes |
| Scope-baseline diff | Files-touched compared to a snapshot taken at planning time | Catches scope-creep — edits outside the declared set get flagged | Baseline must be captured cleanly; a dirty tree pollutes it |

**Marquee — the phase-gate hook (T-230).** Before any `src/` edit, a script confirms
`gather_complete.md` + `mece_plan.md` both exist and are fresh, else it BLOCKS and
emits `[phase-gate-blocked]`. This is the purest **"enforced, not remembered"**
technique in the harness — it doesn't *ask* the model to plan first, it makes the edit
impossible until the plan exists.

💰 **Cost/benefit:** one of the highest-value gates — it converts the single most-skipped
discipline (plan before code) into a hard precondition. Cost is a little friction on
genuinely trivial edits; mitigated by scoping the gate to `src/` only.

---

### 9. Context Economy

**The family:** treat the context window like a tight budget. Never full-load big
files (grep or read a slice instead), offload long tool output to disk, prefer
tables over prose, and keep machine-facing text in English (≈4× cheaper than Thai
per character). Every token spent on noise is a token not spent on the task.

> **Analogy:** packing a carry-on. You don't bring the whole wardrobe "just in case" —
> you bring the slice you'll wear. Read the page you need, not the whole book.

| Technique | How it works | 💪 Strength | ⚠️ Weakness |
|---|---|---|---|
| Never-Full-Load | Big/hot files (CLAUDE.md, indexes) → grep/offset only, never full Read | Keeps the window lean; avoids re-paying for huge files | Grep can miss context that a full read would've caught |
| Offload @ 50 lines | Long tool output → a file on disk, keep only terse signals | Stops one noisy command from eating the window | The detail is now a hop away if you actually needed it |
| Density hierarchy (R7/R10) | Table > bullet > prose; English-first for machine text | ~40% fewer tokens for the same information | Over-compressed text can lose nuance a human reader wanted |

**Marquee — Never-Full-Load.** CLAUDE.md is *never* re-read; the big JSON indexes are
*grep-only*. The rule exists because re-loading a 2k-line file every few turns silently
dominates a session's token bill. It's **fail-open** (skipping it just costs money, it
doesn't break) — so a hook nags when cache-hit drops, nudging a compact.

💰 **Cost/benefit:** pure savings with almost no downside on long sessions — the main
risk is *over*-trimming and having to re-read something you discarded. Cheap insurance;
the discipline pays for itself within a few turns.

---

### 10. Session Continuity

**The family:** a session can be cut off mid-task (context fills, `/compact` fires) and
must resume *exactly* where it stopped — without redoing finished work. The harness
saves small state files, hash-guards them so it knows what's still valid, and uses a
*consume-once* marker so a reset can't fire twice by accident.

> **Analogy:** a bookmark plus a "you are here" map. When you re-open the book you don't
> re-read chapters 1-5; the bookmark + a quick check that the page numbers still match
> gets you straight back to where you were.

| Technique | How it works | 💪 Strength | ⚠️ Weakness |
|---|---|---|---|
| Hash-guarded resume | On resume, sha1 of the plan/skill vs saved hash → skip re-read if equal | Saves ~3k tokens per resume; detects a changed plan | A hash mismatch forces a full re-read — correct but pricey |
| Consume-once reset marker | A reset flag is *armed* once, *consumed* at next boot, then cleared | 🟢 Prevents a stale marker from wrongly zeroing counters (CFP-031) | Logic is subtle; a mis-wired marker is a confusing bug to trace |

**Marquee — hash-guarded restore (B1/B3).** After a compact, boot compares the saved
SKILL.md hash to the file on disk; match → skip the read entirely. This makes resume
*cheap*, which matters because compaction happens often on long tasks. It's
**fail-closed** in the safe direction: when in doubt (hash differs), it re-reads rather
than trusting stale state.

💰 **Cost/benefit:** strongly positive on any long/multi-session task — it's the
difference between a clean resume and re-doing an hour of work. The subtlety of the
consume-once logic is the only real cost (it's easy to get wrong).

---

### 11. Skill-Invocation Enforcement

**The family:** it's not enough to *tell* the model "use the review skill" — a script
checks that the right skill was actually *loaded* before a review can be called done,
and a reject-log remembers ideas already ruled out so they don't get re-proposed.

> **Analogy:** a referee, not a rulebook. The rulebook says "no offside"; the referee's
> flag is what actually stops play. The skill gate is the flag.

| Technique | How it works | 💪 Strength | ⚠️ Weakness |
|---|---|---|---|
| Script-enforced skill gate (T-263) | A review reaching "done" without scrutinize loaded is HARD-BLOCKED | 🟢 "Review in your head" becomes structurally impossible | Adds a script + an escape hatch to maintain; one more moving part |
| Out-of-scope reject log (T-224) | Rejected proposals are logged; the planner greps it before re-suggesting | Stops the same bad idea coming back every session | Log can ossify — a once-bad idea that's now good stays rejected |

**Marquee — the skill gate (T-263 / CFP-044).** Selecting *which* skill happens by
keyword match at boot; but *loading* it is enforced here — `skill_gate.py` blocks a
finished review that never loaded `scrutinize`. This closes a real gap: the model used
to "review" from memory and miss things. **Fail-closed** with a documented escape
(`HARNESS_SKIP_REVIEW_GATE=1`) for the rare false trigger.

💰 **Cost/benefit:** high value for the specific failure it targets (shallow in-head
reviews), but it's narrow — it only guards review/audit flows. Worth the one script;
not a pattern to spray everywhere.

---

### 12. Model-Cost Tiering

**The family:** match the *brain* to the *job*. Cheap lookups and mechanical edits go
to a low tier; reasoning and code edits to a medium tier; architecture/MECE to the top
tier (reserved). And a **robustness floor**: every skill must still run correctly on a
*medium* model with no clever inference — so the harness doesn't secretly depend on the
smartest model to be safe.

> **Analogy:** don't send a senior surgeon to take blood pressure. Use the right level
> of staff for each task — and make sure the routine work is safe even with a junior on
> shift.

| Technique | How it works | 💪 Strength | ⚠️ Weakness |
|---|---|---|---|
| Effort × tier routing (R4) | Dial reasoning-effort first, then pick model tier per task type | ~35% cost saving vs running everything on the top model | A mis-routed hard task to a low tier fails quietly or loops |
| MEDIUM robustness floor | Every skill must work on a medium model without inference | Harness stays safe even when the top model isn't available | Writing to the floor caps how "clever" a skill is allowed to be |

**Marquee — the robustness floor.** The rule "every skill must run on a MEDIUM model
without inference" is a design constraint on *authoring*, not runtime: it forces
instructions to be explicit enough that they don't rely on a genius reading between the
lines. That's why so much of this harness is deterministic lookups (cat. 5) rather than
"use your judgment".

💰 **Cost/benefit:** the routing saves real money on every session; the floor costs some
expressiveness but buys portability and safety. Both are net-positive — the floor is
the less obvious win (it's what keeps the harness from silently breaking on a cheaper
model).

---

### 13. User-Facing Adaptation

**The family:** the harness adapts its *output* to the human reading it. Technical terms
must be glossed (term → plain meaning + an everyday analogy), replies stay concise and
plain-spoken, and explanations are tuned to a learner rather than an expert.

> **Analogy:** a good doctor who explains your diagnosis in normal words *and* the
> medical name — so you actually understand, instead of nodding at jargon.

| Technique | How it works | 💪 Strength | ⚠️ Weakness |
|---|---|---|---|
| Mandatory term glossing (R7b) | Any technical term ships with a plain gloss + analogy | Serves a non-expert reader; builds understanding over time | Costs tokens; glossing the *same* term repeatedly is noise |
| Plain-language + density | Concise, person-not-manual tone; structure over prose walls | Faster to read; matches the user's stated preference | "Plain" can drift into "vague" if it drops needed precision |

**Marquee — the glossing rule (R7b).** Unlike most techniques (aimed at the *machine*),
this one is aimed at the *human*. It encodes a teaching stance: explain the cause and
big picture first, *then* name the jargon. It's 🟡 advisory — there's no script that can
check "was this gloss actually helpful?" — so it leans entirely on the model honoring
the user's learning goal.

💰 **Cost/benefit:** the right call *for this user* (a learner), where understanding is
the actual product. For a pure machine-to-machine harness it'd be wasted tokens — which
is the honest point: this technique's value is audience-dependent, not universal.

---

## How others do it (external contrast)

This harness is one point in a design space. Three public sources (kept in `knowledge/`
for reference) pull in instructive directions:

| Source | Their emphasis | What this harness borrowed | Where this harness differs |
|---|---|---|---|
| **mattpocock** | Progressive disclosure · leading-words · *kill the no-ops* · leanness as a virtue | The instinct to delete instructions that don't earn their tokens | This harness leans heavier — more gates/ceremony — because it targets long, unattended sessions, not interactive use |
| **9arm** | 4-boolean *signal-counting* · explicit Trace + Verify · shell-alias simplicity | The drift-proof signal-box (cat. 6's two-witness stop) and the trace-everything habit (cat. 2) | This harness adds a much larger contract/gate layer on top of the lean core |
| **karpathy** | A *cost/benefit* evaluative lens · "Surgical Changes" (touch only what you must) | The 💰 lens used throughout this very doc; the scope-creep gate (cat. 8) is the Surgical-Changes idea made enforceable (T-230) | This harness encodes the lens as *scripts*, where karpathy keeps it a *mindset* |

**The honest read:** the lean schools (mattpocock, 9arm) would call parts of this harness
*over-built* — and on a short interactive task they'd be right. This harness optimizes for
a different regime: **long, multi-session, semi-autonomous work where a single silent skip
is expensive.** In that regime, ceremony that would be waste elsewhere becomes cheap
insurance. The catalog above is biased toward that trade — read each 💰 line with your own
regime in mind.

---

## The one rule under all the rules

Every technique here is the same move applied to different problems: **convert a hope into
a mechanism.** "Please remember to plan" → a hook that blocks unplanned edits. "Try to keep
context lean" → a never-full-load rule + a cache-hit nag. "Use good judgment routing" → a
lookup table with a tie-break.

The cost is always tokens and ceremony; the benefit is always *reliability that survives a
tired, long-context model*. A technique is worth it exactly when the failure it prevents is
more expensive than the ceremony it adds — which is why every category carries its own 💰
verdict instead of a blanket "always do this". When in doubt, **scale the guardrail to the
blast radius**: irreversible/expensive → fail-closed gate; cheap/recoverable → fail-open
hint.

---

## Related

- [[skill_authoring_principles]] — how to write a single SKILL.md package (sibling, not duplicate)
- [[loops_catalog]] — the control loops these techniques operate inside
- [[self_improvement_loop]] — the self-repair loop (cat. 7) in full detail, incl. its open back-half
- [[token_tracking_loop]] · [[per_turn_routing_loop]] · [[boot_loop]] — loops that several techniques here live in
- Source files cited: `CLAUDE.md` (R3/R4/R7/R10/R13/R14/R15/R16) · `AGENTS.md` (B1-B4, C0-C3, L1-L5) · `mece_plan_schema.md` · `Implement/03_config.md` · `CODING_FAILURE_PATTERNS.md` (CFP-019/031/044)
- External contrast: `9arm-skills-writing-techniques-concrete-examples-2026-06-04.md` · `karpathy-skills-comparison-2026-06-21.md` · `mattpocock-skills-comparison-2026-06-19.md`
