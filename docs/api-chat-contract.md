# `/api/chat` Client Contract

**Audience:** Phase-3 frontend engineers building the chat UI. This document is sufficient on its own — you do not need to read `.planning/` context files to consume the API.

**Stability:** This is the locked v1 wire contract for Phase 2. v1.1 will refactor the non-streaming facade to true token-streaming; the event shapes and ordering below remain backward-compatible. Breaking changes will be announced with a version bump.

---

## 1. Endpoint

```
POST /api/chat
Content-Type: application/json
```

**Request body:**

```ts
interface ChatRequest {
  role: 'consumer' | 'author'
  messages: Array<{
    role: 'user' | 'assistant'
    content: string
  }>
}
```

The `role` field is server-authoritative: the server uses it to select the system prompt. The client must send it; there is no default. The `messages` array is the full conversation history the server should consider (stateless — the server holds no session memory).

---

## 2. Response format

On successful request validation the server returns HTTP `200` with:

- `Content-Type: text/event-stream; charset=utf-8`
- `Cache-Control: no-cache, no-transform`
- `Connection: keep-alive`
- `X-Accel-Buffering: no` (defence against buffering proxies)
- `X-Request-Id: <uuid>` (echo this value in any bug report — server logs correlate on it)

The body is a sequence of Server-Sent Events framed as:

```
data: {"type":"<event-type>", ...payload}\n\n
```

Every frame is a complete JSON object on a single `data:` line, followed by a blank line. The client MUST parse each frame's JSON and branch on `.type`. Do NOT rely on named SSE `event:` lines — we deliberately emit only `data:` frames for reverse-proxy compatibility.

---

## 3. Event schema

Five event types. All wire shapes are authoritative — no optional undocumented fields are emitted.

| `type`         | Wire shape | Semantics |
|----------------|------------|-----------|
| `answer_delta` | `{ type: 'answer_delta', text: string }` | **Append** `text` to an in-progress answer bubble. In Phase 2 (non-streaming facade), exactly one `answer_delta` carries the full answer. In v1.1 (true streaming), many smaller deltas will arrive; client code MUST handle both by simply appending without making assumptions about token size. |
| `citations`    | `{ type: 'citations', citations: Citation[] }` | Attach the citations to the completed answer bubble. Arrives AFTER all `answer_delta` frames on the happy path. See §9 for the `Citation` shape. |
| `fallback`     | `{ type: 'fallback', reason: FallbackReason, text: string }` | Terminal. **Replace** any accumulated `answer_delta` text with `event.text` — do NOT append. `text` is the canonical handover §15 fallback string. |
| `done`         | `{ type: 'done', can_answer: boolean, validator_flips: number }` | Terminal success marker. Stop reading. `validator_flips` is the count of citations the server-side validator stripped (for telemetry / diagnostics; the surviving citation is already in the preceding `citations` frame). |
| `error`        | `{ type: 'error', code: ErrorCode, message: string }` | Terminal. Infrastructure failure (not a grounding fallback). Render a retry affordance. |

---

## 4. Event ordering

Three terminal outcomes. **Every request ends with exactly one of:** `done`, `fallback`, or `error`. The client should close the reader once any terminal event is observed.

### 4.1 Happy path (grounded answer)

```
answer_delta × N  →  citations (once)  →  done
```

State machine:

```
START ──answer_delta──▶ STREAMING ──answer_delta──▶ STREAMING
                            │
                            └──citations──▶ AWAITING_DONE ──done──▶ END
```

### 4.2 Fallback path (grounding failure or refusal)

```
(answer_delta × 0..N)  →  fallback  (terminal)
```

- On `fallback`, the client REPLACES any painted `answer_delta` text with `fallback.text`.
- No `citations` frame arrives.
- No `done` frame arrives. `fallback` is terminal.
- **Note for Phase 2:** `answer_delta` count is always exactly 0 before `fallback` (the server suppresses `answer_delta` on every fallback path). The "0..N" range in the grammar is reserved for v1.1 true-streaming, where the model might stream tokens before the validator's post-check fires. Your client should still be robust to this from v1 so the v1.1 upgrade is zero-code-change.

### 4.3 Error path (infrastructure failure)

```
(answer_delta × 0..N)  →  error  (terminal)
```

- No `fallback` — infrastructure errors are distinct from grounding fallbacks (the UI shows "retry", not the §15 fallback copy).
- No `done`. `error` is terminal.

---

## 5. `FallbackReason` enum

Four values. **For rendering purposes, treat all four identically** — they produce the same UI (the Phase-4 FBK-03 distinct fallback treatment). The reason is for telemetry and debugging only.

```ts
type FallbackReason =
  | 'refusal'                 // model safety filter refused
  | 'can_answer_false'        // model returned can_answer=false in-schema
  | 'all_citations_stripped'  // validator rejected every citation
  | 'allowlist_violation'     // answer contained a non-allowlisted entity (name/KB/URL)
```

Render with: the §15 fallback copy delivered in `fallback.text`.

---

## 6. `ErrorCode` enum

Four values. The wire `message` is intended for log correlation — do NOT display it directly to users. Render a localised retry affordance.

```ts
type ErrorCode =
  | 'upstream_timeout'          // MGTI total-timeout budget exceeded
  | 'upstream_5xx'              // MGTI returned 5xx after retry exhaustion
  | 'schema_reject_after_retry' // MGTI returned unparseable JSON twice
  | 'internal'                  // catch-all (including UpstreamAuthError)
```

| Code | Retry guidance |
|------|----------------|
| `upstream_timeout` | Safe to retry immediately. |
| `upstream_5xx` | Safe to retry after a short delay (the server already retried 3× with backoff; a user-triggered retry a few seconds later is the next escalation). |
| `schema_reject_after_retry` | Rare. Retry may or may not help; surface a "refresh and try again" affordance. |
| `internal` | Do not auto-retry. Surface an error banner; operators triage via `X-Request-Id`. |

---

## 7. Pre-stream HTTP errors

The server can reject a request BEFORE opening the SSE stream. In that case the response is a standard JSON `{ error: string }` body. **The client must check `response.ok` (or the status code) before attempting to read the stream.**

| Status | `error` codes | UX guidance |
|--------|---------------|-------------|
| `400`  | `role_required`, `role_missing`, `role_invalid`, `messages_missing`, `messages_empty`, `message_role_invalid`, `message_content_invalid` | Client-side bug — the client should never emit these. Surface as an unexpected-error banner for operators. |
| `401`  | `unauthorized` | In Phase 2 this is stubbed (no auth). Phase 5 will trigger this on invalid / missing bearer token — prompt re-authentication. |
| `413`  | `history_cap_exceeded`, `message_too_long` | Client should truncate history / warn user to shorten the prompt. |
| `429`  | `rate_limited` | Read the `Retry-After` header (always `5` in v1). Surface "We're busy — please retry in a moment." Automatic retry is permitted after the Retry-After interval. |
| `500`  | `internal` | Operators triage via `X-Request-Id`; user sees a generic error. |

HTTP `400` error responses have `Content-Type: application/json` — they are NOT SSE. Reading `response.body` as an SSE stream on a 4xx will produce garbage; always branch on `response.ok` first.

---

## 8. Reference TypeScript consumer snippet

Copy-pasteable starting point. Handles both happy and fallback/error paths, respects `Retry-After` on 429, and correlates errors via `X-Request-Id`.

```ts
type Citation = { source_id: string; section_id: string; quote: string }
type SseEvent =
  | { type: 'answer_delta'; text: string }
  | { type: 'citations';    citations: Citation[] }
  | { type: 'fallback';     reason: 'refusal' | 'can_answer_false' | 'all_citations_stripped' | 'allowlist_violation'; text: string }
  | { type: 'done';         can_answer: boolean; validator_flips: number }
  | { type: 'error';        code: 'upstream_timeout' | 'upstream_5xx' | 'schema_reject_after_retry' | 'internal'; message: string }

async function streamChat(
  role: 'consumer' | 'author',
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  onEvent: (event: SseEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, messages }),
    signal,
  })

  const requestId = res.headers.get('X-Request-Id') ?? 'unknown'

  if (!res.ok) {
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('Retry-After') ?? '5')
      throw Object.assign(new Error('rate_limited'), { status: 429, retryAfter, requestId })
    }
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw Object.assign(new Error(body.error ?? `http_${res.status}`), {
      status: res.status, requestId,
    })
  }

  if (!res.body) throw new Error('missing_response_body')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  for (;;) {
    const { value, done } = await reader.read()
    if (value) buffer += decoder.decode(value, { stream: !done })
    if (done) break

    // Frames are separated by blank lines. Process complete frames; keep the
    // trailing partial for the next chunk.
    let sep: number
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      const match = frame.match(/^data: (.*)$/s)
      if (!match) continue
      const event = JSON.parse(match[1]) as SseEvent
      onEvent(event)
      if (event.type === 'done' || event.type === 'fallback' || event.type === 'error') {
        reader.cancel().catch(() => {})
        return
      }
    }
  }
}
```

Usage in a React component (sketch):

```ts
const [answer, setAnswer] = useState('')
const [citations, setCitations] = useState<Citation[]>([])

await streamChat(role, messages, (event) => {
  switch (event.type) {
    case 'answer_delta':
      setAnswer(prev => prev + event.text)   // APPEND
      break
    case 'citations':
      setCitations(event.citations)
      break
    case 'fallback':
      setAnswer(event.text)                  // REPLACE accumulated text
      setCitations([])
      break
    case 'done':
      // Final state is already rendered; nothing to do.
      break
    case 'error':
      showRetryAffordance(event.code)
      break
  }
})
```

---

## 9. `Citation` shape

```ts
interface Citation {
  source_id: 'KB0020882' | 'KB0022991' | 'SNOW_FORM'
  section_id: string  // stable kebab-case anchor (e.g. 'approvers', 'flagging-articles')
  quote: string       // verbatim substring of the source body (≤280 chars)
}
```

The server guarantees at most **one** citation per response (GRND-04). The server-side validator ensures every emitted citation's `quote` is a verbatim substring of the matching `source_id`/`section_id` body — the client does NOT need to re-verify.

---

## 10. Response headers

| Header | `/api/chat` value | Purpose |
|--------|-------------------|---------|
| `Content-Type` | `text/event-stream; charset=utf-8` | SSE framing. |
| `Cache-Control` | `no-cache, no-transform` | No shared-proxy caching. No content transformation (prevents gzip buffering). |
| `Connection` | `keep-alive` | Long-lived stream. |
| `X-Accel-Buffering` | `no` | Defence against nginx-family buffering hops. |
| `X-Request-Id` | `<uuid v4>` | **Echo in bug reports.** Server logs correlate on this value. Also emitted on pre-stream error responses. |

---

## 11. `GET /api/prompts`

Companion endpoint for rendering role-specific suggested-prompt chips on the chat landing surface.

```
GET /api/prompts?role=consumer
GET /api/prompts?role=author
→ 200 OK
Content-Type: application/json
Cache-Control: public, max-age=3600, stale-while-revalidate=86400
Vary: Accept-Encoding

{
  "role": "consumer" | "author",
  "prompts": [
    { "id": "cns-01", "label": "Find the article about X", "text": "Find the article that describes X in the KB" },
    ...
  ]
}
```

`ChipItem` shape:

```ts
interface ChipItem {
  id: string      // stable identifier (cns-01..cns-05 or auth-01..auth-08); Phase 6 telemetry pivots on this
  label: string   // UI chip text (what the user sees)
  text: string    // full prompt to send as messages[0].content when the chip is clicked
}
```

**Counts:** 5 chips for `consumer`, 8 chips for `author` (from handover §16).

**Errors:**
- No `role` query param → `400 { error: 'role_required', allowed: ['consumer', 'author'] }`
- Unknown `role` value → `400 { error: 'role_invalid',  allowed: ['consumer', 'author'] }`

The chip list is immutable per deploy; the `Cache-Control` lets any shared proxy hold it for 1 hour and propagate a redeploy inside 24 hours without refetching on every pageload.

---

## 12. Phase boundaries — what this contract covers vs what is added later

| Concern | Phase 2 (this doc) | Phase 3 | Phase 4 | Phase 5 | Phase 6 |
|---------|---------------------|---------|---------|---------|---------|
| Wire contract (events, ordering, HTTP codes) | ✅ Locked | — | — | — | — |
| Chat UI + citation chip rendering | — | ✅ | — | — | — |
| Distinct fallback UI treatment | — | Minimal | ✅ FBK-03 | — | — |
| SSO / Entra auth on 401 | Stubbed | — | — | ✅ | — |
| Teams host detection / X-Teams-Host | Not wired | — | — | ✅ | — |
| App Insights custom events + chip_vs_freeform | — | — | — | — | ✅ |
| True token-streaming (answer_delta × many) | Single-delta facade | — | — | — | v1.1 refactor |

For any question about the wire contract: this doc is canonical. For product decisions (fallback copy, chip wording, UX flow): see the `info/KB_Assistant_ClaudeCode_Handover.md` handover document.
