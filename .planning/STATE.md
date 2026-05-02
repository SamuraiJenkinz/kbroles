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

---

*Last activity: 2026-05-02 — Quick tasks 005 and 006 shipped together as a paired diagnostic-then-fix cycle. Quick 005 unblocked local repro by restoring `pnpm dev`; Quick 006 measured the true baseline failure rate on the failing Author chip (60% fail, dominated by stochastic paraphrase — NOT environmental drift as initially hypothesised) and shipped a prompt-strengthening fix that reduces failure rate to 30% (+30pp pass-rate). The original Open Diagnostic Loop from Quick 004 is now CLOSED at the local gpt-4o level. Re-baselining against the deployed MGTI gpt-4o is operator-blocked until next deploy. Two new follow-up loops surfaced: **Quick 007 candidate** — allowlist over-strictness (10-20% of citation-validated answers fail entity-allowlist post-check via title-case drift like "Knowledge Base" vs source's "Knowledge base"); **Quick 008 candidate** — add stochastic regression eval (chip stability test, fire each chip N=20 times against dev model, assert ≥90% pass rate). The existing `citation-substring.eval.ts` is fixture-based with no LLM call so it never would have caught paraphrase issues — that gap is the load-bearing argument for Quick 008.*
