# Roadmap: KB Knowledge Assistant

## Overview

Six phases that start with the load-bearing grounding layer (citation contract, source registry, quote validator, MGTI smoke tests) and build outward through the server streaming route, role-aware chat UI, source panel and fallback UI, SSO + Teams delivery, and finally telemetry + eval hardening in service of a measurable pilot. Every phase delivers something a person can see or verify; the grounding evals act as the master gate across the whole build.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Grounding Foundation** — Source registry, citation contract, validator, LLM client, and MGTI smoke tests
- [x] **Phase 2: Chat Backend (BFF)** — Streaming /api/chat with citation hold, fallback trigger, and entity-allowlist post-check
- [x] **Phase 3: Role Experience & Chat UI** — Role select, role-aware chat, input, messages, feedback, and utility actions
- [x] **Phase 4: Source Panel, Trust & Fallback UI** — Source panel, colour coding, freshness, about-tooltip, distinct fallback UI, flag-a-gap
- [ ] **Phase 5: SSO & Teams Delivery** — NAA client auth, Teams manifest, App Service deployment, CI/CD (paused — pivoted to 5.1)
- [x] **Phase 5.1: MMC-IT BFF pivot (xmcp pattern)** (INSERTED) — Server-side Entra auth + iron-session + on-prem Windows deploy
- [x] **Phase 6: Telemetry, Evals & Pilot Hardening** — App Insights schema, eval suite hardening, rejected-article pull, pilot prep

## Phase Details

### Phase 1: Grounding Foundation

**Goal**: The grounding layer exists, is framework-agnostic, and has been proved to work end-to-end against both the local OpenAI dev path and the MGTI corporate ingress — before any UI or chat route exists.

**Depends on**: Nothing (foundation)

**Requirements**: GRND-01, GRND-02, GRND-03, GRND-04, GRND-05, GRND-06, CORP-01

**Success Criteria** (what must be TRUE):
  1. A developer can run `pnpm test` and see snapshot tests on `composeSystemPrompt(role)` pass for both `consumer` and `author` roles, including the role-specific few-shots and the citation contract block
  2. The quote-substring validator rejects a synthetic response with a fabricated `quote` and passes a known-good response whose `quote` appears verbatim in the source registry
  3. A smoke script hits both (a) direct OpenAI and (b) MGTI ingress using the same `createLlmClient()` factory — only env vars differ — and receives a structured `{ can_answer, answer, citations[] }` response with `response_format: json_schema` strict mode honoured on both
  4. All five Phase-0 smoke resolutions are documented and green: MGTI `baseURL` suffix, json_schema strict-mode support, streaming chunk cadence through APIM, Entra SPA + `brk-multihub://` consent, corporate CA chain for outbound HTTPS
  5. The three source files (KB0020882 v9.0, KB0022991 v13.0, Form schema) exist in `src/grounding/sources/` as verbatim markdown with XML boundary tags and `<!-- section:... -->` anchors, and the registry loader produces a typed `Source[]` with section IDs matching the schema enum

**Pitfall focus**: Pitfall 2 (citation drift — quote validator), Pitfall 10 (ingress streaming cadence), Pitfall 11 (ingress auth break — dual-mode factory), Pitfall 6 (fabricated entities — allowlist extracted here), Pitfall 7 (prompt-injection-resistant system prompt design)

**Plans**: 5 plans

Plans:
- [ ] 01-scaffold-registry-schema-PLAN.md — Scaffold Next.js project; ship source registry, citation schema, entity allowlist
- [ ] 02-citation-validator-PLAN.md — Quote-substring validator with fallback flip on total strip
- [ ] 03-llm-client-factory-PLAN.md — Dual-mode createLlmClient() + streamAnswer() facade with strict-mode fallback
- [ ] 04-system-prompt-composer-PLAN.md — Role-aware composeSystemPrompt() with layered constants, snapshot-tested
- [ ] 05-phase0-smoke-PLAN.md — Phase-0 smoke harness against dev OpenAI and MGTI ingress; evidence doc

---

### Phase 2: Chat Backend (BFF)

**Goal**: A streaming `/api/chat` route that composes the role-aware system prompt, proxies to the LLM, enforces the citation validator and entity allowlist, streams `answer` tokens immediately, holds `citations` until completion, and flips to the fallback path when the model returns `can_answer: false` or all citations fail validation.

**Depends on**: Phase 1 (needs registry, schema, validator, client)

**Requirements**: GRND-07, FBK-02, CORP-02

**Success Criteria** (what must be TRUE):
  1. A `curl` to `/api/chat` with a known-good Author prompt streams `answer` text chunks and emits a final `done` event whose `citations[]` has been validated against the source registry (quote substring + section ID + enum source_id all pass)
  2. A `curl` with an adversarial out-of-scope prompt returns `can_answer: false` and the BFF emits a single `fallback` event that downstream UI can treat distinctly — no `citations[]` leaks
  3. A synthetic response containing a fabricated approver name or a fabricated `KB\d{7}` token is blocked by the entity-allowlist post-check and flipped to fallback; the allowlist is loaded at boot from `src/grounding/registry.ts`
  4. A `/api/prompts?role=consumer|author` endpoint returns the role-specific chip list (5 Consumer, 8 Author) sourced from handover §16 and server-validated
  5. Structured logs capture `{ request_id, role, validator_flips, refusal_fired, ingress_status_code }` for every chat request — no raw user-question text

**Pitfall focus**: Pitfall 2 (validator is the deterministic guard), Pitfall 5 (server refuses to re-narrate a "workaround" — fallback wording enforced), Pitfall 6 (allowlist post-check), Pitfall 7 (user text never flows into trusted system-prompt slots), Pitfall 11 (ingress auth quirks caught here too), Pitfall 12 (429 handling + exponential backoff)

**Plans**: 4 plans

Plans:
- [x] 01-infra-ops-setup-PLAN.md — Close Phase-1 carry-forward entry gates: .env handling ops doc, prod-mode Phase-0 smoke (checkpoint), install pino + serverExternalPackages, stub auth middleware, logger module (complete 2026-04-22)
- [x] 02-chat-primitives-PLAN.md — Pure library units: SSE types + encoder, partial-JSON answer tracker, entity allowlist post-check, AsyncSemaphore, request schema parser, SUGGESTED_PROMPTS (13 chips) (complete 2026-04-22)
- [x] 03-upstream-resilience-PLAN.md — Extend streamAnswer: typed error classes, explicit refusal detection, bounded retry wrapper (429/5xx/network), AbortSignal total-timeout hook, inter-chunk v1.1 deferral (complete 2026-04-22)
- [x] 04-route-wiring-PLAN.md — POST /api/chat SSE pipeline, GET /api/prompts, route-level Vitest tests, docs/api-chat-contract.md for Phase-3 hand-off (complete 2026-04-22)

---

### Phase 3: Role Experience & Chat UI

**Goal**: A user lands on the role-select screen, picks Consumer or Author, and has a working multi-turn chat experience with role-aware greeting, suggested-prompt chips, stop/new-conversation/change-role affordances, keyboard submit, copy-answer with citation suffix, thumbs feedback, hover timestamps, and a graceful error/retry when the LLM path fails.

**Depends on**: Phase 2 (needs BFF streaming endpoint)

**Requirements**: AUTH-02, ROLE-01, ROLE-02, ROLE-03, ROLE-04, ROLE-05, CHAT-01, CHAT-02, CHAT-03, CHAT-04, CHAT-05, CHAT-06, CHAT-07, FDBK-01, FDBK-02, UTIL-01

**Success Criteria** (what must be TRUE):
  1. A user arriving at the app sees two role cards ("Knowledge Consumer" / "KB Author / SME"), picks one, and sees a role-aware greeting + the correct chip set (5 Consumer or 8 Author) from handover §16
  2. An Author asks "what goes in the Short description field?" via a chip; the three-dot typing indicator appears, the answer streams in with KB/Me avatars, relative timestamps appear on hover, and a 👍/👎 pair is attached to the answer
  3. During an in-flight response, clicking "Stop response" cancels the stream cleanly; clicking "New conversation" clears the chat without changing role; clicking "Change role" shows a confirm, clears conversation state, and returns to the role-select screen
  4. Pressing `Enter` submits the input; `Shift+Enter` inserts a newline; when the LLM/MGTI path returns 5xx, the chat renders an error card with a "Retry" affordance instead of a broken message
  5. Clicking "Copy answer" copies the assistant text with `(Source: KB0022991 · Flagging Articles)` appended; clicking 👎 opens a fixed-option dropdown ("hallucinated / wrong citation / incomplete / other") with no free-text field

**Pitfall focus**: Pitfall 4 (role contamination — role is an explicit parameter in every request; role-change wipes state), Pitfall 13 (successor-role contamination on change), Pitfall 16 (accessibility — colour is never the only signal), Pitfall 17 (session-loss on refresh — local-storage buffer), Pitfall 18 (Change Role needs confirm before wiping work)

**Plans**: 6 plans

Plans:
- [x] 01-scaffold-ui-stack-PLAN.md — Scaffold Tailwind v4 + Radix + lucide + RTL/jsdom/Playwright + root app shell (complete 2026-04-22)
- [x] 02-pure-primitives-PLAN.md — Mirrored wire types, pure chatReducer, formatRelative, sourceTitles (complete 2026-04-22)
- [x] 03-persistence-and-stream-hooks-PLAN.md — useRolePersistence, useDraftBuffer, useChatStream with Pitfall-4 + Pitfall-5 tests (complete 2026-04-22)
- [x] 04-presentational-components-PLAN.md — 13 stateless components + cn helper; InputBar forwardRef + Message/List onRetry contracts locked (complete 2026-04-22)
- [x] 05-chat-page-wiring-PLAN.md — ChatPage + ChatSurface wiring with Pitfall-13 ordering + retry flow; page.tsx replaced (complete 2026-04-22)
- [x] 06-e2e-success-criteria-PLAN.md — 14 Playwright specs covering all 5 SCs + Pitfall-13 + Pitfall-17 regressions (complete 2026-04-22)

---

### Phase 4: Source Panel, Trust & Fallback UI

**Goal**: Every cited response opens the source panel to the exact cited section with correct colour coding and an Open-in-ServiceNow link; citation chips in the chat re-open the panel when clicked; ungrounded responses render a visually distinct fallback with a working "flag a gap" affordance; the chat header carries a freshness/version indicator and a first-run About-this-assistant tooltip.

**Depends on**: Phase 3 (needs chat + citation chips to exist)

**Requirements**: PANE-01, PANE-02, PANE-03, PANE-04, PANE-05, PANE-06, PANE-07, FBK-01, FBK-03, FBK-04, TRST-01, TRST-02

**Success Criteria** (what must be TRUE):
  1. An Author asking "what goes in the Resolution field?" sees a cited answer; the right-side source panel opens automatically to KB0020882 §7 Resolution on the first cited response, with the correct blue document badge and the structured section content rendered in the body
  2. When the assistant cites a different section on a follow-up, the panel updates its content without closing; clicking a citation chip in an earlier message re-opens and re-loads the panel to that earlier source
  3. The panel footer shows an "Open in ServiceNow ↗" link using the correct permalink URL (`https://mmcnow.service-now.com/kb_view.do?sysparm_article=KB0020882`); the header shows the colour-coded document badge (KB0020882 blue / KB0022991 amber / Form purple / Flagging red / Publishing green / Attachments purple / Categories amber per handover §14)
  4. An out-of-scope question triggers a fallback card with the exact handover §15 copy, a visually distinct border + icon treatment (not styled like a normal answer), and a one-click "Flag this gap to the CTSS Knowledge team" button that pre-populates a mailto/Teams link with the unanswered question
  5. The chat header shows "Grounded in KB0022991 v13.0 · KB0020882 v9.0 · Form schema YYYY-MM-DD"; a first-run dismissible "About this assistant" tooltip covers what it answers, what it doesn't, what it's grounded in, and how to flag a gap

**Pitfall focus**: Pitfall 19 (anchor IDs derived from section markers, not titles — verified by automated anchor-check), Pitfall 20 (fallback visually distinct so users don't mistake it for a grounded answer), Pitfall 16 (icon pairing on every colour-coded element for accessibility)

**Plans**: 4 plans

Plans:
- [x] 04-01-source-exposure-and-badge-constants-PLAN.md — canonical sourceBadges.ts + `/api/sources` + `/api/config` + CONTENT_STEWARD_EMAIL env var + dated SNOW_FORM version (complete 2026-04-23)
- [x] 04-02-source-panel-and-chip-integration-PLAN.md — SourcePanel (Radix Dialog desktop pane + mobile drawer) + colour-coded clickable citation chips + ChatSurface wiring (complete 2026-04-23)
- [x] 04-03-fallback-card-trust-header-about-tooltip-PLAN.md — FallbackCard (Pitfall 20 three-signal) + flag-a-gap mailto + freshness line + About Popover (complete 2026-04-23)
- [x] 04-04-e2e-success-criteria-and-anchor-check-PLAN.md — 5 Playwright specs for SC#1–5 + anchorIds.test.ts (Pitfall 19) + Pitfall 16 + Pitfall 20 E2E assertions (complete 2026-04-23)

---

### Phase 5: SSO & Teams Delivery

**Goal**: Entra ID SSO gates the app in both the standalone web client and inside a Microsoft Teams tab, using NAA with the same codebase; the app is deployed to MMC-sanctioned Azure App Service (Linux, Node 20.9+) with a CI/CD pipeline from the main branch; the Teams manifest (schema 1.22, `webApplicationInfo.nestedAppAuthInfo`, `brk-multihub://` redirect) sideloads and runs in the Teams client.

**Depends on**: Phase 3 (UI must exist for auth to wrap), parallelisable with Phase 4

**Requirements**: AUTH-01, AUTH-03 (deferred to v1.1), DELV-01 (reassigned to on-prem Windows — Phase 5.1), DELV-02, DELV-03 (deferred to v1.1), DELV-04

**Success Criteria** (what must be TRUE):
  1. An MMC colleague visiting the standalone MMC corporate URL is redirected to Entra ID, signs in with SSO, and lands on the role-select screen; a non-MMC tenant token is blocked at the auth middleware (tenant allowlist)
  2. The same URL sideloaded as a Teams personal tab signs in silently via `createNestablePublicClientApplication` + `microsoftTeams.getAuthToken` — no popup, no second sign-in — on both Teams desktop and Teams web clients
  3. `src/auth/detectHost.ts` correctly distinguishes Teams-host from browser-host; each path uses the matching auth module; API routes validate the token the same way regardless of host
  4. A commit to `main` triggers the CI/CD pipeline (GitHub Actions or Azure DevOps), builds the Next.js `output: 'standalone'` bundle, and deploys to the Azure App Service Linux instance; the deploy smoke-tests `/api/chat` against a canary MGTI call before marking green
  5. The Teams manifest validates against schema 1.22, sideloads in the Teams Admin Center, and the tab appears in the Teams personal app tray with the correct icon and name

**Pitfall focus**: Pitfall 9 (Teams SSO full-client-matrix test — desktop + web + mobile), Pitfall 11 (ingress auth break verified from the Azure-hosted environment, not just from laptop), Pitfall 13 (SSO edge cases — pilot whitelist, guests blocked), Pitfall 8 (deployment pipeline wires the manual re-embed PR flow)

**Plans**: 5 plans (paused 2026-04-23 — superseded by Phase 5.1 pivot)

Plans:
- [ ] 05-01-auth-foundation-PLAN.md — deps install (@azure/msal-browser, @azure/msal-react, @microsoft/teams-js, jose, mock-jwks), .npmrc hoisted linker, ENTRA_* env vars, detectHost primitive, MSAL config + nestable singleton
- [ ] 05-02-health-access-denied-token-expired-PLAN.md — /api/health canary, /access-denied full-page block, token_expired 9th ErrorCode + ErrorCard Sign-back-in CTA
- [ ] 05-03-middleware-jwt-validation-PLAN.md — replace _middleware.ts stub with jose+JWKS JWT validation; tenant allowlist sole gate; wire token_expired/access_denied/unauthorized into /api/chat
- [ ] 05-04-auth-provider-redirect-bridge-signout-PLAN.md — AuthProvider + COOP redirect bridge, tokenProvider (silent→redirect browser / silent→popup Teams), Bearer wiring in useChatStream, Header sign-out with draft/in-flight confirm
- [ ] 05-05-teams-manifest-cicd-deploy-PLAN.md — Teams manifest v1.22 + icons + README with Pitfall-9 matrix, GitHub Actions OIDC deploy workflow with /api/health canary, provisioning + sideload human checkpoint

---

**Pivot note (2026-04-23):** Phase 5 as originally scoped (SPA + NAA + Azure App Service) is superseded by Phase 5.1 below. The Phase 5 plans 05-01 through 05-05 built a working SPA+NAA system; Phase 5.1 replaces that with the MMC-IT-blessed BFF pattern (server-side Entra auth code flow, iron-session cookie, on-prem Windows deploy). Requirements AUTH-03 (Teams SSO) and DELV-03 (Teams manifest) are deferred to v1.1 — a Phase 6.1 Teams-tab candidate is mentioned in RESEARCH but is NOT on the v1 roadmap (separate user decision).

### Phase 5.1: MMC-IT BFF pivot (xmcp pattern) (INSERTED)

**Goal:** Replace Phase 5's SPA+NAA browser auth with the MMC-IT-blessed BFF pattern — server-side Entra auth code flow (`@azure/msal-node`), iron-session HttpOnly cookie, App Role gating (`KbAssistant.User`), `/api/me` BFF contract — and ship a working deploy path to the on-prem Windows Server box (IIS reverse proxy + Windows Scheduled Task + AWS Secrets Manager) with a user-executable Entra App Registration setup doc as the handoff artifact.

**Depends on:** Phase 5 (Phase 5's 05-01 through 05-05 plans complete; this phase pivots their output)

**Requirements addressed:** AUTH-01, DELV-01 (on-prem Windows — reassigned from Azure App Service), DELV-02, DELV-04
**Requirements deferred to v1.1:** AUTH-03 (Teams SSO), DELV-03 (Teams manifest)

**Success Criteria** (what must be TRUE):
  1. An MMC colleague with `KbAssistant.User` App Role assignment visits `https://<windows-host>` and is redirected to Entra ID, signs in, and lands on the role-select screen — session established via iron-session HttpOnly cookie.
  2. A user without the `KbAssistant.User` role is redirected to `/access-denied` with role-missing copy (not tenant-wrong copy).
  3. `/api/chat` returns 401 `{error:'token_expired'}` on session expiry (client ErrorCard "Sign back in" button redirects to `/api/login`), 403 `{error:'access_denied'}` on forbidden role, 401 `{error:'unauthorized'}` on no session.
  4. The app deploys to the on-prem Windows Server box via GitHub Actions self-hosted runner; the Windows Scheduled Task `KbAssistant` runs `node.exe server.js`; IIS reverse proxy terminates TLS and forwards to 127.0.0.1:3001 with SSE-safe settings (`responseBufferLimit=0`, `X-Accel-Buffering:no`).
  5. The user can complete the Entra App Registration setup end-to-end by following `docs/entra-app-registration-setup.md` without back-and-forth; secrets land in AWS Secrets Manager at `/mmc/cts/kb-assistant` and the deployed app reads them via the AWS SDK credential chain.

**Pitfall focus**: Pitfall 1 (runtime:'nodejs' mandatory on auth routes), Pitfall 3 (single-instance msal-node PKCE state — load-bearing pilot decision), Pitfall 4 (redirect URI exact match — AADSTS50011 guard), Pitfall 5 (roles claim undefined-vs-empty), Pitfall 6 (IIS SSE buffering), Pitfall 8 (Playwright can't seal iron-session cookie — route-mock /api/me instead), Pitfall 9 (NEXT_PUBLIC_ENTRA_* dead-code removal), Pitfall 10 (Next.js 15 async cookies()), Pitfall 11 (msal-node CCA singleton).

**Plans:** 8 plans

Plans:
- [x] 05.1-01-deps-env-secrets-foundation-PLAN.md — Install @azure/msal-node + iron-session + @aws-sdk/client-secrets-manager; add SESSION_SECRET/ENTRA_CLIENT_SECRET/APP_BASE_URL/AWS_* env fields; loadSecrets() module with AWS-first / env-fallback / module cache (complete 2026-04-23)
- [x] 05.1-02-server-auth-library-msalclient-session-PLAN.md — msalClient.ts singleton (ConfidentialClientApplication) + session.ts iron-session wrappers (getSessionOptions/getSession/saveSession/clearSession) (complete 2026-04-23)
- [x] 05.1-03-auth-route-handlers-PLAN.md — /api/login + /api/auth/callback + /api/logout + /api/me route handlers (runtime:'nodejs'; xmcp-matching shapes) with ~15 unit tests (complete 2026-04-23)
- [x] 05.1-04-middleware-chat-route-access-denied-PLAN.md — Swap _middleware.ts from jose JWT to iron-session cookie; chat route forbidden (was wrong_tenant) discriminant; access-denied copy reflects role-failure (complete 2026-04-23)
- [x] 05.1-05-frontend-bff-authprovider-rewire-PLAN.md — Replace MsalProvider with BFF AuthProvider (fetch /api/me); ChatPage via useAuth; strip Bearer attach from useChatStream (credentials:include); sign-out via /api/logout + window reload (complete 2026-04-23)
- [x] 05.1-06-surgical-removal-deps-fixture-PLAN.md — Delete dead @azure/msal-browser/@azure/msal-react/@microsoft/teams-js/jose/mock-jwks; delete src/auth/{detectHost,msalConfig,msalInstance,tokenProvider}.ts + redirect bridge + teams/; rename mockMsal.ts → mockSession.ts (Pitfall 8); strip NEXT_PUBLIC_ENTRA_* (complete 2026-04-23)
- [x] 05.1-07-deploy-workflow-windows-runner-PLAN.md — Rewrite .github/workflows/deploy.yml for self-hosted Windows runner + Windows Scheduled Task + /api/health canary + auto-rollback; rename AZURE_WEBAPP_HOSTNAME → APP_HOSTNAME in remote smoke spec (complete 2026-04-23)
- [x] 05.1-08-operator-docs-entra-windows-roadmap-PLAN.md — docs/entra-app-registration-setup.md + docs/deploy-windows.md + env-handling.md AWS Secrets Manager update + ROADMAP.md AUTH-03/DELV-03 deferral annotations (complete 2026-04-23)

**Details:**
Full research at `.planning/phases/05.1-mmc-it-bff-pivot-xmcp-pattern/05.1-RESEARCH.md`. Translates xmcp (Atlas Exchange Infrastructure) auth pattern from Python/Flask to Node/Next. Single-instance pilot (module-level msal-node CCA + iron-session stateless cookie — distributed state deferred to v1.1 follow-up if scales). AUTH-03 (Teams SSO) + DELV-03 (Teams manifest) deferred to v1.1 per RESEARCH + planning context.

---

### Phase 6: Telemetry, Evals & Pilot Hardening

**Goal**: A pre-registered telemetry schema is live in Application Insights capturing session / role / chip-vs-freeform / citation-click-through / 👍/👎 / fallback-fire events with question-hash-only anonymisation; the grounding eval suite (paired-role, positional, injection, negative out-of-scope, entity-allowlist) gates deploys; a named Content Steward owns the monthly rejected / flagged article pull from ServiceNow; the pilot cohort is identified, onboarded, and actively using the assistant.

**Depends on**: Phases 1–5 (all product surfaces must exist; evals validate the whole stack; telemetry instruments the full user journey)

**Requirements**: FDBK-03, TELE-01, TELE-02, TELE-03, TELE-04

**Success Criteria** (what must be TRUE):
  1. A pilot-cohort session in Application Insights shows the complete event stream: `session_start`, `role_selected`, per-message `chip_vs_freeform`, `question_hash`, `citation_returned {source_id, section_id}`, `citation_click_through`, `thumbs_rating + reason?`, `fallback_trigger`, `flag_a_gap_action` — with raw question text absent from every record
  2. The full eval suite runs via `pnpm eval` and reports per-suite pass rates: negative-out-of-scope ≥95%, paired-role entailment ≥98%, citation-quote-substring ≥99%, injection-refuse ≥95%, entity-allowlist 100%, positional (turn 1 vs turn 8) within 2pp; a red suite fails the deploy gate
  3. A written measurement-plan document names the Content Steward, the monthly cadence, the ServiceNow data source (knowledge feedback tasks + article workflow state), and the paired-metric baseline-capture process (pre-pilot flagged-rate snapshot); the plan is signed off before pilot day 1
  4. A 👎 thumbs-down on a message writes `{ message_id, role, rating: "down", citation_source_id, citation_section_id, reason: "wrong citation" }` to telemetry within 5 seconds, and the dashboard shows the event within one refresh cycle
  5. The identified pilot cohort has been onboarded (access granted, Teams tab installed or URL bookmarked, About-tooltip seen), and the weekly usage report shows at least one session from ≥50% of the cohort within the first two pilot weeks

**Pitfall focus**: Pitfall 1 (negative eval is the primary grounding signal), Pitfall 3 (multi-turn + positional eval), Pitfall 8 (version-poller + named Content Steward), Pitfall 14 (pre-registered measurement plan before pilot — confounders can't be fixed retroactively), Pitfall 15 (real-query review during pilot expands eval coverage beyond the 13 chips)

**Plans**: 8 plans

Plans:
- [x] 06-01-telemetry-foundation-PLAN.md — Install @azure/monitor-opentelemetry + instrumentation.ts bootstrap + trackEvent() wrapper with pino dual-emit (complete 2026-04-24)
- [x] 06-02-question-hash-and-server-events-PLAN.md — hashQuestion + session/user hashes; wire server-side events from /api/chat pipeline (complete 2026-04-24)
- [x] 06-03-client-events-and-feedback-endpoint-PLAN.md — POST /api/feedback + /api/telemetry + frontend 👍/👎/citation-click/flag-a-gap wiring (complete 2026-04-24)
- [x] 06-04-eval-harness-and-fast-suites-PLAN.md — Runner types, threshold registry, JSON report writer, two deterministic fast suites (complete 2026-04-24)
- [x] 06-05-slow-suites-and-llm-judge-PLAN.md — Judge best-of-3, flake quarantine, four LLM-judge suites (neg-oos, paired-role, injection-refuse, positional) (complete 2026-04-24)
- [x] 06-06-ci-cd-integration-PLAN.md — ci.yml (PR fast-eval gate), evals-nightly.yml (slow evals + issue-open + Teams notify), deploy.yml eval gate + bypass (complete 2026-04-24)
- [x] 06-07-workbook-and-alerts-PLAN.md — App Insights workbook ARM template (5 sections), Azure Monitor alerts via Bicep, Teams webhook validation runbook (complete 2026-04-24)
- [x] 06-08-steward-pull-and-docs-PLAN.md — ServiceNow monthly pull script + steward-monthly + weekly-digest workflows + content-steward-runbook.md + measurement-plan.md (complete 2026-04-24)

---

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 5.1 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Grounding Foundation | 5/5 | Complete | 2026-04-22 |
| 2. Chat Backend (BFF) | 4/4 | Complete | 2026-04-22 |
| 3. Role Experience & Chat UI | 6/6 | Complete | 2026-04-22 |
| 4. Source Panel, Trust & Fallback UI | 4/4 | Complete | 2026-04-23 |
| 5. SSO & Teams Delivery | 4/5 | Paused (pivoted to 5.1) | 2026-04-23 |
| 5.1 MMC-IT BFF pivot | 8/8 | Complete | 2026-04-23 |
| 6. Telemetry, Evals & Pilot Hardening | 8/8 | Complete (code; 4 operator items pending-execution) | 2026-04-24 |

---

## Coverage Validation

**v1 requirements mapped:** 49 / 49 ✓
**Orphaned requirements:** 0
**Duplicate mappings:** 0

| Phase | Count | Requirements |
|-------|-------|--------------|
| 1 | 7 | GRND-01, GRND-02, GRND-03, GRND-04, GRND-05, GRND-06, CORP-01 |
| 2 | 3 | GRND-07, FBK-02, CORP-02 |
| 3 | 16 | AUTH-02, ROLE-01, ROLE-02, ROLE-03, ROLE-04, ROLE-05, CHAT-01, CHAT-02, CHAT-03, CHAT-04, CHAT-05, CHAT-06, CHAT-07, FDBK-01, FDBK-02, UTIL-01 |
| 4 | 12 | PANE-01, PANE-02, PANE-03, PANE-04, PANE-05, PANE-06, PANE-07, FBK-01, FBK-03, FBK-04, TRST-01, TRST-02 |
| 5 | 6 | AUTH-01, AUTH-03, DELV-01, DELV-02, DELV-03, DELV-04 |
| 6 | 5 | FDBK-03, TELE-01, TELE-02, TELE-03, TELE-04 |
| **Total** | **49** | |

**v2 / deferred requirements (NOT mapped to v1 roadmap — intentional):**
AUTHLINT-01..04, CONV-01..04, CITFDBK-01, DIR-01, TRST-03, ADMIN-01, ADMIN-02, CONT-01, FDBK-04

---

*Roadmap created: 2026-04-22*
*Depth: standard (6 phases)*
*Source documents: PROJECT.md, REQUIREMENTS.md, research/SUMMARY.md, research/ARCHITECTURE.md §16, research/PITFALLS.md*
