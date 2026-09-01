# Master Roadmap

> Status: `[ ]` pending -> `[/]` in progress -> `[X]` done

---

## T-000: Project initialized
- [X] T-000 · P2 · project scaffolded by project_init.py

---

# RFA technical debt — fix AFTER the RFI module ships

> Found while reading the RFA code as the template for RFI (Aug 2026).
> None of these are being fixed during RFI work: RFI is written correctly from the
> start, and touching the live RFA approval flow mid-build would make failures
> impossible to attribute. Design reference: the RFI design spec, sections 12-13.

## T-001: RFA workflow rules are declared in more than one place
- [ ] T-001 · P1 · depends_on: RFI module complete
    Title: Make the RFA workflow a single source of truth
    ContextTask: Discovered while writing `src/lib/config/rfi-workflow.ts`. RFI encodes its
      state machine as ONE declarative table (`RFI_TRANSITIONS` + `RFI_CREATE_ROUTES`) that
      the API route reads. RFA instead spreads the same knowledge across five places, so a
      rule change has to be made five times and drift is silent.
    Goal: One module owns each rule. Every consumer reads it instead of restating it.
    Known duplication sites:
      1. `src/app/api/rfa/[id]/route.ts:96-132` (GET builds `permissions`) vs `:211-245`
         (PUT re-checks `canPerformAction`) — the same cmSystemType / isCM / isReviewer
         branching written twice IN THE SAME FILE. Risk: they drift, and the UI then shows
         a button the API rejects, or hides one it would have accepted.
      2. `src/app/api/rfa/[id]/route.ts:251-259` `actionsRequiringFiles` vs
         `src/components/rfa/RFADetailModal.tsx:769-777` `actionsRequiringFile` — the same
         7-item list in two files. Currently identical; nothing keeps them that way.
      3. `src/lib/config/workflow.ts:77-96` `STATUS_LABELS` (11 RFA statuses) vs
         `on-rfa-update/src/index.ts:35-43` `RFA_STATUS_LABELS` (7 statuses).
         ALREADY DRIFTED — see T-001a. Currently dormant (only the INTERNAL-CM flow reaches
         the one missing status that matters, and no INTERNAL project exists yet), which is
         exactly the danger: silent drift that waits for a config change to become a bug.
      4. `src/lib/config/workflow.ts:65-73` `WR_STATUSES` (8 keys) vs
         `on-rfa-update/src/index.ts:11-19` (7 keys). ALREADY DRIFTED: `REJECTED_BY_BIM`
         is missing from the Cloud Function copy.
      5. `src/app/dashboard/rfa/page.tsx:286-302` maps status -> responsible party in a
         local switch — a fifth home for workflow knowledge.
      6. `toSlugId` + `ensureCategory` are inline in `api/rfa/create/route.ts:13-39`.
         A shared copy now exists at `src/lib/utils/category.ts` (written for RFI, so RFI
         did not author a second duplicate). Switching the RFA route to import from there
         is a pure extract-to-module change with no behaviour difference — the smallest
         piece of this task and a good place to start.
      7. The 8-item RFA-SHOP category list was inline in TWO places:
         `api/bim-tracking/categories/route.ts:9` and `components/rfa/CreateRFAForm.tsx:480`.
         It is now declared once as `RFA_SHOP_CATEGORIES` in `src/lib/config/workflow.ts`
         and the API route imports it (done while wiring RFI, which derives its discipline
         list from the same array). CreateRFAForm.tsx still has its own copy — it is live
         RFA UI, so it was left alone. Switching that one import is the remaining piece.
    Constraint that makes this non-trivial: `on-rfa-update/` is a SEPARATE npm package
      ("functions", its own package.json + tsconfig) and cannot import from the Next.js
      `src/`. The copies in sites 3 and 4 are a deliberate workaround, not carelessness.
      A real fix needs a shared module both builds consume, or a codegen step that emits
      the Cloud Function's constants from `src/lib/config/workflow.ts`. Deleting the copy
      is not an option on its own.
    How-Check: (a) grep shows each status label / action list / transition rule defined
      exactly once; (b) `npx tsc --noEmit` clean in BOTH packages; (c) change one status
      label in the source and confirm the LINE message text changes without editing the
      Cloud Function; (d) full RFA approval flow still passes end to end on both
      INTERNAL and EXTERNAL projects.
    Out-of-Scope: refactoring the RFI module (already single-source); changing any RFA
      status name or behaviour — this is a structural change only, behaviour must be
      identical before and after.
    Relate File: src/app/api/rfa/[id]/route.ts · src/components/rfa/RFADetailModal.tsx ·
      src/lib/config/workflow.ts · src/app/dashboard/rfa/page.tsx · on-rfa-update/src/index.ts

## T-001a: LINE would print a raw English status key (DORMANT — fires on the first INTERNAL-CM project)
- [ ] T-001a · P2 · depends_on: none (can ship before T-001)
    Title: Cloud Function status labels are missing PENDING_FINAL_APPROVAL
    ContextTask: Symptom of T-001 site 3, fixable on its own. `on-rfa-update/src/index.ts:203`
      renders `RFA_STATUS_LABELS[statusKey] || statusKey`, and the local map has only 7 of
      the 11 RFA statuses. Missing: PENDING_FINAL_APPROVAL, REVISION_REQUESTED, SUPERSEDED,
      SUSPENDED.
    Reachability (verified Aug 2026 — only ONE of the four can actually surface):
      - PENDING_FINAL_APPROVAL — REACHABLE, but only on projects with
        `cmSystemType: 'INTERNAL'` (`api/rfa/[id]/route.ts:291-293`). No such project exists
        in the system today, so the bug is DORMANT, not live.
      - REVISION_REQUESTED — NOT reachable. `request-supersede/route.ts:138` writes it into
        the `workflow[]` entry only, never to the document's top-level `status`.
      - SUPERSEDED / SUSPENDED — NOT reachable. They are written to the separate
        `supersededStatus` field (`[id]/route.ts:190, 424`), and `sendRfaLineNotification`
        only fires when top-level `status` changes, so a supersede does not even trigger it.
      The in-app UI is unaffected either way: it reads STATUS_LABELS from
      `src/lib/config/workflow.ts`, which has all 11.
    TRIGGER — fix this BEFORE creating the first `cmSystemType: 'INTERNAL'` project.
      Until then it costs nothing; from that moment every CM approval on that project posts
      "สถานะใหม่: PENDING_FINAL_APPROVAL" to its LINE group instead of
      "รอ SITE อนุมัติขั้นสุดท้าย".
    Goal: Every reachable RFA status renders its Thai label in LINE messages.
    How-Check: set a test project to cmSystemType INTERNAL, approve as CM, read the LINE
      message — it must show Thai, not the English key.
    Relate File: on-rfa-update/src/index.ts

## T-002: RFA file path falls back to a shared `temp/` folder
- [ ] T-002 · P2 · depends_on: none
    Title: Use runningNumber instead of 'temp' as the storage path fallback
    ContextTask: `src/app/api/rfa/[id]/route.ts:310` resolves the storage folder as
      `documentNumber || docData.documentNumber || 'temp'`. On projects where SITE assigns
      the document number, a BIM-created RFA has none yet, so any action taken before that
      (e.g. REQUEST_REVISION, which requires a file attachment) writes into
      `sites/{siteId}/rfa/temp/` — one shared folder for every document in the project.
      `create/route.ts:154` already does this correctly (`documentNumber || runningNumber`);
      only the PUT handler is inconsistent.
    Goal: Files always land in a folder scoped to their own document.
    Severity: medium-low. No data loss (filePath is stored in Firestore) and no name
      collisions (paths are timestamp-prefixed) — the damage is that files are unfilable
      and untraceable, and the folder cannot be cleaned up safely.
    How-Check: on a project without a document number, attach a file via "ขอแก้ไข" and
      confirm the stored `filePath` contains the runningNumber, not `/temp/`.
    Out-of-Scope: moving files already sitting in `temp/` — decide separately whether a
      one-off cleanup is worth it.
    Relate File: src/app/api/rfa/[id]/route.ts

## T-003: Approval sends the same push notification twice
- [ ] T-003 · P2 · depends_on: mobile push work (planned right after RFI)
    Title: Consolidate FCM notification logic into the Cloud Function only
    ContextTask: Two layers both send FCM on approval —
      `src/app/api/rfa/[id]/route.ts:439-466` (fires on the user's click, targets SE/FM) and
      `on-rfa-update/src/index.ts:245-292` (fires on document write, targets every user in
      the site, which includes SE/FM). SE and FM therefore receive two pushes per approval.
      LINE is NOT affected — it exists only in the Cloud Function.
      Also note `on-rfa-update/src/index.ts:228`: the comment says "SE และ FM" but the query
      has no role filter, so it sends to everyone in the site. Comment and behaviour disagree.
    Goal: Exactly one notification per event. Notification logic lives only in the Cloud
      Function, where a failure degrades to "no notification" instead of "cannot click".
    Note: RFI is already built this way — its API route contains no notification code, so
      RFI does not need this fix, only RFA does.
    How-Check: approve one RFA document and confirm each recipient's device receives
      exactly one push.
    Relate File: src/app/api/rfa/[id]/route.ts · on-rfa-update/src/index.ts

## T-004: RFA PUT is not atomic across Storage and Firestore
- [ ] T-004 · P2 · depends_on: none
    Title: Make the status change and file move recoverable as one unit
    ContextTask: `src/app/api/rfa/[id]/route.ts` moves files with
      `adminBucket.file().move()` and then updates Firestore. If a move throws partway
      through the loop, some files have moved and the status has not changed.
    Goal: A failed action leaves no partial state.
    Severity: low, and it has never surfaced — the code moves every file BEFORE the
      Firestore update, so the failure mode is "nothing changed, click again" rather than
      corrupted data.
    Constraint: Firestore and Cloud Storage are separate systems; a single transaction is
      not possible. A real fix needs compensating logic (move files back when the update
      fails) or a two-phase write, so this is a design task, not a patch.
    How-Check: inject a failure into the move loop and confirm the document is left in its
      original state with no orphaned files.
    Relate File: src/app/api/rfa/[id]/route.ts

---

# RFI deferred features

## T-005: Overdue-RFI reminder
- [ ] T-005 · P2 · depends_on: RFI module complete
    Title: Scheduled function that notifies when an RFI passes its due date
    ContextTask: RFI has a `dueDate` field (RFA has none), and the list view shows an
      "เกิน N วัน" badge. There is no reminder because nothing in v2 sends notifications on
      a schedule — every existing notification is triggered by a document write, so there
      is no template to copy.
    Goal: A daily sweep notifies whoever is currently responsible for each overdue RFI.
    How-Check: set a dueDate in the past, wait for the scheduled run, confirm the LINE
      message reaches the project group and names the responsible party.
    Relate File: on-rfi-update/src/index.ts (new scheduled function)

---

# Shared-component refactor — found while comparing RFA vs RFI

> Found by reading CreateRFAForm.tsx (808L) and CreateRFIForm.tsx (804L) in full, plus an
> Explore-agent audit of RFADetailModal/RFIDetailModal/WorkRequestDetailModal/
> AcceptWorkRequestModal, after the user asked why RFI didn't reuse RFA's create modal.

## T-006: Shared component extraction across RFA/RFI/WorkRequest
- [ ] T-006 · P2 · depends_on: RFI manual testing complete (avoid editing files under active test)
    Title: Extract file-upload, workflow-timeline, scroll-lock, and confirmation-modal-shell duplication
    ContextTask: near-byte-identical logic duplicated across documents:
      1. Temp file upload: `uploadTempFile`/`handleFileUpload`/`removeFile` + Storage path
         pattern `temp/${user.id}/${timestamp}_${originalName}` — duplicated in RFADetailModal,
         CreateRFAForm, RFIDetailModal, CreateRFIForm, WorkRequestDetailModal.
      2. Workflow timeline rendering — duplicated in RFADetailModal, RFIDetailModal,
         WorkRequestDetailModal.
      3. CreateRFAForm and CreateRFIForm both hand-roll a scroll-lock effect instead of using
         the existing `useScrollLock` hook that the detail modals already use.
      4. Confirmation-modal outer shell (overlay + header "ยืนยันข้อมูล" + close button +
         footer "กลับไปแก้ไข"/"ยืนยันและสร้างเอกสาร") is duplicated in both create forms —
         only the middle field list actually differs per document type.
    Goal: Extract (1) as `useTempFileUpload` hook + `<FileUploadSlot>` component (~350-450
      line savings across 5 files), (2) as `<WorkflowTimeline>` component (~130-150 line
      savings across 3 files), (3) swap in the existing `useScrollLock` hook, (4) extract the
      confirmation-modal shell as a small wrapper component taking the field-list as children.
    Out-of-Scope: a unified `DetailModal` or unified `CreateDocumentForm` across RFA/RFI/
      WorkRequest — their permission models (RFA hybrid role+API / RFI pure API-computed /
      WorkRequest pure client-role), action sets, and field sets are genuinely different, not
      just superficially — confirmed by full-file reads, not assumed.
    How-Check: after each extraction, both RFA and RFI create/detail flows render and submit
      identically to before (manual click-through); no behavior change, only line-count drop.
    Relate File: src/components/rfa/CreateRFAForm.tsx · src/components/rfi/CreateRFIForm.tsx ·
      src/components/rfa/RFADetailModal.tsx · src/components/rfi/RFIDetailModal.tsx ·
      src/components/work-request/WorkRequestDetailModal.tsx ·
      src/components/work-request/AcceptWorkRequestModal.tsx

---

## T-007: CM dashboard only shows documents that have reached CM
- [X] T-007 · P1 · depends_on: none · done 2026-08-21 · attempts:1 · tool_calls:9
    Verified: `tsc --noEmit` clean. Manual click-through (create as BIM/SITE/ME/SN →
      forward to CM → login as CM → sees only forwarded docs; CM replies → doc closes →
      still visible as history; open a non-CM doc's URL directly as CM → 403) is still
      pending — user has not run it yet (see note below).
    Title: Restrict the RFI dashboard + API + Firestore rules so a CM-role user only
      ever sees RFI documents that have actually reached CM
    ContextTask: RFI has internal loop statuses (PENDING_SITE, PENDING_SITE_MORE_INFO)
      that exist before a question is ever forwarded to CM. The RFI dashboard
      (dashboard/rfi/page.tsx) queried every status for every role with no filtering at
      all — a CM user saw the full internal back-and-forth, which should never reach
      them. RFA has the equivalent gap but is out of scope for this task (user asked to
      do RFI first).
    Goal: A CM-role user sees only RFI documents relevant to them — currently pending
      with CM, or previously answered by CM (kept as history) — enforced at three
      layers: Firestore security rules (real access control, not just UI), the
      dashboard's live query, and the single-document API route (which uses the Admin
      SDK and so bypasses firestore.rules — needs its own guard against a CM user
      opening a non-CM document's URL directly).
    Design note: `status === 'PENDING_CM'` / `awaitingCm` alone cannot express "CM was
      ever involved" — CM_REPLY clears `awaitingCm` back to `false` and moves `status`
      to `CLOSED`, which is indistinguishable from a document SITE closed without ever
      reaching CM. Solved with a new sticky field `cmInvolved: boolean`, set true the
      moment a document first becomes CM-relevant and never reset back.
    Out-of-Scope: RFA (has the same gap, not done here) · backfilling `cmInvolved` on
      existing RFI documents (user confirmed current data is emulator/test data that
      will be wiped, so no migration was written).
    How-Check: `grep -rn "cmInvolved" src/ firestore.rules firestore.indexes.json` shows
      all 6 sites updated · `tsc --noEmit` clean · firestore.rules and
      firestore.indexes.json changes deployed to Firebase (`firebase deploy --only
      firestore:rules,firestore:indexes` — NOT run yet, needs user's explicit go-ahead
      since it affects the live security rules) · manual click-through per Verified
      above, not yet run by the user.
    Relate File: src/app/api/rfi/create/route.ts · src/app/api/rfi/[id]/route.ts ·
      src/app/dashboard/rfi/page.tsx · src/types/rfi.ts · firestore.rules ·
      firestore.indexes.json

---

## T-008: CM dashboard only shows RFA documents that have reached CM (+ fixed an APPROVE routing bug found along the way)
- [X] T-008 · P1 · depends_on: none · done 2026-08-21 · attempts:1 · tool_calls:6
    Verified: `tsc --noEmit` clean. Manual click-through still pending (user hasn't run
      it yet) · firestore.rules/firestore.indexes.json deploy still pending (user
      deploys manually, same as T-007).
    Title: Extend the T-007 CM-visibility filter to RFA, and fix a status-routing bug
      in the CM approval flow discovered while designing it
    ContextTask: Same problem as T-007 (RFI) — the RFA dashboard queried every status
      for every role with no filtering, so CM saw internal-only statuses
      (PENDING_REVIEW, REVISION_REQUIRED). While tracing RFA's INTERNAL-CM approval
      flow to design the filter, the user identified that plain `APPROVE` incorrectly
      routed into the round-2 SITE final-check loop (PENDING_FINAL_APPROVAL) the same
      as `APPROVE_WITH_COMMENTS` — it should finalize immediately to APPROVED like
      REJECT already does, since a plain approval has nothing ambiguous for SITE to
      double-check. Only APPROVE_WITH_COMMENTS should loop, because SITE has to decide
      revision-required-or-not for the comment.
    Goal: (1) Fix api/rfa/[id]/route.ts so APPROVE finalizes immediately at every round
      — this also makes PENDING_FINAL_APPROVAL unambiguous (reachable only via
      APPROVE_WITH_COMMENTS round 1), so no new status value was needed. (2) Restrict
      CM to RFA_CM_VISIBLE_STATUSES (PENDING_CM_APPROVAL, PENDING_FINAL_APPROVAL,
      APPROVED, APPROVED_WITH_COMMENTS, APPROVED_REVISION_REQUIRED, REJECTED) at the
      same three layers as T-007: firestore.rules, the dashboard query, and a
      defense-in-depth GET guard (RFA's GET route had none at all before this, unlike
      RFI's).
    Design note: unlike RFI, RFA never moves a document's status BACK to
      PENDING_REVIEW/REVISION_REQUIRED once it reaches CM — a new revision creates a
      brand-new document instead of resetting the old one — so a plain status
      whitelist is a safe permanent per-document test. No sticky `cmInvolved`-style
      field was needed for RFA. A fresh revision document legitimately starts at
      PENDING_REVIEW again and so is correctly hidden from CM until resubmitted —
      that's intended, not a gap (T-006/T-001 already track the create_revision
      flow separately if a cross-revision "CM's history" view is ever wanted).
    Out-of-Scope: RFA's EXTERNAL-CM flow was not touched (Reviewer already acts in
      place of CM there, no code path changed) · did not audit create_revision's
      initial status assignment for the same bug pattern — flagged for T-001 if the
      "single source of truth" rework touches this file.
    How-Check: `grep -n "PENDING_FINAL_APPROVAL" src/app/api/rfa/[id]/route.ts`
      shows APPROVE_WITH_COMMENTS as the only case setting it · `tsc --noEmit` clean ·
      firestore.rules/firestore.indexes.json deployed (pending, user deploys
      manually) · manual click-through (CM approves plain -> immediate APPROVED, no
      SITE loop · CM approves-with-comments -> SITE sees PENDING_FINAL_APPROVAL ->
      resolves to APPROVED_WITH_COMMENTS or APPROVED_REVISION_REQUIRED · CM dashboard
      shows only CM-relevant statuses · opening a non-CM RFA URL as CM -> 403) not
      yet run by the user.
    Relate File: src/lib/config/workflow.ts · src/app/api/rfa/[id]/route.ts ·
      src/app/dashboard/rfa/page.tsx · firestore.rules · firestore.indexes.json

---

## T-010: LINE notification audience split — CM gets a separate group; internal loop stays hidden
- [X] T-010 · P1 · depends_on: T-007, T-008 · done 2026-08-24 · attempts:1 · tool_calls:~30
    Title: Separate LINE group for CM on INTERNAL projects + a dedicated RFI notification function
    ContextTask: One project = one LINE group, so putting CM in it leaked the internal BIM<->SITE
      loop. INTERNAL projects now carry a second group id (LineGroupID_CM) notified ONLY on
      CM-relevant events. RFI had no LINE notifications at all.
    Goal: The internal loop is never visible to CM. CM sees only: RFA {PENDING_CM_APPROVAL,
      PENDING_FINAL_APPROVAL, APPROVED, REJECTED} (round-2 comment split collapses to
      "อนุมัติตามคอมเมนต์"); RFI forward-to-CM ("รอดำเนินการ") + close-after-CM ("ตอบกลับแล้ว").
      PENDING_FINAL_APPROVAL text differs per group: internal="รอ SITE อนุมัติขั้นสุดท้าย",
      CM="อนุมัติตามคอมเมนต์". Empty LineGroupID_CM = skip (same convention as LineGroupID).
    How-Check: npx tsc --noEmit (both src/ and on-rfa-update) → clean ✅. Post-deploy: on an
      INTERNAL project with LineGroupID_CM set, CM group receives ONLY the statuses above.
    Note: Partially addresses T-001a (DORMANT) — the CF RFA_STATUS_LABELS was missing
      PENDING_FINAL_APPROVAL and now has it, so that status no longer prints as a raw key.
    Relate File: src/components/admin/ProjectFormModal.tsx · src/app/api/admin/projects/route.ts ·
      src/app/api/admin/projects/[id]/route.ts · on-rfa-update/src/index.ts
    Deploy: firebase deploy is the USER's task (S2 modifies onRfaUpdate; S3 adds new onRfiUpdate).

---

## T-011: Hide internal-loop workflow-history steps from CM (RFA + RFI detail modals)
- [X] T-011 · P1 · depends_on: T-010 · done 2026-08-24 · attempts:1 · tool_calls:~20
    Title: CM workflow-history (ประวัติการดำเนินงาน) must not show internal BIM<->SITE loop steps
    ContextTask: The in-app history modal filtered CM's view by status only, so it leaked
      internal steps: RFA showed SITE's round-2 step (PENDING_FINAL_APPROVAL / APPROVED_WITH_COMMENTS
      / APPROVED_REVISION_REQUIRED) done AFTER CM decided; RFI showed SITE's direct ANSWER
      (closes to CLOSED, which the status-only filter missed).
    Goal: CM sees only CM-relevant history + its own steps. RFA hides the round-2 internal
      statuses unless role===CM; RFI additionally hides the ANSWER / REQUEST_MORE_INFO actions
      unless role===CM. Display-only; no data-model / API / CF change.
    How-Check: npx tsc --noEmit (src/) → clean. Visual: open a round-2 RFA / re-opened RFI as
      CM — internal SITE steps no longer appear; CM's own steps still show.
    Relate File: src/components/rfa/RFADetailModal.tsx · src/components/rfi/RFIDetailModal.tsx
    Deploy: client-side only — ships with the next web app deploy (USER's task); no functions deploy.

## T-012: RFI document-open annotate(+attach), RFA-adapted to RFI's pick-action-first UX
- [X] T-012 · P1 · depends_on: none · done 2026-08-25 · attempts:1 · tool_calls:~22
    Title: Bring RFA's annotate→attach capability to RFI file-open (was preview-only)
    ContextTask: RFI opened current-step files as plain preview links; RFA opens them in a
      markup editor (draw/sign) whose saved file becomes an attachment for the next action.
      RFI's temp-upload pipeline + server workflow-attach already existed — only the editor
      (layer 1) was missing. RFI cannot be identical to RFA because it forces the user to pick
      an action mode BEFORE the upload slot appears (mode-select-first).
    Goal: mount the shared PDFPreviewModal in RFIDetailModal; route its saved (marked-up) file
      into the existing per-target temp-upload pipeline (accumulate, never replace). Entry points:
      CM/asker click a PDF in "ไฟล์แนบล่าสุด" to annotate (unambiguous 'action' slot, RFA-like);
      SITE annotates via a per-slot "เปิด+ขีดเขียนเอกสารเดิม" button so the file lands in the
      correct slot (answer→bim, forward→cm; 'both' → bim slot only, CM-forward stays separate).
      Non-PDF + history modal stay plain preview links. Single file, no backend/API/type change.
    How-Check: npx tsc --noEmit → clean (done). Visual QA: per role (CM, SITE answer/forward/both,
      asker) open a PDF → editable editor → save → file appears in the correct slot → submit attaches.
    Relate File: src/components/rfi/RFIDetailModal.tsx (only) · reuses src/components/rfa/PDFPreviewModal.tsx
    Deploy: client-side only — ships with the next web app deploy (USER's task); no functions deploy.

- [X] T-013 · P1 · depends_on: T-007 · done 2026-08-25 · attempts:1 · tool_calls:~30
    Title: Scope CM's RFI chart+filter to CM statuses; block CM from Dashboard & Work Request
    ContextTask: CM's RFI dashboard showed all 4 statuses in the status donut + filter dropdown,
      and the sidebar exposed Dashboard (/dashboard) + Work Request (/dashboard/work-request) to
      CM even though CM should not use them. User-confirmed CM-relevant statuses = PENDING_CM +
      CLOSED; blocking = hide menu AND redirect on direct-URL access.
    Goal: (1) add RFI_CM_STATUSES=[PENDING_CM,CLOSED] (rfi-workflow.ts, single source); DashboardStats
      gains optional `statuses?` prop; rfi/page.tsx picks the list by role for both the chart and the
      status filter dropdown (non-CM unchanged, all 4). (2) Sidebar hides Dashboard + Work Request when
      role=CM; AuthGuard gains additive blockedRoles/blockedRedirectTo (router.replace, loader while
      redirecting); /dashboard + /dashboard/work-request pass blockedRoles={['CM']} → CM redirected to
      /dashboard/rfi. No backend/API/Firestore-rules change (CM visibility already exists, T-007).
    How-Check: npx tsc --noEmit → clean (done). Visual QA: CM sees only PENDING_CM+CLOSED in chart+filter;
      CM sidebar has no Dashboard/Work-Request; CM hitting those URLs redirects to /dashboard/rfi; non-CM
      roles fully unchanged.
    Relate File: src/lib/config/rfi-workflow.ts · src/components/rfi/DashboardStats.tsx ·
      src/app/dashboard/rfi/page.tsx · src/components/layout/Sidebar.tsx ·
      src/lib/components/shared/AuthGuard.tsx · src/app/dashboard/page.tsx · src/app/dashboard/work-request/page.tsx
    Deploy: client-side only — ships with the next web app deploy (USER's task); no functions deploy.

- [X] T-014 · P1 · depends_on: T-008, T-013 · done 2026-08-25 · attempts:1 · tool_calls:~28
    Title: Scope CM's RFA chart+filter to CM statuses (collapse internal round-2 statuses)
    ContextTask: RFA counterpart of T-013. CM's RFA status donut + filter dropdown still showed
      SITE-internal statuses (esp. PENDING_FINAL_APPROVAL "รอ SITE อนุมัติขั้นสุดท้าย") and the
      raw APPROVED_WITH_COMMENTS label. The CM data query was already scoped
      (RFA_CM_VISIBLE_STATUSES) and the table already CM-collapsed — only the chart + filter had
      not been wired to the existing CM collapse. User-confirmed = COLLAPSE (not hide) so the
      document count/TOTAL stays truthful (folded docs still counted).
    Goal: (1) add RFA_CM_FILTER_STATUSES=[PENDING_CM_APPROVAL,APPROVED,APPROVED_WITH_COMMENTS,
      REJECTED] (workflow.ts, single source, matches normalizeRfaStatusForRole collapse).
      (2) rfa/DashboardStats gains optional userRole prop → groups counts by
      normalizeRfaStatusForRole + labels via getRfaStatusLabelForRole (no-op for non-CM).
      (3) rfa/FilterBar gains optional statusLabels prop (default STATUS_LABELS).
      (4) rfa/page.tsx: availableStatuses returns RFA_CM_FILTER_STATUSES for CM; status filter
      matches on normalized status for CM; status→responsibleParty auto-sync skipped for CM (else
      double-filter drops folded docs); passes userRole to DashboardStats + displayStatusLabels to
      FilterBar. No backend/API/Firestore-rules/data-query change.
    How-Check: npx tsc --noEmit → clean (done). Visual QA (CM): chart shows only 4 buckets, no
      "รอ SITE อนุมัติขั้นสุดท้าย", TOTAL unchanged; filter dropdown = same 4; clicking the
      "อนุมัติตามคอมเมนต์" slice lists all folded docs; non-CM roles fully unchanged.
    Relate File: src/lib/config/workflow.ts · src/components/rfa/DashboardStats.tsx ·
      src/components/rfa/FilterBar.tsx · src/app/dashboard/rfa/page.tsx
    Deploy: client-side only — ships with the next web app deploy (USER's task); no functions deploy.

---

## Small-Tasks Pool (T-299 grain — <3 steps AND simple, single file)
- [ ] T-031 · P2 · depends_on: none
  Title: Admin user-data edit page — add name editing for existing users
  ContextTask: The only place a user `name` is set today is the invitation flow (invitation-service.ts:87). src/app/admin/users is a view-only list (name shows as `user.name || '-'`) with Permission + Site modals only; src/app/api/admin/users has GET only. Deferred from T-030 (user: production invite already captures ชื่อ-นามสกุล, so an edit page can wait). T-030 already resolves the current users.name at display, so filling a name will retroactively fix the RFA access log.
  Goal: Let an admin edit an existing user's name — a PATCH /api/admin/users handler (update the users doc `name`, admin-role guarded) + an inline/modal name editor on the admin/users page.
  How-Check: edit a user's name in admin/users → users doc `name` updates → RFA access log for that user shows the name (via T-030 enrichment) · npx tsc --noEmit → 0.
- [X] T-030 · done 2026-09-01 · attempts:1 · RFA access-log name resolution + header alignment — (1) read-time enrichment in GET /api/rfa/[id]/activity: batch getAll authors' users docs → userName = users.name || stored userName || email, so any account WITH a name shows it retroactively (root cause: thai.l@/thai.bim@ accounts have no `name` in users doc + no Auth displayName — created outside the invitation flow; production invited users do carry names). (2) access-log grid headers + data centered, date column no longer flush-right (RFADetailModal.tsx). Admin user-name edit page deferred → T-031. How-Check: npx tsc --noEmit → 0. Follows T-029.
- [X] T-029 · done 2026-09-01 · attempts:1 · Polish RFA per-milestone access log — (1) sort events newest→oldest within each milestone (accessLogGrouping.ts bucket sort → DESC), (2) aligned CSS-grid columns + header (ชื่อ-นามสกุล · ตำแหน่ง · การดำเนินการ · ไฟล์ · วันที่) replacing the flex list (RFADetailModal.tsx), (3) full name already shows (userName=users.name — no code change), (4) per-file remark via metadata.fileName added at 6 file-action log sites (old logs show "—"). How-Check: node DESC sort test → PASS · grep "metadata:.*fileName" RFADetailModal.tsx → 6 · npx tsc --noEmit → 0. Follows T-027/T-028.
- [X] T-028 · done 2026-09-01 · attempts:1 · Hide VIEW_DETAIL from RFA access log — removed 'VIEW_DETAIL' from ACCESS_ACTIONS Set (src/lib/rfa/accessLogGrouping.ts) so the per-milestone "ผู้เข้าถึงเอกสาร" list measures "saw the doc" by file-open (PREVIEW_FILE) not detail-modal open. Logging kept (admin activity dashboard + SmartRFAModal/WorkRequestDetailModal still use VIEW_DETAIL). How-Check: grep "'VIEW_DETAIL'" accessLogGrouping.ts → 0 · npx tsc --noEmit → 0. Follows T-027.
- [X] T-017 · done 2026-08-28 · attempts:1 · CM dashboard external-in-progress filter — added STATUSES.PENDING_EXTERNAL_APPROVAL to RFA_CM_FILTER_STATUSES (src/lib/config/workflow.ts). How-Check: tsc 0 · status present in array · PENDING_CM_FINAL absent. Follows T-016.

- [X] T-SP-02 · P1 · depends_on: none · done 2026-08-25 · attempts:1 · tool_calls:~10
    Verified: npx tsc --noEmit → clean · grep "isLocked|เปลี่ยนวิธีดำเนินการ" → 0
    Title: Let RFI SITE action-mode be switched directly (was locked after first pick)
    ContextTask: RFIDetailModal SITE panel locked the other two mode buttons
      (disabled={isLocked}) once one mode was picked; switching required an
      undiscoverable "เปลี่ยนวิธีดำเนินการ" link, so users perceived the mode as
      un-changeable (clicked wrong mode, could not switch to forward-CM).
    Goal: remove the isLocked disable/styling so all 3 mode buttons stay clickable
      (keep active highlight); remove the now-redundant change link.
      File: src/components/rfi/RFIDetailModal.tsx. Safe: each submit handler sends
      only its own target's files, so switching never mis-submits staged files.

- [X] T-SP-01 · P2 · depends_on: none · done 2026-08-21 · attempts:1 · tool_calls:8
    Verified: grep -rn "PENDING_ASKER" src/ → 0 matches · npx tsc --noEmit → clean
    Title: Remove deprecated RFI_STATUSES.PENDING_ASKER entirely
    ContextTask: No transition sets PENDING_ASKER anymore (superseded by direct
      SITE/CM routing); it was kept only so legacy Firestore documents from before
      that change could still resolve a label. User confirmed (2026-08-21) current
      documents in this status are emulator test data only and will be wiped on
      next emulator reset, so the backward-compat shim is no longer needed.
    Goal: delete RFI_STATUSES.PENDING_ASKER, its label/color entries, the two
      transition rules keyed off it (`from: [...PENDING_ASKER...]`), and the
      related comments in src/lib/config/rfi-workflow.ts. Confirmed single-file —
      grep across src/ found zero references outside this file.
    How-Check: `grep -rn "PENDING_ASKER" src/` returns no matches · `tsc --noEmit`
      clean · RFI_ACTIVE_STATUSES / RFI_STATUS_LABELS / RFI_STATUS_COLORS still
      contain exactly the 4 live statuses (PENDING_SITE, PENDING_SITE_MORE_INFO,
      PENDING_CM, CLOSED).
    Relate File: src/lib/config/rfi-workflow.ts

- [ ] T-018 · P1 · depends_on: T-016
    Title: Runtime follows the configured approval line (line-approve redesign)
    ContextTask: RFA_TRANSITIONS drives the flow by hardcoded (action,status,rfaType)
      rules, NOT the T-016 configured line template. Redesign makes roles/behaviour
      data-driven and the runtime follow the per-document line. Design source of truth:
      docs/design/line-approve-redesign.md. INTERNAL cmSystemType only.
    Goal: phased — P1 roles foundation (central role registry + Creator requiresSiteReview
      flag) · P2 runtime follows configured line · P3 sub-line + send-time To/CC recipients ·
      P4 Excel/CSV bulk import · P5 T-026 markup cleanup after final approval.
    How-Check: P1 → `npx tsx scripts/test-role-registry.ts` green + `npx tsc --noEmit`
      clean; roleRegistry.ts is the single role source; behaviour parity except the
      agreed ME/SN Option B change.
    Progress: [X] P1 Roles foundation (2026-09-01 · roleRegistry.ts leaf owns ROLES +
      behaviour-group registry + accessors + requiresSiteReview; workflow.ts re-exports;
      ME/SN skip Site for all rfa types = Option B; tsc clean, parity test green) ·
      [ ] P2 · [ ] P3 · [ ] P4 · [ ] P5
    Relate File: src/lib/config/roleRegistry.ts · src/lib/config/workflow.ts ·
      scripts/test-role-registry.ts · docs/design/line-approve-redesign.md

- [ ] T-015 · P1 · depends_on: none
    Title: Configurable external multi-level approval chain (CM → Designer/Owner → CM)
    ContextTask: Today the external side is just "send to CM to approve". Reality has
      CM + Designer + Owner. CM forwards a document (per document, at review time) to a
      configurable sequential chain of Designer and/or Owner; a reject does NOT
      short-circuit — the whole chain runs, then the document returns to CM for the
      final decision. INTERNAL cmSystemType sites only. Applies to BOTH RFA and RFI.
      SITE/BIM see only the granular location (at Designer / at Owner) + the final CM
      decision, never per-approver outcomes.
    Goal: deliver in milestones — M1 Foundation (roles + externalChain data model +
      new RFA statuses; config/types only) · M2 Backend (CM forward action, chain
      walking, transitions + server-side permissions) · M3 Cloud Function (notify
      Designer/Owner, respect internal visibility) · M4 UI (CM forward dialog,
      Designer/Owner views, location display, timeline filtering) · M5 admin user
      management for Designer/Owner per site.
    How-Check: M1 → `npx tsc --noEmit` clean with ROLES.DESIGNER/OWNER,
      EXTERNAL_APPROVER_ROLES (NOT in APPROVER_ROLES), ExternalChain model,
      PENDING_EXTERNAL_APPROVAL/PENDING_CM_FINAL statuses, RFADocument.externalChain?,
      RFIDocument.externalChain?, RFI Designer/Owner parties. (M1 done 2026-08-25.)
    Progress: [X] M1 Foundation (2026-08-25) · [X] M2 Backend (2026-08-25) · [X] M3 Cloud Function (2026-08-25) · [X] M4 UI (2026-08-25 · RFA+RFI external-chain panels; runtime-verify pending user deploy) · [ ] M5
    Relate File: src/lib/config/workflow.ts · src/types/rfa.ts ·
      src/lib/config/rfi-workflow.ts · src/types/rfi.ts

- [X] T-016 · P1 · depends_on: none · done 2026-08-28
    Title: Make the approval line (line approve) configurable instead of hard-coded
    Progress: [X] Phase A role-level MAIN line (admin templates + per-doc override + send-back) · [X] Phase A2 per-project template (keyed by site) + wired into flow (FORWARD_EXTERNAL pre-fill + server seed fallback via getTemplateForDoc/seedChainFromTemplate; cmSystemType EXTERNAL inert) — done 2026-08-27, tsc rc=0, reviewer 6/6. Parent stays open for any further phases.
    ContextTask: Today the RFA/RFI approval line is HARD-CODED in
      src/lib/config/workflow.ts — CREATOR_ROLES / REVIEWER_ROLES / APPROVER_ROLES and
      the fixed status transitions bake ONE approval sequence into code that is shared by
      every site and every document type (RFA-SHOP / RFA-MAT / RFA-GEN all run the same
      line). The only per-document flexibility that exists is the external Designer/Owner
      chain (T-015, configureExternalChain), and even that is limited to the external leg.
      Changing who approves, in what order, or making the line differ by document
      type/category/site currently requires a developer to edit code and redeploy.
    WhyChange: benchmarked against Conzol/QConZoL and Procore (2026-08-26). Both let the
      approval line be CONFIGURED (Procore: sequential vs parallel workflow set in the UI
      per submittal; Conzol: customizable approval/distribution matrix). Hard-coding blocks
      reuse across projects/orgs (each new client with a different sign-off chain = a code
      change) and cannot express real needs like "material RFA must pass ME but shop need
      not" or per-site chains. Moving the line out of code into admin-editable config is the
      single highest-value gap to close for multi-project use — the approval LOGIC itself
      (2-round CM, external chain, revision/supersede) is already strong; only its
      HARD-CODED wiring is the problem.
    Goal: lift the approval line out of code into an admin-configurable model (an approval
      matrix / template scoped by document type + category + site, with a possible
      per-document override). NOTE: detailed scope (granularity, UI, data model, migration
      of existing hard-coded lines) will be defined at the start of the dedicated chat for
      this task — this entry only records WHAT the work is and WHY.
    How-Check: to be defined with scope in the dedicated chat (baseline: existing
      hard-coded flows keep working unchanged after migration; a new approval line can be
      created/edited by an admin without a code change).
    Relate File: src/lib/config/workflow.ts · src/lib/config/rfi-workflow.ts ·
      src/app/api/rfa/[id]/route.ts · src/app/api/rfi/[id]/route.ts (scope TBD)
    DesignNotes (user discussion 2026-08-28 — early scope intent, refine in the dedicated chat):
      Combine the strengths seen in Procore/Conzol benchmarking with the external-chain
      already built (T-015). Per-STEP config with TWO INDEPENDENT axes (keep them separate,
      do not conflate):
        Axis 1 — action mode of the step: MUST_RESPOND (holder must record a verdict/status
          to advance) | ACK_FORWARD (acknowledge & forward, no status chosen) | CC/FOR-INFO
          (notified only, no action needed).
        Axis 2 — blocking: does this step's negative verdict stop the chain? User's chosen
          default = NON-BLOCKING (advisory). A reject at an intermediate step is an OPINION,
          not a decision: the document still walks the FULL configured line so every position
          records its view, then the FINAL step makes the single binding decision. An early
          reject does NOT short-circuit or send the doc back to revise. (This matches the
          existing external-chain code: reject does not short-circuit → PENDING_CM_FINAL.)
      The FINAL step is special: it is the only binding approve/reject AND the only send-back-
      to-creator-for-revision trigger. The final approver must see all collected opinions
      before deciding.
      Open decisions for the dedicated chat: (1) stall handling for MUST_RESPOND steps
      (due date + reminder + escalation if a holder never acts); (2) exact final-reject →
      revise flow; (3) whether Axis 2 (blocking on/off) should itself be per-step configurable
      for future fail-fast cases (user leans: default non-blocking now, keep the option open).
      Builds on the T-015 configureExternalChain "pick the path yourself" foundation.

- [ ] T-018 · P1 · depends_on: T-016
    Title: Make the RFA runtime flow FOLLOW the configured line + per-doc adjustable full-line infographic
    ContextTask: T-016 made the approval line configurable (admin templates + per-project
      template + external sub-chain), but the RUNTIME does not follow it. The configured
      lineTemplate is only a GET-only display preview (route.ts:166) and is NOT stored on the
      doc; the externalChain is seeded only when CM presses "forward external"
      (route.ts:331). Everything else is driven by the hard-coded status machine
      RFA_TRANSITIONS (workflow.ts) via (action,status,cmSystemType), and canForwardExternal
      is hard-coded `cmSystemType==='INTERNAL' && isCM && PENDING_CM_APPROVAL`
      (route.ts:138) — it never reads the line. Net effect the user hit: after configuring
      CM→Designer→Owner→CM, the CM action modal STILL shows the legacy two-button fork
      (approve vs forward-external) instead of the doc simply walking the configured line.
    Goal: rewire the RFA INTERNAL approval flow to follow the configured line end-to-end,
      with the infographic as the per-document CONTROL SURFACE (not decoration):
        - Seed the resolved line onto the doc at CREATION (src/app/api/rfa/create/route.ts)
          instead of only at FORWARD_EXTERNAL. The configured line = the DEFAULT path most
          docs follow.
        - Drive the whole INTERNAL flow off the chain (getExternalChainHolder /
          currentStepIndex) — retire the hard-coded canForwardExternal (route.ts:138), the
          INTERNAL/EXTERNAL round branches (route.ts:111-129), the CM two-button fork
          (RFADetailModal.tsx:578), and the PENDING_FINAL_APPROVAL round-2 remnant.
        - Surface an adjustable full-line infographic from the start (extend the existing
          LineOverrideStepper + EXT_OVERRIDE_LINE machinery): holder (CM) can reorder/swap
          stages, skip a stage (e.g. jump straight to Owner, no Designer), cancel the
          remaining sequence and finalize at CM (= CM approves it themselves), or
          approve-direct.
      SCOPE: INTERNAL projects ONLY — EXTERNAL (cmSystemType==='EXTERNAL') is NOT touched (it
      ends internally, site role-plays CM; lineTemplateResolver already returns source:'none'
      for EXTERNAL). NEW documents only — clean cutover, in-flight docs finish on the old
      flow, no migration. Design decisions live in memory project_rfa_configurable_line_design
      — do NOT re-ask them.
    Out-of-Scope: sub-line (subLineMode, Phase B — inert) · RFI mirroring of this refactor ·
      sidebar link for /admin/line-templates (user declined for now).
    How-Check: after configuring an INTERNAL line, a NEW RFA doc walks the configured line
      with NO forward-external fork in the CM modal; the infographic shows current position +
      next stop and lets CM reorder / skip / cancel-rest→finalize-CM / approve-direct;
      EXTERNAL docs behave exactly as before (unchanged); tsc 0 error.
    Relate File: src/app/api/rfa/create/route.ts · src/app/api/rfa/[id]/route.ts ·
      src/lib/config/workflow.ts · src/components/rfa/RFADetailModal.tsx ·
      src/components/rfa/LineOverrideStepper.tsx · src/lib/utils/lineTemplateResolver.ts

- [X] T-019 · done 2026-08-28 · attempts:1 · tool_calls:~90
  Title: PDF Markup Editor overhaul — Round 1 (data model + Sprint 1 fixes + Markup List/Excel export)
  ContextTask: src/components/rfa/PDFPreviewModal.tsx flattens annotations to a PNG on save, discarding structured markup data; six known UX/data-loss bugs in the toolbar (undo, close-warning, eraser, trash icon, text placeholder, font-size/zoom); no way to see what was commented across a document without reopening every page.
  Goal: Annotations become structured data (id/author/createdAt/kind/linkedTo/pageNumber) surviving save/load; Save vs Export-PDF split into two distinct actions; Sprint 1's 6 bugs fixed; a Markup List panel + Excel export summarizes comments per page/document. Sprint 2-4 items (shortcuts, object panel, arrow/callout/stamp tools, vector PDF export, autosave) explicitly deferred to a later round per user's own plan.
  How-Check: npx tsc --noEmit clean on PDFPreviewModal.tsx + markupExport.ts; user live-tests in emulator (undo/redo, close-warning, eraser, trash icon, text placeholder, font size, Markup List, Excel export all behave per gather_complete.md acceptance criteria).
  Out-of-Scope: handwriting recognition (tested 0% accuracy), real-time collaboration, Sprint 2/3/4 items.
  Relate File: src/components/rfa/PDFPreviewModal.tsx, src/lib/utils/markupExport.ts

- [X] T-020 · P1 · done 2026-08-31 · attempts:1 · depends_on: T-019
  Title: PDF Markup Editor Round 2 · Sprint A — Arrow + Callout drawing tools
  ContextTask: T-019 Round 1 shipped the structured-annotation data model + Sprint 1 fixes + Markup List/Excel on src/components/rfa/PDFPreviewModal.tsx. Round 2 continues the deferred drawing tools. Sprint A covers the two lowest-risk, single-file tools: an arrow (line + arrowhead) and a callout (leader line + editable text box that points at a spot on the drawing).
  Goal: Two new toolbar tools in PDFPreviewModal.tsx — (1) Arrow: drag start->end, renders a line with an arrowhead, kind:'markup', movable/erasable/undoable/copy-pasteable like existing shapes; (2) Callout: drag target->box, renders a text box + leader line to the target, editable text on creation, moves as one unit, kind:'comment' so it appears in the Markup List + Excel export. No changes to save/load pipeline or backend.
  How-Check: npx tsc --noEmit clean on PDFPreviewModal.tsx; user live-tests in emulator — arrow draws with head + moves/deletes/undo/copy-paste; callout draws by drag, text editable, moves as a unit, empty callout auto-removes, callout text shows in Markup List panel + Excel.
  Out-of-Scope: stamp tool (deferred — pending per-project model decision), image insert, toolbar flyout refactor (T-021), line/measurement tools.
  Relate File: src/components/rfa/PDFPreviewModal.tsx

- [ ] T-021 · P2 · depends_on: T-020
  Title: PDF editor toolbar — flyout grouping (scalable tool menu)
  ContextTask: The PDF editor toolbar (src/components/rfa/PDFPreviewModal.tsx) is a flat horizontal row that grows with every new tool (rect/circle/arrow/callout now; stamp/image/measure later). It already overflows on small screens (currently mitigated by horizontal scroll, which hides tools from view).
  Goal: Reorganize the toolbar into flyout groups — e.g. "Shapes" (rect/circle/arrow/line) and "Annotate" (text/callout/stamp) — so the visible bar stays short and new tools slot into a flyout instead of lengthening the row. Navigation (hand/select) + draw/eraser stay as direct buttons.
  How-Check: npx tsc --noEmit clean; user live-test — each flyout opens on click, selecting a tool activates it + closes the flyout, bar no longer horizontally overflows on mobile width.
  Out-of-Scope: adding any new tool (only reorganizes existing), vertical toolbar rewrite.
  Relate File: src/components/rfa/PDFPreviewModal.tsx

- [X] T-022 · P2 · depends_on: T-020 · done 2026-08-31 · attempts:3 · tool_calls:~30
  Title: PDF callout — Acrobat-style move (G1 box-drag pins tip · G2 arrowhead moves whole callout)
  DoneNote: Final approach = Option B re-architecture (superseded the original tip-handle plan below). Leader Line + head Triangle split OUT of the box Group into top-level objects linked by `linkedTo`; calloutGeo stores only the absolute tip pin {tx,ty} (box pos/size read live) — eliminates the group-local/bbox-refit/delta drift class. G1 (drag box) pins the tip via object:moving→syncCalloutLeader; G2 (drag tip knob) translates the whole unit. Single undo step on create/delete/erase; rehydrateCallouts restores non-serialized state after every loadFromJSON. tsc clean + user live-test PASS all 12 acceptance checks. App code only → no release.py.
  ContextTask: T-020 shipped the callout as one fabric.Group([leader Line, box Rect, text Textbox]); the leader tip is baked into the group so the user cannot re-aim where it points without moving the whole callout. User asked to make the tip draggable (chose the low-risk "tip handle on the existing group" approach over ungrouping the leader).
  Goal: Add a draggable control handle at the leader-line tip of a finished callout Group. Dragging the handle re-aims the leader to a new target point while the box/text stay put; calloutGeo.tx/ty update so double-click re-edit still rebuilds correctly. Callouts are only ever translated (never rotated/scaled), so the group transform is a pure translation — tip abs = stored tip + group move-delta. Handle is re-attached on selection for callouts loaded from a saved page. Keeps the callout a single movable unit; does not touch creation-drag/delete/serialization/Markup List.
  How-Check: npx tsc --noEmit clean on PDFPreviewModal.tsx; user live-test — a selected callout shows a handle at the leader tip, dragging it re-aims the pointer while the box stays put, and double-click re-edit + move-as-unit + delete + undo/redo still work.
  Out-of-Scope: draggable box-corner attach point, multi-segment leaders, toolbar flyout (T-021), stamp tool.
  Relate File: src/components/rfa/PDFPreviewModal.tsx

- [/] T-023 · P1 · depends_on: none
  Title: PDF markup editor — save DRAFT (persist in-progress markup, resume later)
  ContextTask: Highest-priority gap raised by user. Today PDFPreviewModal.tsx lets a reviewer mark up a page, but the marked-up state only survives if they complete an approval action. Closing the modal without approving (e.g. reviewed some pages, not finished) discards all edits — reopening shows the original file with no markup. User's need: a reviewer who has annotated PART of a document but is not done reviewing must be able to save a DRAFT and come back to continue, without triggering the approval workflow. T-019 already made annotations STRUCTURED data (canvas JSON per page), so a draft can persist that JSON rather than a flattened PNG.
  Goal: Add an explicit "Save draft" path in PDFPreviewModal that persists the structured per-page markup (canvas JSON) tied to the document + reviewer, DECOUPLED from the approval action. Reopening the same document restores the in-progress markup so the reviewer continues where they left off. A saved draft is per-reviewer and does not advance/alter the RFA/RFI workflow state.
  How-Check: npx tsc --noEmit clean; user live-test in emulator — annotate a page, click Save draft, close the modal WITHOUT approving, reopen the document → the markup is restored exactly; completing the approval later still flattens/saves as before; no workflow state changed by a draft save.
  Out-of-Scope: real-time collaborative draft, draft version history, auto-save-on-timer (may be a follow-up), changing the approval/flatten pipeline itself.
  Decision (user · 2026-08-31): store the draft SERVER-SIDE (Firestore/Storage), per-reviewer, so it follows the reviewer across devices/browsers — NOT browser-local. Save trigger = explicit "Save draft" button (not auto-save-on-timer this round).
  Relate File: src/components/rfa/PDFPreviewModal.tsx (+ a server draft persistence path — exact collection/field decided at plan time)

- [ ] T-024 · P2 · depends_on: none · BLOCKED: awaiting user model decision
  Title: PDF markup editor — stamp tool (ตราปั๊ม)
  ContextTask: Deferred stamp tool for PDFPreviewModal.tsx. Blocked on a product decision, not code: Model 1 = user uploads their own stamp image per use; Model 2 = built-in stamp templates configured per project. Cannot plan until the model is chosen.
  Goal: (pending model decision) Add a stamp tool to the PDF editor toolbar that places a stamp annotation (kind consistent with existing structured markup) on the page, movable/erasable/undoable like other tools.
  How-Check: (defined once model chosen) npx tsc --noEmit clean; user live-test — stamp places, moves, deletes, survives save/load.
  Out-of-Scope: TBD at plan time.
  Relate File: src/components/rfa/PDFPreviewModal.tsx
  Note: Deferred Round-2 tools (image insert, line/measure, keyboard shortcuts, object panel, vector PDF export, autosave) remain recorded under T-019 Out-of-Scope — not re-registered as separate tasks until picked up.

- [X] T-025 · done 2026-09-01 · attempts:1 · P2 · depends_on: T-023
  Title: Collaborative PDF markup — shared draft + semi-realtime (per-object Firestore)
  Follow-ups (2026-09-01): callout leader/arrowhead now reconstructed from calloutGeo at every display path (sync + author reopen); close-confirm modal reworded to "auto-saved" reassurance; redundant save-draft button removed (auto-sync covers it). User-confirmed live.
  ContextTask: Real requirement — reviewer A's markup and reviewer B's markup must combine/merge on the same RFA PDF, and a saved draft must be visible to other reviewers (supersedes T-023's per-user Storage draft, which was device-following but private). Method B (semi-realtime): store each Fabric object as one Firestore doc in a top-level `markup` collection keyed by the object's own id, queried by file.filePath (globally unique → no documentId prop). My objects flow through the existing canvasDataRef/loadFromJSON/undo/save/flatten machinery UNCHANGED (editable); others' objects arrive via onSnapshot as a read-only, excludeFromExport overlay (never enter my undo/toJSON/flatten). Debounced write ~1s idle / 2s max from existing object:added/modified/removed events, owner-guarded (authorUid===me, not _remote). No auto-color (users pick pen colour; comment list already shows author). Palm rejection (iPad pen-priority) DEFERRED to next round.
  Goal: Two reviewers see each other's completed markup within ~1-2s on the same doc; each edits/undoes only their own; reopen restores the merged set; approval still flattens/saves/advances exactly as before; no listener leak on close.
  How-Check: npx tsc --noEmit clean; user emulator live-test w/ 2 accounts (A draws → B sees ~1-2s non-movable, correct author → B adds → A sees → each undo removes only own → reopen shows merged → approve still flattens). firestore.rules markup block above catch-all; user deploys via `firebase deploy --only firestore:rules` (Blaze plan for prod realtime volume).
  Out-of-Scope: auto-color assignment; iPad palm/pen-priority; deleting markup docs after final approval (revision creates a new filePath → no collision); removing dead T-023 Storage helpers.
  Relate File: src/lib/rfa/markupSync.ts (new) · src/components/rfa/PDFPreviewModal.tsx · firestore.rules

- [ ] T-026 · P2 · depends_on: T-025, T-018
  Title: Sweep collaborative markup after final approval
  ContextTask: T-025 leaves the per-object `markup` Firestore docs in place forever — no lifecycle cleanup on save/approve/status-change (only a per-object erase/undo deletes one doc, PDFPreviewModal.tsx:403). Harmless (each revision = a new filePath → no collision) but Firestore accumulates stale overlays. User wants: keep markup editable through the whole review round (back-and-forth CM↔Designer↔Owner, gated by S6/allowEdit), then DELETE all markup for the document once it reaches the FINAL approved status (Owner's last approval). Deletion is cleanup ONLY — S6 already locks editing at final; this just removes the now-unusable overlay. The terminal-status trigger is tied to the T-018 configurable approval-line work (currently PAUSED), so the exact final-status hook is defined there — do NOT hardcode a status until T-018 resumes.
  Goal: When a document hits its final approved status, every `markup` doc for that file's filePath is batch-deleted (query by filePath → delete); during review (non-final) markup persists and stays collaboratively editable.
  How-Check: npx tsc --noEmit clean; emulator test — approve a doc through to final → the `markup` collection for that filePath is empty; a doc mid-review still shows/merges markup. Note: markup never flattened (user never pressed บันทึก) vanishes at final — acceptable (the deliverable is the saved edited_*.pdf).
  Out-of-Scope: defining/altering the approval line itself (that is T-018); deleting markup on non-final status changes; per-user retention/archival of old markup.
  Relate File: src/lib/rfa/markupSync.ts (add batch-delete-by-filePath) · src/components/rfa/PDFPreviewModal.tsx · the final-status hook from T-018
  Consideration (2026-09-01 · Excel-export impact): the "ส่งออก Excel" comment-list export (src/lib/utils/markupExport.ts, invoked from PDFPreviewModal.tsx:2406) must survive this sweep. Comments accumulate across the whole line (CM→Designer→Owner all in one filePath) and the export button lives ONLY inside the PDF preview markup panel (must open preview to reach it — no standalone download). markupEntries is built (refreshMarkupEntries, PDFPreviewModal.tsx:563) from canvasDataRef, whose two sources are (1) Firestore `markup` = source of truth, (2) the embedded `annotations.json` attachment in each saved/flattened PDF = fallback (load effect PDFPreviewModal.tsx:760). CONSEQUENCE: deleting ONLY the Firestore `markup` docs is SAFE — export still rebuilds from the embedded annotations.json in the final approved PDF (every save re-embeds the full accumulated set, handleSave PDFPreviewModal.tsx:918). It BREAKS only if the sweep also strips/omits the embedded annotations.json (e.g. a pure flatten-to-image with no attachment). So: this task's batch-delete-by-filePath is export-safe as designed; DO guard the invariant — never remove the embedded annotations.json from the approved PDF. Add a How-Check: after final-approval sweep, reopen the approved PDF preview → comment list still populated → ส่งออก Excel still produces all rows. Note: only typed callouts (kind==='comment') are ever exported; freehand drawings are not.

- [X] T-027 · done 2026-09-01 · attempts:1 · P2 · depends_on: T-019
  Title: Per-document access log (RFA) — who viewed / downloaded / edited-markup, nested under each workflow milestone
  ContextTask: The RFA history modal already shows "ประวัติการดำเนินงาน" (workflow actions — create/submit/approve). User wanted to ADD an audit of who OPENED (view), DOWNLOADED, or EDITED-MARKUP the document — full accountability (e.g. a CM opened but never approved → the log proves they saw it). Design confirmed + mockup approved: access events NESTED under each milestone, bucketed by the milestone active at access time (NOT a flat log, NOT merged one timeline), every event kept (no collapse), tagged with role + status snapshot. Visibility = anyone who can view the RFA doc. New action EDIT_MARKUP logged once per editor-open round (first markup mutation). Skeptical review caught a status-collision bug (a status repeating across revision rounds would double-attach) → bucketing key changed from status-string to TIME (latest milestone timestamp ≤ event time); documentStatus kept as label only.
  Goal: In the RFA history modal each milestone shows a collapsible "มีผู้เข้าถึงเอกสาร N รายการ" list (icon eye/download/edit + name + role badge + time); events land under the correct milestone by time; empty buckets hidden; existing workflow render intact.
  How-Check: npx tsc --noEmit clean (all 5 sections); node test PASS for the repeated-status round → each event in exactly one correct bucket; user live-test on their dev server — open an RFA doc (VIEW_DETAIL logged once), preview/download/edit-markup → events appear under the right milestone in history modal.
  Out-of-Scope: RFI / Work Request access logs (future follow-up — same pattern); composite Firestore index (used index-free single-equality query + in-memory sort); collapsing duplicate events to first-only.
  Relate File: src/types/activity-log.ts · src/lib/utils/activityLogger.ts · src/components/rfa/RFADetailModal.tsx · src/components/rfa/PDFPreviewModal.tsx · src/app/api/rfa/[id]/activity/route.ts (new) · src/lib/rfa/accessLogGrouping.ts (new)
