---
phase: 04-source-panel-trust-and-fallback-ui
verified: 2026-04-23T09:10:00Z
human_verified: 2026-04-23T11:05:00Z
status: passed
score: 5/5 must-haves verified; all 12 requirements shipped; human confirmed 3/4 browser checks (mobile drawer skipped — structurally verified, accepted)
human_verification_outcomes:
  - test: Section scroll + 2s amber fade-highlight on cited section
    result: PASS — user confirmed amber fade visible in real browser
  - test: ESC-to-close source panel (Radix modal=false)
    result: PASS — user confirmed ESC closes panel
  - test: Flag a gap mailto opens mail client with question/role/timestamp/requestId
    result: PASS — user confirmed Outlook opened with pre-populated mailto
  - test: Mobile drawer overlay below 1024px
    result: SKIPPED — accepted as structurally verified (lg:hidden overlay + w-full drawer ship; untested in Playwright 1280x720)
gaps_closed_during_human_verification:
  - symptom: Freshness line truncated with content clipped behind panel when panel open on desktop
    cause: FreshnessLine span was `sm:inline`; Tailwind's `truncate` class needs a block-level display for `overflow:hidden + text-overflow:ellipsis` to apply. Text overflowed the flex child's natural width and was visually clipped by the z-50 panel.
    fix: Changed FreshnessLine span to `sm:block` + `min-w-0 flex-1 truncate`. Ellipsis now renders correctly when the chat column shrinks to 60% on desktop.
    commit: 69ac805 fix(04) freshness line truncates with ellipsis when panel open
  - symptom: Red "1 Issue" badge in Next.js dev overlay — "DialogContent requires a DialogTitle for the component to be accessible"
    cause: SourcePanel manually set id="source-panel-title" on Dialog.Title AND aria-labelledby="source-panel-title" on Dialog.Content, bypassing Radix's internal title↔content auto-wiring (via useId-generated titleId registered through context). Radix's "is a title rendered?" check looks for its own registered id and failed.
    fix: Removed the manual id and aria-labelledby overrides; added `data-source-panel="true"` attribute for E2E scoping; updated 3 Playwright specs to use `[data-source-panel="true"]` selector instead.
    commit: 5961a06 fix(04) resolve DialogContent requires DialogTitle dev warning
    note: Plan 02's SUMMARY.md had flagged this warning as "harmless" during development. That was incorrect. Lesson: dev-overlay warnings are not harmless — they surface real contract violations and should block phase verification until resolved.
known_deferred:
  - symptom: favicon.ico 404 in browser console
    scope: Out of Phase 4 (no favicon shipped yet). Trivial fix — add public/favicon.ico. Track as follow-up, not a regression.
final_state:
  unit_tests: 516
  e2e_tests: 19
  typecheck: clean
  dev_overlay_accessibility_warnings: 0
---


# Phase 4: Source Panel, Trust and Fallback UI Verification Report

**Phase Goal:** Every cited response opens the source panel to the exact cited section with correct colour coding.

**Verified:** 2026-04-23T09:10:00Z  **Human-verified:** 2026-04-23T11:05:00Z  **Status:** passed

## Test Suite Execution

516 unit tests, 19 E2E, typecheck clean (all independently confirmed).

## SC Summary

| # | SC | Status | Evidence File |
|---|---|--------|---------------|
| 1 | Panel auto-opens KB0020882 blue badge section body on first citation | VERIFIED | source-panel-first-citation.spec.ts |
| 2 | Panel updates on follow-up; chip click reloads earlier source | VERIFIED | source-panel-updates-and-chip-reopen.spec.ts |
| 3 | Footer permalink + colour-coded badges + Pitfall 16/19 invariants | VERIFIED | source-panel-footer-and-badges.spec.ts |
| 4 | Fallback three-signal treatment + Flag-this-gap mailto | VERIFIED | fallback-and-flag-gap.spec.ts |
| 5 | Freshness line + first-run About tooltip | VERIFIED | trust-header-and-about-tooltip.spec.ts |

## Requirements Coverage

| Req | Status | Production File:Line | Test Evidence |
|-----|--------|---------------------|---------------|
| PANE-01 right-side panel | SATISFIED | SourcePanel.tsx:67 lg:w-[40vw] | usePanelState.ts:14 sessionStorage default false |
| PANE-02 auto-open first citation | SATISFIED | ChatSurface.tsx:79-82 autoOpenOnFirstCitation | source-panel-first-citation.spec.ts |
| PANE-03 panel updates on subsequent | SATISFIED | usePanelState.ts:47-49 updates loaded when open | source-panel-updates-and-chip-reopen.spec.ts |
| PANE-04 badge + content in panel | SATISFIED | SourcePanel.tsx:74-99 header badge and title; 103-111 body | SourcePanel.test.tsx |
| PANE-05 colour-coding handover 14 | SATISFIED with deviation | sourceBadges.ts 22 entries; KB0020882/attachments=blue per RESEARCH 78 not purple in REQUIREMENTS | sourceBadges.test.ts registry parity |
| PANE-06 Open in ServiceNow permalink | SATISFIED | SourcePanel.tsx:117-126 content.url from /api/sources | source-panel-footer-and-badges.spec.ts |
| PANE-07 chip click re-opens panel | SATISFIED | usePanelState.ts:58-62 chipClick; ChatSurface.tsx:221 | source-panel-updates-and-chip-reopen.spec.ts |
| FBK-01 exact section 15 text | SATISFIED | grounding/fallback.ts FALLBACK_STRING; FallbackCard.tsx:77 | FallbackCard.test.tsx |
| FBK-03 visually distinct fallback | SATISFIED | FallbackCard.tsx lines 57/59/66/73; no avatar/timestamp/feedback | fallback-and-flag-gap.spec.ts |
| FBK-04 flag-a-gap mailto | SATISFIED | mailto.ts buildFlagGapMailto; FallbackCard.tsx:80 anchor href | fallback-and-flag-gap.spec.ts |
| TRST-01 freshness line | SATISFIED | Header.tsx:24 exact SC5 format string | trust-header-and-about-tooltip.spec.ts |
| TRST-02 first-run About tooltip | SATISFIED | AboutPopover.tsx three bullets; useAboutTooltip.ts localStorage gate | trust-header-and-about-tooltip.spec.ts |

## Pitfall Audit

### Pitfall 19 - Anchor IDs from section markers, not heading slugs

Test file: src/grounding/__tests__/anchorIds.test.ts

Assertion 1 (line 7): Every section.id matches /^[a-z][a-z0-9-]*$/ and all 22 sections across 3 sources pass.
Assertion 2 (line 17): Reads raw source files and asserts every section.id appears verbatim as a section comment marker. Proves the parser extracted from authored markers not derived from heading text.
Assertion 3 (line 34): Guards against heading-slug drift by confirming at least one section per source has a title that differs from its id.

Production code: SourcePanel.tsx:107 renders the section wrapper with id={content.section_id}. This value comes from /api/sources from REGISTRY[source_id].sections[n].id extracted from section comment markers by parseSource.

E2E: source-panel-first-citation.spec.ts:46 and source-panel-footer-and-badges.spec.ts:58 both assert panel.locator("#resolution-field-software").toBeVisible() in a running browser.

**Status: FULLY LOCKED at three independent layers.**

### Pitfall 20 - Fallback visually distinct: three simultaneous signals

Test file: src/chat-ui/__tests__/FallbackCard.test.tsx

Signal 1 (line 38): border-amber-400 on container. Signal 2 (line 44): bg-amber-50 on container. Signal 3a (line 50): SVG icon present. Signal 3b (line 57): h3 heading with font-bold. Negative assertions: no KB avatar text, no timestamp, no feedback buttons, no copy button.

E2E: fallback-and-flag-gap.spec.ts:30-37 asserts all four conditions on the same fallback locator within one test run. Simultaneous verification.

Production code: FallbackCard.tsx lines 57-73 apply all signals. MessageList.tsx:35 routes state=fallback to FallbackCard not Message.

**Status: FULLY VERIFIED at production code, unit test, and E2E levels.**

### Pitfall 16 - Icon pairing on every colour-coded element (chip AND panel badge)

Test file: src/ui/__tests__/sourceBadges.test.ts

Tests at lines 28-49 assert every SOURCE_BADGES entry has both colour and iconName. Count of 22 asserted at line 24.

Production code: Message.tsx:14-24 ICONS map at module scope; every chip renders Icon alongside badgeClassesFor(badge.colour) at lines 95-113. SourcePanel.tsx:22-24 identical BadgeIcon sub-component; header badge renders icon plus colour class at lines 75-85.

E2E: source-panel-footer-and-badges.spec.ts:44-51 asserts badge colour class AND badge SVG AND chip colour class AND chip SVG in one spec.

**Status: FULLY VERIFIED at badge-map invariant, rendering, and E2E levels.**

## Playwright v1.59.1 Constraint Audit

mockChat.ts:119-120 explicitly documents that route.fulfill accepts only string or Buffer bodies and that ReadableStream is not supported. All SSE mocks use body as string concatenation of frames. mockChatSlow uses a 30-second setTimeout delay rather than a streaming body. This correctly avoids the ReadableStream limitation. All 19 E2E specs pass with no related errors.

## Anti-Patterns Found

| File | Pattern | Severity |
|------|---------|----------|
| SourcePanel.tsx:44-46 | scrollIntoView guarded with typeof check | Info - correct jsdom compatibility, not a stub |
| usePanelState.ts:26,32,60 | eslint-disable react-hooks/exhaustive-deps on useCallback | Info - writeOpen is closure-local; correct per React docs |
| SourcePanel.tsx:62 | aria-describedby={undefined} | Info - deliberate Radix warning suppression per Radix docs |

No blocker or warning-level anti-patterns found.

## Human Verification Required

Four items cannot be confirmed programmatically. See frontmatter for structured format.

**1. Section scroll and amber highlight animation timing**
SourcePanel.tsx:40-51 calls scrollIntoView and sets data-highlight. CSS keyframe at globals.css:43. Playwright does not assert animation timing.

**2. ESC-to-close source panel**
No E2E spec exercises this key. Radix Dialog with modal=false routes ESC to onOpenChange(false), but the non-modal ESC path has no automated test coverage.

**3. Mobile drawer appearance below 1024px viewport**
All Playwright specs run at 1280x720. The lg:hidden overlay path is untested. Note: no focus trap exists at any viewport because modal=false is used throughout (intentional per RESEARCH section 164).

**4. Flag-this-gap mailto opens mail client**
E2E spec calls e.preventDefault() before the mailto click. href content is verified automatically; actual mail-client behaviour and Outlook CRLF rendering require manual confirmation.

## Gaps Summary

No gaps. All 5 success criteria are implemented in shipping production code. All 12 requirements (PANE-01 through PANE-07, FBK-01, FBK-03, FBK-04, TRST-01, TRST-02) map to specific files and verified line numbers. All three pitfall focus areas are verified at multiple independent levels.

The one intentional REQUIREMENTS deviation is PANE-05 KB0020882/attachments = blue instead of purple. Correct per RESEARCH section 78. Documented in 04-01-SUMMARY decision table. Not a gap.

---

_Verified: 2026-04-23T09:10:00Z_
_Verifier: Claude (gsd-verifier)_
