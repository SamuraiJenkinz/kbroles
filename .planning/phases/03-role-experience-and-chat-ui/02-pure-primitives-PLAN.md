---
phase: 3
plan: 2
name: pure-primitives
type: execute
wave: 1
depends_on: []
files_modified:
  - src/chat-ui/types.ts
  - src/chat-ui/chatReducer.ts
  - src/chat-ui/__tests__/chatReducer.test.ts
  - src/lib/time.ts
  - src/lib/__tests__/time.test.ts
  - src/ui/sourceTitles.ts
  - src/ui/__tests__/sourceTitles.test.ts
autonomous: true

must_haves:
  truths:
    - "All wire types (Role, Citation, FallbackReason, ErrorCode, SseEvent, ChipItem) are defined client-side in src/chat-ui/types.ts and DO NOT import from src/chat/* or src/grounding/* server modules (Pitfall — server imports pull zod + env into client bundle)"
    - "Structural equivalence between src/chat-ui/types.ts and docs/api-chat-contract.md §3 / §5 / §6 / §9 is enforced by a test that asserts the union of SseEvent types matches the five wire events exactly"
    - "chatReducer is a pure function (no React imports) — every action transitions ChatState deterministically and the existing 224 node-env tests run it without jsdom"
    - "chatReducer handles all 12 actions: user/send, assistant/start, assistant/delta, assistant/citations, assistant/done, assistant/fallback, assistant/error, assistant/stoppedByUser, assistant/retry, feedback/up, feedback/down, feedback/clear, conversation/clear"
    - "chatReducer appends answer_delta, REPLACES accumulated text on fallback (per contract §3 Fallback semantics), and preserves stoppedByUser text when abort fires mid-stream"
    - "formatRelative(now, now) returns 'just now'; formatRelative(now, now-45_000) returns 'just now' (<60s); formatRelative(now, now-120_000) returns '2m ago'; crosses hour at 60 min and day at 24h with the locked wording"
    - "sourceTitles.ts exports a map resolving at minimum 'flagging-articles' → 'Flagging Articles', 'resolution' → 'Resolution', and degrades gracefully (returns undefined) for unknown keys — UTIL-01 copy fallback is source_id alone if section title missing"
    - "Every assertion runs under the existing vitest node environment (no jsdom docblock needed) because these files have zero React/DOM dependencies"
  artifacts:
    - path: "src/chat-ui/types.ts"
      provides: "Role, Citation, FallbackReason, ErrorCode, SseEvent, ChipItem — mirrored from docs/api-chat-contract.md"
      exports: ["Role", "Citation", "FallbackReason", "ErrorCode", "SseEvent", "ChipItem", "Message", "ChatState", "ChatAction"]
      min_lines: 60
    - path: "src/chat-ui/chatReducer.ts"
      provides: "Pure reducer: (state: ChatState, action: ChatAction) => ChatState covering all message-lifecycle transitions"
      exports: ["chatReducer", "initialChatState"]
      min_lines: 80
    - path: "src/lib/time.ts"
      provides: "formatRelative(now, at) — just now / Nm ago / Nh ago / HH:mm yesterday / DD MMM"
      exports: ["formatRelative"]
      min_lines: 20
    - path: "src/ui/sourceTitles.ts"
      provides: "section_id → human title map for UTIL-01 copy-suffix and (Phase-4) source panel headers"
      exports: ["SOURCE_TITLES", "resolveSourceTitle"]
      min_lines: 15
  key_links:
    - from: "src/chat-ui/chatReducer.ts"
      to: "src/chat-ui/types.ts"
      via: "import type { ChatState, ChatAction, Message, Citation }"
      pattern: "from ['\"]\\./types['\"]"
    - from: "src/chat-ui/__tests__/chatReducer.test.ts"
      to: "src/chat-ui/chatReducer.ts"
      via: "import { chatReducer, initialChatState } from '../chatReducer'"
      pattern: "chatReducer"
    - from: "src/chat-ui/types.ts"
      to: "docs/api-chat-contract.md"
      via: "structural mirror of §3 event schema (type equivalence, not code import)"
      pattern: "answer_delta|citations|fallback|done"
---

<objective>
Ship the pure-TypeScript primitives every Phase-3 plan imports from: wire-type mirrors, the chat-state reducer, the relative-time formatter, and the source-title map. All four files have zero React/DOM dependencies, so their tests run under the existing node-env Vitest — no jsdom needed — and they are trivially compose-testable by Plans 03 (hooks) and 05 (ChatPage wiring).

Purpose: a pure reducer is the cleanest way to express the chat state machine (Pitfall 2 from RESEARCH — every transition visible in one place). Isolating the reducer + types from React means Plan 03's hook tests and Plan 05's wiring tests can assert reducer behaviour in node env without paying jsdom cost. Also eliminates a class of UI-test flakiness (reducer bugs masquerading as render bugs).

Output: 4 source files + 3 test files, all under existing Vitest node environment.
</objective>

<execution_context>
@C:\Users\taylo\.claude/get-shit-done/workflows/execute-plan.md
@C:\Users\taylo\.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
This plan runs in Wave 1 parallel to Plan 01 (scaffold). It has NO dependency on Plan 01 because these files are pure TS, don't import React, don't import Tailwind, and their tests run under node env.

Before starting, read:

@docs/api-chat-contract.md  (§3 Event schema, §5 FallbackReason, §6 ErrorCode, §9 Citation shape, §11 ChipItem — CANONICAL wire contract to mirror)
@.planning/phases/03-role-experience-and-chat-ui/03-RESEARCH.md  (§Pattern 2 State management — reducer shape; §Code Examples §Example 6 — mirrored types)
@.planning/phases/03-role-experience-and-chat-ui/03-CONTEXT.md  (§Controls, feedback & errors — feedback state model; §Chat surface styling — fallback-marker behaviour locks reducer transitions)

@info/KB_Assistant_ClaudeCode_Handover.md  (§14 — section title vocabulary; §16 — chip wording)

**Wire types reference (paste-ready from RESEARCH §Example 6, adjust imports):**

```ts
// src/chat-ui/types.ts
export type Role = 'consumer' | 'author'

export interface Citation {
  source_id: 'KB0020882' | 'KB0022991' | 'SNOW_FORM'
  section_id: string
  quote: string
}

export type FallbackReason =
  | 'refusal'
  | 'can_answer_false'
  | 'all_citations_stripped'
  | 'allowlist_violation'

export type ErrorCode =
  | 'upstream_timeout'
  | 'upstream_5xx'
  | 'schema_reject_after_retry'
  | 'internal'

export type SseEvent =
  | { type: 'answer_delta'; text: string }
  | { type: 'citations';    citations: Citation[] }
  | { type: 'fallback';     reason: FallbackReason; text: string }
  | { type: 'done';         can_answer: boolean; validator_flips: number }
  | { type: 'error';        code: ErrorCode; message: string }

export interface ChipItem { id: string; label: string; text: string }
```

**ChatState / ChatAction reference (RESEARCH §Pattern 2):**

```ts
export type FeedbackDown = {
  kind: 'down'
  reason: 'hallucinated' | 'wrong_citation' | 'incomplete' | 'other'
}
export type Feedback = 'up' | FeedbackDown

export type Message =
  | { kind: 'user'; id: string; text: string; at: number }
  | {
      kind: 'assistant'
      id: string
      state: 'streaming' | 'done' | 'fallback' | 'error'
      text: string
      citations: Citation[]
      at: number
      feedback?: Feedback
      stoppedByUser?: boolean
      errorCode?: ErrorCode
      requestId?: string
    }

export type ChatState = {
  messages: Message[]
  inFlightId: string | null
}

export type ChatAction =
  | { type: 'user/send'; id: string; text: string; at: number }
  | { type: 'assistant/start'; id: string; at: number }
  | { type: 'assistant/delta'; id: string; text: string }
  | { type: 'assistant/citations'; id: string; citations: Citation[] }
  | { type: 'assistant/done'; id: string }
  | { type: 'assistant/fallback'; id: string; text: string }
  | { type: 'assistant/error'; id: string; code: ErrorCode; requestId: string }
  | { type: 'assistant/stoppedByUser'; id: string }
  | { type: 'assistant/retry'; id: string }
  | { type: 'feedback/up'; id: string }
  | { type: 'feedback/down'; id: string; reason: FeedbackDown['reason'] }
  | { type: 'feedback/clear'; id: string }
  | { type: 'conversation/clear' }
```

**Anti-patterns to avoid:**
- Do NOT import from `@/chat/sse`, `@/chat/requestSchema`, or `@/prompts/suggested` (server modules — bring zod + env into client bundle; RESEARCH §Anti-patterns).
- Do NOT use `any` or `unknown` for the SseEvent discriminant — the tagged union provides exhaustive checking downstream.
- Do NOT mutate state inside the reducer — return a new object (standard reducer contract; enables React 19 `useReducer` + `useSyncExternalStore` downstream).
</context>

<tasks>

<task type="auto">
  <name>Task 2.1: Wire types + chat reducer + reducer tests</name>
  <files>src/chat-ui/types.ts, src/chat-ui/chatReducer.ts, src/chat-ui/__tests__/chatReducer.test.ts</files>
  <action>
    1. **Create `src/chat-ui/types.ts`** using the shapes in `<context>` above verbatim. The file exports every type + interface listed. No runtime code — types only.

       Add a top-of-file comment block documenting that these types MIRROR `docs/api-chat-contract.md` §3/§5/§6/§9/§11 and must not drift. A separate test file (§Task 2.2 or a lightweight inline assertion in this file's test) enforces structural parity.

    2. **Create `src/chat-ui/chatReducer.ts`** implementing `chatReducer(state, action)` and `initialChatState = { messages: [], inFlightId: null }`.

       Transition rules (LOCKED — derived from CONTEXT §Chat surface styling + docs/api-chat-contract.md §3 event semantics):

       - `user/send`: push `{kind:'user', id, text, at}` to messages. Do NOT set inFlightId here — assistant/start does that.
       - `assistant/start`: push `{kind:'assistant', id, state:'streaming', text:'', citations:[], at}` AND set `inFlightId = id`.
       - `assistant/delta`: locate assistant bubble by id; APPEND `action.text` to its `text` (contract §3 — answer_delta semantics).
       - `assistant/citations`: locate bubble by id; set `citations = action.citations`. Do NOT change state ('streaming' remains until done).
       - `assistant/done`: locate bubble by id; set state='done'. Set `inFlightId = null`.
       - `assistant/fallback`: locate bubble by id; REPLACE `text = action.text`, set `citations = []`, state='fallback'. Set `inFlightId = null`. (Contract §3 — fallback REPLACES, does not append.)
       - `assistant/error`: locate bubble by id; state='error', store `errorCode`, `requestId`. Keep accumulated `text` unchanged (Plan 04's ErrorCard overlays the bubble; existing partial text is not surfaced but kept in state for diagnostics). Set `inFlightId = null`.
       - `assistant/stoppedByUser`: locate bubble by id; state='done', set `stoppedByUser = true`. **Preserve accumulated text** (Pitfall 5 — partial text already rendered stays). Set `inFlightId = null`.
       - `assistant/retry`: **remove** the targeted bubble by id. Caller (Plan 05 wiring) re-dispatches `user/send` → `assistant/start` for the retry. Set `inFlightId = null` if we just removed it.
       - `feedback/up`: locate bubble by id; set `feedback = 'up'`. If already 'up' (toggle off), clear `feedback` to undefined.
       - `feedback/down`: locate bubble; set `feedback = {kind:'down', reason}`. If already down with the same reason, clear feedback. (Toggle-same-again clears, per CONTEXT §Thumbs — "Clicking again toggles off".)
       - `feedback/clear`: locate bubble by id; delete `feedback` field.
       - `conversation/clear`: return `{messages: [], inFlightId: null}` — role is managed outside the reducer (sessionStorage hook owns it per CONTEXT §Persistence).

       Implementation pattern (immutable update):
       ```ts
       function updateMessage(state: ChatState, id: string, patch: (m: Message) => Message): ChatState {
         const idx = state.messages.findIndex(m => m.id === id)
         if (idx === -1) return state
         const next = [...state.messages]
         next[idx] = patch(state.messages[idx])
         return { ...state, messages: next }
       }
       ```

       Unknown action type → return state unchanged (exhaustive switch with `default: return state` — downstream TS catches missing cases via `never` type assertion on action: `const _exhaustive: never = action`).

    3. **Create `src/chat-ui/__tests__/chatReducer.test.ts`** (runs under existing node env — no docblock needed). Test cases — assert via deep-equal on returned state:

       **Lifecycle — happy path:**
       - `user/send` → messages=[user], inFlightId=null.
       - `user/send` → `assistant/start` → 2 messages, inFlightId=assistant.id.
       - `assistant/delta{text:'hello '}` → `assistant/delta{text:'world'}` → bubble text === 'hello world' (APPEND).
       - `assistant/citations{[{...}]}` → bubble.citations has the value; state still 'streaming'.
       - `assistant/done` → bubble.state==='done', inFlightId===null.

       **Fallback path:**
       - assistant/start → assistant/delta{'partial...'} → assistant/fallback{text:'<§15 string>'} → bubble.text==='<§15 string>' (REPLACE), citations===[], state==='fallback', inFlightId===null.

       **Error path:**
       - assistant/start → assistant/delta{'partial'} → assistant/error{code:'upstream_5xx', requestId:'uuid-1'} → bubble.state==='error', errorCode==='upstream_5xx', requestId==='uuid-1', text still 'partial' (unchanged — ErrorCard will overlay), inFlightId===null.

       **Stopped by user:**
       - assistant/start → delta{'hello '} → delta{'wor'} → assistant/stoppedByUser → bubble.state==='done', stoppedByUser===true, text==='hello wor' (PRESERVED — Pitfall 5), inFlightId===null.

       **Retry:**
       - assistant/start → assistant/error → assistant/retry{id} → messages array no longer contains that id; only the preceding user bubble remains; inFlightId===null. (Plan 05 wiring then re-dispatches user/send → assistant/start for the same question, but those are caller's responsibility — the reducer just removes.)

       **Feedback state machine:**
       - feedback/up on a done bubble → feedback==='up'.
       - Second feedback/up → feedback===undefined (toggle off).
       - feedback/down{reason:'hallucinated'} on the same bubble (previously up) → feedback.kind==='down', reason==='hallucinated' (replaces up; mutually exclusive per CONTEXT §Thumbs).
       - Second feedback/down with SAME reason → feedback===undefined (toggle-same-reason clears — CONTEXT §Thumbs "Clicking again toggles off").
       - feedback/down{reason:'wrong_citation'} on a bubble with down{reason:'hallucinated'} → feedback.reason==='wrong_citation' (reason switched, still down).
       - feedback/clear → feedback===undefined regardless of prior state.

       **Conversation clear:**
       - Populated state with N messages → conversation/clear → state==={messages:[], inFlightId:null}.

       **Edge cases:**
       - assistant/delta with unknown id → state returned unchanged (reference equality is NOT required — deep equal is sufficient; but document whichever choice is made).
       - Unknown action type (cast via `as any`) → state returned unchanged.

       **Structural parity test:**
       - Assert that the SseEvent union's discriminant values are exactly the set `{'answer_delta', 'citations', 'fallback', 'done', 'error'}` — pattern:
         ```ts
         const received = new Set<string>()
         const sample: SseEvent[] = [
           { type: 'answer_delta', text: '' },
           { type: 'citations', citations: [] },
           { type: 'fallback', reason: 'refusal', text: '' },
           { type: 'done', can_answer: true, validator_flips: 0 },
           { type: 'error', code: 'internal', message: '' },
         ]
         sample.forEach(e => received.add(e.type))
         expect(received).toEqual(new Set(['answer_delta', 'citations', 'fallback', 'done', 'error']))
         ```
         If a new event type is ever added to the wire contract, this test fails until types.ts is updated — explicit contract-drift guard.

    4. **Commit:** `feat(phase-3/plan-02): add mirrored wire types + pure chat reducer with full transition coverage`.
  </action>
  <verify>
    - `pnpm typecheck` passes; `types.ts` and `chatReducer.ts` expose the exports listed in frontmatter.
    - `pnpm test` passes with ≥15 new reducer tests green (counting the structural parity test).
    - No import from `@/chat/*`, `@/grounding/*`, or `@/prompts/*` in either source file (verify via grep: `grep -E "from ['\"]@/(chat|grounding|prompts)" src/chat-ui/types.ts src/chat-ui/chatReducer.ts` should return no matches).
  </verify>
  <done>
    types.ts mirrors the canonical wire contract. chatReducer is pure, exhaustively covers the 12 actions, handles append/replace/preserve semantics per contract. 15+ tests green. Structural parity with wire contract enforced.
  </done>
</task>

<task type="auto">
  <name>Task 2.2: formatRelative + sourceTitles + tests</name>
  <files>src/lib/time.ts, src/lib/__tests__/time.test.ts, src/ui/sourceTitles.ts, src/ui/__tests__/sourceTitles.test.ts</files>
  <action>
    1. **Create `src/lib/time.ts`** — pure `formatRelative(now, at)` producing the CHAT-06 wording:
       ```ts
       /**
        * formatRelative — used by Phase-3 CHAT-06 hover/focus timestamps.
        * `at` and `now` are epoch ms. Deterministic; no locale dependency beyond Intl.DateTimeFormat for the yesterday/absolute-date fallback.
        */
       export function formatRelative(now: number, at: number): string {
         const deltaMs = Math.max(0, now - at)
         const SECOND = 1000, MINUTE = 60 * SECOND, HOUR = 60 * MINUTE, DAY = 24 * HOUR

         if (deltaMs < MINUTE) return 'just now'
         if (deltaMs < HOUR) {
           const m = Math.floor(deltaMs / MINUTE)
           return `${m}m ago`
         }
         if (deltaMs < DAY) {
           const h = Math.floor(deltaMs / HOUR)
           return `${h}h ago`
         }
         if (deltaMs < 2 * DAY) {
           // Yesterday — show HH:mm per CONTEXT §Timestamps ("14:32 yesterday")
           const d = new Date(at)
           const hh = String(d.getHours()).padStart(2, '0')
           const mm = String(d.getMinutes()).padStart(2, '0')
           return `${hh}:${mm} yesterday`
         }
         // Older — DD MMM
         return new Date(at).toLocaleDateString(undefined, { day: '2-digit', month: 'short' })
       }
       ```

       Notes:
       - Clamp `Math.max(0, now - at)` so a clock-skew edge where `at > now` renders 'just now' not a negative.
       - No `Intl.RelativeTimeFormat` — we need "just now" for <60s which that API doesn't produce cleanly. 20 lines is easier to test.

    2. **Create `src/lib/__tests__/time.test.ts`** — node env, deterministic assertions:
       - `formatRelative(1000, 1000) === 'just now'`
       - `formatRelative(now, now - 30_000) === 'just now'`
       - `formatRelative(now, now - 59_999) === 'just now'`
       - `formatRelative(now, now - 60_000) === '1m ago'`
       - `formatRelative(now, now - 120_000) === '2m ago'`
       - `formatRelative(now, now - 59 * 60_000) === '59m ago'`
       - `formatRelative(now, now - 60 * 60_000) === '1h ago'`
       - `formatRelative(now, now - 5 * 60 * 60_000) === '5h ago'`
       - `formatRelative(now, now - 23 * 60 * 60_000) === '23h ago'`
       - `formatRelative(now, now - 25 * 60 * 60_000)` matches /^\d{2}:\d{2} yesterday$/
       - `formatRelative(now, now - 3 * 24 * 60 * 60_000)` matches /^\d{1,2} [A-Z][a-z]{2}$/ (DD MMM — depends on locale default; accept variable whitespace).
       - Clock-skew edge: `formatRelative(1000, 2000) === 'just now'` (at > now clamps to 0 delta).

       Use fixed epoch values (e.g. 1714435200000 for 2024-04-30 00:00 UTC) rather than Date.now() to keep tests deterministic across CI time zones.

    3. **Create `src/ui/sourceTitles.ts`** seeded from the section_ids the grounding registry emits. Sources: `src/grounding/sources/*.md` anchor markers + handover §14 title vocabulary (read from `info/KB_Assistant_ClaudeCode_Handover.md` if accessible; if not, seed with the minimum listed below — it can be extended in Phase 4 without breaking Phase 3).

       ```ts
       /**
        * section_id → human-readable title.
        * Used by:
        *   - UTIL-01 copy-suffix   → "(Source: KB0022991 · Flagging Articles)"
        *   - Phase-4 source panel  → section header labels
        *
        * Keys are stable kebab-case anchors (e.g. 'flagging-articles', 'approvers') matching
        * validated citation.section_id. Unknown keys return undefined so callers can fall back
        * to source_id alone (UTIL-01 copy-suffix degrades gracefully per CONTEXT §Copy answer).
        */
       export const SOURCE_TITLES: Record<string, string> = {
         // KB0022991 (flagging articles) — consumer-facing
         'flagging-articles': 'Flagging Articles',
         'leaving-feedback': 'Leaving Feedback',
         'navigating-kb': 'Navigating the KB',
         // KB0020882 (author workflow) — author-facing
         'resolution': 'Resolution',
         'short-description': 'Short Description',
         'approvers': 'Approvers',
         'categories': 'Categories',
         'attachments': 'Attachments',
         'publishing': 'Publishing',
         // SNOW_FORM (field schema)
         'form-fields': 'Article Form Fields',
       }

       export function resolveSourceTitle(section_id: string): string | undefined {
         return SOURCE_TITLES[section_id]
       }
       ```

       If the registry reveals section_ids not in this list, the plan-05 integration (or Phase 4) will extend the map — graceful degradation means unknown keys simply drop the title from the copy suffix.

    4. **Create `src/ui/__tests__/sourceTitles.test.ts`** (node env):
       - `resolveSourceTitle('flagging-articles') === 'Flagging Articles'`
       - `resolveSourceTitle('resolution') === 'Resolution'`
       - `resolveSourceTitle('unknown-section') === undefined`
       - `Object.keys(SOURCE_TITLES).length >= 8`
       - Every value starts with an uppercase letter (title-case sanity check via regex `/^[A-Z]/`).

    5. **Commit:** `feat(phase-3/plan-02): add formatRelative + sourceTitles with deterministic tests`.
  </action>
  <verify>
    - `pnpm typecheck` passes.
    - `pnpm test` — ≥12 new time tests + ≥5 new sourceTitles tests, all green. Plus reducer tests from Task 2.1. Expected delta ≥32 tests, bringing repo total to 256+.
    - `grep` for Date.now() in src/lib/time.ts returns NO matches (we use `now` parameter, not a live clock — makes tests deterministic and eliminates Pitfall 6 risk for any downstream caller that renders during SSR).
  </verify>
  <done>
    formatRelative emits the CHAT-06 locked wording across all thresholds; sourceTitles resolves the happy-path section IDs referenced in the corpus and degrades gracefully. Both modules are framework-agnostic pure TS, reusable by Phase 4 panel headers.
  </done>
</task>

</tasks>

<verification>
  - `pnpm typecheck` clean.
  - `pnpm test` green — ≥32 new tests (≥15 reducer + ≥12 time + ≥5 sourceTitles). Total ≥256.
  - grep -E "from ['\"]@/(chat|grounding|prompts)" src/chat-ui/ src/lib/ src/ui/ returns no matches (proves client code does NOT import server modules — bundle-safety guard).
  - Reducer covers all 12 action types (verify via test names; each action has at least one dedicated assertion).
  - SseEvent structural parity test present and passing.
</verification>

<success_criteria>
Phase-3 SC #2 dependency — message-lifecycle state transitions (streaming → done with citations, streaming → fallback, streaming → error) are implemented here. Plan 05 wires the reducer into React; this plan proves the state machine is correct in isolation.
Phase-3 SC #5 dependency — sourceTitles resolves "KB0022991 · Flagging Articles" for the UTIL-01 copy suffix; Plan 04's AssistantControls uses it.

Coverage:
- RESEARCH §Pattern 2 (useReducer + Context): reducer shape implemented and fully tested.
- RESEARCH §Code Examples §Example 6: wire types mirrored verbatim into src/chat-ui/types.ts.
- RESEARCH §Don't Hand-Roll (relative-time): small pure formatter instead of wrapping Intl.RelativeTimeFormat.
- CONTEXT §Copy answer (UTIL-01): source-title lookup seeded with the citation cited in the copy-format example.
- CONTEXT §Thumbs: toggle-off + mutually-exclusive logic covered in reducer tests.
</success_criteria>

<output>
After completion, create `.planning/phases/03-role-experience-and-chat-ui/03-02-SUMMARY.md`. Capture:
- New test count delta (target ≥32).
- Total repo test count post-plan (target ≥256).
- Every reducer action tested (12 actions × at least one test each).
- Note that no source file imports from server modules (@/chat, @/grounding, @/prompts) — bundle safety preserved.
- Flag the SOURCE_TITLES entries as Phase-3 minimum — Phase 4 (PANE-01) will extend with source-panel header vocabulary.
</output>
