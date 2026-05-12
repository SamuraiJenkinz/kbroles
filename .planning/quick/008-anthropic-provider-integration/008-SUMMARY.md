---
quick: 008
title: Add Anthropic provider via MGTI proxy as configurable LLM alternative
date: 2026-05-11
commit: TBD
subsystem: llm
tags: [llm, anthropic, claude, mgti, provider-abstraction, env-config, bedrock]

dependency-graph:
  requires: [quick-006]
  provides: LLM_PROVIDER=anthropic operating mode routing /api/chat through the MGTI /coreapi/llm/anthropic/v1 proxy (Claude 4.5+ via AWS Bedrock)
  affects: []

tech-stack:
  added: []
  patterns:
    - "single-env-var provider switching with backward-compatible default ('openai')"
    - "Zod superRefine for value-dependent required-field validation"
    - "direct fetch wrapper for non-OpenAI-compatible proxies (no SDK dep added)"
    - "guardrail intervention mapped to existing RefusalError contract — wire shape stable across providers"

key-files:
  created:
    - src/llm/anthropicAdapter.ts
    - src/llm/__tests__/anthropicAdapter.test.ts
    - .planning/quick/008-anthropic-provider-integration/008-PLAN.md
    - .planning/quick/008-anthropic-provider-integration/008-SUMMARY.md
  modified:
    - src/config/env.ts
    - src/config/secrets.ts
    - src/config/__tests__/env.test.ts
    - src/llm/client.ts
    - src/llm/stream.ts
    - src/app/api/health/route.ts
    - scripts/phase0-smoke.ts
    - .env.production.example

decisions:
  - id: direct-fetch-no-sdk
    choice: "Use direct fetch() against the MGTI proxy URL instead of installing @anthropic-ai/sdk"
    rationale: "The MGTI proxy is a custom endpoint at /coreapi/llm/anthropic/v1, not anthropic.com. The SDK adds dependency weight and a second auth abstraction (x-api-key is set as a header anyway). Direct fetch keeps the dep tree lean and the wire format obvious in source."
    alternatives: ["@anthropic-ai/sdk — rejected; no value-add over plain fetch for a single-endpoint proxy", "thin shim that translates OpenAI calls to Anthropic — rejected; would require sustained maintenance across two SDK contracts"]

  - id: no-strict-schema-on-anthropic-path
    choice: "Accept Ajv-with-one-retry validation; no structured-output backstop"
    rationale: "The MGTI Anthropic proxy spec does not document `tools` / structured-output support. The OpenAI path's `response_format: { type: 'json_schema', strict: true }` enforcement is unavailable. Falling back to prompt-only + Ajv mirrors the OpenAI json_object fallback that exists for the STRICT_SCHEMA_SUPPORTED=false case, so the failure mode is a known one with established handling."
    alternatives: ["wait for MGTI tools support before integrating — rejected; blocks the alternative-provider option indefinitely on a roadmap we don't control"]

  - id: superRefine-for-cross-field-validation
    choice: "Wrap EnvSchema with .superRefine() and conditionally require LLM_* or ANTHROPIC_* based on LLM_PROVIDER"
    rationale: "Zod discriminated unions are heavier and would require restructuring every consumer of the env type. superRefine keeps the schema flat, lets Zod surface field-specific error messages, and runs after defaults are applied so LLM_PROVIDER is always resolved when the refinement fires."
    alternatives: ["runtime check in createLlmClient() — rejected; fails later (first request) instead of at process start (loadEnv)"]

  - id: placeholder-openai-client-in-anthropic-mode
    choice: "createLlmClient() returns a placeholder OpenAI instance when LLM_PROVIDER=anthropic"
    rationale: "The route handler (src/app/api/chat/route.ts) calls createLlmClient() once per request and passes the client into streamAnswer(). Returning null would force route.ts changes; returning the placeholder keeps route.ts diff at zero. The placeholder is never called — streamAnswer's dispatcher routes to the Anthropic adapter before any client method invocation."
    alternatives: ["change streamAnswer signature to make client optional — rejected; bigger surface area, more test churn"]

  - id: guardrail-maps-to-refusal-error
    choice: "Bedrock guardrail intervention (stop_reason='guardrail_intervened') throws RefusalError"
    rationale: "The route handler's existing RefusalError catch path emits fallback{reason:'refusal'} which the client renders as the same UX the user sees on an OpenAI safety-filter refusal. Operationally identical end-user experience, identical SSE wire shape, no new error type needed."
    alternatives: ["new GuardrailInterventionError class — rejected; would require route handler changes for zero UX benefit"]

metrics:
  duration: "~1.5 dev-hours (well under the 3-day estimate in the lift analysis — the existing code patterns were a clean fit)"
  completed: 2026-05-11
  files_changed: 10
  new_tests: 29
  test_count_before: 733
  test_count_after: 762
  new_dependencies: 0
---

# Quick Task 008: Add Anthropic provider via MGTI proxy

**One-liner:** kbroles can now be switched from OpenAI to Claude 4.5+ by setting `LLM_PROVIDER=anthropic` and filling in three `ANTHROPIC_*` env vars. No code change required on the operator side; no behavioural change on existing OpenAI deploys until the switch is flipped.

## Commit

| Field | Value |
|---|---|
| Hash | TBD |
| Subject | `feat(llm): add Anthropic provider via MGTI proxy as configurable alternative` |
| Branch | `master` |
| Co-Author | `Claude Opus 4.7 (1M context) <noreply@anthropic.com>` |

## What ships

### New file — `src/llm/anthropicAdapter.ts` (~250 LOC)

Direct fetch wrapper for the MGTI `/coreapi/llm/anthropic/v1` proxy. Public entry: `streamAnswerAnthropic({ systemPrompt, messages, signal }) → StreamAnswerResult`. Handles:

- Native Anthropic body shape (system as top-level field, max_tokens required, anthropic_version)
- `x-api-key` auth + per-attempt `X-Correlation-Id` UUID for MGTI traceability
- Content-block response parsing (`content[0].text` → JSON.parse → Ajv validate)
- Guardrail intervention (`stop_reason: "guardrail_intervened"` → `RefusalError`)
- HTTP error mapping (401/403 → `UpstreamAuthError`, 429/5xx/4xx → `Upstream5xxError`)
- One Ajv retry on schema reject (mirrors OpenAI `json_object` fallback)
- `AbortSignal` → `UpstreamTimeoutError` conversion

### Modified — `src/config/env.ts`

Added `LLM_PROVIDER: z.enum(['openai', 'anthropic']).optional().default('openai')`. Widened existing OpenAI fields to `.optional()`. Added 6 `ANTHROPIC_*` fields (3 required, 3 with safe defaults). Wrapped the schema with `.superRefine()` to enforce the right field set based on `LLM_PROVIDER`. Backward compatible — existing tests pass without modification because their `REQUIRED_VARS` object satisfies the superRefine when `LLM_PROVIDER` defaults to `'openai'`.

### Modified — `src/llm/stream.ts`

Added a 7-line dispatcher block at the top of the exported `streamAnswer` function. When `env().LLM_PROVIDER === 'anthropic'`, delegates to `streamAnswerAnthropic` and returns. Otherwise falls through to the existing OpenAI logic unchanged. Route handlers do not see this branch — they call `streamAnswer` with the same signature as before.

### Modified — `src/llm/client.ts`

Added a top-level `if (LLM_PROVIDER === 'anthropic')` branch that returns a placeholder OpenAI instance. The placeholder is never invoked because the dispatcher in `streamAnswer` routes to the Anthropic adapter before any OpenAI method is called — but the placeholder lets `createLlmClient()` continue to be called unconditionally from route handlers without breaking the type signature.

### Modified — `src/config/secrets.ts`

Added `ANTHROPIC_API_KEY` to the `SECRET_KEYS` allowlist so AWS-path deploys can store the key in the `/mmc/cts/kb-assistant` Secrets Manager blob alongside `LLM_API_KEY`.

### Modified — `.env.production.example`

Documented the new `LLM_PROVIDER` switch + `ANTHROPIC_*` block with inline guidance. Bumped the "11 keys" → "12 keys" comment.

### Modified — `src/app/api/health/route.ts`, `scripts/phase0-smoke.ts`

Non-null assertions (`!`) added to OpenAI field references after Zod widened them to optional. `?? null` coercion added to the health route's MGTI reachability probe so it skips cleanly under `LLM_PROVIDER=anthropic`.

### New tests — 29 added

- `src/llm/__tests__/anthropicAdapter.test.ts` — 17 tests:
  - Happy path (response shape, URL/headers, body shape, usage null fallback)
  - Guardrail intervention (RefusalError, no retry)
  - Schema-reject retry (JSON parse failure, Ajv failure, two-strikes-out)
  - HTTP error mapping (401, 403, 500, 404, no-retry)
  - AbortSignal (pre-aborted, mid-flight)
  - Env config respected (custom max_tokens, temperature, anthropic_version)
- `src/config/__tests__/env.test.ts` — 12 new tests:
  - Default `LLM_PROVIDER` is `'openai'`
  - Anthropic vars parse cleanly without OpenAI vars
  - Defaults for `ANTHROPIC_VERSION` / `ANTHROPIC_MAX_TOKENS` / `ANTHROPIC_TEMPERATURE`
  - Coercion of string env values
  - Rejection of missing required Anthropic fields
  - Rejection of non-URL `ANTHROPIC_BASE_URL`
  - Rejection of `ANTHROPIC_TEMPERATURE > 1`
  - Backward compat: openai-mode still rejects missing OpenAI fields

## Operator switch-on procedure

```powershell
# On D:\kbroles\.env.production:
LLM_PROVIDER=anthropic
ANTHROPIC_BASE_URL=https://int.nasa.apis.mmc.com/coreapi/llm/anthropic/v1
ANTHROPIC_API_KEY=<x-api-key from Hubble>
ANTHROPIC_MODEL=eu.anthropic.claude-sonnet-4-5-20250929-v1:0
# ANTHROPIC_VERSION, ANTHROPIC_MAX_TOKENS, ANTHROPIC_TEMPERATURE → leave blank to use defaults

# Then restart the service:
schtasks /end /tn KbAssistant
schtasks /run /tn KbAssistant

# Verify in /api/health logs — first /api/chat request will hit the Anthropic adapter.
```

To switch back to OpenAI: delete or set `LLM_PROVIDER=openai`, restart. No code change, no rebuild.

## Critical gap (carrying forward)

The MGTI Anthropic proxy spec does NOT document `tools` / structured-output support. The OpenAI path's `response_format: { type: 'json_schema', strict: true }` enforcement is unavailable on the Anthropic path. This adapter relies on:

- Prompt-only discipline (the system prompt is identical across providers; the verbatim-quote rule strengthening from quick-006 applies to both)
- Ajv post-validation with one retry on schema reject

If the MGTI Core API team adds `tools` support to the Anthropic proxy in a future release, this adapter should be revisited to use it — it would restore the defense-in-depth backstop that exists on the OpenAI primary path today.

## Operator pre-integration checks

Before the operator flips `LLM_PROVIDER=anthropic` on prod:

1. **Provision the MGTI Anthropic API key** via the YAML PR + Hubble flow described in the MGTI spec (page 5). App name must be lower-kebab-case (e.g. `mmc-kbroles`).
2. **Pick the regional endpoint** — `int.nasa.apis.mmc.com` (production NASA) for US-based operator, or the EMEA/staging variants for other paths. Spec page 3 has the full table.
3. **Verify the model name** is on the allowed list. Currently the spec lists 5 models (Opus 4.6, Sonnet 4.6, Opus 4.5, Sonnet 4.5, Haiku 4.5). All require the `eu.` prefix per current proxy config.
4. **Smoke test on staging first** — fire 3-5 requests through the new path and watch for guardrail false-positives on SOP content. The `flips: [...]` telemetry from quick-004 doesn't apply here (no validator strips on the citation contract side since the validator runs the same way), but the route's `fallback_trigger` events will surface refusals if guardrails intervene.

## Confirmed invariants

- `git diff HEAD~1 HEAD -- src/grounding/` is empty — the grounding stack is provider-agnostic.
- `git diff HEAD~1 HEAD -- src/app/api/chat/route.ts` is empty — route handlers don't see the provider switch.
- No new package.json dependencies.
- Pino logger forbidden-substrings invariant still holds (the new adapter logs nothing — uses console-free fetch).
- `pnpm typecheck` clean.
- `pnpm test` — 762/762 (was 733; +29).

## Deviations from plan

None — implementation followed the plan exactly. Effort came in at ~1.5 hours vs the 3-day estimate from the lift analysis, primarily because:

1. The existing test patterns and Zod schema design accommodated the new fields cleanly.
2. The OpenAI path's `json_object` + Ajv fallback was already a near-perfect template for the Anthropic JSON-discipline path.
3. No new dependencies needed (direct fetch).

## Push status

To be pushed by orchestrator after this commit lands.

## Follow-up

- **Live benchmark** — fire the failing Author chip 10× against Claude Sonnet 4.5 via the new adapter once the operator provisions the MGTI Anthropic key. Compare pass rate to the gpt-4o (full) baseline (7/10 on the same chip per quick-006). Belongs in a separate follow-up, not part of this code-only quick task.
- **MGTI tools support** — informal monitoring of the MGTI Anthropic proxy release notes. If `tools` becomes available, revisit this adapter to add the JSON Schema strict-mode backstop that the OpenAI path enjoys.
- **HTTP-level retry** — the adapter does NOT retry on 429/5xx today. Route-side `UPSTREAM_TOTAL_TIMEOUT_MS` bounds worst-case waits. If pilot traffic surfaces throttling pain, port the OpenAI path's `withRetry` wrapper to a shared utility consumed by both adapters.
