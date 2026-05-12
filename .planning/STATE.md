# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-04-24 after v1 milestone completion)
See: `.planning/MILESTONES.md` (v1 Pilot Release shipped 2026-04-24)
See: `.planning/milestones/v1-ROADMAP.md` (full v1 phase details archived)
See: `.planning/milestones/v1-REQUIREMENTS.md` (49 v1 requirements, 47 shipped, 2 deferred to v1.1)
See: `.planning/milestones/v1-MILESTONE-AUDIT.md` (audit passed 2026-04-24; GAP-1 fixed inline)

**Core value:** Every answer is verifiable against the authoritative SOP — users read the cited source section without leaving the conversation. No ungrounded answers, no invented field names or approver names.

**Current focus:** v1 Pilot Release complete. Awaiting operator pilot execution and/or `/gsd:new-milestone` to scope v1.1 (candidate directions: Teams delivery, pilot feedback loop, Phase 6 tech-debt drain, Author-Lint features).

## Current Position

**Milestone:** v1 Pilot Release — ✅ SHIPPED 2026-04-24
**Next milestone:** Not yet scoped — run `/gsd:new-milestone` to begin v1.1 (questioning → research → requirements → roadmap)

**Codebase baseline at v1 ship:**
- 728/728 unit tests green
- 22/22 Playwright E2E specs green
- Typecheck clean
- `pnpm eval:fast` exits 0 (entity-allowlist + citation-substring pass thresholds)
- `pnpm eval:slow` skips cleanly without `LLM_JUDGE_API_KEY` (operator-gated)
- ~22,500 LOC TypeScript (src/ + tests-e2e/ + scripts/)
- 178 commits, fa3270d → c92286e, 339 files changed, +75,513 insertions

**Tag:** `v1` (2026-04-24)

Progress: [██████████████████████████████████████████] v1 shipped — 6 phases + Phase 5.1 pivot complete

## v1 Milestone Summary

Six phases that started with the load-bearing grounding layer and built outward through the BFF streaming route, role-aware chat UI, source panel and fallback UI, and finally telemetry + eval hardening. Phase 5 (SPA+NAA + Azure App Service) was paused and superseded by Phase 5.1 (MMC-IT-blessed BFF pattern + on-prem Windows deploy) after the xmcp/Atlas reference revealed an architectural divergence from MMC IT's production pattern.

**Full execution history** (per-plan durations, commit heads, decisions, pitfall notes): see `.planning/milestones/v1-ROADMAP.md` and the individual `SUMMARY.md` files under `.planning/phases/0{1-6}-*/` and `.planning/phases/05.1-mmc-it-bff-pivot-xmcp-pattern/`.

**Phase directories** are NOT deleted — they accumulate across milestones as the raw execution history. Phase numbering continues in v1.1 (v1 ended at Phase 6; next integer phase is Phase 7).

## Accumulated Context

### Roadmap Evolution Across v1

- Phase 5 paused 2026-04-23 and superseded by Phase 5.1 (INSERTED) after xmcp/Atlas reference revealed SPA+NAA + Azure App Service architecture divergence from MMC-IT blessed BFF + on-prem Windows pattern. Phase 5 remains as documentary record in `.planning/milestones/v1-ROADMAP.md`.
- GAP-1 (skip_eval_gate emergency-bypass broken by GitHub Actions skipped-dependency default) discovered during milestone audit 2026-04-24; fixed inline with one-line `if:` on deploy job (commit c92286e).

### Open Context for v1.1

**Deferred from v1:**
- AUTH-03 (Teams SSO via NAA) — Phase 5.1 pivot decision
- DELV-03 (Microsoft Teams tab manifest) — Phase 5.1 pivot decision

**Tech debt (non-blocking, see v1-MILESTONE-AUDIT.md frontmatter `tech_debt` for full list):**
- TD-1 Workbook Section 5 KQL inert (no code emits `eval_run_completed` events)
- TD-2 6 events unsurfaced in workbook KQL panels
- TD-3 `trackEvent(name: string)` not narrowed to `EventName` type
- TD-4 `mockChatSuccess` fixture lacks `message_id` SSE frame
- TD-5 Workbook GUID is placeholder (operator-supplied at deploy time)
- TD-6 Flow E (sign-back-in) unit-only — intentional CI constraint

**Pending operator actions before pilot day 1** (16 items, see v1-MILESTONE-AUDIT.md frontmatter `pending_operator_actions`): GHA secrets, AWS Secrets Manager provisioning, Entra App Registration, Windows Server deploy, workbook + alerts provisioning, pilot cohort onboarding, Steward placeholder fills.

### Key Decisions

Full log in PROJECT.md Key Decisions table. All v1 decisions marked ✓ Good, ⚠️ Revisit, or — Pending with outcomes.

**Load-bearing decisions carrying into v1.1:**
- Stuff-the-context grounding (revisit only if corpus grows beyond single-KB scope)
- BFF pattern + iron-session + App Role gating (Phase 5.1 — adding Teams requires reintroducing NAA alongside BFF)
- On-prem Windows deploy + AWS Secrets Manager (xmcp-matching)
- gpt-4o (full) + MGTI corporate ingress
- Quality-driven timeline (pilot launches on measurement-plan sign-off, not a date)

### Memory Captured

- `C:\Users\taylo\.claude\projects\C--kbroles\memory\mmc_it_entra_pattern.md` — xmcp/Atlas pattern reference for future MMC-internal app work (BFF + auth code flow + App Roles + on-prem Windows + AWS Secrets Manager)

### Quick Tasks Completed

Pre-pilot tactical fixes between v1 ship and v1.1 scope. Each row is a self-contained operator-unblocking change committed atomically; full detail in the linked SUMMARY.md.

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 001 | Env-file-on-disk deploy path (no-AWS alternative): start.ps1 wrapper + .env.production.example template + loadSecrets() early-return guard + docs cross-linking. Operator without AWS CLI access can now run pilot via `D:\kbroles\.env.production` + Scheduled Task → `scripts/start.ps1`. 729/729 unit tests green. | 2026-04-29 | 33e6d77 | [001-add-no-aws-env-file-deploy-path](./quick/001-add-no-aws-env-file-deploy-path/) |
| 002 | Surface no-AWS path in DEPLOY-CHECKLIST.md: HB-6 restructured as AWS-or-env-file alternative, HB-7 marked optional on the no-AWS path, HB-9 Done-when accepts either path, background-reading section links `scripts/start.ps1` + `.env.production.example`. HB-5 (GHA AWS secrets) explicitly untouched — steward workflow still needs them. | 2026-04-29 | b6faef1 | [002-link-no-aws-path-from-deploy-checklist](./quick/002-link-no-aws-path-from-deploy-checklist/) |
| 003 | Convert three deploy-day workarounds into proper fixes: (1) `scripts/start.ps1` rewritten to use `Start-Process -PassThru` + `Wait-Process` + two-file stdout/stderr redirect (Tee-Object pipe was killing Node in non-TTY Task Scheduler context); (2) `src/grounding/registry.ts` reverted to `import x from './x.md'` with Webpack `asset/source` + Turbopack raw + new `scripts/md-loader.mjs` ESM loader hook (preserves `pnpm smoke` tsx path that imports the registry, blocked the trivial revert); (3) `src/app/api/login/route.ts` defensive absolute-URL prepend when msal-node 5.1.4 returns a path-only URL from `getAuthCodeUrl()`. 731/731 tests pass. Pilot's three operator workarounds (mirrored .md tree, manual auth URL, interactive-only wrapper) now obsolete on next deploy. | 2026-05-01 | bb5063b | [003-fix-pilot-deploy-workarounds-into-real-fixes](./quick/003-fix-pilot-deploy-workarounds-into-real-fixes/) |
| 004 | Emit validator-flip details (`source_id` + `section_id` + flip `reason`) on `validator_flip` and `fallback_trigger(all_citations_stripped)` events so operators can see WHAT the model is hallucinating when citations get stripped. Closes the TODO at validator.ts line 21 ("Phase 2 will log this on the server"). Extends `trackEvent()` with new `extras` param that flows ONLY to pino (NOT OTel span attributes — keeps App Insights customDimensions schema clean). Caps flip array at 10 entries with `flips_truncated: true` marker. Quote text deliberately excluded from logged flips. 733/733 tests (+2 new). Validator behavior + UX unchanged — telemetry only. | 2026-05-01 | e098ebc | [004-emit-validator-flip-details-on-fallback](./quick/004-emit-validator-flip-details-on-fallback/) |
| 005 | Force Webpack for `pnpm dev` via `--webpack` flag in package.json. Quick 003's build-time `import x from './x.md'` works under Webpack (next build, prod standalone) but Turbopack's `{ type: 'raw' }` rule silently returns undefined under Next 16.2.4, crashing `parseSource(undefined)` at module load (`src/grounding/registry.ts:46`) and 500ing every `/api/chat` request in dev. Adding `--webpack` matches the prod loader path (`asset/source` rule already in next.config.ts), eliminating dev/prod loader divergence. Production bundle unaffected — only local dev was broken. Single-line change; 733/733 tests stay green. | 2026-05-02 | e7e6870 | [005-force-webpack-for-pnpm-dev](./quick/005-force-webpack-for-pnpm-dev/) |
| 006 | Strengthen verbatim-quote rule in `COMMON_RULES_FOOTER` (footer rule 1). Original wording mentioned "verbatim" once at the end of a sentence about citation count; gpt-4o was interpreting it as "faithful to meaning" rather than "exact substring" and paraphrasing the quote ~50% of the time on the Author "form fields" chip, tripping `quote_not_in_body` → `all_citations_stripped` fallback. New wording explicitly forbids paraphrase/summary/rewording/punctuation-normalisation, names the validator's exact-substring check, and gives the model an escape hatch ("copy fewer words rather than rewording"). Local 10-trial benchmark (gpt-4o-2024-08-06): baseline 4 pass / 5 quote-strip / 1 allowlist → after change 7 pass / 1 quote-strip / 2 allowlist. Net +30pp pass-rate; quote_not_in_body drops 5x. `CITATION_CONTRACT_BLOCK` NOT touched (locked per inline comment). Snapshot regen for both consumer + author roles. 733/733 tests pass. Temperature=0 explored as alternative — tested and rejected (collapsed paraphrase but introduced 100% allowlist failure). | 2026-05-02 | 157a819 | [006-strengthen-verbatim-quote-rule](./quick/006-strengthen-verbatim-quote-rule/) |
| 007 | Force Webpack for `pnpm build` (sister fix to quick-005). Surfaced when operator ran `pnpm build` on prod Windows Server (D:\kbroles) — same `parseSource(undefined)` crash chain that quick-005 fixed for `next dev`, but during `next build`'s page-data collection phase. Root cause: Next.js 16.2.4 made Turbopack the default for `next build` too, not just `next dev` (banner literally read `▲ Next.js 16.2.4 (Turbopack)` during `next build`). Quick 005 only fixed dev; build was still defaulting to Turbopack. Fix is the same: add `--webpack` to package.json `build` script. Verified locally — `pnpm build` now reads `(webpack)` and produces working `.next/standalone/`. Production deploys via GHA may have been silently failing since quick-003 (2026-05-01) — separate audit recommended. 733/733 tests stay green. | 2026-05-02 | 987d3e7 | [007-force-webpack-for-pnpm-build](./quick/007-force-webpack-for-pnpm-build/) |
| 008 | Add Anthropic Claude 4.5+ as a configurable LLM provider via MGTI's `/coreapi/llm/anthropic/v1` proxy (AWS Bedrock backend). New `LLM_PROVIDER` env var (default `openai`) switches the entire pipeline; existing OpenAI deploys unaffected until the operator flips it. New `src/llm/anthropicAdapter.ts` (~250 LOC) is a direct-fetch wrapper for the proxy — no SDK dependency added. Maps Anthropic body shape (system top-level, max_tokens required, content blocks, stop_reason) ↔ kbroles `StreamAnswerResult`. Bedrock guardrail intervention surfaces as `RefusalError` for SSE wire-shape stability. JSON discipline via Ajv + one retry mirrors the existing OpenAI `json_object` fallback. Known gap: MGTI proxy doesn't document `tools` support, so the strict-schema backstop the OpenAI path uses is unavailable here (carried forward as informal follow-up). `env.ts` uses Zod `superRefine` for value-dependent required-field validation; `secrets.ts` extends `SECRET_KEYS` to 12 entries (added `ANTHROPIC_API_KEY`). 762/762 tests (+29 new: 17 adapter + 12 env-switching). Typecheck clean. Came in at ~1.5 hours vs the 3-day estimate — existing patterns (json_object fallback, Zod schema, REQUIRED_VARS test pattern) accommodated the new fields cleanly. | 2026-05-11 | bcae905 | [008-anthropic-provider-integration](./quick/008-anthropic-provider-integration/) |
| 009 | Closes the Critical Gap from Quick 008 after operator confirmed `tools`+`tool_choice` pass through the MGTI Anthropic proxy. Adapter's default path is now strict-tools: body includes `tools: [{ name: 'emit_kb_response', input_schema: CITATION_SCHEMA }]` and `tool_choice: { type: 'tool', name: 'emit_kb_response', disable_parallel_tool_use: true }`. Bedrock enforces CITATION_SCHEMA on the model's tool input at the API level — equivalent of OpenAI's `response_format: { type: 'json_schema', strict: true }`. The text/JSON path is preserved behind new `ANTHROPIC_TOOLS_SUPPORTED` env flag (default `true`, escape hatch `false`) mirroring `STRICT_SCHEMA_SUPPORTED`. CITATION_SCHEMA is the single source of truth across both providers' strict modes AND the post-response Ajv validator — no duplication. `disable_parallel_tool_use: true` aligns with GRND-04 (≤1 citation) by construction, eliminating the `trimmed_excess_citation` failure mode upstream of the validator. `stop_reason='tool_use'` is treated as success. 773/773 tests (+11 new). Typecheck clean. Anthropic path now has the same defense-in-depth as the OpenAI primary path. | 2026-05-12 | e968006 | [009-anthropic-strict-tools-mode](./quick/009-anthropic-strict-tools-mode/) |

---

*Last activity: 2026-05-12 — Quick 009 shipped. Anthropic strict-tools mode is now the default when LLM_PROVIDER=anthropic, closing the load-bearing Critical Gap that Quick 008 carried forward. The Anthropic path now matches the OpenAI primary path's API-level schema enforcement — Bedrock validates the model's tool input against CITATION_SCHEMA before returning, so the model literally cannot emit malformed JSON in the response shape. Combined with the prompt-strengthening from Quick 006 (whose verbatim-quote rule still applies — the validator's exact-substring check on the `quote` field still runs server-side), this gives the Anthropic path stronger guarantees than the gpt-4o-mini production deployment was capable of delivering. Operator-side follow-ups for actual live use of the Anthropic path: (1) provision MGTI Anthropic API key via Hubble PR flow; (2) run Phase A Bruno smoke test per quick-008 operator checklist; (3) Phase B kbroles staging benchmark on the failing Author chip — expected to materially beat the local gpt-4o-full 7/10 baseline now that schema enforcement is in place; (4) Phase C prod cutover if benchmark satisfies. Open code follow-ups (renumbered): **Quick 010 candidate** — allowlist over-strictness; **Quick 011 candidate** — stochastic regression eval; **Quick 012 candidate** — GHA deploy.yml audit; **Quick 013 candidate** — prompt caching via Bedrock `cache_control` on the tools array (pending MGTI confirmation that cache_control passes through).*
