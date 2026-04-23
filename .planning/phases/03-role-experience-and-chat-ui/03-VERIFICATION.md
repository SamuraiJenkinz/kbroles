---
phase: 03-role-experience-and-chat-ui
verified: 2026-04-22T04:30:00Z
status: passed
human_approved: 2026-04-22
score: "5/5 verified (programmatic) + 2 UX items confirmed by human browser test"
gaps: []
---

# Phase 3: Role Experience and Chat UI Verification Report

**Phase Goal:** A user lands on the role-select screen, picks Consumer or Author, and has a working multi-turn chat experience with role-aware greeting, suggested-prompt chips, stop/new-conversation/change-role affordances, keyboard submit, copy-answer with citation suffix, thumbs feedback, hover timestamps, and a graceful error/retry when the LLM path fails.

**Verified:** 2026-04-22T04:30:00Z
**Status:** passed — initial verification returned `human_needed` (typing-dots animation + hover tooltip untestable in Playwright); both confirmed by human browser test 2026-04-22
**Re-verification:** No - initial verification

## Test Run Summary

Test Files: 35 passed (35)
Tests: 355 passed (355)
Duration: 6.58s

TypeScript: tsc --noEmit clean, zero errors.

## Observable Truths (Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Two role cards visible; correct greeting and chip count per role | VERIFIED | RoleSelect.tsx (79 lines) renders two button cards with label/icon/colour. Greeting.tsx (20 lines) role-keyed GREETING record. usePrompts.ts (32 lines) fetches /api/prompts?role=... suggested.ts (82 lines) 5 consumer + 8 author chips verbatim handover section 16. E2E role-select.spec.ts covers cards visible, consumer=5 chips, author=8 chips. Unit ChatSurface.test.tsx explicit count tests. |
| 2 | Chip click yields typing indicator, streaming answer with KB avatar, hover timestamps, thumbs pair | VERIFIED (2 human items) | MessageList.tsx (55 lines) renders TypingDots when state=streaming and text empty. TypingDots.tsx (12 lines) role=status aria-live=polite. Message.tsx (101 lines) KB circular badge on assistant. Timestamp.tsx (31 lines) Radix Tooltip + formatRelative(). AssistantControls.tsx (103 lines) ThumbsUp/ThumbsDown with aria-pressed. E2E chat-happy-path.spec.ts verifies text, citation, copy, thumbs, time[tabIndex=0]. HUMAN ITEMS: typing dots animation timing; tooltip hover reveal. |
| 3 | Stop cancels stream; New conversation clears without role change; Change role shows confirm then role-select | VERIFIED | InputBar.tsx Stop button when isStreaming. useChatStream.stop() calls abort. Header.tsx New conversation + Change role popover. ChangeRoleDialog.tsx autoFocus Cancel (Pitfall 18). ChatSurface.tsx lines 117-124 Pitfall 13 locked order. E2E controls-stop-new-change.spec.ts all three affordances + Pitfall 18 Cancel focus + sessionStorage cleared. |
| 4 | Enter submits; Shift+Enter newline; 5xx renders ErrorCard with Retry | VERIFIED | InputBar.tsx lines 28-33 Enter submit, Shift+Enter passthrough. ErrorCard.tsx role=alert Retry + Details. Message.tsx lines 35-45 routes state===error to ErrorCard. chatReducer.ts lines 122-133 assistant/error action. E2E keyboard-and-error-retry.spec.ts full flow. Unit InputBar.test.tsx CHAT-05. |
| 5 | Copy appends exact citation suffix; thumbs-down opens 4-option radio with no free text | VERIFIED | AssistantControls.tsx lines 22-35 appends (Source: source_id dot title) via resolveSourceTitle(). sourceTitles.ts maps flagging-articles to Flagging Articles. FeedbackPanel.tsx RadioGroup 4 options, no textarea, no text-input. Unit exact string assertion. E2E copy-and-feedback.spec.ts exact clipboard + 4 radios + zero free-text inputs. |

**Score:** 5/5 truths verified

## Required Artifacts

| Artifact | Exists | Lines | Wired | Status |
|----------|--------|-------|-------|--------|
| src/chat-ui/ChatPage.tsx | YES | 23 | app/page.tsx imports + renders | VERIFIED |
| src/chat-ui/RoleSelect.tsx | YES | 79 | ChatPage renders when role=null | VERIFIED |
| src/chat-ui/ChatSurface.tsx | YES | 222 | ChatPage renders when role set | VERIFIED |
| src/chat-ui/Header.tsx | YES | 64 | Imported by ChatSurface | VERIFIED |
| src/chat-ui/Greeting.tsx | YES | 20 | ChatSurface renders when isEmpty | VERIFIED |
| src/chat-ui/ChipRow.tsx | YES | 33 | ChatSurface renders when isEmpty | VERIFIED |
| src/chat-ui/MessageList.tsx | YES | 55 | Imported by ChatSurface | VERIFIED |
| src/chat-ui/Message.tsx | YES | 101 | Imported by MessageList | VERIFIED |
| src/chat-ui/TypingDots.tsx | YES | 12 | Imported by MessageList | VERIFIED |
| src/chat-ui/AssistantControls.tsx | YES | 103 | Imported by Message | VERIFIED |
| src/chat-ui/FeedbackPanel.tsx | YES | 52 | Imported by AssistantControls | VERIFIED |
| src/chat-ui/ErrorCard.tsx | YES | 62 | Imported by Message | VERIFIED |
| src/chat-ui/InputBar.tsx | YES | 65 | Imported by ChatSurface | VERIFIED |
| src/chat-ui/Timestamp.tsx | YES | 31 | Imported by Message | VERIFIED |
| src/chat-ui/ChangeRoleDialog.tsx | YES | 48 | Imported by ChatSurface | VERIFIED |
| src/chat-ui/chatReducer.ts | YES | 222 | useReducer in ChatSurface | VERIFIED |
| src/chat-ui/useChatStream.ts | YES | 92 | Used by ChatSurface | VERIFIED |
| src/chat-ui/useRolePersistence.ts | YES | 28 | Used by ChatPage | VERIFIED |
| src/chat-ui/useDraftBuffer.ts | YES | 45 | Used by ChatSurface | VERIFIED |
| src/chat-ui/usePrompts.ts | YES | 32 | Used by ChatSurface | VERIFIED |
| src/app/api/prompts/route.ts | YES | 57 | Fetched by usePrompts | VERIFIED |
| src/prompts/suggested.ts | YES | 82 | Imported by prompts route | VERIFIED |
| src/ui/sourceTitles.ts | YES | 43 | Imported by AssistantControls | VERIFIED |
| src/lib/time.ts | YES | 44 | Imported by Timestamp | VERIFIED |
| src/app/page.tsx | YES | 5 | Renders ChatPage | VERIFIED |
| src/app/globals.css | YES | 35 | consumer-600=green, author-600=purple tokens | VERIFIED |

## Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| app/page.tsx | ChatPage | direct import + render | WIRED |
| ChatPage | RoleSelect or ChatSurface | role == null branch | WIRED |
| ChatSurface | /api/chat | useChatStream.send(role, messages) - role as explicit arg every call (Pitfall 4) | WIRED |
| ChatSurface | /api/prompts | usePrompts(role) fetch | WIRED |
| ChatSurface | chatReducer | useReducer(chatReducer, initialChatState) | WIRED |
| useChatStream | handleEvent callback | onEvent(ev, requestId) routes SSE events to reducer | WIRED |
| ChatSurface.handleConfirmChangeRole | ordered cleanup | stop() then conversation/clear then asstIdRef=null then setChangeRoleOpen(false) then onChangeRole() then clearDraft() (Pitfall 13) | WIRED |
| useDraftBuffer | sessionStorage kbroles.draft | debounced setItem/removeItem | WIRED |
| useRolePersistence | sessionStorage kbroles.role | getItem/setItem/removeItem | WIRED |
| AssistantControls.handleCopy | resolveSourceTitle | resolveSourceTitle(cit.section_id) fallback to section_id + format string | WIRED |
| MessageList | TypingDots | state===streaming && text===empty conditional | WIRED |
| Message | ErrorCard | state === error branch | WIRED |
| Header | ChangeRoleDialog | setChangeRoleOpen(true) then open={changeRoleOpen} | WIRED |

## Pitfall Coverage

| Pitfall | Status | Evidence |
|---------|--------|----------|
| Pitfall 4: Role contamination | VERIFIED | useChatStream.ts line 1 guard comment. send(role, messages) takes role as explicit param, never captured from closure. Unit useChatStream.test.tsx line 110. E2E role-contamination.spec.ts. |
| Pitfall 13: Successor-role contamination on change | VERIFIED | ChatSurface.tsx lines 114-124 locked order comment. stop() -> clear -> asstIdRef=null -> setChangeRoleOpen(false) -> onChangeRole() -> clearDraft(). Unit ChatSurface.test.tsx line 306 asserts abort called before onChangeRole. E2E role-contamination.spec.ts line 29. |
| Pitfall 16: Colour never the only signal | VERIFIED | RoleSelect.tsx User/Pencil icons with consumer/author colour tokens. Header.tsx icon+colour pill. globals.css: consumer-600=#16a34a (green), author-600=#9333ea (purple). Unit RoleSelect.test.tsx lines 69,81. Header.test.tsx describe block tagged Pitfall 16. |
| Pitfall 17: Draft only persisted on refresh | VERIFIED | useDraftBuffer.ts saves to kbroles.draft with 250ms debounce, reads on mount. useRolePersistence.ts saves role to kbroles.role. Message state is in-memory useReducer only. Unit useDraftBuffer.test.tsx 7 tests. E2E role-contamination.spec.ts line 93. |
| Pitfall 18: Change role confirm with Cancel autoFocus | VERIFIED | ChangeRoleDialog.tsx line 28 autoFocus on Cancel. Confirm label "Change role and clear" disambiguated from popover "Change role". Dialog.Description warns about clearing. Unit ChangeRoleDialog.test.tsx 8 tests. E2E controls-stop-new-change.spec.ts line 109 toBeFocused() on Cancel. |

## Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| AUTH-02 | VERIFIED | chatReducer state is in-memory useReducer only. E2E asserts messages absent after reload. |
| ROLE-01 | VERIFIED | RoleSelect.tsx two cards. E2E role-select.spec.ts. |
| ROLE-02 | VERIFIED | useRolePersistence.ts sessionStorage. Change role -> setRole(null). E2E. |
| ROLE-03 | VERIFIED | Header.tsx consumer-600 (green) / author-600 (purple) + icon paired. globals.css confirms hex values. |
| ROLE-04 | VERIFIED | Greeting.tsx role-keyed GREETING. E2E greeting text assertions. |
| ROLE-05 | VERIFIED | suggested.ts 5+8 chips from handover section 16. E2E chip count assertions. |
| CHAT-01 | VERIFIED | Message.tsx KB badge on assistant. User right-aligned no-avatar per spec (Me - no avatar). Multi-turn via buildWireMessages. |
| CHAT-02 | VERIFIED (code) / HUMAN (animation) | TypingDots.tsx animate-bounce. MessageList.tsx conditional render. ARIA live region. |
| CHAT-03 | VERIFIED | InputBar.tsx Stop button. useChatStream.stop() abort. E2E. |
| CHAT-04 | VERIFIED | handleNewConversation dispatches conversation/clear. Role preserved. E2E. |
| CHAT-05 | VERIFIED | InputBar.tsx lines 28-33. Unit + E2E. |
| CHAT-06 | VERIFIED (code) / HUMAN (tooltip hover) | Timestamp.tsx Radix Tooltip. formatRelative(). E2E time[tabIndex=0] visible. |
| CHAT-07 | VERIFIED | ErrorCard.tsx Retry + Details. chatReducer error action. E2E full retry flow. |
| FDBK-01 | VERIFIED | AssistantControls.tsx thumbs on done/fallback messages. Unit + E2E. |
| FDBK-02 | VERIFIED | FeedbackPanel.tsx 4-option RadioGroup. Zero textarea/text-input. E2E. |
| UTIL-01 | VERIFIED | AssistantControls.handleCopy exact format. sourceTitles.ts. Unit exact string. E2E clipboard. |

## Anti-Patterns Found

None blocking.

One non-blocking: Radix Missing Description stderr warning in ChangeRoleDialog.test.tsx. The component correctly supplies aria-describedby=change-role-desc and a matching Dialog.Description element, but Radix fires its internal check before processing the explicit aria attribute. No user-facing impact. All 8 ChangeRoleDialog tests pass.

## Human Verification Required

### 1. Three-dot typing indicator animation

Test: Open the app in a browser, pick a role, submit a message. Observe the assistant bubble area immediately after clicking Send.

Expected: A KB-avatar bubble appears on the left with three small circles bouncing in a staggered animation before the answer arrives. The dots are replaced by streaming text when the first chunk arrives. A screen reader announces "Assistant is typing" via the aria-live=polite region.

Why human: Playwright route.fulfill() delivers the complete mock response atomically. No window exists between the assistant/start dispatch (text empty) and the first answer_delta delivery. The code path is structurally correct (MessageList.tsx lines 24-41 conditional render, TypingDots.tsx animate-bounce classes) but visual timing and animation cannot be confirmed from automated tests alone.

### 2. Hover timestamp tooltip

Test: In a browser with a rendered chat response, hover the mouse over a relative timestamp ("just now", "2m ago") on an assistant message bubble.

Expected: A small dark Radix tooltip appears showing the absolute datetime string (e.g. 22/04/2026, 04:33:00). The tooltip disappears on mouse-out. Keyboard focus on the time[tabIndex=0] element should also trigger the tooltip.

Why human: The E2E test (chat-happy-path.spec.ts lines 50-52) verifies the time[tabIndex=0] element is visible and has the correct attribute, but does not perform a hover interaction or assert on tooltip content. Radix Tooltip portal rendering on hover requires a real browser interaction.

## Gaps Summary

No structural gaps. All 16 requirements have substantive implementations that are fully wired and covered by automated tests (355 tests, 35 files, 0 failures, 0 TypeScript errors). The two human verification items concern visual and interaction behaviour that is architecturally correct in code but requires a running browser to confirm.


---

_Verified: 2026-04-22T04:30:00Z_
_Verifier: Claude (gsd-verifier)_
