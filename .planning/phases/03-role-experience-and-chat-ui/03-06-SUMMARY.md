---
phase: 03-role-experience-and-chat-ui
plan: 06
subsystem: testing
tags: [playwright, e2e, sse, role-select, chat-ui, clipboard, sessionStorage, pitfall-13, pitfall-17]

# Dependency graph
requires:
  - phase: 03-plans-01-to-05
    provides: full chat surface (ChatPage, ChatSurface, RoleSelect, Header, InputBar, AssistantControls, FeedbackPanel, ErrorCard, Greeting, ChipRow, ChangeRoleDialog)
  - phase: 03-plan-01
    provides: playwright.config.ts with webServer + testDir + chromium project
provides:
  - Browser-level proof of all 5 Phase-3 Success Criteria via 14 Playwright specs
  - Pitfall 13 regression: mid-stream change-role does not leak old-role text
  - Pitfall 17 regression: refresh restores draft-only, not message history
  - Shared SSE mock fixture (tests-e2e/fixtures/mockChat.ts) for future E2E expansion
affects: [phase-4, phase-5, phase-6]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Playwright route mocking for SSE via route.fulfill with string body (not ReadableStream — v1.59.1 does not support streaming bodies)"
    - "mockChatSlow uses 30s delay before fulfill so isStreaming=true is observable before response completes"
    - "test.addInitScript with __e2e_initialized flag to clear sessionStorage once per test lifecycle, not on every reload"
    - "Clipboard normalization: CRLF→LF + line.trimEnd() before toBe() assertion (Windows clipboard adds trailing whitespace)"
    - "ErrorCard strict-mode fix: filter role=alert by hasText to exclude Next.js route-announcer"
    - "Chip label collisions avoided by using specific answer text (/flag an article by clicking/i) not generic (/flag an article/i)"

key-files:
  created:
    - tests-e2e/fixtures/mockChat.ts
    - tests-e2e/role-select.spec.ts
    - tests-e2e/chat-happy-path.spec.ts
    - tests-e2e/controls-stop-new-change.spec.ts
    - tests-e2e/keyboard-and-error-retry.spec.ts
    - tests-e2e/copy-and-feedback.spec.ts
    - tests-e2e/role-contamination.spec.ts
  modified: []

key-decisions:
  - "mockChatSlow uses a 30s delayed-fulfill (no body) rather than ReadableStream body — Playwright v1.59.1 route.fulfill only accepts string|Buffer; the delay keeps isStreaming=true visible to Playwright before the response arrives"
  - "Stop test does not assert partial delta text (no delta delivered before stop) — validates Stop button visibility and Send button re-enable only"
  - "Clipboard assertion normalizes CRLF and trailing whitespace before toBe() — Windows clipboard adds whitespace padding that is semantically irrelevant to UTIL-01 correctness"
  - "CHECKER Issue 2 enforced: ChangeRoleDialog confirm uses /change role and clear/i in all specs; popover option uses /^change role$/i — eliminates Radix portal teardown flake risk"

patterns-established:
  - "All /api/chat and /api/prompts calls mocked via page.route — E2E suite is fully hermetic (no MGTI traffic)"
  - "page.addInitScript with initialization flag pattern for sessionStorage reset that survives page.reload()"

# Metrics
duration: 11min
completed: 2026-04-23
---

# Phase 3 Plan 6: E2E Success Criteria Summary

**14 Playwright E2E specs across 6 spec files prove all 5 Phase-3 Success Criteria + Pitfall 13 (mid-stream role swap no leakage) + Pitfall 17 (draft-only persistence on refresh), all mocked via page.route SSE fixtures against pnpm dev**

## Performance

- **Duration:** ~11 min
- **Started:** 2026-04-23T07:39:52Z
- **Completed:** 2026-04-23T07:51:13Z
- **Tasks:** 2 (6.1 and 6.2)
- **Files created:** 7 (6 spec files + 1 fixture)

## Accomplishments

- 14 Playwright specs all green in 7.2s wall-clock (warm dev server)
- 355 unit tests still green — E2E files are outside Vitest's include glob
- Shared `tests-e2e/fixtures/mockChat.ts` with 5 helpers (mockChatSuccess, mockChatFallback, mockChatError, mockChatSlow, mockPrompts) each documented to api-chat-contract.md §3
- CHECKER Issue 2 fully enforced: ChangeRoleDialog confirm (`/change role and clear/i`) vs Header popover option (`/^change role$/i`) disambiguation in all relevant specs

## Playwright Version

`@playwright/test@1.59.1` (chromium only — webkit/firefox deferred to Phase 5 Teams-compatibility)

## SC → Spec Mapping

| SC | Spec file | Test names | Status |
|----|-----------|------------|--------|
| SC #1 | role-select.spec.ts | "shows two role cards on first visit"; "consumer pick → greeting + 5 chips"; "author pick → greeting + 8 chips"; "returning user (sessionStorage seeded) skips role-select" | ✅ 4/4 |
| SC #2 | chat-happy-path.spec.ts | "author chip click → streaming answer + controls + citation + timestamp" | ✅ 1/1 |
| SC #3 | controls-stop-new-change.spec.ts | "Stop cancels mid-stream..."; "New conversation clears without changing role"; "Change role → confirm via 'Change role and clear' → back to RoleSelect..." | ✅ 3/3 |
| SC #4 | keyboard-and-error-retry.spec.ts | "Enter submits; Shift+Enter inserts newline..."; "Server 5xx → ErrorCard with Retry → successful retry" | ✅ 2/2 |
| SC #5 | copy-and-feedback.spec.ts | "Copy writes exact UTIL-01 format including (Source: KB0022991 · Flagging Articles)"; "Thumbs-down opens panel with 4 radio options, NO free-text input" | ✅ 2/2 |
| Pitfall 13 | role-contamination.spec.ts | "Pitfall 13 — change role MID-STREAM does not leak old-role text into new bubble" | ✅ 1/1 |
| Pitfall 17 | role-contamination.spec.ts | "Pitfall 17 — refresh restores DRAFT but not message history; role persists" | ✅ 1/1 |

**Total: 14/14 specs green**

## Phase-3 Closure Checklist

Requirements confirmed covered by E2E or unit tests:

| Requirement | Covered by |
|-------------|-----------|
| AUTH-02 — messages not persisted across refresh | role-contamination Pitfall 17 |
| ROLE-01 — RoleSelect shows both cards | role-select SC#1 |
| ROLE-02 — consumer → 5 chips | role-select SC#1 |
| ROLE-03 — author → 8 chips | role-select SC#1 |
| ROLE-04 — Change role clears conversation | controls-stop-new-change SC#3 |
| ROLE-05 — returning user skips RoleSelect | role-select SC#1 |
| CHAT-01 — chip click submits prompt | chat-happy-path SC#2 |
| CHAT-02 — streaming answer renders | chat-happy-path SC#2 |
| CHAT-03 — Enter sends, Shift+Enter newline | keyboard-and-error-retry SC#4 |
| CHAT-04 — New conversation clears | controls-stop-new-change SC#3 |
| CHAT-05 — Stop cancels in-flight | controls-stop-new-change SC#3 |
| CHAT-06 — Timestamp tabindex=0 | chat-happy-path SC#2 |
| CHAT-07 — Retry re-sends, no duplicate question | keyboard-and-error-retry SC#4 |
| FDBK-01 — 👍/👎 controls visible | chat-happy-path SC#2 |
| FDBK-02 — no free-text in feedback panel | copy-and-feedback SC#5 |
| UTIL-01 — copy with exact citation suffix | copy-and-feedback SC#5 |

## Task Commits

Each task was committed atomically:

1. **Task 6.1: Mock fixtures + SC#1 + SC#2** - `b04eae5` (test)
2. **Task 6.2: SC#3/#4/#5 + Pitfall 13/17** - `5bd69f4` (test)

**Plan metadata:** `[pending]` (docs: complete plan)

## Files Created

- `tests-e2e/fixtures/mockChat.ts` — Shared SSE route mock helpers (≥80 lines, 5 exports)
- `tests-e2e/role-select.spec.ts` — SC#1 (4 specs)
- `tests-e2e/chat-happy-path.spec.ts` — SC#2 (1 comprehensive spec)
- `tests-e2e/controls-stop-new-change.spec.ts` — SC#3 (3 specs, CHECKER Issue 2 resolved)
- `tests-e2e/keyboard-and-error-retry.spec.ts` — SC#4 (2 specs)
- `tests-e2e/copy-and-feedback.spec.ts` — SC#5 (2 specs, clipboard permissions)
- `tests-e2e/role-contamination.spec.ts` — Pitfall 13 + Pitfall 17 (2 specs)

## Decisions Made

1. **mockChatSlow uses delayed fulfill not ReadableStream**: Playwright v1.59.1 `route.fulfill` only accepts `string|Buffer` bodies. Using a 30-second delay keeps `isStreaming=true` observable (set before fetch returns) so Stop button tests work correctly. The delay is effectively "never responds" for test purposes since AbortController fires first.

2. **Stop test validates button visibility, not partial delta**: Since no delta is delivered before the user clicks Stop (mock never responds), the test validates: Stop button appears immediately (isStreaming=true pre-fetch) → user clicks Stop → Send button reappears (isStreaming=false). Partial text assertion was removed as it is already covered by the unit tests (chatReducer stoppedByUser).

3. **Clipboard normalization for Windows CRLF**: Windows clipboard adds trailing whitespace and CRLF to text. The UTIL-01 assertion normalizes `\r\n` → `\n` and trims line endings before `toBe()`. The semantic content (source suffix string) is still asserted exactly.

4. **ErrorCard selector filtering**: Next.js injects a route-announcer element with `role="alert"` (used for SPA navigation announcements). `getByRole('alert')` in strict mode resolves to 2 elements. Fixed by adding `.filter({ hasText: /temporarily unavailable|.../ })` to target only the ErrorCard.

5. **sessionStorage init flag for reload-safe tests**: `page.addInitScript` runs on every navigation including `page.reload()`. For Pitfall 17, the role and draft must survive reload. Used `__e2e_initialized` flag in sessionStorage to clear only on first page load.

6. **Chip label collision**: Consumer chips include "How do I flag an article?" which matches `/flag an article/i`. After New Conversation or refresh, chips reappear and the selector would falsely match. Fixed by using full answer text `/flag an article by clicking/i` which only matches the response body.

## CHECKER Issue 2 Evidence

```
grep -c "change role and clear" tests-e2e/controls-stop-new-change.spec.ts
→ 1

grep -c "change role and clear" tests-e2e/role-contamination.spec.ts
→ 2
```

Both files that exercise the ChangeRoleDialog confirm button use the disambiguated `/change role and clear/i` selector. The `/^change role$/i` selector is used ONLY for the Header popover option (which opens the dialog), never for the dialog confirm button.

## Known Tradeoffs

- **Chromium only**: webkit and Firefox are Phase-5 Teams-compatibility concerns. Phase-3 is chromium-only.
- **SSE delivered as single fulfilled body**: `route.fulfill` in Playwright v1.59.1 does not support streaming bodies. Partial-frame buffering behavior is tested at unit level in Plan 03 `useChatStream`.
- **mockChatSlow uses delay not open stream**: The Stop button tests validate Stop button visibility and Send button re-enable, but cannot test "partial text preserved after Stop" via E2E (that invariant is covered by the unit test "Stop preserves accumulated text" in ChatSurface.test.tsx).
- **Real /api/chat integration (no mocks)**: Manually smoke-verified via `pnpm dev`. Future v1.1 could add a Playwright project targeting the real backend behind a feature flag.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] mockChatSlow ReadableStream approach not supported by Playwright v1.59.1**
- **Found during:** Task 6.1 first test run
- **Issue:** `route.fulfill` with `ReadableStream` body silently fell to catch block; catch returned single-delta complete body; `isStreaming` cleared immediately in `finally` before Playwright could click Stop
- **Fix:** Replaced ReadableStream body with a 30-second delayed `route.fulfill` — leverages `isStreaming=true` being set before the fetch call resolves (documented in `useChatStream`)
- **Files modified:** tests-e2e/fixtures/mockChat.ts, tests-e2e/controls-stop-new-change.spec.ts, tests-e2e/role-contamination.spec.ts
- **Verification:** Stop tests pass; Pitfall 13 test passes
- **Committed in:** 5bd69f4 (Task 6.2 commit)

**2. [Rule 1 - Bug] getByRole('alert') strict mode violation from Next.js route-announcer**
- **Found during:** Task 6.2 first test run
- **Issue:** Next.js injects `<div role="alert" aria-live="assertive" id="__next-route-announcer__">` — Playwright strict mode rejects `getByRole('alert')` when 2 elements match
- **Fix:** Added `.filter({ hasText: /temporarily unavailable|.../ })` to target only the ErrorCard
- **Files modified:** tests-e2e/keyboard-and-error-retry.spec.ts
- **Verification:** SC#4 error/retry test passes
- **Committed in:** 5bd69f4 (Task 6.2 commit)

**3. [Rule 1 - Bug] getByText(/flag an article/i) matched chip labels post-New-Conversation**
- **Found during:** Task 6.2 first test run (2 specs affected)
- **Issue:** Consumer chips contain "How do I flag an article?" which matches the generic `/flag an article/i` regex; chips reappear after New Conversation and page reload, causing false positives in `toHaveCount(0)` assertions
- **Fix:** Changed assertions to use full mock answer text `/flag an article by clicking/i` which only matches the response body
- **Files modified:** tests-e2e/controls-stop-new-change.spec.ts, tests-e2e/role-contamination.spec.ts
- **Verification:** Both "New conversation clears" and Pitfall 17 tests pass
- **Committed in:** 5bd69f4 (Task 6.2 commit)

**4. [Rule 1 - Bug] Windows clipboard adds CRLF and trailing whitespace to UTIL-01 string**
- **Found during:** Task 6.2 first test run
- **Issue:** `navigator.clipboard.readText()` returned lines with trailing spaces on Windows; caused `toBe()` assertion to fail against the expected clean `\n\n` separator
- **Fix:** Normalize clipboard text with `replace(/\r\n/g, '\n')` and `line.trimEnd()` before assertion; semantic UTIL-01 content still asserted with `.toBe()`
- **Files modified:** tests-e2e/copy-and-feedback.spec.ts
- **Verification:** Copy test passes
- **Committed in:** 5bd69f4 (Task 6.2 commit)

**5. [Rule 1 - Bug] page.addInitScript fires on every navigation including page.reload()**
- **Found during:** Task 6.2 first test run
- **Issue:** `beforeEach` used `sessionStorage.clear()` in addInitScript — this fired on `page.reload()` inside the Pitfall 17 test, wiping role and draft before the app could read them
- **Fix:** Added `__e2e_initialized` flag check so sessionStorage is cleared only on the first page load per test
- **Files modified:** tests-e2e/role-contamination.spec.ts
- **Verification:** Pitfall 17 test passes with role and draft surviving reload
- **Committed in:** 5bd69f4 (Task 6.2 commit)

---

**Total deviations:** 5 auto-fixed (all Rule 1 — bugs discovered during test execution)
**Impact on plan:** All auto-fixes necessary for test correctness on the target platform (Windows, Playwright v1.59.1, Chromium). No scope creep — all fixes are within the E2E test files only.

## Issues Encountered

None beyond the 5 auto-fixed deviations above.

## User Setup Required

None — E2E tests run via `pnpm test:e2e` against `pnpm dev`; no external services needed.

## Next Phase Readiness

- Phase 3 is behaviourally closed: all 5 SCs proven in browser + 2 pitfall regressions green
- 14 E2E specs + 355 unit tests green = 369 tests total
- Phase 4 (Source Pane + Distinct Fallback UI) can proceed immediately
- The shared `tests-e2e/fixtures/mockChat.ts` fixture is ready for Phase 4/5/6 E2E expansion
- Known constraint: mockChatSlow cannot test "partial text preserved after Stop" via E2E — that invariant is unit-tested only

---
*Phase: 03-role-experience-and-chat-ui*
*Completed: 2026-04-23*
