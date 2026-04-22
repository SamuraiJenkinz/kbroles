#!/usr/bin/env tsx
/**
 * Phase-0 smoke harness.
 *
 * Runs the five Phase-0 checks against either the dev OpenAI endpoint or the
 * MGTI corporate ingress, using createLlmClient() + streamAnswer() — the same
 * code path the Phase 2 /api/chat route will use in production.
 *
 * Usage:
 *   pnpm smoke -- --mode=dev
 *   pnpm smoke -- --mode=prod
 *
 * Environment:
 *   LLM_AUTH_MODE, LLM_BASE_URL, LLM_API_KEY, LLM_MODEL set per .env.example
 *   NODE_EXTRA_CA_CERTS (prod mode only) set in SHELL ENV before Node starts.
 *
 * Exit codes:
 *   0 — all exercised checks passed
 *   1 — any check failed (see stderr for per-check remediation)
 *   2 — env validation or CLI parse error
 */

import { createLlmClient } from '@/llm/client'
import { streamAnswer, type ChatMessage } from '@/llm/stream'
import { composeSystemPrompt } from '@/grounding/systemPrompt'
import { validateCitations } from '@/grounding/validator'
import { REGISTRY } from '@/grounding/registry'
import { env, __resetEnvCacheForTests } from '@/config/env'
import { CITATION_SCHEMA } from '@/grounding/schema'

export type Mode = 'dev' | 'prod'

export interface CliOptions {
  mode: Mode
}

export function parseCliArgs(argv: string[]): CliOptions {
  const modeArg = argv.find(a => a.startsWith('--mode='))?.split('=')[1]
  if (modeArg !== 'dev' && modeArg !== 'prod') {
    throw new Error(`Missing or invalid --mode= argument (got: ${String(modeArg)}). Use --mode=dev or --mode=prod.`)
  }
  return { mode: modeArg }
}

export interface SmokeResult {
  name: string
  status: 'PASS' | 'FAIL' | 'SKIP'
  evidence: Record<string, unknown>
  remediation?: string
}

function log(res: SmokeResult): void {
  const prefix = res.status === 'PASS' ? '✓' : res.status === 'FAIL' ? '✗' : '·'
  // eslint-disable-next-line no-console
  console.log(`${prefix} [${res.status}] ${res.name}`)
  // eslint-disable-next-line no-console
  console.log('   evidence:', JSON.stringify(res.evidence, null, 2))
  if (res.remediation) {
    // eslint-disable-next-line no-console
    console.log('   remediation:', res.remediation)
  }
}

/**
 * Smoke 1: baseURL suffix.
 * Minimal non-streaming chat completion. Proves the URL resolves and auth
 * works. Uses a direct SDK call (bypassing our schema-strict wrapper) to
 * isolate transport/auth from schema-strict-mode concerns.
 */
async function smoke1_baseURL(client: ReturnType<typeof createLlmClient>): Promise<SmokeResult> {
  const e = env()
  try {
    // Direct SDK call (bypassing our schema-strict wrapper) — minimises variables.
    const completion = await client.chat.completions.create({
      model: e.LLM_MODEL,
      messages: [
        { role: 'system', content: 'You are a test echo. Reply in one short sentence.' },
        { role: 'user', content: 'respond with a short test acknowledgement' },
      ],
      max_tokens: 50,
    })
    const content = completion.choices?.[0]?.message?.content
    return {
      name: 'Smoke 1: baseURL suffix + auth',
      status: content ? 'PASS' : 'FAIL',
      evidence: {
        baseURL: e.LLM_BASE_URL,
        model: e.LLM_MODEL,
        responseSnippet: typeof content === 'string' ? content.slice(0, 120) : '(empty)',
      },
      remediation: content ? undefined : 'Check LLM_BASE_URL + LLM_API_KEY + auth mode.',
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    // Check for CA chain failure — Smoke 5 signals via this error pattern.
    const isCaFailure = msg.includes('UNABLE_TO_VERIFY_LEAF_SIGNATURE') ||
                       msg.includes('unable to verify the first certificate')
    return {
      name: 'Smoke 1: baseURL suffix + auth',
      status: 'FAIL',
      evidence: { baseURL: e.LLM_BASE_URL, error: msg },
      remediation: isCaFailure
        ? 'CA chain failure — see Smoke 5. Set NODE_EXTRA_CA_CERTS in SHELL ENV (not .env) pointing to MMC corporate CA bundle PEM.'
        : `On 404/405, try alternative path suffixes: /coreapi/openai, /coreapi/openai/, /coreapi/openai/v1. Update LLM_BASE_URL and retry.`,
    }
  }
}

/**
 * Smoke 2: json_schema strict mode.
 * Full streamAnswer() call with the real composed system prompt + citation
 * schema. Asserts the response is shape-valid KbResponse.
 */
async function smoke2_strictSchema(client: ReturnType<typeof createLlmClient>): Promise<SmokeResult> {
  try {
    const systemPrompt = composeSystemPrompt('author')
    const messages: ChatMessage[] = [
      { role: 'user', content: '<user>What goes in the Short description field?</user>' },
    ]
    const result = await streamAnswer({
      client, systemPrompt, messages, strictSchemaSupported: true,
    })
    // Plan 2-03 Task 3.1: streamAnswer now returns {response, usage}. Unwrap
    // the response for the existing shape-check logic; usage is available for
    // future Phase-2 smoke enhancements that want to assert prompt/completion
    // token bounds against the CONTEXT §5 log contract.
    const response = result.response
    // Shape checks (not Ajv — we asserted those in Plan 01; here we just want to know
    // the endpoint returned json_schema-conforming data).
    const ok =
      typeof response.can_answer === 'boolean' &&
      typeof response.answer === 'string' &&
      Array.isArray(response.citations)
    // Also run through the validator to prove end-to-end: even if the model
    // hallucinates, the validator catches it. Which branch fires is evidence.
    const validated = validateCitations(response, REGISTRY)
    return {
      name: 'Smoke 2: response_format json_schema strict',
      status: ok ? 'PASS' : 'FAIL',
      evidence: {
        can_answer: response.can_answer,
        answer_preview: response.answer.slice(0, 120),
        citation_count_model: response.citations.length,
        citation_count_validated: validated.citations.length,
        validator_flips: validated._flips.length,
        enum_first_source: CITATION_SCHEMA.properties.citations.items
          ? 'locked'
          : 'unknown',
      },
      remediation: ok ? undefined : 'Strict mode not honoured. Set STRICT_SCHEMA_SUPPORTED=false and re-run — streamAnswer will fall back to json_object + Ajv.',
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      name: 'Smoke 2: response_format json_schema strict',
      status: 'FAIL',
      evidence: { error: msg },
      remediation: 'Strict mode rejected or schema invalid. Set STRICT_SCHEMA_SUPPORTED=false and retry via the Ajv fallback path.',
    }
  }
}

/**
 * Smoke 3: streaming chunk cadence.
 * stream: true + max_tokens ~ 600 to force > 10 chunks on a ~500-token
 * response. Measures first-chunk latency and P95 inter-chunk latency.
 * PASS = P95 < 500ms AND chunkCount > 10.
 */
async function smoke3_streamingCadence(client: ReturnType<typeof createLlmClient>): Promise<SmokeResult> {
  const e = env()
  try {
    const systemPrompt = composeSystemPrompt('author')
    const start = Date.now()
    const stream = await client.chat.completions.create({
      model: e.LLM_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: '<user>Summarise the article naming convention in detail, with a worked example for each of the four parts.</user>' },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'kb_response', strict: true, schema: CITATION_SCHEMA as Record<string, unknown> },
      },
      stream: true,
      max_tokens: 600,
    })

    const times: number[] = []
    let prev = Date.now()
    let firstChunkLatency: number | null = null
    for await (const _chunk of stream) {
      const now = Date.now()
      if (firstChunkLatency === null) firstChunkLatency = now - start
      times.push(now - prev)
      prev = now
    }
    const chunkCount = times.length
    const sorted = [...times].sort((a, b) => a - b)
    const p95 = sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : 0

    const pass = p95 < 500 && chunkCount > 10
    return {
      name: 'Smoke 3: streaming chunk cadence',
      status: pass ? 'PASS' : 'FAIL',
      evidence: {
        chunkCount,
        firstChunkLatencyMs: firstChunkLatency,
        p95InterChunkMs: p95,
        threshold: 'PASS if p95 < 500ms AND chunkCount > 10',
      },
      remediation: pass
        ? undefined
        : 'APIM likely buffering. Non-blocking for Phase 1 close; document remediation for Phase 2 (may need non-streaming fallback on /api/chat).',
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      name: 'Smoke 3: streaming chunk cadence',
      status: 'FAIL',
      evidence: { error: msg },
      remediation: 'Cadence test failed. Non-blocking for Phase 1; Phase 2 streaming plan needs to decide fallback strategy.',
    }
  }
}

/**
 * Smoke 4: Entra SPA + brk-multihub:// consent.
 * DEFERRED to Phase 5. This runner emits a SKIP with a pointer.
 */
function smoke4_entra(): SmokeResult {
  return {
    name: 'Smoke 4: Entra SPA + brk-multihub:// consent',
    status: 'SKIP',
    evidence: {
      note: 'Deferred to Phase 5 (SSO & Teams Delivery). Phase 1 only documents the manual checklist; no code exercises this path.',
      manualChecklistLocation: 'docs/phase-0-smoke.md Smoke 4 section',
    },
  }
}

/**
 * Smoke 5: corporate CA chain.
 * This is implicit in Smokes 1/2/3 when --mode=prod. If any of those threw
 * UNABLE_TO_VERIFY_LEAF_SIGNATURE, that is the Smoke 5 failure.
 * In --mode=dev this is SKIP (CA not involved hitting api.openai.com with
 * public CAs already in the Node trust store).
 */
function smoke5_caChain(mode: Mode, prior: SmokeResult[]): SmokeResult {
  if (mode === 'dev') {
    return {
      name: 'Smoke 5: corporate CA chain',
      status: 'SKIP',
      evidence: { reason: 'dev mode targets api.openai.com; public CA. Re-run --mode=prod to exercise.' },
    }
  }
  const caFailure = prior.find(r =>
    r.status === 'FAIL' &&
    typeof r.evidence.error === 'string' &&
    (String(r.evidence.error).includes('UNABLE_TO_VERIFY_LEAF_SIGNATURE') ||
     String(r.evidence.error).includes('unable to verify the first certificate'))
  )
  if (caFailure) {
    return {
      name: 'Smoke 5: corporate CA chain',
      status: 'FAIL',
      evidence: { detectedVia: caFailure.name, error: String(caFailure.evidence.error) },
      remediation: 'Set NODE_EXTRA_CA_CERTS to MMC corporate CA bundle PEM path in SHELL ENV (NOT in .env — Node reads it at TLS init before dotenv runs). Request bundle from MMC platform team.',
    }
  }
  return {
    name: 'Smoke 5: corporate CA chain',
    status: 'PASS',
    evidence: {
      note: 'No CA verification failures in Smokes 1/2/3. NODE_EXTRA_CA_CERTS either set correctly or not needed from this host.',
      NODE_EXTRA_CA_CERTS: process.env.NODE_EXTRA_CA_CERTS ?? '(unset)',
    },
  }
}

export async function runSmokes(mode: Mode): Promise<SmokeResult[]> {
  // Reset env cache in case the caller reimports across modes.
  __resetEnvCacheForTests()
  const client = createLlmClient()

  const results: SmokeResult[] = []
  const r1 = await smoke1_baseURL(client)
  results.push(r1)

  // Smoke 2 and 3 depend on Smoke 1 passing.
  if (r1.status === 'PASS') {
    results.push(await smoke2_strictSchema(client))
    results.push(await smoke3_streamingCadence(client))
  } else {
    results.push({
      name: 'Smoke 2: response_format json_schema strict',
      status: 'SKIP',
      evidence: { reason: 'Smoke 1 failed; skipping dependent check.' },
    })
    results.push({
      name: 'Smoke 3: streaming chunk cadence',
      status: 'SKIP',
      evidence: { reason: 'Smoke 1 failed; skipping dependent check.' },
    })
  }

  results.push(smoke4_entra())
  results.push(smoke5_caChain(mode, results))
  return results
}

async function main(): Promise<void> {
  let opts: CliOptions
  try {
    opts = parseCliArgs(process.argv.slice(2))
  } catch (err: unknown) {
    // eslint-disable-next-line no-console
    console.error((err as Error).message)
    process.exit(2)
  }
  // eslint-disable-next-line no-console
  console.log(`\n=== Phase-0 Smoke Harness (mode=${opts.mode}) ===\n`)
  try {
    const results = await runSmokes(opts.mode)
    results.forEach(log)
    const failed = results.filter(r => r.status === 'FAIL')
    // eslint-disable-next-line no-console
    console.log(`\n=== Summary: ${results.filter(r => r.status === 'PASS').length} PASS, ${failed.length} FAIL, ${results.filter(r => r.status === 'SKIP').length} SKIP ===`)
    if (failed.length > 0) {
      // eslint-disable-next-line no-console
      console.log('\nUpdate docs/phase-0-smoke.md with this run\'s evidence before re-attempting failed checks.')
      process.exit(1)
    }
    // eslint-disable-next-line no-console
    console.log('\nAll exercised checks passed. Attach this run\'s evidence to docs/phase-0-smoke.md and commit.')
  } catch (err: unknown) {
    // eslint-disable-next-line no-console
    console.error('Smoke runner crashed:', err)
    process.exit(1)
  }
}

// Only run if invoked directly (not when imported by tests)
// Works in ESM: import.meta.url vs process.argv[1].
// On Windows with tsx, import.meta.url is typically `file:///C:/kbroles/scripts/phase0-smoke.ts`
// while process.argv[1] is `C:\kbroles\scripts\phase0-smoke.ts`. The two checks below
// cover the common cross-platform cases.
const isDirectRun =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv.length > 1 &&
  (import.meta.url === `file://${process.argv[1]}` ||
   import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/')))
if (isDirectRun) {
  void main()
}
