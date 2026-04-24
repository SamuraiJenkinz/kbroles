# KB Knowledge Assistant

## What This Is

A role-aware AI chat assistant for MMC / Marsh McLennan's Colleague Technology ServiceNow Knowledge Base. Grounded in three sanctioned sources — KB0020882 v9.0, KB0022991 v13.0, and the live ServiceNow Technical Knowledge article form — every answer cites the specific SOP section backing it and opens that section in an inline source panel. Delivered as a web app behind Entra ID SSO via the MMC-IT-blessed BFF pattern (server-side auth code flow + iron-session); Microsoft Teams tab wrapper deferred to v1.1.

## Core Value

Every answer is verifiable against the authoritative SOP — the user can read the cited source section without leaving the conversation. No ungrounded answers, no invented field names, steps, or approver names.

## Current State

**Shipped:** v1 Pilot Release (2026-04-24)

All 6 phases + Phase 5.1 BFF pivot complete. 47 of 49 v1 requirements delivered; AUTH-03 (Teams SSO) and DELV-03 (Teams tab manifest) intentionally deferred to v1.1 at Phase 5.1 pivot.

**Codebase:** ~22,500 LOC TypeScript across Next.js app (`src/`), Playwright E2E (`tests-e2e/`), and ops scripts (`scripts/`). 728/728 unit tests + 22/22 E2E green. Typecheck clean. `pnpm eval:fast` exits 0 on deterministic suites; `pnpm eval:slow` gated on `LLM_JUDGE_API_KEY`.

**Deploy path:** On-prem Windows Server (IIS reverse proxy → 127.0.0.1:3001 via Windows Scheduled Task running `node.exe server.js`), secrets in AWS Secrets Manager at `/mmc/cts/kb-assistant`, deploy via GitHub Actions self-hosted Windows runner with `/api/health` canary + auto-rollback.

**Auth:** Entra ID auth code flow via `@azure/msal-node` (BFF pattern — no tokens in browser); iron-session HttpOnly cookie; `KbAssistant.User` App Role gates pilot cohort.

**Observability:** Azure Monitor OpenTelemetry → App Insights with 15-event schema (question-hash-only, no PII). Workbook + 4 Bicep-provisioned alerts. Monthly ServiceNow rejected-article pull → GitHub issue; weekly Teams digest.

**Pending operator actions before pilot day 1** (16 items): GHA secrets wiring, AWS Secrets Manager provisioning, Entra App Registration, Windows Server deploy, workbook + alerts provisioning, Teams webhook validation, pilot cohort identification + role grant, measurement-plan sign-off with real Steward name, baseline flagged-rate capture.

## Next Milestone Goals

Candidate directions for v1.1 (to be clarified via `/gsd:new-milestone`):

1. **Teams delivery** — close AUTH-03 + DELV-03 deferrals. Reintroduce NAA alongside BFF (dual-host) so the Teams tab signs in silently; ship manifest v1.22.
2. **Pilot feedback loop** — execute the pilot, capture baseline-vs-post flagged-KB-rate per `measurement-plan.md`, feed real queries back into eval suites (Pitfall 15).
3. **Tech debt drain from Phase 6** — emit `eval_run_completed` events (TD-1), add ~5-10 KQL panels for unsurfaced events (TD-2), narrow trackEvent `name` param to `EventName` (TD-3), update mockChatSuccess fixture with message_id frame (TD-4), replace placeholder workbook GUID (TD-5), add Flow E E2E coverage when live-Entra CI becomes available (TD-6).
4. **Author-Lint (AUTHLINT-01..04)** — highest Author-metric lever per v2 requirements; naming-convention + Resolution-field completeness check chips.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- ✓ Role-select landing screen with SSO gate — v1 (Phase 3 + Phase 5.1)
- ✓ Role-aware greeting, suggested prompts, session-persisted role, Change-role reset — v1 (Phase 3)
- ✓ Grounded chat with full source text in system prompt (no RAG) — v1 (Phase 1 + Phase 2)
- ✓ One-citation-per-response contract with quote-substring validation — v1 (Phase 1 + Phase 2)
- ✓ Source panel auto-open on cite + update on follow-up + chip re-open — v1 (Phase 4)
- ✓ Document colour-coding per handover §14 (7 source types) — v1 (Phase 4)
- ✓ Out-of-scope fallback with flag-a-gap mailto — v1 (Phase 4)
- ✓ 13 suggested-prompt chips (5 Consumer + 8 Author) — v1 (Phase 2 + Phase 3)
- ✓ Entra ID SSO before role-select — v1 (Phase 5.1 BFF pattern)
- ✓ Admin-owned manual re-embed process for SOP updates — v1 (Phase 1 source registry)
- ✓ Primary outcome metric instrumented (rejected/flagged KB article rate) — v1 (Phase 6 steward loop)
- ✓ Measurement plan signed off pre-pilot — v1 (Phase 6 measurement-plan.md per Pitfall 14)

### Active

<!-- Current scope for next milestone. Populated by `/gsd:new-milestone`. -->

(None yet — start v1.1 via `/gsd:new-milestone`)

### Deferred to v1.1 at Phase 5.1 Pivot

- **Microsoft Teams tab wrapper** (AUTH-03 + DELV-03) — deferred because BFF pattern serves web-only; adding Teams requires reintroducing NAA alongside BFF. Teams-tab candidate scoped in 05.1-RESEARCH but excluded from v1 roadmap per separate user decision.

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Adaptive Learning Path (handover §17, "Idea 3") — deferred to a separate future milestone, not this build
- ServiceNow write-back (create / edit / publish articles from the assistant) — read-only citations; users still author in ServiceNow itself
- RAG / vector retrieval — corpus fixed at 3 docs for v1; full source text fits in the 128K context window. v1 proved stuff-the-context works; revisit only if corpus grows beyond single-KB scope.
- Multi-language support — English only; default Language field per ServiceNow form
- Non-Colleague-Technology knowledge bases — this assistant is scoped to one KB
- Per-user conversation history — session-only, nothing persisted server-side
- Scheduled sync from ServiceNow — manual re-embed per SOP release is sufficient for 3 docs updated rarely
- Broad internal launch in v1 — pilot cohort only; general availability is a post-pilot decision

## Context

- **Organisation:** MMC / Marsh McLennan, Colleague Technology (Paul Beswick's org, Workday functional code).
- **Source corpus loaded into system prompt verbatim:**
  - KB0020882 v9.0 — Submit New/Update Technical Knowledge Article SOP (author: Matthew Renner)
  - KB0022991 v13.0 — Technical Knowledge Base Article Management SOP (author: Edmar Roseno)
  - ServiceNow Technical Knowledge article form field map (derived from handover §5; sample record KB18801781)
- **Personas:**
  - **Primary success lane — KB Author / SME.** Tier II/III support groups, SMEs, Knowledge team members. Need help with form-field completion, naming convention, resolution content requirements, and the publish/edit/retire/delete lifecycle. Success is measured on this lane.
  - **Secondary lane — Knowledge Consumer.** Tier I support, analysts, all MMC Tech colleagues. Need help finding articles, flagging incorrect content, and linking to articles correctly.
- **Validated prototype exists.** HTML mockup prototype validated in workstream review. Two chat-panel mockups produced (Consumer, Author); landing / role-select screen and source panel are specified but not yet mocked.
- **Known content gaps (handover §19):**
  - No sanctioned example articles yet (2–3 approved published articles) — constrains "what good looks like" guidance
  - Full ServiceNow Category picklist not yet provided
  - Review SLA escalation path not documented in current SOPs — assistant cannot answer "my article is stuck, what now?" until documented
- **Stakeholders:** Richard Danilowicz (KB Programme Lead / approver), Simina Savinescu (Workstream Lead), Tabatha Natacci-Kenyon (Workstream Co-lead / SME for Author experience), Kevin Taylor (AI/Tooling Architect, also this project's owner), Rhiannon Francis (Learning Designer).
- **Publishing approvers (as referenced by the assistant):** Richard Danilowicz, Samantha Eaton, Nicholas Hile, Matthew Renner, Julie Ramos, Brandon Young, Spencer Barratt.

## Constraints

- **LLM runtime:** Azure OpenAI via MGTI corporate ingress at `https://stg1.mmc-dallas-int-non-prod-ingress.mgti.mmc.com/coreapi/openai/...`. OpenAI-compatible SDK, overridable base URL, `api-key` auth header (not Bearer). Dev uses a direct OpenAI key for local work; server uses corporate ingress. Env-driven configuration throughout. **Validated in Phase-0 smoke + production code path.**
- **Model:** gpt-4o (full), not gpt-4o-mini. Grounding-adherence bar is non-negotiable; full 4o is the safer choice for "never hallucinate, always cite" discipline. **Validated by eval thresholds (neg-oos ≥95%, paired-role ≥98%, citation-substring ≥99%).**
- **Auth:** Entra ID / Azure AD SSO required from day one. **Shipped via BFF pattern (server-side msal-node + iron-session) per MMC-IT-blessed xmcp reference; NOT via SPA+NAA as originally planned.**
- **Hosting:** **On-prem Windows Server (IIS reverse proxy + Windows Scheduled Task + AWS Secrets Manager) per MMC-IT xmcp pattern — NOT Azure App Service as originally planned.** Pivoted at Phase 5.1 after xmcp/Atlas reference revealed Azure App Service unlikely to be MMC-IT-approved.
- **Data:** Session-only state. No PII storage. No per-user conversation history. No customer data leaves the LLM request path. Corporate LLM traffic stays within MGTI ingress. **Validated by PII-absence test at route.test.ts:660-667.**
- **Grounding discipline:** Responses must cite one specific section of one approved source. No invented field names, workflow steps, or approver names. Off-scope questions hit the documented fallback, not a best-guess answer. **Enforced by quote-substring validator + entity allowlist post-check + negative-out-of-scope eval suite.**
- **Source-update process:** Manual. When a sanctioned SOP version changes (e.g. KB0022991 v13 → v14), an owner edits the source-text file in the repo, opens a PR, redeploys. Auditable and version-controlled.
- **Timeline:** No hard date. Quality bar on Author-first experience is the gating factor, not a release date. Pilot launches when it's right. **v1 shipped in 3 days (2026-04-22 → 2026-04-24) at quality bar; pilot execution is operator-gated.**

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Stuff-the-context grounding, no RAG | 3 docs, ~10–15K tokens, fits comfortably in 128K context window. Eliminates retrieval failure modes; citations are deterministic. Easy migration path to RAG if corpus grows later. | ✓ Good — v1 shipped with zero retrieval-based bugs; citation validator passes; eval thresholds met |
| gpt-4o (full) over gpt-4o-mini | Grounding adherence and "never hallucinate" bar weigh more than per-request cost at this corpus size. | ✓ Good — eval suites clear thresholds (neg-oos ≥95%, paired-role ≥98%, citation-substring ≥99%) |
| Azure OpenAI via MGTI corporate ingress | Non-negotiable — corporate LLM traffic stays on MMC infrastructure. OpenAI-compatible SDK with overridable base URL makes dev/prod swap trivial. | ✓ Good — Phase-0 smoke proved dual-mode factory swap; production path unchanged since Phase 1 |
| Web app first, Teams tab second | Same codebase, same SSO, same URL. Web delivers faster to pilot; Teams is a manifest wrapper, not a separate build. | ⚠️ Revisit — Teams tab deferred to v1.1 at Phase 5.1 pivot; BFF pattern is web-only, adding Teams requires reintroducing NAA (dual-host) |
| Entra ID SSO from day one | Required for Teams integration anyway, expected for any MMC-hosted app; simpler to build it in than retrofit. | ✓ Good — shipped via BFF pattern in Phase 5.1 |
| Pilot cohort before broad launch | Author-first success signal (article quality) requires a contained group to measure and iterate against before general availability. | — Pending — pilot cohort identification operator-gated |
| Session-only conversations | Removes storage, compliance, PII, and retention surface entirely. Matches the "lookup assistant" nature of the product. Zero-regret choice. | ✓ Good — zero PII-absence test failures; measurement-plan pre-registration per Pitfall 14 clean |
| Manual SOP re-embed per release | 3 docs update rarely. No automation warranted. Change is auditable (PR history), reversible, and cheap. | ✓ Good — source registry + validator pattern holds |
| Quality-driven timeline, no hard date | The point of the product is measurable article-quality improvement. Shipping too early on a low-quality grounding layer poisons the outcome metric. | ✓ Good — v1 hit quality bar before any deploy attempt; measurement plan signed off pre-pilot |
| Pivot Phase 5 → 5.1 (xmcp pattern) | xmcp/Atlas reference revealed Phase 5 built SPA+NAA auth + Azure App Service deploy — fundamentally different architecture than MMC-IT blessed BFF pattern. Option 1 (pivot) chosen over Option 2 (keep, unlikely MMC-IT approval) or Option 3 (defer rework, carry mismatched code). | ✓ Good — 8 Phase-5.1 plans shipped in one day; Phase 5 keepable artifacts (health, access-denied, ErrorCard) preserved; memory captured for future MMC-internal apps |
| BFF pattern over SPA+NAA (Phase 5.1) | MMC-IT xmcp/Atlas proves the blessed pattern is confidential-client auth code flow + iron-session + App Role gating. Matches deploy target (on-prem Windows), secrets target (AWS Secrets Manager), and MMC security posture (no tokens in browser). | ✓ Good — auth flow ships matching MMC-IT pattern; load-bearing pilot simplifications (single-instance msal-node, module-level CCA) explicitly scoped for v1.1 distributed-state follow-up if scales |
| On-prem Windows deploy over Azure App Service | xmcp precedent + AWS Secrets Manager dependency pointed to on-prem; Azure App Service was speculative. IIS reverse proxy with SSE-safe settings (`responseBufferLimit=0`, `X-Accel-Buffering:no`) handles streaming. | — Pending production deploy — self-hosted Windows runner workflow + Scheduled Task + /api/health canary + auto-rollback shipped; operator execution pending |
| Eval gate in CI with emergency bypass | Nightly evals must gate deploy (Pitfall 1 — negative eval is primary grounding signal) but judge-API flakes can't brick production fixes during incidents. `skip_eval_gate=true` workflow_dispatch input documented in runbook. | ✓ Good — audit caught GAP-1 (bypass was silently broken by GitHub Actions skipped-dependency default); fixed inline with one-line `if:` on deploy job |

---
*Last updated: 2026-04-24 after v1 milestone completion*
