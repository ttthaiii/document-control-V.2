
## 2026-08-25 — T-012 RFI annotate(+attach)
- intent: give RFI file-open the RFA-style markup→attach; adapt to RFI's pick-action-first UX.
- outcome: single-file UI change (RFIDetailModal.tsx). Mounted shared PDFPreviewModal; saved
  marked-up file routes into the existing per-target temp-upload pipeline (accumulate). CM/asker
  click a PDF to annotate ('action'); SITE annotates via per-slot button (answer→bim, forward→cm;
  'both'→bim only). Non-PDF + history stay plain links. typecheck clean.
- friction: initial explore over-scoped it to "3 layers missing"; deeper grep showed only the
  editor (layer 1) was absent — temp-upload + server workflow-attach already existed. Shrank task ~4×.
- lesson: verify an explore agent's "what's missing" against the real call-path before planning;
  the cheapest layer to add is often the only one truly missing.
- promoted_patterns: reuse a sibling feature's finished component across modules via a structural
  type-superset cast, instead of re-implementing.

## 2026-08-25 — T-015 M1 Foundation (external approval chain)
- intent: additive config+types foundation for the CM→Designer/Owner→CM chain (RFA & RFI), zero runtime change, tsc-clean.
- outcome: done; 4 sections; tsc rc=0.
- friction: RFIParty is a VALUE union (ObjectValues), so Record<RFIParty,...> keys must be 'Designer'/'Owner', not 'DESIGNER'/'OWNER'. First edits used the object-key casing → 2 TS2561 + 1 TS2739. There were THREE RFIParty-keyed Records (LABELS, COLORS, PARTY_ROLES); the plan only foresaw LABELS.
- lesson: when extending a `Record<UnionOfValues, T>`, grep ALL `Record<Type` occurrences up front, and remember the key is the value not the enum-key. tsc is the reliable arbiter — one full run caught all three at once.
- promoted_patterns: keep new external roles OUT of APPROVER_ROLES (separate EXTERNAL_APPROVER_ROLES group) to avoid the CM-style permission leak.

## 2026-08-25 · T-015 M2 Backend — external approval chain (RFA & RFI)
- intent: server-side CM-forward → sequential Designer/Owner chain walk → return to CM final, INTERNAL cmSystemType only, both modules; bundle Task F revision-guard audit.
- outcome: DONE. 5 sections, tsc rc=0. RFA (imperative switch) + RFI (declarative transition table) both implemented from ONE shared chain algorithm in workflow.ts.
- friction: RFA moves files AFTER the switch → had to compute newStatus in-switch (file-independent via advanceExternalChain().done) then apply the step outcome (needs files) after the file-move block. Two different route architectures forced two different action shapes for the same behavior.
- lesson: when a shared behavior spans an imperative route and a declarative route, put the algorithm in pure helpers and let each route adapt the CALL SHAPE — do not try to unify the routes. Documented the RFI stepStatus divergence for M4 UI so the frontend does not assume RFA's 3-action shape.
- promoted_patterns: pure immutable chain helpers (advance never inspects status = reject-no-short-circuit enforced structurally, not by branching); viewer-serializer masks per-approver outcomes at the API boundary (visibility rule enforced server-side, not in UI).
- open: CM-final RFA file-requirement decision deferred to user (M4).

## T-015 M3 — Cloud Function CM-return notification (2026-08-25)
- intent: notify next Designer/Owner on chain advance (original M3 spec).
- outcome: scope SHRANK after user clarification — external gets NO push (they act in-system but coordinate externally), internal gets no heads-up. Real remaining gap = CM not told when chain RETURNS to CM. Delivered that for RFA (PENDING_CM_FINAL) + RFI (chain-complete detection, since RFI chain events leave status/awaitingCm untouched).
- friction: (1) plan task_id "T-015-M3" broke skeptical-gate — _active_task_id uses regex T-\d+ = "T-015", so frontmatter task_id MUST be "T-015" to match. (2) context-ceiling hit 200k mid-build → raised ack to 250k to finish. (3) spawn_gate needs a TASK-SCOPED proof (task_id field) for an inline-run model_low verify section.
- lesson: milestone task_ids must stay T-<digits> only (no -M<n> suffix) or gates mismatch. For a trivial inline verify (model_low), write a task_id-stamped cycle proof rather than fake-spawning.
- promoted_patterns: ask the channel/visibility question BEFORE planning notification work — it can collapse the whole scope (here M3 went from "notify external" to "notify CM on return").

## 2026-08-25 · RFA CM round-1 mode selector
- intent: fix confusing UX where CM saw approve buttons + forward panel stacked (5 buttons) at PENDING_CM_APPROVAL·INTERNAL.
- outcome: progressive-disclosure mode selector in RFADetailModal.tsx; tsc rc=0.
- friction: two isApproving declarations (helper + body) — needed extra context to disambiguate the Edit; ArrowLeft not pre-imported.
- lesson: when both canApprove & canForwardExternal are true only for CM round-1, a single derived flag (isCmRound1Choice) cleanly gates the merge and suppresses the originals — states are mutually exclusive by document status.
- promoted_patterns: derive one boolean for a "both-true" overlap state, then guard standalone panels with `&& !flag`.

## RFI CM mode-selector — 2026-08-25
- intent: mirror RFA CM round-1 progressive-disclosure selector into RFI CM modal.
- outcome: DONE, client-only in RFIDetailModal.tsx, tsc rc=0.
- friction: RFI reply requires a file (server requiresFiles:true) while RFA approve did not — the shared-file panel had to keep per-mode gating (reply file-required, forward file-optional). Forward handler was dropping files ([]) — fixed to buildPayloadFiles('action').
- lesson: when mirroring a UX pattern across two modules, re-check each module's server requiresFiles flags — they are NOT symmetric (RFA approve optional, RFI reply required).
- promoted_patterns: single derived boolean (showA && showB) to collapse a two-panel co-render into a 3-state disclosure; guard originals with && !flag rather than deleting (defensive).

## T-016 A2 — per-project approval-line templates + wire (2026-08-27)
- intent: make line templates per-project (keyed by site) AND actually used in the flow.
- outcome: done. Pure selector + IO resolver (B1), admin project dropdown (B2), FORWARD_EXTERNAL pre-fill + server seed fallback wired into RFA+RFI GET/POST + both modals (B3), reviewer 6/6 (B4). tsc rc=0.
- friction: Next.js route.ts export restriction (TS2344) forced the resolver into src/lib/utils; caught the pure/IO layering flaw in skeptical review before any edit.
- lesson: a single pure projection helper (externalChainConfigFromTemplate) keeps pre-fill and server-seed from diverging — the filter rule lives in one place.
- promoted_patterns: pure-selector + IO-helper split for anything workflow.ts adjacent; functional-setState guard (prev.length===0) for "seed once, never clobber".

## T-016 — configurable RFA approval line (2026-08-28)
- intent: rebuild the RFA approval line so the WHOLE line is admin-configurable, CM = just-another-stage; remove CM-sandwich hardcode + category dimension + redundant CM forward-picker; guarantee an un-deletable built-in default floor (แบบ ก); clean cutover (new docs only).
- outcome: 8 sections S1–S8 done. workflow.ts pure declarative transition table; layered resolve (project → system-doc → built-in floor); dispatch auto-seeds line, no picker; last stage → APPROVED; reject → REJECTED; PENDING_CM_FINAL kept-but-unreachable. Harness 7/7, tsc 0.
- friction: (1) getTemplateForDoc lost its category arg in S2 → out-of-scope rfi/[id]/route.ts broke tsc → justified compile-compat drop of the 3rd arg (no RFI behaviour change). (2) plan's S7 path was wrong (rfa/ vs shared/) + ExternalChainConfig turned out RFI-only → split S7, deferred the RFI-only file. (3) hit real context ceiling mid-S8 → persisted state, /compact, resumed clean.
- lesson: a shared-signature change ripples into out-of-scope callers — a "pure" refactor still forces compile-compat edits elsewhere; declare them as justified scope, don't silently absorb. Always independently re-verify a delegated worker's output (re-grep + tsc), never trust the report.
- promoted_patterns: layered resolve with a guaranteed built-in floor (never-empty config); declarative transition table keeps the workflow layer pure/IO-free; delegated verify-only reviewer with task_id-matched proof file.
- FOLLOW-UP (separate task): dashboard CM-as-stage list visibility (page.tsx:422 / RFA_CM_VISIBLE_STATUSES); RFI mirroring of the configurable-line refactor.

## T-025 follow-ups — 2026-09-01
- intent: 3 post-live-test fixes on the collaborative PDF markup editor (callout leader sync, close-confirm modal copy, remove save-draft button).
- outcome: all 3 done, tsc clean, user-confirmed live. ONE file: PDFPreviewModal.tsx.
- friction: spawn_gate MAIN_MARKERS needs the literal phrase "main context" (not just "MAIN"); scrutinize-gate today-set reset on session resume → had to reload scrutinize skill before [X].
- lesson: derived/non-persisted canvas pieces (leader Line + head Triangle, no id) must be RECONSTRUCTED at every display path from the one stored pin (calloutGeo), never persisted — reconstruct-on-display beats trying to sync id-less objects.
- promoted_patterns: ensureCalloutLeader idempotent-rebuild (hasLeader guard) reused across enlivenRemote + rehydrateCallouts.

## 2026-09-01 · T-018 P1 roles foundation
- intent: data-drive role→behaviour-group behind one accessor + add creator requiresSiteReview flag; preserve behaviour except approved Option B.
- outcome: roleRegistry.ts leaf + accessors; workflow.ts re-exports + derives arrays; routing reads the flag. tsc clean, parity test green.
- friction: the plan said "ROLES stays in workflow, registry imports it" — infeasible, creates a runtime value cycle once workflow imports the registry back. Resolved by making the registry the leaf that owns ROLES and having workflow re-export (API-preserving).
- lesson: when a new module must become the single source for a value another module already exports, the new module should OWN the primitive and the old one should re-export — anything else risks an init-order (TDZ) cycle. Decide leaf direction at plan time.
- promoted_patterns: registry-as-leaf + re-export shim for zero-consumer-change refactors; derive backward-compat arrays from the single source; parity test asserting set-equality of derived vs original.
