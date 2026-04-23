---
phase: 04-source-panel-trust-and-fallback-ui
plan: "04"
subsystem: testing
tags: [playwright, vitest, e2e, unit-test, anchor-ids, fallback, source-panel, mailto, about-popover]

# Dependency graph
requires:
  - phase: 04-02-source-panel-and-chip-integration
    provides: SourcePanel (Radix Dialog modal=false, aria-labelledby="source-panel-title"), citation chips, usePanelState
  - phase: 04-03-fallback-card-trust-header-about-tooltip
    provides: FallbackCard (Pitfall-20 three-signal), mailto builder, useAboutTooltip localStorage gate, FreshnessLine
provides:
  - "5 Playwright specs mapping 1:1 to Phase-4 SCs (#1–#5)"
  - "anchorIds.test.ts: 3 Vitest assertions locking section IDs to kebab-case anchors (Pitfall 19)"
  - "mockConfig, mockSources, mockChatWithCitations, mockChatFallbackPage fixture helpers in mockChat.ts"
  - "Pitfall 16 E2E: chip AND panel badge both assert icon (svg) + colour class"
  - "Pitfall 20 E2E: FallbackCard asserts border + bg + CircleOff icon + bold heading + no message affordances simultaneously"
  - "Phase-3 E2E regression fixes: About popover 3-li collision, panel intercept on New Conversation, getByText KB0022991 strict-mode collision"
affects:
  - Phase 5 (SSO & Teams Delivery) — all 19 E2E + 516 unit tests green; phase handoff verified
  - Phase 6 (Telemetry, Evals & Pilot Hardening) — E2E baseline established

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "sessionStorage guard for addInitScript: use sessionStorage.getItem('__e2e_initialized') not window property — survives page.reload()"
    - "Panel dialog scoping: locator('[aria-labelledby=\"source-panel-title\"]') avoids strict-mode collision with AboutPopover and ChangeRoleDialog"
    - "Post-click text assertion: use locator('a', {hasText}) not getByRole when aria-label is static and text content changes"
    - "Phase-3 E2E compat: suppress About popover in any test using mockChatSuccess by setting localStorage.setItem('about_tooltip_seen_v1','true')"

key-files:
  created:
    - src/grounding/__tests__/anchorIds.test.ts
    - tests-e2e/source-panel-first-citation.spec.ts
    - tests-e2e/source-panel-updates-and-chip-reopen.spec.ts
    - tests-e2e/source-panel-footer-and-badges.spec.ts
    - tests-e2e/fallback-and-flag-gap.spec.ts
    - tests-e2e/trust-header-and-about-tooltip.spec.ts
  modified:
    - tests-e2e/fixtures/mockChat.ts
    - tests-e2e/role-select.spec.ts
    - tests-e2e/chat-happy-path.spec.ts
    - tests-e2e/controls-stop-new-change.spec.ts

key-decisions:
  - "Use section DOM id (#resolution-field-software) instead of getByRole(heading) to avoid strict-mode collision when Dialog.Title and body h2 share same text"
  - "Use sessionStorage guard (not window property) for addInitScript so page.reload() within a test does NOT re-clear storage"
  - "FallbackCard flag-link label-swap asserted via locator('a', {hasText:/Opened in mail client/}) since aria-label is static; post-click text content is the variable signal"
  - "mockChatFallbackPage is a page-level variant (takes Page not Route) to avoid overwriting the existing route-level mockChatFallback in mockChat.ts"
  - "Phase-3 regressions fixed by: (a) suppressing About popover in beforeEach, (b) closing panel before New Conversation, (c) scoping chip assertion to getByRole('button', {name:/Open source .../}) instead of getByText"

patterns-established:
  - "SC → spec 1:1 mapping: one Playwright spec per Phase SC, each file named to match the SC content"
  - "Pitfall invariants as named comments: explicit 'Pitfall N:' comment blocks in specs document the invariant being asserted"
  - "Phase-3 E2E compatibility contract: any test using mockChatSuccess must suppress About popover and handle SourcePanel intercept"

# Metrics
duration: 37min
completed: "2026-04-23"
---

# Phase 4 Plan 04: E2E Success Criteria and Anchor Check Summary

**Full behavioural coverage of all 5 Phase-4 SCs via Playwright (19 E2E specs green) + Pitfall-19 Vitest unit test locking section IDs to authored kebab-case anchors**

## Performance

- **Duration:** 37 min
- **Started:** 2026-04-23T08:11:29Z
- **Completed:** 2026-04-23T08:48:29Z
- **Tasks:** 3
- **Files modified:** 10 (6 created, 4 modified)

## Accomplishments

- Pitfall 19 locked at two layers: Vitest unit test (3 assertions: kebab-case format, `<!-- section:ID -->` in raw file, title != id drift guard) + Playwright DOM assertion (`#resolution-field-software` present in panel body)
- 5 Playwright specs created, one per Phase-4 SC, covering auto-open + badge + section content, panel-update + chip-reopen, footer permalink, fallback three-signal, freshness line + About tooltip first-run lifecycle
- Pitfall 20 three-signal invariant asserted simultaneously: `border-amber-400` class, `bg-amber-50` class, `svg` visible (CircleOff), `h3.font-bold` — PLUS no avatar text, no timestamp, no copy/feedback buttons
- Pitfall 16 asserted on BOTH chip button AND panel header badge: each has `bg-blue-50` colour class AND `svg` child (icon)
- Phase-3 E2E regressions identified and fixed: About popover adding 3 `<li>` items to chip counts; SourcePanel z-50 blocking "New conversation" button; `getByText(/KB0022991/)` strict-mode collision with panel badge

## Task Commits

Each task was committed atomically:

1. **Task 1: Anchor-check Vitest test + mock fixtures extension** - `de22bb6` (test)
2. **Task 2: Playwright specs — SC #1, SC #2, SC #3** - `004ebf4` (test)
3. **Task 3: Playwright specs — SC #4, SC #5 + Phase-3 regression fixes** - `0954be5` (test)

**Plan metadata:** `[pending]` (docs: complete e2e-success-criteria-and-anchor-check plan)

## Files Created/Modified

- `src/grounding/__tests__/anchorIds.test.ts` — 3-assertion Pitfall-19 unit test (kebab-case ids, raw file marker, title!=id drift guard)
- `tests-e2e/fixtures/mockChat.ts` — Added `mockConfig`, `mockSources`, `mockChatWithCitations`, `mockChatFallbackPage` (page-level variants)
- `tests-e2e/source-panel-first-citation.spec.ts` — SC#1: auto-open + blue badge + Pitfall-19 DOM id + body content
- `tests-e2e/source-panel-updates-and-chip-reopen.spec.ts` — SC#2: panel updates on follow-up + chip re-opens older source
- `tests-e2e/source-panel-footer-and-badges.spec.ts` — SC#3: permalink + Pitfall-16 (icon+colour on chip AND badge) + Pitfall-19
- `tests-e2e/fallback-and-flag-gap.spec.ts` — SC#4: Pitfall-20 three-signal + mailto URL decode + CRLF + label-swap
- `tests-e2e/trust-header-and-about-tooltip.spec.ts` — SC#5: freshness line + first-run About popover + dismiss persists + click re-opens
- `tests-e2e/role-select.spec.ts` — Phase-3 fix: suppress About popover 3-li collision
- `tests-e2e/chat-happy-path.spec.ts` — Phase-3 fix: About popover suppression + scoped chip assertion
- `tests-e2e/controls-stop-new-change.spec.ts` — Phase-3 fix: close panel before "New conversation" click

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Use `#section-id` locator instead of `getByRole(heading)` for body content | Dialog.Title and body h2 both render the section name — strict-mode violation if matched by heading role/name |
| `sessionStorage.getItem('__e2e_initialized')` guard (not window property) | Window properties don't survive `page.reload()`; sessionStorage does within same tab — Phase-3 established pattern |
| `locator('a', {hasText:/Opened in mail client/})` for post-click state | FallbackCard's `aria-label` attribute stays static; only text content changes after `setFlagged(true)` |
| `mockChatFallbackPage` (not renaming existing `mockChatFallback`) | The existing `mockChatFallback` takes a `Route` not a `Page`; creating a page-level variant preserves Phase-3 tests' call signatures |
| Close panel via button before "New conversation" in Phase-3 test | Panel at `z-50 fixed right-0 w-[40vw]` overlaps header button area on 1280px viewport |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Strict-mode heading collision in SC#1 and SC#2 specs**
- **Found during:** Task 2 (SC#1 + SC#2 specs)
- **Issue:** `panel.getByRole('heading', { name: /Resolution Field/i })` resolved to 2 elements — `Dialog.Title` (`id="source-panel-title"`) AND body `<h2>` both render the section name from `useSourceContent`
- **Fix:** Changed body heading assertion to `panel.locator('#resolution-field-software')` (the wrapper div carries the section id as DOM id per SourcePanel implementation)
- **Files modified:** `tests-e2e/source-panel-first-citation.spec.ts`, `tests-e2e/source-panel-updates-and-chip-reopen.spec.ts`
- **Verification:** Both specs pass without strict-mode violation
- **Committed in:** `004ebf4`

**2. [Rule 1 - Bug] window property guard broke SC#5 reload assertion**
- **Found during:** Task 3 (SC#5 spec — trust-header-and-about-tooltip)
- **Issue:** Used `(window as any).__e2e_initialized` as addInitScript guard. On `page.reload()`, `window` is a fresh object, guard evaluates to undefined → treated as first run → sessionStorage + localStorage re-cleared → role lost → freshness line not visible
- **Fix:** Switched to `sessionStorage.getItem('__e2e_initialized')` as guard (identical to Phase-3 role-contamination.spec.ts pattern)
- **Files modified:** `tests-e2e/trust-header-and-about-tooltip.spec.ts`
- **Verification:** SC#5 passes; reload preserves role and localStorage seen flag
- **Committed in:** `0954be5`

**3. [Rule 1 - Bug] FallbackCard flag-link aria-label unchanged after click**
- **Found during:** Task 3 (SC#4 spec — fallback-and-flag-gap)
- **Issue:** `getByRole('link', { name: /Opened in mail client/i })` failed — FallbackCard's `<a>` keeps its static `aria-label="Flag this gap to the CTSS Knowledge team"` even after `setFlagged(true)`; only text content changes
- **Fix:** Used `fallback.locator('a', { hasText: /Opened in mail client/i })` which matches on text content not accessible name
- **Files modified:** `tests-e2e/fallback-and-flag-gap.spec.ts`
- **Verification:** SC#4 passes; post-click label state correctly asserted
- **Committed in:** `0954be5`

**4. [Rule 1 - Bug] Phase-3 E2E regressions from Phase-4 SourcePanel + AboutPopover**
- **Found during:** Task 3 (full E2E suite run)
- **Issue:** Phase-4 shipped SourcePanel (auto-opens on first citation) and AboutPopover (auto-opens first-run). This broke 4 Phase-3 specs:
  - `role-select.spec.ts`: `getByRole('listitem')` count inflated by 3 AboutPopover `<li>` items (consumer 5→8, author 8→11)
  - `chat-happy-path.spec.ts`: `getByText(/KB0022991/)` matched both citation chip AND panel badge header → strict-mode violation
  - `controls-stop-new-change.spec.ts`: SourcePanel at `z-50 fixed right-0 40vw` blocked "New conversation" button pointer events
- **Fix:** (a) Added `localStorage.setItem('about_tooltip_seen_v1', 'true')` to `beforeEach` / `addInitScript` in all three Phase-3 tests; (b) Changed chip assertion to `getByRole('button', {name:/Open source KB0022991/})`; (c) Added conditional panel-close before "New conversation" click
- **Files modified:** `tests-e2e/role-select.spec.ts`, `tests-e2e/chat-happy-path.spec.ts`, `tests-e2e/controls-stop-new-change.spec.ts`
- **Verification:** All 19 E2E specs pass; 4 previously-failing Phase-3 tests green
- **Committed in:** `0954be5`

---

**Total deviations:** 4 auto-fixed (all Rule 1 — bugs discovered during spec authoring and regression suite run)
**Impact on plan:** All fixes were necessary for correct test assertions. No scope creep; all fixes narrowly targeted to the spec files.

## Playwright v1.59.1 Quirks Encountered

- **SSE `route.fulfill` header behaviour**: Playwright v1.59.1 supports `contentType` field on route.fulfill for JSON routes, and explicit `headers` object for SSE routes. Used `body: frames.join('')` (string concatenation) for multi-frame SSE mock — consistent with Phase-3 approach.
- **`mailto:` navigation prevention**: Playwright navigates to `mailto:` URLs when clicked; handled via `document.addEventListener('click', e => { if (a) e.preventDefault() }, true)` injected before click. The `<a>` element's `href` remains assertable after click via `toHaveAttribute`.
- **Panel dialog scope**: Radix Dialog.Content gets `role="dialog"` automatically. Used `locator('[aria-labelledby="source-panel-title"]')` to uniquely scope assertions — more stable than `getByRole('dialog')` which returns multiple elements when SourcePanel + ChangeRoleDialog + AboutPopover are all open.

## Test Count Summary

- **Unit tests:** 516 green (513 pre-existing + 3 new from `anchorIds.test.ts`)
- **E2E specs:** 19 green (14 Phase-3 + 5 new Phase-4; all on Playwright v1.59.1 / Chromium)

## Next Phase Readiness

Phase 4 is fully behaviourally verified:
- All 5 SCs proven by dedicated Playwright specs
- Pitfall 19 enforced at CI level (Vitest) and browser level (Playwright DOM id check)
- Pitfall 20 three-signal invariant machine-checked
- Pitfall 16 icon+colour pairing machine-checked on both chip and panel badge
- No regressions in Phase-3 tests (14 specs still green)
- 516 unit tests green; `pnpm typecheck` clean

**Phase 5 (SSO & Teams Delivery) is UNBLOCKED.**

---
*Phase: 04-source-panel-trust-and-fallback-ui*
*Completed: 2026-04-23*
