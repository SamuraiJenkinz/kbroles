# Phase 2: Chat Backend (BFF) - Research

**Researched:** 2026-04-22
**Domain:** Next.js 16 App Router SSE streaming, Pino logging, partial-JSON parsing, AsyncSemaphore, Vitest route testing
**Confidence:** HIGH (most findings from official docs + live project inspection)

---

## Summary

Phase 2 builds on a well-specified CONTEXT.md. Architectural decisions are locked. This research fills the seven concrete implementation gaps the planner will hit: (1) exact Next.js 16 Route Handler SSE idiom, (2) Pino setup in this project's Next.js 16.2.4/Turbopack environment, (3) a concrete partial-JSON parser algorithm, (4) an AsyncSemaphore pattern with disconnect awareness, (5) how to test Route Handlers with Vitest, (6) where the OpenAI refusal field lives in streaming chunks, and (7) Zod 4 request-body validation idiom.

The project is pinned to Next.js **16.2.4**, Zod **4.3.6**, openai SDK **6.34.0**, Vitest **3.2.4**. Pino is NOT in the lockfile yet — it must be installed. The Pino/Turbopack worker-thread issue (GitHub #84766) was fixed in Next.js 16.1, so 16.2.4 requires only `serverExternalPackages: ['pino', 'pino-pretty']` in next.config.ts — no `thread-stream` workaround needed.

**Primary recommendation:** Hand-roll the partial-JSON parser (~55 lines); stream via `TransformStream` writer pattern (return Response immediately, write in background IIFE) to avoid Next.js buffering; add `pino` + `pino-pretty` as deps and externalize them.

---

## Standard Stack

### Core (new installs required)

| Library | Version | Purpose | Source |
|---------|---------|---------|--------|
| `pino` | `^9.x` | JSON-to-stdout structured logging | STACK.md §6, CONTEXT.md §5 |
| `pino-pretty` | `^13.x` | Dev pretty-printer (transport) | companion to pino |

### Already in project

| Library | Resolved | Purpose |
|---------|---------|---------|
| `next` | 16.2.4 | App Router, Route Handlers, streaming |
| `zod` | 4.3.6 | Request body + query param validation |
| `openai` | 6.34.0 | SDK — streaming chunks, refusal field |
| `vitest` | 3.2.4 | Unit + route-level tests |
| `vite-tsconfig-paths` | (in lock) | Path aliases in Vitest (`@/*`) |

### Installation command

```bash
pnpm add pino pino-pretty
```

**next.config.ts addition** (required for Turbopack — fixes the worker-thread/real-require issue resolved in Next.js 16.1):

```ts
const nextConfig: NextConfig = {
  serverExternalPackages: ['pino', 'pino-pretty'],
  // ...existing turbopack/webpack config
}
```

Source: Next.js 16.1 blog post — "Improved Handling of serverExternalPackages" (transitive deps now handled automatically; only direct packages need listing).

---

## Architecture Patterns

### Pattern 1: Route Handler SSE — TransformStream writer

**Why TransformStream, not ReadableStream directly:** Next.js buffers the response if async work happens before `return`. Returning a `TransformStream.readable` immediately, then writing in a background IIFE, prevents buffering. This is the proven pattern for Next.js 15/16.

```typescript
// src/app/api/chat/route.ts
export const runtime = 'nodejs'       // explicit — default is already nodejs
export const dynamic = 'force-dynamic' // prevents static optimisation on Vercel / App Service

export async function POST(request: Request): Promise<Response> {
  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  const enc = new TextEncoder()

  const headers = {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'X-Request-Id': requestId,   // echoed for client correlation (SC #5)
  }

  // Return immediately; streaming runs in background
  ;(async () => {
    try {
      // ... stream SSE frames via writer.write(enc.encode(`data: ...\n\n`))
      await writer.close()
    } catch {
      await writer.abort()
    }
  })()

  return new Response(readable, { headers })
}
```

**Confidence:** HIGH — pattern confirmed by multiple official Next.js SSE discussions (GitHub #48427, Upstash blog, Oyetoke/Medium article) and the official Next.js streaming guide.

### Pattern 2: request.signal → client disconnect

The inbound `Request` object exposes `request.signal` (an `AbortSignal`). Bridge it to the upstream call so the MGTI fetch is cancelled when the client disconnects:

```typescript
// Inside the background IIFE:
request.signal.addEventListener('abort', () => {
  upstreamAbortController.abort()
  writer.abort(new Error('client disconnected')).catch(() => {})
})
```

The `ResponseAborted` unhandled rejection (Next.js discussion #61972) happens when code writes to a closed stream after client disconnect. The `try/catch` around `writer.write()` and using `request.signal` to stop the upstream call prevents it.

**Confidence:** HIGH — GitHub discussion #61972 confirms root cause + fix.

### Pattern 3: `export const runtime` and `export const dynamic`

From official Next.js 16.2.4 docs:

```typescript
export const runtime = 'nodejs'        // 'nodejs' | 'edge' — default is 'nodejs'
export const dynamic = 'force-dynamic' // required for SSE: prevents caching
```

`runtime = 'nodejs'` is the default; the explicit export is belt-and-suspenders documentation. `dynamic = 'force-dynamic'` IS required — without it, Vercel/App Service may attempt to statically optimise the route, breaking streaming. Note: in Next.js 16 with `cacheComponents` enabled, the `dynamic` option is removed from route segment config; since this project does NOT enable `cacheComponents`, `force-dynamic` is valid.

**Confidence:** HIGH — official route segment config docs (fetched at 2026-04-21, version 16.2.4).

### Pattern 4: encodeSse() helper

```typescript
// src/chat/sse.ts
export function encodeSse(event: SseEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)
}
```

Keep `TextEncoder` instance outside the function (module-level) to avoid per-call allocation. The `data:` prefix with `\n\n` terminator is the raw-SSE format locked in CONTEXT.md §1 — no `event:` line.

### Pattern 5: Pino logger + request-scoped child

```typescript
// src/obs/logger.ts
import pino from 'pino'

export const logger = pino(
  process.env.NODE_ENV === 'production'
    ? { level: 'info' }
    : {
        transport: { target: 'pino-pretty', options: { colorize: true } },
        level: 'debug',
      }
)

// Per-request child — call at route entry after parsing request_id
export function requestLogger(fields: Record<string, unknown>) {
  return logger.child(fields)
}
```

**Turbopack note (Next.js 16.0.0–16.0.x):** pino's worker-thread transport failed. Fixed in 16.1 via improved transitive `serverExternalPackages`. This project is at 16.2.4 — fixed, but `serverExternalPackages: ['pino', 'pino-pretty']` in next.config.ts is still required to prevent bundling them. Confirmed in GitHub issues #84766 and #86099.

**Dev vs prod:** The `pino-pretty` transport uses a worker thread. In production (no `pino-pretty`), pino writes raw JSON to stdout synchronously — no worker thread, no issue. In dev, the transport is used; `serverExternalPackages` handles it.

**Confidence:** HIGH — confirmed by Next.js 16.1 blog post + GitHub issues.

### Pattern 6: Zod 4 request body validation

Key Zod 4 differences from v3 that affect this phase:

- `invalid_type_error` / `required_error` params **removed** — use the unified `error` param instead
- Error shape: use `z.treeifyError()` instead of `.format()` / `.flatten()`
- `safeParse()` no longer accepts `path` param

```typescript
// src/chat/requestSchema.ts
import { z } from 'zod'

const MessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(MAX_MESSAGE_CHARS),
})

export const ChatRequestSchema = z.object({
  role: z.enum(['consumer', 'author']),
  messages: z.array(MessageSchema).min(1).max(MAX_MESSAGES),
})

export type ChatRequest = z.infer<typeof ChatRequestSchema>

// In route handler:
const body = await request.json().catch(() => null)
const result = ChatRequestSchema.safeParse(body)
if (!result.success) {
  return Response.json(
    { error: 'validation_failed', detail: z.treeifyError(result.error) },
    { status: 400 }
  )
}
```

**Note on error codes:** The CONTEXT.md §4.1 specifies granular error codes (`role_missing`, `role_invalid`, etc.) rather than the generic Zod error tree. Use `safeParse` + manual field inspection to produce the locked error codes. Example:

```typescript
if (!body || typeof body !== 'object') return jsonError('messages_missing', 400)
const parsed = ChatRequestSchema.safeParse(body)
if (!parsed.success) {
  const issues = parsed.error.issues
  const roleIssue = issues.find(i => i.path[0] === 'role')
  if (roleIssue?.code === 'invalid_type') return jsonError('role_missing', 400)
  if (roleIssue?.code === 'invalid_enum_value') return jsonError('role_invalid', 400)
  // ... etc
}
```

**Confidence:** HIGH — Zod 4 changelog confirmed via official zod.dev/v4/changelog.

### Pattern 7: /api/prompts query param validation

```typescript
// src/app/api/prompts/route.ts
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const role = searchParams.get('role')
  if (!role) return Response.json({ error: 'role_required', allowed: ['consumer','author'] }, { status: 400 })
  if (role !== 'consumer' && role !== 'author') return Response.json({ error: 'role_invalid', allowed: ['consumer','author'] }, { status: 400 })
  return Response.json(
    { role, prompts: SUGGESTED_PROMPTS[role] },
    { headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' } }
  )
}
```

### Recommended File Structure

```
src/
├── app/api/
│   ├── chat/route.ts          # POST — SSE stream
│   └── prompts/route.ts       # GET — chip list
├── chat/
│   ├── sse.ts                 # SseEvent types + encodeSse()
│   ├── partialAnswer.ts       # incremental answer extractor
│   ├── allowlist.ts           # CORP-02 entity post-check
│   ├── concurrency.ts         # AsyncSemaphore (cap 20)
│   └── requestSchema.ts       # Zod request body schema
├── prompts/
│   └── suggested.ts           # SUGGESTED_PROMPTS constant
└── obs/
    └── logger.ts              # pino instance + requestLogger()
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON-to-stdout structured logs | Custom log formatter | `pino` | Async, performant, App Insights compatible (stdout ingestion) |
| Request body type coercion | Manual casting | `zod` (already in project) | Already used for env; consistent error shape |
| Semaphore with Promise queue | Manual array of callbacks | Pattern below — it's 20 lines | `p-limit` adds a dep; the hand-rolled version is simpler for FIFO cap-20 use case |

**Key insight:** The partial-JSON parser is the exception — hand-roll it. Available libraries (`partial-json`, `@streamparser/json`, `stream-json`) add transitive dependencies for ~50 lines of deterministic logic whose failure modes are harder to test than a purpose-built extractor.

---

## Partial-JSON Parser Algorithm

The task is narrow: extract the growing value of the `"answer"` key from an accumulating JSON buffer. The model schema is `{ can_answer, answer, citations }` and `answer` appears before `citations` in the output order. The parser only needs to find the `"answer":` key and then read the string value character-by-character.

**Edge cases to handle:** escaped quotes (`\"`), escaped backslashes (`\\`), unicode escapes (`\uXXXX`), and streaming cuts mid-escape-sequence.

```typescript
// src/chat/partialAnswer.ts
// ~55 lines — hand-rolled, no deps

export interface AnswerState {
  emitted: string   // text already sent as answer_delta events
  done: boolean     // true when the closing " of the answer string is found
}

/**
 * Given the full accumulated buffer so far, return the answer string value
 * as much as can be determined (excluding the closing quote if not yet arrived).
 * Returns null if the "answer": key has not yet appeared in the buffer.
 */
export function extractPartialAnswer(buf: string): string | null {
  // Find "answer": in the buffer
  const keyMatch = buf.match(/"answer"\s*:\s*"/)
  if (!keyMatch || keyMatch.index === undefined) return null

  const start = keyMatch.index + keyMatch[0].length
  let result = ''
  let i = start

  while (i < buf.length) {
    const ch = buf[i]

    if (ch === '\\') {
      // Escape sequence — need at least one more char
      if (i + 1 >= buf.length) break  // truncated escape; stop here
      const esc = buf[i + 1]
      if (esc === 'u') {
        // Unicode escape \uXXXX — need 4 more hex digits
        if (i + 5 >= buf.length) break
        const hex = buf.slice(i + 2, i + 6)
        result += String.fromCharCode(parseInt(hex, 16))
        i += 6
      } else {
        const MAP: Record<string, string> = {
          '"': '"', '\\': '\\', '/': '/', b: '\b',
          f: '\f', n: '\n', r: '\r', t: '\t',
        }
        result += MAP[esc] ?? esc
        i += 2
      }
    } else if (ch === '"') {
      // Closing quote — answer string is complete
      return result   // caller can mark done=true
    } else {
      result += ch
      i++
    }
  }

  // Buffer ran out mid-string — return what we have so far (stream not complete)
  return result
}

/**
 * Stateful wrapper: call with each new accumulated buffer.
 * Returns the incremental delta since the last call (empty string = no new text).
 */
export function makeAnswerTracker() {
  let prevLen = 0
  let keyFound = false

  return function tick(buf: string): { delta: string; done: boolean } {
    const full = extractPartialAnswer(buf)
    if (full === null) return { delta: '', done: false }

    // Check if the buffer contains the closing quote (answer is complete)
    // by re-checking: if extractPartialAnswer consumed to a closing quote
    // we detect it by attempting to find the answer key + scanning to close
    const keyMatch = buf.match(/"answer"\s*:\s*"/)
    let done = false
    if (keyMatch && keyMatch.index !== undefined) {
      const afterKey = buf.slice(keyMatch.index + keyMatch[0].length)
      // Scan for unescaped closing quote
      done = hasUnescapedClose(afterKey)
    }

    keyFound = true
    const delta = full.slice(prevLen)
    prevLen = full.length
    return { delta, done }
  }
}

function hasUnescapedClose(s: string): boolean {
  let i = 0
  while (i < s.length) {
    if (s[i] === '\\') { i += 2; continue }
    if (s[i] === '"') return true
    i++
  }
  return false
}
```

**Confidence:** MEDIUM — algorithm derived from first principles; unicode surrogate pairs (U+10000+) require two `\uXXXX` sequences — the per-char `String.fromCharCode` approach handles the low/high surrogate pair naturally when both are present, but will emit mojibake if the stream cuts between them. This is an acceptable limitation for a JSON API that produces standard JSON (OpenAI never emits unmatched surrogates).

**Decision: hand-rolled over library.** `partial-json` (npm) would work but adds a dep and returns the full parsed object on each call — for this narrow use case (single string key, delta tracking), the hand-rolled approach is simpler to test and has no transitive dependencies.

---

## AsyncSemaphore Pattern

```typescript
// src/chat/concurrency.ts

export class AsyncSemaphore {
  private count: number
  private readonly waiters: Array<() => void> = []

  constructor(count: number) {
    if (count < 1) throw new RangeError('AsyncSemaphore count must be >= 1')
    this.count = count
  }

  /** Returns true if acquired immediately; false if cap was full (caller should 429). */
  tryAcquire(): boolean {
    if (this.count > 0) {
      this.count--
      return true
    }
    return false
  }

  release(): void {
    if (this.waiters.length > 0) {
      // FIFO: wake the oldest waiter
      const resolve = this.waiters.shift()!
      resolve()
      // count stays decremented — transferred to waiter
    } else {
      this.count++
    }
  }
}

// Module-level singleton — shared across all concurrent requests
const MAX_INFLIGHT = Number(process.env.MAX_INFLIGHT_STREAMS ?? '20')
export const chatSemaphore = new AsyncSemaphore(MAX_INFLIGHT)
```

**Usage in route:**

```typescript
if (!chatSemaphore.tryAcquire()) {
  return Response.json(
    { error: 'rate_limited', message: "We're busy — please retry in a moment." },
    { status: 429, headers: { 'Retry-After': '5' } }
  )
}
// ... proceed with request
// In the background IIFE's finally block:
// chatSemaphore.release()
```

**Why `tryAcquire` (non-blocking) over async `acquire`:** CONTEXT.md §3 says "return HTTP 429" when over cap — do not queue the waiter. A non-blocking check immediately returns 429 rather than making the client wait indefinitely in the queue. The FIFO waiter list is kept in the implementation for completeness (future per-user acquire patterns) but not used on the happy path in v1.

**Disconnect safety:** Always call `release()` in the IIFE's `finally` block, even if `writer.abort()` is called. The semaphore tracks permit count, not stream liveness.

**Confidence:** HIGH — pattern from DEV Community semaphore guide, adapted for non-blocking tryAcquire.

---

## OpenAI SDK v6 Refusal Detection

The project uses `openai@6.34.0`. The Phase-1 `streamAnswer()` currently calls with `stream: false`. Phase 2 needs to detect `refusal` from the FINAL completed response (structured output mode) because the route calls `streamAnswer()` as a facade that returns `KbResponse`.

**For structured output (`response_format: json_schema`):** The refusal appears on `completion.choices[0].message.refusal` (a `string | null`). If non-null, the model refused; the content field will be null.

```typescript
// How to detect after streamAnswer() returns a KbResponse:
// streamAnswer() already returns KbResponse OR throws.
// A structured-output refusal causes .message.content to be null
// and .message.refusal to be a string.
// Phase-1 streamAnswer() does: JSON.parse(content ?? '{}')
// A null content becomes JSON.parse('{}') which fails KbResponse shape —
// the Ajv fallback path would fire.
```

**ACTION REQUIRED:** The current `streamAnswer()` does not explicitly check for `refusal`. Phase 2 needs to either:
- (a) Extend `streamAnswer()` to detect `choices[0].message.refusal` and throw a typed error the route can catch and map to `fallback { reason: 'refusal' }`, OR
- (b) Detect that `streamAnswer()` returned `{ can_answer: false }` and treat it as a `can_answer_false` fallback (which is already handled).

The model's structured-output refusal maps to the model returning `can_answer: false` in the grounded schema (the system prompt teaches this). True API-level `refusal` (model safety filter refusing to respond at all) is uncommon with gpt-4o on this domain. The pragmatic approach: catch the `JSON.parse('{}')` error path in `streamAnswer()`, which already throws, and the route maps the thrown error to `fallback { reason: 'refusal' }` / `error { code: 'schema_reject_after_retry' }` — no `streamAnswer()` changes needed for the refusal detection use case.

**For future true-streaming (not in scope for Phase 2):** Streaming chunks expose `chunk.choices[0]?.delta?.refusal` (string | null). Accumulate it like `content`; non-null means the model is emitting a refusal.

**Confidence:** HIGH (on the field path) via OpenAI API reference for streaming events; MEDIUM on the "no streamAnswer() change needed" assessment — verify during implementation.

---

## Vitest Route-Level Testing Pattern

The existing Vitest config (`vitest.config.mts`) uses:
- `environment: 'node'`
- `vite-tsconfig-paths` for `@/*` aliases
- Custom raw-markdown plugin

**Pattern for testing Route Handlers:** Call the exported `POST`/`GET` function directly with a `Request` object. No HTTP server needed. This works because Next.js Route Handlers are standard Web API functions.

```typescript
// src/app/api/chat/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '../route'

// Mock streamAnswer at module level
vi.mock('@/llm/stream', () => ({
  streamAnswer: vi.fn(),
}))

import { streamAnswer } from '@/llm/stream'
const mockStreamAnswer = vi.mocked(streamAnswer)

function makeRequest(body: unknown, headers?: Record<string, string>) {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

async function collectSseFrames(response: Response): Promise<Array<Record<string, unknown>>> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  const frames: Array<Record<string, unknown>> = []

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    // Split on \n\n (SSE frame boundary)
    const parts = buf.split('\n\n')
    buf = parts.pop() ?? ''  // last part may be incomplete
    for (const part of parts) {
      const line = part.trim()
      if (line.startsWith('data: ')) {
        frames.push(JSON.parse(line.slice(6)))
      }
    }
  }
  return frames
}

describe('POST /api/chat — happy path', () => {
  it('streams answer_delta frames and terminates with done', async () => {
    mockStreamAnswer.mockResolvedValue({
      can_answer: true,
      answer: 'Hello world',
      citations: [{ source_id: 'KB0020882', section_id: 'overview', quote: 'Hello' }],
    })

    const req = makeRequest({ role: 'consumer', messages: [{ role: 'user', content: 'Hi' }] })
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')

    const frames = await collectSseFrames(res)
    const types = frames.map(f => f.type)
    expect(types).toContain('answer_delta')
    expect(types).toContain('citations')
    expect(types).toContain('done')
    expect(types).not.toContain('fallback')
  })
})

describe('POST /api/chat — fallback path (can_answer false)', () => {
  it('emits single fallback event, no citations', async () => {
    mockStreamAnswer.mockResolvedValue({
      can_answer: false,
      answer: 'I cannot help with that.',
      citations: [],
    })

    const req = makeRequest({ role: 'consumer', messages: [{ role: 'user', content: 'Out of scope' }] })
    const res = await POST(req)
    const frames = await collectSseFrames(res)

    const fallback = frames.find(f => f.type === 'fallback')
    expect(fallback).toBeDefined()
    expect(frames.find(f => f.type === 'citations')).toBeUndefined()
    expect(frames.find(f => f.type === 'done')).toBeUndefined()
  })
})
```

**Mocking `streamAnswer`:** Phase-1 `streamAnswer()` currently returns a `Promise<KbResponse>` (non-streaming). This is the correct seam to mock — the route calls it, gets back a `KbResponse`, then drives the SSE logic. The mock controls the scenario by resolving to a known `KbResponse`.

**Note on streaming timing:** The `TransformStream` writer pattern runs the background IIFE asynchronously. In tests, `await collectSseFrames(res)` correctly awaits the stream close because the reader loop exits when `done === true` after `writer.close()`.

**Confidence:** HIGH — pattern verified against official Next.js Vitest docs and the existing project's vitest config.

---

## SSE Client Contract — docs/api-chat-contract.md Reference Snippet

The `docs/api-chat-contract.md` deliverable should include a minimal TypeScript consumption example for Phase-3 UI authors:

```typescript
// Consuming /api/chat — reference snippet for Phase-3 authors
// Works with the fetch API; EventSource is NOT used (requires POST + auth).

const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ role, messages }),
})

if (!response.ok) {
  // Pre-stream error: 400 | 413 | 429 | 5xx — read JSON body
  const err = await response.json()
  // Handle err.error (string code)
  return
}

const reader = response.body!.getReader()
const decoder = new TextDecoder()
let buf = ''

while (true) {
  const { value, done } = await reader.read()
  if (done) break
  buf += decoder.decode(value, { stream: true })

  // SSE frames are separated by \n\n
  let boundary: number
  while ((boundary = buf.indexOf('\n\n')) !== -1) {
    const frame = buf.slice(0, boundary)
    buf = buf.slice(boundary + 2)

    if (!frame.startsWith('data: ')) continue
    const event = JSON.parse(frame.slice(6)) as SseEvent

    switch (event.type) {
      case 'answer_delta':
        // Append event.text to answer bubble
        break
      case 'citations':
        // Attach event.citations[] to bubble (held until stream end)
        break
      case 'fallback':
        // REPLACE answer bubble content with event.text (§15 verbatim string)
        // event.reason is for telemetry, not display
        break
      case 'done':
        // event.can_answer, event.validator_flips — telemetry
        break
      case 'error':
        // Infrastructure failure — show retry affordance
        // event.code: 'upstream_timeout' | 'upstream_5xx' | 'schema_reject_after_retry' | 'internal'
        break
    }
  }
}
```

**Key contract rules** to document:
1. HTTP errors (4xx/5xx) arrive BEFORE the stream opens — check `response.ok` first
2. `fallback` REPLACES accumulated `answer_delta` text — do not append
3. `citations` arrives before `done` on the happy path; never arrives on fallback/error path
4. `done` and `fallback` and `error` are all terminal — close the reader after receiving one

---

## Common Pitfalls

### Pitfall 1: Async work before `return` buffers the response

**What goes wrong:** Route handler awaits a long async operation before returning `Response`. Next.js collects all output and sends it at once — no streaming.

**Prevention:** Use `TransformStream` and return `new Response(readable, {...})` immediately. Do async work in a background IIFE.

**Warning sign:** In dev, `curl` receives all SSE frames simultaneously after a delay rather than progressively.

### Pitfall 2: `export const dynamic` removed in `cacheComponents` mode

**What goes wrong:** Next.js 16 removes `dynamic`, `revalidate`, `fetchCache` from route segment config when `nextConfig.experimental.cacheComponents` is enabled. This project does NOT enable it.

**Prevention:** Verify `cacheComponents` is absent from next.config.ts before assuming `force-dynamic` is valid. Confirmed absent in this project.

**Warning sign:** TypeScript error "dynamic is not a valid export for route segments" during build.

### Pitfall 3: Pino worker thread crash in Turbopack 16.0.0–16.0.2

**What goes wrong:** `Cannot find module 'real-require'` at runtime when using `pino-pretty` transport.

**Prevention:** `serverExternalPackages: ['pino', 'pino-pretty']` in next.config.ts. Transitive deps (`thread-stream`) are auto-resolved in 16.1+. This project is at 16.2.4 — only direct packages need listing.

**Warning sign:** Error in `next dev` console on first request that uses pino with a transport.

### Pitfall 4: `unhandledRejection: ResponseAborted` on client disconnect

**What goes wrong:** Background IIFE continues writing to a closed `TransformStream` writer after the client disconnects.

**Prevention:** Listen to `request.signal.addEventListener('abort', ...)`, abort the upstream controller, and wrap `writer.write()` calls in try/catch.

### Pitfall 5: SSE frame split across chunks in the client parser

**What goes wrong:** A single `\n\n`-terminated SSE frame may arrive in multiple `read()` chunks. Naive per-chunk `JSON.parse` on the first chunk fails.

**Prevention:** Accumulate `buf += decoder.decode(value, { stream: true })`, then split on `\n\n` as shown in the client snippet above. The `{ stream: true }` flag handles multi-byte characters split across chunks.

### Pitfall 6: Zod 4 `.flatten()` removed — use `.treeifyError()`

**What goes wrong:** Code from Zod 3 examples calls `result.error.flatten()` — this is deprecated in Zod 4.3.6.

**Prevention:** Use `z.treeifyError(result.error)` for structured error output, or `result.error.issues` for manual inspection.

### Pitfall 7: `X-Accel-Buffering: no` may be unnecessary on MGTI path

**What goes wrong:** Header is present as insurance against nginx buffering. If the MGTI ingress documents no nginx hop, it can be omitted.

**Prevention:** Keep the header — it's a no-op if no nginx hop exists, and prevents subtle buffering issues if the network path changes.

---

## Code Examples

### Full SSE encode + type definitions

```typescript
// src/chat/sse.ts
import type { Citation } from '@/grounding/schema'

export type FallbackReason =
  | 'refusal'
  | 'can_answer_false'
  | 'all_citations_stripped'
  | 'allowlist_violation'

export type ErrorCode =
  | 'upstream_timeout'
  | 'upstream_5xx'
  | 'schema_reject_after_retry'
  | 'internal'

export type SseEvent =
  | { type: 'answer_delta'; text: string }
  | { type: 'citations'; citations: Citation[] }
  | { type: 'fallback'; reason: FallbackReason; text: string }
  | { type: 'done'; can_answer: boolean; validator_flips: number }
  | { type: 'error'; code: ErrorCode; message: string }

const ENC = new TextEncoder()

export function encodeSse(event: SseEvent): Uint8Array {
  return ENC.encode(`data: ${JSON.stringify(event)}\n\n`)
}
```

### Allowlist post-check

```typescript
// src/chat/allowlist.ts
import { ENTITY_ALLOWLIST } from '@/grounding/entities'

// Regexes match CONTEXT.md §2 — use the same as entities.ts (already locked)
const NAME_RE  = /\b([A-Z][a-z]+(?:-[A-Z][a-z]+)?\s+[A-Z][a-z]+(?:-[A-Z][a-z]+)?)\b/g
const KB_ID_RE = /\bKB\d{5,}\b/g
const URL_RE   = /https?:\/\/[^\s<>"'\]]+/g

export interface AllowlistResult {
  passed: boolean
  violationClass?: 'names' | 'kbIds' | 'urls'
  tokenCount?: number
}

export function checkEntityAllowlist(answerText: string): AllowlistResult {
  const names  = [...answerText.matchAll(NAME_RE)].map(m => m[1])
  const kbIds  = [...answerText.matchAll(KB_ID_RE)].map(m => m[0])
  const urls   = [...answerText.matchAll(URL_RE)].map(m => m[0])

  const badNames = names.filter(n => !ENTITY_ALLOWLIST.names.has(n))
  if (badNames.length > 0) return { passed: false, violationClass: 'names', tokenCount: badNames.length }

  const badKbIds = kbIds.filter(k => !ENTITY_ALLOWLIST.kbIds.has(k))
  if (badKbIds.length > 0) return { passed: false, violationClass: 'kbIds', tokenCount: badKbIds.length }

  const badUrls = urls.filter(u => !ENTITY_ALLOWLIST.urls.has(u))
  if (badUrls.length > 0) return { passed: false, violationClass: 'urls', tokenCount: badUrls.length }

  return { passed: true }
}
```

---

## State of the Art

| Old Approach | Current Approach | Notes |
|---|---|---|
| `ReadableStream` start(controller) | `TransformStream` writer pattern | Avoids buffering in Next.js 15/16 |
| `pino-pretty` transport in prod | Raw pino JSON in prod, pino-pretty in dev | App Insights ingests stdout |
| `serverComponentsExternalPackages` (Next.js 14) | `serverExternalPackages` (Next.js 15+) | Key renamed |
| `z.flatten()` / `z.format()` on errors | `z.treeifyError()` | Zod 4 deprecation |
| `export const experimental_ppr = true` | Removed in Next.js 16 | Codemod available |

---

## Open Questions

1. **`streamAnswer()` refusal surface** — The current Phase-1 impl does `JSON.parse(content ?? '{}')` where `content` is null on a refusal; `JSON.parse('{}')` succeeds but produces `{}` which fails `KbResponse` shape. The Ajv validator then throws. The route catches the throw and emits `error { code: 'schema_reject_after_retry' }`. This may be acceptable — or the planner may decide to explicitly check `choices[0].message.refusal` before parsing and emit `fallback { reason: 'refusal' }` instead. Confirm which error code is appropriate for a structured-output API-level refusal vs a model-content `can_answer: false`.

2. **`streamAnswer()` streaming extension** — CONTEXT.md §1 says "Retry logic lives in Phase-1 streamAnswer adapter." Phase-1 currently has ONE retry (json_object fallback path). Phase 2 needs retries for 429/502/503/504. This requires changes to `streamAnswer()` or a wrapper in Phase 2. The planner should include a task for extending `streamAnswer()` retry logic (or wrapping it) before the route is implemented.

3. **Timeout implementation with `streamAnswer`** — The current `streamAnswer()` makes a non-streaming OpenAI call. The 45s total / 20s inter-chunk timeouts are meaningful only if Phase 2 converts to a genuinely streaming OpenAI call (`stream: true`). With the current non-streaming facade, the 45s total timeout can be implemented as a `Promise.race()` at the route level, but the 20s inter-chunk idle timeout has no meaning. Clarify whether Phase 2 converts `streamAnswer()` to true streaming or stays non-streaming with a total-timeout wrapper.

---

## Sources

### Primary (HIGH confidence)

- Official Next.js 16.2.4 docs — `runtime` segment config (`nextjs.org/docs/app/api-reference/file-conventions/route-segment-config/runtime`, fetched 2026-04-21)
- Official Next.js 16.1 blog post — Pino/serverExternalPackages transitive dep fix (`nextjs.org/blog/next-16-1`, published December 2025)
- Zod v4 changelog — `zod.dev/v4/changelog` (official, fetched 2026-04-22)
- `/c/kbroles/package.json` + `pnpm-lock.yaml` — confirmed versions: next@16.2.4, zod@4.3.6, openai@6.34.0, vitest@3.2.4
- `/c/kbroles/src/llm/stream.ts` — Phase-1 `streamAnswer()` implementation (load-bearing contract)
- `/c/kbroles/src/grounding/entities.ts` — `ENTITY_ALLOWLIST` + regex constants (load-bearing)
- `/c/kbroles/src/grounding/validator.ts` — `validateCitations()` + `ValidationResult._flips` (load-bearing)
- `/c/kbroles/vitest.config.mts` — existing test config (node env, vite-tsconfig-paths, raw-md plugin)

### Secondary (MEDIUM confidence)

- Next.js GitHub discussion #61972 — `ResponseAborted` root cause + fix via `request.signal.onabort`
- Upstash blog — SSE streaming pattern in Next.js App Router (`upstash.com/blog/sse-streaming-llm-responses`)
- Medium/@oyetoketoby80 — TransformStream pattern for non-buffering SSE; `X-Accel-Buffering` header
- DEV Community — TypeScript semaphore FIFO waiter queue (`dev.to/thegravityguy/understanding-semaphores-a-typescript-guide-2blb`)
- BetterStack — Pino v9 child logger pattern

### Tertiary (LOW confidence)

- WebSearch results on `openai@6.34.0` streaming delta refusal field — API reference confirms field path `chunk.choices[0]?.delta?.refusal` but SDK v6 type definitions not directly verified via Context7

---

## Metadata

**Confidence breakdown:**

| Area | Level | Reason |
|---|---|---|
| Route Handler SSE pattern | HIGH | Official docs + confirmed GitHub discussions + live project inspection |
| Pino setup | HIGH | Official Next.js 16.1 blog post explicitly addresses the Turbopack fix |
| Partial-JSON algorithm | MEDIUM | First-principles + confirmed approach; no official reference implementation |
| AsyncSemaphore | HIGH | Standard Promise-queue pattern; verified against DEV Community article |
| Vitest route testing | HIGH | Confirmed against project's existing vitest config + official Next.js Vitest docs |
| OpenAI refusal field | HIGH (field path) / MEDIUM (SDK v6 types) | API reference confirmed; SDK v6-specific type not verified via Context7 |
| Zod 4 API | HIGH | Official zod.dev/v4/changelog fetched |
| Open question on streaming | LOW | Requires planner + implementation decision |

**Research date:** 2026-04-22
**Valid until:** 2026-05-22 (30 days; stable APIs — Next.js 16 and Zod 4 are both in stable release)
