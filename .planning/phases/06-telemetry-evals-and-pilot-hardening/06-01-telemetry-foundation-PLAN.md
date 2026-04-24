---
phase: 06-telemetry-evals-and-pilot-hardening
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - pnpm-lock.yaml
  - next.config.ts
  - src/config/secrets.ts
  - src/config/env.ts
  - src/instrumentation.ts
  - src/instrumentation.node.ts
  - src/obs/telemetry.ts
  - src/obs/__tests__/telemetry.test.ts
autonomous: true
blocks_execution_on:
  - "APPLICATIONINSIGHTS_CONNECTION_STRING must exist in AWS Secrets Manager at /mmc/cts/kb-assistant (operator task); local dev + CI run with OTel console exporter fallback when the var is absent"

must_haves:
  truths:
    - "Application Insights OTel SDK is installed and registered before any HTTP module loads"
    - "trackEvent() wrapper emits a custom span that App Insights will surface as a customEvent"
    - "pino logs and App Insights events for the same request share a request_id correlation key"
    - "Unit tests for trackEvent() pass without requiring a live App Insights resource"
    - "Existing Phase 1-5.1 unit tests (597/597) + E2E tests (19/19) remain green"
  artifacts:
    - path: "src/instrumentation.ts"
      provides: "Next.js register() entry that routes to Node-only bootstrap"
      contains: "NEXT_RUNTIME"
    - path: "src/instrumentation.node.ts"
      provides: "Calls loadSecrets() then useAzureMonitor() before HTTP modules load"
      contains: "useAzureMonitor"
    - path: "src/obs/telemetry.ts"
      provides: "trackEvent(name, dims, meas) wrapper emitting an OTel INTERNAL span"
      exports: ["trackEvent"]
    - path: "src/obs/__tests__/telemetry.test.ts"
      provides: "Vitest coverage of the wrapper (no live AI needed)"
  key_links:
    - from: "src/instrumentation.node.ts"
      to: "src/config/secrets.ts"
      via: "await loadSecrets() before useAzureMonitor()"
      pattern: "loadSecrets.*useAzureMonitor|await loadSecrets"
    - from: "src/obs/telemetry.ts"
      to: "@opentelemetry/api"
      via: "trace.getTracer() + startSpan() + span.end()"
      pattern: "getTracer|startSpan"
    - from: "next.config.ts"
      to: "@azure/monitor-opentelemetry"
      via: "serverExternalPackages addition"
      pattern: "@azure/monitor-opentelemetry"
---

<objective>
Install `@azure/monitor-opentelemetry@^1.16.0` + `@opentelemetry/api@^1.9.0` and wire the minimal OTel bootstrap for the Next.js App Router so business-event instrumentation in later plans has a stable, test-covered surface. No route handlers are modified here — this plan stops at the wrapper API.

Purpose: Every Phase 6 telemetry plan depends on a working `trackEvent()` wrapper and a correctly-initialised Azure Monitor exporter. If this layer is wrong, all downstream events are silently lost.

Output: Azure Monitor OTel SDK registered in `instrumentation.node.ts`; `src/obs/telemetry.ts` exports `trackEvent(name, dimensions, measurements)`; `APPLICATIONINSIGHTS_CONNECTION_STRING` added to `SECRET_KEYS`; env schema aware; unit tests prove the wrapper emits a span with the correct attributes without requiring a live App Insights resource.
</objective>

<execution_context>
@C:\Users\taylo\.claude/get-shit-done/workflows/execute-plan.md
@C:\Users\taylo\.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@.planning/phases/06-telemetry-evals-and-pilot-hardening/06-CONTEXT.md
@.planning/phases/06-telemetry-evals-and-pilot-hardening/06-RESEARCH.md

# Relevant existing source for wiring
@src/config/secrets.ts
@src/obs/logger.ts
@next.config.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Install SDK, extend secrets loader and env schema, add instrumentation entry</name>
  <files>
    package.json
    pnpm-lock.yaml
    next.config.ts
    src/config/secrets.ts
    src/config/env.ts
    src/instrumentation.ts
    src/instrumentation.node.ts
  </files>
  <action>
    1. Run `pnpm add @azure/monitor-opentelemetry@^1.16.0 @opentelemetry/api@^1.9.0` — these are runtime deps, not dev deps (business events are emitted from production route handlers). Do NOT install the classic `applicationinsights` package — see RESEARCH.md §Don't Hand-Roll; webpack bundling breaks under Next.js App Router.

    2. Edit `next.config.ts`: extend `serverExternalPackages` from `['pino', 'pino-pretty']` to `['pino', 'pino-pretty', '@azure/monitor-opentelemetry']`. Reason: OTel loader hooks + native binding paths break under webpack bundling (RESEARCH.md Pitfall 2). Leave the rest of the file (turbopack md rule, webpack md rule, standalone output) untouched.

    3. Edit `src/config/secrets.ts`: extend the `SECRET_KEYS` tuple from the current 6 entries to 8 by adding `'APPLICATIONINSIGHTS_CONNECTION_STRING'` and `'QUESTION_HASH_SALT'`. Do not change the loadSecrets() body — the existing merge loop already iterates SECRET_KEYS and writes into process.env. (QUESTION_HASH_SALT is added here so Plan 02 has zero config churn; loadSecrets is module-cached so adding keys is free.)

    4. Edit `src/config/env.ts` to add a reader for `APPLICATIONINSIGHTS_CONNECTION_STRING` alongside the existing accessors. Pattern must match what env.ts currently exposes (zod schema if that's used, or a typed accessor). Connection string is optional — if absent (local dev, CI without the secret), the OTel bootstrap will log a warning and initialise with a null/undefined exporter so unit + E2E tests do not need a live resource. If env.ts uses a Zod schema, make the new field `.optional()`.

    5. Create `src/instrumentation.ts` with the Next.js 15 `register()` signature:
       ```typescript
       export async function register() {
         if (process.env.NEXT_RUNTIME === 'nodejs') {
           await import('./instrumentation.node')
         }
       }
       ```
       This is mandatory — Next.js calls register() BEFORE any route module is imported, which is the ONLY safe time to call useAzureMonitor() (RESEARCH.md Pitfall 1).

    6. Create `src/instrumentation.node.ts`:
       - Import `loadSecrets` from `./config/secrets`.
       - Import `useAzureMonitor` from `@azure/monitor-opentelemetry`.
       - Export `initAzureMonitor()` that:
         - awaits `loadSecrets()` so `process.env.APPLICATIONINSIGHTS_CONNECTION_STRING` is populated
         - reads the connection string; if empty/undefined, emit `console.info('[telemetry] APPLICATIONINSIGHTS_CONNECTION_STRING absent; running without AI exporter (local/CI fallback)')` and RETURN without calling useAzureMonitor (local-dev fallback so tests do not need the live resource)
         - otherwise calls `useAzureMonitor({ azureMonitorExporterOptions: { connectionString }, enableLiveMetrics: true, enableStandardMetrics: true, samplingRatio: 1, instrumentationOptions: { http: { enabled: true }, bunyan: { enabled: false }, winston: { enabled: false } } })` exactly per RESEARCH.md §Pattern 1
       - Then at module top-level, invoke `initAzureMonitor().catch((err) => console.error('[telemetry] init failed', err))` — fire-and-forget at module load so `register()` can await the module import without blocking.

    Do NOT touch any route handler, pino logger, or chat pipeline in this task. The goal is "SDK registered, nothing wired yet".
  </action>
  <verify>
    - `pnpm install` completes; lockfile updated.
    - `pnpm typecheck` passes (new files typecheck; env.ts additions satisfy existing callers).
    - `pnpm build` completes without any `@opentelemetry/instrumentation` or `shimmer` bundling errors (RESEARCH.md Pitfall 2 signal).
    - `pnpm test` is green (no new tests yet; all 597 existing tests still pass).
    - `pnpm dev` starts without any `useAzureMonitor` warning beyond the expected "connection string absent" console.info when no env var is set.
  </verify>
  <done>
    - `@azure/monitor-opentelemetry` and `@opentelemetry/api` appear in package.json dependencies (not devDependencies).
    - `next.config.ts` lists `@azure/monitor-opentelemetry` in `serverExternalPackages`.
    - `SECRET_KEYS` in `src/config/secrets.ts` contains both `APPLICATIONINSIGHTS_CONNECTION_STRING` and `QUESTION_HASH_SALT`.
    - `src/instrumentation.ts` and `src/instrumentation.node.ts` exist with the exact shape above.
    - Bootstrap fails-soft when the connection string is absent (no throw, info-level log only).
    - All pre-existing unit + E2E tests remain green.
  </done>
</task>

<task type="auto">
  <name>Task 2: Implement trackEvent() wrapper + Vitest unit coverage</name>
  <files>
    src/obs/telemetry.ts
    src/obs/__tests__/telemetry.test.ts
  </files>
  <action>
    1. Create `src/obs/telemetry.ts`:
       ```typescript
       import { trace, SpanKind } from '@opentelemetry/api'
       import { logger } from './logger'

       const tracer = trace.getTracer('kb-assistant', '1.0.0')

       export type EventDimensions = Record<string, string | undefined>
       export type EventMeasurements = Record<string, number>

       export function trackEvent(
         name: string,
         dimensions: EventDimensions = {},
         measurements: EventMeasurements = {},
       ): void {
         // Strip undefined dimension values — App Insights treats undefined as string 'undefined'
         const attrs: Record<string, string | number> = { 'event.name': name }
         for (const [k, v] of Object.entries(dimensions)) {
           if (typeof v === 'string' && v.length > 0) attrs[k] = v
         }
         for (const [k, v] of Object.entries(measurements)) {
           if (Number.isFinite(v)) attrs[k] = v
         }
         const span = tracer.startSpan(name, { kind: SpanKind.INTERNAL, attributes: attrs })
         span.end()
         // Dual-emit to pino so local dev sees the event (RESEARCH.md §Pattern 2).
         // Reuses the Phase 2 PII scrubber — caller is responsible for passing
         // only dimensions/measurements that pass the PII bar (hashes, enums, numerics).
         logger.info({ event: name, ...dimensions, ...measurements }, name)
       }
       ```
       The function MUST be synchronous — callers in streaming route handlers cannot await per-event.

    2. Create `src/obs/__tests__/telemetry.test.ts` with Vitest tests that:
       - Mock `@opentelemetry/api` — replace `trace.getTracer` with a spy returning a mock tracer whose `startSpan` returns a mock span with an `end()` method.
       - Assert trackEvent() calls `tracer.startSpan` with the event name, `SpanKind.INTERNAL`, and `attributes['event.name']` equal to the event name.
       - Assert that undefined dimension values are stripped (not forwarded to attributes).
       - Assert that non-finite measurements (NaN, Infinity) are stripped.
       - Assert that `span.end()` is called exactly once per trackEvent call.
       - Assert that empty-string dimension values are stripped (prevents noise dimensions in AI).
       - Assert pino logger.info is called with the event name as msg and dimensions as bindings (spy on the logger module).
       - Use `vi.mock('../logger', ...)` to intercept the pino call.

    Must not require a live App Insights connection string. Must not make any network calls during tests.
  </action>
  <verify>
    - `pnpm test src/obs/__tests__/telemetry.test.ts` runs and passes (≥5 assertions).
    - `pnpm test` overall still reports 597/597 prior tests passing, plus the new ones from this task.
    - `pnpm typecheck` passes.
  </verify>
  <done>
    - `src/obs/telemetry.ts` exports `trackEvent`, `EventDimensions`, `EventMeasurements`.
    - Unit tests cover: undefined stripping, non-finite measurement stripping, exactly-one span.end(), pino dual-emit.
    - Wrapper is synchronous (not async).
    - Dev visibility preserved via pino dual-emit (no local console noise on top of existing pino-pretty output).
  </done>
</task>

</tasks>

<verification>
- `pnpm install` + `pnpm typecheck` + `pnpm build` + `pnpm test` all green.
- New telemetry unit tests added to the suite; pre-existing 597/597 still pass.
- Running `pnpm dev` with no `APPLICATIONINSIGHTS_CONNECTION_STRING` in env prints the expected fallback console.info but does NOT throw or block startup.
- If the operator has provisioned the App Insights resource and the connection string is present in AWS Secrets Manager, `pnpm dev` initialises the exporter silently.
- `@azure/monitor-opentelemetry` is listed in `next.config.ts` serverExternalPackages (without this, the production build fails with a webpack OTel shimmer error).
- `src/obs/telemetry.ts` is the SINGLE choke point for custom event emission — no other file calls `@opentelemetry/api` directly.
</verification>

<success_criteria>
Contributes to ROADMAP.md Phase 6 Success Criterion #1 ("Complete event stream in AI") by providing the transport layer every subsequent plan consumes. Directly advances requirement TELE-03 (Application Insights / OpenTelemetry integration).

- [ ] Azure Monitor OTel SDK installed at ^1.16.0 and registered before HTTP modules load
- [ ] `trackEvent(name, dimensions, measurements)` is the single API other plans call
- [ ] Pino and AI share `request_id` semantics (wrapper carries the dimension; Plan 02 wires it into route handlers)
- [ ] Local dev + CI run without a live App Insights connection string (silent fallback)
- [ ] 597/597 prior unit tests + 19/19 prior E2E tests remain green
</success_criteria>

<output>
After completion, create `.planning/phases/06-telemetry-evals-and-pilot-hardening/06-01-SUMMARY.md` following `C:\Users\taylo\.claude/get-shit-done/templates/summary.md`. Key frontmatter fields to populate: `subsystem: telemetry`, `tech-stack.added: [@azure/monitor-opentelemetry, @opentelemetry/api]`, `patterns.added: [instrumentation.ts bootstrap, trackEvent() span-wrapper]`, `decisions.made: [OTel distro not classic SDK, dual-emit not pino-transport]`.
</output>
