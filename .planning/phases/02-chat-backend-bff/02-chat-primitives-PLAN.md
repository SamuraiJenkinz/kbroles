---
plan: 2
name: chat-primitives
phase: 2
wave: 1
depends_on: []
files_modified:
  - src/chat/sse.ts
  - src/chat/partialAnswer.ts
  - src/chat/allowlist.ts
  - src/chat/concurrency.ts
  - src/chat/requestSchema.ts
  - src/prompts/suggested.ts
  - src/chat/__tests__/sse.test.ts
  - src/chat/__tests__/partialAnswer.test.ts
  - src/chat/__tests__/allowlist.test.ts
  - src/chat/__tests__/concurrency.test.ts
  - src/chat/__tests__/requestSchema.test.ts
  - src/prompts/__tests__/suggested.test.ts
autonomous: true

must_haves:
  truths:
    - "encodeSse(event) produces a `data: <json>\\n\\n`-framed Uint8Array for every SseEvent variant; TextEncoder is module-level (no per-call allocation)"
    - "SseEvent discriminated union covers all five event types with the CONTEXT.md §1 shape: answer_delta{text}, citations{citations[]}, fallback{reason,text}, done{can_answer,validator_flips}, error{code,message}"
    - "makeAnswerTracker()(buf) returns {delta, done} where delta is the incremental answer text since the last call; escaped quotes, backslashes, and \\uXXXX sequences are decoded correctly; a mid-sequence truncation (`\\u00`) returns without emitting a partial char"
    - "extractPartialAnswer returns null if `\"answer\":` key has not yet appeared in the buffer; returns the full decoded string once the closing quote is present; returns the partial decoded string if the closing quote has not arrived"
    - "checkEntityAllowlist(answerText) returns {passed: true} when every extracted name/KB-ID/URL is in ENTITY_ALLOWLIST; returns {passed: false, violationClass, tokenCount} when any class has a non-allowlisted match"
    - "Allowlist test fixtures cover all four CONTEXT.md §2 test cases: synthetic Jane Doe name, synthetic KB9999999, synthetic unallowed URL, synthetic all-7-approvers-plus-real-KB-plus-real-URL positive case"
    - "AsyncSemaphore.tryAcquire() is non-blocking; returns true when count > 0 and decrements; returns false at cap; release() increments OR wakes the oldest FIFO waiter; release from 0 waiters never makes count exceed its initial cap"
    - "Singleton chatSemaphore reads MAX_INFLIGHT_STREAMS from env() (zod-validated; default '20'); constructor rejects count < 1"
    - "ChatRequestSchema is a zod v4 schema validating role ('consumer'|'author'), messages: array of {role: 'user'|'assistant', content: string} with 1 ≤ length ≤ env().MAX_MESSAGES and content.length ≤ env().MAX_MESSAGE_CHARS (limits read directly from env() inside parseChatRequest — no wrapper re-exports)"
    - "parseChatRequest(body) returns a discriminated result: {ok: true, data} OR {ok: false, code: 'role_missing'|'role_invalid'|'messages_missing'|'messages_empty'|'message_role_invalid'|'message_content_invalid'|'history_cap_exceeded'|'message_too_long'} — code names are LOCKED by CONTEXT.md §4.1"
    - "SUGGESTED_PROMPTS is a Record<'consumer'|'author', ChipItem[]> with 5 consumer chips (cns-01..cns-05) and 8 author chips (auth-01..auth-08); every chip has {id, label, text}; label and text are transcribed verbatim from info/KB_Assistant_ClaudeCode_Handover.md §16"
    - "SUGGESTED_PROMPTS test asserts counts (5 + 8) + id format (/^cns-0\\d$/ and /^auth-0\\d$/) + label non-empty + text non-empty + id uniqueness across both roles"
  artifacts:
    - path: "src/chat/sse.ts"
      provides: "SseEvent discriminated union + encodeSse() + FallbackReason + ErrorCode types"
      exports: ["SseEvent", "FallbackReason", "ErrorCode", "encodeSse"]
    - path: "src/chat/partialAnswer.ts"
      provides: "extractPartialAnswer(buf) + makeAnswerTracker() (stateful delta emitter)"
      exports: ["extractPartialAnswer", "makeAnswerTracker"]
    - path: "src/chat/allowlist.ts"
      provides: "checkEntityAllowlist(text) + AllowlistResult type"
      exports: ["checkEntityAllowlist", "AllowlistResult"]
    - path: "src/chat/concurrency.ts"
      provides: "AsyncSemaphore class + chatSemaphore singleton"
      exports: ["AsyncSemaphore", "chatSemaphore"]
    - path: "src/chat/requestSchema.ts"
      provides: "ChatRequestSchema zod + parseChatRequest(body) — reads limits directly from env() inside the function body (no MAX_MESSAGES/MAX_MESSAGE_CHARS re-exports)"
      exports: ["ChatRequestSchema", "ChatRequest", "parseChatRequest"]
    - path: "src/prompts/suggested.ts"
      provides: "SUGGESTED_PROMPTS record + ChipItem type"
      exports: ["SUGGESTED_PROMPTS", "ChipItem"]
  key_links:
    - from: "src/chat/allowlist.ts"
      to: "src/grounding/entities.ts"
      via: "imports ENTITY_ALLOWLIST (Phase-1 load-bearing boot-time extraction)"
      pattern: "ENTITY_ALLOWLIST"
    - from: "src/chat/concurrency.ts"
      to: "src/config/env.ts"
      via: "reads env().MAX_INFLIGHT_STREAMS (requires env.ts schema extension)"
      pattern: "env\\(\\)\\.MAX_INFLIGHT_STREAMS"
    - from: "src/chat/requestSchema.ts"
      to: "src/config/env.ts"
      via: "reads env().MAX_MESSAGES, env().MAX_MESSAGE_CHARS for limits"
      pattern: "MAX_MESSAGES|MAX_MESSAGE_CHARS"
    - from: "src/prompts/suggested.ts"
      to: "src/grounding/rolePreludes.ts"
      via: "shares Role = 'consumer'|'author' type; SUGGESTED_PROMPTS keyed by same Role union"
      pattern: "Role"
---

<objective>
Build the four pure-library primitives + request schema + chip constants that the `/api/chat` and `/api/prompts` routes consume. All artifacts are framework-agnostic, testable in isolation, and have zero external deps beyond zod (already in project). This plan runs in Wave 1 parallel with Plan 01.

Purpose: isolate CONTEXT.md §1 (SSE protocol), §2 (allowlist post-check), §3 (concurrency limiter), §4.1 (request schema + error codes), §4.2 (chip endpoint data source) into pure units with exhaustive tests BEFORE the route wires them together in Plan 04. Each primitive has a single bug-surface testable without Next.js route machinery.

Output: 6 source modules + 6 test files (one suite per module) + env.ts schema extension.
</objective>

<execution_context>
@C:\Users\taylo\.claude/get-shit-done/workflows/execute-plan.md
@C:\Users\taylo\.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
No upstream Phase-2 plan deps. Phase-1 deps: `src/grounding/entities.ts` (ENTITY_ALLOWLIST), `src/grounding/schema.ts` (Citation type), `src/grounding/rolePreludes.ts` (Role type), `src/config/env.ts` (env loader).

Before starting, read:

@.planning/phases/02-chat-backend-bff/02-CONTEXT.md  (§1 SSE event schema + event ordering, §2 allowlist policy, §3 concurrency/rate-limit, §4.1 request shape + error codes, §4.2 chip endpoint shape)
@.planning/phases/02-chat-backend-bff/02-RESEARCH.md  (§Pattern 4 encodeSse, §Pattern 6 Zod 4 idioms, §Partial-JSON Parser Algorithm, §AsyncSemaphore Pattern)
@src/grounding/entities.ts  (ENTITY_ALLOWLIST + name/KB/URL regexes — reuse, do NOT redefine)
@src/grounding/schema.ts  (Citation type — imported by SseEvent)
@src/grounding/rolePreludes.ts  (Role type — imported by SUGGESTED_PROMPTS)
@src/config/env.ts  (env() zod schema — extend with MAX_INFLIGHT_STREAMS, MAX_MESSAGES, MAX_MESSAGE_CHARS)
@info/KB_Assistant_ClaudeCode_Handover.md  (§16 Suggested Questions by Role — 5 Consumer + 8 Author chips; VERBATIM source for labels and text)

**Env schema extension (Task 2.3):**
Extend `EnvSchema` in `src/config/env.ts` with three new optional fields, each with a default:
```ts
MAX_INFLIGHT_STREAMS: z.coerce.number().int().min(1).optional().default(20),
MAX_MESSAGES:        z.coerce.number().int().min(1).optional().default(20),
MAX_MESSAGE_CHARS:   z.coerce.number().int().min(1).optional().default(8000),
```
Use `z.coerce.number()` so env strings like `"20"` parse correctly. Existing fields must NOT be touched.
</context>

<tasks>

<task id="2.1" type="auto">
  <name>Task 2.1: SSE types + encoder + partial-JSON answer tracker</name>
  <files>src/chat/sse.ts, src/chat/partialAnswer.ts, src/chat/__tests__/sse.test.ts, src/chat/__tests__/partialAnswer.test.ts</files>
  <action>
    1. Create `src/chat/sse.ts`:
       - Export `FallbackReason = 'refusal' | 'can_answer_false' | 'all_citations_stripped' | 'allowlist_violation'` (LOCKED CONTEXT §1).
       - Export `ErrorCode = 'upstream_timeout' | 'upstream_5xx' | 'schema_reject_after_retry' | 'internal'`.
       - Export discriminated `SseEvent` union with five variants as in CONTEXT §1 Event schema block.
       - Import `Citation` from `@/grounding/schema`; `citations` event uses `Citation[]`.
       - Module-level `const ENC = new TextEncoder()`; export `encodeSse(event: SseEvent): Uint8Array` returning `ENC.encode(\`data: ${JSON.stringify(event)}\\n\\n\`)`.

    2. Create `src/chat/__tests__/sse.test.ts` — one test per variant (5 tests minimum):
       - `encodeSse({type:'answer_delta', text:'Hi'})` → decodes back to `data: {"type":"answer_delta","text":"Hi"}\n\n`.
       - `encodeSse({type:'citations', citations:[{source_id:'KB0020882', section_id:'overview', quote:'foo'}]})` → contains the citation JSON and `\n\n` terminator.
       - Same for `fallback`, `done`, `error` variants.
       - One assertion that module-level TextEncoder is reused: `encodeSse` calls should not create new TextEncoder instances per call (assert via `vi.spyOn(globalThis, 'TextEncoder')` being called 0 times during test — spy must be set BEFORE module import). Simpler alternative: export ENC for test-only inspection via a `/** @internal */` export.

    3. Create `src/chat/partialAnswer.ts` — hand-rolled per RESEARCH §Partial-JSON Parser Algorithm (~60 lines, no deps). Export `extractPartialAnswer(buf: string): string | null` and `makeAnswerTracker(): (buf: string) => {delta: string; done: boolean}`. Follow the RESEARCH.md algorithm exactly: regex-match `"answer"\s*:\s*"`; from the start index scan char-by-char handling `\"`, `\\`, `\/`, `\b\f\n\r\t`, `\uXXXX` escapes; closing unescaped `"` → done; buffer exhaustion mid-string → return partial. The stateful tracker keeps `prevLen` across calls and returns the incremental delta.

       Truncated-escape contract: if the scan encounters `\` as the last character OR `\u` with fewer than 4 following hex digits, STOP at that character (do NOT emit the partial escape — the next tick will receive the completed escape). This is the behaviour implicit in the RESEARCH.md `break` statements.

    4. Create `src/chat/__tests__/partialAnswer.test.ts` with these cases:
       - Empty buffer → null.
       - `{"can_answer": true, "answer"` (no colon yet) → null.
       - `{"can_answer": true, "answer": "Hello"` (open quote not closed) → "Hello" partial.
       - `{"can_answer": true, "answer": "Hello"}` (closed) → "Hello", done=true.
       - `{"can_answer": true, "answer": "Hello \"world\""}` → `Hello "world"`, done=true (escape handling).
       - `{"can_answer": true, "answer": "First line\\nSecond"}` → "First line\nSecond" (\\n decode).
       - `{"can_answer": true, "answer": "\\u00e9clat"}` → "éclat" (unicode decode).
       - Truncated escape: buffer ends with `...Hello \\` → stop at backslash, emitted = "Hello ". Next tick extends buffer with `n more"` → delta = "\nmore", done=true.
       - makeAnswerTracker across two ticks: first tick `{"answer": "He"` returns {delta:"He",done:false}; second tick extends to `{"answer": "Hello"}` returns {delta:"llo",done:true}.

    5. Commit: `feat(phase-2/plan-02): add SSE encoder + partial-JSON answer tracker`.
  </action>
  <verify>
    `pnpm typecheck` passes. `pnpm test` passes with ≥13 new tests (5 sse + 8 partialAnswer). Quick smoke: `node -e "require('./src/chat/sse.ts')..."` not needed; the Vitest run is the signal.
  </verify>
  <done>
    SseEvent + encodeSse exported with the locked shape; extractPartialAnswer handles all 7 escape cases from RESEARCH.md algorithm; makeAnswerTracker returns delta+done per tick.
  </done>
</task>

<task id="2.2" type="auto">
  <name>Task 2.2: Entity allowlist post-check + AsyncSemaphore concurrency limiter</name>
  <files>src/chat/allowlist.ts, src/chat/concurrency.ts, src/chat/__tests__/allowlist.test.ts, src/chat/__tests__/concurrency.test.ts, src/config/env.ts, src/config/__tests__/env.test.ts</files>
  <action>
    **IMPORT PATH NOTE (authoritative — overrides any stale reference):** `ENTITY_ALLOWLIST` is exported from `src/grounding/entities.ts` (verified via `grep -l "ENTITY_ALLOWLIST" src/grounding/*.ts` — the only exporter file). Import as `import { ENTITY_ALLOWLIST } from '@/grounding/entities'`. If CONTEXT.md §2 (line 86) mentions `src/grounding/registry.ts` as the exporter, that is STALE — `registry.ts` exists but does not export `ENTITY_ALLOWLIST`. Use `entities.ts`. Do NOT edit CONTEXT.md; this action block is the override.

    1. Create `src/chat/allowlist.ts`:
       - Import `ENTITY_ALLOWLIST` from `@/grounding/entities` (per the IMPORT PATH NOTE above). Do NOT redefine the regexes — import them from `src/grounding/entities.ts` via a named re-export (add `export const NAME_RE = ...` etc to entities.ts in this task if they are currently module-private — this is a minor surface widening that keeps a single source of truth for regex patterns).
       - Check ordering: CONTEXT §2 "fail on ANY class". Test `names` first, then `kbIds`, then `urls`. First failing class returns. (RESEARCH §Allowlist post-check code block gives the exact shape — use that as the implementation reference.)
       - Return type `AllowlistResult = { passed: true } | { passed: false; violationClass: 'names'|'kbIds'|'urls'; tokenCount: number }`.
       - The violating token is NOT included in the return value — CONTEXT §5 "offending token is NOT logged." `tokenCount` only.

    2. Create `src/chat/__tests__/allowlist.test.ts` — the four CONTEXT §2 test fixtures:
       - Negative: `"According to Jane Doe, the process is..."` (Jane Doe not in ENTITY_ALLOWLIST.names) → `{passed:false, violationClass:'names', tokenCount:1}`.
       - Negative: `"See KB9999999 for details."` (KB9999999 not in ENTITY_ALLOWLIST.kbIds) → `{passed:false, violationClass:'kbIds', tokenCount:1}`.
       - Negative: `"See https://evil.example.com for details."` → `{passed:false, violationClass:'urls', tokenCount:1}`.
       - Positive: `"The approvers are <list 7 real approver names from KB0020882>. Reference KB0020882 at https://mmcnow.service-now.com/kb_view.do?sysparm_article=KB0020882."` → `{passed:true}`. (Implementer must inspect `src/grounding/sources/KB0020882.md` or the REGISTRY at test-setup time to pull actual approver names — hardcoding 7 placeholder names here would make the test meaningless. Use a setup hook: `const approvers = [...ENTITY_ALLOWLIST.names].slice(0, 7)`.)
       - Ordering check: text with BOTH a bad name AND a bad KB ID → violationClass is `'names'` (names tested first).
       - Empty text → `{passed:true}` (no extractions, no violations).

    3. Create `src/chat/concurrency.ts`:
       - Class `AsyncSemaphore` per RESEARCH §AsyncSemaphore Pattern: `tryAcquire(): boolean` (non-blocking) + `release(): void` (increment-or-wake-FIFO). Constructor throws RangeError if count < 1.
       - Module-level `chatSemaphore` singleton: `new AsyncSemaphore(env().MAX_INFLIGHT_STREAMS)`. Use lazy initialization — wrap in a getter function `getChatSemaphore()` OR initialize on module load (env() caches after first call; Phase-1 pattern). RESEARCH suggests module-level; follow that.
       - Include `/** Exposed for tests only. */` test-helper export `__resetForTests()` that reconstructs the singleton with a new count — useful for testing cap behaviour without env mutation.

    4. Create `src/chat/__tests__/concurrency.test.ts`:
       - `new AsyncSemaphore(2).tryAcquire()` returns true 2x then false.
       - After `release()` from full, next `tryAcquire()` returns true again.
       - `new AsyncSemaphore(0)` throws RangeError.
       - `release()` more times than acquired never lifts count above initial cap (assert via repeated tryAcquire at the bump).
       - Release wakes no one when no waiters: count just increments — tested via observe-then-acquire.
       - (Skip FIFO wake test for this plan — `tryAcquire` is non-blocking so waiters array stays empty on the happy-path. The FIFO code is implementation-completeness and exercised only when a future async `acquire()` is added.)

    5. Extend `src/config/env.ts` EnvSchema with the three new zod fields listed in `<context>` above. Add a quick test to `src/config/__tests__/env.test.ts` (or create it if not present; Phase-1 may already have one) asserting the defaults resolve when the env vars are absent. Use `__resetEnvCacheForTests()` between tests.

    6. Commit: `feat(phase-2/plan-02): add entity allowlist + AsyncSemaphore concurrency limiter`.
  </action>
  <verify>
    `pnpm typecheck` passes. `pnpm test` passes with ≥9 new tests (6 allowlist + 5 concurrency + env default tests). `grep -q "MAX_INFLIGHT_STREAMS" src/config/env.ts` returns 0.
  </verify>
  <done>
    checkEntityAllowlist handles four CONTEXT §2 fixtures + ordering rule; AsyncSemaphore has correct acquire/release/cap semantics; chatSemaphore singleton reads env().MAX_INFLIGHT_STREAMS; env schema extended with all three new limits.
  </done>
</task>

<task id="2.3" type="auto">
  <name>Task 2.3: Request schema parser + suggested prompts constant</name>
  <files>src/chat/requestSchema.ts, src/prompts/suggested.ts, src/chat/__tests__/requestSchema.test.ts, src/prompts/__tests__/suggested.test.ts</files>
  <action>
    1. Create `src/chat/requestSchema.ts` per RESEARCH §Pattern 6 (Zod 4 idioms — no `.flatten()`, use `z.treeifyError` or `error.issues`):

       ```ts
       import { z } from 'zod'
       import { env } from '@/config/env'

       // NOTE: Do NOT re-export MAX_MESSAGES or MAX_MESSAGE_CHARS as module-level
       // constants or wrapper functions. Read them directly from env() inside
       // parseChatRequest below — this keeps env as the single source of truth
       // and avoids the function-vs-value ambiguity.

       const MessageSchema = z.object({
         role: z.enum(['user', 'assistant']),
         content: z.string(),
       })
       export const ChatRequestSchema = z.object({
         role: z.enum(['consumer', 'author']),
         messages: z.array(MessageSchema),
       })
       export type ChatRequest = z.infer<typeof ChatRequestSchema>

       export type ParseChatError =
         | 'role_missing' | 'role_invalid'
         | 'messages_missing' | 'messages_empty'
         | 'message_role_invalid' | 'message_content_invalid'
         | 'history_cap_exceeded' | 'message_too_long'

       export interface ParseChatRequestOk   { ok: true;  data: ChatRequest }
       export interface ParseChatRequestFail { ok: false; code: ParseChatError }
       export type ParseChatRequestResult = ParseChatRequestOk | ParseChatRequestFail

       export function parseChatRequest(body: unknown): ParseChatRequestResult {
         if (body === null || typeof body !== 'object') return { ok: false, code: 'messages_missing' }
         const b = body as Record<string, unknown>

         // Role checks first (finer-grained error codes than zod would produce)
         if (b.role === undefined || b.role === null) return { ok: false, code: 'role_missing' }
         if (b.role !== 'consumer' && b.role !== 'author') return { ok: false, code: 'role_invalid' }

         if (!Array.isArray(b.messages)) return { ok: false, code: 'messages_missing' }
         if (b.messages.length === 0) return { ok: false, code: 'messages_empty' }
         if (b.messages.length > env().MAX_MESSAGES) return { ok: false, code: 'history_cap_exceeded' }
         for (const m of b.messages as unknown[]) {
           if (typeof m !== 'object' || m === null) return { ok: false, code: 'message_role_invalid' }
           const mm = m as Record<string, unknown>
           if (mm.role !== 'user' && mm.role !== 'assistant') return { ok: false, code: 'message_role_invalid' }
           if (typeof mm.content !== 'string') return { ok: false, code: 'message_content_invalid' }
           if (mm.content.length > env().MAX_MESSAGE_CHARS) return { ok: false, code: 'message_too_long' }
         }
         // Passed all granular checks — safeParse is belt-and-suspenders.
         const parsed = ChatRequestSchema.safeParse(body)
         if (!parsed.success) return { ok: false, code: 'message_content_invalid' }
         return { ok: true, data: parsed.data }
       }
       ```

       Rationale: CONTEXT §4.1 locks 8 specific error codes. A pure zod `safeParse` produces a tree of issues that doesn't map 1:1 to those codes. The granular-first + zod-fallback pattern gives precise codes and keeps the type inference from zod.

    2. Create `src/chat/__tests__/requestSchema.test.ts` — one case per error code (8 negative + happy path):
       - Empty body `{}` → role_missing.
       - `{role: 'admin', messages: [...]}` → role_invalid.
       - `{role: 'consumer'}` → messages_missing.
       - `{role: 'consumer', messages: []}` → messages_empty.
       - `{role: 'consumer', messages: [{role:'bot', content:'hi'}]}` → message_role_invalid.
       - `{role: 'consumer', messages: [{role:'user', content: 42}]}` → message_content_invalid.
       - `{role: 'consumer', messages: Array(21).fill({role:'user', content:'x'})}` → history_cap_exceeded (default MAX_MESSAGES=20).
       - `{role: 'consumer', messages: [{role:'user', content:'x'.repeat(9000)}]}` → message_too_long (default 8000).
       - Happy: `{role: 'author', messages: [{role:'user', content:'Hi'}]}` → ok=true, data roundtrip.

    3. Create `src/prompts/suggested.ts` with the 13 chips VERBATIM from handover §16:

       ```ts
       import type { Role } from '@/grounding/rolePreludes'

       export interface ChipItem { id: string; label: string; text: string }

       export const SUGGESTED_PROMPTS: Record<Role, ChipItem[]> = {
         consumer: [
           { id: 'cns-01', label: 'How do I flag an article with wrong information?', text: 'How do I flag an article with wrong information?' },
           { id: 'cns-02', label: 'Who can edit KB articles?',                         text: 'Who can edit KB articles?' },
           { id: 'cns-03', label: 'How do I find articles in the Colleague Technology KB?', text: 'How do I find articles in the Colleague Technology KB?' },
           { id: 'cns-04', label: 'How do I link to a KB article correctly?',          text: 'How do I link to a KB article correctly?' },
           { id: 'cns-05', label: 'What categories are articles organised into?',      text: 'What categories are articles organised into?' },
         ],
         author: [
           { id: 'auth-01', label: 'What fields do I need to fill in on the form?',       text: 'What fields do I need to fill in on the form?' },
           { id: 'auth-02', label: "What's the naming convention and article structure?", text: "What's the naming convention and article structure?" },
           { id: 'auth-03', label: 'What goes in the Resolution field?',                  text: 'What goes in the Resolution field?' },
           { id: 'auth-04', label: 'How do I add images or attachments?',                 text: 'How do I add images or attachments?' },
           { id: 'auth-05', label: 'How do I create and submit a new article?',           text: 'How do I create and submit a new article?' },
           { id: 'auth-06', label: 'How do I retire or delete an article?',               text: 'How do I retire or delete an article?' },
           { id: 'auth-07', label: 'How do I request an article via the comms team?',     text: 'How do I request an article via the comms team?' },
           { id: 'auth-08', label: 'What are the SME requirements for a submission?',     text: 'What are the SME requirements for a submission?' },
         ],
       }
       ```

       Note: `label` and `text` are identical here (each chip-question is UI-sized). If any chip later warrants a shorter UI label + a longer prompt, the `{id, label, text}` shape already supports it — this is why we commit to objects rather than bare strings (CONTEXT §4.2 rationale).

    4. Create `src/prompts/__tests__/suggested.test.ts`:
       - Counts: `SUGGESTED_PROMPTS.consumer.length === 5`, `SUGGESTED_PROMPTS.author.length === 8`.
       - ID format: consumer IDs match `/^cns-0\d$/`, author IDs match `/^auth-0\d$/`.
       - ID uniqueness: `new Set([...consumer,...author].map(c=>c.id)).size === 13`.
       - label + text both non-empty strings for all 13.
       - Verbatim-from-handover guard: test that the word set `{'flag','edit','find','link','categories'}` appears at least once each across consumer labels (i.e., the five Consumer topics); similarly `{'fields','naming','Resolution','attachments','submit','retire','comms','SME'}` across author labels. This is a cheap drift-detector — if someone paraphrases a chip, the word disappears.

    5. Commit: `feat(phase-2/plan-02): add request schema parser + 13 suggested-prompt chips from handover §16`.
  </action>
  <verify>
    `pnpm typecheck` passes. `pnpm test` passes with ≥18 new tests (9 requestSchema + ~9 suggested). 13 chip count assertion holds.
  </verify>
  <done>
    parseChatRequest produces the 8 locked error codes + ok=true happy path; SUGGESTED_PROMPTS has 5+8 chips verbatim from handover §16 with stable IDs.
  </done>
</task>

</tasks>

<verification>
  - `pnpm typecheck` clean.
  - `pnpm test` green (existing 70 + ~40 new unit tests).
  - Six modules exist under `src/chat/` and `src/prompts/` with exports listed in `must_haves.artifacts`.
  - `src/config/env.ts` schema includes the three new fields with defaults.
  - No new external deps added (zod + pino from Plan 01; everything else is Phase-1 or stdlib).
  - `src/grounding/entities.ts` exports NAME_RE, KB_ID_RE, URL_RE (or Plan 02 re-uses them via a named import — either way, no duplicate regex definitions in the repo).
</verification>

<success_criteria>
Phase 2 SC #3 ("A synthetic response containing a fabricated approver name or a fabricated KB\\d{7} token is blocked by the entity-allowlist post-check"): library primitive for this SC lands here. Plan 04 wires it into the route pipeline.

Phase 2 SC #4 ("/api/prompts?role=... returns the role-specific chip list (5 Consumer, 8 Author) sourced from handover §16"): data source lands here; Plan 04 serves it.

Indirect support for SC #1 (streaming): partialAnswer + sse.encodeSse are the two primitives the route-level stream loop consumes.

Indirect support for SC #2 (single fallback event): sse.ts FallbackReason type locks the four values CONTEXT.md §1 requires.
</success_criteria>

<output>
After completion, create `.planning/phases/02-chat-backend-bff/02-02-SUMMARY.md` with standard GSD template. Capture:
- Full chip list verbatim (for audit traceability against handover §16)
- Any surprises in the partial-JSON parser (esp. surrogate-pair behaviour)
- Any regex-sharing decisions (entities.ts exports vs. duplication)
</output>
