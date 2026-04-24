# Requirements Archive: v1 KB Knowledge Assistant — Pilot Release

**Archived:** 2026-04-24
**Status:** ✅ SHIPPED

This is the archived requirements specification for v1. For current requirements, see `.planning/REQUIREMENTS.md` (created for next milestone via `/gsd:new-milestone`).

**Defined:** 2026-04-22
**Core Value:** Every answer is verifiable against the authoritative SOP — users read the cited source section without leaving the conversation. No ungrounded answers, no invented field names or approver names.

---

## v1 Requirements

Requirements for initial pilot release. Each maps to a roadmap phase (see Traceability).

### Authentication & Session (AUTH)

- [x] **AUTH-01**: Entra ID / Azure AD SSO gates entry before the role-select screen — *shipped via Phase 5.1 BFF pattern (msal-node auth code flow + iron-session cookie)*
- [x] **AUTH-02**: Conversation state is session-only (in-memory per tab); nothing persisted server-side
- [ ] **AUTH-03**: SSO token flow works in both standalone web and Microsoft Teams tab contexts via Nested App Authentication (NAA) — *deferred to v1.1 per Phase 5.1 pivot (web-only for v1)*

### Role Experience (ROLE)

- [x] **ROLE-01**: Role-select landing screen with two cards — "Knowledge Consumer" and "KB Author / SME" — shown after SSO
- [x] **ROLE-02**: Selected role persists for the session; "Change role" clears the conversation and returns to the role-select screen
- [x] **ROLE-03**: Role badge displayed in the chat header (green for Consumer, purple for Author)
- [x] **ROLE-04**: Role-aware greeting message displays on conversation start
- [x] **ROLE-05**: Role-specific suggested-prompt chips — 5 for Consumer, 8 for Author — sourced from handover §16

### Conversation Interface (CHAT)

- [x] **CHAT-01**: Multi-turn chat interface with KB / Me avatars and message styling per handover §14
- [x] **CHAT-02**: Typing indicator (three animated dots) visible during in-flight response
- [x] **CHAT-03**: Stop-response button cancels an in-flight LLM call
- [x] **CHAT-04**: "New conversation" button clears chat without changing role (visually distinct from "Change role")
- [x] **CHAT-05**: Keyboard submit — `Enter` sends, `Shift+Enter` inserts newline
- [x] **CHAT-06**: Relative timestamp ("2m ago") shown on message hover, with absolute time as tooltip
- [x] **CHAT-07**: Error state with retry affordance when the LLM / MGTI ingress is unavailable or returns 5xx

### Grounded Responses (GRND)

- [x] **GRND-01**: Full source text of KB0020882, KB0022991, and the ServiceNow form schema embedded verbatim into the system prompt (stuff-the-context grounding; no RAG)
- [x] **GRND-02**: Structured-output citation contract enforced — JSON schema with `strict: true`, shape `{ can_answer, answer, citations: [{ source_id, section_id, quote }] }`
- [x] **GRND-03**: Server-side quote-substring validation — every citation's `quote` must match the source registry; citations failing validation are stripped
- [x] **GRND-04**: Every answer emits at most one citation (one `source_id` + `section_id` per response)
- [x] **GRND-05**: System prompt is composed per-role via a single `composeSystemPrompt(role)` template; no divergent prompt trees
- [x] **GRND-06**: LLM client is env-driven — local dev uses direct OpenAI (Bearer auth); prod uses MGTI ingress (api-key auth). Zero `NODE_ENV` branching in application code
- [x] **GRND-07**: Response streaming supported, with `answer` streamed and `citations` held until completion to prevent mid-stream flicker from validator-stripped citations

### Source Panel (PANE)

- [x] **PANE-01**: Right-side source panel (~256px wide), closed by default
- [x] **PANE-02**: Panel opens automatically to the cited section on the first cited assistant response
- [x] **PANE-03**: Panel content updates to the newly-cited section on each subsequent cited response
- [x] **PANE-04**: Panel header shows document badge, document name, and section name; body shows structured content matching the section
- [x] **PANE-05**: Document colour-coding applied per handover §14 (KB0020882 blue, KB0022991 amber, ServiceNow Form purple, Flagging/Lifecycle red, Publishing/Approval green, Attachments purple, Categories amber)
- [x] **PANE-06**: Panel footer includes "Open in ServiceNow ↗" link using the ServiceNow permalink URL (`https://mmcnow.service-now.com/kb_view.do?sysparm_article=...`)
- [x] **PANE-07**: Clicking a citation chip in a chat message re-opens and re-loads the panel to that source

### Fallback & Gap Capture (FBK)

- [x] **FBK-01**: Out-of-scope fallback text rendered exactly per handover §15 — "That information isn't in the loaded documents yet. Flag the gap to the CTSS Knowledge team via KB0022991."
- [x] **FBK-02**: Fallback triggers when model returns `can_answer: false` OR when every citation fails substring validation
- [x] **FBK-03**: Fallback response has a visually distinct UI treatment (border, icon, or colour variation) so users don't mistake it for a grounded answer — *three-signal design per Pitfall 20*
- [x] **FBK-04**: "Flag a gap to the CTSS Knowledge team" one-click affordance rendered as part of the fallback — pre-populates a mailto/Teams link with the unanswered question

### Feedback (FDBK)

- [x] **FDBK-01**: Thumbs 👍 / 👎 affordance on every assistant message
- [x] **FDBK-02**: 👎 opens a fixed-option dropdown — "hallucinated / wrong citation / incomplete / other" — with no free-text field in v1
- [x] **FDBK-03**: Feedback events captured to telemetry with `{ message_id, role, rating, citation_source_id, citation_section_id, reason? }`

### Trust & Transparency (TRST)

- [x] **TRST-01**: Freshness / version indicator visible in the chat header or an "About this assistant" popover — e.g. "Grounded in KB0022991 v13.0 · KB0020882 v9.0 · Form schema 2026-04-15"
- [x] **TRST-02**: First-run dismissible "About this assistant" tooltip covers: what it answers, what it doesn't, what it's grounded in, how to flag a gap

### Utility Actions (UTIL)

- [x] **UTIL-01**: Copy-answer button on each assistant message; copied text includes the citation string appended in the form `(Source: KB0022991 · Flagging Articles)`

### Telemetry & Measurement (TELE)

- [x] **TELE-01**: Pre-registered telemetry schema documented and agreed before pilot launch (covers: session start/end, role selected, chip-vs-freeform, question hash, citation returned, citation-click-through, 👍/👎 rating + reason, fallback trigger, flag-a-gap action) — *15-event EventSchema catalog; measurement-plan.md signed off pre-pilot per Pitfall 14*
- [x] **TELE-02**: Anonymised logging — no raw user question text persisted; question hash only — *NFC + salt + SHA-256/16-hex; PII-absence test at route.test.ts:660-667*
- [x] **TELE-03**: Application Insights / OpenTelemetry integration collecting the above schema — *@azure/monitor-opentelemetry + instrumentation.ts bootstrap + trackEvent() wrapper*
- [x] **TELE-04**: Documented process for monthly pull of rejected / flagged KB article rate from ServiceNow — named Content Steward, cadence, data source — *pull-servicenow-feedback.ts + steward-monthly.yml + content-steward-runbook.md; {{STEWARD_NAME}} placeholders for operator fill*

### Content & Corpus Management (CORP)

- [x] **CORP-01**: Source text versioned as files in the repo; SOP updates land via PR; redeploy propagates the change
- [x] **CORP-02**: Entity allowlist (approvers list, KB numbers, ServiceNow URLs) validated post-response — any response containing an entity not on the allowlist is flagged for review

### Delivery & Hosting (DELV)

- [x] **DELV-01**: ~~Deployed to MMC-sanctioned Azure App Service (Linux, Node 20.9+)~~ **Reassigned Phase 5.1 → on-prem Windows Server** (IIS reverse proxy + Windows Scheduled Task + AWS Secrets Manager)
- [x] **DELV-02**: Standalone web app reachable via an MMC corporate URL with Entra ID SSO
- [ ] **DELV-03**: Microsoft Teams tab package (schema 1.22 manifest with `webApplicationInfo.nestedAppAuthInfo` + `brk-multihub://` redirect URI) sharing the web codebase — *deferred to v1.1 per Phase 5.1 pivot*
- [x] **DELV-04**: CI/CD pipeline (GitHub Actions or Azure DevOps) deploying from the main branch — *self-hosted Windows runner + Windows Scheduled Task + /api/health canary + auto-rollback*

---

## v2 Requirements (tracked but not in v1 pilot scope)

Deferred to v1.1 / v2. Most depend on v1 telemetry existing first so that lift can be attributed. **Carried forward to next milestone.**

### Author-Lint Features (AUTHLINT)

- **AUTHLINT-01**: Naming-convention linter chip — paste Short description, assistant checks against 160-char 4-part rule (handover §6). Highest Author-metric lever.
- **AUTHLINT-02**: Resolution-field completeness check chip — paste Resolution text, assistant checks against §7 checklist (Software 11-point or Support-process 7-point) with ✅/❌ per item.
- **AUTHLINT-03**: Security-rule check (no passwords, no external download links) as part of the Resolution lint.
- **AUTHLINT-04**: Pre-submit full-form check — structured paste of title + fields + resolution, single combined lint report.

### Conversation UX (CONV)

- **CONV-01**: Suggested follow-up prompts (2–3) after each assistant message, role-aware and grounded.
- **CONV-02**: Session-download / "save this conversation as .md" (client-side only, no server persistence).
- **CONV-03**: Conversation-level continuity — `last_active_citation` carried into system prompt for "and then what?" style follow-ups.
- **CONV-04**: Summarise-a-section mode ("summarise the Retirement section of KB0022991").

### Per-Citation Feedback (CITFDBK)

- **CITFDBK-01**: 👍/👎 on individual citation chips (distinct from answer-level feedback) — disambiguates hallucinated citations from correct-answer-wrong-citation.

### Approver / Role Directory (DIR)

- **DIR-01**: SME / approver directory lookup as a first-class chip (data already in handover §8) — surface as dedicated chip.

### Trust Enhancements (TRST+)

- **TRST-03**: Hoverable freshness badge on each cited chunk (version + revised-by + last-changed-date).

### Admin & Ops (ADMIN)

- **ADMIN-01**: Admin preview mode (`?admin=1`-gated view showing live system-prompt version + last-embed timestamp); access gated by Entra group membership.
- **ADMIN-02**: Rate-limit / cost-ceiling UX — visible soft-limit and admin alert when daily token spend exceeds threshold.

### Gated on Content (CONT)

- **CONT-01**: "Show me an example article" chip and panel content — blocked by handover §19 gap (sanctioned example articles not yet provided). Surface as "coming soon" in UI until content lands.

### Feedback Depth (FDBK+)

- **FDBK-04**: Free-text comment on 👎 — enabled only after PII-scrubbing pipeline is battle-tested.

---

## Out of Scope

Explicitly excluded for v1. Documented to prevent scope creep.

### From Handover / Project Decisions

| Feature | Reason |
|---------|--------|
| Adaptive Learning Path (handover §17, "Idea 3") | Separate initiative; deferred to a later milestone |
| ServiceNow write-back (create / edit / publish from assistant) | Out of product scope; users continue authoring in ServiceNow itself |
| RAG / vector retrieval | Corpus is 3 docs, fits in 128K context; stuff-the-context is simpler and more reliable for citations |
| Multi-language support | English only; default Language field per form schema |
| Non-Colleague-Technology knowledge bases | This assistant is scoped to one KB |
| Per-user conversation history | Session-only — removes PII / retention / compliance surface |
| Scheduled sync from ServiceNow | Manual re-embed per SOP release is sufficient at 3 docs |
| Broad launch in v1 | Pilot cohort only; GA is a post-pilot decision |

### From Category Anti-Features (research-surfaced)

| Feature | Reason |
|---------|--------|
| AI-generated article drafts from tickets (Now Assist-style) | Different product problem; undermines citation-discipline foundation |
| "Suggest improvements to my article" agentic actions | No write-back target; degenerates into unactionable advice |
| Multi-KB expansion ("add HR, add Security") | Stuff-the-context breaks at scale; needs RAG + permissions model |
| Conversational "regenerate" button | Undermines single-correct-citation premise; users click until preferred answer |
| Real-time co-authoring | Requires shared state; violates session-only design |
| Live ServiceNow RAG / smart search | Invalidates grounding model; would need ServiceNow Can-Read permissions integration |
| Proactive notifications ("your article is stuck") | Requires server-side user state + ServiceNow read integration |
| Image / diagram generation | High hallucination risk on business processes; violates "never invent" |
| Prompt autocomplete / rephrasing | Suggests prompts the system can't answer; widens fallback surface |
| "Trust my judgement" override that bypasses grounding | Destroys the core value of the product |
| Free-text 👎 comment in v1 | Uncontrolled free-text ingestion before PII-scrubbing is hardened |

---

## Traceability

Each v1 requirement mapped to exactly one phase. 47/49 shipped, 2 deferred by design at Phase 5.1 pivot.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 5.1 | Complete |
| AUTH-02 | Phase 3 | Complete |
| AUTH-03 | Phase 5 | Deferred to v1.1 |
| ROLE-01 | Phase 3 | Complete |
| ROLE-02 | Phase 3 | Complete |
| ROLE-03 | Phase 3 | Complete |
| ROLE-04 | Phase 3 | Complete |
| ROLE-05 | Phase 3 | Complete |
| CHAT-01 | Phase 3 | Complete |
| CHAT-02 | Phase 3 | Complete |
| CHAT-03 | Phase 3 | Complete |
| CHAT-04 | Phase 3 | Complete |
| CHAT-05 | Phase 3 | Complete |
| CHAT-06 | Phase 3 | Complete |
| CHAT-07 | Phase 3 | Complete |
| GRND-01 | Phase 1 | Complete |
| GRND-02 | Phase 1 | Complete |
| GRND-03 | Phase 1 | Complete |
| GRND-04 | Phase 1 | Complete |
| GRND-05 | Phase 1 | Complete |
| GRND-06 | Phase 1 | Complete |
| GRND-07 | Phase 2 | Complete |
| PANE-01 | Phase 4 | Complete |
| PANE-02 | Phase 4 | Complete |
| PANE-03 | Phase 4 | Complete |
| PANE-04 | Phase 4 | Complete |
| PANE-05 | Phase 4 | Complete |
| PANE-06 | Phase 4 | Complete |
| PANE-07 | Phase 4 | Complete |
| FBK-01 | Phase 4 | Complete |
| FBK-02 | Phase 2 | Complete |
| FBK-03 | Phase 4 | Complete |
| FBK-04 | Phase 4 | Complete |
| FDBK-01 | Phase 3 | Complete |
| FDBK-02 | Phase 3 | Complete |
| FDBK-03 | Phase 6 | Complete |
| TRST-01 | Phase 4 | Complete |
| TRST-02 | Phase 4 | Complete |
| UTIL-01 | Phase 3 | Complete |
| TELE-01 | Phase 6 | Complete |
| TELE-02 | Phase 6 | Complete |
| TELE-03 | Phase 6 | Complete |
| TELE-04 | Phase 6 | Complete |
| CORP-01 | Phase 1 | Complete |
| CORP-02 | Phase 2 | Complete |
| DELV-01 | Phase 5.1 | Complete (reassigned Azure → on-prem Windows) |
| DELV-02 | Phase 5.1 | Complete |
| DELV-03 | Phase 5 | Deferred to v1.1 |
| DELV-04 | Phase 5.1 | Complete |

---

## Milestone Summary

**Shipped:** 47 of 49 v1 requirements

**Adjusted during implementation:**
- **DELV-01** — reassigned from "Azure App Service Linux, Node 20.9+" to "on-prem Windows Server (IIS reverse proxy + Windows Scheduled Task + AWS Secrets Manager)" at Phase 5.1 pivot, following the xmcp/Atlas reference. Functionally equivalent outcome; different MMC-IT-blessed infrastructure.
- **AUTH-01** — auth mechanism changed from SPA + NAA (`@azure/msal-browser` + `createNestablePublicClientApplication`) to BFF pattern (server-side `@azure/msal-node` auth code flow + iron-session HttpOnly cookie) at Phase 5.1 pivot. Same user-visible behaviour (Entra SSO before role-select); different architecture.
- **FBK-03** — enriched during Phase 4 implementation from "visually distinct UI treatment" to a three-signal design (border + icon + copy) explicitly addressing Pitfall 20 (fallback mistaken for grounded answer).

**Dropped / deferred:**
- **AUTH-03 (Teams SSO via NAA)** — deferred to v1.1 at Phase 5.1 pivot. Rationale: BFF pattern serves web-only; Teams SSO would require re-introducing NAA alongside BFF, breaking the single-architecture simplicity. Teams-tab candidate scoped in RESEARCH but excluded from v1 roadmap per separate user decision.
- **DELV-03 (Teams tab manifest)** — deferred to v1.1 at Phase 5.1 pivot. Rationale: dependency on AUTH-03 for silent sign-in inside Teams.

Both deferrals are intentional and documented in ROADMAP.md line 164 and Phase 5.1 RESEARCH/PLAN artifacts. They do not represent execution gaps; they represent a scope re-scoping at pivot time.

**Remediation during audit:**
- **GAP-1** (audit blocker, fixed 2026-04-24): `skip_eval_gate=true` emergency-bypass path was silently blocked by GitHub Actions' default handling of skipped `check-evals` dependency. One-line `if:` added to deploy job to allow bypass when build succeeds and check-evals is either success or skipped. Fix committed as c92286e post-audit.

---

_Archived: 2026-04-24 as part of v1 milestone completion._
_For current project status, see `.planning/PROJECT.md`._
_For the next milestone's requirements, run `/gsd:new-milestone`._
