# Feature Research — KB Knowledge Assistant

**Domain:** Internal enterprise role-aware grounded KB chat assistant (ServiceNow corpus, 3 fixed docs)
**Researched:** 2026-04-22
**Confidence:** HIGH on category norms (Glean, Guru, Copilot, Now Assist all surveyed); MEDIUM on which Author-support features actually move the rejected-article-rate metric (no published benchmark isolates that variable)
**Scope note:** Everything already in handover §14–§16 (role select, source panel, chip prompts, colour coding, cited responses, fallback text) is assumed present and is NOT re-listed as "table stakes" below — this research focuses on what a pilot-cohort user would also expect to see alongside what's already spec'd.

---

## 1. Handover Coverage Map (what's already in v1 scope)

Before categorising, here's what the handover already commits to. Anything below is on top of this.

| Already scoped | Source |
|---|---|
| Role-select landing + persist-for-session | Handover §14, PROJECT.md Active |
| Role-aware greeting | §14 |
| 13 suggested prompts (5 Consumer, 8 Author) | §16 |
| Every response cites exactly one section of one source doc | §15 |
| Source panel: colour-coded, slides open on cite, "Open in ServiceNow ↗" | §14 |
| Out-of-scope fallback pointing to KB0022991 flag route | §15 |
| Entra ID SSO + Teams tab wrapper | PROJECT.md Constraints |
| Session-only conversation (no stored history) | PROJECT.md Constraints |
| Multi-turn conversation (`conversation_history` in session state) | §18 |
| Primary outcome metric: rejected / flagged article rate pre/post pilot | PROJECT.md Active |

---

## 2. Table Stakes (Expected by Pilot Cohort — Missing = Abandonment)

Features the cohort will silently expect because every product in the category (Glean, Guru, Copilot, Now Assist, Notion AI) ships them. Absence reads as "half-finished prototype."

| Feature | Why Expected | Complexity | Supports Author Metric? | Notes |
|---|---|---|---|---|
| **Copy-answer button on each assistant message** | Universal in ChatGPT/Copilot/Glean. Authors will paste assistant output into the ServiceNow Resolution field — make the copy obvious. | LOW | **Yes** — directly speeds Resolution-field drafting | One click, copies markdown/plain text. Include the citation in the copied text as "(Source: KB0022991 · Publishing an Article)". |
| **Thumbs up / thumbs down on each answer** | Copilot, Glean, Guru all ship this. Without it you have no signal on answer quality beyond the rejected-article-rate lagging metric. | LOW | **Yes** — leading indicator; article-quality metric lags by weeks | Capture `{message_id, role, rating, citation_id}` only — no free-text comment in v1 to avoid PII capture. Free-text on 👎 is a v1.1. |
| **New conversation / clear chat button** | Every chat product has one. Session-only storage means users will want to reset without refreshing. | LOW | No | Must not be confused with "Change role" (which also clears). Label distinctly. |
| **Visible "loading" state with a stop button** | Sonnet/4o responses can take 3–8s. Typing indicator (§14) is present; stop button is not but is table stakes. | LOW | No | Prevents the "did it break?" double-send problem. |
| **Message timestamps on hover** | Universal. Users reference "that answer from 2 minutes ago" — without timestamps, can't. | TRIVIAL | No | Relative format ("2m ago") hovering to absolute. |
| **Error state when the LLM / ingress is unavailable** | MGTI ingress will occasionally 5xx. A blank hang is unacceptable for an MMC-hosted product. | LOW | No | "Assistant is temporarily unavailable — try again in a moment." Retry button. Logs the failure. |
| **Keyboard submit (Enter to send, Shift+Enter for newline)** | Category standard. Missing = immediate frustration. | TRIVIAL | No | Handover doesn't mention input UX. |
| **Character/token counter on long pastes** (soft) | Users will paste article drafts into the assistant to ask "is this right?" Pilot will hit this day one. | LOW | **Yes** — enables "lint my draft" workflow | Warn at 4K chars, soft-cap at 8K to keep system-prompt headroom. |
| **Visible version / doc-freshness indicator** | Now Assist and Glean both surface "last updated" on cited docs. Authors need to trust that the grounding is current — the whole pitch depends on it. | LOW | **Yes** — trust signal for Author lane | Show "Grounded in KB0022991 v13.0 · KB0020882 v9.0 · Form schema (2026-04-15)" in the chat header or a small "About this assistant" popover. Drives the manual re-embed process forward visibly. |
| **A session-download / "save this conversation as .md" option** | Cornell's Copilot guidance and Gemini Enterprise both surface this because session-only storage is a known UX gap. Authors will want to keep a draft-coaching transcript while they finish the article in ServiceNow. | LOW | **Yes** — lets authors take the assistant's feedback with them to the form | Client-side download only (no server persistence) — consistent with session-only constraint. Includes citations. |
| **A visible link to flag a bad *assistant* answer (distinct from KB article flagging)** | Industry expectation post-Copilot. Not the same thing as KB0022991's article-flag route. | LOW | **Yes** — quality loop feeding into pilot iteration | Can be as simple as the 👎 above with a mandatory dropdown: "hallucinated / wrong citation / incomplete / other". |
| **"About this assistant" / first-run tooltip** | Pilot cohort hasn't used this before. Without it, some users will try to use it as a general ChatGPT. | LOW | **Yes** — sets scope expectations, reduces out-of-scope noise | One-screen: what it answers, what it doesn't (points to KB0022991 flag route), what it's grounded in. Dismissible. |

---

## 3. Differentiators (v1.1 / v2 candidates that would actually move adoption)

These are where the Author-first success metric is won. Prioritised specifically for the "authors produce better articles" outcome.

| Feature | Value Proposition | Complexity | Supports Author Metric? | Notes |
|---|---|---|---|---|
| **Naming-convention linter** ("paste your Short description, I'll check it against the 160-char 4-part rule") | Most common Author rejection reason per handover §6 — wrong format, over 160 chars, missing region/OPCO. A deterministic lint that flags these before submit is the single highest-leverage Author feature. | **MEDIUM** | **Yes — highest leverage** | Can be done with a specific system-prompt instruction triggered by a chip ("Check my article title") + regex-assisted parsing. No separate model. Always cites §6. |
| **Resolution-field completeness check** (against §7 Software-article 11-point or Support-process 7-point checklists) | §7 is the second-biggest source of rejections. Authors forget Config Item, or SME, or escalation contact. A checklist-style check with each missing item cited back to §7 bullet is directly aimed at the primary metric. | **MEDIUM** | **Yes — second highest leverage** | Prompt pattern: "Paste your Resolution text. I'll check it against KB0020882 §7." Returns a ✅/❌ list with citations. Blends naturally with the grounded-answer discipline. |
| **Pre-submit full-form check** (title + fields + resolution all at once) | Combines the two above plus security-rule check (no passwords, no external download links per §7 Security Rule). This is the single chip that most directly reduces rejection rate. | HIGH | **Yes — direct metric driver** | Requires the Author to paste multiple fields. Structured input (collapsible form-like prompt chip) is better than a single free-text paste. v1.1 candidate. |
| **Suggested follow-up prompts after each answer** | NN/g: 50% of genAI conversations have a follow-up; 77% are multi-turn. Bing/Copilot ship this; Glean's 3rd-gen Assistant ships this. Without it, Authors bounce on "is the answer complete enough?" | MEDIUM | **Yes** — keeps Authors in the assistant instead of switching to search | Generate 2–3 role-aware follow-ups at end of each assistant message. Must also be grounded (e.g. "How do I retire this article when it's obsolete?" → cites §9). |
| **Role-specific "show me an example article" chip** | Handover §19 explicitly flags this as a gap. NotebookLM and Guru both surface exemplars. Authors asking "what does good look like?" is the clearest learning moment. Cannot ship until sanctioned examples are provided. | MEDIUM (once content exists) | **Yes — high leverage for new Authors** | Gated on handover §19 gap being closed. Until then, the out-of-scope fallback is correct. Worth explicitly surfacing this as "coming soon" rather than silently missing. |
| **Direct "flag a gap to the CTSS Knowledge team" action** (not just the fallback text) | Current fallback tells users to flag via KB0022991. The action (mailto: / Teams deep-link / ServiceNow form deep-link) should be one click from the fallback, not "go read KB0022991 and figure it out." | LOW | Indirectly — closes the feedback loop | Pre-populate subject/body with the unanswered question for Knowledge team triage. Produces the queue of "what should we add to the corpus" for the admin re-embed process. |
| **Summarise-a-section mode** ("Summarise the Retirement section of KB0022991 for me") | Distinct from Q&A. Category norm (Copilot in SharePoint, Glean). Useful for Authors who need a quick refresher before an edit. | LOW | **Yes** — reduces time-to-correct-action | Single prompt variant. Citation is mandatory (the section itself). |
| **SME / approver directory lookup chip** ("Who approves a published article?") — handover lists them, just surface them as a first-class chip | §8 already lists approvers. Making it a chip with a direct citation is one of the highest-asked-but-simple questions. | TRIVIAL | **Yes** — reduces "stuck article" anxiety | Should be added to the chip row. |
| **Drop-down freshness badge on every cited chunk** (version + revised-by + last-changed date) | Now Assist and Glean both badge freshness; per Now Assist docs, freshness is part of their relevancy model. For MMC the doc versions are specified in handover §4 — just surface them inline. | LOW | **Yes** — trust signal | Hoverable chip: "KB0022991 v13.0 · Revised by Edmar Roseno". |
| **Conversational follow-ups that remember the last cited section** | The handover confirms `conversation_history` is session state but doesn't spec that the *citation* also stays in context. Users asking "and then what?" should get grounding from the same section, not a new search. | MEDIUM | **Yes** — reduces grounding slippage mid-conversation | Requires adding `last_active_citation` to the state object and instruction in the system prompt to prefer continuity. |
| **Admin preview mode** (admin-only URL param to see which system-prompt version is live + last-embedded timestamp) | Required for the "manual re-embed on SOP release" process to be auditable in practice — not just in the PR history. | LOW | Indirectly — protects the quality of the corpus that drives the Author metric | Gated by group-membership via Entra. |
| **"Was this citation correct?" micro-feedback** on the source chip itself | Glean does line-by-line citation verification. For MMC, simple 👍/👎 on the chip *independent* of the answer quality is the signal that isolates hallucinated citations from correct-answer-wrong-source. | LOW | **Yes** — distinguishes two failure modes | Feeds into the same telemetry as answer-level thumbs but tagged differently. |

---

## 4. Anti-Features (Commonly requested or added in category — do NOT build)

These show up in sibling products and are tempting. Each is a trap given MMC's constraints (session-only, grounded-only, pilot-scope).

| Anti-Feature | Why Requested | Why Problematic | Alternative |
|---|---|---|---|
| **Stored per-user conversation history** | Copilot and Glean have it; users will ask. | Violates the session-only constraint. Creates PII/retention surface (Stanford 2025 AI chatbot privacy study; Lakera PII guidance). Data-classification impact changes ingress requirements. Per the 2025 Help Net study, 8.5% of prompts to Copilot/ChatGPT contained sensitive data — introducing storage is introducing risk. | Client-side "download this conversation" (see table stakes). |
| **Free-text comment on 👎 in v1** | Standard on Copilot, Glean. | Opens a free-text ingestion path. Pilot users will paste sensitive ticket numbers, user IDs, article drafts with Config Item info. Scrubbing at write-time is non-trivial. | 👎 with fixed-option dropdown only in v1; revisit in v1.1 once telemetry pipeline is hardened. |
| **AI-generated article drafts from a ticket** (Now Assist's Knowledge Generation style) | Now Assist ships this; it's the obvious "next step." | Violates PROJECT.md Out of Scope ("ServiceNow write-back"). Also a different product problem — drafting from ticket data is an unstructured-inputs task, not a grounded-lookup task. Undermines the citation discipline the whole v1 is built on. | Keep write-back out. Offer paste-to-lint (see differentiators) as the authoring aid instead. |
| **"Suggest improvements to this KB article"** style agent actions | Glean 3rd-gen Assistant does agentic task execution. | No way to action without ServiceNow write-back. Would degenerate into "send the author a long list of suggestions they can't do anything with." | Pre-submit lint (Differentiators) is the narrowly-useful version. |
| **Multi-KB expansion ("add the security KB, add the HR KB")** | Guru/Glean pitch universality. | Out of scope per PROJECT.md. Stuff-the-context grounding breaks above ~3 docs at scale. Breaks the deterministic-citation property. | Explicitly scope the assistant's name/branding to "Colleague Technology KB" so users don't assume expansion. |
| **Conversational "regenerate" button** | ChatGPT/Copilot standard. | On a grounded assistant, "regenerate" implies "try a different answer" — undermines the single-correct-citation premise. Users will keep clicking until they get the answer they want. | Offer "rephrase" or "explain differently" as an explicit follow-up chip; keep the underlying citation stable. |
| **Real-time co-authoring with other users** | Notion AI, Guru collaborative editing. | No user identity beyond SSO in session; no shared state (session-only). Massive scope creep. | Session download + paste into ServiceNow. |
| **"Smart" search over ServiceNow live** | Most obvious "v2 idea." | RAG over live ServiceNow changes the entire architecture, invalidates the grounding-by-stuffed-context model, and requires a permissions model that the current design doesn't have (ServiceNow Can Read/Cannot Read fields per §5). | Explicitly defer. Note in Key Decisions. |
| **Proactive nudges / notifications** ("your article is stuck in approval") | Now Assist, Glean. | Requires server-side state, user identity persistence, ServiceNow read integration — none of which exist in v1. | Keep the assistant reactive. Review SLA escalation is a handover §19 gap to solve in the SOP itself first. |
| **Image generation / screenshot tools** (Glean just shipped it in Jan 2026) | Trendy; Glean's Jan-2026 assistant update. | §5 says Authors should include screenshots. AI-generated diagrams of a real business process are high-hallucination-risk and violate the "never invent" rule. | Point authors to the ServiceNow-native image upload (§5 Display attachments). |
| **Prompt autocomplete / rephrasing** (Glean Jan-2026 feature) | Good UX in generic chat; lowers keyboard burden. | Autocomplete over the corpus will suggest prompts the system can't actually answer, widening the out-of-scope fallback surface. Worth testing post-pilot only. | The 13 chips already solve 80% of this — keep the chip list tight and well-chosen. |
| **"Trust my judgement" override** (let the model answer out-of-scope if user insists) | Users will ask. | Destroys the one thing that makes this product trustworthy. | Out-of-scope fallback is final; the only escape is the flag-gap action. |

---

## 5. Gaps in the Handover (Category features the handover doesn't mention)

Features the handover currently has no position on, which every comparable product ships and which the pilot cohort will expect or which the Author-metric needs.

### 5.1 Author-metric-critical gaps (strongly recommend for v1 or v1.1)

**Gap A — Telemetry schema to actually measure the Author success metric**
Handover and PROJECT.md both state the primary metric is "rejected / flagged KB article rate pre- and post-pilot" — but nothing in the handover defines *what gets logged*. Without defining this before pilot launch, you cannot measure it.

- What needs logging (client or server, session-only in memory → batched flush is fine):
  - Session start/end + role selected
  - Chip clicked vs free-text question
  - Question text hash (optional, not raw text, to respect the no-PII stance)
  - Citation returned (doc + section)
  - Was source panel opened / chip clicked (citation-click-through rate — Copilot's equivalent metric)
  - 👍 / 👎 on answer
  - Out-of-scope fallback triggered
  - "Flag a gap" action fired
  - Naming-convention / Resolution-check chip used (Author-specific)
  - External: monthly pull of rejected / flagged article rate from ServiceNow (Knowledge feedback task count + article-rejection workflow state)
- Complexity: **MEDIUM** (schema design is easy; wiring it through the app and into a privacy-compliant store is the work)
- Supports Author metric: **Required, not optional.** This is the *only* gap on the list that is on the critical path for measuring whether the whole product worked.

**Gap B — Pre-submit Author checks (naming-convention lint, resolution-field check)**
Mentioned in the question brief as a consideration, not spec'd in the handover. Discussed in Differentiators above. Highest-leverage Author features; probably the single most important Author-metric-driving features to add. §6 and §7 exist deterministically; these are shallow adds.

**Gap C — Direct action from the out-of-scope fallback**
Handover §15 gives the fallback text but no affordance. Every comparable product (Copilot's "give feedback," Guru's ask-an-expert) provides a one-click path. The text alone doesn't close the loop.

**Gap D — Sanctioned example articles surface**
Handover §19 acknowledges "cannot show 'what a good article looks like.'" This is a content gap, not a code gap, but **the UI should surface it as "coming soon" so Authors know to expect it, not wonder why it's absent**. Also: this is probably the second-most-impactful Author learning feature once content is available.

### 5.2 Quality-of-life gaps (should ship in v1)

**Gap E — Copy answer button**
Mentioned above as table stakes. Handover §14 details avatars and message rounding but says nothing about message actions. This is a one-element omission with real Author-lane value (copy-to-Resolution-field is the primary use).

**Gap F — Answer-level feedback (thumbs)**
Mentioned above. Not in handover. Required to have a leading indicator on quality; otherwise the only signal is the lagging rejected-article-rate metric which takes weeks.

**Gap G — Freshness / version indicators**
Handover §4 contains the doc versions but the UI spec (§14) never surfaces them. Trust is the entire product — users need to see they're querying current grounding. Now Assist's doc says: "Freshness is part of the relevancy model." For MMC it's a trust-display model.

**Gap H — "About this assistant" / first-run tooltip**
Pilot cohort by definition has no prior experience. Without scope-setting, a meaningful fraction of early questions will be out-of-scope and trigger the fallback — inflating the fallback rate and dragging the engagement signal down.

### 5.3 Conversation-UX gaps

**Gap I — Suggested follow-up prompts after each answer**
NN/g data: 77% of genAI conversations are multi-turn. Handover ships suggested prompts upfront (13 chips) but nothing after the first answer. This is a one-prompt-engineering change (ask the model for 2–3 grounded follow-ups at the end of each response) with disproportionate engagement impact.

**Gap J — Stop / cancel on an in-flight response**
Handover specifies a typing indicator (§14) but no cancel affordance. 3–8s response times with no stop button will feel broken on first slow response.

**Gap K — Session-download / save-conversation**
Closes the loophole created by session-only storage: users who want to keep the assistant's coaching for reference while writing in ServiceNow have no path. Entirely client-side; no storage surface created.

### 5.4 Operational gaps

**Gap L — Admin/owner preview mode**
The "manual re-embed per release" process in PROJECT.md Constraints has no UI check. A gated admin view that shows "last-embedded prompt version + timestamp" converts a trust-me process into a visible one.

**Gap M — Rate-limit / cost-ceiling UX**
No handover mention. gpt-4o is not free. A pilot cohort that discovers the assistant is answering homework questions or being used by a curious stakeholder at 3am should trigger a visible soft-limit. Not urgent for a 10–20 person pilot but a v1.1 must.

---

## 6. Competitor Feature Analysis

| Feature | Glean | Guru | Copilot (M365) | Now Assist | Notion AI | Handover as-specified | Recommended for KB Assistant |
|---|---|---|---|---|---|---|---|
| Citations on every answer | Yes (line-level) | Yes | Yes (deep citations Feb 2026) | Yes | Yes | **Yes** — single section per answer | Keep; it's the differentiator |
| Thumbs up/down | Yes | Yes | Yes (dashboard) | Yes | Yes | No | **Add (Table stakes)** |
| Free-text feedback on 👎 | Yes | Yes | Yes | Yes | Yes | No | Fixed-option only in v1 (anti-feature in free-text form) |
| Suggested follow-ups | Yes (3rd-gen) | Partial | Yes | Yes | Yes | Upfront only | **Add (Differentiator Gap I)** |
| Copy answer | Yes | Yes | Yes | Yes | Yes | No | **Add (Table stakes Gap E)** |
| Export/download conversation | Partial | Partial | Partial (copy-all) | No | Yes | No | **Add client-side (Table stakes Gap K)** |
| Stored history | Yes | Yes | Yes | Yes | Yes | **Intentionally no** | **Keep as-is (session-only is a feature)** |
| Doc freshness indicator | Yes | Yes (verified-by-date) | Yes | Yes (part of relevancy) | Partial | No | **Add (Differentiator Gap G)** |
| Author writing assistance | Partial | Yes (AI writing assistant, jargon/condense) | Yes | Yes (Knowledge Generation) | Yes | No | **Add as pre-submit lint only (Differentiator B — not draft generation, which is an anti-feature)** |
| Agentic actions | Yes | Yes | Yes | Yes | Partial | Intentionally no (no write-back) | **Keep out** |
| Admin authority sources | Yes | Yes | Yes (Copilot Search) | Yes | Partial | Implicit (manual re-embed) | **Add admin-preview mode (Gap L)** |
| Example articles / templates | Yes | Yes | Partial | Yes | Yes | §19 gap | **Add when content lands (Differentiator)** |
| Role-aware experience | Partial (persona graph) | Yes (Knowledge Agents per team) | Partial | Yes | Partial | **Yes (2 hard-coded roles)** | Keep — the simpler two-role model is right for this pilot |

---

## 7. Feature Dependencies

```
[Role Selection] (shipped)
    └──drives──> [Role-aware greeting + chips] (shipped)
    └──drives──> [Role-aware suggested follow-ups] (Gap I)
    └──drives──> [Role-specific pre-submit lints] (Differentiator — Author only)

[Grounded-answer with citation] (shipped)
    ├──enables──> [Source panel auto-open] (shipped)
    ├──enables──> [Copy answer incl. citation] (Gap E)
    ├──enables──> [Thumbs feedback linked to citation] (Gap F)
    └──enables──> [Citation-specific micro-feedback] (Differentiator)

[Telemetry schema] (Gap A — REQUIRED FIRST)
    ├──required-by──> [Thumbs feedback] (Gap F)
    ├──required-by──> [Citation-click-through measurement]
    ├──required-by──> [Out-of-scope fallback rate measurement]
    ├──required-by──> [Pilot-retrospective → rejected-article-rate correlation]
    └──required-by──> [All Author-specific lint chips — to attribute metric lift]

[Out-of-scope fallback text] (shipped)
    └──enhanced-by──> [Direct "flag a gap" action] (Gap C)
            └──creates──> [Content-gap queue feeding manual re-embed process]

[Pre-submit Author lint chip] (Differentiator B)
    ├──requires──> [Structured-paste input (long-text field)]
    ├──requires──> [Prompt pattern referencing §6 / §7 deterministically]
    └──enhanced-by──> [Example-articles content landing] (gated on handover §19 gap)

[Manual re-embed process] (PROJECT.md Constraints)
    └──needs──> [Admin preview mode] (Gap L) — otherwise process is invisible
```

### Critical Dependency Notes

- **Telemetry schema (Gap A) must land before pilot.** Every other measurement-supporting feature depends on it. This is the one Author-metric-critical item on the critical path.
- **Thumbs feedback (Gap F) is a strict prerequisite for quality-iteration during pilot.** Without it you only have the lagging rejected-article-rate signal; by the time you learn the assistant is wrong on a Resolution-field question, a month of drafts have been poisoned.
- **Pre-submit lints (Differentiator B) depend on Telemetry (Gap A) to prove they moved the metric.** You can ship the feature without telemetry but you cannot attribute the metric lift to it.
- **Example-articles (Differentiator) is content-blocked (handover §19)**, not code-blocked. Surface a "coming soon" in the UI so Authors don't think the assistant is hiding them.
- **Source-panel updates on citation-click (shipped §14) enables Citation-specific micro-feedback (Differentiator).** The chip already exists; adding 👍/👎 to it is a small lift.

---

## 8. MVP Definition

### Launch With (v1 — add on top of already-scoped handover items)

Author-metric-critical, all achievable in the v1 window:

- [ ] **Telemetry schema** (Gap A) — non-negotiable for the pilot to produce the outcome data it exists to produce
- [ ] **Copy answer button** (Gap E) — Author lane writes into Resolution field; this is the one-click path
- [ ] **Thumbs up/down** with fixed-option dropdown on 👎 (Gap F) — leading indicator on answer quality
- [ ] **Stop-response button** (Gap J) — latency reality of gpt-4o
- [ ] **Keyboard submit + new-conversation button + timestamps on hover** (table-stakes trio) — expected by default
- [ ] **Visible doc-version / freshness indicator** in chat header (Gap G) — trust signal that is cheap to add
- [ ] **First-run "About this assistant" tooltip** (Gap H) — scope-setting; reduces out-of-scope noise in pilot
- [ ] **Error state + retry** when ingress unavailable — MGTI will 5xx occasionally
- [ ] **Direct "flag a gap" action** from the fallback (Gap C) — closes the loop for the admin re-embed process

### Add After Validation (v1.1 — triggered by pilot thumbs-down rate + cohort feedback)

Author-metric accelerators, require v1 telemetry to attribute:

- [ ] **Naming-convention linter chip** (Differentiator) — single highest-leverage Author feature; ship as soon as v1 telemetry proves it moves the 👎 rate
- [ ] **Resolution-field completeness check** (Differentiator) — second-highest Author leverage
- [ ] **Suggested follow-up prompts after each answer** (Gap I) — multi-turn engagement boost
- [ ] **Session-download / save-conversation** (Gap K) — helps Authors retain coaching while drafting in ServiceNow
- [ ] **Citation-specific micro-feedback** (Differentiator) — disambiguates hallucinated-citation vs wrong-answer
- [ ] **Summarise-a-section mode** (Differentiator) — Author refresher use case
- [ ] **Admin preview mode** (Gap L) — as the re-embed process gets exercised in anger

### Future Consideration (v2+ — defer until post-pilot product-market fit is clear)

- [ ] **Pre-submit full-form check** (Differentiator — bundled lint) — requires structured input UX; worth doing well, not cheaply
- [ ] **Example-articles surface** (Differentiator) — gated on handover §19 content
- [ ] **Rate-limit / cost-ceiling UX** (Gap M) — matters more at broad-launch scale than at pilot scale
- [ ] **Conversation-level context carry-over of last-active citation** (Differentiator) — requires careful prompt-engineering, not urgent at pilot scale
- [ ] **Free-text feedback on 👎** — after telemetry + PII-scrubbing discipline is battle-tested
- [ ] **Persona-graph-style personalization** (Glean-style) — out of scope for a 2-role product

---

## 9. Feature Prioritisation Matrix

Ranked by Author-metric leverage × implementation cost.

| Feature | User Value | Implementation Cost | Priority | Author Metric |
|---|---|---|---|---|
| Telemetry schema (Gap A) | HIGH | MEDIUM | **P1** | Required to measure |
| Thumbs feedback w/ fixed dropdown (Gap F) | HIGH | LOW | **P1** | Leading indicator |
| Copy answer button (Gap E) | HIGH | LOW | **P1** | Direct Author workflow |
| Direct "flag a gap" action (Gap C) | HIGH | LOW | **P1** | Corpus quality loop |
| Freshness / version indicator (Gap G) | MEDIUM | LOW | **P1** | Trust signal |
| First-run tooltip (Gap H) | MEDIUM | LOW | **P1** | Scope-setting |
| Stop-response + error retry | MEDIUM | LOW | **P1** | Table stakes |
| Naming-convention lint (Differentiator B) | HIGH | MEDIUM | **P2** | Direct metric driver |
| Resolution-field check (Differentiator B) | HIGH | MEDIUM | **P2** | Direct metric driver |
| Suggested follow-ups (Gap I) | MEDIUM | MEDIUM | **P2** | Engagement |
| Save-conversation download (Gap K) | MEDIUM | LOW | **P2** | Author retention |
| Citation micro-feedback (Differentiator) | MEDIUM | LOW | **P2** | Quality signal |
| Summarise-a-section (Differentiator) | MEDIUM | LOW | **P2** | Author refresher |
| Admin preview (Gap L) | MEDIUM | LOW | **P2** | Operational |
| Pre-submit full-form check (Differentiator) | HIGH | HIGH | **P3** | Depends on v1.1 telemetry |
| Example-articles surface (Differentiator) | HIGH | LOW (once content exists) | **P3** (content-blocked) | Author training |
| Free-text 👎 comment | MEDIUM | MEDIUM | **P3** | After scrubbing discipline |
| Cost-ceiling UX (Gap M) | LOW | MEDIUM | **P3** | Post-pilot scale |

**Priority key:** P1 = v1 pilot launch; P2 = v1.1 post-pilot-feedback; P3 = v2+ or gated.

---

## 10. Sources

Named products surveyed:
- [Glean — third-generation Assistant with personal graph and citations (Sept 2025)](https://www.glean.com/blog/live-fall-25-main)
- [Glean Assistant — search in chat, autocomplete, image generation (Jan 2026)](https://www.glean.com/blog/assistant-updates-search-img-gen-jan-drop-2026)
- [Glean product — enterprise AI assistant with citations](https://www.glean.com/product/assistant)
- [Guru — AI writing assistant, verified answers, Knowledge Agents](https://www.getguru.com/features)
- [Guru Review 2026 — verification workflows, built-in AI writing assistant](https://fritz.ai/glean-review/)
- [Guru AI Knowledge Base — verification, review cycles, SME tracking](https://www.getguru.com/reference/ai-knowledge-base)
- [ServiceNow Now Assist — Knowledge Center with advanced editing](https://www.servicenow.com/community/knowledge-management-articles/introducing-knowledge-center-with-advanced-editing-powered-by/ta-p/3447858)
- [ServiceNow Now Assist for CSM — Knowledge Generation from case data](https://www.servicenow.com/community/csm-articles/now-assist-for-csm-knowledge-generation/ta-p/3344465)
- [ServiceNow — best practices for KB articles with Now Assist (freshness, relevancy model)](https://www.servicenow.com/community/knowledge-management-articles/best-practices-to-use-your-knowledge-articles-with-now-assist/ta-p/2824219)
- [ServiceNow — Article Quality Index (AQI) / Content Standard Checklist](https://www.servicenow.com/community/knowledge-managers/what-we-use-as-criteria-for-kcs-article-quality-index-aqi-check/ba-p/2276131)
- [Consortium for Service Innovation — AQI renamed to Content Standard Checklist](https://www.serviceinnovation.org/aqi-is-content-standard-checklist/)
- [Microsoft Copilot — deep citations in Word, PowerPoint, meetings (Feb 2026)](https://m365admin.handsontek.net/microsoft-copilot-microsoft-365-deep-citations-copilot/)
- [Microsoft 365 Copilot — March 2026 updates including dashboard thumbs-up/down](https://techcommunity.microsoft.com/blog/microsoft365copilotblog/what%E2%80%99s-new-in-microsoft-365-copilot--march-2026/4506322)
- [Microsoft Copilot in SharePoint FAQ — knowledge agent, authoritative sources](https://support.microsoft.com/en-us/office/frequently-asked-questions-about-copilot-in-sharepoint-eb1b7668-3d98-4a93-98ef-f0c6dfc694f0)
- [Google Gemini Enterprise — chat with export of answers](https://docs.cloud.google.com/gemini/enterprise/docs/assistant-chat)
- [Cornell Microsoft 365 Copilot — save Copilot session responses (session-only workaround)](https://it.cornell.edu/microsoft-copilot-enterprise/save-copilot-responses)

Conversation UX / category pattern sources:
- [NN/g — 6 Types of Conversations with Generative AI (77% multi-turn stat)](https://www.nngroup.com/articles/AI-conversation-types/)
- [NN/g — Prompt Controls in GenAI Chatbots](https://www.nngroup.com/articles/prompt-controls-genai/)

Privacy / anti-feature evidence:
- [Stanford Report — AI chatbot privacy study (Oct 2025)](https://news.stanford.edu/stories/2025/10/ai-chatbot-privacy-concerns-risks-research)
- [Lakera — PII in AI interactions](https://www.lakera.ai/blog/personally-identifiable-information)
- [Metomic — ChatGPT business risks (2026)](https://www.metomic.io/resource-centre/is-chatgpt-a-security-risk-to-your-business)

Telemetry / adoption-measurement pattern:
- [Microsoft Copilot Adoption Metrics — KPIs for IT leaders](https://www.copilotconsulting.com/insights/microsoft-copilot-adoption-metrics-kpis)
- [Worklytics — measuring AI adoption with Copilot Dashboard (thumbs metric as only native quality signal)](https://www.worklytics.co/blog/measure-ai-adoption-impact-with-copilot-dashboard)

Examples / templates (Differentiator gated on handover §19):
- [Zendesk — knowledge base article templates](https://www.zendesk.com/blog/knowledge-base-article-template/)
- [ServiceNow Community — Knowledge Article Samples per template](https://www.servicenow.com/community/knowledge-managers/knowledge-article-samples-for-each-of-the-ka-template/m-p/303848)

---

## 11. Confidence Assessment & Open Questions

**HIGH confidence:**
- The category norms (thumbs, copy, follow-ups, freshness, citations) — surveyed across Glean, Guru, Copilot, Now Assist, Notion AI and are genuinely universal.
- The anti-features list — each has a concrete reason rooted in PROJECT.md constraints or 2025/26 security research.
- Session-only storage as a feature not a gap — supported by the Stanford and Lakera privacy research.

**MEDIUM confidence:**
- The specific leverage ranking of Differentiator-B (naming + resolution lints) on the Author metric. No public benchmark isolates "pre-submit AI lint → article-rejection-rate reduction." The logic is sound (rejections happen for naming-convention and resolution-completeness reasons per handover §6 / §7; a lint that directly targets those should reduce them) but the magnitude is unvalidated. Treat as hypothesis to test during pilot.
- Whether a 10–20 person pilot cohort will actually click thumbs at a meaningful rate. Worklytics data says <10% of Copilot users rate — a small pilot may produce too-small-N for confident iteration. Recommend solving by telling the pilot cohort explicitly that feedback is what drives iteration (not a UI change).

**LOW confidence:**
- Whether a session-download feature actually gets used in practice. It's cheap to add and removes a UX papercut from session-only storage, but usage evidence for "save AI conversation" features across products is mixed.

**Gaps where research was inconclusive:**
- No external benchmark for "what percentage of KB-article rejections are caused by each of the §7 checklist items." Would sharpen the Differentiator-B ranking. Recommend collecting this from ServiceNow's existing `knowledge feedback task` data as part of Gap A (telemetry) work, before pilot.
- No public data on what telemetry Now Assist Knowledge Center uses to prove its Article Quality Index moved article quality. Presumably internal ServiceNow data. Recommend borrowing the AQI / Content Standard Checklist criteria set as a published, mature prior art for MMC's own Resolution-field check prompt design.
