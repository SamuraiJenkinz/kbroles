# Phase 6: Telemetry, Evals & Pilot Hardening - Context

**Gathered:** 2026-04-24
**Status:** Ready for planning
**Decision mode:** User delegated all four areas to Claude's discretion based on project research. Pilot cohort/onboarding explicitly skipped — user will handle out-of-band.

<domain>
## Phase Boundary

Instrument the product end-to-end (App Insights), gate deploys on a grounding eval suite, operationalise a monthly content-steward loop that feeds real rejected-article signal back into evals, and expose dashboards/alerts so the pilot can be watched and measured. Pilot cohort selection and onboarding are owned outside this phase.

Explicitly in-scope: FDBK-03, TELE-01..04. Explicitly out-of-scope: new UI surfaces, new auth mechanics (Phase 5.1 is done), new grounding rules (Phase 1–2 validator is the source of truth), retroactive instrumentation of old sessions.

</domain>

<decisions>
## Implementation Decisions

### Telemetry schema & hashing

**Destination & transport**
- Application Insights is the single telemetry sink (mandated by roadmap)
- All events flow through a server-side `/api/telemetry` BFF endpoint → server emits to App Insights via `applicationinsights` Node SDK
- No direct browser → App Insights ingestion (avoids ad-blocker suppression, keeps PII scrubbing at one choke point, aligns with BFF pattern established in Phase 5.1)
- Client-originated events (citation_click_through, thumbs_rating, flag_a_gap_action) POST to `/api/telemetry` with `credentials:include`; server attaches session/user_id hashes from iron-session before emitting

**Event naming**
- snake_case, matching roadmap SC#1 verbatim: `session_start`, `role_selected`, `chip_vs_freeform`, `question_hash` (as a property, not its own event), `citation_returned`, `citation_click_through`, `thumbs_rating`, `fallback_trigger`, `flag_a_gap_action`
- Additional operational events: `chat_request_started`, `chat_request_completed`, `validator_flip`, `allowlist_block`, `ingress_error`, `eval_run_completed`

**Event shape**
- `name`: snake_case event name
- `customDimensions` (low-cardinality strings/enums): `role`, `source_id`, `section_id`, `error_code`, `reason`, `chip_or_freeform`, `chip_id`
- `customMeasurements` (numbers): `first_token_ms`, `total_answer_ms`, `citations_count`, `validator_flips`, `retries`, `chunk_count`
- `session_id_hash`: SHA-256 of iron-session sid + per-deploy salt — groups events per session without exposing cookie
- `user_id_hash`: SHA-256 of UPN + per-deploy salt — distinct-user counting without PII
- `request_id`: correlation ID already emitted by Phase 2 pino logger — carried through as a custom dimension so App Insights ↔ pino logs can be cross-referenced
- `message_id`: uuid per message (for 👎 event correlation per SC#4)

**Question hashing**
- Algorithm: SHA-256, truncated to 16 hex chars (64 bits) — distinguishes repeats, resists rainbow-tabling a 10-word English sentence
- Salt: loaded via `loadSecrets()` from AWS Secrets Manager at `/mmc/cts/kb-assistant/question-hash-salt`; same loader path as Phase 5.1 ENTRA_CLIENT_SECRET
- Pre-hash normalisation: lowercase, collapse whitespace, strip trailing `.?!` — so repeat queries hash identically for gap detection
- Salt rotates only at pilot-end (rotating within-pilot breaks repeat-query analysis)

**PII boundaries (non-negotiable)**
- NEVER emitted: raw question text, raw answer text, citation quotes, user email/UPN, user display name, session cookie, tenant ID
- ALWAYS emitted: question_hash, role, source_id, section_id, enum reason codes, message_id, session_id_hash, user_id_hash, request_id, numeric latencies/counts, error_code
- Pino server logs already scrubbed (Phase 2 SC#5) — App Insights mirror uses the same scrubber module

**Sampling & retention**
- Zero sampling for pilot (~50 users × ~20 queries/day = ~1K events/day — cheap)
- App Insights default 90-day retention covers an 8-week pilot + post-mortem
- Revisit both at v1.1 if scale warrants

### Eval CI gate behavior

**Two-tier cadence**
- **Fast evals** (deterministic, no LLM calls): `entity-allowlist` + `citation-quote-substring` — run on every PR via `.github/workflows/ci.yml`, cheap and fast, required status check
- **Slow evals** (LLM-judge or LLM-under-test): `negative-out-of-scope`, `paired-role-entailment`, `injection-refuse`, `positional-turn1-vs-turn8` — run nightly via scheduled GitHub Actions workflow (`.github/workflows/evals-nightly.yml`) and on-demand via `pnpm eval` or manual workflow dispatch

**Pre-deploy gate**
- `.github/workflows/deploy.yml` (the Phase 5.1 Windows runner pipeline) runs ONLY the fast deterministic evals as a hard gate
- Slow eval results are checked as a metadata gate: "latest nightly eval run must be green within last 48 hours, else block deploy" — keeps deploys fast and cheap while still preventing ship-on-red

**Failure policy**
- Fast evals red → block PR merge (branch protection required check)
- Slow nightly evals red → auto-create GitHub issue labelled `eval-regression`, assign Content Steward, post to `#kb-assistant-pilot` Teams channel; deploys continue if previous nightly was green within 48h (prevents single flake from blocking ship)
- Two consecutive nightly reds → deploy gate flips red, deploys blocked until investigated

**Thresholds (hard cutoffs per SC#2)**
- negative-out-of-scope ≥ 95%
- paired-role-entailment ≥ 98%
- citation-quote-substring ≥ 99%
- injection-refuse ≥ 95%
- entity-allowlist = 100%
- positional: |turn1_pass_rate − turn8_pass_rate| ≤ 2 pp
- No trend-based / statistical gates for v1 — adds complexity that a 4–8 week pilot doesn't warrant

**Flake handling**
- LLM-judge evals re-run 3x on fail, best-of-3 median vote
- Per-example pass rates tracked across runs; ≥10% run-to-run variance → quarantined to `ops/evals/flaky-review.json` for Content Steward review rather than silently dropped

**Cost budget**
- Judge model: `gpt-4o` (or MGTI equivalent) — ~$0.01/call
- Nightly: ~50 cases × 4 slow suites × 3-vote = ~600 calls/night → ~$6/night → ~$180/month
- Monthly spend cap set on the judge API key; cap breach → halt evals, open issue, notify steward

**Eval fixture layout**
- `src/evals/fixtures/<suite>.json` — version-controlled, PR-reviewable
- Per fixture: `{id, suite, role, input, expected_output_shape, notes, added_by, added_date, source}` — where `source` links back to the ServiceNow article ID or "synthetic"
- Steward's monthly pull appends (via PR, not auto) to `fixtures/real-query-coverage.json`

### Dashboards & alerts

**Audience & primary interface**
- Content Steward (primary, daily glance + monthly deep review)
- Pilot lead / PM (secondary, weekly check-in)
- Engineering (tertiary, alert response only)
- Single pre-built App Insights Workbook checked into repo at `ops/workbooks/kb-assistant-pilot.workbook.json` — version-controlled, rebuildable on tenant loss or App Insights resource recreation
- No scattered ad-hoc KQL in docs — the workbook is the source of truth

**Workbook sections**
1. **Usage** — DAU/WAU, sessions per user, chip vs freeform ratio, role distribution, geography if available
2. **Quality signals** — 👍/👎 rate, 👎 reason breakdown, fallback trigger rate, citation click-through rate per source_id
3. **Content gaps** — top 20 question_hash with 👎 or fallback attached (hash-only; steward matches to ServiceNow questions during review sessions)
4. **System health** — `/api/chat` 5xx rate, MGTI ingress status distribution, validator-flip rate, p50/p95 first-token latency, p50/p95 total-answer latency
5. **Eval trend** — per-suite nightly pass rates, 14-day sparkline, last-run timestamp

**Refresh cadence**
- Workbook auto-refreshes every 5 minutes (near-real-time is overkill for a pilot; 5 min is fine for a steward on a Monday review)

**Alert tiers (Azure Monitor → Action Group → Teams webhook to `#kb-assistant-pilot`)**

| Tier | Trigger | Destination | Rationale |
|------|---------|-------------|-----------|
| **P1 page** | `/api/chat` 5xx > 5% over 10 min | Teams `@channel` + email on-call | Production down for pilot |
| **P2 notify** | Fallback rate > 25% / 1h | Teams channel | Content-gap signal — steward review |
| **P2 notify** | 👎 rate > 15% / 24h | Teams channel | Quality degradation |
| **P2 notify** | Validator flip rate > 5% of responses / 24h | Teams channel | Model drift or prompt regression |
| **P2 notify** | Nightly slow-eval fail (2 consecutive) | Teams channel + GitHub issue | Deploy gate about to flip red |
| **P3 digest** | Weekly Monday 9 AM AEST | Steward + PM email | Usage summary, top flagged gaps, eval trend |

- MMC is a Teams shop — no Slack, no PagerDuty integration for v1 pilot

### Steward + rejected-article pull

**Ownership model**
- One named individual (not a role or team) — single point of accountability
- `docs/content-steward-runbook.md` contains `{{STEWARD_NAME}}` + `{{STEWARD_BACKUP_NAME}}` placeholders; a PR fills these before pilot day 1
- Backup named explicitly in same doc so vacations don't stall the monthly loop

**Cadence**
- Monthly, on the 1st business day of each month
- GitHub Actions scheduled workflow `.github/workflows/steward-monthly.yml` runs on the 1st → runs the pull script → opens a GitHub issue with checklist and links

**Pull mechanism: semi-automated script, human review gate**
- Script: `scripts/pull-servicenow-feedback.ts`
- Data source: ServiceNow REST API
  - `/api/now/table/kb_feedback` (thumbs/flag feedback rows)
  - `/api/now/table/kb_article?sysparm_query=workflow_stateINrejected,outdated,flagged` (article workflow state)
- Auth: service account read-only scope on `kb_feedback` + `kb_article` tables; credential in AWS Secrets Manager at `/mmc/cts/kb-assistant/servicenow-service-account`
- Output: `ops/rejected-articles/YYYY-MM.json` with `{article_id, title, rejection_reason, flagged_date, feedback_count, excerpt}` per record
- Script does NOT touch eval fixtures — it writes JSON + opens an issue

**Steward review → eval update loop**
- GitHub issue titled `Content Steward review: YYYY-MM rejected articles (N items)` — checklist format, one line per article
- Steward decides which deserve new eval fixtures (some rejections are noise, some signal real gaps)
- Updates land via PR: new entries appended to `src/evals/fixtures/real-query-coverage.json` + any paired-role or negative-out-of-scope fixtures
- Manual PR review is deliberate — auto-append would silently shift baselines and let noise in

**Artifacts**
- `docs/content-steward-runbook.md` — ownership, cadence, pull steps, PR template, escalation path; signed off pre-pilot-day-1 (satisfies SC#3)
- `docs/measurement-plan.md` — paired-metric baseline (pre-pilot ServiceNow flagged-rate snapshot) + monthly-pull comparison methodology; also signed off pre-pilot-day-1

**Baseline capture**
- Run `scripts/pull-servicenow-feedback.ts` once pre-pilot-day-1 against the trailing 90 days of ServiceNow state
- Output: `ops/rejected-articles/baseline-pre-pilot.json`
- Paired against monthly pulls during and after pilot → the paired-metric flagged-rate comparison required by SC#3 and Pitfall 14

### Claude's Discretion

The user explicitly delegated all four areas above. The following sub-decisions are also Claude's call during planning/implementation:
- Exact App Insights Node SDK version and initialisation pattern
- Exact pino ↔ App Insights correlation mechanism (e.g., a pino transport vs. a dual-emit helper)
- Eval judge model choice (gpt-4o vs o4-mini vs MGTI equivalent) — pick on cost/quality tradeoff at plan time
- Exact KQL queries inside the workbook
- Exact Teams webhook setup (incoming webhook vs Adaptive Card)
- Whether the steward-monthly workflow uses GitHub-hosted or the same Windows self-hosted runner as the deploy pipeline
- Whether to bundle the 👍/👎 event write into the existing `/api/chat` final event or a separate `POST /api/feedback` (lean toward separate endpoint for clean separation)
- Whether telemetry initialisation lives in `instrumentation.ts` (Next.js 15) or a custom bootstrap

</decisions>

<specifics>
## Specific Ideas

**Cross-references from earlier phases that lock the shape of this phase:**
- Phase 2 SC#5 already mandates structured logs `{request_id, role, validator_flips, refusal_fired, ingress_status_code}` with pino — App Insights emission must mirror the same shape and the same scrubber rules
- Phase 2 already installed pino + `serverExternalPackages` — reuse, don't replace
- Phase 5.1 `loadSecrets()` + AWS Secrets Manager + module cache is the established pattern — telemetry/question-hash/ServiceNow credentials all follow it
- Phase 5.1 iron-session gives us `session_id` from the cookie — hash it, never emit raw
- Roadmap Pitfall 14: "pre-registered measurement plan before pilot — confounders can't be fixed retroactively" — the measurement-plan.md signoff gate is the enforcement of this
- Roadmap Pitfall 1 for this phase: "negative eval is the primary grounding signal" — negative-out-of-scope suite is the canary; its threshold (≥95%) is the load-bearing eval
- Roadmap Pitfall 15: "real-query review during pilot expands eval coverage beyond the 13 chips" — the steward pull + PR loop is the operationalisation of this

**Known constraints from project state:**
- Single-instance Windows Server pilot (no distributed telemetry aggregation needed)
- AWS Secrets Manager is the secret store (not Azure Key Vault) — established in Phase 5.1
- MMC is a Teams shop, no Slack
- pnpm, Next.js 15, TypeScript, Vitest, Playwright — all already in place

</specifics>

<deferred>
## Deferred Ideas

- **Pilot cohort & onboarding** — explicitly deferred per user decision; handled outside this phase
- **Teams manifest / AUTH-03** — deferred to v1.1 (Phase 5 pivot note in ROADMAP)
- **Distributed telemetry** (multi-instance App Insights aggregation, session stickiness) — v1.1 if pilot scales beyond single-instance
- **Real-time alert-driven auto-rollback** on eval regression — v1.1; current plan is manual triage
- **Statistical / trend-based eval gates** (control charts, Bayesian thresholds) — v1.1 if hard cutoffs prove too noisy or too lax
- **Azure Key Vault migration** — currently on AWS Secrets Manager per Phase 5.1; migration is its own discussion
- **Slack or PagerDuty integration** — Teams-only for v1
- **Admin UI for eval fixture management** (REQUIREMENTS has ADMIN-01/02) — explicitly v2 per ROADMAP coverage-validation section
- **Citation feedback micro-survey** (CITFDBK-01) — explicitly v2
- **Conversation export / history persistence** (CONV-01..04) — explicitly v2

</deferred>

---

*Phase: 06-telemetry-evals-and-pilot-hardening*
*Context gathered: 2026-04-24*
