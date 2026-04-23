---
phase: 04-source-panel-trust-and-fallback-ui
plan: "01"
subsystem: ui
tags: [sourceBadges, lucide-react, tailwind, api-route, env-schema, zod, registry]

# Dependency graph
requires:
  - phase: 01-grounding-foundation
    provides: REGISTRY with parsed sections from all 3 sources (readFileSync at init)
  - phase: 02-chat-backend-bff
    provides: /api/prompts pattern (nodejs, force-dynamic, Cache-Control)
  - phase: 03-role-experience-and-chat-ui
    provides: sourceTitles.ts (extended here), lucide-react installed

provides:
  - "src/ui/sourceBadges.ts — canonical SOURCE_BADGES (22 entries: 6 KB0022991 + 9 KB0020882 + 7 SNOW_FORM), SOURCE_FALLBACK, getSourceBadge, badgeClassesFor, ringClassesFor"
  - "src/ui/sourceTitles.ts — extended with all 22 registry section_ids + legacy keys preserved"
  - "src/app/api/sources/route.ts — GET /api/sources?source_id=X&section_id=Y (section body JSON)"
  - "src/app/api/config/route.ts — GET /api/config (versions + contentStewardEmail)"
  - "src/config/env.ts — CONTENT_STEWARD_EMAIL in EnvSchema (default: kb-knowledge-team@mmc.com)"
  - "src/grounding/sources/servicenow-form.md — version='2026-04-23' (was 'live')"

affects:
  - 04-02-source-panel-and-chip-integration (reads SOURCE_BADGES + /api/sources)
  - 04-03-fallback-card-trust-header-about-tooltip (reads /api/config + CONTENT_STEWARD_EMAIL)
  - 04-04-e2e-success-criteria-and-anchor-check (validates /api/sources + /api/config e2e)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SOURCE_BADGES keyed by ${source_id}/${section_id} — slash separator prevents section_id collisions across sources"
    - "SOURCE_FALLBACK provides source-level colour/icon when section not in SOURCE_BADGES"
    - "/api/config pattern: mock env() in tests via vi.mock('@/config/env') to avoid requiring LLM_* vars"
    - "Registry parity test: every REGISTRY section_id asserted to have SOURCE_BADGES entry — CI drift prevention"

key-files:
  created:
    - src/ui/sourceBadges.ts
    - src/ui/__tests__/sourceBadges.test.ts
    - src/app/api/sources/route.ts
    - src/app/api/sources/__tests__/route.test.ts
    - src/app/api/config/route.ts
    - src/app/api/config/__tests__/route.test.ts
  modified:
    - src/ui/sourceTitles.ts
    - src/config/env.ts
    - src/config/__tests__/env.test.ts
    - src/grounding/sources/servicenow-form.md
    - src/grounding/__tests__/registry.test.ts
    - src/grounding/__tests__/__snapshots__/systemPrompt.test.ts.snap
    - .env.example

key-decisions:
  - "Badge labels use exact REGISTRY section titles (e.g. 'Knowledge Blocks (Knowledge Team Only)' not 'Knowledge Blocks') — parity test enforces this at CI time"
  - "KB0020882/attachments stays blue (source-level), not purple — RESEARCH §78 confirms 'Attachments purple' in handover §14 refers to SNOW_FORM fields, not KB0020882"
  - "KB0020882/categorisation is amber/Tags — handover §14 assigns 'Categories amber' at section level, overriding source-level blue"
  - "servicenow-form.md version changed from 'live' to '2026-04-23' — required for TRST-01 freshness line 'Form schema YYYY-MM-DD'"
  - "/api/config test mocks env() via vi.mock('@/config/env') — the route calls env() which requires LLM_* vars not present in test env; mocking avoids coupling to LLM test scaffolding"
  - "sourceTitles.ts preserves all Phase-3 legacy keys for UTIL-01 backward compat; new registry section_ids appended"
  - "registry.test.ts SNOW_FORM version assertion widened from toBe('live') to toMatch(/^\\d{4}-\\d{2}-\\d{2}$/)"
  - "systemPrompt snapshots updated to reflect SNOW_FORM version change (intentional — version string propagates into system prompt)"

patterns-established:
  - "Route tests for env()-calling routes: mock @/config/env via vi.mock rather than populating required LLM_* vars"
  - "Badge colour map: type BadgeColour literal union + BadgeDef interface enables compile-time safety on all badge consumers"

# Metrics
duration: 8min
completed: "2026-04-23"
---

# Phase 4 Plan 01: Source Exposure & Badge Constants Summary

**Canonical SOURCE_BADGES (22 entries, single source of truth), CONTENT_STEWARD_EMAIL env var, /api/sources + /api/config routes, and SNOW_FORM version dated — full foundation for Plans 02–04**

## Performance

- **Duration:** ~8 min active
- **Started:** 2026-04-23T07:25:38Z
- **Completed:** 2026-04-23T07:33:44Z
- **Tasks:** 2 of 2
- **Files modified:** 13

## Accomplishments

- Single-source-of-truth `SOURCE_BADGES` covering all 22 corpus section_ids with colour + lucide icon + label; registry-parity test enforces at CI time (no drift)
- `/api/sources` and `/api/config` routes give client components safe access to REGISTRY content without crashing on `readFileSync`
- `CONTENT_STEWARD_EMAIL` validated in EnvSchema with default — FBK-04 mailto never sees `undefined`
- SNOW_FORM version changed from `"live"` → `"2026-04-23"` so TRST-01 freshness line can render `Form schema 2026-04-23`

## Task Commits

Each task was committed atomically:

1. **Task 1: Canonical badge map + sourceTitles extension** — `2a54877` (feat)
2. **Task 2: Env schema + servicenow-form version + API routes** — `a8c503e` (feat)

**Plan metadata:** `[pending]` (docs: complete source-exposure-and-badge-constants plan)

## Files Created/Modified

- `src/ui/sourceBadges.ts` — SOURCE_BADGES (22 entries), SOURCE_FALLBACK, getSourceBadge, badgeClassesFor, ringClassesFor
- `src/ui/__tests__/sourceBadges.test.ts` — 27 tests: Pitfall-16 invariant, registry parity, fallback behaviour, exact badge values, class helpers, resolveSourceTitle parity
- `src/ui/sourceTitles.ts` — Extended from ~10 Phase-3 seed entries to full 22-section registry coverage + legacy keys preserved
- `src/config/env.ts` — CONTENT_STEWARD_EMAIL added to EnvSchema (z.string().min(1).regex(/@/).default('kb-knowledge-team@mmc.com'))
- `src/config/__tests__/env.test.ts` — 3 new tests for CONTENT_STEWARD_EMAIL (default, custom, invalid-no-at)
- `.env.example` — CONTENT_STEWARD_EMAIL placeholder block added
- `src/grounding/sources/servicenow-form.md` — version="live" → version="2026-04-23"
- `src/app/api/sources/route.ts` — GET /api/sources (nodejs, force-dynamic); 400/404/200 contract
- `src/app/api/sources/__tests__/route.test.ts` — 14 tests covering all paths + cache headers + shape contract
- `src/app/api/config/route.ts` — GET /api/config (nodejs, force-dynamic); {versions, contentStewardEmail}
- `src/app/api/config/__tests__/route.test.ts` — 11 tests covering versions + email + headers + shape
- `src/grounding/__tests__/registry.test.ts` — SNOW_FORM version assertion updated (toBe('live') → toMatch regex)
- `src/grounding/__tests__/__snapshots__/systemPrompt.test.ts.snap` — snapshots updated to reflect version change

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Badge labels use exact REGISTRY section titles | Registry parity test asserts `badge.label === section.title`; required exact match means labels like 'Resolution Field — Software (11-point)' not abbreviated forms |
| KB0020882/attachments stays blue (not purple) | RESEARCH §78: handover §14 'Attachments purple' refers to SNOW_FORM fields; source-level blue for all KB0020882 sections is correct |
| KB0020882/categorisation → amber/Tags | Handover §14 explicitly assigns 'Categories amber' as a section-level group override |
| SNOW_FORM version='live' → '2026-04-23' | TRST-01 freshness line format 'Form schema YYYY-MM-DD' requires a dated string; 'live' cannot be parsed as a date |
| /api/config test mocks env() | Route calls env() which validates LLM_* vars; test env doesn't have them; vi.mock('@/config/env') returns controlled Env object — cleaner than seeding all LLM vars |
| sourceTitles legacy keys preserved | Phase-3 'resolution', 'form-fields', etc. are not real registry section_ids but UTIL-01 tests reference them; removing would break 7 existing tests |
| registry.test.ts version assertion widened | Old assertion `toBe('live')` hardcoded the pre-change value; updated to `toMatch(/^\d{4}-\d{2}-\d{2}$/)` so the assertion holds for any dated version |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Section titles in badge labels must match REGISTRY exactly**

- **Found during:** Task 1 (writing sourceBadges.test.ts registry parity test)
- **Issue:** Plan's badge constant template used abbreviated labels ('Knowledge Blocks', 'Resolution Field — Software') that did not match actual REGISTRY section titles ('Knowledge Blocks (Knowledge Team Only)', 'Resolution Field — Software (11-point)') — would have failed the parity test
- **Fix:** Used exact `## Heading` text from each source file as the `label` value
- **Files modified:** src/ui/sourceBadges.ts, src/ui/sourceTitles.ts, src/ui/__tests__/sourceBadges.test.ts
- **Verification:** Registry parity test green (27 tests pass)
- **Committed in:** 2a54877

**2. [Rule 1 - Bug] Duplicate 'required-fields' key in sourceTitles.ts**

- **Found during:** Task 1 (esbuild warning during test run)
- **Issue:** 'required-fields' section_id exists in both KB0020882 and SNOW_FORM; added the key twice in the flat Record leading to duplicate-key vite warning
- **Fix:** Single 'required-fields' entry with label 'Required Fields' — both sources use same label so no conflict
- **Files modified:** src/ui/sourceTitles.ts
- **Verification:** No esbuild duplicate-key warning; tests green
- **Committed in:** 2a54877

**3. [Rule 1 - Bug] systemPrompt snapshot failures after SNOW_FORM version change**

- **Found during:** Task 2 verification (pnpm test --run full suite)
- **Issue:** composeSystemPrompt includes raw REGISTRY source text which embeds the `version="..."` attribute; 2 snapshots still expected `version="live"`
- **Fix:** `pnpm test --update` on systemPrompt.test.ts — snapshots updated to reflect `version="2026-04-23"` (intentional, expected change)
- **Files modified:** src/grounding/__tests__/__snapshots__/systemPrompt.test.ts.snap
- **Verification:** All 38 test files green
- **Committed in:** a8c503e

**4. [Rule 1 - Bug] registry.test.ts hardcoded 'live' version string**

- **Found during:** Task 2 verification (full test run)
- **Issue:** `expect(REGISTRY.SNOW_FORM.version).toBe('live')` failed after intentional version change
- **Fix:** Updated assertion to `toMatch(/^\d{4}-\d{2}-\d{2}$/)` — flexible for future dated versions
- **Files modified:** src/grounding/__tests__/registry.test.ts
- **Committed in:** a8c503e

---

**Total deviations:** 4 auto-fixed (all Rule 1 — bug fixes propagating from intentional plan change + label exactness)
**Impact on plan:** All auto-fixes necessary for correctness; no scope creep. The SNOW_FORM version change was planned; the downstream snapshot + registry test updates are mechanical consequences.

## Issues Encountered

None beyond the auto-fixed deviations above.

## User Setup Required

None — all new routes are read-only and require no external service configuration. `CONTENT_STEWARD_EMAIL` has a valid default; teams must update it in App Service settings before Phase 6 pilot.

## Next Phase Readiness

- **Plan 02 (source-panel-and-chip-integration):** SOURCE_BADGES + /api/sources fully ready. Chip components can call `getSourceBadge(source_id, section_id)` and fetch section body from `/api/sources`.
- **Plan 03 (fallback-card-trust-header-about-tooltip):** /api/config + CONTENT_STEWARD_EMAIL ready. Header freshness line can fetch `versions` from `/api/config`. FBK-04 mailto builder has the email via the API.
- **Plan 04 (e2e-success-criteria-and-anchor-check):** Both routes return correct JSON and Cache-Control headers. E2E tests can call them directly.

---
*Phase: 04-source-panel-trust-and-fallback-ui*
*Completed: 2026-04-23*
