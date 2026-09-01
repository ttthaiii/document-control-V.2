# Skill Quality Checklist — with verification method & rationale

> **Audience:** anyone reviewing a Skill (SKILL.md package) before release.
> **Purpose:** turn the principles in `skill_authoring_principles.md` into a concrete review pass.
> **How each item is structured:**
> - `[ ]` the check (answerable yes/no)
> - **Verify:** *how* to actually check it — a concrete action, not a vibe
> - **Why we check (prevents):** the failure it guards against, tagged to the model mechanic
>   (M1–M7) it derives from. See the principles doc for the mechanics.
> **Last reviewed:** 2026-06-07

**How to use:** Group A and B must pass fully — they decide whether the skill is *found* and
whether it *fits in context*. Groups C and D pass *as applicable* to the skill's complexity.
A simple skill may legitimately skip C3/C5/D1; a skill that touches exact formats or irreversible
actions must not skip C2/C4. The gate guidance at the bottom says which are non-negotiable.

---

## A · Triggering — will it be loaded at the right moment? (30 pts)

- [ ] **A1a · `description` states *what* the skill does.**
  - **Verify:** read the description alone (hide the body). Can you say in one sentence what it
    produces? If you have to open the body to know, it fails.
  - **Why we check (prevents):** the dispatcher only sees the description (M4); an unclear *what*
    means the skill is never selected for the jobs it's good at.

- [ ] **A1b · `description` states *when to use*, in the user's own words.**
  - **Verify:** list 3 phrasings a real user would type for this task. Does the description
    contain those trigger words/synonyms?
  - **Why we check (prevents):** trigger-word mismatch → silent misses (M4).

- [ ] **A1c · `description` states *when NOT to use* (a negative trigger).**
  - **Verify:** name the nearest neighbouring skill or task this could be confused with. Does the
    description explicitly steer away from it ("do NOT use for…")?
  - **Why we check (prevents):** false fires that crowd out the correct skill (M4).

- [ ] **A1d · `description` is written for the selector, third-person — not marketing to the user.**
  - **Verify:** check voice. "Use when the user wants X" ✅ / "I'll help you do amazing X!" ❌
  - **Why we check (prevents):** user-facing fluff wastes the one signal the dispatcher reads (M4).

- [ ] **A2 · The skill is one coherent capability.**
  - **Verify:** try to write the trigger as a single clean sentence. If it needs "and also" /
    "or when", consider splitting.
  - **Why we check (prevents):** blurry boundary → unpredictable dispatch (M4).

- [ ] **A3 · `name` is lowercase-hyphenated, function-bearing, and unique.**
  - **Verify:** read the name cold — does it betray the function? Grep the skill set for
    collisions.
  - **Why we check (prevents):** cryptic/colliding names weaken selection and the human index (M4).

---

## B · Context economy — does it fit in attention budget? (20 pts)

- [ ] **B1a · The body reads as a router (overview + workflow + pointers), not a data dump.**
  - **Verify:** scan the body. Is there a long reference table / schema / edge-case catalog inline
    that isn't needed on *every* run? If so it belongs in L3.
  - **Why we check (prevents):** detail loaded on every trigger dilutes task attention (M1).

- [ ] **B1b · Body length is lean (rule of thumb: a few hundred lines, not thousands).**
  - **Verify:** `wc -l SKILL.md`. If large, ask what could move to L3.
  - **Why we check (prevents):** a heavy body degrades the task it's meant to support (M1).

- [ ] **B2 · Information is in tables/lists where structure fits.**
  - **Verify:** find the longest prose paragraph. Could it be a table or list with no loss? If
    yes, it should be.
  - **Why we check (prevents):** prose costs more tokens and is harder to operationalize (M1).

- [ ] **B3 · The most critical constraints appear early (and repeat at point-of-use).**
  - **Verify:** locate the single most important rule. Is it near the top? Is any step-specific
    rule restated at that step?
  - **Why we check (prevents):** middle-buried rules get under-weighted (M2).

---

## C · Execution fidelity — will it do the task correctly? (35 pts · as applicable)

- [ ] **C1 · The workflow is numbered, imperative, with explicit branches and stop points.**
  - **Verify:** can you follow the steps top to bottom without inferring order or intent? Are
    branches written `if X → Y, else Z`? Are judgment/risk points marked "ask the user"?
  - **Why we check (prevents):** descriptive prose leaves order and conditions to chance; explicit
    steps cut the model's arbitration load (M1, M6).

- [ ] **C2 · Deterministic work is delegated to a script, not done by hand.** ⭐
  - **Verify:** find every exact/repeatable operation (format conversion, hashing, parsing,
    schema validation). Is each one a script the agent runs, rather than a "produce this exact
    output" instruction?
  - **Why we check (prevents):** per-token error compounds over exact sequences; scripts are
    deterministic, the model isn't (M3).

- [ ] **C3 · At least one worked example is present (good-vs-bad where subtle).**
  - **Verify:** is there a concrete input→output? For any subtle distinction, a correct/incorrect
    pair?
  - **Why we check (prevents):** abstract-only rules under-calibrate; demonstrations set a strong
    prior (M5).

- [ ] **C4 · Verification is built into the workflow, with a failure path.**
  - **Verify:** does the workflow end in a concrete self-check (ideally a script/test)? Is the
    on-failure behaviour defined (diagnose → retry once → stop)?
  - **Why we check (prevents):** without a check, generation errors ship silently (M3).

- [ ] **C5 · Common mistakes / failure modes are listed.**
  - **Verify:** is there a short section naming the predictable wrong approach and the right
    alternative?
  - **Why we check (prevents):** naming the wrong default pre-empts it; negative examples fence
    off nearest-but-wrong behaviour (M7, M5).

- [ ] **C6 · Scope is bounded — "done" and "out of scope" are defined.**
  - **Verify:** does the skill say when the task is complete and what it deliberately won't do?
  - **Why we check (prevents):** open-ended tasks drift into over-engineering and scope creep
    (M1, M6).

---

## D · Robustness — will it survive a context-free run? (15 pts · as applicable)

- [ ] **D1 · Context is self-contained (internal conventions stated or linked).**
  - **Verify:** would an agent with zero knowledge of this team/project be able to run it without
    guessing? Hunt for unstated assumptions.
  - **Why we check (prevents):** silent gaps get filled with the generic prior, not your
    convention (M7).

- [ ] **D2 · Every referenced path / bundled file resolves.**
  - **Verify:** for each path mentioned, confirm the file exists and the spelling matches.
  - **Why we check (prevents):** a dead pointer stalls the workflow with no recovery.

- [ ] **D3 · `MUST` / `NEVER` are reserved for genuine hard rules.**
  - **Verify:** count the emphatic markers. For each, can you name the concrete failure it
    prevents? If most lines are emphatic, demote the soft ones.
  - **Why we check (prevents):** emphasis works by contrast; `MUST`-inflation flattens priority
    (M6).

- [ ] **★ Meta · The skill is not over-constrained / free of dead ceremony.**
  - **Verify:** for every hard rule and mandated ritual, ask "what likely, concrete failure does
    this prevent?" Anything that buys nothing toward task quality is ceremony — cut it.
  - **Why we check (prevents):** every rule is an attention tax; surplus rules and rituals make
    the model *worse*, not safer (M6). This is the most-violated principle, so check it explicitly.

---

## Scoring — weights, method & passing bar

> The verdicts (✅/⚠️/❌/N/A) tell you *what* is wrong. The score tells you *how far from
> shippable*, and turns the overall verdict from a judgment call into a number. Weights follow
> impact: **the more an item decides whether the skill works at all, the more points it carries**
> (mechanic in parentheses — see the principles doc). A pile of yes/no checks is hard to act on;
> one number + a hard-gate rule is not.

### Weight table (100 points total)

| Group | Item | Pts | Why this weight |
|---|---|---:|---|
| **A · Triggering** | A1a · description states *what* | **8** | the trigger signal itself (M4) — unclear → never fires |
| **(30)** | A1b · *when* + keywords | **8** | must match real user phrasing (M4) |
| | A1c · *when-not* | **5** | blocks false fires that crowd out the right skill (M4) |
| | A1d · third-person voice | **2** | hygiene — wastes the one signal if wrong |
| | A2 · one capability | **5** | sharp boundary → precise dispatch (M4) |
| | A3 · name | **2** | secondary selection signal (M4) |
| **B · Context economy** | B1a · router, not data dump | **8** | a bloated body degrades the task itself (M1) |
| **(20)** | B1b · lean length | **4** | attention is a budget (M1) |
| | B2 · tables over prose | **3** | more signal per token (M1) |
| | B3 · front-load constraints | **5** | mid-buried rules get under-weighted (M2) |
| **C · Execution fidelity** | C1 · numbered imperative steps | **10** | the procedure itself (M1, M6) |
| **(35)** | C2 · scripts for deterministic ⟡ | **8** | exact work leaks errors otherwise (M3) |
| | C3 · worked example | **6** | demos calibrate better than rules (M5) |
| | C4 · verification built-in ⟡ | **6** | closes the error loop (M3) |
| | C5 · failure modes listed | **3** | pre-empts the wrong default (M7) |
| | C6 · bound scope / define "done" | **2** | prevents over-reach (M1, M6) |
| **D · Robustness** | D1 · self-contained context | **6** | silent gaps fill with the generic prior (M7) |
| **(15)** | D2 · valid paths/links ▣ | **4** | a dead pointer stalls the workflow |
| | D3 · reserve MUST/NEVER | **5** | emphasis works only by contrast (M6) |

⟡ **conditional** — if the skill has no exact/deterministic work (C2) or no meaningful output to
verify (C4), mark **N/A** and drop its points from the denominator (rescale). Don't punish a skill
for lacking what it doesn't need.
▣ **gate** — D2 is also pass/fail: any broken link is a must-fix flag regardless of points.

### Method
1. Score each item: **✅ = full pts · ⚠️ weak = half · ❌ = 0 · N/A = removed from denominator.**
2. `score% = (earned ÷ sum-of-applicable-weights) × 100`
3. **Over-constraint penalty (the ★ meta-check):** subtract **−2 per piece of dead ceremony** — a
   hard rule or ritual that prevents no likely, concrete failure — capped at **−10**. This makes
   over-engineering *cost* score, enforcing the meta-principle that surplus rules make the model
   worse, not safer (M6). Most skills score 0 here; a heavily over-engineered one bleeds points.

### Hard gates — cap the verdict regardless of score
If **any** of **A1a · A1b · B1a · C1** is ❌, the skill cannot rank above **🟡 Needs work**, no
matter the total. You can score 88 on polish, but a skill that never fires (A1a/A1b), doesn't fit
context (B1a), or has no procedure (C1) is not a working skill. A broken **D2** link is likewise a
must-fix before ship.

### Passing bar — "how good is good?"

| Score | Verdict | Meaning |
|---:|---|---|
| **≥ 90** | 🟢 Excellent | ship as-is — reliably makes an agent better |
| **75–89** | 🟢 Good | **the bar for "a good skill"** — shippable, minor polish only |
| **60–74** | 🟡 Needs work | real gaps; behaves inconsistently until fixed |
| **< 60** | 🔴 Not ready | rework before release |

**A good skill = score ≥ 75 AND no hard-gate ❌.** Push for **≥ 90** on skills that run often or
unattended, where inconsistency compounds.

### Worked example — scoring this repo's `skill_auditor`
(Demonstrates the rubric; also the result of this session's review.)

| Group | Earned / Max | Notes |
|---|---:|---|
| A · Triggering | 30 / 30 | rich triggers incl. Thai; clear *when-not* with redirects |
| B · Context economy | 20 / 20 | output templates pushed to detail file; 199L acceptable for an audit skill |
| C · Execution fidelity | 26 / 35 | C1 ✅10 · C2 ✅8 · **C3 ❌0 (no worked example)** · C4 ⚠️3 (no pre-delivery self-check) · C5 ✅3 · C6 ✅2 |
| D · Robustness | 12 / 15 | D1 ⚠️3 (framework source-of-truth/drift undeclared) · D2 ✅4 · D3 ✅5 |
| Over-constraint penalty | 0 | clean — 0 real BCs of its own |
| **Total** | **88 / 100** | **🟢 Good** — all hard gates pass |

**Lever to Excellent:** add the missing worked example (C3: +6 → **94**) — clears 90 on its own.

### One-line test of the whole skill
*Would an agent that has never seen this skill before, loading only its description and then its
body, (1) know to pick it, (2) have room left to think, and (3) be told exactly what to do, what to
run as code, and how to check the result — without being buried in rules that prevent no real
failure?* If yes on all four, it passes.

> Derived from `skill_authoring_principles.md` — read that for the *why* behind each weight.
