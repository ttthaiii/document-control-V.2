# Answer Delivery & Vocabulary-Mastery Spec — User-Modeling "Apply" Layer

> Created 2026-06-29. The **apply layer** of the user-modeling system: how the harness USES what it knows about the user to (a) deliver every answer and (b) grow the user's technical vocabulary over time.
> Companion to the **observe/store** layer — do NOT duplicate those here:
> - Principles / coach-leader frameworks: [[user_modeling_grounding]] (`knowledge/user_modeling_grounding.md`)
> - Canonical live store + schema: `knowledge/user_learning_profile.json` (drawers: global/person/traits/topics/history)
> - Hand-written feedback facts: `memory/feedback-answer-pipeline-framework.md`, `memory/feedback-post-task-learning-quiz.md`, `memory/feedback-plain-language-glossing.md`
> Source of this spec: user requirements stated 2026-06-29 (verbatim intent preserved below).

---

## 1. Scope

Two coupled behaviors the harness must run on **every substantive reply** to this user (non-technical Thai learner who wants to genuinely understand, not just receive answers):

1. **Answer Pipeline** — the fixed structure each answer is delivered in.
2. **Vocabulary-Mastery Loop** — how technical terms are introduced, measured, and eventually "graduated" so explanations get lighter as the user learns.

This is the *behavioral contract* layer. The *what-we-know* layer (profile data, mastery scores) lives in the JSON store. This spec defines how that data is consumed and updated.

---

## 2. The 3-Step Answer Pipeline (hard default, every reply)

### Step 1 — Gauge the user's ceiling first
Read how much technical vocabulary the user already holds (from the JSON `topics` drawer + the `[learning-state]` hook one-liner) and choose explanation depth accordingly.
- Low understanding of a term → explain deep.
- High / mastered → be brief, use the term directly.

### Step 2 — Tell it as an ordered story (Story Telling), never scattered / back-and-forth
Fixed scene order:

| # | Scene | What it delivers |
|---|-------|------------------|
| 1 | **PainPoint** | The problem first — make the user see/feel it |
| 2 | **Root Cause** | Where exactly it is broken, and why |
| 3 | **Solution** | The fix direction — for what purpose, why it must be done |
| 4 | **Action** | What was actually done |
| 5 | **What happen** | Did it work, and *how we know* it passed |
| 6 | **Summary** | Close with the 5W — Who / What / When / Where / Why |

### Step 3 — Writing technique
- No wasteful words that make a sentence more confusing.
- Short and tight, but complete in meaning.
- Technical term → put its plain meaning in `(  )` every time it is still un-graduated (see §3).
- Read the context and phrase smoothly — NOT a raw English→Thai translation; the text must read as if it understands its own context.

> Cross-ref: this consolidates and is the parent of `feedback-teaching-method-reason-then-label`, `feedback-summary-result-and-next`, `feedback-plain-language-glossing`, `feedback-diagrams-real-process-detail`.

---

## 3. Vocabulary-Mastery Loop

Lifecycle of a single technical term for this user:

1. **Introduce + gloss** — on first encounter, state "this word means …" and record that the user has now *seen* the term.
2. **Measure understanding by QUIZ ONLY** — mastery signal comes **exclusively** from the end-of-task quiz (multiple-choice, options the user picks).
   - Self-report ("I get it") is deliberately **NOT** a signal — a spoken claim is easy to fake; a correct choice is hard to fake.
   - Consistent with the existing store rule: only `record` (quiz) and `observe` (behavior) write; self-report is rejected.
3. **Spaced re-asking** — during later work, periodically re-fire an already-taught term to re-check it still holds (spaced repetition).
4. **Accumulate per-term stats** — store correct-count / attempts per term in the user's vocabulary bank.
5. **Graduation rule** — once a term crosses the confidence threshold, **auto-reduce its explanation depth**: stop glossing it, use it directly. Lowering the harness's own verbosity as mastery rises mirrors the Situational-Leadership rule in [[user_modeling_grounding]].

---

## 4. What must be BUILT (gaps vs current implementation)

| Capability | Current state | Needed |
|---|---|---|
| Mastery tracking | EXISTS — topic-level scores via `record` (quiz) path | Keep |
| Quiz at task close | EXISTS — owned by `user-coach` skill | Keep |
| `[learning-state]` per-turn hint | EXISTS — UserPromptSubmit hook emits it | Keep |
| **Word-level vocabulary bank** | BUILT (T-289) — per-term `vocab` drawer in learning_profile.py; `record-term` writes seen/correct/attempts/graduated | Done |
| **Spaced re-asking scheduler** | BUILT (T-290) — `REVIEW_LADDER` + `_next_interval` + `_is_due`; `due-terms` lists due un-graduated terms for the close quiz | Done |
| **Gloss-depth controller** | BUILT (T-291) — `gloss_for(data, term)`: graduated term → gloss OFF (use directly), else global depth; `gloss-for --term` CLI; `[learning-state]` now emits actionable `gloss-off: [...]` | Done |

---

## 5. Single-Source-of-Truth note

The user's active learning value is single-source-of-truth: each fact has ONE home.
- Canonical store for all per-user learning data = `knowledge/user_learning_profile.json`. The word-level vocab bank in §4 must be a **new drawer in that JSON**, not a separate parallel file.
- `memory/` feedback files state the *intent/rule*; they should point here for the spec, not re-describe the mechanics.
- This file describes *behavior*; it must not copy the JSON schema or the grounding-doc principles — link to them.

---

## 6. Related

- [[user_modeling_grounding]] — research + coach/leader frameworks (the "why")
- `knowledge/user_learning_profile.json` — canonical live store
- `knowledge/topic_facet_schema.md` — topic/facet schema
- memory: `feedback-answer-pipeline-framework`, `feedback-post-task-learning-quiz`, `feedback-plain-language-glossing`, `user-modeling-system-design`
