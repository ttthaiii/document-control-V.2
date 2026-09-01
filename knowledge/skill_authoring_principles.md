# Skill Authoring — Principles & Reasoning

> **Audience:** AI agents and humans who author or review Skills (SKILL.md packages).
> **Purpose:** explain *why* a good skill is shaped the way it is, grounded in how an LLM
> actually consumes and acts on instructions — so the reasoning transfers to new cases,
> not just the rules.
> **Companion:** `skill_quality_checklist.md` — the pass/fail review tool derived from this doc.
> **Last reviewed:** 2026-06-07

---

## 0. How to read this document

Each principle is written as **Principle → Why (model mechanic) → In practice → Failure mode.**

The "Why" is the part that matters. A rule without its reason is brittle: the moment a
situation falls outside the rule's wording, an agent has nothing to reason from. A *mechanic*
generalizes — understand it once and you can derive the right call in cases this doc never
anticipated. So read for the mechanics first; the rules are just their most common shadows.

---

## 1. The mental model — what a skill is from the model's side

A skill is **instructions + resources injected into a finite, attention-limited context
window, consumed by a probabilistic generator, and selected by a dispatcher that sees almost
nothing.** Every design choice below falls out of that one sentence.

Skills are delivered in three layers — **progressive disclosure** — because context is scarce:

| Layer | Content | Loaded when | Why this layer exists |
|---|---|---|---|
| **L1** | `name` + `description` | always resident | the only thing the dispatcher sees when choosing a skill |
| **L2** | body of `SKILL.md` | when the skill is triggered | the working procedure; competes for attention with the task itself |
| **L3** | bundled files (scripts, references, templates) | read on demand, by path | detail that would waste attention if always loaded |

The single most common authoring mistake is collapsing L3 into L2 — putting every reference
table and edge case in the body. It loads on every trigger and dilutes the attention available
for the actual task (see M1).

---

## 2. Core model mechanics — the "physics" every principle reduces to

These are facts about how the model works. Memorize these seven; the rest is derivation.

- **M1 · Attention is finite and competitive.** Every token present shapes the next-token
  distribution; irrelevant tokens dilute the signal from relevant ones. **Context is a budget,
  not free storage.**

- **M2 · Position is weighted (primacy/recency).** Tokens near the start and end of context
  get more weight than those buried in the middle ("lost in the middle"). Placement is a lever.

- **M3 · Generation is probabilistic and error compounds.** Each token is sampled. For a task
  that requires a long *exact* deterministic sequence (a precise transform, a hash, byte-exact
  output), per-token error probability accumulates over length. Code runs identically every
  time; the model does not.

- **M4 · The dispatcher sees only metadata.** When deciding *whether* to load a skill, only
  `name` + `description` are in view — never the body. A great body behind a vague description
  never fires; a sharp description fires at the right moment.

- **M5 · Examples set a strong prior (in-context learning).** A concrete input→output example
  shifts behavior more reliably than an abstract rule, because the model generalizes from
  demonstrated patterns far better than from descriptions of patterns.

- **M6 · Salience is diluted by volume and conflict.** Instruction-following degrades as the
  number of simultaneous hard rules grows, and conflicting rules force the model to spend
  capacity arbitrating instead of working. Marking *everything* `MUST` flattens the priority
  signal until nothing reads as truly mandatory.

- **M7 · The model defaults to the nearest training distribution.** Where a skill is silent,
  the model fills the gap with its prior — i.e. with "what's typical," which may not be "what's
  yours." Implicit assumptions resolve toward the generic, not the local convention.

---

## 3. The principles

### Group A — Triggering (get loaded at the right moment)

**A1 · The `description` is the highest-leverage field in the entire skill.**
- *Why (M4):* it is the only signal the dispatcher uses. Everything else is downstream of the
  skill being selected at all.
- *In practice:* write it in the third person for the *selector*, not for the end user, and
  cover four things — **what** it does, **when** to use it (with the words users actually type),
  **keywords/synonyms**, and **when NOT to use it** (a negative trigger that blocks false fires).
- *Failure mode:* vague description → the skill misses cases it should catch, or fires on cases
  it shouldn't and crowds out the right skill.

**A2 · One skill = one coherent capability.**
- *Why (M4):* a sharp capability boundary produces a sharp description, which produces precise
  dispatch. A "mega-skill" that does ten things has a blurry description and triggers
  unpredictably.
- *In practice:* if you cannot describe the trigger in one clean sentence, split the skill.
- *Failure mode:* over-broad skills fire too often, under-broad ones never get found.

**A3 · The `name` communicates function on sight.**
- *Why (M4):* the name is part of the selection signal and the human-readable index.
- *In practice:* lowercase-hyphenated, a verb/noun phrase that betrays the function, unique
  across the skill set.
- *Failure mode:* cryptic names force the dispatcher to lean entirely on the description and
  make collisions likely.

### Group B — Context economy (spend attention where it counts)

**B1 · The body is a router, not a database.**
- *Why (M1):* the body loads on every trigger and competes with the task for attention. Detail
  that isn't needed *every* time belongs in L3, reached by a path.
- *In practice:* keep the body lean (a few hundred lines at most); give an overview + a workflow
  + pointers to L3 resources. Move long reference tables, schemas, and edge-case catalogs out.
- *Failure mode:* a bloated body degrades performance on the very task it's meant to help.

**B2 · Tables and lists over prose.**
- *Why (M1):* structured form carries the same information in fewer tokens and is easier to
  operationalize than narrative paragraphs.
- *In practice:* comparison → table; sequence → numbered list; enumeration → bullets. Reserve
  prose for the rare case where structure genuinely can't capture the nuance.
- *Failure mode:* explanatory walls of text burn budget and bury the actionable parts.

**B3 · Front-load the critical constraints.**
- *Why (M2):* early context is weighted more heavily. A safety rule or hard precondition buried
  on the last line is the rule most likely to be under-weighted.
- *In practice:* put the most important constraint near the top; for a constraint that governs a
  specific step, *repeat* it at that step (point-of-use) rather than relying on the top mention.
- *Failure mode:* "but it says so at the bottom" — and the model didn't weight it.

### Group C — Execution fidelity (do the task correctly)

**C1 · Imperative, numbered steps with explicit decision points.**
- *Why (M1, M6):* ordered imperatives are directly operationalizable and reduce the arbitration
  the model would otherwise do to infer intent from description.
- *In practice:* number the steps; write them as commands; encode branches as `if X → Y, else Z`;
  mark explicit **stop-and-ask-the-user** points for judgment or risk.
- *Failure mode:* descriptive ("the skill handles…") rather than procedural prose leaves the
  order and the branch conditions to chance.

**C2 · Scripts for deterministic work; instructions for judgment.** ⭐
- *Why (M3):* anything that must be exact and repeatable (format conversion, hashing, schema
  validation, parsing) is where probabilistic generation leaks errors. A script executes
  identically every run; reserve the model's reasoning for the parts that genuinely need
  judgment.
- *In practice:* bundle a script and have the agent *run* it instead of performing the exact
  operation token-by-token in its head.
- *Failure mode:* "let the model hand-craft the exact output" — occasionally wrong, and the
  errors are silent.

**C3 · Show worked examples (and good-vs-bad pairs).**
- *Why (M5):* one concrete input→output demonstration calibrates the model more reliably than
  three paragraphs of rules.
- *In practice:* include at least one end-to-end example; where a distinction is subtle, contrast
  a correct and an incorrect case side by side.
- *Failure mode:* abstract-only guidance leaves the model guessing at the intended shape.

**C4 · Build verification into the workflow.**
- *Why (M3):* because generation can err, a skill that never checks its own output ships those
  errors. A verification step closes the loop.
- *In practice:* end the workflow with a concrete check — ideally a script or test to run, not a
  vibe-based "make sure it's right." Define what to do on failure (diagnose → retry once → stop
  and ask).
- *Failure mode:* "assume done" — defects pass straight through.

**C5 · State the failure modes / common mistakes.**
- *Why (M7, M5):* naming a likely wrong default pre-empts it; negative examples are informative
  precisely because they fence off the nearest-but-wrong behavior.
- *In practice:* a short "common mistakes" section listing the predictable errors and the right
  alternative.
- *Failure mode:* the model reaches for the generic approach the author knew was wrong here.

**C6 · Bound the scope — define what "done" means.**
- *Why (M1, M6):* without a stop condition the model tends to keep elaborating, spending budget
  and adding unrequested scope.
- *In practice:* say explicitly when the task is complete and what is out of scope.
- *Failure mode:* over-engineering; the skill does more than asked.

### Group D — Robustness (survive being run by someone with no context)

**D1 · Make the context self-contained.**
- *Why (M7):* the model does not share the author's internal context; silent gaps get filled
  with the generic prior, not the local convention.
- *In practice:* state internal conventions, naming, and assumptions — or link to a reference
  that does. Explicit beats implicit.
- *Failure mode:* the skill quietly assumes knowledge the running agent doesn't have.

**D2 · Every referenced path and link must resolve.**
- *Why:* a pointer to a missing script or doc is a dead end the agent can't recover from cleanly.
- *In practice:* verify bundled file paths exist and are spelled correctly.
- *Failure mode:* broken L3 reference → the workflow stalls.

**D3 · Reserve `MUST` / `NEVER` for genuine hard rules.**
- *Why (M6):* emphatic markers work by contrast. If most lines are emphatic, none of them are.
- *In practice:* use strong language only for correctness-, safety-, or irreversibility-critical
  rules; phrase the rest as normal guidance.
- *Failure mode:* `MUST`-inflation flattens priority and the truly mandatory rule gets the same
  weight as a style preference.

---

## 4. The meta-principle — do not over-constrain

This is important enough to stand on its own because it is **counterintuitive**: more rules
*feel* safer, but past a point they make the model **worse**, not better.

- *Why (M6):* every hard rule and every mandated ritual consumes attention budget and adds a
  constraint the model must continuously satisfy *while also doing the task*. When rules pile up
  or conflict, the model spends capacity on compliance arbitration instead of on the work, and
  the salience of any individual rule drops. Ceremony of the form "emit this exact token or it's
  a violation" is pure overhead from the model's side — it buys nothing toward task quality and
  taxes the attention that would have gone to the task.
- *The heuristic:* **constrain where correctness demands it — irreversibility, exactness,
  safety — and trust the model's default everywhere else.** Prefer prescribing *one clear way*
  over enumerating five options with caveats; ambiguity and over-specification both cost, in
  opposite directions, and the sweet spot is "minimal rules, maximally clear."
- *The test:* for each hard rule ask, "what concrete failure does this prevent, and is that
  failure likely?" If you can't answer crisply, it's probably ceremony — cut it.

---

## 5. Quick reference — principle → mechanic → one-liner

| # | Principle | Mechanic | One-liner |
|---|---|---|---|
| A1 | description is highest-leverage | M4 | what + when + keywords + when-not |
| A2 | one skill = one capability | M4 | sharp boundary → sharp dispatch |
| A3 | name communicates function | M4 | readable, unique, function-bearing |
| B1 | body is a router | M1 | overview + workflow + pointers, not a data dump |
| B2 | structure over prose | M1 | tables/lists carry more per token |
| B3 | front-load constraints | M2 | critical rules early + repeated at point-of-use |
| C1 | imperative numbered steps | M1, M6 | commands + explicit branches + stop points |
| C2 | scripts vs judgment | M3 | exact/repeatable → code; judgment → model |
| C3 | worked examples | M5 | one demo beats three rule paragraphs |
| C4 | embedded verification | M3 | a concrete self-check closes the loop |
| C5 | failure modes listed | M7, M5 | name the wrong default to pre-empt it |
| C6 | bound the scope | M1, M6 | define "done"; prevent over-reach |
| D1 | self-contained context | M7 | state conventions; explicit beats implicit |
| D2 | valid paths/links | — | dead pointers stall the workflow |
| D3 | reserve MUST/NEVER | M6 | emphasis works only by contrast |
| ★ | do not over-constrain | M6 | every rule is an attention tax — cut ceremony |

---

## 6. The bottom line

If you remember only three things:

1. **The `description` decides whether any of the rest ever runs** — invest there most (M4).
2. **Design for progressive disclosure — context is a budget** (M1): a lean routing body, detail
   pushed to L3, loaded on demand.
3. **Exact work → scripts; judgment → instructions** (M3) — and **don't over-constrain** (M6):
   rules that don't prevent a likely, concrete failure make the model worse, not safer.
