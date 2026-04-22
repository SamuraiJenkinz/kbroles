# Phase 2: Chat Backend (BFF) - Context

**Gathered:** 2026-04-22
**Status:** Ready for planning (pending Phase-0 prod-mode smoke — see §Entry Gates)
**Mode:** User delegated all four discussed areas to Claude based on existing research (ARCHITECTURE.md, PITFALLS.md, STACK.md, REQUIREMENTS.md, Phase 1 CONTEXT.md, STATE.md). Decisions below cite the research paragraph they derive from; anything not cited is a pin on a previously-open question.

<domain>
## Phase Boundary

A stateless `POST /api/chat` streaming route and a static `GET /api/prompts?role=…` endpoint. The chat route composes the role-aware system prompt via the Phase-1 `composeSystemPrompt(role)`, calls MGTI through `createLlmClient().streamAnswer()`, parses the partial-JSON answer field into SSE `answer_delta` events, runs the Phase-1 citation validator, runs a new entity-allowlist post-check, emits a single `fallback` event on any grounding-failure path (model `refusal`, `can_answer:false`, all-citations-stripped, or allowlist violation), and writes structured request logs with no raw user-question text. No UI, no auth middleware (stubbed for local), no source panel, no telemetry schema.

**Requirements in scope:** GRND-07 (streaming with citation hold), FBK-02 (fallback trigger), CORP-02 (entity allowlist post-check).

**Deliverables this phase:**
- `src/app/api/chat/route.ts` — Node-runtime Next.js Route Handler, SSE streaming
- `src/app/api/prompts/route.ts` — static-ish JSON endpoint per role
- `src/chat/sse.ts` — event-emitter helper (types + `encodeSse()`)
- `src/chat/partialAnswer.ts` — tolerant partial-JSON parser tracking the `answer` key
- `src/chat/allowlist.ts` — post-check against Phase-1 `ENTITY_ALLOWLIST`
- `src/chat/concurrency.ts` — in-process semaphore
- `src/prompts/suggested.ts` — verbatim chip lists from handover §16 (5 Consumer, 8 Author)
- `src/obs/logger.ts` — `pino` instance + request-scoped log helper
- Vitest suites for each (unit + route-level with a mocked `streamAnswer`)
- `docs/api-chat-contract.md` — client-facing SSE event contract for Phase-3 authors

**Explicitly NOT in scope this phase (belongs later):**
- Entra ID / MSAL / Easy Auth wiring (Phase 5 — route carries a stub middleware until then)
- Chat UI, role-select, citation chips, source panel, fallback UI treatment (Phases 3–4)
- App Insights custom events / question hashing / TELE-* schema (Phase 6)
- Response cache keyed on `hash(role + question)` (ARCHITECTURE §14 — deferred to Phase 6 / v1.1)
- Injection-shape session rate limiting (PITFALLS #7 prevention #5 — deferred; structured-output already blocks compliance)
- Tenant allowlist enforcement on token (Phase 5 AUTH-01)

## Entry Gates (carry-forward from Phase 1 Plan 05)

The Phase-1 `smoke` script's prod-mode run is a hard gate on the first `/api/chat` code commit in this phase. Needed: (a) MGTI API key, (b) `LLM_BASE_URL` suffix confirmed by Smoke 1, (c) gpt-4o deployment name, (d) MMC corporate CA bundle PEM + `NODE_EXTRA_CA_CERTS` set in shell env (not `.env`). See STATE.md "Phase 2 entry gates." Planning can proceed; execution of the route code must wait for prod-green smokes.

Before the Phase-2 plan is written, the .env handling contract should be consolidated into a single ops doc (STATE.md concern — "Expand .env handling docs before Phase 2 plan"). Source: Plan 05 decision #3 (tsx vs Next.js env loading difference).

</domain>

<decisions>
## Implementation Decisions

### 1. SSE event protocol & fallback encoding

**Framing.** Raw SSE `data: <json>\n\n` frames with a `type` discriminant field — NOT named SSE `event:` lines. Source: ARCHITECTURE.md §5 lines 362–366 ("`res.write('data: ' + JSON.stringify(event) + '\n\n')`"). Rationale: simpler client-side `ReadableStream.getReader()` parser, survives reverse-proxy reformatting, aligns with ARCHITECTURE §5's shape exactly.

**Response shape.** `Content-Type: text/event-stream; charset=utf-8`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, `X-Accel-Buffering: no` (hints any nginx-like hop to not buffer — defence against PITFALLS #10 even though MGTI is the primary streaming concern). Status 200 once streaming opens; errors before first chunk return as HTTP 4xx/5xx with JSON body (see §4 below).

**Event schema (5 named types).** Replaces ARCHITECTURE §5's 3-event sketch (`partial`/`done`/`refusal`). Reasons: roadmap SC #2 mandates a "single `fallback` event"; citations warrant their own event (not just an attribute on `done`) so Phase-3 client logic separates answer streaming from citation attachment; `error` (infra) is distinct from `fallback` (grounding). Naming: `answer_delta` is clearer than `partial`.

```ts
// src/chat/sse.ts
type SseEvent =
  | { type: 'answer_delta';  text: string }                                  // one per partial-JSON tick
  | { type: 'citations';     citations: Citation[] }                         // single event, post-validator, pre-done
  | { type: 'fallback';      reason: FallbackReason; text: string }          // terminal: text = handover §15 verbatim
  | { type: 'done';          can_answer: boolean; validator_flips: number }  // terminal on success path
  | { type: 'error';         code: ErrorCode; message: string };             // terminal on infra failure

type FallbackReason = 'refusal' | 'can_answer_false' | 'all_citations_stripped' | 'allowlist_violation';
type ErrorCode      = 'upstream_timeout' | 'upstream_5xx' | 'schema_reject_after_retry' | 'internal';
```

**Event ordering (happy path):** `answer_delta` × N → `citations` (once) → `done` (terminal). Source: ARCHITECTURE §7 Recommended lines 454–467 ("Ignore citations until the server emits done"). Phase 1 §2 schema key order (`can_answer → answer → citations`) guarantees `answer` streams early and citations arrive last from the model.

**Event ordering (fallback path):** `answer_delta` × N (zero or more) → `fallback` (terminal). No `citations` and no `done`. Client-side contract: on `fallback`, REPLACE the accumulated `answer_delta` text with `fallback.text` (the handover §15 fallback string, verbatim). Source: ARCHITECTURE §5 lines 385–387 (reconciliation-on-done principle) combined with §8.3 Line 3 ("validator flips the response to the fallback before it reaches the client"). Rationale: validator may flip AFTER tokens have already left the wire (any time the strip happens on the FINAL citation of a `can_answer:true` response); the client must reconcile to the canonical fallback string to satisfy FBK-01 (exact §15 text).

**Event ordering (error path):** `answer_delta` × N (zero or more) → `error` (terminal). No `fallback` (grounding vs infra distinction). Client renders a retry affordance (Phase-3 CHAT-07 territory).

**Partial-JSON strategy.** Tolerant parser tracks the `answer` string value only. On every inbound chunk, attempt to extract the latest `answer` value; emit `answer_delta { text: diff }` with the incremental suffix since the last emit. Ignore `citations` and `can_answer` during streaming. Source: ARCHITECTURE §7 lines 454–463 ("Use a tolerant partial-JSON parser … Parser is trivial because `answer` appears early in the schema and is a simple string"). Library choice deferred to planning; leaning toward a small hand-rolled 60-line parser over `partial-json` / `openai-partial-stream` to avoid a transitive dep for ~50 lines of logic — to be confirmed at plan time.

**Citation-hold semantics.** The final OpenAI response object arrives; validator runs (Phase-1 §2); entity allowlist post-check runs (§2 below); IF all three gates pass, emit `citations` event with the validated-and-trimmed-to-one citation array, THEN `done`. IF validator fully stripped → flip path (emit `fallback` with `reason: 'all_citations_stripped'`). IF allowlist fails → flip path (emit `fallback` with `reason: 'allowlist_violation'`).

**Refusal handling.** OpenAI structured-output `refusal` field (ARCHITECTURE §4.2 line 235) is mapped to `fallback { reason: 'refusal' }`. Model `can_answer:false` is mapped to `fallback { reason: 'can_answer_false' }`. Both use the same `fallback.text` (handover §15 verbatim from Phase-1 `COMMON_RULES_HEADER`). Client treats all four reasons identically for rendering (Phase-4 FBK-03 single distinct UI); reasons are for telemetry.

**Runtime.** Next.js 16 Route Handler, **Node runtime** (not Edge). Source: STACK.md §3 line 85 ("Route Handlers run in the Node runtime, not Edge: required because we need fetch against a corporate ingress that likely presents a corporate root CA. Edge runtime doesn't let us touch NODE_EXTRA_CA_CERTS"). Streaming written via a `ReadableStream` whose `start(controller)` pumps SSE frames from an `async function*` generator, wrapped in `new Response(stream, { headers })`.

**Route handler stays thin.** No reshaping of `messages`, no tool calls, no conversation memory. Retries and upstream-specific handling live inside `src/llm/client.ts` (Phase 1). Source: ARCHITECTURE §12 Pattern 4 ("BFF pass-through with minimal transformation … If we need to add retries, circuit breaking, or a model-change fallback, it goes inside src/llm/client.ts, not in the route handler").

---

### 2. Entity allowlist post-check policy (CORP-02)

**Three entity classes checked.** Phase 1 already exports `ENTITY_ALLOWLIST = { names: Set<string>, kbIds: Set<string>, urls: Set<string> }` from `src/grounding/registry.ts` (Phase 1 CONTEXT.md §1 last paragraph; STATE.md Plan 01-01 decision on KB_ID_RE). Phase 2 scans the FINAL `answer` string against all three classes. Source: PITFALLS #6 lines 170–174; REQUIREMENTS.md CORP-02 ("approvers list, KB numbers, ServiceNow URLs").

**Scanned field.** `answer` text ONLY. Citation `quote` fields are NOT re-scanned, because the Phase-1 validator (CONTEXT.md §2 step 2) has already proven each `quote` is a verbatim substring of a registered source body — any entity inside a validated quote is, by definition, in-source. Re-scanning quotes is redundant work and produces false-positive risk (a quote might legitimately contain a partial name token that isn't itself a full allowlisted name).

**Regex extractors.**
- Names: `/[A-Z][a-z]+ [A-Z][a-z]+/g`. PITFALLS #6 line 170.
- KB IDs: `/KB\d{5,}/g` — matches both 7-digit (KB0020882, KB0022991) and 8-digit (KB18801781) IDs. Source: STATE.md Plan 01-01 decision ("KB_ID_RE loosened from `\bKB\d{7}\b` to `\bKB\d{5,}\b`").
- URLs: `/https?:\/\/[^\s)]+/g`. REQUIREMENTS.md CORP-02; Phase 1 CONTEXT.md §1 `ENTITY_ALLOWLIST.urls`.

**Failure mode — fail-closed.** If ANY extracted entity from ANY class is not in the corresponding allowlist set, flip the response to fallback. Emit `fallback { reason: 'allowlist_violation', text: <handover §15 verbatim> }` and terminate the stream. Source: PITFALLS #6 line 174 prevention #1 ("reject the response and either regenerate or return the fallback"). Choose `return the fallback` over `regenerate`: regeneration (a) adds a full-model round-trip of latency, (b) doesn't guarantee non-violation on the same prompt, (c) conflicts with PITFALLS #12.3's "cap retries at 2 to avoid amplifying incidents." Fail-closed is the rational pick given CORP-02's CRITICAL severity (PITFALLS #6 line 179).

**Execution sequence in `/api/chat`:**

```
schema-valid final response
   │
   ▼
Phase-1 citation validator  (strip invalid citations; if all stripped AND can_answer=true → flip)
   │
   ▼ (still standing)
Phase-2 entity allowlist post-check  (scan answer text; any violation → flip)
   │
   ▼ (still standing)
emit `citations` → emit `done`
```

Two independent flip paths converge on the same `fallback` event emission. `validator_flips` and `fallback_reason` in the structured log disambiguate which path fired.

**No regeneration loop.** Single model call per request. PITFALLS #6 says "regenerate or return fallback"; we pick fallback unconditionally in v1.

**Test fixtures (pins for the plan).**
- Negative: synthetic model output containing "Jane Doe" (not in approver list) → must flip with `reason: 'allowlist_violation'`, log records `class: 'names', token_count: 1`.
- Negative: synthetic output containing `KB9999999` → must flip, `class: 'kbIds', token_count: 1`.
- Negative: synthetic output containing a URL not in allowlist → must flip, `class: 'urls', token_count: 1`.
- Positive: synthetic output enumerating the 7 approvers from PROJECT.md + any of the three KB IDs + the registered ServiceNow URL → must pass (reach `citations` → `done`).
- These are exactly the acceptance tests for roadmap Phase 2 SC #3.

**What does NOT go into the violation log entry.** The offending token is NOT logged — only `{class, token_count}`. Source: PITFALLS #10 principle line 527 ("Log question hash + answer metadata, not raw text") combined with SC #5 ("no raw user-question text"). Extending that principle: a fabricated name in a model response could contain a real person's name that the model emitted unprompted — treat it as raw content, not observability metadata. The violation class + count are sufficient to detect drift; a spike investigation can be reproduced against the eval fixtures.

---

### 3. Upstream resilience & rate limiting (PITFALLS #12)

**In-process concurrency limiter.** A single global in-process semaphore caps concurrent in-flight `/api/chat` streams at **20** (ARCHITECTURE §14 line 707: "a per-route concurrency limiter (e.g. 20 in-flight requests)"). Implementation: hand-rolled `AsyncSemaphore` in `src/chat/concurrency.ts` with an internal FIFO of waiters. No external dep. Cap is env-overridable via `MAX_INFLIGHT_STREAMS` (zod-validated, default 20).

**Per-user limits — OUT OF SCOPE for v1.** Pilot cohort is ≤50 concurrent users (ARCHITECTURE §14 "Pilot | No changes"); global 20-in-flight is sufficient. Per-user limits require MSAL token identity extraction (Phase 5 dependency) and meaningfully complicate the limiter. Revisit at v1.1 if pilot telemetry shows single-user saturation.

**Over-cap behaviour.** If the semaphore is full at route entry, return HTTP **429** with:
- `Retry-After: 5` header
- Body: `{ "error": "rate_limited", "message": "We're busy — please retry in a moment." }`

Do NOT open an SSE stream. Source: ARCHITECTURE §14 line 707 ("Surface 'We're busy — please retry in a moment' in the chat, not a blank failure"). Phase-3 CHAT-07 retry affordance consumes this.

**MGTI upstream retry policy (inside `src/llm/client.ts`).**
- Retry on: MGTI-returned HTTP **429, 502, 503, 504**, network `ECONNRESET`/`ETIMEDOUT`. Corporate-ingress-may-convert-429-to-502 caveat from PITFALLS #12 line 343 is covered.
- Do NOT retry on: 400 (bad request), 401/403 (auth), 422 (schema rejected by strict-mode — surfaces as `schema_reject_after_retry` after the existing Phase-1 Ajv fallback has also failed), or any failure where the first `answer_delta` has already left the wire.
- Retry count: **capped at 2** (total 3 attempts). Source: PITFALLS #12 line 353 ("cap retries at 2 to avoid amplifying incidents").
- Backoff: base 500 ms, multiplier 2, jitter ±250 ms → first retry ~500±250 ms, second retry ~1000±250 ms. `Math.random()`-based jitter per the standard full-jitter pattern.
- Retries run BEFORE the first byte is streamed to the client; once streaming starts, a mid-stream MGTI failure emits `error { code: 'upstream_5xx' }` (terminal, no retry).

**Retries live in the adapter, NOT the route.** Source: ARCHITECTURE §12 Pattern 4 line 645. Phase 1's `streamAnswer()` facade is where this logic belongs; the route handler awaits the facade's first event and is unaware of whether a retry fired.

**Timeout budgets (AbortController-based).**
- **Per-request total:** 45 s from route entry to `done`/`fallback`/`error`. Source: PITFALLS #12 line 348 ("Any response time > 20s for a 1K-output response — smells like throttling") + PITFALLS #10 line 283 (enterprise middleboxes "drop idle streaming connections at 30s / 60s"). 45 s is chosen to (a) accommodate long stuffed-context generations, (b) fail before any 60s-idle-drop, (c) leave retry headroom before overall limit.
- **Inter-chunk idle:** 20 s between successive MGTI stream chunks once streaming has begun. Source: PITFALLS #10 line 283; Phase 1 Plan 05 dev-mode baseline P95=65 ms (20 s = ~300× headroom, catches true buffering without false-positives on slow generation).
- Implementation: an `AbortController` per request, `fetch` in the client adapter receives `signal`; inter-chunk timer reset on each chunk, fires `controller.abort()` → surfaces as `error { code: 'upstream_timeout' }`. `AbortController` is also bridged to the inbound `request.signal` so client disconnect aborts the MGTI call (Next.js Route Handlers expose `request.signal`).

**No response cache for v1.** ARCHITECTURE §14 lists `hash(role + question)` response caching at the "Broader MMC Tech (≤5K users)" tier only. Pilot traffic too low to justify; cache belongs in Phase 6 / v1.1 decision space. Also reduces surface area for PITFALLS #10 (body-caching ↔ body-logging ↔ streaming-breakage confusion).

**Observed fields logged on every throttle/retry event:** `{ request_id, role, event: 'throttle', source: 'self'|'mgti', status: number, retry_count: number, elapsed_ms: number }`. Source: PITFALLS #12 line 354 ("Dashboard tracking: TPM consumed, request rate, 429 count, 502 count, P50/P95 latency"). Dashboard builds in Phase 6.

---

### 4. HTTP surface contract

#### 4.1 `/api/chat` request shape

```ts
POST /api/chat
Content-Type: application/json

{
  "role": "consumer" | "author",
  "messages": [
    { "role": "user" | "assistant", "content": string },
    ...
  ]
}
```

Validated at route entry with a zod schema in `src/chat/requestSchema.ts`. Source: ARCHITECTURE §5 line 348 ("body: { role: 'consumer', messages: [...] }").

**400 Bad Request responses** (JSON body `{ "error": <code>, "detail"?: ... }`, NO SSE stream opened):
- `role_missing` — `role` absent
- `role_invalid` — not in enum
- `messages_missing` — `messages` absent
- `messages_empty` — zero-length array
- `message_role_invalid` — any `messages[i].role` not in {user, assistant}
- `message_content_invalid` — any `messages[i].content` not a string

**413 Payload Too Large**:
- `history_cap_exceeded` — `messages.length > MAX_MESSAGES` (default 20; env-overridable). Rationale: stateless contract, 20 messages × ~500 chars avg ≈ 10 K chars leaves comfortable headroom under the ~12 K-token system prompt inside the 128 K context window.
- `message_too_long` — any `messages[i].content.length > MAX_MESSAGE_CHARS` (default 8000 — roughly 2 K tokens). Rationale: accidental-paste DOS mitigation; also narrows the PITFALLS #7 injection-by-bulk-payload surface (large pastes are a common carrier for embedded "ignore previous instructions" payloads).

**Role is server-authoritative.** Server uses the validated `role` to select the system prompt and to log. No session storage of role server-side. Source: PITFALLS #4 prevention (role as explicit first-class input); Phase 1 CONTEXT.md §3 ("never trusted from the client … Phase 2 will make it server-authoritative on the route"). "Server-authoritative" here means: the server's validated `role` is the role that drives behaviour; the client body is the input, not the authority — when Phase 5 lands, the MSAL middleware will (optionally) cross-check against group membership, but the body field remains the signal that the grounding layer consumes.

#### 4.2 `/api/prompts` request & response

```ts
GET /api/prompts?role=consumer|author
→ 200 OK, Content-Type: application/json
{
  "role": "consumer" | "author",
  "prompts": [
    { "id": "cns-01", "label": "Find the article about X", "text": "Find the article that describes X in the KB" },
    ...
  ]
}
```

**Typed objects with IDs — not bare strings.** Each chip carries `{id, label, text}`:
- `id`: stable chip identifier, used by Phase-6 telemetry `chip_vs_freeform` signal (FEATURES.md line 103; roadmap Phase 6 SC #1). Bare strings would force Phase 6 to hash chip text, which is fragile under wording changes.
- `label`: short UI chip text (what the user sees on the button).
- `text`: full prompt sent to `/api/chat` when the chip is clicked. May differ from `label` where chip-UI brevity conflicts with prompt-quality verbosity.

**Chip counts and source.** 5 Consumer, 8 Author, verbatim from handover §16 (roadmap Phase 2 SC #4; FEATURES.md line 18). Authoring source of truth: new module `src/prompts/suggested.ts` — inline TS constants keyed by role, exported as `SUGGESTED_PROMPTS: Record<Role, ChipItem[]>`. Source: ARCHITECTURE §11 line 606 ("reads SUGGESTED_PROMPTS[state.role] from config"). Exact chip wording is a Claude-discretion item at plan time (copied from handover §16 during implementation; user review before shipping).

**Validation & errors:**
- `role` query param missing → HTTP 400 `{error: "role_required", allowed: ["consumer", "author"]}`
- `role` query param unknown → HTTP 400 `{error: "role_invalid", allowed: ["consumer", "author"]}` — NOT 404 (the URL exists; the query is invalid).

**Cache policy:** `Cache-Control: public, max-age=3600, stale-while-revalidate=86400`, plus `Vary: Accept-Encoding`. Rationale: chip lists change at most on redeploy (manual SOP re-embed cycle — PROJECT.md Key Decisions). `max-age=3600` is a 1-hour freshness window; `stale-while-revalidate=86400` allows transparent propagation after a redeploy. Static data; no user-specific `Vary`.

#### 4.3 Unified error-body shape

All HTTP-level errors across both endpoints return JSON:
```ts
{ "error": string, "message"?: string, "detail"?: unknown }
```

SSE-phase `/api/chat` errors (after the stream has opened) use the in-stream `error` event (§1 event schema).

#### 4.4 Auth — stubbed this phase

Phase 2 routes run with a stub middleware at `src/app/api/_middleware.ts`:
- In dev and test: `req.user = { sub: 'local-dev', tenantId: env.ENTRA_TENANT_ID }`.
- In prod (not yet exercised): an `if (!token) return 401` placeholder that Phase 5 replaces with real MSAL validation.

Source: ARCHITECTURE §16 Phase C step 12 ("Basic MSAL token validator middleware (can be stubbed for local dev)"). Accepted scope tradeoff: Phase 2 routes are callable by anyone who can reach the local port; production deployment must not happen until Phase 5 lands AUTH-01 + Easy Auth (STACK.md §5.5 line 248).

---

### 5. Structured logging (cross-cuts all areas — SC #5)

**Library:** `pino@9.x`, one JSON-per-line to stdout. Source: STACK.md line 29. App Service auto-ingests stdout into App Insights via the OpenTelemetry distro (STACK.md §8 — Phase 6 instruments custom events on top of this).

**Locked fields (per SC #5 + research):**

| Field | Source | Notes |
|---|---|---|
| `request_id` | SC #5 | `crypto.randomUUID()` at route entry; echoed as `X-Request-Id` response header for client-side correlation. |
| `role` | SC #5 | Validated role from request body. |
| `host` | STACK.md §6 line 309 | `web` in Phase 2; `teams` detection wires up in Phase 5 from a `X-Teams-Host` header or user-agent probe. Default `web`. |
| `validator_flips` | SC #5 | Count of citations stripped by the Phase-1 validator before the allowlist post-check runs. 0 on clean happy path. |
| `refusal_fired` | SC #5 | Boolean; true if a `fallback` event was emitted for ANY reason. Pairs with `fallback_reason`. |
| `fallback_reason` | §1 decisions | `null` on happy path; otherwise one of `refusal` \| `can_answer_false` \| `all_citations_stripped` \| `allowlist_violation`. |
| `ingress_status_code` | SC #5 | MGTI-returned HTTP status (200 on happy path, else the error code before any retry-success). |
| `prompt_tokens`, `completion_tokens` | PITFALLS #12.4 | From MGTI response `usage` field. For quota dashboards (Phase 6). |
| `latency_ms` | PITFALLS #12.4 | Route entry → terminal event emission. |
| `throttle` | §3 decisions | When applicable: `{retry_count, retry_source: 'self'|'mgti'}`. |
| `allowlist_violation` | §2 decisions | Only on `fallback_reason === 'allowlist_violation'`: `{class: 'names'|'kbIds'|'urls', token_count: number}`. Offending token NOT logged. |

**Explicitly NOT logged (per SC #5 "no raw user-question text" and PITFALLS #10 line 527 "Log question hash + answer metadata, not raw text"):**
- User question text (any `messages[i].content`).
- Assistant answer text.
- Citation `quote` values.
- Specific violating entity tokens.

Question hashing (`TELE-02` via `sha256(question).slice(0,16)`) is Phase 6 concern (STACK.md §8 line 506). Phase 2 logs are the observability floor; Phase 6 adds the product-metric layer on top without overlap.

### Claude's Discretion

Areas where the research permits implementation judgment during planning/execution:

- **Exact `SseEvent` wire-format keys.** Choice of `text` vs `delta` for `answer_delta`, `citations` array shape details — confirmed at plan time against a concrete partial-JSON parser spike.
- **Partial-JSON parser library choice.** Hand-rolled (~60 lines) vs `partial-json` vs `openai-partial-stream` — decided during planning based on test-fixture coverage. Leaning hand-rolled to avoid a transitive dep for limited logic.
- **Semaphore implementation detail.** Hand-rolled `AsyncSemaphore` vs `p-limit` — the waiting semantics are stable across both; function-composition readability decides.
- **zod vs hand-rolled request validator.** Phase 1 already pulls in zod for env validation (ARCHITECTURE §10 line 562); reuse it for `/api/chat` and `/api/prompts` request schemas. Confirmed at plan time — no known blocker.
- **Stub middleware shape.** Exact Next.js 16 Route Handler middleware mechanism (`middleware.ts` matcher vs per-route `withAuth()` wrapper) — pick whichever better isolates the Phase-5 substitution point.
- **Exact chip wording.** 13 chip objects from handover §16 transcribed verbatim into `src/prompts/suggested.ts` at implementation time; `id` scheme `cns-01…cns-05`, `auth-01…auth-08`. Reviewed with user if any wording is ambiguous in the handover.
- **Inter-chunk 20 s / total 45 s timeout values.** Calibrated against Phase-0 prod-mode smoke once run; if MGTI P95 inter-chunk exceeds 2 s on the real ingress, values are re-tuned before Phase 2 plan is finalised.
- **Error-message wording in HTTP 400 / 413 bodies.** Concrete strings chosen during implementation; `error` code names are locked above.
- **Specific backoff jitter arithmetic.** Full-jitter vs decorrelated-jitter — full-jitter picked unless planning surfaces a specific reason otherwise.
- **`X-Accel-Buffering: no` header.** Present as insurance against any nginx-family hop; may be dropped if MGTI documents that no such hop exists on the Next→MGTI path.

</decisions>

<specifics>
## Specific Ideas

- **A single `fallback` event covers four causes.** The client doesn't distinguish `refusal` / `can_answer_false` / `all_citations_stripped` / `allowlist_violation` for rendering — they all render as the handover §15 fallback with the Phase-4 distinct UI treatment (FBK-03). Reasons are for telemetry, not UX. Roadmap Phase 2 SC #2 explicitly says "single `fallback` event."
- **`answer_delta` before `fallback` is the interesting case.** If the model streams tokens (`can_answer:true` intent) and the validator THEN strips all citations, the client has already painted text into the bubble. The `fallback` event's `text` field carries the canonical §15 string; the client REPLACES the partial text. This is the "zero flicker" property from ARCHITECTURE §7 — the single source of truth is the terminal event, not the stream.
- **Entity allowlist runs AFTER the citation validator.** Two independent flip paths, converged onto one `fallback` event. `validator_flips` counts strips that happened regardless of the final outcome; `fallback_reason` says which path closed the stream. A response can have `validator_flips=2, fallback_reason='allowlist_violation'` if the validator stripped two bad citations but left one valid, then allowlist caught a bad name in the answer.
- **The violating entity token is never logged.** Same "treat model output as content, not metadata" discipline as the existing SC #5 "no raw user-question text" rule — consistency beats forensic-detail-in-logs. Drift investigation reproduces against the eval fixtures, which are static and reviewable.
- **Retries happen inside `streamAnswer`, not in the route.** ARCHITECTURE §12 Pattern 4 is explicit about this. If Phase 1's `streamAnswer` needs to be extended to accept a retry config, that's a Phase-1-surface edit in this phase — safe because no callers yet (smoke script is only current caller).
- **20-in-flight is a "just enough for pilot" number, not a quota-backed number.** If the Phase-0 prod-mode smoke surfaces MGTI's actual TPM/RPM ceiling for this app, revisit before pilot. PITFALLS #12.1: "TPM/RPM provisioned for this app on the MGTI ingress — get a number … request quota before pilot, not during."
- **`X-Request-Id` in the response header is a small win.** Turns any client-reported "it was slow" into a server-log lookup. One line of code; already part of SC #5 as the log field — echoing it is free.
- **No per-user rate limiting until identity is server-validated.** Until Phase 5's MSAL middleware lands, "per-user" has no reliable key. Global limit is correct for v1.
- **The chip-list endpoint exists because Phase 6 telemetry needs chip IDs.** It could have been a client-inlined constant (ARCHITECTURE §3 line 79 hints at this: "Could be inlined into the client bundle instead"). Choosing the endpoint shape with typed `{id, label, text}` objects keeps the click-through telemetry precise across wording edits — a small ongoing maintenance saving.

</specifics>

<deferred>
## Deferred Ideas

Ideas that surfaced during research consolidation but belong elsewhere:

- **`hash(role + question)` response cache** (ARCHITECTURE §14, "Broader MMC Tech (≤5K users)" tier). Defer to Phase 6 / v1.1; pilot traffic is too low to justify, and the cache interacts awkwardly with PITFALLS #10 body-logging/buffering concerns on streaming.
- **Per-user concurrency limits.** Needs server-validated identity (Phase 5 MSAL middleware). Revisit at v1.1 if pilot telemetry shows single-user saturation.
- **Injection-shape session rate limiting** (PITFALLS #7 prevention #5: terminate sessions with 3 injection-shape prompts). Schema contract + system-prompt injection-resistance (Phase 1 §3) already close the main hole; session termination adds complexity and a false-positive risk before pilot data exists. Revisit at Phase 6 pilot based on real injection attempts observed.
- **Tenant allowlist enforcement on the MSAL token.** Phase 5 AUTH-01; Phase 2 stub middleware doesn't check tenant.
- **Question-hash telemetry (`TELE-02`) and anonymised Q&A custom events** (STACK.md §8). Phase 6 concern — Phase 2 structured logs are the observability floor; Phase 6 layers product-metric custom events on top.
- **Synthetic canary** (PITFALLS #12.5 "hourly test request from outside production traffic"). Phase 6 operational tooling.
- **Nightly contract tests** diffing direct OpenAI vs MGTI response shapes (PITFALLS #11 prevention #5). Phase 5 CI/CD concern.
- **Forbidden-phrases post-check** (PITFALLS #2 prevention "flag 'typically', 'generally', 'you should probably' in answer"). Candidate for v1.1 once pilot data shows whether gpt-4o's hedging tells correlate with citation drift; adds false-positive risk today with unclear upside.

</deferred>

---

*Phase: 02-chat-backend-bff*
*Context gathered: 2026-04-22*
*Authoritative source hierarchy when docs conflict: Phase 1 CONTEXT.md > ARCHITECTURE.md > PITFALLS.md > STATE.md > STACK.md > SUMMARY.md. Phase 1 commitments are load-bearing (grounding layer contract is already shipped); STACK.md's `@ai-sdk/azure` + `toUIMessageStreamResponse()` proposal is NOT adopted — Phase 1 shipped raw `openai` SDK + `streamAnswer()` facade, and re-opening that decision in Phase 2 has no justification.*
