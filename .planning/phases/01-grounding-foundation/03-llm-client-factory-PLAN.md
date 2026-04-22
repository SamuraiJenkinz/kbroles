---
plan: 3
name: llm-client-factory
phase: 1
wave: 2
depends_on: [1]
files_modified:
  - src/llm/client.ts
  - src/llm/stream.ts
  - src/llm/__tests__/client.test.ts
  - src/llm/__tests__/stream.test.ts
autonomous: true

must_haves:
  truths:
    - "createLlmClient() is the SINGLE place in the codebase that branches on auth mode; zero NODE_ENV checks anywhere"
    - "Bearer mode (dev): constructed OpenAI client has apiKey=LLM_API_KEY, no api-key header"
    - "api-key mode (MGTI): constructed OpenAI client has apiKey='placeholder' and defaultHeaders['api-key']=LLM_API_KEY"
    - "baseURL on the constructed client equals env.LLM_BASE_URL verbatim (no suffix manipulation in the factory — the env is the source of truth)"
    - "streamAnswer({ client, systemPrompt, messages, schema }) issues a non-streaming chat.completions.create with response_format json_schema strict: true, parses JSON, returns KbResponse shape"
    - "streamAnswer has a json_object + Ajv fallback branch that activates when STRICT_SCHEMA_SUPPORTED env flag is 'false' (set by smoke script on Smoke 2 failure)"
    - "pnpm test -- src/llm passes both client and stream test suites with mocked openai package; no network calls in tests"
  artifacts:
    - path: "src/llm/client.ts"
      provides: "createLlmClient() factory + AUTH_MODES constant"
      exports: ["createLlmClient"]
    - path: "src/llm/stream.ts"
      provides: "streamAnswer facade — strict json_schema path + Ajv json_object fallback path"
      exports: ["streamAnswer", "ChatMessage", "StreamAnswerParams"]
  key_links:
    - from: "src/llm/client.ts"
      to: "openai"
      via: "new OpenAI({ baseURL, apiKey, defaultHeaders })"
      pattern: "new OpenAI\\("
    - from: "src/llm/client.ts"
      to: "src/config/env.ts"
      via: "env() reads LLM_AUTH_MODE/LLM_BASE_URL/LLM_API_KEY/LLM_MODEL"
      pattern: "env\\(\\)"
    - from: "src/llm/stream.ts"
      to: "src/grounding/schema.ts"
      via: "imports CITATION_SCHEMA + KbResponse type"
      pattern: "CITATION_SCHEMA"
    - from: "src/llm/stream.ts"
      to: "openai"
      via: "client.chat.completions.create with response_format json_schema"
      pattern: "chat\\.completions\\.create"
---

<objective>
Build the dual-mode OpenAI SDK client factory and the `streamAnswer` facade that is the single call-surface for LLM interaction across the app. This is where the dev-vs-MGTI-ingress branching lives — the ONE place in the codebase that reads `LLM_AUTH_MODE`. Every other file imports these and does not care which endpoint is live.

Purpose: GRND-06 says "LLM client is env-driven — local dev uses direct OpenAI (Bearer auth); prod uses MGTI ingress (api-key auth). Zero NODE_ENV branching in application code." This plan enforces that invariant. Pitfall #11 (ingress auth break) is primarily mitigated here — wrong auth mode fails fast with a clear error at construction time.

Output: `createLlmClient()`, `streamAnswer()`, and their unit tests with the `openai` package mocked.
</objective>

<context>
Depends on Plan 01 (for `env()`, `CITATION_SCHEMA`, `KbResponse`). Before starting, read:

@.planning/phases/01-grounding-foundation/01-CONTEXT.md  (§4 Smoke harness & dual-mode config — AUTHORITATIVE)
@.planning/phases/01-grounding-foundation/01-RESEARCH.md  (Gap 3 — openai SDK v6 constructor pattern, api-key override via defaultHeaders, Risk 1/2)
@.planning/phases/01-grounding-foundation/01-scaffold-registry-schema-PLAN.md  (env.ts + schema.ts — imports)
@.planning/research/ARCHITECTURE.md  (§10 Dev/Prod LLM Endpoint Swap)
@.planning/research/PITFALLS.md  (#10 ingress streaming, #11 ingress auth break)
@src/config/env.ts  (env() and loadEnv() — USE THESE)
@src/grounding/schema.ts  (CITATION_SCHEMA, KbResponse, Citation)

**Factory behaviour (locked in CONTEXT.md §4):**
- `createLlmClient()` reads `env()` and returns an `OpenAI` instance.
- api-key mode: `apiKey: 'placeholder'` + `defaultHeaders: { 'api-key': env.LLM_API_KEY }`. The SDK requires non-empty apiKey but MGTI reads the header.
- bearer mode: `apiKey: env.LLM_API_KEY`, no defaultHeaders override.
- `baseURL` passed through verbatim (env is source of truth; Phase-0 Smoke 1 confirms the suffix).

**streamAnswer facade (locked in CONTEXT.md §2 strict-mode-fallback path):**
- Primary path: `response_format: { type: 'json_schema', json_schema: { name, strict: true, schema } }` with `stream: false` for Phase 1.
- Fallback path (gated on env flag or explicit param): `response_format: { type: 'json_object' }` + server-side Ajv validation + one retry on Ajv failure.
- Both paths return `KbResponse` or throw on unrecoverable failure.
- Phase 1 is NON-streaming. `stream: true` ships in Phase 2 (GRND-07).
</context>

<tasks>

<task id="3.1" type="auto" verify="pnpm tsc --noEmit">
  <name>Task 3.1: Implement createLlmClient factory</name>
  <files>src/llm/client.ts</files>
  <action>
    Create `src/llm/client.ts`:

    ```ts
    import OpenAI from 'openai'
    import { env } from '@/config/env'

    /**
     * Single source of auth-mode branching in the codebase.
     *
     * - Dev: `bearer` mode. apiKey goes into the SDK's Authorization: Bearer header.
     *   LLM_BASE_URL points at https://api.openai.com/v1.
     *
     * - Prod: `api-key` mode. apiKey is the MGTI-issued key and is sent as the
     *   `api-key` HTTP header (Azure-compatible). The SDK's apiKey field is set
     *   to a placeholder because the SDK throws on empty/undefined — but the
     *   real auth is the defaultHeaders entry.
     *
     * No NODE_ENV checks in this file or anywhere else. Env contract is the
     * single source of truth; misconfiguration fails fast in loadEnv().
     */
    export function createLlmClient(): OpenAI {
      const e = env()
      if (e.LLM_AUTH_MODE === 'api-key') {
        return new OpenAI({
          baseURL: e.LLM_BASE_URL,
          apiKey: 'placeholder',                        // SDK requires non-empty; ignored by MGTI
          defaultHeaders: { 'api-key': e.LLM_API_KEY }, // the real auth header
        })
      }
      // bearer mode — the SDK's default header flow.
      return new OpenAI({
        baseURL: e.LLM_BASE_URL,
        apiKey: e.LLM_API_KEY,
      })
    }
    ```
  </action>
  <verify>`pnpm tsc --noEmit` exits 0.</verify>
  <done>Factory implemented. No tests yet.</done>
</task>

<task id="3.2" type="auto" verify="pnpm tsc --noEmit">
  <name>Task 3.2: Implement streamAnswer facade</name>
  <files>src/llm/stream.ts</files>
  <action>
    Create `src/llm/stream.ts`:

    ```ts
    import type OpenAI from 'openai'
    import Ajv, { type ValidateFunction } from 'ajv'
    import { CITATION_SCHEMA, type KbResponse } from '@/grounding/schema'
    import { env } from '@/config/env'

    export interface ChatMessage {
      role: 'system' | 'user' | 'assistant'
      content: string
    }

    export interface StreamAnswerParams {
      client: OpenAI
      systemPrompt: string
      messages: ChatMessage[]
      /**
       * Override the strict-mode capability flag. If omitted, reads from
       * env.STRICT_SCHEMA_SUPPORTED (default true). Smoke 2 sets this to false
       * when the MGTI deployment does not honour response_format: json_schema
       * strict: true.
       */
      strictSchemaSupported?: boolean
    }

    let cachedValidator: ValidateFunction | null = null
    function getValidator(): ValidateFunction {
      if (cachedValidator) return cachedValidator
      const ajv = new Ajv({ allErrors: false, strict: false })
      cachedValidator = ajv.compile(CITATION_SCHEMA as object)
      return cachedValidator
    }

    /**
     * Non-streaming Phase-1 facade. Phase 2 adds true SSE streaming (GRND-07).
     *
     * Primary path: response_format: json_schema, strict: true.
     * Fallback path: response_format: json_object + Ajv validation + one retry.
     *   Activated when strictSchemaSupported === false.
     *
     * Callers never see which branch ran — they always get a KbResponse or a throw.
     */
    export async function streamAnswer(params: StreamAnswerParams): Promise<KbResponse> {
      const { client, systemPrompt, messages } = params
      const strictSupported =
        params.strictSchemaSupported ??
        (process.env.STRICT_SCHEMA_SUPPORTED ?? 'true') !== 'false'

      const e = env()
      const wireMessages = [
        { role: 'system' as const, content: systemPrompt },
        ...messages,
      ]

      if (strictSupported) {
        const completion = await client.chat.completions.create({
          model: e.LLM_MODEL,
          messages: wireMessages,
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'kb_response',
              strict: true,
              schema: CITATION_SCHEMA as Record<string, unknown>,
            },
          },
          stream: false,
        })
        const content = completion.choices[0]?.message?.content ?? '{}'
        return JSON.parse(content) as KbResponse
      }

      // Fallback: json_object + Ajv + one retry.
      const validator = getValidator()

      async function tryOnce(): Promise<KbResponse> {
        const completion = await client.chat.completions.create({
          model: e.LLM_MODEL,
          messages: wireMessages,
          response_format: { type: 'json_object' },
          stream: false,
        })
        const content = completion.choices[0]?.message?.content ?? '{}'
        const parsed = JSON.parse(content)
        if (!validator(parsed)) {
          const errMsg = JSON.stringify(validator.errors)
          throw new Error(`Ajv validation failed: ${errMsg}`)
        }
        return parsed as KbResponse
      }

      try {
        return await tryOnce()
      } catch (firstErr) {
        // One retry — same system prompt, maybe the model emitted extra whitespace
        // or a stray field that broke Ajv. If this also fails, the caller decides
        // what to do (smoke script fails; Phase 2 route handler flips to fallback).
        try {
          return await tryOnce()
        } catch (retryErr) {
          const msg = retryErr instanceof Error ? retryErr.message : String(retryErr)
          throw new Error(
            `streamAnswer json_object fallback failed twice: ${msg} (first: ${
              firstErr instanceof Error ? firstErr.message : String(firstErr)
            })`
          )
        }
      }
    }
    ```

    Note: the `ajv` package was added as a devDependency in Plan 01's `package.json`. It is used here at runtime only in the fallback path. Because ajv is used in production-path code (gated by env flag), move it to `dependencies` — run `pnpm add ajv` and remove it from devDependencies. Alternatively keep it as a devDep and accept that the fallback path pulls from node_modules regardless; given Next.js's bundling and the small size, this is pragmatic but less clean. **Action: move `ajv` to `dependencies`.** Also ensure `"@types/json-schema"` (devDep from Plan 01) is still present.
  </action>
  <verify>
    - `pnpm tsc --noEmit` exits 0
    - `pnpm list ajv` shows ajv in dependencies (not devDependencies)
  </verify>
  <done>streamAnswer implemented with both primary and fallback branches.</done>
</task>

<task id="3.3" type="auto" verify="pnpm test -- src/llm/__tests__/client.test.ts">
  <name>Task 3.3: Client factory tests (mocked openai package)</name>
  <files>src/llm/__tests__/client.test.ts</files>
  <action>
    Create `src/llm/__tests__/client.test.ts`. Mock the `openai` package to capture constructor arguments:

    ```ts
    import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

    // MUST mock before importing the module under test — vi.mock is hoisted.
    vi.mock('openai', () => ({
      default: vi.fn().mockImplementation((opts: unknown) => ({ _opts: opts })),
    }))

    import { createLlmClient } from '@/llm/client'
    import { __resetEnvCacheForTests } from '@/config/env'

    const ORIGINAL_ENV = { ...process.env }

    beforeEach(() => {
      // Reset process.env for each test to known baseline.
      process.env = { ...ORIGINAL_ENV }
      __resetEnvCacheForTests()
    })

    afterEach(() => {
      process.env = { ...ORIGINAL_ENV }
      __resetEnvCacheForTests()
    })

    describe('createLlmClient — bearer mode', () => {
      it('sets apiKey from env and does NOT set api-key header', () => {
        process.env.LLM_AUTH_MODE = 'bearer'
        process.env.LLM_BASE_URL  = 'https://api.openai.com/v1'
        process.env.LLM_API_KEY   = 'sk-test-123'
        process.env.LLM_MODEL     = 'gpt-4o-2024-08-06'

        const client = createLlmClient() as any
        expect(client._opts.baseURL).toBe('https://api.openai.com/v1')
        expect(client._opts.apiKey).toBe('sk-test-123')
        expect(client._opts.defaultHeaders).toBeUndefined()
      })
    })

    describe('createLlmClient — api-key mode', () => {
      it('sets api-key header and uses placeholder for apiKey', () => {
        process.env.LLM_AUTH_MODE = 'api-key'
        process.env.LLM_BASE_URL  = 'https://stg1.mmc-dallas-int-non-prod-ingress.mgti.mmc.com/coreapi/openai/v1'
        process.env.LLM_API_KEY   = 'mgti-key-xyz'
        process.env.LLM_MODEL     = 'gpt-4o'

        const client = createLlmClient() as any
        expect(client._opts.baseURL).toBe('https://stg1.mmc-dallas-int-non-prod-ingress.mgti.mmc.com/coreapi/openai/v1')
        expect(client._opts.apiKey).toBe('placeholder')
        expect(client._opts.defaultHeaders?.['api-key']).toBe('mgti-key-xyz')
      })
    })

    describe('createLlmClient — env invariants', () => {
      it('throws when LLM_AUTH_MODE is missing', () => {
        process.env.LLM_AUTH_MODE = ''
        process.env.LLM_BASE_URL  = 'https://api.openai.com/v1'
        process.env.LLM_API_KEY   = 'sk-test'
        process.env.LLM_MODEL     = 'gpt-4o'
        expect(() => createLlmClient()).toThrow(/Invalid env/)
      })

      it('throws when LLM_AUTH_MODE is invalid', () => {
        process.env.LLM_AUTH_MODE = 'bogus' as any
        process.env.LLM_BASE_URL  = 'https://api.openai.com/v1'
        process.env.LLM_API_KEY   = 'sk-test'
        process.env.LLM_MODEL     = 'gpt-4o'
        expect(() => createLlmClient()).toThrow(/Invalid env/)
      })

      it('throws when LLM_API_KEY is empty', () => {
        process.env.LLM_AUTH_MODE = 'bearer'
        process.env.LLM_BASE_URL  = 'https://api.openai.com/v1'
        process.env.LLM_API_KEY   = ''
        process.env.LLM_MODEL     = 'gpt-4o'
        expect(() => createLlmClient()).toThrow(/Invalid env/)
      })
    })
    ```
  </action>
  <verify>`pnpm test -- src/llm/__tests__/client.test.ts` passes all 5 cases.</verify>
  <done>Client factory tested with mocked SDK; no network calls.</done>
</task>

<task id="3.4" type="auto" verify="pnpm test -- src/llm/__tests__/stream.test.ts">
  <name>Task 3.4: streamAnswer tests (mock client.chat.completions.create)</name>
  <files>src/llm/__tests__/stream.test.ts</files>
  <action>
    Create `src/llm/__tests__/stream.test.ts`. Build a mock `OpenAI`-shaped object (not via `vi.mock` — use a plain object that the test constructs) and verify:
    1. Primary path sends `response_format: json_schema` with the CITATION_SCHEMA
    2. Fallback path sends `response_format: json_object` and runs Ajv
    3. Fallback retries once on Ajv failure, then throws on second failure

    ```ts
    import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
    import { streamAnswer, type ChatMessage } from '@/llm/stream'
    import { CITATION_SCHEMA } from '@/grounding/schema'
    import { __resetEnvCacheForTests } from '@/config/env'

    const ORIGINAL_ENV = { ...process.env }

    function makeMockClient(
      responses: Array<{ content: string }>
    ): { client: any; calls: any[] } {
      const calls: any[] = []
      let callIdx = 0
      const client = {
        chat: {
          completions: {
            create: vi.fn(async (params: any) => {
              calls.push(params)
              const response = responses[callIdx++]
              return {
                choices: [{ message: { content: response.content } }],
              }
            }),
          },
        },
      }
      return { client, calls }
    }

    beforeEach(() => {
      process.env = { ...ORIGINAL_ENV }
      process.env.LLM_AUTH_MODE = 'bearer'
      process.env.LLM_BASE_URL  = 'https://api.openai.com/v1'
      process.env.LLM_API_KEY   = 'sk-test'
      process.env.LLM_MODEL     = 'gpt-4o-2024-08-06'
      __resetEnvCacheForTests()
    })

    afterEach(() => {
      process.env = { ...ORIGINAL_ENV }
      __resetEnvCacheForTests()
    })

    const VALID_RESPONSE_JSON = JSON.stringify({
      can_answer: true,
      answer: 'Click Flag Article.',
      citations: [{
        source_id: 'KB0022991',
        section_id: 'flagging-articles',
        quote: 'Click the Flag Article button',
      }],
    })

    describe('streamAnswer — primary path (json_schema strict)', () => {
      it('sends response_format: json_schema with the citation schema', async () => {
        const { client, calls } = makeMockClient([{ content: VALID_RESPONSE_JSON }])
        const messages: ChatMessage[] = [{ role: 'user', content: 'How do I flag?' }]
        const result = await streamAnswer({
          client, systemPrompt: 'sys', messages, strictSchemaSupported: true,
        })
        expect(calls).toHaveLength(1)
        expect(calls[0].response_format.type).toBe('json_schema')
        expect(calls[0].response_format.json_schema.strict).toBe(true)
        expect(calls[0].response_format.json_schema.name).toBe('kb_response')
        expect(calls[0].response_format.json_schema.schema).toBe(CITATION_SCHEMA)
        expect(calls[0].stream).toBe(false)
        expect(result.can_answer).toBe(true)
        expect(result.citations[0].section_id).toBe('flagging-articles')
      })

      it('prepends systemPrompt as the first message', async () => {
        const { client, calls } = makeMockClient([{ content: VALID_RESPONSE_JSON }])
        await streamAnswer({
          client,
          systemPrompt: 'SYSTEM_PROMPT_TEXT',
          messages: [{ role: 'user', content: 'q' }],
          strictSchemaSupported: true,
        })
        expect(calls[0].messages[0]).toEqual({ role: 'system', content: 'SYSTEM_PROMPT_TEXT' })
        expect(calls[0].messages[1]).toEqual({ role: 'user', content: 'q' })
      })
    })

    describe('streamAnswer — fallback path (json_object + Ajv)', () => {
      it('sends response_format: json_object when strictSchemaSupported=false', async () => {
        const { client, calls } = makeMockClient([{ content: VALID_RESPONSE_JSON }])
        const result = await streamAnswer({
          client, systemPrompt: 'sys', messages: [{ role: 'user', content: 'q' }],
          strictSchemaSupported: false,
        })
        expect(calls[0].response_format.type).toBe('json_object')
        expect(calls[0].response_format).not.toHaveProperty('json_schema')
        expect(result.can_answer).toBe(true)
      })

      it('retries once on Ajv validation failure, then succeeds', async () => {
        const BAD_JSON = JSON.stringify({ can_answer: true, answer: 'x' }) // missing citations
        const { client, calls } = makeMockClient([
          { content: BAD_JSON },
          { content: VALID_RESPONSE_JSON },
        ])
        const result = await streamAnswer({
          client, systemPrompt: 'sys', messages: [{ role: 'user', content: 'q' }],
          strictSchemaSupported: false,
        })
        expect(calls).toHaveLength(2) // first attempt failed, retry succeeded
        expect(result.can_answer).toBe(true)
      })

      it('throws after two Ajv failures', async () => {
        const BAD_JSON = JSON.stringify({ not: 'valid' })
        const { client } = makeMockClient([
          { content: BAD_JSON },
          { content: BAD_JSON },
        ])
        await expect(
          streamAnswer({
            client, systemPrompt: 'sys', messages: [{ role: 'user', content: 'q' }],
            strictSchemaSupported: false,
          })
        ).rejects.toThrow(/streamAnswer json_object fallback failed twice/)
      })
    })

    describe('streamAnswer — env flag default', () => {
      it('defaults to strictSchemaSupported=true when env flag unset', async () => {
        delete process.env.STRICT_SCHEMA_SUPPORTED
        const { client, calls } = makeMockClient([{ content: VALID_RESPONSE_JSON }])
        await streamAnswer({
          client, systemPrompt: 'sys', messages: [{ role: 'user', content: 'q' }],
        })
        expect(calls[0].response_format.type).toBe('json_schema')
      })

      it('respects STRICT_SCHEMA_SUPPORTED=false env flag', async () => {
        process.env.STRICT_SCHEMA_SUPPORTED = 'false'
        const { client, calls } = makeMockClient([{ content: VALID_RESPONSE_JSON }])
        await streamAnswer({
          client, systemPrompt: 'sys', messages: [{ role: 'user', content: 'q' }],
        })
        expect(calls[0].response_format.type).toBe('json_object')
      })
    })
    ```
  </action>
  <verify>`pnpm test -- src/llm/__tests__/stream.test.ts` passes all 7 cases.</verify>
  <done>streamAnswer tested in both branches; Ajv retry logic verified.</done>
</task>

<task id="3.5" type="auto" verify="pnpm test && pnpm tsc --noEmit">
  <name>Task 3.5: Full suite green + commit</name>
  <files>(none — verification + git)</files>
  <action>
    ```bash
    pnpm test
    pnpm tsc --noEmit
    ```

    All test files from Plan 01, 02, and 03 should now pass (schema, registry, entities, validator, client, stream).

    Commit:

    ```bash
    git add package.json pnpm-lock.yaml src/llm .planning/phases/01-grounding-foundation/03-llm-client-factory-PLAN.md
    git commit -m "feat(phase-1/plan-03): dual-mode LLM client factory + streamAnswer facade

    - createLlmClient() is the single auth-mode branch in the codebase
    - bearer mode: Authorization: Bearer <key> via SDK default
    - api-key mode: api-key header via defaultHeaders, SDK apiKey='placeholder'
    - Zero NODE_ENV checks — env contract is source of truth
    - streamAnswer() non-streaming facade (stream: true in Phase 2)
      - Primary: response_format json_schema strict: true
      - Fallback: response_format json_object + Ajv + one retry
      - Branch gated by strictSchemaSupported param (default from env flag)
    - Client tests use vi.mock('openai') to capture constructor args
    - Stream tests use a plain mock client shape, no vi.mock
    - ajv moved to dependencies (used in runtime fallback path)

    GRND-06 (env-driven LLM client, zero NODE_ENV branching).
    Pitfall #11 primary mitigation (ingress auth break).
    Strict-mode fallback path (CONTEXT.md §2) ready for Smoke 2 result."
    ```
  </action>
  <verify>
    - `pnpm test` exits 0 — six test files green (schema, registry, entities, validator, client, stream)
    - `pnpm tsc --noEmit` exits 0
    - `git log -1` shows the Plan 03 commit
  </verify>
  <done>Client factory and streamAnswer facade shipped; Plans 04 and 05 can use them.</done>
</task>

</tasks>

<verification>
- `pnpm test -- src/llm` passes both suites
- `pnpm test` passes all six grounding + llm suites
- `pnpm tsc --noEmit` clean
- `grep -r 'NODE_ENV' src/` returns no hits (invariant from GRND-06) — the factory does not read NODE_ENV
</verification>

<success_criteria>
- `createLlmClient()` exported from `@/llm/client`
- `streamAnswer()`, `ChatMessage`, `StreamAnswerParams` exported from `@/llm/stream`
- Both branches (strict json_schema and json_object + Ajv fallback) implemented and tested
- No live LLM calls during test run (all mocked)
- No regression in prior plans' tests
- Commit in git
</success_criteria>

<out_of_scope>
- **Streaming (`stream: true`) + SSE parsing** → Phase 2 (GRND-07). This plan's `streamAnswer` is non-streaming — sufficient for the Phase-0 smoke script and enough to assert shape correctness.
- **`/api/chat` route wiring** → Phase 2.
- **Retry on 429 / rate-limit** → Phase 2 (Pitfall #12).
- **Actually hitting OpenAI or MGTI** → Plan 05 (smoke script); this plan uses only mocked clients.
- **Running the json_object fallback against a real endpoint** → only exercised live if Smoke 2 determines MGTI doesn't honour strict mode.
</out_of_scope>

<pitfall_watch>
- **Pitfall #11 (ingress auth break):** Primary mitigation is the factory's single branch point and the env contract that fails fast on misconfiguration. The tests explicitly exercise bearer, api-key, missing auth mode, invalid auth mode, and empty API key.
- **Pitfall #10 (ingress streaming cadence):** Out of scope for THIS plan — the smoke script (Plan 05) measures it. But `streamAnswer`'s `stream: false` here means Phase 1 doesn't block on the cadence result; Phase 2 will.
- **RESEARCH Risk 1 (openai package v4 vs v6):** Constructor pattern `new OpenAI({ baseURL, apiKey, defaultHeaders })` is stable across versions. If `pnpm install` installs v6.x and `pnpm tsc --noEmit` fails on the constructor options type, adjust types (the options object accepts extra keys via an index signature in practice). Do not downgrade to v4 without user sign-off.
- **RESEARCH Risk 2 (MGTI strict-mode support):** Both branches are implemented and tested in-process. Live resolution is Smoke 2's job.
</pitfall_watch>
