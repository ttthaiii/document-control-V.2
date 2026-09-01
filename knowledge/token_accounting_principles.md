# Token Accounting Principles — Multi-Provider (read vs estimate)
> Reference · created 2026-06-29 (T-288 research) · sources: vendor official docs + GitHub (web-verified, see Confidence).
> Governs how the harness knows context size on ANY provider. Companion: real_context.py (S1), token_estimator.py (S2/B), calibrate_tokenizer.py (S3/C).

## Core principle: READ beats ESTIMATE (single-source-of-truth)
There are only two ways to know a turn's token usage:
1. **READ** the real number the vendor already computed (its API response carries it). This is TRUTH — same number the client meter shows.
2. **ESTIMATE** it yourself by counting characters/tokens. Always a guess; only a fallback.

Prefer READ wherever the number is reachable. Estimate ONLY when no readable usage exists.

## Why the homemade estimate ran ~4× low (the real lesson)
The undercount was NOT bad per-vendor formulas. It was **missing CATEGORIES**. A turn's real context = system prompt + FULL conversation history (re-sent every turn, grows each turn) + this turn's I/O + model output + cache tiers. The old posttool estimate counted only tool I/O — the smallest bucket. Same gap for every vendor. Fix coverage first (B), refine per-vendor char-rate second (C).

## Reading real usage — the field map (web-verified 2026-06-29)
| Item | Anthropic | OpenAI | Google Gemini |
|---|---|---|---|
| usage object | `usage` | `usage` | `usageMetadata` |
| input | `input_tokens` | `prompt_tokens` (Chat) / `input_tokens` (Responses) | `promptTokenCount` |
| output | `output_tokens` | `completion_tokens` (Chat) / `output_tokens` (Responses) | `candidatesTokenCount` |
| total | (none — sum) | `total_tokens` | `totalTokenCount` |
| cache-read | `cache_read_input_tokens` | `prompt_tokens_details.cached_tokens` / `input_tokens_details.cached_tokens` | `cachedContentTokenCount` |
| cache-CREATE | `cache_creation_input_tokens` | (none) | (none) |
| thinking | `output_tokens_details.thinking_tokens` | `*_tokens_details.reasoning_tokens` | `thoughtsTokenCount` |

Parser gotchas: OpenAI has TWO shapes (Chat `prompt_*` vs Responses `input_*`) — branch on it; cache leaf `cached_tokens` but the nesting path differs. Gemini is camelCase (REST) / snake_case (SDK) — accept both; output field is `candidatesTokenCount` (NOT outputTokenCount). Only Anthropic reports a cache-CREATION count. Thinking field absent on non-thinking models.

## CAN you read it passively (external script, after the fact)? — the architecture question
This decides whether the real_context.py "read a log file" pattern works.
| Provider / client | Real number available? | Readable ON-DISK log? | Passive reader possible? |
|---|---|---|---|
| **Claude Code** | yes | YES — `~/.claude/projects/<proj>/<session>.jsonl`, `usage` per assistant turn | ✅ YES (this is what real_context.py does) |
| **OpenAI Codex CLI** | yes (in `response.usage`) | NO (none documented; `codex-login.log` is AUTH events, not usage) | ❌ NO → must capture at request time, or ESTIMATE |
| **Google Antigravity (SDK)** | yes (Conversation layer tracks it) | NO documented on-disk usage log | ❌ NO passively — usage is IN-PROCESS only, captured by registering a `PostTurnHook` INSIDE the agent code (`from google.antigravity import Agent, LocalAgentConfig`; hooks: PreTurnHook/PostTurnHook/PostToolCallHook). That is app-layer, not a passive tail. |

Key distinction: **in-process hook ≠ readable on-disk log.** A harness that observes from outside can only read a file the client writes. Today only Claude Code writes one. (Antigravity passive-read = future option IF a real on-disk path is ever confirmed from primary docs — not assumed.)

⚠️ False-friend trap: OpenAI "access **token**" / "Codex access tokens" = LOGIN CREDENTIALS, NOT usage-token counts. Different concept entirely.

## Counting tokens WITHOUT a generation call (for estimate calibration)
| Provider | Method | Local/Network |
|---|---|---|
| OpenAI | `tiktoken` (`o200k_base` for 4o/o-series/4.1+; `cl100k_base` older) | LOCAL / offline ✅ |
| Anthropic | `POST /v1/messages/count_tokens` | network |
| Google | `models.countTokens` → `totalTokens` | network |
Live-hook rule: NEVER call a network counter per turn (latency + crash risk). Use these OFFLINE to calibrate the char→token multipliers, not in the turn path.

## Harness application
- READ path: real_context.py reads the Claude transcript → CHAT_TOTAL = truth where `usage_source: transcript`.
- ESTIMATE path (all non-Claude, or no transcript): token_estimator.py with provider-aware char-mults + full-context coverage (system + history + output), never tool-I/O only.
- Calibration: calibrate_tokenizer.py (offline) refines per-vendor mults when tiktoken/SDK is installed.

## Confidence
Field names + counting methods: confirmed from anthropic / openai / google official docs (2026-06-29).
OpenAI Codex specifically (developers.openai.com/codex/auth + developers.openai.com/codex/enterprise/access-tokens — both fetched live): both pages are AUTHENTICATION only. /auth quote: "Direct `codex login` runs write a dedicated `codex-login.log`" (login events, NOT token usage). /enterprise/access-tokens quote: "Codex access tokens are ChatGPT access tokens scoped to Codex permissions" (credentials, not usage). → confirms: no readable on-disk usage log for Codex; the off-Codex path is ESTIMATE (B). Antigravity: confirmed from GitHub `google-antigravity/antigravity-sdk-python` (README + hooks/README) + `ai.google.dev/gemini-api/docs/antigravity-agent` (the antigravity.google pages were JS-blocked to fetch). A user-supplied code sample claiming `@agent.post_turn` / `usage_metadata.candidate_tokens` / an "Antigravity Token Monitor → usage.jsonl" extension was checked and found FABRICATED/unverified — not used here.
