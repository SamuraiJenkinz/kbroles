---
phase: 06-telemetry-evals-and-pilot-hardening
plan: 01
subsystem: telemetry
tags: [opentelemetry, azure-monitor, application-insights, pino, vitest, next-instrumentation]

# Dependency graph
requires:
  - phase: 05.1-mmc-it-bff-pivot
    provides: loadSecrets() with module-cached AWS Secrets Manager loader, pino logger in src/obs/logger.ts, src/config/env.ts Zod schema pattern
  - phase: 02-chat-backend-bff
    provides: pino 10.3.1 + pino-pretty 13.1.3, serverExternalPackages pattern in next.config.ts
provides:
  - "@azure/monitor-opentelemetry@^1.16.0 + @opentelemetry/api@^1.9.1 installed as runtime deps"
  - "src/instrumentation.ts: Next.js register() with NEXT_RUNTIME=nodejs guard"
  - "src/instrumentation.node.ts: initAzureMonitor() with loadSecrets() → useAzureMonitor() + graceful fallback"
  - "src/obs/telemetry.ts: trackEvent(name, dims, meas) synchronous wrapper emitting OTel INTERNAL span + pino dual-emit"
  - "SECRET_KEYS extended to 8 entries: APPLICATIONINSIGHTS_CONNECTION_STRING + QUESTION_HASH_SALT added"
  - "src/config/env.ts: APPLICATIONINSIGHTS_CONNECTION_STRING optional Zod field"
  - "src/obs/__tests__/telemetry.test.ts: 10 Vitest assertions; no live App Insights required"
affects:
  - 06-02-question-hash-and-session-events
  - 06-03-feedback-endpoint
  - 06-04-eval-runner
  - 06-05-slow-suites-and-llm-judge
  - "all phase-6 plans that call trackEvent()"

# Tech tracking
tech-stack:
  added:
    - "@azure/monitor-opentelemetry@^1.16.0"
    - "@opentelemetry/api@^1.9.1"
  patterns:
    - "instrumentation.ts bootstrap: Next.js register() + NEXT_RUNTIME guard for Node-only OTel init"
    - "trackEvent() span-wrapper: synchronous OTel INTERNAL span + pino dual-emit as single choke point"
    - "graceful fallback: absent APPLICATIONINSIGHTS_CONNECTION_STRING logs console.info and skips useAzureMonitor()"
    - "vi.hoisted() pattern for mock variables referenced inside vi.mock() factory in Vitest"

key-files:
  created:
    - src/instrumentation.ts
    - src/instrumentation.node.ts
    - src/obs/telemetry.ts
    - src/obs/__tests__/telemetry.test.ts
  modified:
    - package.json
    - pnpm-lock.yaml
    - next.config.ts
    - src/config/secrets.ts
    - src/config/env.ts

key-decisions:
  - "OTel distro not classic SDK: @azure/monitor-opentelemetry over applicationinsights@2.x (ESM/webpack compatibility, official forward path)"
  - "dual-emit not pino-transport: thin trackEvent() wrapper over pino transport to App Insights (available transports target classic SDK, not OTel distro)"
  - "synchronous trackEvent(): streaming route handlers cannot await per-event calls; span.end() schedules async export to batch exporter"
  - "graceful fallback: absent connection string logs console.info + returns — tests and local dev do not require a live App Insights resource"

patterns-established:
  - "Pattern 1 (instrumentation bootstrap): src/instrumentation.ts → NEXT_RUNTIME guard → src/instrumentation.node.ts dynamic import → loadSecrets() → useAzureMonitor()"
  - "Pattern 2 (trackEvent choke point): all custom event emission MUST go through src/obs/telemetry.ts; no other file calls @opentelemetry/api directly"
  - "Pattern 3 (vi.hoisted mock pattern): Vitest mocks for OTel/pino use vi.hoisted() to define spy variables accessible inside vi.mock() factory closures"

# Metrics
duration: 6min
completed: 2026-04-24
---

# Phase 6 Plan 01: Telemetry Foundation Summary

**Azure Monitor OTel SDK bootstrapped in Next.js instrumentation.ts with graceful local-dev fallback; synchronous trackEvent() wrapper exports to App Insights via INTERNAL spans and dual-emits to pino; 10 Vitest assertions prove correct stripping and dual-emit without a live resource**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-24T13:36:05Z
- **Completed:** 2026-04-24T13:42:25Z
- **Tasks:** 2
- **Files modified:** 9 (4 created, 5 modified)

## Accomplishments

- Installed `@azure/monitor-opentelemetry@^1.16.0` + `@opentelemetry/api@^1.9.1` as production dependencies; `serverExternalPackages` updated to prevent webpack OTel shimmer bundling error (RESEARCH.md Pitfall 2)
- Wired the mandatory `src/instrumentation.ts` → `src/instrumentation.node.ts` bootstrap so `useAzureMonitor()` runs before any HTTP module loads (RESEARCH.md Pitfall 1); graceful no-op when `APPLICATIONINSIGHTS_CONNECTION_STRING` is absent
- Delivered `src/obs/telemetry.ts` as the single choke point for custom event emission: synchronous, strips undefined/empty-string dimensions and non-finite measurements, dual-emits to pino for local visibility
- Extended `SECRET_KEYS` to 8 entries (adds `APPLICATIONINSIGHTS_CONNECTION_STRING` + `QUESTION_HASH_SALT`) and `EnvSchema` with the new optional Zod field; no existing callers affected
- 622/622 tests pass (597 prior + 10 new telemetry unit tests); `pnpm build` clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Install SDK, extend secrets loader and env schema, add instrumentation entry** - `5261640` (feat)
2. **Task 2: Implement trackEvent() wrapper + Vitest unit coverage** - `7170a81` (feat)

**Plan metadata:** (pending — this commit)

## Files Created/Modified

- `src/instrumentation.ts` — Next.js register() entry with `NEXT_RUNTIME === 'nodejs'` guard
- `src/instrumentation.node.ts` — `initAzureMonitor()`: `loadSecrets()` → `useAzureMonitor()` + absent-string fallback + fire-and-forget top-level invoke
- `src/obs/telemetry.ts` — `trackEvent(name, EventDimensions, EventMeasurements): void`; OTel INTERNAL span + pino dual-emit; strips undefined/empty-string dims + non-finite meas
- `src/obs/__tests__/telemetry.test.ts` — 10 Vitest tests; full OTel API + pino mock via `vi.hoisted()`; no network calls
- `package.json` — `@azure/monitor-opentelemetry` + `@opentelemetry/api` in `dependencies`
- `pnpm-lock.yaml` — lockfile updated (+137/-125 packages net)
- `next.config.ts` — `serverExternalPackages` extended to `['pino', 'pino-pretty', '@azure/monitor-opentelemetry']`
- `src/config/secrets.ts` — `SECRET_KEYS` tuple extended from 6 to 8 entries
- `src/config/env.ts` — `APPLICATIONINSIGHTS_CONNECTION_STRING` added as `.optional()` Zod field

## Decisions Made

1. **OTel distro not classic SDK** — `@azure/monitor-opentelemetry` over `applicationinsights@2.x`. Classic SDK has webpack bundling issues under Next.js App Router (NormalModuleReplacementPlugin hacks required). OTel distro initialises cleanly in `instrumentation.ts`, needs one `serverExternalPackages` entry, and is the Microsoft-recommended forward path.

2. **Dual-emit not pino-transport** — Thin `trackEvent()` wrapper emits both an OTel INTERNAL span (→ App Insights customEvents) and a structured pino log (→ local dev pino-pretty). Available pino→App Insights transports (`pino-applicationinsights`, `@0dep/pino-applicationinsights`) target the classic SDK only, not the OTel distro. Maintaining two SDK paths would be fragile.

3. **Synchronous trackEvent()** — Streaming route handlers in `/api/chat` cannot `await` a per-event call. `span.end()` enqueues the span for the OTel batch exporter without blocking; the pino call is synchronous in all environments.

4. **Graceful fallback on absent connection string** — `initAzureMonitor()` checks the value after `loadSecrets()` and returns with a `console.info` log when it is absent. This means unit tests, E2E tests, and local dev all work without a provisioned App Insights resource. The operator adds the connection string to AWS Secrets Manager before pilot day.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] vi.hoisted() pattern required for Vitest mock variable hoisting**

- **Found during:** Task 2 (Vitest unit test creation)
- **Issue:** `vi.mock()` factories are hoisted to the top of the test file by Vitest's transformer, so `const mockGetTracer = vi.fn()` variables defined in the module body were not yet initialised when the factory executed. First test run failed with `ReferenceError: Cannot access 'mockGetTracer' before initialization`.
- **Fix:** Wrapped mock variable definitions in `vi.hoisted(() => { ... })` which runs before module mocks and before imports. Variables are then safely accessible in all `vi.mock()` factory closures.
- **Files modified:** `src/obs/__tests__/telemetry.test.ts`
- **Verification:** All 10 Vitest assertions pass after fix; pattern consistent with ChatSurface.test.tsx precedent in this codebase.
- **Committed in:** `7170a81` (Task 2 commit)

**2. [Rule 3 - Blocking] TypeScript double-cast required for mock.calls type assertions**

- **Found during:** Task 2 (typecheck run after tests passed)
- **Issue:** TypeScript inferred `vi.fn().mock.calls` as `[][]` (empty tuple array). Direct cast to `Array<[string, ...]>` failed with TS2352 ("neither type sufficiently overlaps"). Required double-cast through `unknown`.
- **Fix:** Changed `mock.calls as Array<...>` to `mock.calls as unknown as Array<...>` throughout test file.
- **Files modified:** `src/obs/__tests__/telemetry.test.ts`
- **Verification:** `pnpm typecheck` passes cleanly after fix.
- **Committed in:** `7170a81` (Task 2 commit, same fix batch)

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking Vitest/TypeScript tooling issues)
**Impact on plan:** Both fixes are standard Vitest mock patterns for this codebase. No scope creep. Test coverage and plan goals unchanged.

## Issues Encountered

None beyond the auto-fixed deviations above.

## User Setup Required

None for code-complete work. The operator must:
1. Provision an Azure Monitor Application Insights resource (separate Azure subscription task — see RESEARCH.md Open Question #3).
2. Add `APPLICATIONINSIGHTS_CONNECTION_STRING` to AWS Secrets Manager at `/mmc/cts/kb-assistant` before pilot day.

Until then, the app runs without telemetry using the graceful fallback path.

## Next Phase Readiness

- `trackEvent()` is the stable, test-covered surface all Phase 6 plans need. Plans 02-07 can import and call it immediately.
- `QUESTION_HASH_SALT` is in `SECRET_KEYS` — Plan 02 can implement `hashQuestion()` without any secrets-loader churn.
- `APPLICATIONINSIGHTS_CONNECTION_STRING` is in both `SECRET_KEYS` and `EnvSchema` — no further config wiring needed.
- Test baseline is 622/622 (includes 10 new telemetry tests); prior 597/597 all passing.
- `pnpm build` clean; no OTel shimmer/bundling warnings.
- **Blocker:** App Insights resource + connection string in AWS Secrets Manager must exist before telemetry data flows. This is an operator task, not a code task. Plans 02-07 proceed normally; data will begin flowing when the operator completes provisioning.

---
*Phase: 06-telemetry-evals-and-pilot-hardening*
*Completed: 2026-04-24*
