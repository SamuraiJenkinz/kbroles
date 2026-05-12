---
phase: quick-008
plan: 08
type: execute
wave: 1
depends_on: [quick-006]
files_modified:
  - src/config/env.ts
  - src/config/secrets.ts
  - src/config/__tests__/env.test.ts
  - src/llm/client.ts
  - src/llm/stream.ts
  - src/llm/anthropicAdapter.ts
  - src/llm/__tests__/anthropicAdapter.test.ts
  - src/app/api/health/route.ts
  - scripts/phase0-smoke.ts
  - .env.production.example
autonomous: true

must_haves:
  truths:
    - "LLM_PROVIDER=openai (default) preserves the existing OpenAI/Azure-OpenAI behaviour byte-for-byte — no behaviour change on the production path until an operator flips the switch."
    - "LLM_PROVIDER=anthropic routes /api/chat through src/llm/anthropicAdapter.ts which talks to the MGTI /coreapi/llm/anthropic/v1 proxy via direct fetch (no Anthropic SDK dependency added)."
    - "env.ts uses a Zod superRefine block to require either the LLM_* fields (provider=openai) or the ANTHROPIC_* fields (provider=anthropic). Missing fields surface as Invalid env errors at loadEnv() — same fail-fast contract as the existing schema."
    - "stream.ts streamAnswer signature is unchanged. Route handlers (src/app/api/chat/route.ts) do not need to be aware of which provider is active. The dispatcher branches at the top of streamAnswer based on env().LLM_PROVIDER."
    - "Bedrock guardrail interventions (stop_reason='guardrail_intervened') surface as RefusalError — same wire shape on the SSE stream as an OpenAI safety-filter refusal."
    - "Anthropic adapter has Ajv-validation + one-retry on schema reject. After two failures, throws SchemaRejectAfterRetryError, matching the existing OpenAI json_object fallback contract."
    - "All 733 pre-existing unit tests still pass. Net delta: +29 new tests (17 anthropic adapter + 11 env switching + 1 LLM_PROVIDER default)."
  artifacts:
    - path: "src/llm/anthropicAdapter.ts"
      provides: "streamAnswerAnthropic({ systemPrompt, messages, signal }) — direct fetch wrapper for the MGTI proxy. Maps Anthropic body shape ↔ kbroles StreamAnswerResult, handles guardrail+auth+5xx+abort, Ajv-validates with one retry."
      contains: "streamAnswerAnthropic"
    - path: "src/llm/stream.ts"
      provides: "Provider-aware dispatcher. Top-of-function check on env().LLM_PROVIDER routes to the Anthropic adapter or falls through to the existing OpenAI logic."
      contains: "if (env().LLM_PROVIDER === 'anthropic')"
    - path: "src/config/env.ts"
      provides: "LLM_PROVIDER enum + ANTHROPIC_* optional fields + cross-field validation via superRefine."
      contains: "EnvSchemaWithRefine"
  key_links:
    - from: "src/llm/stream.ts streamAnswer dispatcher"
      to: "src/llm/anthropicAdapter.ts streamAnswerAnthropic"
      via: "env().LLM_PROVIDER === 'anthropic' branch at function entry"
      pattern: "streamAnswerAnthropic\\("
    - from: "src/config/env.ts EnvSchemaWithRefine"
      to: "LLM_PROVIDER value-dependent required-field set"
      via: "superRefine block adds custom issues when ANTHROPIC_* missing under provider=anthropic, or LLM_* missing under provider=openai"
      pattern: "data\\.LLM_PROVIDER === 'anthropic'"
---

<objective>
Add Anthropic Claude 4.5+ as a configurable LLM provider for kbroles, routed
through MMC's MGTI /coreapi/llm/anthropic/v1 proxy (AWS Bedrock backend).
Switchable via a single env var (LLM_PROVIDER) with no application-code
changes outside `src/llm/`. The change is additive: existing OpenAI/Azure-
OpenAI deploys continue to work unchanged with LLM_PROVIDER left unset (it
defaults to 'openai').

## Why

Quick 006 + the gpt-4o-mini diagnostic exposed that the deployed MGTI Azure-
OpenAI deployment behind the kbroles pilot is gpt-4o-mini, which is too weak
at verbatim-quote discipline for a citation-grounded SOP product. Switching
the existing OpenAI deployment to full gpt-4o is one path (see
info/model-recommendation-gpt4o-vs-mini.html). A second path — and the
subject of this quick task — is offering Claude 4.5+ as an alternative
provider so the operator can A/B between two known-strong models without
re-platforming.

## Critical gap (acknowledged, not solved here)

The MGTI Anthropic proxy spec does NOT document `tools` / structured-output
support. kbroles' existing OpenAI primary path uses
`response_format: { type: 'json_schema', strict: true }` to enforce the
citation contract at the API level. That backstop is unavailable here. The
adapter therefore relies on:

1. Prompt-only discipline — `composeSystemPrompt()` produces the same prompt
   for both providers, so the strengthened verbatim-quote rule shipped in
   quick-006 applies identically on the Anthropic path.
2. Ajv post-validation against CITATION_SCHEMA, with one retry on schema
   reject — mirrors the existing OpenAI `json_object` fallback path.

If MGTI ever adds `tools` support to the Anthropic proxy, this adapter
should be revisited to use it. Tracked as informal follow-up in the SUMMARY.

## Out of scope

- The strict-schema backstop (see Critical gap above).
- HTTP-level retry on 429/5xx (Anthropic adapter relies on
  UPSTREAM_TOTAL_TIMEOUT_MS to bound worst-case waits, surfaces first
  failure as Upstream5xxError). The OpenAI path's withRetry wrapper is the
  reference for a future iteration if needed.
- True SSE streaming through Anthropic — Phase 2 still uses stream:false
  on both providers. The v1.1 streaming refactor will need separate
  Anthropic adapter work.
- A live 10-trial benchmark on Claude Sonnet 4.5 — operator-blocked on
  MGTI API key provisioning (Hubble PR flow per spec).

Output: A single feat commit on master + a docs commit for STATE.md.
</objective>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/quick/006-strengthen-verbatim-quote-rule/006-SUMMARY.md
@info/model-recommendation-gpt4o-vs-mini.html
@src/llm/stream.ts
@src/llm/client.ts
@src/llm/errors.ts
@src/config/env.ts
@src/grounding/schema.ts
</context>

<discovery_findings>

## Key facts verified before planning

1. **MGTI Anthropic proxy is native Anthropic Messages API.** Not OpenAI-
   compatible. Auth is `x-api-key` (third mode — distinct from `bearer` and
   the Azure-OpenAI `api-key` header). Request body fields per spec:
   `messages, max_tokens (required), anthropic_version, system, temperature,
   stop_sequences, stream`. `tools` is NOT listed.

2. **Response shape uses content blocks**: `content: [{type:"text", text:"..."}]`,
   not OpenAI's `choices[0].message.content`. `stop_reason` carries the
   refusal/guardrail signal. `usage.input_tokens` / `usage.output_tokens`
   instead of OpenAI's `prompt_tokens` / `completion_tokens`.

3. **Bedrock guardrails are mandatory and high-strength.** Per spec
   "Guardrails" section: a guardrail intervention returns 200 OK with empty
   `content` array and `stop_reason: "guardrail_intervened"`. False positives
   on low-signal content (blank pages, separator artifacts) are documented.
   kbroles' SOP content likely won't hit this often but worth monitoring.

4. **Models are Claude 4.5+ only, EU-region-prefixed.** Per spec "Allowed
   Models" table — example IDs include `eu.anthropic.claude-sonnet-4-5-20250929-v1:0`,
   `eu.anthropic.claude-opus-4-6-v1`. Below-4.5 models return 404 from the
   proxy with `Model not supported`.

5. **Existing OpenAI path uses non-null assertions friendly when fields
   are widened to optional.** Verified by typecheck — the broken sites were
   all `e.LLM_MODEL`, `e.LLM_BASE_URL`, `e.LLM_API_KEY` references in
   `src/llm/stream.ts`, `scripts/phase0-smoke.ts`, and one in
   `src/app/api/health/route.ts`. Adding `!` and a `?? null` coercion
   resolved all 6 errors without semantic change.

6. **Existing test patterns use REQUIRED_VARS object spread into loadEnv()
   calls.** New tests follow the same pattern with a separate ANTHROPIC_VARS
   object for the provider-switching path. No refactor of the existing
   suite needed.

</discovery_findings>

<tasks>

<task type="auto">
  <name>Task 1: env.ts — provider switch + Anthropic fields + superRefine</name>
  <files>
    src/config/env.ts
    src/config/__tests__/env.test.ts
  </files>
  <action>
    1. Add `LLM_PROVIDER: z.enum(['openai', 'anthropic']).optional().default('openai')`
       at the top of the EnvSchema block.

    2. Widen existing OpenAI fields (LLM_AUTH_MODE, LLM_BASE_URL,
       LLM_API_KEY, LLM_MODEL) to `.optional()` at the Zod schema level.

    3. Add ANTHROPIC_* fields:
         ANTHROPIC_BASE_URL: z.string().url().optional()
         ANTHROPIC_API_KEY: z.string().min(1).optional()
         ANTHROPIC_MODEL: z.string().min(1).optional()
         ANTHROPIC_VERSION: z.string().min(1).optional().default('bedrock-2023-05-31')
         ANTHROPIC_MAX_TOKENS: z.coerce.number().int().min(1).optional().default(1024)
         ANTHROPIC_TEMPERATURE: z.coerce.number().min(0).max(1).optional().default(0)

    4. Wrap with `.superRefine((data, ctx) => ...)` to require the
       appropriate field set based on LLM_PROVIDER. Issues use
       ZodIssueCode.custom + descriptive messages so loadEnv()'s error JSON
       names the missing field.

    5. Export the Refined schema type, keep `loadEnv()` calling
       `EnvSchemaWithRefine.safeParse(source)` — Zod's superRefine API
       attaches issues during parse, no separate validate step needed.

    6. Add tests in env.test.ts:
       - LLM_PROVIDER defaults to 'openai' when unset
       - ANTHROPIC_VARS object spread parses cleanly without LLM_* fields
       - Defaults for ANTHROPIC_VERSION / ANTHROPIC_MAX_TOKENS / ANTHROPIC_TEMPERATURE
       - Coercion of string env values for max_tokens + temperature
       - Rejection of missing ANTHROPIC_API_KEY / ANTHROPIC_MODEL / ANTHROPIC_BASE_URL
         when LLM_PROVIDER=anthropic
       - Rejection of non-URL ANTHROPIC_BASE_URL
       - Rejection of ANTHROPIC_TEMPERATURE > 1
       - Backward compat: LLM_PROVIDER=openai (default) still requires LLM_MODEL + LLM_API_KEY
  </action>
  <verify>
    pnpm typecheck — clean.
    pnpm test src/config/__tests__/env.test.ts — 41 tests pass (was 30).
  </verify>
  <done>
    EnvSchemaWithRefine compiles, all env tests pass, existing OpenAI-mode
    behaviour preserved.
  </done>
</task>

<task type="auto">
  <name>Task 2: anthropicAdapter.ts — direct fetch wrapper</name>
  <files>
    src/llm/anthropicAdapter.ts
    src/llm/__tests__/anthropicAdapter.test.ts
  </files>
  <action>
    Create the new adapter. Exports a single function:

      streamAnswerAnthropic(params: AnthropicAdapterParams): Promise<StreamAnswerResult>

    Internal flow:
      1. Pre-check: signal?.aborted → throw UpstreamTimeoutError
      2. attemptRequest():
         a. Build URL: ${ANTHROPIC_BASE_URL}/model/${encodeURIComponent(ANTHROPIC_MODEL)}
         b. Build body: { anthropic_version, system, messages, max_tokens, temperature, stream:false }
         c. POST with headers: Content-Type, x-api-key, X-Correlation-Id (fresh UUID)
         d. Map HTTP errors via mapHttpError(): 401/403 → UpstreamAuthError,
            429/5xx → Upstream5xxError(status), other 4xx → Upstream5xxError(status)
         e. If stop_reason === 'guardrail_intervened' → throw RefusalError
         f. Extract text from content[].text blocks
         g. JSON.parse + Ajv validate against CITATION_SCHEMA
         h. Return { response: parsed, usage: mapped }
      3. Outer try/catch:
         a. On first attempt failure: if RefusalError | Auth | 5xx | abort → propagate
         b. Otherwise (parse/Ajv): one retry of attemptRequest()
         c. On retry failure: throw SchemaRejectAfterRetryError(cause)
         d. On any abort-shaped error: throw UpstreamTimeoutError

    Reuses Ajv compile pattern from stream.ts (cached module-level
    ValidateFunction). No new dependencies.

    Tests cover:
      - Happy path with valid JSON in content[0].text
      - URL construction + headers
      - System-prompt-as-top-level-field + messages array shape
      - Usage null when usage block omitted
      - Guardrail intervention → RefusalError
      - No retry on guardrail intervention
      - JSON parse failure → one retry, then succeed
      - Ajv failure → one retry, then succeed
      - Two consecutive Ajv failures → SchemaRejectAfterRetryError
      - 401, 403, 500, 404 status mappings
      - No retry on HTTP errors
      - Pre-aborted signal → UpstreamTimeoutError (no fetch call)
      - Mid-flight AbortError → UpstreamTimeoutError
      - Custom ANTHROPIC_MAX_TOKENS / TEMPERATURE / VERSION respected
  </action>
  <verify>
    pnpm typecheck — clean.
    pnpm test src/llm/__tests__/anthropicAdapter.test.ts — 17 tests pass.
  </verify>
  <done>
    All adapter behaviour locked by tests, no SDK dependency added, error
    types match the OpenAI adapter contract.
  </done>
</task>

<task type="auto">
  <name>Task 3: stream.ts dispatcher + client.ts provider awareness</name>
  <files>
    src/llm/stream.ts
    src/llm/client.ts
    src/app/api/health/route.ts
    scripts/phase0-smoke.ts
  </files>
  <action>
    1. stream.ts: add import for streamAnswerAnthropic. At the top of the
       exported streamAnswer function, branch:
         if (env().LLM_PROVIDER === 'anthropic') return streamAnswerAnthropic({...})
       Anthropic path discards `client` and `strictSchemaSupported`
       params — both are OpenAI-specific. Comment explains.

    2. Add non-null assertions to existing OpenAI call sites where the
       superRefine guarantees the field is set:
         e.LLM_MODEL!  (2 sites in stream.ts)
         e.LLM_MODEL!  (3 sites in scripts/phase0-smoke.ts)
         e.LLM_BASE_URL!  (1 site in phase0-smoke)

    3. client.ts: add a top-level check for LLM_PROVIDER === 'anthropic'.
       Return a placeholder OpenAI client (with apiKey='placeholder-not-
       used-in-anthropic-mode') since route handlers still call
       createLlmClient() unconditionally and pass the client into
       streamAnswer — the dispatcher will then ignore it.

    4. app/api/health/route.ts: `parsed.LLM_BASE_URL ?? null` — handles
       the optional-widening cleanly so the MGTI reachability probe
       skips correctly under LLM_PROVIDER=anthropic.

    5. scripts/phase0-smoke.ts: same non-null assertion treatment;
       `e.LLM_BASE_URL ?? '(unset)'` for the evidence-string field.
  </action>
  <verify>
    pnpm typecheck — clean (was failing at 6 sites).
    pnpm test — 762/762 pass (was 733).
  </verify>
  <done>
    Provider dispatch works, OpenAI behaviour byte-identical when
    LLM_PROVIDER is openai/unset, no test regressions.
  </done>
</task>

<task type="auto">
  <name>Task 4: secrets.ts + .env.production.example</name>
  <files>
    src/config/secrets.ts
    .env.production.example
  </files>
  <action>
    1. Add ANTHROPIC_API_KEY to SECRET_KEYS in src/config/secrets.ts (12th
       entry). This lets AWS-path deploys store the Anthropic key in the
       /mmc/cts/kb-assistant Secrets Manager blob alongside LLM_API_KEY.

    2. Update .env.production.example to document:
       - LLM_PROVIDER as runtime (non-secret) with comment + default
       - ANTHROPIC_BASE_URL / ANTHROPIC_MODEL / ANTHROPIC_VERSION /
         ANTHROPIC_MAX_TOKENS / ANTHROPIC_TEMPERATURE as runtime template
       - ANTHROPIC_API_KEY as secret (12-key block)
       - Update the "11 keys" comment to "12 keys"
  </action>
  <verify>
    pnpm typecheck — clean.
    pnpm test src/config/__tests__/ — 49 tests pass (env + secrets).
  </verify>
  <done>
    Operator can drop ANTHROPIC_API_KEY into the AWS secret blob or the
    .env.production file and switch providers via LLM_PROVIDER=anthropic.
  </done>
</task>

<task type="auto">
  <name>Task 5: Commit + push</name>
  <files>
    .planning/quick/008-anthropic-provider-integration/008-PLAN.md
    .planning/quick/008-anthropic-provider-integration/008-SUMMARY.md
    .planning/STATE.md
  </files>
  <action>
    Standard GSD quick task closeout — feat commit with the full code +
    docs in one atomic commit, then a docs follow-up commit that backfills
    the commit hash in SUMMARY.md and adds the row to STATE.md. Push both.

    Commit subject:

      feat(llm): add Anthropic provider via MGTI proxy as configurable alternative

    Co-Author trailer: Claude Opus 4.7 (1M context).
  </action>
  <verify>
    git log -2 — both commits present, hashes recorded.
    git push origin master — succeeds.
  </verify>
  <done>
    Commits live on origin/master, STATE.md updated with the row + new
    Last-activity narrative.
  </done>
</task>

</tasks>

<success_criteria>
- [x] LLM_PROVIDER env switch — defaults to 'openai', switches whole pipeline at runtime
- [x] env.ts conditional validation via superRefine
- [x] anthropicAdapter.ts — direct fetch, no SDK dep added
- [x] stream.ts — dispatcher branches without changing exported signature
- [x] client.ts — provider-aware (returns placeholder for anthropic mode)
- [x] Existing 733 unit tests pass unmodified
- [x] +29 new tests (17 adapter + 11 env-switching + 1 default-provider)
- [x] Typecheck clean
- [x] .env.production.example documents the new vars
- [x] ANTHROPIC_API_KEY added to AWS Secrets Manager allowlist
- [x] Commit subject: feat(llm): add Anthropic provider via MGTI proxy as configurable alternative
- [x] Co-Authored-By trailer: Claude Opus 4.7 (1M context)
</success_criteria>

<output>
After completion, create .planning/quick/008-anthropic-provider-integration/008-SUMMARY.md.
</output>
