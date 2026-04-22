# KB Knowledge Assistant

## What This Is

A role-aware AI chat assistant for MMC / Marsh McLennan's Colleague Technology ServiceNow Knowledge Base. Grounded in three sanctioned sources — KB0020882 v9.0, KB0022991 v13.0, and the live ServiceNow Technical Knowledge article form — every answer cites the specific SOP section backing it and opens that section in an inline source panel. Delivered as a web app behind Entra ID SSO, with a Microsoft Teams tab wrapper sharing the same codebase.

## Core Value

Every answer is verifiable against the authoritative SOP — the user can read the cited source section without leaving the conversation. No ungrounded answers, no invented field names, steps, or approver names.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet — ship to validate)

### Active

<!-- Current scope. Building toward these. -->

- [ ] Role-select landing screen (KB Author/SME vs Knowledge Consumer) with SSO gate in front
- [ ] Role-aware greeting and suggested prompts; role persists for session; "Change role" resets the conversation
- [ ] Chat interface grounded in full source text stuffed into the system prompt (no RAG)
- [ ] Every assistant response cites one specific section of one specific source document
- [ ] Source panel opens to the cited section on every cited response; updates as new citations arrive
- [ ] Source panel document colour-coding per the UI spec (KB0020882 blue, KB0022991 amber, ServiceNow Form purple, Flagging/Lifecycle red, Publishing green, Attachments purple, Categories amber)
- [ ] Out-of-scope fallback — "That information isn't in the loaded documents yet. Flag the gap to the CTSS Knowledge team via KB0022991."
- [ ] 13 suggested-prompt chips — 5 Consumer, 8 Author — sourced from handover §16
- [ ] Entra ID / Azure AD single sign-on before the role-select screen
- [ ] Microsoft Teams tab wrapper (same URL and codebase, manifest packaging)
- [ ] Admin-owned process to update source SOP text on new KB version release (manual re-embed + redeploy)
- [ ] Primary outcome metric instrumented — rejected / flagged KB article rate tracked pre- and post-pilot
- [ ] Pilot cohort identified, onboarded, and actively using the assistant

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Adaptive Learning Path (handover §17, "Idea 3") — deferred to a separate future milestone, not this build
- ServiceNow write-back (create / edit / publish articles from the assistant) — read-only citations; users still author in ServiceNow itself
- RAG / vector retrieval — corpus fixed at 3 docs for v1; full source text fits in the 128K context window
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

- **LLM runtime:** Azure OpenAI via MGTI corporate ingress at `https://stg1.mmc-dallas-int-non-prod-ingress.mgti.mmc.com/coreapi/openai/...`. OpenAI-compatible SDK, overridable base URL, `api-key` auth header (not Bearer). Dev uses a direct OpenAI key for local work; server uses corporate ingress. Env-driven configuration throughout.
- **Model:** gpt-4o (full), not gpt-4o-mini. Grounding-adherence bar is non-negotiable; full 4o is the safer choice for "never hallucinate, always cite" discipline.
- **Auth:** Entra ID / Azure AD SSO required from day one — necessary for Teams integration and standard for MMC-hosted apps.
- **Hosting:** MMC-sanctioned Azure hosting (App Service or Static Web Apps + Functions). Production URL/ingress subject to MMC platform team.
- **Data:** Session-only state. No PII storage. No per-user conversation history. No customer data leaves the LLM request path. Corporate LLM traffic stays within MGTI ingress.
- **Grounding discipline:** Responses must cite one specific section of one approved source. No invented field names, workflow steps, or approver names. Off-scope questions hit the documented fallback, not a best-guess answer.
- **Source-update process:** Manual. When a sanctioned SOP version changes (e.g. KB0022991 v13 → v14), an owner edits the source-text file in the repo, opens a PR, redeploys. Auditable and version-controlled.
- **Timeline:** No hard date. Quality bar on Author-first experience is the gating factor, not a release date. Pilot launches when it's right.

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Stuff-the-context grounding, no RAG | 3 docs, ~10–15K tokens, fits comfortably in 128K context window. Eliminates retrieval failure modes; citations are deterministic. Easy migration path to RAG if corpus grows later. | — Pending |
| gpt-4o (full) over gpt-4o-mini | Grounding adherence and "never hallucinate" bar weigh more than per-request cost at this corpus size. | — Pending |
| Azure OpenAI via MGTI corporate ingress | Non-negotiable — corporate LLM traffic stays on MMC infrastructure. OpenAI-compatible SDK with overridable base URL makes dev/prod swap trivial. | — Pending |
| Web app first, Teams tab second | Same codebase, same SSO, same URL. Web delivers faster to pilot; Teams is a manifest wrapper, not a separate build. | — Pending |
| Entra ID SSO from day one | Required for Teams integration anyway, expected for any MMC-hosted app; simpler to build it in than retrofit. | — Pending |
| Pilot cohort before broad launch | Author-first success signal (article quality) requires a contained group to measure and iterate against before general availability. | — Pending |
| Session-only conversations | Removes storage, compliance, PII, and retention surface entirely. Matches the "lookup assistant" nature of the product. Zero-regret choice. | — Pending |
| Manual SOP re-embed per release | 3 docs update rarely. No automation warranted. Change is auditable (PR history), reversible, and cheap. | — Pending |
| Quality-driven timeline, no hard date | The point of the product is measurable article-quality improvement. Shipping too early on a low-quality grounding layer poisons the outcome metric. | — Pending |

---
*Last updated: 2026-04-22 after initialization*
