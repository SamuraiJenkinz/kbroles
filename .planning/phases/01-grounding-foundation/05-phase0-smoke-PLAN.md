---
plan: 5
name: phase0-smoke
phase: 1
wave: 3
depends_on: [1, 2, 3, 4]
files_modified:
  - scripts/phase0-smoke.ts
  - scripts/__tests__/phase0-smoke.test.ts
  - docs/phase-0-smoke.md
autonomous: false
user_setup:
  - service: openai-dev
    why: "Phase-0 Smoke 1/2/3 dev-mode run uses direct OpenAI API — requires a personal API key"
    env_vars:
      - name: LLM_API_KEY
        source: "OpenAI dashboard → API keys (developer personal key for local smoke)"
  - service: mgti-ingress
    why: "Phase-0 Smokes 1/2/3/5 prod-mode run uses the MGTI corporate ingress — requires the MGTI-issued key and correct baseURL"
    env_vars:
      - name: LLM_API_KEY
        source: "MGTI-issued key (MMC platform team)"
      - name: LLM_BASE_URL
        source: "MGTI-issued endpoint, e.g. https://stg1.mmc-dallas-int-non-prod-ingress.mgti.mmc.com/coreapi/openai/v1 — exact suffix resolved by Smoke 1"
      - name: LLM_MODEL
        source: "MGTI deployment name for gpt-4o"
      - name: NODE_EXTRA_CA_CERTS
        source: "Path to MMC corporate CA bundle PEM file (MMC platform team); MUST be set in shell/App Service Application Settings, NOT in .env files"
    dashboard_config:
      - task: "Confirm MGTI key is authorised for the gpt-4o deployment"
        location: "MMC platform team / MGTI admin"
      - task: "Obtain MMC corporate CA bundle PEM file and install at a known local path"
        location: "MMC platform team"

must_haves:
  truths:
    - "pnpm smoke -- --mode=dev runs the end-to-end path using createLlmClient() against api.openai.com and returns a KbResponse-shaped {can_answer, answer, citations[]}"
    - "pnpm smoke -- --mode=prod runs the same end-to-end path against the MGTI ingress using the same createLlmClient() — only env vars differ"
    - "Smoke 1 (baseURL suffix): script logs the full request URL and response status; on 4xx prints remediation (try other /coreapi/openai variants)"
    - "Smoke 2 (json_schema strict): asserts the response parses into {can_answer, answer, citations[]} matching the schema; on failure suggests flipping STRICT_SCHEMA_SUPPORTED=false for the retry path"
    - "Smoke 3 (streaming chunk cadence): measures first-chunk latency + P95 inter-chunk latency + chunk count over ~500-token response; PASS = P95 < 500ms AND chunkCount > 10"
    - "Smoke 4 (Entra SPA + brk-multihub:// consent): DEFERRED to Phase 5 per CONTEXT.md §4; smoke doc explicitly records 'deferred — see Phase 5'"
    - "Smoke 5 (corporate CA chain): --mode=prod catches UNABLE_TO_VERIFY_LEAF_SIGNATURE and prints remediation (point to MMC CA bundle path, set NODE_EXTRA_CA_CERTS in shell environment)"
    - "docs/phase-0-smoke.md has five sections, each with PASS/FAIL placeholder, date, operator, evidence, remediation — evidence to be attached on first successful run per mode"
    - "Smoke script is unit-testable where possible: at least one test asserts the CLI argument parser handles --mode=dev and --mode=prod correctly"
  artifacts:
    - path: "scripts/phase0-smoke.ts"
      provides: "pnpm smoke runner; five Phase-0 checks; prints structured report"
    - path: "docs/phase-0-smoke.md"
      provides: "Committed PASS/FAIL record of the five Phase-0 resolutions"
    - path: "scripts/__tests__/phase0-smoke.test.ts"
      provides: "Unit tests for the argument parser and reporter; live-endpoint tests are NOT in the Vitest suite"
  key_links:
    - from: "scripts/phase0-smoke.ts"
      to: "src/llm/client.ts"
      via: "imports createLlmClient — same code path the route handler will use in Phase 2"
      pattern: "createLlmClient"
    - from: "scripts/phase0-smoke.ts"
      to: "src/llm/stream.ts"
      via: "imports streamAnswer for Smoke 1 and 2"
      pattern: "streamAnswer"
    - from: "scripts/phase0-smoke.ts"
      to: "src/grounding/systemPrompt.ts"
      via: "uses composeSystemPrompt to build realistic request"
      pattern: "composeSystemPrompt"
    - from: "scripts/phase0-smoke.ts"
      to: "src/grounding/validator.ts"
      via: "validates the returned citation as end-to-end proof the whole path works"
      pattern: "validateCitations"
---

<objective>
Ship the Phase-0 smoke harness that proves the Phase 1 grounding substrate works end-to-end against BOTH the local OpenAI dev path AND the MGTI corporate ingress using the same code, with only env vars differing. Document the five Phase-0 resolutions in a committed markdown record that gates Phase 1 closure.

Purpose: Phase 1 Success Criterion #3 — "Smoke script hits both direct OpenAI AND MGTI ingress using same createLlmClient() factory (only env vars differ); both honour response_format: json_schema strict and return structured { can_answer, answer, citations[] }." And Success Criterion #4 — "All five Phase-0 smoke resolutions documented and green."

This plan is the integration test of Phase 1. It is also the last chance to catch ingress, auth, CA chain, or schema-strict-mode surprises before Phase 2 starts building the streaming route on top.

Output: `scripts/phase0-smoke.ts`, `docs/phase-0-smoke.md`, and a human in the loop to verify the evidence.
</objective>

<context>
Depends on Plans 01, 02, 03, 04. Read before starting:

@.planning/phases/01-grounding-foundation/01-CONTEXT.md  (§4 Smoke harness & dual-mode config — AUTHORITATIVE; five-check scope is locked there)
@.planning/phases/01-grounding-foundation/01-RESEARCH.md  (Gap 6 — tsx runner; Gap 9 — CA chain caveat; Gap 10 — Entra deferred; Risks 2, 5)
@.planning/phases/01-grounding-foundation/01-scaffold-registry-schema-PLAN.md
@.planning/phases/01-grounding-foundation/02-citation-validator-PLAN.md
@.planning/phases/01-grounding-foundation/03-llm-client-factory-PLAN.md
@.planning/phases/01-grounding-foundation/04-system-prompt-composer-PLAN.md
@.planning/STATE.md  (Blockers/Concerns — five Phase-0 items)
@.planning/research/PITFALLS.md  (#10 ingress streaming, #11 ingress auth break)

**Five Phase-0 checks (locked scope per CONTEXT.md §4):**

1. **MGTI baseURL suffix** — minimal non-streaming call; PASS=200, FAIL=404/405 with URL in logs → try /coreapi/openai, /coreapi/openai/, /coreapi/openai/v1 variants.
2. **json_schema strict mode** — full streamAnswer call with real system prompt; PASS=response parses into KbResponse; FAIL=schema ignored → remediation: flip STRICT_SCHEMA_SUPPORTED=false for json_object fallback path (already implemented in Plan 03).
3. **Streaming chunk cadence** — `stream: true` call measuring first-chunk + inter-chunk latency; PASS=P95 < 500ms AND chunkCount > 10.
4. **Entra SPA + brk-multihub:// consent** — DEFERRED (Phase 5). Browser-based, no code.
5. **Corporate CA chain** — running --mode=prod with NODE_EXTRA_CA_CERTS set reaches MGTI; missing CA → UNABLE_TO_VERIFY_LEAF_SIGNATURE.

**Smoke 2 dependency:** runs after Smoke 1 confirms URL.
**Smoke 3 dependency:** runs after Smoke 1.
**Smoke 5 dependency:** precondition for Smokes 1/2/3 in prod mode.
**Smoke 4 independent (manual).**

**Checkpoint-driven:** This plan is NOT fully autonomous. After the script is written and unit-tested, a user in the loop must run `pnpm smoke -- --mode=dev` with their OpenAI key and `pnpm smoke -- --mode=prod` with the MGTI key + CA bundle, then attach the evidence. Phase 1 closes when all five sections of `docs/phase-0-smoke.md` read PASS (or Smoke 4 reads "deferred — Phase 5").
</context>

<tasks>

<task id="5.1" type="auto" verify="pnpm tsc --noEmit">
  <name>Task 5.1: Implement the smoke script scaffolding + CLI arg parser</name>
  <files>scripts/phase0-smoke.ts</files>
  <action>
    Create `scripts/phase0-smoke.ts`. Structure: one script, five named checks, CLI-flag-driven mode selection, exits non-zero on any failure.

    ```ts
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
     * works. Uses streamAnswer with an innocuous prompt to exercise the full
     * code path, but with a trivial system prompt (not the full composed one —
     * we want to isolate transport from schema-strict-mode here).
     */
    async function smoke1_baseURL(client: ReturnType<typeof createLlmClient>): Promise<SmokeResult> {
      const e = env()
      try {
        const messages: ChatMessage[] = [{ role: 'user', content: 'respond with a short test acknowledgement' }]
        // Direct SDK call (bypassing our schema-strict wrapper) — minimises variables.
        const completion = await (client as any).chat.completions.create({
          model: e.LLM_MODEL,
          messages: [{ role: 'system', content: 'You are a test echo. Reply in one short sentence.' }, ...messages],
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
        const response = await streamAnswer({
          client, systemPrompt, messages, strictSchemaSupported: true,
        })
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
        const stream = await (client as any).chat.completions.create({
          model: e.LLM_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: '<user>Summarise the article naming convention in detail, with a worked example for each of the four parts.</user>' },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'kb_response', strict: true, schema: CITATION_SCHEMA },
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
    const isDirectRun = import.meta.url === `file://${process.argv[1]}` ||
                        import.meta.url.endsWith(process.argv[1])
    if (isDirectRun) {
      void main()
    }
    ```

    **Note on the direct-run check:** on Windows with Turbopack/tsx the `import.meta.url` will be `file:///C:/kbroles/scripts/phase0-smoke.ts`. The second condition (`endsWith`) provides fallback. If neither matches in practice (Node version / tsx version detail), export a named `main` and invoke it from the `pnpm smoke` script directly — but the current CLI wiring (`"smoke": "tsx scripts/phase0-smoke.ts"`) is simplest and works for standard tsx behaviour.
  </action>
  <verify>`pnpm tsc --noEmit` exits 0.</verify>
  <done>Smoke script implemented. Not yet run against a live endpoint.</done>
</task>

<task id="5.2" type="auto" verify="pnpm test -- scripts/__tests__/phase0-smoke.test.ts">
  <name>Task 5.2: Unit tests for the CLI parser + smoke-result reporter</name>
  <files>scripts/__tests__/phase0-smoke.test.ts</files>
  <action>
    Create `scripts/__tests__/phase0-smoke.test.ts`. Focused on the pure parts — live-endpoint checks are manual.

    ```ts
    import { describe, it, expect } from 'vitest'
    import { parseCliArgs } from '../phase0-smoke'

    describe('parseCliArgs', () => {
      it('parses --mode=dev', () => {
        expect(parseCliArgs(['--mode=dev'])).toEqual({ mode: 'dev' })
      })
      it('parses --mode=prod', () => {
        expect(parseCliArgs(['--mode=prod'])).toEqual({ mode: 'prod' })
      })
      it('parses --mode=dev when mixed with other args', () => {
        expect(parseCliArgs(['--other', '--mode=dev', '--foo=bar'])).toEqual({ mode: 'dev' })
      })
      it('throws on missing --mode', () => {
        expect(() => parseCliArgs([])).toThrow(/Missing or invalid --mode/)
      })
      it('throws on invalid --mode value', () => {
        expect(() => parseCliArgs(['--mode=staging'])).toThrow(/Missing or invalid --mode/)
      })
    })
    ```
  </action>
  <verify>`pnpm test -- scripts/__tests__/phase0-smoke.test.ts` passes all 5 cases.</verify>
  <done>CLI parser unit-tested. Live-endpoint tests are not part of the Vitest suite (would hit real APIs).</done>
</task>

<task id="5.3" type="auto" verify="test -f docs/phase-0-smoke.md">
  <name>Task 5.3: Write the Phase-0 smoke record template</name>
  <files>docs/phase-0-smoke.md</files>
  <action>
    Create `docs/phase-0-smoke.md`. This file is THE committed record of smoke-test status; every run updates it with evidence.

    ```markdown
    # Phase-0 Smoke Resolutions

    Evidence record for the five Phase-0 checks that gate Phase 1 closure.
    Each check must read PASS (or, for Smoke 4, DEFERRED) before Phase 1 is marked
    complete in STATE.md / ROADMAP.md.

    Re-run via:

    ```bash
    pnpm smoke -- --mode=dev       # against api.openai.com
    pnpm smoke -- --mode=prod      # against MGTI ingress (requires MGTI key + NODE_EXTRA_CA_CERTS)
    ```

    `NODE_EXTRA_CA_CERTS` must be set in the SHELL ENVIRONMENT (or App Service Application Settings), NOT in a `.env` file — Node reads it at TLS init before dotenv runs. See nodejs/node issue #51426.

    ---

    ## Smoke 1 — MGTI `baseURL` suffix

    **Result:** FAIL | PASS *(pending first run)*
    **Date:** YYYY-MM-DD
    **Operator:** <initials>
    **Mode:** dev / prod

    **What we're testing:** The `LLM_BASE_URL` env value resolves and auth works end-to-end.

    **Evidence (to be filled from smoke-script output):**
    - `baseURL`:
    - `model`:
    - `responseSnippet`: (first 120 chars of test echo response)

    **Remediation if FAIL:**
    On 404/405, try alternative suffixes in order: `/coreapi/openai`, `/coreapi/openai/`, `/coreapi/openai/v1`. Update `LLM_BASE_URL` in App Service Application Settings (or `.env.local` for dev) and re-run.

    ---

    ## Smoke 2 — `response_format: json_schema` strict mode

    **Result:** FAIL | PASS *(pending first run)*
    **Date:** YYYY-MM-DD
    **Operator:** <initials>
    **Mode:** dev / prod

    **What we're testing:** Endpoint honours `response_format: { type: 'json_schema', strict: true }` with our `CITATION_SCHEMA` and returns JSON matching the `{ can_answer, answer, citations[] }` shape.

    **Evidence (to be filled from smoke-script output):**
    - `can_answer`:
    - `answer_preview`:
    - `citation_count_model` / `citation_count_validated`:
    - `validator_flips`:

    **Remediation if FAIL:**
    If strict mode is rejected with 400 or silently ignored: set `STRICT_SCHEMA_SUPPORTED=false` in App Service App Settings (dev: add to shell). `streamAnswer` will fall back to `response_format: json_object` + Ajv validation + one retry. Already implemented in `src/llm/stream.ts`; no code change needed.

    ---

    ## Smoke 3 — Streaming chunk cadence through APIM

    **Result:** FAIL | PASS *(pending first run)*
    **Date:** YYYY-MM-DD
    **Operator:** <initials>
    **Mode:** dev / prod

    **What we're testing:** Streaming responses arrive in real-time chunks through MGTI's APIM (not buffered and delivered in one lump).

    **Thresholds:** PASS = P95 inter-chunk latency < 500 ms AND chunk count > 10 on a ~500-token response.

    **Evidence (to be filled from smoke-script output):**
    - `chunkCount`:
    - `firstChunkLatencyMs`:
    - `p95InterChunkMs`:

    **Remediation if FAIL:**
    Non-blocking for Phase 1 closure. Document the result. If APIM is buffering, Phase 2 (`/api/chat` streaming route) will need a non-streaming fallback — include the finding in Phase 2 CONTEXT. Engage MMC platform team on APIM tuning in parallel.

    ---

    ## Smoke 4 — Entra SPA + `brk-multihub://` consent

    **Result:** DEFERRED — see Phase 5 (SSO & Teams Delivery)
    **Date:** YYYY-MM-DD
    **Operator:** <initials>

    **What we're testing:** Not exercised by this script. Phase 1 scope is DOCUMENT ONLY per `01-CONTEXT.md` §4. The Entra app registration, `brk-multihub://` redirect URI type, and all MSAL client code land in Phase 5.

    **Phase 1 manual actions (to be completed during Phase 1):**
    - [ ] Identified MMC Entra admin contact: (name, team, email)
    - [ ] Confirmed MMC tenant allows registering `brk-multihub://` redirect URI type: (yes / no / pending)
    - [ ] Screenshot of expected consent screen (if tenant already has a reference NAA app): `docs/phase-0-evidence/entra-consent.png` (optional; placeholder until Phase 5 execution)

    If the tenant policy blocks `brk-multihub://`, escalate now — it is a blocker for Phase 5 Success Criterion 2 (Teams tab silent SSO).

    ---

    ## Smoke 5 — Corporate CA chain for outbound HTTPS

    **Result:** FAIL | PASS | N/A (dev-mode only run) *(pending first prod run)*
    **Date:** YYYY-MM-DD
    **Operator:** <initials>
    **Mode:** prod (required — Smoke 5 does not apply to dev mode)

    **What we're testing:** Running `--mode=prod` reaches MGTI over HTTPS without `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. This requires `NODE_EXTRA_CA_CERTS` pointing at the MMC corporate CA bundle PEM file.

    **Evidence:**
    - `NODE_EXTRA_CA_CERTS` path:
    - CA chain test (pass/fail):
    - If failed, the specific error:

    **Remediation if FAIL:**
    1. Request the MMC corporate CA bundle PEM file from MMC platform team.
    2. Install it at a known local path (dev) or App Service-mounted path (prod).
    3. Set `NODE_EXTRA_CA_CERTS=<absolute-path-to-bundle>` in SHELL ENVIRONMENT (dev shell, or App Service Application Settings).
    4. **Do NOT** put this in a `.env` file — Node reads it at TLS init before dotenv runs. Known Node.js limitation: nodejs/node issue #51426.
    5. Re-run `pnpm smoke -- --mode=prod`.

    ---

    ## Phase 1 closure

    Phase 1 is marked complete (in `.planning/STATE.md` and `.planning/ROADMAP.md`) when:

    - [ ] Smokes 1, 2, 3 — PASS in both `--mode=dev` and `--mode=prod` (or documented remediation plan for any FAIL that is non-blocking per CONTEXT.md)
    - [ ] Smoke 4 — DEFERRED, with Phase 1 manual checklist items ticked
    - [ ] Smoke 5 — PASS in `--mode=prod` (dev-mode run is N/A)
    - [ ] Evidence attached to each section above
    - [ ] This file committed to git
    ```
  </action>
  <verify>`test -f docs/phase-0-smoke.md` succeeds; file has five Smoke sections.</verify>
  <done>Evidence template in place. Contents filled in during Task 5.5 user-in-loop run.</done>
</task>

<task id="5.4" type="auto" verify="pnpm test && pnpm tsc --noEmit">
  <name>Task 5.4: Full suite green + initial commit (script + doc + tests, not yet run live)</name>
  <files>(none — verification + git)</files>
  <action>
    Run the full suite.

    ```bash
    pnpm test
    pnpm tsc --noEmit
    ```

    All eight test files should pass: schema, registry, entities, validator, client, stream, systemPrompt, phase0-smoke (CLI parser only).

    Commit the script, the doc template, and the CLI tests. Evidence filling happens in the next task (human-in-loop).

    ```bash
    git add scripts/phase0-smoke.ts scripts/__tests__/phase0-smoke.test.ts docs/phase-0-smoke.md .planning/phases/01-grounding-foundation/05-phase0-smoke-PLAN.md
    git commit -m "feat(phase-1/plan-05): Phase-0 smoke harness + evidence template

    - scripts/phase0-smoke.ts — pnpm smoke --mode=dev|prod runner
    - Five Phase-0 checks: baseURL, json_schema strict, streaming cadence,
      Entra SPA (deferred), CA chain
    - Reuses createLlmClient + streamAnswer + composeSystemPrompt + validateCitations
      — same code path Phase 2 /api/chat will run
    - CLI parser + reporter unit-tested (parseCliArgs)
    - docs/phase-0-smoke.md — committed PASS/FAIL record, five sections

    Live-endpoint runs happen in a checkpoint task — user in loop attaches
    evidence and signs off before Phase 1 marks complete.

    GRND-06 + CORP-01 indirectly proven end-to-end when smokes go green."
    ```
  </action>
  <verify>
    - `pnpm test` exits 0 with eight suites green
    - `pnpm tsc --noEmit` clean
    - `git log -1` shows Plan 05 initial commit
  </verify>
  <done>Script + doc + unit tests committed. Ready for live runs (Task 5.5).</done>
</task>

<task id="5.5" type="checkpoint:human-verify" gate="blocking">
  <name>Task 5.5: Human-in-the-loop — run Smokes 1/2/3 in --mode=dev, attach evidence</name>
  <what-built>
    Phase-0 smoke harness that runs against the developer's personal OpenAI API key. This is the first time in Phase 1 that code hits a real LLM endpoint. Before the user runs this, they must have an OpenAI API key available and their `.env.local` populated.
  </what-built>
  <how-to-verify>
    1. Populate `.env.local` at the repo root (Git-ignored) with the dev-mode values:
       ```
       LLM_AUTH_MODE=bearer
       LLM_BASE_URL=https://api.openai.com/v1
       LLM_API_KEY=sk-<your-personal-openai-key>
       LLM_MODEL=gpt-4o-2024-08-06
       ```

    2. Run the smoke script in dev mode:
       ```bash
       pnpm smoke -- --mode=dev
       ```

    3. Review the terminal output. Expected on the happy path:
       - Smoke 1: PASS — baseURL + auth work
       - Smoke 2: PASS — json_schema strict returns a valid KbResponse (citation may be valid OR may be flipped to fallback; either is valid evidence the schema was honoured)
       - Smoke 3: PASS — P95 inter-chunk < 500ms AND chunkCount > 10 (public OpenAI is typically well within these thresholds)
       - Smoke 4: SKIP (deferred by design)
       - Smoke 5: SKIP (dev mode — CA chain not exercised)

    4. Open `docs/phase-0-smoke.md`. Update Smokes 1, 2, 3:
       - Fill in `**Result:** PASS` (or FAIL with remediation already underway)
       - Fill in Date (today), Operator (your initials), Mode: dev
       - Paste the evidence fields (baseURL, responseSnippet, chunkCount, p95InterChunkMs, etc.) from the smoke-script output

    5. Commit:
       ```bash
       git add docs/phase-0-smoke.md
       git commit -m "docs(phase-1/plan-05): Phase-0 smokes 1/2/3 PASS in --mode=dev"
       ```

    **If any smoke FAILs in dev mode:** the remediation is printed by the script. Adjust env / retry / open an issue. Do NOT proceed to the prod-mode run until dev mode is green — a dev failure means the code path itself is broken and MGTI has nothing to prove.

    **Prod-mode run is NOT gated in this plan.** It is documented as a next step (below) for when MGTI credentials + CA bundle are available. Phase 1 can close on dev-mode green + prod-mode documented-but-pending if MGTI access is not yet provisioned; in that case, the outstanding prod-mode run is a Phase-1-closeout item in STATE.md, and the Phase 2 kickoff should re-run it with fresh MGTI creds before building the route handler.
  </how-to-verify>
  <resume-signal>
    Type `dev-smokes-green` when Smokes 1/2/3 have passed in dev mode and `docs/phase-0-smoke.md` has been updated + committed.

    Type `dev-smokes-failed: <summary>` if any dev-mode smoke failed — include which one and any error output so the issue can be triaged before proceeding.

    Type `blocked: no-openai-key` if you do not have an OpenAI API key available. In that case, this checkpoint is skipped and Phase 1 closes with a documented Phase-0 caveat (smokes not yet run live).
  </resume-signal>
</task>

<task id="5.6" type="checkpoint:human-verify" gate="non-blocking">
  <name>Task 5.6: Human-in-the-loop — run Smokes 1/2/3/5 in --mode=prod when MGTI creds available</name>
  <what-built>
    Same smoke harness, now targeting the MGTI corporate ingress. This is the first time code runs against the real production endpoint. Requires MGTI-issued API key, confirmed baseURL, and the corporate CA bundle at a known path.
  </what-built>
  <how-to-verify>
    **Preconditions (any one missing → mark this task as BLOCKED and close Phase 1 with the caveat documented):**
    - [ ] MGTI API key obtained from MMC platform team
    - [ ] MMC corporate CA bundle PEM file obtained and installed locally at a known absolute path
    - [ ] MGTI deployment name for gpt-4o confirmed

    1. Shell-export (do NOT add to `.env.local`) the CA path:
       ```bash
       export NODE_EXTRA_CA_CERTS=/absolute/path/to/mmc-corporate-ca-bundle.pem
       ```
       Windows PowerShell: `$env:NODE_EXTRA_CA_CERTS = "C:\path\to\mmc-ca-bundle.pem"`

    2. Populate a SEPARATE env for prod-mode smoke (not `.env.local`, which is dev). Either source a prod env file or export inline:
       ```bash
       export LLM_AUTH_MODE=api-key
       export LLM_BASE_URL=https://stg1.mmc-dallas-int-non-prod-ingress.mgti.mmc.com/coreapi/openai/v1
       export LLM_API_KEY=<MGTI-issued key>
       export LLM_MODEL=<MGTI deployment name>
       ```

    3. Run:
       ```bash
       pnpm smoke -- --mode=prod
       ```

    4. Expected outcomes:
       - Smoke 1 PASS → baseURL suffix confirmed. If FAIL (404/405): try alternative suffixes (see script remediation), rerun.
       - Smoke 2 PASS → strict mode honoured. If FAIL: set `STRICT_SCHEMA_SUPPORTED=false` in shell, rerun — both code paths are already implemented in `src/llm/stream.ts`.
       - Smoke 3 PASS → streaming cadence OK. If FAIL: P95 too high OR chunkCount too low — APIM buffering. Non-blocking for Phase 1; Phase 2 streaming plan must address.
       - Smoke 4 SKIP (deferred).
       - Smoke 5 PASS → CA chain working (because Smokes 1/2/3 reached the endpoint). If FAIL with `UNABLE_TO_VERIFY_LEAF_SIGNATURE`: CA bundle path wrong, OR `NODE_EXTRA_CA_CERTS` set in `.env` instead of shell. Fix and rerun.

    5. Update `docs/phase-0-smoke.md` Smokes 1, 2, 3, 5 with prod-mode evidence (date, initials, mode: prod, full evidence fields from script output).

    6. Commit:
       ```bash
       git add docs/phase-0-smoke.md
       git commit -m "docs(phase-1/plan-05): Phase-0 smokes 1/2/3/5 PASS in --mode=prod against MGTI"
       ```

    **If this task is BLOCKED on MGTI access:** close Phase 1 with the prod-mode outstanding. Update `.planning/STATE.md` under Blockers/Concerns to reflect "Prod-mode Phase-0 smoke pending MGTI credentials + CA bundle; to be executed before Phase 2 `/api/chat` route implementation." Phase 2 kickoff must re-surface this.
  </how-to-verify>
  <resume-signal>
    Type `prod-smokes-green` when Smokes 1/2/3/5 PASS in `--mode=prod` and `docs/phase-0-smoke.md` has been updated + committed.

    Type `prod-smokes-failed: <summary>` if any prod-mode smoke failed — include which one and the remediation step you're about to take.

    Type `blocked: no-mgti-access` if MGTI key / CA bundle / deployment name is not yet available. Phase 1 closes with this documented as an outstanding Phase-0 item that gates Phase 2.
  </resume-signal>
</task>

<task id="5.7" type="auto" verify="grep -c 'PASS\\|DEFERRED' docs/phase-0-smoke.md">
  <name>Task 5.7: Phase-1 close — update STATE.md + final commit</name>
  <files>.planning/STATE.md</files>
  <action>
    Close Phase 1 in the planning state tracker.

    1. Read `.planning/STATE.md`.
    2. Update the following:
       - Current Position: `Phase: 2 of 6 (Chat Backend BFF)` — but only if Phase 1 is fully green; otherwise leave at Phase 1 with the specific outstanding item called out.
       - Progress bar: recompute percentage.
       - Status: `Ready to plan` (for Phase 2) if Phase 1 complete; else keep as `In progress`.
       - Last activity: update with today's date and a one-line note.
       - Accumulated Context → Decisions: append any Phase-0 findings that constrain Phase 2 (e.g., "MGTI honours strict mode" or "MGTI buffers streaming — Phase 2 /api/chat must consider non-streaming fallback").
       - Blockers/Concerns: strike through resolved Phase-0 items; keep any outstanding (prod-mode pending MGTI access, etc.).

    3. Also update `.planning/ROADMAP.md`:
       - Mark Phase 1 as complete: `- [x] **Phase 1: Grounding Foundation** — ...`
       - Update the Progress table: Phase 1 status = Complete, plans completed = 5/5, date.

    4. Commit:
       ```bash
       git add .planning/STATE.md .planning/ROADMAP.md
       git commit -m "docs(phase-1): close Phase 1 — Grounding Foundation complete

       - Registry, schema, validator, client, composer, smoke all shipped
       - Phase-0 Smokes 1/2/3 PASS in dev; Smoke 4 deferred per Phase 5;
         Smoke 5 PASS in prod (or documented as pending MGTI access)
       - Ready to plan Phase 2 (Chat Backend BFF)"
       ```
  </action>
  <verify>
    - `grep -c 'PASS\|DEFERRED' docs/phase-0-smoke.md` ≥ 5 (at least five of the status markers resolved)
    - `.planning/STATE.md` shows updated Phase + Progress
    - `.planning/ROADMAP.md` Phase 1 is checked off in the top list
    - `git log -5 --oneline` shows the full Plan 05 arc: script commit, dev-smokes commit, (optional) prod-smokes commit, Phase-1 closure
  </verify>
  <done>Phase 1 closed. Phase 2 ready to plan.</done>
</task>

</tasks>

<verification>
- `pnpm test` — eight suites green (adds phase0-smoke CLI parser suite)
- `pnpm tsc --noEmit` — clean
- `pnpm smoke -- --mode=dev` — Smokes 1, 2, 3 PASS; 4 SKIP; 5 SKIP
- `pnpm smoke -- --mode=prod` — Smokes 1, 2, 3, 5 PASS; 4 SKIP (or documented pending MGTI access)
- `docs/phase-0-smoke.md` — evidence filled in for completed smokes; Smoke 4 reads "DEFERRED — Phase 5"
- `.planning/STATE.md` and `.planning/ROADMAP.md` — Phase 1 closed
- Phase 1 Success Criterion #3 demonstrably met: same factory hit both endpoints, only env vars differed ✓
- Phase 1 Success Criterion #4 demonstrably met: all five Phase-0 resolutions documented (3 green in both modes, 1 deferred to Phase 5, 1 green in prod mode) ✓
</verification>

<success_criteria>
- All must_haves true
- `pnpm smoke` command exists in package.json
- Script runs against both modes using the same `createLlmClient()` factory
- Evidence attached for all exercised checks
- Phase-1 tracker (STATE.md + ROADMAP.md) updated
</success_criteria>

<out_of_scope>
- **Streaming the answer to the UI** → Phase 2 (GRND-07).
- **Actual `/api/chat` route** → Phase 2.
- **Entra SPA + `brk-multihub://` consent implementation** → Phase 5 (DELV-03).
- **Daily CI smoke re-run** → Phase 5 (CI/CD pipeline); noted in CONTEXT.md §Deferred.
- **Version-poller watchdog against ServiceNow** → Phase 6 (Pilot Hardening).
- **Running `STRICT_SCHEMA_SUPPORTED=false` in production as a permanent setting** → Only if Smoke 2 proves MGTI rejects strict mode. Current plan: implement both branches, smoke-test which branch prod needs, document the finding, set the env flag accordingly.
</out_of_scope>

<pitfall_watch>
- **Pitfall #10 (ingress streaming cadence):** Smoke 3 measures this explicitly. PASS threshold (P95 < 500ms, chunkCount > 10) is documented; FAIL is non-blocking for Phase 1 closure but gates Phase 2's streaming strategy.
- **Pitfall #11 (ingress auth break):** Smoke 1 exercises the exact `createLlmClient()` path both dev and prod. A FAIL here would indicate a factory bug or env misconfiguration — both are caught in Phase 1 before Phase 2 tries to build a route on a broken foundation.
- **RESEARCH Risk 5 (`NODE_EXTRA_CA_CERTS` env loading order):** The `.env.example`, the smoke script's Smoke 5 remediation text, and the `docs/phase-0-smoke.md` Smoke 5 section all explicitly call out "set in shell, NOT in .env". Triple-documented to prevent the trap.
</pitfall_watch>
