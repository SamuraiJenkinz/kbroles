---
phase: 01-grounding-foundation
plan: 01
subsystem: grounding
tags: [next.js, react, typescript, vitest, pnpm, zod, json-schema, openai, turbopack]

# Dependency graph
requires: []
provides:
  - Next.js 16 + pnpm scaffold with TypeScript strict
  - Vitest 3 test runner with custom raw-markdown plugin (Turbopack parity)
  - Zod-validated env contract (LLM_AUTH_MODE, LLM_BASE_URL, LLM_API_KEY, LLM_MODEL, STRICT_SCHEMA_SUPPORTED)
  - CITATION_SCHEMA (JSONSchema7) + KbResponse/Citation/SourceId types
  - REGISTRY loader — typed Record<SourceId, Source> built at module load from three .md source files
  - parseSource pure function — single-line <source> tag + kebab-case section anchor parser
  - Three source markdown files (KB0020882 v9.0, KB0022991 v13.0, SNOW_FORM live) with all 7 approvers named verbatim
  - ENTITY_ALLOWLIST — names/kbIds/urls Sets derived from source bodies + URL attributes at module load
affects: [01-02-citation-validator, 01-03-llm-client-factory, 01-04-system-prompt-composer, 01-05-phase0-smoke, 02-api-chat-route, 02-entity-post-check]

# Tech tracking
tech-stack:
  added:
    - next@16.2.4
    - react@19.2.5
    - react-dom@19.2.5
    - openai@6.34.0
    - zod@4.3.6
    - typescript@5.9.3
    - vitest@3.2.4
    - vite-tsconfig-paths@5.1.4
    - tsx@4.21.0
    - ajv@8.18.0 (devDep, reserved for Plan 03 json_object fallback)
    - "@types/json-schema@7.0.15"
    - "@types/node@20.19.39"
    - "@types/react@19.2.14"
    - "@types/react-dom@19.2.3"
    - eslint@9.39.4
    - eslint-config-next@16.2.4
  patterns:
    - "Source registry built from static .md imports at module load (no runtime fs)"
    - "Typed JSON Schema via `as const satisfies JSONSchema7` for compile-time shape + runtime object"
    - "Env validation via Zod loadEnv() with cached singleton + __resetEnvCacheForTests for test isolation"
    - "Entity allowlist extraction as registry property (not HTTP-route concern)"
    - "Kebab-case section anchor IDs derived from `<!-- section:ID -->` markers, not heading titles"
    - "Single-line opening `<source ...>` tag convention — parser regex requirement"

key-files:
  created:
    - package.json
    - tsconfig.json
    - next.config.ts
    - vitest.config.mts
    - types.d.ts
    - .env.example
    - .gitignore
    - src/config/env.ts
    - src/grounding/schema.ts
    - src/grounding/registry.ts
    - src/grounding/entities.ts
    - src/grounding/sources/kb0020882.md
    - src/grounding/sources/kb0022991.md
    - src/grounding/sources/servicenow-form.md
    - src/grounding/__tests__/schema.test.ts
    - src/grounding/__tests__/registry.test.ts
    - src/grounding/__tests__/entities.test.ts
  modified: []

key-decisions:
  - "Loosened KB_ID_RE from \\bKB\\d{7}\\b (RESEARCH.md recommendation) to \\bKB\\d{5,}\\b because the corpus references both 7-digit IDs (KB0020882, KB0022991) and an 8-digit ID (KB18801781, the ServiceNow form sample record)"
  - "Custom rawMarkdown Vite plugin in vitest.config.mts instead of assetsInclude — Vite treats assets as URL references, not raw content, so the RESEARCH.md Gap 8 recommendation needed to be replaced with a real transform plugin to match Turbopack's { type: 'raw' } behaviour"
  - "Entity allowlist extractor also scans source.url attribute (not just section bodies) so KB18801781 is captured via the ServiceNow form permalink"
  - "Per-task atomic commits (6 commits) rather than the single combined commit suggested in the plan's Task 1.8 — follows the task_commit_protocol from the execute-plan workflow so each task is independently revertable"

patterns-established:
  - "Source files: single-line `<source id=\"...\" title=\"...\" version=\"...\" url=\"...\">` opening tag followed by `<!-- section:kebab-id -->` anchors and `## Heading` titles; closed with `</source>` on its own line"
  - "Registry imports are static module imports — `import kb0020882Raw from './sources/kb0020882.md'` — and assume the build tool returns raw string content (Turbopack `{ type: 'raw' }` in prod, custom Vite plugin in test)"
  - "Test paths: `src/**/__tests__/**/*.test.ts` convention enforced in vitest.config.mts include pattern"

# Metrics
duration: 7 min
completed: 2026-04-22
---

# Phase 1 Plan 01: Scaffold Registry Schema Summary

**Next.js 16 + pnpm scaffold plus the pure grounding substrate: typed REGISTRY loader parsing three source markdown files into `Record<SourceId, Source>`, CITATION_SCHEMA as JSONSchema7, and ENTITY_ALLOWLIST derived at module load — no runtime filesystem, no network, 23/23 Vitest tests green.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-04-22T17:02:55Z
- **Completed:** 2026-04-22T17:10:16Z
- **Tasks:** 8 (1.1 verification, 1.2–1.7 implementation, 1.8 final check)
- **Files created:** 17

## Accomplishments

- Manual Next.js 16 + React 19.2 scaffold with strict TypeScript, Turbopack `*.md: { type: 'raw' }` + webpack `asset/source` fallback, Vitest 3, and pnpm 10.29.3 lockfile (no `pnpm create next-app` template sprawl).
- Zod-validated env contract in `src/config/env.ts` locking the five vars needed by the LLM client (including `STRICT_SCHEMA_SUPPORTED` fallback-path flag) and a `.env.example` that documents both the dev OpenAI path and the MGTI api-key path, plus the NODE_EXTRA_CA_CERTS shell-env caveat.
- `CITATION_SCHEMA` typed `as const satisfies JSONSchema7` with locked `source_id` enum, `quote: maxLength 280`, `additionalProperties: false` everywhere — and the matching `KbResponse`/`Citation`/`SourceId` TypeScript exports.
- Three source markdown files transcribed from the handover document with single-line opening `<source>` tags and kebab-case `<!-- section:ID -->` anchors: KB0020882 v9.0 (9 sections), KB0022991 v13.0 (6 sections, all 7 named approvers verbatim), and SNOW_FORM live (7 sections).
- `REGISTRY` built at module load from static `.md` imports — `parseSource` extracts tag attributes, splits on section anchors, preserves raw body whitespace for the Plan 02 validator to normalise.
- `ENTITY_ALLOWLIST = { names, kbIds, urls }` extracted at module load from source bodies plus source URL attributes — all 7 approvers and all 3 KB IDs present.
- 23/23 Vitest tests pass (schema: 4, registry: 9, entities: 10); `pnpm tsc --noEmit` exits 0.

## Task Commits

Each task was committed atomically:

1. **Task 1.1: Verify environment prerequisites** — no commit (verification-only, no file changes; pnpm 10.29.3, node v24.1.0, git working)
2. **Task 1.2: Scaffold Next.js 16 project with pnpm** — `c25f1f1` (feat)
3. **Task 1.3: Configure Vitest, env contract, .env.example** — `c449e76` (feat)
4. **Task 1.4: Lock CITATION_SCHEMA + KbResponse types** — `6b60698` (feat)
5. **Task 1.5: Author three source markdown files** — `ae0117b` (feat)
6. **Task 1.6: Registry parser + tests** — `f37dcf5` (feat)
7. **Task 1.7: ENTITY_ALLOWLIST extractor + tests** — `62d62f3` (feat)
8. **Task 1.8: Full suite green + typecheck clean** — no commit (verification-only; metadata commit captures plan closure)

**Plan metadata commit:** _(captures this SUMMARY.md and STATE.md — hash assigned at end of plan)_

## Files Created/Modified

### Created

- `package.json` — Next.js 16, React 19.2, openai 6, zod 4, vitest 3, tsx, ajv, eslint, all versioned
- `pnpm-lock.yaml` — locked dep graph (386 packages)
- `tsconfig.json` — strict, bundler moduleResolution, `@/*` alias, ES2022 target
- `next.config.ts` — Turbopack `*.md: { type: 'raw' }` rule + webpack `asset/source` fallback
- `vitest.config.mts` — vite-tsconfig-paths plugin + custom `rawMarkdown` transform plugin (Turbopack parity for .md imports in tests)
- `types.d.ts` — `declare module '*.md'` returning string
- `.env.example` — dev (OpenAI Bearer) + prod (MGTI api-key) stanzas, STRICT_SCHEMA_SUPPORTED documented, NODE_EXTRA_CA_CERTS shell-env caveat
- `.gitignore` — node_modules, .next, env files, .DS_Store, coverage, vitest cache, tsconfig.tsbuildinfo
- `src/config/env.ts` — Zod env schema + loadEnv/env/__resetEnvCacheForTests
- `src/grounding/schema.ts` — CITATION_SCHEMA + KbResponse/Citation/SourceId types
- `src/grounding/registry.ts` — parseSource + REGISTRY + Section/Source/Registry types
- `src/grounding/entities.ts` — ENTITY_ALLOWLIST extractor (names/kbIds/urls)
- `src/grounding/sources/kb0020882.md` — Submit New/Update Technical Knowledge Article SOP v9.0, 9 sections
- `src/grounding/sources/kb0022991.md` — Technical Knowledge Base Article Management SOP v13.0, 6 sections, 7 approvers verbatim
- `src/grounding/sources/servicenow-form.md` — ServiceNow Technical Knowledge Article Form (live, SNOW_FORM), 7 sections
- `src/grounding/__tests__/schema.test.ts` — 4 tests
- `src/grounding/__tests__/registry.test.ts` — 9 tests
- `src/grounding/__tests__/entities.test.ts` — 10 tests (7 parameterised for each approver + 3 structural)

### Modified

- None (fresh scaffold; PLAN.md files modified pre-execution by the plan-phase step, committed separately upstream)

## Decisions Made

1. **Loosened KB ID regex.** RESEARCH.md Gap 7 recommended `\bKB\d{7}\b`, but the corpus references KB18801781 (8 digits) as the ServiceNow form sample record. Loosened to `\bKB\d{5,}\b` — still tight enough to exclude unrelated numeric tokens, captures all three KB IDs required by the entities test.
2. **Custom Vite plugin instead of `assetsInclude`.** RESEARCH.md Gap 8 recommended `assetsInclude: ['**/*.md']` for Vitest `.md` imports. In practice, Vite treats `assetsInclude`-listed files as URL asset references (returning `"/src/grounding/sources/kb0020882.md"`), NOT raw content. Replaced with a custom `rawMarkdown` plugin that reads the file at transform time and emits `export default <content>` — matches Turbopack's `{ type: 'raw' }` semantics so call sites stay isomorphic across build and test runtimes.
3. **Entity extractor also scans source.url.** KB18801781 appears only in the ServiceNow form source's URL attribute (permalink to the sample record), never in any section body text. Added a URL-attribute scan to the extractor so the allowlist reliably captures the reference KB ID regardless of whether it's mentioned in the text.
4. **Per-task atomic commits.** Task 1.8 proposed a single combined feat commit for the entire plan; instead followed the execute-plan workflow's task_commit_protocol (one commit per task), which gives each task an independently revertable hash and keeps git bisect useful.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Vitest `assetsInclude` does not return raw .md content**

- **Found during:** Task 1.6 (first attempt to run registry tests)
- **Issue:** RESEARCH.md Gap 8 recommended `assetsInclude: ['**/*.md']` in `vitest.config.mts`. Running the registry tests revealed this makes Vite treat `.md` imports as asset URL references — `import kb0020882Raw from './kb0020882.md'` returned `"/src/grounding/sources/kb0020882.md"` (a path string, length 35) instead of the file contents (~4KB). The parser then threw `Missing or malformed <source ...> opening tag`. Without a fix, no registry test could pass.
- **Fix:** Replaced `assetsInclude` with a custom `rawMarkdown` Vite plugin that matches on `.md` file IDs at transform time, reads the file contents, and emits `export default ${JSON.stringify(content)}`. This matches the Turbopack `{ type: 'raw' }` behaviour specified in `next.config.ts` — both now return raw file contents as the default export. Call sites stay unchanged: `import kb0020882Raw from './sources/kb0020882.md'` works identically in both build and test.
- **Files modified:** `vitest.config.mts`
- **Verification:** Registry test suite went from 0/9 passing (module load throw) to 9/9 passing. Added explanatory comment in the config.
- **Committed in:** `f37dcf5` (Task 1.6 commit)

**2. [Rule 1 - Bug] KB_ID_RE only matched 7-digit IDs, missing KB18801781**

- **Found during:** Task 1.7 (entity test assertion)
- **Issue:** RESEARCH.md Gap 7 recommended `\bKB\d{7}\b` for KB ID extraction. The `kbIds` test asserts `ENTITY_ALLOWLIST.kbIds.has('KB18801781')` — which is 8 digits — so the test failed (22/23 passing initially). This is a bug because the plan's must-haves explicitly list all three KB IDs (`KB0020882`, `KB0022991`, `KB18801781`) as required in the allowlist.
- **Fix:** Loosened the regex to `\bKB\d{5,}\b` — inclusive of both 7-digit and 8-digit IDs, still narrow enough to exclude tokens like "KB12" or free-floating numbers. Also extended `extract()` to scan each source's URL attribute so KB18801781 is caught via the SNOW_FORM permalink (it doesn't appear in any section body text).
- **Files modified:** `src/grounding/entities.ts`
- **Verification:** Entity test suite went from 22/23 to 10/10 tests passing. All seven approvers and all three KB IDs present in the allowlist.
- **Committed in:** `62d62f3` (Task 1.7 commit)

**3. [Rule 3 - Blocking] `tsconfig.tsbuildinfo` was an untracked TS incremental artifact**

- **Found during:** After Task 1.2 commit
- **Issue:** TypeScript's incremental compilation creates `tsconfig.tsbuildinfo` in the project root when `pnpm tsc --noEmit` runs. It was not in `.gitignore` so it appeared as an untracked file, risking accidental commits.
- **Fix:** Added `tsconfig.tsbuildinfo` to `.gitignore` and bundled that update into the Task 1.3 commit alongside the new vitest/env/dotenv files.
- **Files modified:** `.gitignore`
- **Verification:** `git status` no longer lists the file.
- **Committed in:** `c449e76` (Task 1.3 commit)

---

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking)
**Impact on plan:** All three fixes were needed for correctness — tests would not pass, the allowlist would miss a required KB ID, and the git working tree would be dirty. No scope creep; each fix corrected a flaw in the referenced research recommendation or a routine hygiene miss.

## Issues Encountered

None beyond the deviations above. Environment was clean (pnpm 10.29.3, node v24.1.0), no authentication gates, no network, no checkpoints.

## User Setup Required

None — this plan is pure scaffolding and local-only code. Real env values (`LLM_API_KEY`, etc.) are not needed until Plan 03 (LLM client) and Plan 05 (Phase-0 smoke). `.env.example` is a template; no `.env.local` is required to run tests or typecheck.

## Next Phase Readiness

- **Ready for Plan 02 (citation-validator):** `REGISTRY`, `Source`, `Section`, `SourceId`, `Registry`, `KbResponse`, `Citation`, and `ENTITY_ALLOWLIST` are all exported from `@/grounding/*` and typed for consumption. Plan 02 can `import { REGISTRY } from '@/grounding/registry'` and `import type { KbResponse, SourceId } from '@/grounding/schema'` without any further setup.
- **Ready for Plan 03 (llm-client-factory):** `env()`/`loadEnv()` from `@/config/env` provides the LLM_AUTH_MODE/LLM_BASE_URL/LLM_API_KEY/LLM_MODEL/STRICT_SCHEMA_SUPPORTED contract Plan 03 branches on.
- **Ready for Plan 04 (system-prompt-composer):** `REGISTRY` provides the source/section iteration surface needed to render `<sources>…</sources>` blocks; `CITATION_SCHEMA` gives the `<citation_contract>` block its anchor values.
- **Ready for Plan 05 (phase0-smoke):** the scaffold plus env contract plus `tsx` dev dep means the smoke script can live at `scripts/phase0-smoke.ts` and be run via `pnpm smoke`.
- **Blockers/concerns:** None introduced by this plan. The Phase-0 smoke blockers listed in STATE.md (MGTI baseURL suffix, json_schema strict mode, streaming cadence, Entra consent, CA chain, App Service provisioning, Content Steward) remain open and are addressed in Plan 05.

---
*Phase: 01-grounding-foundation*
*Completed: 2026-04-22*
