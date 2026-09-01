# Topic-Facet Backlink Schema (v3)
date: 2026-06-25
status: design-approved — supersedes flat `topics[]` in index_files.json
v3 (2026-06-25 · T-278): added FACET 3 `domain` for multi-domain knowledge separation (harness / content / data). v2 facets (type, topic) unchanged.
origin: design converged across session 2026-06-14 (user + agent), adversarial review per audit_engine_rubric.md

## 1 · Why v1 (flat topics) is weak
- `overlap = |A∩B| / |A|` is asymmetric → "strong" inflated for files with few topics.
- All topics weighted equally → rare, high-signal topics drowned by common hub topics.
- One `topics` list conflates TWO orthogonal facets: *what kind of file* vs *what it is about*.
- AI tagging is non-deterministic → re-running shifts results, so counts/links drift.

## 2 · Three-facet model (v3)
- **FACET 1 — `type`**: what KIND of file (harness / tool / skill / ...). Small closed vocab.
  Used for navigation/filter ONLY. NOT part of the link-strength formula.
- **FACET 2 — `topic`**: what the file is ABOUT. Closed vocab (topic_registry.json).
  Per-file weighted into `major` / `minor`.
- **FACET 3 — `domain`** (v3 · T-278): what FIELD of work the file belongs to. Closed vocab =
  the `domain/` pack keys (`harness · content · data · ...`), shared 1:1 with the behavior layer.
  - **Assignment is DETERMINISTIC (no AI judgment per run):** read the file's frontmatter `domain:`
    field; if absent → default `"harness"`. Frozen like §6 — re-runs never drift.
  - **Unlike `type`, `domain` DOES gate linking:** the backlink scorer (§7) excludes a pair whose
    domains differ UNLESS an explicit `references[]` link is declared. Each domain's graph stays
    self-contained; cross-domain links are rare and intentional, never accidental topic-overlap noise.

## 3 · Per-file entry schema (extends each index_files.json entry)
```json
{
  "type": "harness",
  "domain": "harness",
  "topics": { "major": ["token_tracking"], "minor": ["compact_handling"] },
  "topic_map": [
    { "topic": "token_tracking", "lines": [[10,45],[88,92]], "critical": false },
    { "topic": "react_loop",     "lines": [[46,87]],         "critical": true  }
  ],
  "coverage": 0.84,
  "tagged_at_hash": "a1b2c3d4",
  "description": "...", "backlinks": [], "references": [], "related": [],
  "rules_defined": [], "rules_referenced": []
}
```

## 4 · `type` vocabulary (closed — type_registry)
`harness · tool · skill · knowledge · session · index · config · doc`
Extend ONLY via the same propose+confirm gate as topics (§8).

## 5 · Tagging procedure (run ONCE per file, at create/edit)
- **T1.** AI maps line-ranges → topic ids, choosing ids ONLY from topic_registry.json (closed vocab).
  Per topic returns `{topic_id, lines:[[start,end]...], critical:bool, why, label}`. Ranges MAY overlap
  (one line can support more than one topic).
  - **T1-label (§10).** For each topic_map row the AI ALSO assigns a human-readable `label` (the section
    name for that line-range). Reuse-first: pick an existing label from `labels_by_topic[topic_id]` if one
    fits; mint a new one ONLY via the `[new-label-proposed]` gate (§10). Labels are namespaced `Topic::Label`.
- **T2.** `coverage = distinct lines covered by ≥1 topic / total non-blank lines`.
  If `coverage < 0.80` → AI adds topics until ≥0.80 (the Pareto floor: capture the 80% that matters).
- **T3.** major/minor split — **PURE CODE, deterministic**:
  rank topics by total covered line-count desc → top `ceil(0.20 × N)` = `major` (floor: at least 1).
  Any topic with `critical:true` is forced into `major` regardless of line-count.
- **T4.** store `topic_map` (each row now carries `label`) + `topics{major,minor}` + `coverage`
  + `tagged_at_hash = sha1(file)[:8]`. Any newly-minted label is also written to
  `labels_by_topic[topic_id]` in topic_registry.json (the closed reuse-first store).
- **Enforcement (T-320 · HARD gate — upgraded from the T-306 advisory detector).** Tagging a
  `knowledge/*.md` doc is no longer optional discipline. `index_reconcile.py --check` (the
  PreToolUse/Stop close-gate) HARD-BLOCKS (exit 2) any new/modified knowledge doc with no major
  topic, via `tag_gate_check()`. Scope = knowledge/ docs ONLY — `.sessions/`, scratchpad,
  scripts/code, tests, config, and the tagging infra (`topic_registry.json`/`index_files.json`)
  are hard-exempt (deadlock guard); a tagged-but-modified file is never blocked (T-252 intact).
  Anti-bloat: `scripts/tag_gate.py resolve()` is REUSE-FIRST — it matches an existing topic/label
  (exact or conservative synonym) before any new one is minted, and never force-merges a distinct
  concept (false-merge guard). Delete-side: `index_reconcile.py --prune-labels [--apply]` GCs
  orphan labels whose last file is gone (backup-first · never prunes a still-used label).
  Enforcement is ON by default (emergency off: `HARNESS_TAG_GATE_ENFORCE=0` · per-op escape:
  `HARNESS_SKIP_TAG_GATE=1`). The T-306 advisory lines (`[tag-needed]`/`[label-drift]`) remain on
  the main/Stop path; the `--check` path now enforces rather than merely warning.

## 6 · Determinism rule (fixes "AI is not stable")
- AI runs at **T1 only**. Everything downstream (T3 split, backlink scoring) is pure code over stored data.
- Re-tag trigger = `sha1(file)[:8] ≠ tagged_at_hash`. Same content → tags frozen → identical forever.
- Backlink + major/minor are reproducible from the stored `topic_map`; no AI call at sync time.
- On write, spot-check `coverage ≥ 0.80`; AI variance is confined to tag-time and is reviewable.

## 7 · Link-strength formula (Topic-only, per-file weighted)
For files A, B with shared topics `S = topics(A) ∩ topics(B)`:
```
weight_F(t) = 2 if t in major(F)
            = 1 if t in minor(F)
score(A,B)  = Σ_{t in S} min(weight_A(t), weight_B(t))
```
`min(...)` → a topic counts as strongly shared only when BOTH files treat it as major.
Tiers (tune after first run): `score ≥ 4` strong · `2–3` related · `1` weak · `0` none.
- `type` is NOT in this formula — a tool file and a harness file may still link strongly on shared topics.
- **[v3, optional]** multiply each weight by `IDF = log(total_files / files_carrying(t))` to down-weight
  common topics. Defer until corpus > ~50 files (marginal gain while small).

## 8 · New-topic / new-type minting (reuse harness_doctor gate)
- Vocabulary is front-loaded. A tag-time miss does NOT auto-create a topic.
- Mint path = emit `[new-topic-proposed]` + keyword-dedup (`keyword match ≥ 2 existing → reuse, NEVER new`)
  + user confirm. Identical discipline to the CFP doctor flow.
- On minting a new topic: run a one-time `grep` of the corpus. If it appears centrally in ≥ N existing
  files → flag those for re-tag. Otherwise skip (peripheral, per Pareto — no full re-sync).
- **Closed vs open vocab — why only `topic` needs this gate (T-279):** `topic` is an OPEN vocab (new values can be minted) → it CAN bloat, so this §8 gate (keyword-dedup + confirm + Pareto §5) is the bloat control. `domain` and `type` are CLOSED enums — a fixed finite set (`domain` = harness/content/data) → they cannot bloat by construction and need no minting gate. Rule of thumb: **open vocab ⇒ needs a gate · closed enum ⇒ bloat-proof.**

## 9 · Known residual watch-points
- line-count ≠ importance: a short critical rule could rank as minor → `critical:true` override (T3).
- AI line-mapping variance: confined to tag-time, mitigated by the §6 hash-lock + coverage spot-check.
- v2 deferred a 3rd facet while the corpus was small; v3 (T-278) adds `domain` because multi-domain
  knowledge accumulation (harness + content + data) made cross-domain link-noise a real cost. Resist a
  4th facet without the same kind of concrete driver.
- Two-namespace trap (T-193): this schema's file-facet topics live in `knowledge/topic_registry.json`
  and use **snake_case** (e.g. `token_tracking`, `error_protocol`). CFP classification topics live in
  `knowledge/cfp_topics.md` and use **kebab-case** (e.g. `token-tracking`, `boot-routing`). They are
  DELIBERATELY separate vocabularies for different domains — similar-looking ids (`token_tracking` vs
  `token-tracking`) are NOT the same topic. Never cross-assign: file facets only validate against
  topic_registry.json; CFP topics only against cfp_topics.md. backlink_analyzer/code_graph read the
  former; harness_doctor/self_improve read the latter.

## 10 · Label sub-layer (T-305 · a SUB-layer of topic, NOT a 4th facet)
Purpose: a fine-grained read aid. Where `topic` answers *"what is this line-range about?"* (closed vocab),
`label` answers *"which named section is it?"* — so an agent reads the label→line index first and pulls ONLY
the needed lines (extends Never-Full-Load / R5). It is a navigation aid, not a linking facet.

- **Storage.** Labels live in `knowledge/topic_registry.json` under `labels_by_topic: { "<topic_id>": ["<label>", ...] }`
  — same file as topics so the reuse-check is one lookup. The per-file `label` value rides on each existing
  `topic_map` row (no new per-file structure).
- **Namespacing.** A label is scoped to its topic: `Topic::Label`. The SAME label name under two different
  topics is TWO different labels (prevents false merges). Reuse is checked within `labels_by_topic[topic_id]` only.
- **Reuse-first minting (mirrors §8).** At tag-time the AI checks `labels_by_topic[topic_id]`: a fitting label
  exists → reuse it. None fits → emit `[new-label-proposed] topic:<id> label:<name>` + user confirm → append to
  `labels_by_topic[topic_id]`. Never auto-create silently.
- **Determinism (mirrors §6).** The AI names a label at **T1 only**; downstream (storage, drift-check) is pure code.
  Re-tag trigger stays `sha1(file)[:8] ≠ tagged_at_hash` — labels re-freeze with the topic_map.
- **Backlink UNCHANGED.** `label` is NOT in the §7 link-strength formula. Cross-file scoring reads `topics`
  only — adding labels does not re-score the corpus or touch backlink sync.
- **Integrity.** A label on a file that is not registered in `labels_by_topic[topic_id]` = orphan → the
  Stop-hook reconciler emits `[label-drift]` (S3). Closed-vocab discipline, same as topics.
