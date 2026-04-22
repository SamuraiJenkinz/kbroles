# Research Synthesis — KB Knowledge Assistant

Distilled from STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md. Read the source files for full detail.

---

## TL;DR

1. **The load-bearing part of this product is the grounding layer.** `src/grounding/*` + `src/llm/*` must exist, be tested, and be framework-agnostic **before** any UI route or LLM call is wired. The citation contract is the single most important artifact in the build. [ARCHITECTURE §16]
2. **Use structured output (JSON Schema `strict: true`) for citations, not inline markers.** Shape: `{ can_answer: bool, answer: string, citations: [{ source_id: enum, section_id: string, quote: ≤280 chars }] }`. The `quote` field enables **server-side substring validation against the source registry** — this is the mechanism that kills hallucinated citations deterministically. [ARCHITECTURE §4.2]
3. **There is a forced Phase 0 before any real code.** ~30-min smoke tests on (a) exact MGTI `baseURL` path suffix, (b) whether the ingress honours `response_format: json_schema` strict mode, (c) streaming chunk buffering through APIM, (d) Entra admin consent for SPA + `brk-multihub://` redirect, (e) Teams sideload policy. All are cheap to verify and expensive to hit in production. [STACK §4, PITFALLS #10–12]
4. **Pilot telemetry must exist before pilot launch, not after.** "Authors produce better articles" is the primary success metric — it is unmeasurable without a pre-registered schema (👍/👎, citation-click-through, fallback rate, chip vs freeform, external monthly pull of rejected / flagged article rate from ServiceNow). Pre-registration also protects the metric from confounders. [FEATURES Gap A, PITFALLS #14]
5. **v1 Active scope grows by ~11 items.** Beyond what PROJECT.md already lists, the pilot cohort will expect: copy-answer, thumbs feedback, new-conversation, stop-response, timestamp-on-hover, error/retry state, keyboard submit, freshness/version indicator, first-run tooltip, direct "flag-a-gap" action, telemetry schema. These are pilot-survival table stakes, not wishlist.
6. **The biggest Author-metric lever (naming + Resolution lint chips) is v1.1, not v1.** It depends on v1 telemetry to prove lift. Ship order matters.
7. **Nested App Authentication (NAA) is the right Web + Teams auth pattern.** `createNestablePublicClientApplication` + `supportsNestedAppAuth: true` + `brk-multihub://` redirect + schema 1.22 manifest with `webApplicationInfo.nestedAppAuthInfo`. Same code runs in Teams and standalone browser; eliminates the entire OBO server endpoint. GA as of 2025–26. [STACK §2]
8. **Hosting is Azure App Service Linux, not Static Web Apps.** SWA's Next.js hybrid support is still preview in 2026 with a 250 MB cap; the wrong shape for a corporate-ingress streaming chat. [STACK §4]

---

## Load-Bearing Stack Decisions

| Dimension | Pick | Version | Rationale |
|---|---|---|---|
| Frontend + framework | Next.js App Router + React 19.2 | Next 16 (stable Oct 2025) | React Compiler + stable Turbopack; no reason to start greenfield on N-1 |
| LLM client | `@ai-sdk/azure` v2 | 2.x | Native `api-key` header, correct `/deployments/{id}/chat/completions?api-version=...` URL shape; `createAzure({ baseURL, apiKey, useDeploymentBasedUrls: true })`. Local dev uses `createOpenAI({ apiKey })` — identical `LanguageModelV2` downstream |
| Auth — web + Teams | NAA via `@azure/msal-*` + `@microsoft/teams-js` | msal-react 3.x, teams-js latest | `createNestablePublicClientApplication` + `supportsNestedAppAuth: true`. Manifest schema 1.22 with `webApplicationInfo.nestedAppAuthInfo`. No OBO endpoint needed |
| Hosting | Azure App Service Linux, Node 20.9+, `output: 'standalone'` | — | Corporate ingress + streaming; SWA hybrid Next support is preview with 250 MB cap |
| Styling | Tailwind v4 + shadcn/ui | Current | Composable, accessible-by-default, maps cleanly to the handover's colour-coded source panel |
| Testing | Vitest + custom grounding eval suite; Playwright for 2–3 smoke tests | Current | **Grounding evals are the primary gate, not UI tests.** Eval fixtures derived from the 13 suggested prompts + adversarial probes |
| Observability | Application Insights + OpenTelemetry | Current | Anonymised Q&A-pair logging for the Author-metric pipeline; validator-flip rate as first-class signal |

**Explicit anti-picks (do NOT use):** LangChain (over-abstracted for stuffed-context grounding); raw `openai` SDK with manual headers (AI SDK's Azure provider is cleaner); Static Web Apps (wrong shape for this deployment).

---

## Load-Bearing Architecture Decisions

### Source-marker format
XML tags for boundaries, markdown inside, HTML-comment section anchors:
```xml
<source id="KB0022991" version="v13.0" url="https://mmcnow.service-now.com/kb_view.do?sysparm_article=KB0022991">
<!-- section:flagging-articles -->
## Flagging Articles
Any user with read access can flag an article...
</source>
```
- `id` + `version` + `url` are machine-readable attributes
- `<!-- section:... -->` comments give the model a deterministic target for `section_id` in citations
- Format tested to perform equivalently to markdown on gpt-4o, chosen for parseability and human review

### Citation contract — structured output, `strict: true`
```jsonc
{
  "type": "object",
  "properties": {
    "can_answer": { "type": "boolean" },
    "answer": { "type": "string" },
    "citations": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "source_id": { "type": "string", "enum": ["KB0020882", "KB0022991", "FORM_SCHEMA"] },
          "section_id": { "type": "string" },
          "quote": { "type": "string", "maxLength": 280 }
        },
        "required": ["source_id", "section_id", "quote"],
        "additionalProperties": false
      }
    }
  },
  "required": ["can_answer", "answer", "citations"],
  "additionalProperties": false
}
```
- `quote` is the hallucination-killer: server validates substring presence in the source registry; citations failing validation get stripped; if all fail, fallback fires
- Key order (`can_answer` → `answer` → `citations`) lets UI stream `answer` cleanly and hold citations until `done` — no flicker from mid-stream stripping
- Schema enum on `source_id` prevents fabricated document IDs at the model layer

### Fallback strategy — three layers
1. **Prompt discipline + few-shots.** System prompt instructs: if unsure, set `can_answer: false` and return the fallback text from handover §15.
2. **Schema-level.** `can_answer: false` branches to the fallback UI without running citation validation.
3. **Citation validator.** If `can_answer: true` but every citation fails substring-in-registry check, flip to fallback.

OpenAI's `refusal` field maps to the same fallback path. **No second-pass classifier** — the above triad is sufficient.

### Role strategy
One system-prompt template parameterised by role. `composeSystemPrompt(role)` returns: role-specific prelude + role-specific few-shots + shared grounding rules + citation contract. Extension to a 3rd role = one enum entry + one prelude + one prompt list.

### Dev/prod LLM swap
Single `createLlmClient()` factory driven by env vars: `LLM_AUTH_MODE` (`bearer` | `api-key`), `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`. **Zero `NODE_ENV` branching anywhere in app code.** Local dev → direct OpenAI with Bearer; prod → MGTI ingress with `api-key`.

### State shape (TypeScript-ish)
```ts
type Role = 'consumer' | 'author';
type SessionState = {
  role: Role | null;
  conversation_history: Array<{ role: 'user' | 'assistant'; content: string; citations?: Citation[] }>;
  active_citation: Citation | null;          // drives right panel
  last_active_citation: Citation | null;     // prompt-engineering continuity hint
};
```
All in-memory, per-tab; nothing persisted.

### Suggested build order (8 phases, ARCHITECTURE §16)
```
A. Grounding substrate    (registry, schema, validator, eval fixtures)
B. LLM client + provider  (MGTI smoke test, structured-output smoke test)
C. BFF /api/chat          (streaming, citation hold, fallback trigger)
D. UI skeleton            (role select, chat, input, message list)
E. Source panel + chips   (colour coding, deep-link)   ┐ parallelisable
F. Auth (NAA + Teams tab) (SSO, manifest, sideload)    ┘ after D
G. Telemetry + admin      (App Insights, admin preview)
H. Eval hardening + pilot prep
```

---

## v1 Scope Recommendations (extensions to PROJECT.md Active)

### Must add before pilot (P1)
These are pilot-survival table stakes. Omitting them reads as "unfinished prototype."

- [ ] Telemetry schema — required to measure the primary success metric
- [ ] Copy-answer button (with citation inline in the copied text)
- [ ] Thumbs 👍/👎 per message, fixed-option dropdown on 👎 (no free-text yet)
- [ ] Stop-response button during in-flight LLM call
- [ ] New-conversation / clear-chat button (distinct from Change-role)
- [ ] Message timestamps on hover
- [ ] Keyboard submit (Enter sends, Shift+Enter newline)
- [ ] Error state + retry when ingress is unavailable
- [ ] Freshness / version indicator in chat header ("Grounded in KB0022991 v13.0 · KB0020882 v9.0 · Form schema dated X")
- [ ] First-run "About this assistant" tooltip (dismissible)
- [ ] Direct "flag-a-gap to CTSS Knowledge team" action as affordance from the fallback
- [ ] Distinct fallback UI (not styled like a normal answer, per PITFALLS #20)

### Add if easy (P1 if time, else P2)
- [ ] SME / approver directory lookup as a first-class chip (data already in handover §8)
- [ ] Hoverable freshness badge on each cited chunk (`KB0022991 v13.0 · Revised by Edmar Roseno`)
- [ ] Admin preview mode (`?admin=1`-gated view of live system-prompt version + last-embed timestamp), gated by Entra group

### Defer to v1.1 (after pilot telemetry proves lift)
- Naming-convention lint chip (highest Author-metric lever — but gate on telemetry)
- Resolution-field completeness check chip (second-highest lever)
- Suggested follow-up prompts after each answer
- Session-download / save-conversation (client-side only)
- Citation-specific 👍/👎 (disambiguates hallucinated citation from wrong answer)
- Summarise-a-section mode
- `last_active_citation` carry-over between conversation turns

### Defer to v2+
- Pre-submit full-form check (requires structured input UX)
- Example-articles surface (content-blocked on handover §19 gap)
- Cost-ceiling UX (matters at broad-launch scale)
- Free-text 👎 comment (after PII-scrubbing is battle-tested)

---

## Anti-Features to Codify in REQUIREMENTS.md Out of Scope

Each has a concrete reason grounded in PROJECT.md constraints or 2025/26 privacy research.

| Anti-feature | Why we won't build it |
|---|---|
| Stored per-user conversation history | Violates session-only constraint; creates PII/retention surface |
| Free-text 👎 comment in v1 | Opens an uncontrolled free-text ingestion path before scrubbing is hardened |
| AI-generated article drafts from tickets | Different product problem; undermines the citation-discipline the product is built on |
| "Suggest improvements to my article" style agentic actions | No write-back target; degenerates into unactionable advice |
| Multi-KB expansion ("add HR, add Security") | Stuff-the-context grounding breaks at scale; would need RAG + permissions model |
| Conversational "regenerate" button | Undermines single-correct-citation premise; users click until they get the answer they want |
| Real-time co-authoring | Requires shared state; violates session-only |
| Live ServiceNow search / RAG v2 | Invalidates grounding-by-stuffed-context model; requires permissions model |
| Proactive notifications ("your article is stuck") | Requires server-side user state + ServiceNow integration |
| Image generation / AI diagrams | High hallucination risk on business-process diagrams; violates "never invent" |
| Prompt autocomplete / rephrasing | Suggests prompts the system can't answer; widens out-of-scope fallback surface |
| "Trust my judgement" override that bypasses grounding | Destroys the core value of the product |

---

## Critical Pitfalls by Phase

Full detail in PITFALLS.md. Table below shows CRITICAL + HIGH severity items mapped to the 8-phase build order above.

| # | Pitfall | Severity | Phase | One-line prevention |
|---|---|---|---|---|
| 1 | Model best-guesses out of scope | CRITICAL | A, E | Negative-eval set ≥30 out-of-scope prompts; fallback-fire rate = primary grounding signal |
| 2 | Citation drift (answer right, citation section wrong) | CRITICAL | A, E | `quote` substring validation against registry; paired-role + entailment evals |
| 3 | Lost-in-the-middle at 15K tokens in long conversations | HIGH | A, E | Positional eval (same Q at top/middle/bottom of context); trim old turns before 40K-token mark |
| 4 | Role contamination / Consumer gets Author answer | CRITICAL | A, D, E | Paired-role eval per prompt; role as explicit parameter in every LLM call |
| 5 | Over-helpful fallback (model invents a workaround) | HIGH | A | Few-shots that demonstrate fallback wording verbatim; fallback triggers rejection of any "workaround" language |
| 6 | Fabricated approver names / KB numbers | CRITICAL | A, E | Entity allowlist (approvers, KB numbers, URLs) validated post-response |
| 7 | Prompt injection via user question | HIGH | A, C | Injection eval set; system-prompt precedence rules; never echo raw user text into trusted sections |
| 8 | Stale SOP drift (v13 → v14 mismatch) | CRITICAL | G, H | SOP version-poller + named Content Steward; visible last-embed timestamp in admin preview |
| 9 | SSO / NAA edge cases (guests, cross-OPCO, contractors) | MEDIUM (pilot) / HIGH (GA) | F | Pilot whitelist; test matrix across guest/service/cross-tenant accounts |
| 10 | MGTI ingress auth / URL suffix quirks | HIGH | B | Phase 0 curl test; log every 4xx/5xx with ingress trace ID |
| 11 | Ingress buffering drops streaming chunks | HIGH | B, C | Phase 0 streaming smoke test; fallback to non-streaming if chunks buffer |
| 12 | Ingress rate-limit with no warning | HIGH | C | 429 handling + exponential backoff + user-visible "slow down" state |
| 13 | Successor role contamination on role-change | MEDIUM | D | Role change clears `conversation_history` and `active_citation` explicitly |
| 14 | Author-metric confounded by survivorship or selection bias | HIGH | H | Pre-registered measurement plan before pilot; pair with a no-assistant control cohort |
| 20 | Fallback UI reads as a normal answer | MEDIUM | E | Distinct visual treatment + "information isn't in the loaded documents" header |

---

## Phase-0 Open Questions (resolve before any coding phase)

1. **Exact MGTI `baseURL` suffix.** The ingress URL `https://stg1.mmc-dallas-int-non-prod-ingress.mgti.mmc.com/coreapi/openai/v1/deployments/.../chat/completions?api-version=...` — does `createAzure` want `baseURL` set to `/coreapi/openai`, `/coreapi/openai/`, or `/coreapi/openai/deployments`? 5-min curl test.
2. **Does MGTI honour `response_format: json_schema` strict mode?** Not every Azure-behind-APIM deployment does. This is load-bearing for the citation contract; validate against a known-good prompt before committing the schema.
3. **Does MGTI buffer streaming chunks?** Some APIM configurations coalesce SSE chunks. If yes, streaming UX is compromised — need to know before UI phase.
4. **Entra admin consent for SPA + `brk-multihub://` redirect URI.** NAA requires a specific redirect URI format; needs Entra admin to pre-consent.
5. **Teams sideload policy.** MMC may or may not allow custom-app sideloading in Teams; if blocked, Teams tab ships only after policy review.
6. **Corporate CA chain for outbound HTTPS.** Azure App Service may need a custom CA bundle to reach the MGTI ingress from outside MMC corporate network.
7. **App Service provisioning ownership.** Who creates the Azure resources — this project, the platform team, or a shared SRE group? Affects timeline.
8. **Pre-registered measurement plan.** Who owns the monthly rejected / flagged article rate pull from ServiceNow? Needs a named Content Steward before pilot.

---

## What's Not in This Summary

Refer to source files for:
- **Full competitor feature comparison** across Glean, Guru, Copilot, Now Assist, Notion AI → FEATURES.md §6
- **Full build-order dependency graph** with parallelisation notes → ARCHITECTURE.md §16
- **Full pitfall catalog** (14 CRITICAL/HIGH + 6 MEDIUM) with warning signs, detection, and recovery → PITFALLS.md
- **Stack rationale and confidence levels per pick** → STACK.md
- **Every feature gap A–M in the handover with dependencies and complexity** → FEATURES.md §5–§7

---

*Synthesized 2026-04-22. Confidence: HIGH on stack + architecture + pitfalls; MEDIUM on specific Author-metric lift magnitudes (unvalidated, treat as pilot-testable hypothesis).*
