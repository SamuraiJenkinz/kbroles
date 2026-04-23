---
phase: 03-role-experience-and-chat-ui
plan: 01
subsystem: ui
tags: [tailwind, radix, lucide-react, playwright, react-testing-library, jsdom, vitest, postcss, next-app-router]

# Dependency graph
requires:
  - phase: 02-chat-backend-bff
    provides: Phase-2 POST /api/chat SSE + GET /api/prompts wire contracts; all server modules compiled and tested

provides:
  - Tailwind v4 CSS-first stack installed (tailwindcss@4.2.4, @tailwindcss/postcss@4.2.4) — no tailwind.config.js
  - Radix Primitives installed (@radix-ui/react-dialog, react-tooltip, react-radio-group, react-popover @1.x)
  - lucide-react@1.8.0 + clsx@2.1.1 + tailwind-merge@3.5.0 installed
  - @vitejs/plugin-react@5.2.0 added to vitest; include glob widened to .test.tsx
  - Playwright@1.59.1 + chromium binary; playwright.config.ts with webServer pnpm dev :3000
  - @testing-library/react@16.3.2 + @testing-library/user-event@14.6.1 + jsdom@29.0.2 in devDeps
  - Root app shell: layout.tsx + globals.css (13 @theme tokens) + providers.tsx (Radix Tooltip.Provider) + placeholder page.tsx
  - postcss.config.mjs wired with @tailwindcss/postcss

affects:
  - 03-02-pure-primitives (types + reducers already complete; can now import Tailwind utilities via globals.css)
  - 03-03 onwards (all component plans — Tailwind, Radix, lucide, RTL, Playwright all available)
  - 03-06 E2E (playwright.config.ts, tests-e2e/ scaffold, chromium binary ready)

# Tech tracking
tech-stack:
  added:
    - tailwindcss@4.2.4 (CSS-first, no tailwind.config.js)
    - "@tailwindcss/postcss@4.2.4"
    - postcss@8.5.10
    - "@radix-ui/react-dialog@1.1.15"
    - "@radix-ui/react-tooltip@1.2.8"
    - "@radix-ui/react-radio-group@1.3.8"
    - "@radix-ui/react-popover@1.1.15"
    - lucide-react@1.8.0
    - clsx@2.1.1
    - tailwind-merge@3.5.0
    - "@vitejs/plugin-react@5.2.0"
    - "@testing-library/react@16.3.2"
    - "@testing-library/user-event@14.6.1"
    - jsdom@29.0.2
    - "@playwright/test@1.59.1"
  patterns:
    - "Tailwind v4 CSS-first: @import 'tailwindcss' + @theme block in globals.css; no JS config file"
    - "Per-file jsdom override: vitest environment stays 'node' globally; UI tests use // @vitest-environment jsdom docblock"
    - "Radix Tooltip.Provider mounted once at root (providers.tsx) so all descendant Tooltip.Root inherit delayDuration"

key-files:
  created:
    - src/app/globals.css
    - src/app/layout.tsx
    - src/app/providers.tsx
    - src/app/page.tsx
    - postcss.config.mjs
    - playwright.config.ts
    - tests-e2e/.gitkeep
  modified:
    - package.json
    - pnpm-lock.yaml
    - vitest.config.mts
    - .gitignore

key-decisions:
  - "@vitejs/plugin-react pinned to 5.2.0 (vite ^4-^7 peer range): @6.0.1 default install requires vite@^8 but vitest 3 ships with vite 7; 5.2.0 is the latest version whose peer range includes vite 7"
  - "vitest include glob widened to .test.tsx — no global env change; node remains default; per-file docblock // @vitest-environment jsdom for all UI tests (Plan 03+)"
  - "postcss.config.mjs uses @tailwindcss/postcss, NOT legacy 'tailwindcss' PostCSS entry (Tailwind v4 breaking change)"
  - "page.tsx is static server component with no Date.now/Math.random (Pitfall 6 — SSR/CSR hydration mismatch prevention)"
  - "tests-e2e/.gitkeep placeholder committed; Plan 06 adds specs; Playwright config reuseExistingServer=true in non-CI"

patterns-established:
  - "Tailwind theme tokens: all design tokens defined in @theme block (globals.css), referenced as CSS custom properties by all downstream components"
  - "Provider tree pattern: providers.tsx 'use client' wrapper is the only client boundary at root; layout.tsx remains a server component"
  - "Playwright config: testDir=./tests-e2e, webServer.command='pnpm dev'; CI gating via forbidOnly/retries"

# Metrics
duration: 4min
completed: 2026-04-23
---

# Phase 3 Plan 01: Scaffold UI Stack Summary

**Tailwind v4 CSS-first + Radix Primitives + lucide-react + Playwright@1.59.1 + RTL/jsdom installed; root Next.js app shell (layout/globals/providers/page) rendering; 264 tests green**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-23T02:33:22Z
- **Completed:** 2026-04-23T02:37:30Z
- **Tasks:** 2
- **Files modified:** 11 (created: globals.css, layout.tsx, providers.tsx, page.tsx, postcss.config.mjs, playwright.config.ts, tests-e2e/.gitkeep; modified: package.json, pnpm-lock.yaml, vitest.config.mts, .gitignore)

## Accomplishments

- All Phase-3 runtime deps installed: Tailwind v4, 4 Radix primitive packages, lucide-react, clsx, tailwind-merge
- All Phase-3 test infra installed: @vitejs/plugin-react@5.2.0 (vite-7-compatible), @testing-library/react + user-event, jsdom, @playwright/test@1.59.1 + chromium binary
- Root Next.js app shell complete: layout.tsx (server component, metadata), globals.css (13 design tokens in @theme block), providers.tsx (Radix Tooltip.Provider at root), placeholder page.tsx (static, hydration-safe)
- pnpm test 264/264 green; pnpm typecheck clean; pnpm exec playwright --version works

## Task Commits

Each task was committed atomically:

1. **Task 1.1: Install deps + wire postcss + vitest-react + Playwright** - `5465be6` (chore)
2. **Task 1.2: Root app shell — layout.tsx, globals.css, providers.tsx, placeholder page.tsx** - `19cc9f3` (feat)

**Plan metadata:** (pending — this commit)

## Files Created/Modified

- `package.json` — added 7 runtime deps + 8 devDeps + test:e2e script
- `pnpm-lock.yaml` — lockfile updated
- `postcss.config.mjs` — @tailwindcss/postcss plugin; Tailwind v4 build wiring for Next.js
- `vitest.config.mts` — react() plugin added; include widened to .test.tsx
- `playwright.config.ts` — testDir=tests-e2e, chromium project, webServer pnpm dev :3000
- `tests-e2e/.gitkeep` — placeholder; Plan 06 adds E2E specs here
- `.gitignore` — added /test-results/, /playwright-report/, /blob-report/, /playwright/.cache/
- `src/app/globals.css` — @import 'tailwindcss'; @theme block with 13 design tokens; focus-ring baseline
- `src/app/layout.tsx` — root server layout; html lang=en; wraps children in Providers; metadata
- `src/app/providers.tsx` — 'use client' Radix Tooltip.Provider delayDuration=300
- `src/app/page.tsx` — placeholder server component; static markup; Plan 05 replaces with ChatPage

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| @vitejs/plugin-react@5.2.0 (not 6.0.1 default) | @6.0.1 requires vite@^8; vitest 3.x ships with vite 7; 5.2.0 peer range includes vite 7 |
| vitest include widened to .test.tsx, node env unchanged | Per-file `// @vitest-environment jsdom` docblock is the Vitest documented pattern; avoids performance hit on 264 existing node-env tests |
| @tailwindcss/postcss (not legacy tailwindcss PostCSS entry) | Tailwind v4 breaking change — the CSS-first approach requires the new postcss plugin |
| page.tsx static server component, no Date.now/Math.random | Pitfall 6 — prevents SSR/CSR hydration mismatch; visual smoke for Tailwind compile |
| Radix Tooltip.Provider at app root in providers.tsx | All descendant Tooltip.Root instances inherit delayDuration=300 without per-component prop |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] @vitejs/plugin-react version downgrade 6.0.1 → 5.2.0**

- **Found during:** Task 1.1 (dev dependency install)
- **Issue:** `pnpm add -D @vitejs/plugin-react` resolved to 6.0.1 which requires `vite@^8.0.0` as peer dependency. vitest@3.2.4 ships with vite@7.3.2. The peer mismatch would cause vitest to fail to compile .tsx files in tests.
- **Fix:** Immediately ran `pnpm add -D @vitejs/plugin-react@5.2.0` — latest version whose peer range supports vite 7 (peer: `^4.2.0 || ^5.0.0 || ^6.0.0 || ^7.0.0 || ^8.0.0`).
- **Files modified:** package.json, pnpm-lock.yaml
- **Verification:** `pnpm test` ran 264 tests without errors; `pnpm typecheck` clean.
- **Committed in:** `5465be6` (Task 1.1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential version pin — without it the vitest React JSX transform would fail at runtime on any .tsx test file. No scope creep.

## Issues Encountered

- Parallel Plan 02 (pure-primitives) had already created `src/lib/time.ts`, `src/lib/__tests__/time.test.ts`, `src/ui/sourceTitles.ts`, `src/ui/__tests__/sourceTitles.test.ts` in the working tree before this plan committed Task 1.2. Those files were staged as untracked and landed in the Task 1.2 commit (`19cc9f3`). This is the expected Wave-1 parallel merge behaviour — no conflict, no rework needed.

## User Setup Required

None — no external service configuration required. Playwright chromium binary was installed automatically via `playwright install --with-deps chromium`.

## Next Phase Readiness

- Tailwind v4 utilities resolve for all downstream plans (Plans 02–06)
- Radix primitive imports are available in all plans
- lucide-react, clsx, tailwind-merge importable
- @testing-library/react + jsdom available for component tests (per-file `// @vitest-environment jsdom` docblock)
- Playwright config + chromium binary ready for Plan 06 E2E specs
- Root shell (layout + providers + globals.css) renders at http://localhost:3000 — Plan 05 replaces page.tsx body with ChatPage
- pnpm test 264/264 green; pnpm typecheck clean

---

*Phase: 03-role-experience-and-chat-ui*
*Completed: 2026-04-23*
