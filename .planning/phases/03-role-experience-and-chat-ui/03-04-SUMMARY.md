---
phase: 03-role-experience-and-chat-ui
plan: "04"
subsystem: ui
tags: [react, tailwind, radix-ui, lucide-react, testing-library, jsdom, forwardRef, clipboard, wcag]

# Dependency graph
requires:
  - phase: 03-01-scaffold-ui-stack
    provides: Tailwind v4, Radix primitives, lucide-react, @testing-library/react + user-event, jsdom
  - phase: 03-02-pure-primitives
    provides: Role, Message, Citation, ChipItem, Feedback types (types.ts); resolveSourceTitle (sourceTitles.ts); formatRelative (time.ts)
provides:
  - 13 presentational components: cn, RoleSelect, TypingDots, Timestamp, Message, MessageList, ChipRow, Header, AssistantControls, FeedbackPanel, ErrorCard, InputBar, ChangeRoleDialog
  - 6 jsdom test files: RoleSelect (9), Header (4), InputBar (9), AssistantControls (11), ErrorCard (8), ChangeRoleDialog (8) = 49 new tests
  - @testing-library/jest-dom installed; test-setup.ts + vitest globals + tsconfig types wired
  - InputBar forwardRef<HTMLTextAreaElement> contract locked for Plan 05 imperative focus
  - Message + MessageList onRetry?: (id: string) => void contract locked for Plan 05 dispatch wiring
  - ChangeRoleDialog confirm label "Change role and clear" locked for Plan 06 E2E selectors
affects:
  - 03-05-chat-surface-wiring (consumes ALL component contracts defined here)
  - 03-06-e2e-smoke (uses ChangeRoleDialog "Change role and clear" selector; Header "Change role" popover selector)

# Tech tracking
tech-stack:
  added:
    - "@testing-library/jest-dom@6.9.1 (devDependency)"
  patterns:
    - "Per-file @vitest-environment jsdom docblock for mixed node/jsdom test suite"
    - "forwardRef<HTMLTextAreaElement, Props> pattern for Plan 05 imperative focus"
    - "Object.defineProperty(navigator, 'clipboard', { configurable: true }) for test isolation"
    - "userEvent.setup({ writeToClipboard: false }) + direct dispatchEvent for clipboard tests with user-event v14"
    - "cn() = twMerge(clsx()) for all conditional className composition (Pitfall 7)"
    - "Radix primitives: Dialog (ChangeRoleDialog), Tooltip (Timestamp), Popover (Header), RadioGroup (FeedbackPanel)"

key-files:
  created:
    - src/chat-ui/cn.ts
    - src/chat-ui/RoleSelect.tsx
    - src/chat-ui/TypingDots.tsx
    - src/chat-ui/Timestamp.tsx
    - src/chat-ui/Message.tsx
    - src/chat-ui/MessageList.tsx
    - src/chat-ui/ChipRow.tsx
    - src/chat-ui/Header.tsx
    - src/chat-ui/AssistantControls.tsx
    - src/chat-ui/FeedbackPanel.tsx
    - src/chat-ui/ErrorCard.tsx
    - src/chat-ui/InputBar.tsx
    - src/chat-ui/ChangeRoleDialog.tsx
    - src/chat-ui/__tests__/RoleSelect.test.tsx
    - src/chat-ui/__tests__/Header.test.tsx
    - src/chat-ui/__tests__/InputBar.test.tsx
    - src/chat-ui/__tests__/AssistantControls.test.tsx
    - src/chat-ui/__tests__/ErrorCard.test.tsx
    - src/chat-ui/__tests__/ChangeRoleDialog.test.tsx
    - src/test-setup.ts
  modified:
    - vitest.config.mts (globals: true, setupFiles: test-setup.ts)
    - tsconfig.json (types: [vitest/globals, @testing-library/jest-dom])
    - package.json (@testing-library/jest-dom added to devDependencies)

key-decisions:
  - "@testing-library/jest-dom installed + vitest globals:true — existing node-env tests were not using toBeInTheDocument; needed to add globals and the setup file to unblock jsdom component tests"
  - "Object.defineProperty with configurable:true for clipboard mock — user-event v14 attachClipboardStubToView throws TypeError if the property is non-configurable; using configurable:true allows user-event to coexist"
  - "userEvent.setup({ writeToClipboard: false }) + raw dispatchEvent for copy tests — user-event v14 replaces navigator.clipboard on setup(); placing the mock BEFORE setup and using writeToClipboard:false prevents the replacement from losing our spy reference"
  - "InputBar forwardRef owned by Plan 04, not deferred to Plan 05 — the plan explicitly states contract ownership; Plan 05 is purely compositional and must not mutate these prop shapes"
  - "ChangeRoleDialog confirm label is 'Change role and clear' (not 'Change role') — selector disambiguation for Plan 06 E2E tests; Header popover option is 'Change role' (exact), confirm button is 'Change role and clear'"

patterns-established:
  - "All chat-ui components start with 'use client' and import ONLY from ./types, ./cn, @radix-ui/*, lucide-react, and @/lib or @/ui (never @/chat, @/grounding, @/prompts)"
  - "onRetry contract: MessageList passes onRetry through to Message without binding; Message calls onRetry?.(message.id) inside ErrorCard handler — hoist callbacks, pass references"
  - "FeedbackPanel Cancel semantics: closes panel only, does NOT dispatch onFeedback(null) — toggle-off is a separate code path (clicking thumbs-down again while down feedback is set)"

# Metrics
duration: 8min
completed: 2026-04-23
---

# Phase 3 Plan 04: Presentational Components Summary

**13 stateless chat-UI components with Radix Dialog/Tooltip/Popover/RadioGroup, InputBar forwardRef contract, Message/MessageList onRetry contract, and 49 new jsdom tests covering keyboard semantics, copy format, feedback panel, and Pitfall 16/18 regressions**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-23T02:42:07Z
- **Completed:** 2026-04-23T02:50:07Z
- **Tasks:** 2
- **Files modified:** 23 (20 created, 3 modified)

## Accomplishments

- Complete presentational layer for Phase 3: role-select landing, chat header, message bubbles + citations, typing dots, chip row, input bar with forwardRef, timestamp tooltip, change-role confirm dialog, inline feedback panel, error card — all stateless-over-props
- Locked Plan 05 contracts: InputBar is `forwardRef<HTMLTextAreaElement, InputBarProps>` (imperative focus after send); Message + MessageList both accept `onRetry?: (id: string) => void` (Plan 05 wires reducer dispatch); ChangeRoleDialog confirm button labelled "Change role and clear" (Plan 06 E2E selector unambiguous)
- 49 new tests across 6 jsdom test files; total repo: 340 tests green (was 264 before Phase 3 started; 76 new in Phase 3 Plans 01-04 combined)
- Pitfall 16 enforced at TWO surfaces by unit test: RoleSelect cards AND Header role pill both have `svg` + role-specific colour class assertions (ROLE-03 no longer E2E-only)

## Task Commits

1. **Task 4.1: Core layout components + RoleSelect + Header tests** - `eec6c72` (feat)
   - cn, RoleSelect, TypingDots, Timestamp, Message, MessageList, ChipRow, Header, AssistantControls, FeedbackPanel, ErrorCard
   - @testing-library/jest-dom setup, vitest globals, tsconfig types
   - RoleSelect.test.tsx (9 tests), Header.test.tsx (4 tests)

2. **Task 4.2: InputBar + ChangeRoleDialog + remaining tests** - `51e2d2c` (feat)
   - InputBar.tsx (forwardRef), ChangeRoleDialog.tsx (disambiguated confirm label)
   - InputBar.test.tsx (9 tests), AssistantControls.test.tsx (11 tests), ErrorCard.test.tsx (8 tests), ChangeRoleDialog.test.tsx (8 tests)

**Plan metadata:** pending (docs commit after SUMMARY + STATE)

## Files Created/Modified

| File | Lines | Description |
|------|-------|-------------|
| src/chat-ui/cn.ts | 6 | twMerge(clsx()) helper (Pitfall 7) |
| src/chat-ui/RoleSelect.tsx | 78 | Two-card landing, keyboard-first, icon+colour pair |
| src/chat-ui/TypingDots.tsx | 12 | ARIA live region (CHAT-02) |
| src/chat-ui/Timestamp.tsx | 31 | Radix Tooltip, tabIndex=0 (CHAT-06) |
| src/chat-ui/Message.tsx | 101 | User/assistant bubbles, citations, onRetry contract |
| src/chat-ui/MessageList.tsx | 55 | Message list + TypingDots injection + onRetry forwarding |
| src/chat-ui/ChipRow.tsx | 33 | Auto-submit chips with disabled guard (Pitfall 9) |
| src/chat-ui/Header.tsx | 64 | Role pill (Radix Popover, Pitfall 16) + New conversation |
| src/chat-ui/AssistantControls.tsx | 103 | Copy (UTIL-01) + thumbs pair, always visible |
| src/chat-ui/FeedbackPanel.tsx | 52 | Radix RadioGroup, 4 fixed options, no free text (FDBK-02) |
| src/chat-ui/ErrorCard.tsx | 62 | CHAT-07 error variants + X-Request-Id + Retry |
| src/chat-ui/InputBar.tsx | 65 | forwardRef<HTMLTextAreaElement>, Enter/Shift+Enter, Stop swap |
| src/chat-ui/ChangeRoleDialog.tsx | 48 | Radix Dialog, Cancel autoFocus, "Change role and clear" label |
| src/chat-ui/__tests__/RoleSelect.test.tsx | 92 | 9 tests: Tab/Enter/Space + Pitfall 16 |
| src/chat-ui/__tests__/Header.test.tsx | 42 | 4 tests: ROLE-03 pill icon+colour both roles |
| src/chat-ui/__tests__/InputBar.test.tsx | 179 | 9 tests: keyboard + forwardRef focus |
| src/chat-ui/__tests__/AssistantControls.test.tsx | 199 | 11 tests: UTIL-01 copy, Pitfall 10, thumbs, FeedbackPanel |
| src/chat-ui/__tests__/ErrorCard.test.tsx | 77 | 8 tests: 4 error codes + rate_limited + X-Request-Id |
| src/chat-ui/__tests__/ChangeRoleDialog.test.tsx | 73 | 8 tests: Pitfall 18 Cancel focus, CHECKER Issue 2 label |
| src/test-setup.ts | 1 | @testing-library/jest-dom import |
| vitest.config.mts | — | globals: true, setupFiles added |
| tsconfig.json | — | types: [vitest/globals, @testing-library/jest-dom] added |
| package.json + pnpm-lock.yaml | — | @testing-library/jest-dom 6.9.1 devDependency |

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| @testing-library/jest-dom installed + vitest globals:true | The existing hook tests used neither `toBeInTheDocument` nor RTL DOM matchers; no jest-dom setup existed. Needed globals:true so the setup file's `expect.extend()` call succeeds before vitest injects expect. |
| `configurable: true` on navigator.clipboard mock | user-event v14 `attachClipboardStubToView` throws `TypeError: Cannot redefine property` if the property is non-configurable. Setting `configurable: true` lets user-event coexist. |
| `userEvent.setup({ writeToClipboard: false })` + raw `dispatchEvent` for copy tests | user-event v14 replaces `navigator.clipboard` during setup() even with `writeToClipboard: false`. Placing the spy before `setup()` means the reference is replaced. Fix: use `clickButton(dispatchEvent)` directly for copy-specific tests so user-event never runs and our spy remains the active clipboard. |
| ErrorCard `role="alert"` announces on mount | Matches CONTEXT §Error card — "replace the in-progress bubble with an error card". alert role causes assistive tech to announce immediately on insertion. |
| AssistantControls import path uses `@/ui/sourceTitles` (not relative) | Consistent with how server modules import shared utilities; tree-shakeable and future-proof for barrel export if we add one. |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Install @testing-library/jest-dom + configure vitest globals**

- **Found during:** Task 4.1 (first typecheck after writing RoleSelect.test.tsx)
- **Issue:** `toBeInTheDocument` was not defined; the project had `@testing-library/react` but not `@testing-library/jest-dom`. Vitest did not have `globals: true` or a setup file. TypeScript did not have `@testing-library/jest-dom` in its types.
- **Fix:** `pnpm add -D @testing-library/jest-dom`; created `src/test-setup.ts` with `import '@testing-library/jest-dom'`; added `globals: true` + `setupFiles` to vitest.config.mts; added types to tsconfig.json.
- **Files modified:** package.json, pnpm-lock.yaml, vitest.config.mts, tsconfig.json, src/test-setup.ts
- **Verification:** `pnpm typecheck` clean; 302 tests green after Task 4.1.
- **Committed in:** eec6c72 (Task 4.1 commit)

**2. [Rule 1 - Bug] clipboard mock conflicts with user-event v14 setup**

- **Found during:** Task 4.2 (first AssistantControls test run)
- **Issue:** `Object.defineProperty(navigator, 'clipboard', ...)` without `configurable: true` caused `TypeError: Cannot redefine property: clipboard` when user-event v14's `attachClipboardStubToView` ran. Even with `configurable: true`, user-event replaced the mock reference so copy spy was never called.
- **Fix:** Copy-specific tests use raw `dispatchEvent` (bypasses user-event clipboard intercept); all other tests use `userEvent.setup()` normally. `configurable: true` ensures no TypeError for tests that don't care about clipboard.
- **Files modified:** src/chat-ui/__tests__/AssistantControls.test.tsx
- **Verification:** All 11 AssistantControls tests pass.
- **Committed in:** 51e2d2c (Task 4.2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking — missing jest-dom setup; 1 bug — clipboard test isolation)
**Impact on plan:** Both auto-fixes necessary. No scope change. All contracts ship as specified.

## Contract Summary (CHECKER Issue 1 Fix B)

- `InputBar` exports `forwardRef<HTMLTextAreaElement, InputBarProps>` — Plan 05 consumes via `<InputBar ref={inputRef} />` and calls `inputRef.current?.focus()` after send + role-transition.
- `Message` and `MessageList` both expose `onRetry?: (id: string) => void` — MessageList forwards to Message; Message calls `onRetry?.(message.id)` via the ErrorCard handler. Plan 05 provides the actual reducer dispatch handler.
- **Plan 05 is purely compositional and MUST NOT mutate these prop shapes.**

## Disambiguated Labels (CHECKER Issue 2)

- Header popover option: `"Change role"` — triggers opening ChangeRoleDialog
- ChangeRoleDialog confirm button: `"Change role and clear"` — confirms the change + clears conversation
- Plan 06 E2E selectors: `getByRole('button', { name: /^change role$/i })` opens dialog; `getByRole('button', { name: /change role and clear/i })` confirms

## ROLE-03 Unit Coverage (CHECKER Issue 3)

Header.test.tsx asserts both `svg` icon AND role-specific colour class (`consumer-*` / `author-*`) on the Header role pill for both roles. A future PR stripping the icon from the pill fails at unit test, not E2E. Same pattern in RoleSelect.test.tsx for the landing cards.

## Verification Results

- `pnpm typecheck`: PASS (clean)
- `pnpm test`: 340/340 PASS (49 new from this plan)
- `grep 'use client'` on all 12 component TSX files: all present
- `grep @/(chat|grounding|prompts)` on src/chat-ui/*.tsx: no matches (bundle-safety)
- `grep forwardRef<HTMLTextAreaElement` in InputBar.tsx: matches
- `grep "onRetry\?:" in Message.tsx + MessageList.tsx: both match
- `grep "Change role and clear" in ChangeRoleDialog.tsx`: matches
- FDBK-02 grep (textarea|input type=text in AssistantControls/FeedbackPanel): no matches
- UTIL-01 exact format string `(Source: KB0022991 · Flagging Articles)` in AssistantControls.test.tsx: present
- Header.test.tsx assertions for `querySelector('svg')` AND `toMatch(/consumer-/)` AND `toMatch(/author-/)`: all present

## Next Phase Readiness

- **Plan 05 (ChatSurface wiring):** All component contracts are locked and test-enforced. Plan 05 imports and composes these components; it provides `onRetry`, `onFeedback`, `onCopy` dispatch handlers from the chatReducer (Plan 02). No Plan 04 file will be mutated.
- **Plan 06 (E2E smoke):** ChangeRoleDialog confirm label and Header popover option labels are locked. Plan 06 E2E specs use `getByRole('button', { name: /change role and clear/i })` for confirm.
- **No blockers.** All Phase-3 SC #1–#5 surfaces now have tested implementations.

---
*Phase: 03-role-experience-and-chat-ui*
*Completed: 2026-04-23*
