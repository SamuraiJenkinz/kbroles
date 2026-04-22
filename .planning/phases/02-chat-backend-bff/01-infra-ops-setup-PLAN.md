---
plan: 1
name: infra-ops-setup
phase: 2
wave: 1
depends_on: []
files_modified:
  - docs/env-handling.md
  - docs/phase-0-smoke.md
  - package.json
  - pnpm-lock.yaml
  - next.config.ts
  - src/obs/logger.ts
  - src/obs/__tests__/logger.test.ts
  - src/app/api/_middleware.ts
  - src/app/api/__tests__/middleware.test.ts
autonomous: false
user_setup:
  - service: mgti-ingress
    why: "Prod-mode Phase-0 smoke is a hard gate before /api/chat route code commits in Plan 04; requires MGTI-issued credentials + MMC corporate CA bundle"
    env_vars:
      - name: LLM_API_KEY
        source: "MGTI-issued key (MMC platform team)"
      - name: LLM_BASE_URL
        source: "MGTI endpoint with suffix confirmed by Smoke 1 (e.g. https://stg1.mmc-dallas-int-non-prod-ingress.mgti.mmc.com/coreapi/openai/v1)"
      - name: LLM_MODEL
        source: "MGTI deployment name for gpt-4o"
      - name: NODE_EXTRA_CA_CERTS
        source: "Path to MMC corporate CA bundle PEM file — MUST be set in shell environment, not a .env file"
    dashboard_config:
      - task: "Confirm MGTI key is authorised for the gpt-4o deployment"
        location: "MMC platform team / MGTI admin"
      - task: "Obtain MMC corporate CA bundle PEM and install at a known local path"
        location: "MMC platform team"

must_haves:
  truths:
    - "docs/env-handling.md documents: which env file each runtime (Next.js dev, tsx, Next.js prod, Vitest, App Service) reads; the .env.local vs .env.development distinction; how NODE_EXTRA_CA_CERTS must be set in shell env (not in any .env file); how Next.js Application Settings map into App Service"
    - "Prod-mode Phase-0 smoke gate is honoured: Plan 04 Task 2 (route code) MUST NOT be committed until pnpm smoke -- --mode=prod shows PASS for Smoke 1, Smoke 2, Smoke 3, Smoke 5 in docs/phase-0-smoke.md"
    - "pino and pino-pretty are installed and pinned; next.config.ts lists both in serverExternalPackages so Turbopack does not bundle them (GitHub #84766 fix applies at 16.2.4)"
    - "src/obs/logger.ts exports a pino instance (pretty-printer in dev, raw JSON in prod based on NODE_ENV) and a requestLogger({request_id, role, host}) helper returning a pino child logger"
    - "Logger unit test proves: (a) child() carries request_id and role forward into every subsequent .info/.warn/.error call; (b) the logger NEVER records the strings messages, content, answer, quote, or user_question in its output — enforced by a string-grep assertion over captured log output"
    - "src/app/api/_middleware.ts (or a withAuth() wrapper) returns a stub { sub: 'local-dev', tenantId: env.ENTRA_TENANT_ID ?? 'local-dev' } in dev/test and a 401 placeholder in prod; a comment block labels the exact substitution point where Phase 5 MSAL validation will replace the stub"
    - "Middleware is tested: dev returns the stub user; prod without a valid token returns 401; a single exported helper getRequestUser(request) is the only surface /api/chat reads for the authed identity"
  artifacts:
    - path: "docs/env-handling.md"
      provides: "Single ops doc consolidating env var handling across all runtimes (resolves STATE.md 'Expand .env handling docs before Phase 2 plan' concern)"
      min_lines: 60
    - path: "src/obs/logger.ts"
      provides: "pino logger + requestLogger({fields}) child helper"
      exports: ["logger", "requestLogger"]
    - path: "src/app/api/_middleware.ts"
      provides: "Stub auth middleware + getRequestUser helper; Phase-5 replacement point clearly marked"
      exports: ["getRequestUser"]
    - path: "package.json"
      contains: "\"pino\""
    - path: "next.config.ts"
      contains: "serverExternalPackages"
  key_links:
    - from: "next.config.ts"
      to: "pino/pino-pretty"
      via: "serverExternalPackages array prevents Turbopack from bundling pino worker-thread deps"
      pattern: "serverExternalPackages.*pino"
    - from: "src/obs/logger.ts"
      to: "pino"
      via: "default import + per-env transport selection"
      pattern: "import pino from 'pino'"
    - from: "src/app/api/_middleware.ts"
      to: "src/config/env.ts"
      via: "reads env() for ENTRA_TENANT_ID (if present) and NODE_ENV"
      pattern: "env\\(\\)"
---

<objective>
Land Phase-2 infrastructure and close Phase-1 carry-forward ops gates BEFORE any route code is written: consolidate .env handling into a single ops doc, run the prod-mode Phase-0 smoke against MGTI, install pino, wire the stub auth middleware. This plan is a hard dependency of Plan 04 (route wiring) — prod-smoke PASS gates the `/api/chat` code commit.

Purpose: CONTEXT.md §Entry Gates — "Prod-mode Phase-0 smoke is a hard gate on the first `/api/chat` code commit in this phase." Plus STATE.md "Expand .env handling docs before Phase 2 plan." Plus SC #5 ("Structured logs capture {request_id, role, validator_flips, refusal_fired, ingress_status_code}") which needs pino to exist before the route can emit those logs.

Output: ops doc, updated smoke evidence, pino + logger, stub middleware. No chat primitives and no route code here — those are Plans 02/03/04.
</objective>

<execution_context>
@C:\Users\taylo\.claude/get-shit-done/workflows/execute-plan.md
@C:\Users\taylo\.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
No upstream plan deps (this plan has the longest lead time on human-loop gates, so it runs in Wave 1 parallel with Plan 02).

Before starting, read:

@.planning/STATE.md  (§"Phase 2 entry gates" — authoritative on what prod-smoke must cover and what the .env doc must consolidate)
@.planning/phases/02-chat-backend-bff/02-CONTEXT.md  (§Entry Gates, §5 Structured logging for log-field spec)
@.planning/phases/02-chat-backend-bff/02-RESEARCH.md  (§Pattern 5 Pino setup, §Common Pitfalls #3 Turbopack worker-thread)
@.planning/phases/01-grounding-foundation/05-phase0-smoke-PLAN.md  (existing smoke script — do NOT rewrite, only re-run + update evidence doc)
@docs/phase-0-smoke.md  (existing evidence doc — append prod-mode results; do not rewrite Phase-1 dev-mode evidence)
@scripts/phase0-smoke.ts  (runner — invoked via `pnpm smoke -- --mode=prod`)
@next.config.ts  (existing Turbopack + webpack raw-md config — preserve, add serverExternalPackages field)
@src/config/env.ts  (env() is the sole env-reading surface — middleware + logger must go through it)

**Phase-5 replacement points (comments to place now for later surgery):**
- `src/app/api/_middleware.ts`: block-commented `// PHASE 5: replace stub with MSAL token validation; tenant allowlist via env().ENTRA_TENANT_ID` above the dev stub.
- `src/obs/logger.ts`: block-comment `// PHASE 6: add App Insights exporter + custom-event layer on top of this logger` above the logger export.
</context>

<tasks>

<task id="1.1" type="checkpoint:human-verify" gate="blocking">
  <name>Task 1.1: Consolidate .env handling docs + run prod-mode Phase-0 smoke</name>
  <files>docs/env-handling.md, docs/phase-0-smoke.md</files>
  <action>
    Step 1 (Claude automation — before the checkpoint fires):
    Write `docs/env-handling.md` (new file, 60+ lines) with these sections:

    1. **Files & load order** — table of `.env.local`, `.env.development`, `.env.production`, and which runtime reads which file. Next.js auto-loads `.env.local` + `.env.[development|production]`. Vitest does not auto-load; scripts use `node --env-file-if-exists=.env.local --import tsx` (captured in `pnpm smoke`). tsx alone does NOT auto-load — Plan 05 decision #3 from Phase 1.
    2. **Per-runtime cheat sheet** — four rows: `next dev`, `next start`, `vitest run`, `pnpm smoke`. For each: what env file loads, what the wrapping flag is, where Application Settings come from in App Service.
    3. **Secrets that MUST live outside .env files** — NODE_EXTRA_CA_CERTS (set in shell env / App Service Application Settings; Node reads at TLS init before dotenv runs — nodejs/node issue #51426). Also list any MSAL client secret once Phase 5 lands — mark as "Phase 5 addition."
    4. **.env.example** — reference list of every variable `env.ts` validates (LLM_AUTH_MODE, LLM_BASE_URL, LLM_API_KEY, LLM_MODEL, STRICT_SCHEMA_SUPPORTED). Match the zod schema in src/config/env.ts exactly.
    5. **App Service Application Settings mapping** — how each var is set in the Azure portal / bicep template once Phase 5 deploys. Mark placeholders as "Phase 5 work — captured here for forward reference."
    6. **Troubleshooting** — "env() throws Invalid env" (check zod error); "TLS UNABLE_TO_VERIFY_LEAF_SIGNATURE" (NODE_EXTRA_CA_CERTS not set in shell); "undefined in Vitest" (no auto-load — set in shell or use `vi.stubEnv`).

    Step 2 (checkpoint — human action):
    Before this task is marked complete, operator runs `pnpm smoke -- --mode=prod` against the MGTI ingress. This requires MGTI credentials + NODE_EXTRA_CA_CERTS per the user_setup block above. Operator appends prod-mode PASS/FAIL evidence to `docs/phase-0-smoke.md` under Smoke 1, Smoke 2, Smoke 3, Smoke 5 (Smoke 4 stays DEFERRED — Phase 5). If any of these fail, operator stops — the route code in Plan 04 is blocked until the gate is green.

    Why a checkpoint here and not inside Plan 04: by running the gate in Wave 1, Plans 02 and 03 (library code, no MGTI touch) can parallelize while the operator deals with MMC platform-team logistics. Only Plan 04 needs the gate green.
  </action>
  <what-built>
    `docs/env-handling.md` (new) summarising env-file handling across all runtimes; `docs/phase-0-smoke.md` updated with prod-mode Smoke 1/2/3/5 results.
  </what-built>
  <how-to-verify>
    1. `docs/env-handling.md` exists, ≥60 lines, covers the six sections above.
    2. Run `pnpm smoke -- --mode=prod` (requires MGTI creds + NODE_EXTRA_CA_CERTS set in shell):
       - Smoke 1: expect PASS (`baseURL` suffix resolves; 200 response).
       - Smoke 2: expect PASS (strict json_schema honoured). If FAIL, set `STRICT_SCHEMA_SUPPORTED=false` and re-run; the Ajv fallback should PASS.
       - Smoke 3: expect P95 inter-chunk < 500 ms, chunkCount > 10 (dev-mode baseline P95=65 ms; if prod P95 exceeds 500 ms, Pitfall #10 buffering is confirmed — re-tune the 20 s inter-chunk timeout in Plan 03 before continuing).
       - Smoke 5: expect PASS (corporate CA chain verified; no UNABLE_TO_VERIFY_LEAF_SIGNATURE).
    3. Append PASS/FAIL evidence (date, operator, baseURL, first response byte, chunk stats) to the corresponding Smoke sections of `docs/phase-0-smoke.md`.
  </how-to-verify>
  <resume-signal>
    Type "prod-smoke-green" if all four prod Smokes PASS. Type "blocked: no-mgti-access" if credentials are still pending — in that case this task pauses, Plans 02 & 03 still proceed, but Plan 04 remains blocked at its Task 2 code commit. Type "failed: <smoke-n>" with a one-line note if a smoke FAIL surfaces a remediation task (e.g. "Smoke 3 P95=800ms — reduce inter-chunk timeout in Plan 03 from 20s to 10s").
  </resume-signal>
  <done>
    docs/env-handling.md committed; docs/phase-0-smoke.md updated with prod-mode evidence (or user-acknowledged block + plan deferral).
  </done>
</task>

<task id="1.2" type="auto">
  <name>Task 1.2: Install pino + configure Turbopack externals + add logger module</name>
  <files>package.json, pnpm-lock.yaml, next.config.ts, src/obs/logger.ts, src/obs/__tests__/logger.test.ts</files>
  <action>
    1. Install runtime deps: `pnpm add pino pino-pretty`. Both end up in `dependencies` (logger runs in prod). Confirm `package.json` records `"pino": "^9"` and `"pino-pretty": "^13"` (or matching major versions at install time — capture exact resolved versions).

    2. Update `next.config.ts`: add `serverExternalPackages: ['pino', 'pino-pretty']` to the exported NextConfig. Preserve the existing `turbopack.rules['*.md'] = { type: 'raw' }` and the webpack `.md` raw-asset rule from Phase 1 — do not touch them. Rationale: Next.js 16.1 auto-resolves transitive deps (like `thread-stream` + `real-require`), so listing only the direct packages is sufficient (RESEARCH §Pattern 5). This project is at Next 16.2.4.

    3. Create `src/obs/logger.ts`:
       ```ts
       import pino from 'pino'

       // Dev: pino-pretty transport (worker thread — handled by serverExternalPackages).
       // Prod: raw JSON to stdout (no transport, no worker thread).
       // App Service ingests stdout into App Insights via the OpenTelemetry distro (STACK.md §8).
       const isProd = process.env.NODE_ENV === 'production'
       export const logger = pino(
         isProd
           ? { level: 'info' }
           : { level: 'debug', transport: { target: 'pino-pretty', options: { colorize: true } } }
       )

       // Per-request child logger. Call once at route entry after request_id is generated.
       // Fields LOCKED by CONTEXT.md §5: request_id, role, host, validator_flips, refusal_fired,
       // fallback_reason, ingress_status_code, prompt_tokens, completion_tokens, latency_ms.
       // PHASE 6: add App Insights exporter + custom-event layer on top of this logger.
       export function requestLogger(fields: { request_id: string; role?: string; host?: string }) {
         return logger.child(fields)
       }
       ```

    4. Create `src/obs/__tests__/logger.test.ts`. Two tests:
       - `requestLogger` child carries `request_id` into subsequent `.info()` / `.warn()` calls: capture stdout, assert each log line JSON includes the request_id from the child fields.
       - The captured log output for a synthetic sequence of calls (`.info('chat started')`, `.info({validator_flips: 1, fallback_reason: 'all_citations_stripped'}, 'request done')`) does NOT contain the strings: `"user_question"`, `"messages"`, `"content"`, `"answer"`, `"quote"`. String-grep assertion per CONTEXT §5 "Explicitly NOT logged" rule — this is the only test protecting SC #5 "no raw user-question text" from drift.

       To capture stdout in Vitest without writing to a file: `const stream = new PassThrough(); const testLogger = pino(stream); ...`. Or use pino's `destination()` with an in-memory Writable. (Don't test the module-level `logger` export's transport — it's environment-dependent; test the shape via a parallel pino instance using the same child-field pattern.)

    5. Commit as a single feat: `feat(phase-2/plan-01): install pino + configure Turbopack externals + add logger module`.
  </action>
  <verify>
    `pnpm typecheck` passes; `pnpm test` runs with the new logger tests green; `grep -q 'serverExternalPackages' next.config.ts` returns 0; `pnpm dev` starts without the `Cannot find module 'real-require'` error (manual check not required here — the test of next.config correctness is the successful Plan 04 `/api/chat` smoke).
  </verify>
  <done>
    pino + pino-pretty in dependencies; next.config serverExternalPackages set; src/obs/logger.ts exports logger + requestLogger; logger test enforces no-raw-content rule; all tests green.
  </done>
</task>

<task id="1.3" type="auto">
  <name>Task 1.3: Add stub auth middleware with Phase-5 replacement point marked</name>
  <files>src/app/api/_middleware.ts, src/app/api/__tests__/middleware.test.ts</files>
  <action>
    1. Create `src/app/api/_middleware.ts` exporting a single helper `getRequestUser(request: Request): { sub: string; tenantId: string } | { error: 'unauthorized' }`:

       ```ts
       // STUB MIDDLEWARE — DO NOT DEPLOY TO PROD WITHOUT PHASE 5 MSAL WIRING.
       // PHASE 5 REPLACEMENT POINT: swap stub for:
       //   (a) read Authorization: Bearer <token> header
       //   (b) validate JWT against Entra issuer + audience
       //   (c) enforce env().ENTRA_TENANT_ID tenant allowlist
       //   (d) return { sub: jwt.oid, tenantId: jwt.tid } OR { error: 'unauthorized' }
       // See STACK.md §5.5 and ARCHITECTURE.md §16 Phase C step 12.

       import { env } from '@/config/env'

       export function getRequestUser(request: Request):
         | { sub: string; tenantId: string }
         | { error: 'unauthorized' }
       {
         // Dev + test: permissive stub — ANY caller becomes a local-dev user.
         if (process.env.NODE_ENV !== 'production') {
           return { sub: 'local-dev', tenantId: 'local-dev' }
         }
         // Prod placeholder: until Phase 5 replaces this, production has no real auth.
         // Production deployment is BLOCKED until Phase 5 (STACK.md §5.5).
         const auth = request.headers.get('authorization')
         if (!auth || !auth.startsWith('Bearer ')) return { error: 'unauthorized' }
         // Stub: accept any bearer token, echo back a placeholder user.
         // Phase 5 replaces this with real JWT verification.
         return { sub: 'prod-stub', tenantId: 'prod-stub' }
       }
       ```

       Note: the file is named with a leading underscore so Next.js 16 does NOT auto-register it as a route — this module is a helper imported by route handlers, not a Next.js middleware layer. Plan 04 Task 2 calls `getRequestUser(request)` at route entry.

       Design note (why a helper, not Next.js `middleware.ts`): Next.js Route Handlers in the Node runtime do not get the global `middleware.ts` matcher treatment the same way Edge middleware does for auth, and a per-route `getRequestUser()` call is simpler to substitute in Phase 5. CONTEXT.md "Claude's Discretion" explicitly allows either mechanism; we pick the helper-wrapper for isolation.

    2. Create `src/app/api/__tests__/middleware.test.ts`. Three tests:
       - `NODE_ENV=development`: any Request returns `{sub: 'local-dev', tenantId: 'local-dev'}`.
       - `NODE_ENV=production` with no Authorization header: returns `{error: 'unauthorized'}`.
       - `NODE_ENV=production` with `Authorization: Bearer anything`: returns `{sub: 'prod-stub', tenantId: 'prod-stub'}` (stub acceptance; Phase 5 replaces this).

       Use `vi.stubEnv('NODE_ENV', 'production')` / `vi.unstubAllEnvs()` to toggle per-test. Call `__resetEnvCacheForTests()` from `src/config/env.ts` between tests if env() is touched.

    3. Commit as a single feat: `feat(phase-2/plan-01): add stub auth middleware with Phase-5 replacement point marked`.
  </action>
  <verify>
    `pnpm typecheck` passes; `pnpm test` passes with three new middleware tests green; `grep -q "PHASE 5 REPLACEMENT POINT" src/app/api/_middleware.ts` returns 0.
  </verify>
  <done>
    src/app/api/_middleware.ts exports getRequestUser; stub behaviour is dev-permissive and prod-placeholder; Phase-5 swap point has a clear inline comment block; tests enforce all three behaviours.
  </done>
</task>

</tasks>

<verification>
  - `pnpm typecheck` clean.
  - `pnpm test` green (existing 70 + new logger 2 + new middleware 3 = 75 tests minimum).
  - `pnpm smoke -- --mode=prod` PASS on Smokes 1/2/3/5 OR user explicitly `blocked: no-mgti-access` acknowledged in the task 1.1 resume-signal (which defers Plan 04 Task 2 until unblocked but does not block Plans 02/03).
  - `docs/env-handling.md` present and covers the six required sections.
  - `docs/phase-0-smoke.md` shows prod-mode evidence under Smokes 1/2/3/5 or an explicit `pending: no-mgti-access` marker with a date.
  - `next.config.ts` lists `['pino', 'pino-pretty']` in `serverExternalPackages`.
  - `src/obs/logger.ts` exists; `src/app/api/_middleware.ts` exists.
</verification>

<success_criteria>
Phase 2 SC #5 ("Structured logs capture {request_id, role, validator_flips, refusal_fired, ingress_status_code} — no raw user-question text"): the logger module + its no-raw-content test are the floor of this guarantee; Plan 04 Task 2 assembles the fields and pipes them through.

Phase-1 carry-forward Entry Gate ("Prod-mode Phase-0 smoke pending MGTI creds + CA bundle; gates Phase 2 `/api/chat` route build"): closed by Task 1.1 prod-smoke execution, or explicitly deferred with a plan-level block on Plan 04 Task 2.

STATE.md Phase 2 entry gate ("Expand .env handling docs before Phase 2 plan"): closed by Task 1.1 docs/env-handling.md.
</success_criteria>

<output>
After completion, create `.planning/phases/02-chat-backend-bff/02-01-SUMMARY.md` following the standard GSD summary template, with special attention to:
- `prod_smoke_status: green | blocked` field in frontmatter
- Affected downstream plans: Plan 04 (blocked at Task 2 if prod_smoke_status=blocked)
- pino + pino-pretty resolved versions captured
</output>
