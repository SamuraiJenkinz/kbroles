---
phase: 3
plan: 5
name: chat-page-wiring
type: execute
wave: 3
depends_on: [1, 2, 3, 4]
files_modified:
  - src/chat-ui/ChatPage.tsx
  - src/chat-ui/ChatSurface.tsx
  - src/chat-ui/Greeting.tsx
  - src/chat-ui/usePrompts.ts
  - src/chat-ui/__tests__/ChatSurface.test.tsx
  - src/chat-ui/__tests__/usePrompts.test.tsx
  - src/app/page.tsx
autonomous: true

must_haves:
  truths:
    - "Visiting / renders RoleSelect when no role is persisted; picks a role → ChatSurface with role-aware greeting + role-specific chip row; picking 'consumer' loads 5 chips from /api/prompts?role=consumer; picking 'author' loads 8 chips"
    - "Returning user (sessionStorage.kbroles.role set) lands DIRECTLY in ChatSurface; no RoleSelect flash (hydrated gate from useRolePersistence — Pitfall 4 RESEARCH)"
    - "Chip click auto-submits: dispatches user/send + assistant/start + useChatStream.send(role, messages) — role is passed as argument (Pitfall 4 — role never from closure)"
    - "Each SseEvent received through useChatStream is routed to chatReducer: answer_delta → dispatch assistant/delta; citations → assistant/citations; done → assistant/done; fallback → assistant/fallback; error → assistant/error"
    - "Stop button (InputBar while streaming) calls useChatStream.stop() AND dispatches assistant/stoppedByUser — the reducer preserves accumulated text (Pitfall 5)"
    - "'New conversation' button dispatches conversation/clear → greeting + chips return; role preserved; if a stream is in flight, stop() is called FIRST then the clear runs (no mid-stream delta leaking into wiped history)"
    - "'Change role' flow (Pitfall 13 — CRITICAL): clicking the role pill → selecting Change role opens ChangeRoleDialog; confirm runs: stop() → conversation/clear → setRole(null) → clearDraft() in that exact order so no delta from the old role's in-flight stream can contaminate the new role's state"
    - "Chip row hides permanently after the first message in a conversation (CONTEXT §Chip surface); reappears after 'New conversation' (empty-state returns)"
    - "Retry button on ErrorCard: dispatches assistant/retry{id} (removes the failed bubble) then re-sends user/send + assistant/start + useChatStream.send with the SAME user question (reconstructed from the last user bubble)"
    - "usePrompts fetches GET /api/prompts?role=<role> on mount and when role changes; returns {chips, loading, error}; on 5xx/network failure returns empty chip array (CONTEXT §Chip source: chat still works via freeform)"
    - "InputBar auto-focus after every send and after role-select transition (CONTEXT §Input bar) — achieved by Plan 04's forwardRef<HTMLTextAreaElement, InputBarProps>; ChatSurface holds a useRef<HTMLTextAreaElement> and calls ref.current?.focus() — Plan 05 does NOT modify InputBar (it was shipped forwardRef-ready by Plan 04)"
    - "Message/MessageList render ErrorCard with a working Retry when an assistant bubble has state='error'; the onRetry handler is provided by ChatSurface via the onRetry prop that Plan 04 already exposes on Message and MessageList — Plan 05 does NOT modify those components"
    - "Draft buffer restored on mount (from sessionStorage.kbroles.draft); cleared via clearDraft() after a successful send"
    - "Greeting card shows role-aware copy on empty chat (CONTEXT §Role-aware greeting: Consumer vs Author copy); hidden after the first message is sent"
  artifacts:
    - path: "src/chat-ui/ChatPage.tsx"
      provides: "'use client' orchestrator — useRolePersistence + hydrated gate + routing between RoleSelect and ChatSurface"
      exports: ["ChatPage"]
      min_lines: 25
    - path: "src/chat-ui/ChatSurface.tsx"
      provides: "'use client' main chat — Header + Greeting + MessageList + ChipRow + InputBar + ErrorCard; owns useReducer(chatReducer), useChatStream, useDraftBuffer, usePrompts, ChangeRoleDialog state; consumes Plan 04's InputBar via forwardRef and Plan 04's MessageList onRetry prop (no mutation of Plan 04 artefacts)"
      exports: ["ChatSurface"]
      min_lines: 140
    - path: "src/chat-ui/Greeting.tsx"
      provides: "'use client' role-aware greeting card (ROLE-04 copy)"
      exports: ["Greeting"]
      min_lines: 20
    - path: "src/chat-ui/usePrompts.ts"
      provides: "'use client' fetch hook for GET /api/prompts?role=<role> with loading/error state"
      exports: ["usePrompts"]
      min_lines: 30
    - path: "src/app/page.tsx"
      provides: "Root page — replaces Plan 01 placeholder with a server component rendering a dynamically-imported <ChatPage /> OR a simple 'use client' ChatPage export (whichever Plan execution chooses)"
      contains: "ChatPage"
  key_links:
    - from: "src/chat-ui/ChatSurface.tsx"
      to: "src/chat-ui/useChatStream.ts"
      via: "useChatStream(handleEvent) — handleEvent dispatches into chatReducer by event.type"
      pattern: "useChatStream"
    - from: "src/chat-ui/ChatSurface.tsx"
      to: "src/chat-ui/chatReducer.ts"
      via: "useReducer(chatReducer, initialChatState)"
      pattern: "useReducer.*chatReducer"
    - from: "src/chat-ui/ChatSurface.tsx"
      to: "src/chat-ui/useRolePersistence.ts"
      via: "setRole(null) on change-role confirm"
      pattern: "setRole"
    - from: "src/chat-ui/ChatSurface.tsx"
      to: "src/chat-ui/useDraftBuffer.ts"
      via: "clearDraft() on successful send"
      pattern: "clearDraft"
    - from: "src/chat-ui/ChatSurface.tsx"
      to: "src/chat-ui/InputBar.tsx"
      via: "<InputBar ref={inputRef} ... /> — consumes Plan 04's forwardRef export (no mutation)"
      pattern: "ref=\\{inputRef\\}"
    - from: "src/chat-ui/ChatSurface.tsx"
      to: "src/chat-ui/MessageList.tsx"
      via: "<MessageList onRetry={handleRetry} ... /> — consumes Plan 04's onRetry prop (no mutation)"
      pattern: "onRetry=\\{handleRetry\\}"
    - from: "src/chat-ui/usePrompts.ts"
      to: "/api/prompts"
      via: "fetch('/api/prompts?role=' + role)"
      pattern: "fetch\\(['\"]/api/prompts"
    - from: "src/chat-ui/ChatPage.tsx"
      to: "src/chat-ui/useRolePersistence.ts"
      via: "const {role, setRole, hydrated} = useRolePersistence()"
      pattern: "useRolePersistence"
    - from: "src/app/page.tsx"
      to: "src/chat-ui/ChatPage.tsx"
      via: "<ChatPage /> render"
      pattern: "ChatPage"
---

<objective>
Compose the state machine. Plans 02/03/04 shipped isolated units — reducer, hooks, presentational components (including InputBar with forwardRef and MessageList with onRetry). This plan wires them into ChatPage (role routing + hydration gate) and ChatSurface (the main chat screen owning reducer + stream + draft buffer + chip fetch + dialog state), then replaces the Plan 01 placeholder in `src/app/page.tsx` so visiting http://localhost:3000 delivers the full Phase-3 experience.

This plan is where Pitfall 13 (change-role mid-stream contamination) is eliminated by enforcing the order: stop() → conversation/clear → setRole(null) → clearDraft(). And where Retry's reconstruction of the failed user turn is implemented.

**Compositional-only discipline (CHECKER Issue 1 Fix B):** Plan 05 ONLY consumes Plan 04's component contracts. It does NOT edit `InputBar.tsx`, `Message.tsx`, or `MessageList.tsx`. Plan 04 already ships:
- InputBar wrapped with `forwardRef<HTMLTextAreaElement, InputBarProps>` → ChatSurface passes `ref={inputRef}`.
- Message with `onRetry?: (id: string) => void` prop → Plan 04's Message renders `<ErrorCard onRetry={() => onRetry?.(message.id)}/>` for error-state bubbles.
- MessageList with `onRetry?: (id: string) => void` prop → Plan 04's MessageList forwards onRetry to every Message.

Output: 4 new files + page.tsx replacement + 2 test files that exercise the three critical flows (initial role-select, chip-submit happy path, change-role-mid-stream Pitfall-13).
</objective>

<execution_context>
@C:\Users\taylo\.claude/get-shit-done/workflows/execute-plan.md
@C:\Users\taylo\.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
Depends on: Plans 01 (scaffold), 02 (reducer + types + sourceTitles + time), 03 (hooks), 04 (components — InputBar forwardRef + MessageList onRetry already in place).

Before starting, read:

@.planning/phases/03-role-experience-and-chat-ui/03-CONTEXT.md  (WHOLE FILE — this is the wiring spec)
@.planning/phases/03-role-experience-and-chat-ui/03-RESEARCH.md  (§Pattern 1 single-page vs route-segment — single-page chosen; §Pattern 2 reducer+Context; §Pattern 3 useChatStream invariants)
@docs/api-chat-contract.md  (§11 /api/prompts response shape — needed for usePrompts)

@src/chat-ui/types.ts, src/chat-ui/chatReducer.ts
@src/chat-ui/useRolePersistence.ts, src/chat-ui/useDraftBuffer.ts, src/chat-ui/useChatStream.ts
@src/chat-ui/RoleSelect.tsx, src/chat-ui/Message.tsx, src/chat-ui/MessageList.tsx
@src/chat-ui/ChipRow.tsx, src/chat-ui/InputBar.tsx, src/chat-ui/Header.tsx
@src/chat-ui/AssistantControls.tsx, src/chat-ui/ChangeRoleDialog.tsx, src/chat-ui/ErrorCard.tsx

**Plan-04 contract confirmation (CHECKER Issue 1 Fix B):** before writing ChatSurface, visually confirm:
- `grep -E "forwardRef<HTMLTextAreaElement" src/chat-ui/InputBar.tsx` → matches.
- `grep -E "onRetry\\??:" src/chat-ui/Message.tsx src/chat-ui/MessageList.tsx` → matches both files.
If either grep fails, Plan 04 is incomplete — do NOT proceed with Plan 05. Re-run the checker instead. Plan 05 must never mutate Plan 04's artefact prop shapes.

**LOCKED flow — Change role (Pitfall 13):**

1. User clicks role pill → popover → "Change role" → setChangeRoleOpen(true).
2. Dialog renders. User confirms (clicks "Change role and clear" button — CHECKER Issue 2 disambiguated label from Plan 04).
3. `onConfirm` handler runs in this EXACT order:
   a. `stop()` — aborts any in-flight `useChatStream` fetch.
   b. `dispatch({type: 'conversation/clear'})` — wipes messages and inFlightId.
   c. `setRole(null)` — clears sessionStorage.kbroles.role AND triggers ChatPage re-render to RoleSelect.
   d. `clearDraft()` — wipes sessionStorage.kbroles.draft.
4. Dialog closes.

Because `stop()` aborts BEFORE any state wipe, and because `useChatStream` guards on `signal.aborted` + the AbortError catch (Pitfall 5) silently drops, no delta arriving AFTER the abort can dispatch into the already-cleared state. The reducer's `conversation/clear` + subsequent `setRole(null)` unmount the ChatSurface entirely (ChatPage re-renders RoleSelect), so even if a stray dispatch landed, ChatSurface's reducer no longer exists.

**LOCKED flow — New conversation (CHAT-04):**

1. User clicks "New conversation" in Header.
2. Handler runs: if `inFlightId !== null`: `stop()` first. Always: `dispatch({type:'conversation/clear'})`, `clearDraft()`.
3. No dialog (lower stakes than change-role per CONTEXT §New conversation flow — no confirm).

**LOCKED flow — Retry (CHAT-07):**

1. User clicks Retry inside ErrorCard (which is rendered in place of the assistant bubble with state='error'). Plan 04's Message component wires the click to `onRetry?.(message.id)` automatically — Plan 05 just provides the onRetry handler on MessageList.
2. Handler receives the failed bubble's id. Must also know the TEXT of the preceding user turn — this is `state.messages[indexOf(errorBubble) - 1].text` (by construction, an assistant bubble is always preceded by the user bubble that caused it).
3. `dispatch({type:'assistant/retry', id: errorBubbleId})` — removes the failed bubble.
4. Generate a new id (`crypto.randomUUID()`). Dispatch `{type:'assistant/start', id: newId, at: Date.now()}`.
5. Build the `messages` array for the /api/chat POST body from state.messages (the user bubble is still there after retry removed the failed assistant bubble). Map assistant-kind bubbles with state==='done' to `{role:'assistant', content: m.text}`; user bubbles to `{role:'user', content: m.text}`.
6. Call `useChatStream.send(role, messagesForWire)`.

**LOCKED flow — Chip click (CONTEXT §Input & chips):**

1. Chip click → onChip(chip.text).
2. Handler: generate userId + asstId via crypto.randomUUID(). dispatch user/send → assistant/start. Call useChatStream.send(role, buildMessages(state, chip.text)).
3. Chips hide after first message (MessageList non-empty) — enforced by the render branch in ChatSurface: `{messages.length === 0 && <ChipRow ... />}`.

**Event→Dispatch map (LOCKED):**

```ts
function handleEvent(ev: SseEvent, requestId: string) {
  if (asstId === null) return   // race: event arrived after retry/clear wiped the bubble
  switch (ev.type) {
    case 'answer_delta':
      dispatch({type:'assistant/delta', id: asstId, text: ev.text})
      break
    case 'citations':
      dispatch({type:'assistant/citations', id: asstId, citations: ev.citations})
      break
    case 'done':
      dispatch({type:'assistant/done', id: asstId})
      break
    case 'fallback':
      dispatch({type:'assistant/fallback', id: asstId, text: ev.text})
      break
    case 'error':
      dispatch({type:'assistant/error', id: asstId, code: ev.code, requestId})
      break
  }
}
```

The `asstId` must be captured per-send so it's stable for the duration of that stream. Store it in a ref (`useRef<string | null>(null)`) updated at assistant/start time and cleared on any terminal event. The reducer's `inFlightId` also tracks this; for the handleEvent mapping, a ref is cleaner because it outlives re-renders reliably.

**Anti-patterns to avoid:**
- Do NOT store role in a useRef/useState inside ChatSurface and then call `send(role)` from a stale closure. The role prop comes from ChatPage and is passed to send() at call time (Pitfall 4). If ChatSurface captures role via destructuring at the top of the component, that's fine because React re-renders with the new role on change (but by that time ChatSurface is unmounting to RoleSelect anyway, so the concern is minimised).
- Do NOT render the "stream in flight → input also clears" behaviour. Textarea stays editable during stream (CONTEXT §In-flight state); submit is disabled but text persists.
- Do NOT persist messages[] in sessionStorage under any circumstance (Pitfall 17).
- **Do NOT edit Plan 04 artefacts (InputBar, Message, MessageList) in this plan.** All prop shapes and ref wiring are already in place from Plan 04. Mid-task mutation of Plan 04 artefacts was flagged by the checker (Issue 1) and explicitly forbidden.
</context>

<tasks>

<task type="auto">
  <name>Task 5.1: usePrompts + Greeting + ChatPage (role gate + hydration)</name>
  <files>src/chat-ui/usePrompts.ts, src/chat-ui/Greeting.tsx, src/chat-ui/ChatPage.tsx, src/chat-ui/__tests__/usePrompts.test.tsx, src/app/page.tsx</files>
  <action>
    1. **Create `src/chat-ui/usePrompts.ts`** — `'use client'`:
       ```ts
       'use client'
       import { useEffect, useState } from 'react'
       import type { Role, ChipItem } from './types'

       export function usePrompts(role: Role | null) {
         const [chips, setChips] = useState<ChipItem[]>([])
         const [loading, setLoading] = useState(false)
         const [error, setError] = useState<string | null>(null)

         useEffect(() => {
           if (role == null) { setChips([]); return }
           let cancelled = false
           const ctrl = new AbortController()
           setLoading(true)
           setError(null)
           fetch(`/api/prompts?role=${role}`, { signal: ctrl.signal })
             .then(async r => {
               if (!r.ok) throw new Error(`HTTP_${r.status}`)
               return r.json() as Promise<{ role: Role; prompts: ChipItem[] }>
             })
             .then(json => { if (!cancelled) setChips(json.prompts) })
             .catch(err => {
               if (err instanceof DOMException && err.name === 'AbortError') return
               if (!cancelled) { setChips([]); setError(String(err)) }
               // CONTEXT §Chip source: on failure, empty chip row; chat still works via freeform.
             })
             .finally(() => { if (!cancelled) setLoading(false) })
           return () => { cancelled = true; ctrl.abort() }
         }, [role])

         return { chips, loading, error }
       }
       ```

    2. **Create `src/chat-ui/Greeting.tsx`** — `'use client'`. Role-aware copy (CONTEXT §Role-aware greeting, verbatim):
       ```tsx
       'use client'
       import type { Role } from './types'

       const GREETING: Record<Role, string> = {
         consumer:
           "Hi — I'm your KB assistant for flagging articles, leaving feedback, and navigating the CTSS knowledge workflow. Ask me something or pick a starter below.",
         author:
           "Hi — I'm your KB assistant for authoring and publishing articles. Ask about form fields, section anchors, or pick a starter below.",
       }

       export function Greeting({ role }: { role: Role }) {
         return (
           <section
             aria-label="Welcome"
             className="mx-auto my-6 max-w-2xl rounded-xl border border-neutral-border bg-neutral-card p-5 shadow-sm"
           >
             <p className="text-sm">{GREETING[role]}</p>
           </section>
         )
       }
       ```

    3. **Create `src/chat-ui/ChatPage.tsx`** — `'use client'`. Owns role state + hydration gate:
       ```tsx
       'use client'
       import { useRolePersistence } from './useRolePersistence'
       import { RoleSelect } from './RoleSelect'
       import { ChatSurface } from './ChatSurface'

       export function ChatPage() {
         const { role, setRole, hydrated } = useRolePersistence()

         // Pitfall 4 (RESEARCH) — show a stable skeleton until hydration, so returning
         // users never see a flash of RoleSelect before sessionStorage loads.
         if (!hydrated) {
           return (
             <main className="mx-auto flex min-h-screen max-w-3xl items-center justify-center p-6">
               <div className="h-24 w-full max-w-md animate-pulse rounded-xl bg-neutral-card shadow-sm" />
             </main>
           )
         }

         if (role == null) {
           return <RoleSelect onPick={setRole} />
         }
         return <ChatSurface role={role} onChangeRole={() => setRole(null)} />
       }
       ```

       Note: `ChatPage` passes `onChangeRole={() => setRole(null)}` to ChatSurface; ChatSurface orchestrates stop+clear+clearDraft BEFORE invoking onChangeRole so the Pitfall-13 ordering is owned in one place (ChatSurface — Task 5.2).

    4. **Replace `src/app/page.tsx`** (Plan 01 placeholder) — simplest approach: make `page.tsx` a server component that renders `<ChatPage />` (ChatPage is a client component, so Next.js will serialise the boundary cleanly):
       ```tsx
       import { ChatPage } from '@/chat-ui/ChatPage'

       export default function HomePage() {
         return <ChatPage />
       }
       ```

       No `'use client'` in page.tsx — the client boundary sits at ChatPage. This keeps the route a server component (good for Next 16 streaming SSR) while all reactive state lives in the client tree.

    5. **Create `src/chat-ui/__tests__/usePrompts.test.tsx`** — `// @vitest-environment jsdom`:
       - Mock fetch. role=null → chips === [] after render.
       - **role='consumer' with chip-count assertion (CHECKER Issue 4)**: fetch called with URL matching `/api/prompts?role=consumer`; response mock returns `{role:'consumer', prompts: [<5 fake chips>]}`; post-resolution `expect(chips).toHaveLength(5)` — explicit `===5` assertion, not just "chips loaded".
       - **role='author' with chip-count assertion (CHECKER Issue 4)**: fetch URL contains `role=author`; response mock returns `{role:'author', prompts: [<8 fake chips>]}`; post-resolution `expect(chips).toHaveLength(8)`.
       - fetch rejects with a network error → chips===[], error is a non-null string (logged once per CONTEXT §Chip source).
       - fetch returns 500 → chips===[], error string includes 'HTTP_500'.
       - Role change from 'consumer' to 'author' issues a new fetch (fetch.mock.calls.length increases by 1); the prior fetch's AbortController.abort() was called (assert signal.aborted on the first call's signal argument); and chip count flips from 5 → 8 after the second response resolves (`expect(chips).toHaveLength(8)`).

    6. **Commit:** `feat(phase-3/plan-05): add usePrompts + Greeting + ChatPage role-gate + wire app/page.tsx`.
  </action>
  <verify>
    - `pnpm typecheck` passes.
    - `pnpm test` — ≥6 usePrompts tests green. Existing tests unaffected.
    - **Chip count assertions (CHECKER Issue 4)**: grep usePrompts.test.tsx for `toHaveLength(5)` AND `toHaveLength(8)` — BOTH must match (consumer=5, author=8).
    - `pnpm dev` — visiting http://localhost:3000 shows either RoleSelect or ChatSurface without console errors. (ChatSurface shell exists from Task 5.2 onward; if Task 5.2 is not yet complete the import of ChatSurface will fail typecheck — run Tasks 5.1 and 5.2 in sequence within one execution of this plan.)
    - grep 'use client' src/chat-ui/ChatPage.tsx, Greeting.tsx, usePrompts.ts → all three have the directive.
  </verify>
  <done>
    ChatPage hydration gate prevents flash; role is persisted via sessionStorage; usePrompts fetches role-specific chips (5 for consumer, 8 for author — both unit-asserted) and degrades gracefully on failure; root page.tsx now delivers the live chat page.
  </done>
</task>

<task type="auto">
  <name>Task 5.2: ChatSurface — reducer + stream + dispatches + all flows + Pitfall-13 test (compositional-only; no Plan-04 edits)</name>
  <files>src/chat-ui/ChatSurface.tsx, src/chat-ui/__tests__/ChatSurface.test.tsx</files>
  <action>
    1. **Create `src/chat-ui/ChatSurface.tsx`** — `'use client'`. This is the wiring hub. **NO EDITS to Plan 04 artefacts (InputBar/Message/MessageList) are permitted in this task** (CHECKER Issue 1 Fix B). The forwardRef wrapping on InputBar and the onRetry prop on Message/MessageList are ALREADY in place from Plan 04 — ChatSurface just consumes them.

       Reference structure (LOCKED — implementation is free to reorganise internals but must preserve flow ordering and dispatch mappings):

       ```tsx
       'use client'
       import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
       import { chatReducer, initialChatState } from './chatReducer'
       import { useChatStream } from './useChatStream'
       import { useDraftBuffer } from './useDraftBuffer'
       import { usePrompts } from './usePrompts'
       import type { Role, SseEvent, Message } from './types'
       import { Header } from './Header'
       import { Greeting } from './Greeting'
       import { MessageList } from './MessageList'
       import { ChipRow } from './ChipRow'
       import { InputBar } from './InputBar'
       import { ChangeRoleDialog } from './ChangeRoleDialog'

       const PLACEHOLDER: Record<Role, string> = {
         consumer: 'Ask about KB flagging, feedback, or article workflows…',
         author: 'Ask about KB form fields, anchors, or publishing…',
       }

       function buildWireMessages(messages: Message[], appendedUserText: string) {
         // Send ALL prior user/assistant turns + the new user turn, per stateless contract.
         const prior = messages
           .filter(m => m.kind === 'user' || (m.kind === 'assistant' && m.state === 'done'))
           .map(m => ({
             role: m.kind === 'user' ? 'user' as const : 'assistant' as const,
             content: m.text,
           }))
         return [...prior, { role: 'user' as const, content: appendedUserText }]
       }

       export function ChatSurface({ role, onChangeRole }: { role: Role; onChangeRole: () => void }) {
         const [state, dispatch] = useReducer(chatReducer, initialChatState)
         const { draft, setDraft, clearDraft } = useDraftBuffer()
         const { chips } = usePrompts(role)
         const asstIdRef = useRef<string | null>(null)
         const inputRef = useRef<HTMLTextAreaElement | null>(null)  // consumes Plan 04 forwardRef
         const [changeRoleOpen, setChangeRoleOpen] = useState(false)

         const handleEvent = useCallback((ev: SseEvent, requestId: string) => {
           const id = asstIdRef.current
           if (id === null) return
           switch (ev.type) {
             case 'answer_delta':
               dispatch({ type: 'assistant/delta', id, text: ev.text })
               break
             case 'citations':
               dispatch({ type: 'assistant/citations', id, citations: ev.citations })
               break
             case 'done':
               dispatch({ type: 'assistant/done', id })
               asstIdRef.current = null
               break
             case 'fallback':
               dispatch({ type: 'assistant/fallback', id, text: ev.text })
               asstIdRef.current = null
               break
             case 'error':
               dispatch({ type: 'assistant/error', id, code: ev.code, requestId })
               asstIdRef.current = null
               break
           }
         }, [])

         const { send, stop, isStreaming } = useChatStream(handleEvent)

         const dispatchSend = useCallback(
           (text: string) => {
             const trimmed = text.trim()
             if (!trimmed) return
             const userId = crypto.randomUUID()
             const asstId = crypto.randomUUID()
             const now = Date.now()
             dispatch({ type: 'user/send', id: userId, text: trimmed, at: now })
             dispatch({ type: 'assistant/start', id: asstId, at: now })
             asstIdRef.current = asstId
             const wire = buildWireMessages(state.messages, trimmed)
             // Pitfall 4: role is passed as an argument to send() explicitly.
             void send(role, wire)
             // NIT: clearDraft() writes '' into sessionStorage AND updates the draft state
             // in useDraftBuffer; an explicit setDraft('') would be redundant.
             clearDraft()
             inputRef.current?.focus()
           },
           [role, send, clearDraft, state.messages],
         )

         const handleNewConversation = useCallback(() => {
           if (state.inFlightId != null) stop()
           dispatch({ type: 'conversation/clear' })
           clearDraft()
           asstIdRef.current = null
           inputRef.current?.focus()
         }, [state.inFlightId, stop, clearDraft])

         const handleConfirmChangeRole = useCallback(() => {
           // Pitfall 13 LOCKED ORDER: stop → clear → setRole(null) via onChangeRole → clearDraft.
           stop()
           dispatch({ type: 'conversation/clear' })
           asstIdRef.current = null
           setChangeRoleOpen(false)
           onChangeRole()           // triggers setRole(null) in ChatPage → unmounts us to RoleSelect
           clearDraft()
         }, [stop, onChangeRole, clearDraft])

         const handleStop = useCallback(() => {
           const id = state.inFlightId
           if (id == null) return
           stop()
           dispatch({ type: 'assistant/stoppedByUser', id })
           asstIdRef.current = null
         }, [state.inFlightId, stop])

         const handleRetry = useCallback(
           (errorBubbleId: string) => {
             // Find the user bubble immediately preceding the failed assistant bubble.
             const idx = state.messages.findIndex(m => m.id === errorBubbleId)
             if (idx <= 0) return
             const userMsg = state.messages[idx - 1]
             if (userMsg.kind !== 'user') return
             dispatch({ type: 'assistant/retry', id: errorBubbleId })
             const asstId = crypto.randomUUID()
             dispatch({ type: 'assistant/start', id: asstId, at: Date.now() })
             asstIdRef.current = asstId
             // Rebuild wire messages WITHOUT the failed bubble (assistant/retry already removed it).
             const priorMessages = state.messages.slice(0, idx)   // up to and including userMsg
             const wire = priorMessages
               .filter(m => m.kind === 'user' || (m.kind === 'assistant' && m.state === 'done'))
               .map(m => ({
                 role: m.kind === 'user' ? 'user' as const : 'assistant' as const,
                 content: m.text,
               }))
             void send(role, wire)
           },
           [state.messages, role, send],
         )

         const handleFeedback = useCallback(
           (id: string, next: 'up' | { kind: 'down'; reason: 'hallucinated' | 'wrong_citation' | 'incomplete' | 'other' } | null) => {
             if (next === null) dispatch({ type: 'feedback/clear', id })
             else if (next === 'up') dispatch({ type: 'feedback/up', id })
             else dispatch({ type: 'feedback/down', id, reason: next.reason })
           },
           [],
         )

         // Auto-focus textarea on mount and on role transition (new ChatSurface render).
         useEffect(() => { inputRef.current?.focus() }, [])

         const isEmpty = state.messages.length === 0

         return (
           <div className="flex min-h-screen flex-col bg-background">
             <Header
               role={role}
               onChangeRole={() => setChangeRoleOpen(true)}
               onNewConversation={handleNewConversation}
             />
             <main className="flex flex-1 flex-col overflow-hidden">
               <div className="flex-1 overflow-y-auto">
                 {isEmpty && <Greeting role={role} />}
                 <MessageList
                   messages={state.messages}
                   inFlightId={state.inFlightId}
                   onCopy={() => { /* no-op observer; copy handled by AssistantControls internals */ }}
                   onFeedback={handleFeedback}
                   onRetry={handleRetry}   // consumes Plan 04's onRetry prop (no mutation)
                 />
               </div>
               {isEmpty && <ChipRow chips={chips} onChip={dispatchSend} disabled={isStreaming} />}
               <InputBar
                 ref={inputRef}           // consumes Plan 04's forwardRef (no mutation)
                 value={draft}
                 onChange={setDraft}
                 onSubmit={() => dispatchSend(draft)}
                 onStop={handleStop}
                 isStreaming={isStreaming}
                 placeholder={PLACEHOLDER[role]}
                 hintVisible={isEmpty}
               />
             </main>
             <ChangeRoleDialog
               open={changeRoleOpen}
               onOpenChange={setChangeRoleOpen}
               onConfirm={handleConfirmChangeRole}
             />
           </div>
         )
       }
       ```

       **Compositional contract checklist (CHECKER Issue 1 Fix B):**
       - `ref={inputRef}` on `<InputBar>` — works because Plan 04 wraps InputBar with `forwardRef<HTMLTextAreaElement, InputBarProps>`.
       - `onRetry={handleRetry}` on `<MessageList>` — works because Plan 04's MessageList has `onRetry?: (id: string) => void` prop and forwards to each Message, which wires it through to ErrorCard.
       - **NO EDITS to `src/chat-ui/InputBar.tsx`, `src/chat-ui/Message.tsx`, or `src/chat-ui/MessageList.tsx`** in this task. If the compositional wiring requires a change to any of these files, STOP and escalate — Plan 04 is incomplete.

    2. **Create `src/chat-ui/__tests__/ChatSurface.test.tsx`** — `// @vitest-environment jsdom`. Use @testing-library/react + user-event. Mock fetch for both /api/prompts and /api/chat:

       **Test 1 — Empty state → chip click → stream → done (with chip-count assertion — CHECKER Issue 4):**
       - Mock fetch: `/api/prompts?role=consumer` returns exactly 5 fake chips; `/api/chat` returns an SSE stream that emits answer_delta('Hello'), citations([{source_id:'KB0022991', section_id:'flagging-articles', quote:'x'}]), done.
       - Render `<ChatSurface role='consumer' onChangeRole={vi.fn()} />`.
       - Wait for chips to render: `await screen.findAllByRole('listitem')`.
       - **Chip count assertion (CHECKER Issue 4)**: `expect(chips).toHaveLength(5)` — proves consumer loads 5 chips end-to-end.
       - user.click(first chip) → user message and assistant bubble appear (await findByText('Hello')).
       - After done event settles, citation pill rendered; chip row is now hidden (empty-state false).
       - Copy button click on the assistant bubble → navigator.clipboard.writeText called with the UTIL-01 exact format.

       **Test 1b — Author chip count end-to-end (CHECKER Issue 4):**
       - Mock fetch: `/api/prompts?role=author` returns exactly 8 fake chips.
       - Render `<ChatSurface role='author' onChangeRole={vi.fn()} />`.
       - Wait for chip row: `await screen.findAllByRole('listitem')`.
       - Assert `chips.length === 8` — proves author loads 8 chips end-to-end.

       **Test 2 — Free-form send via Enter key:**
       - Mock fetch: /api/chat returns a stream.
       - Render surface. user.type(textarea, 'How do I flag?'). user.keyboard('{Enter}').
       - /api/chat fetch called; body parses to `{role:'consumer', messages: [{role:'user', content:'How do I flag?'}]}`.

       **Test 3 — Stop during in-flight preserves partial text (CHAT-03 + reducer's stoppedByUser + Pitfall 5):**
       - Mock fetch: /api/chat returns a stream emitting answer_delta('Start of answer '), then delays 10s before the next event.
       - send a message. After the first delta renders, click Stop.
       - Assert the fetch was aborted (signal.aborted === true on the mock's captured call).
       - Assert the assistant bubble retains the text 'Start of answer ' (NOT blanked).
       - Assert isStreaming is now false (submit button re-enabled).
       - NO error bubble rendered.

       **Test 4 — New conversation clears messages, keeps role:**
       - After a successful send + done, click "New conversation" in Header.
       - Assert messages length === 0; Greeting re-renders; chip row reappears; role pill still reads the same role.

       **Test 5 — Change role confirm (Pitfall 13 CRITICAL — CHECKER Issue 2 disambiguated selector):**
       - Start a stream with role='consumer' that emits answer_delta('partial ') and delays the next event.
       - After the first delta renders, click the role pill (Knowledge Consumer) → click the popover option `Change role` (selector: `getByRole('button', { name: /^change role$/i })`).
       - Dialog appears. Click confirm button `Change role and clear` (selector: `getByRole('button', { name: /change role and clear/i })` — disambiguated per CHECKER Issue 2).
       - Assert in order:
         a. The original fetch's AbortController.abort() was called BEFORE onChangeRole prop fired (check via vi spies on stop() + onChangeRole).
         b. state.messages === [] (conversation cleared).
         c. onChangeRole prop called (test prop vi.fn() received exactly 1 call).
         d. sessionStorage.kbroles.draft cleared (undefined/null).
       - The subsequent chunk from the delayed stream (if any mock advances timers) MUST NOT render anything — the surface is unmounted by onChangeRole → ChatPage → setRole(null) in the real app, but within this component test we verify the stop() + clear ordering. Add an explicit post-assertion: even if handleEvent fires after abort, asstIdRef.current is null (set to null in handleConfirmChangeRole), so the no-op early return in handleEvent prevents any dispatch.

       **Test 6 — Error bubble + Retry (CHAT-07 — CHECKER Issue 1 Fix B contract consumption):**
       - Mock fetch: first /api/chat call returns an SSE stream emitting {type:'error', code:'upstream_5xx', message:'x'}. X-Request-Id='err-1'.
       - send 'What about X?'. Assert ErrorCard renders inside the assistant bubble slot (role='alert' present, request ID 'err-1' visible when Details opened).
       - Second /api/chat mock: happy path stream emitting done.
       - Click Retry. Assert:
         a. The failed assistant bubble is removed (only the user bubble remains post-retry dispatch).
         b. A new fetch was issued to /api/chat with messages containing the SAME user question.
         c. Post-settle, the new assistant bubble is state='done' and there is exactly ONE user bubble (not duplicated).
       - **Compositional-contract assertion (CHECKER Issue 1 Fix B)**: Retry works BECAUSE Plan 04's Message wires ErrorCard.onRetry → onRetry?.(message.id) and Plan 04's MessageList forwards onRetry. Plan 05 merely provides the `handleRetry` callback on `<MessageList onRetry={handleRetry} />`. No Plan 04 artefact is modified here.

       **Test 7 — Chip click during in-flight is gated:**
       - Start a stream (long-running). Chip row is already hidden because messages.length > 0, so this is a defence-in-depth test.
       - Forcibly render ChipRow (not a realistic path, but catches future regression): verify `disabled` prop is `true` when isStreaming so buttons don't fire.

       **Test 8 — Returning user (role persisted) skips RoleSelect:**
       - This test targets ChatPage, not ChatSurface directly. Add a lightweight test:
         - Seed sessionStorage.kbroles.role='author' before render.
         - Render `<ChatPage />`. After hydration tick, assert:
           - The Author greeting copy renders ("form fields, section anchors, or pick a starter below").
           - RoleSelect is NOT in the DOM (no "Knowledge Consumer" card visible).
       - This test may live in a separate ChatPage.test.tsx file; acceptable either way.

    3. **Commit:** `feat(phase-3/plan-05): wire ChatSurface + Pitfall-13 change-role ordering + retry flow (compositional consumption of Plan 04 forwardRef + onRetry)`.
  </action>
  <verify>
    - `pnpm typecheck` passes.
    - `pnpm test` — ≥9 new ChatSurface/ChatPage tests green (includes 1b for author chip-count). Critical tests by name: "Pitfall 13" or "change role", "Stop preserves partial", "Retry", "Returning user", "Author chip count".
    - Manual smoke: `pnpm dev` → visit http://localhost:3000 → pick Consumer → see greeting + 5 chips → click a chip → see streaming text from the real /api/chat (dev-mode OpenAI path) → console shows no errors → 'New conversation' resets → 'Change role' prompts confirm dialog with "Change role and clear" button.
    - grep ChatSurface.tsx for `stop()` occurrences — ≥3 (in stop handler, change-role handler, new-conversation handler).
    - grep ChatSurface.tsx for `onChangeRole()` — called in handleConfirmChangeRole AFTER stop() and conversation/clear.
    - **No Plan-04 edits (CHECKER Issue 1 Fix B)**: `git diff --stat src/chat-ui/InputBar.tsx src/chat-ui/Message.tsx src/chat-ui/MessageList.tsx` after Task 5.2 → ALL THREE files show zero modifications from Plan-04 state. If any of them has diff lines, Plan 05 has violated the compositional-only contract.
    - **ChatSurface consumes forwardRef + onRetry (CHECKER Issue 1 Fix B)**: grep ChatSurface.tsx for `ref={inputRef}` AND `onRetry={handleRetry}` — both must match.
    - **Disambiguated confirm selector (CHECKER Issue 2)**: grep ChatSurface.test.tsx for `change role and clear` — must match.
    - **Chip count assertions (CHECKER Issue 4)**: grep ChatSurface.test.tsx for `toHaveLength(5)` AND `toHaveLength(8)` — both must match (consumer and author tests).
  </verify>
  <done>
    Full chat experience is wired end-to-end. ChatPage hydration gate + role routing + ChatSurface composition all deliver the 5 Phase-3 SCs behaviourally. Pitfall 13 ordering is test-enforced. Retry correctly reconstructs the user turn via Plan 04's onRetry prop (no mutation of Plan 04 contracts). The running app serves the Phase-3 MVP at http://localhost:3000.
  </done>
</task>

</tasks>

<verification>
  - `pnpm typecheck` clean.
  - `pnpm test` green — ≥15 new tests across this plan (≥6 usePrompts + ≥9 ChatSurface/ChatPage including author chip-count test).
  - `pnpm dev` runs; manual smoke from the "Manual smoke" step passes (documented in SUMMARY).
  - Pitfall 13 test by name present in ChatSurface test file.
  - **Compositional-only contract (CHECKER Issue 1 Fix B)**: `git diff --stat HEAD~N src/chat-ui/InputBar.tsx src/chat-ui/Message.tsx src/chat-ui/MessageList.tsx` from the start of Plan 05 work shows zero lines changed in these three files. Plan 05 never mutates Plan 04 artefact prop shapes.
  - **Chip count (CHECKER Issue 4)**: usePrompts test AND ChatSurface test BOTH assert `toHaveLength(5)` for consumer and `toHaveLength(8)` for author.
  - **Dialog selector (CHECKER Issue 2)**: ChatSurface.test.tsx uses `change role and clear` selector for the dialog confirm button.
  - No sessionStorage key other than `kbroles.role` and `kbroles.draft` is written (grep across src/chat-ui/*.ts, *.tsx for `sessionStorage.setItem`): only these two keys appear. AUTH-02 + Pitfall 17 guards preserved.
  - `grep -rE "'@/(chat|grounding|prompts)'" src/chat-ui/ src/app/page.tsx` → no matches (server modules still not imported by client).
</verification>

<success_criteria>
Phase-3 SC #1 — user lands on RoleSelect, picks consumer/author → ChatSurface with role-aware greeting + role-specific chips (5 for consumer, 8 for author — both unit-asserted): Tests 1 + 1b + 8 (plus usePrompts tests from Task 5.1).
Phase-3 SC #2 — chip click → typing dots → streaming text → 👍/👎: Test 1 covers the full sequence (clipboard/copy format + citation render included).
Phase-3 SC #3 — Stop / New conversation / Change role (with "Change role and clear" confirm — CHECKER Issue 2): Tests 3 + 4 + 5.
Phase-3 SC #4 — Enter/Shift+Enter keyboard (already Plan-04 verified) + error card with retry: Tests 2 + 6.
Phase-3 SC #5 — copy with `(Source: ...)` suffix + 👎 fixed-option radio: covered by Plan-04 AssistantControls tests + Test 1 copy-from-rendered-bubble cross-check.

Pitfall coverage:
- Pitfall 4 (role contamination): verified at hook level in Plan 03; re-verified at wiring level in Test 1 + Test 2 (fetch body parses the expected role).
- Pitfall 13 (change-role mid-stream): Test 5 — the ORDERING of stop/clear/setRole/clearDraft is asserted.
- Pitfall 17 (draft-only sessionStorage): verified at hook level in Plan 03 + re-verified here by the grep guard in <verification>.
- Pitfall 18 (change-role confirm): Plan 04 ChangeRoleDialog tests + wiring confirmation in Test 5.
- CHECKER Issue 1 Fix B: compositional-only contract verified by `git diff` showing zero changes to Plan-04 artefacts.
- CHECKER Issue 4: chip-count assertions (5 consumer, 8 author) at both unit (usePrompts) and integration (ChatSurface) levels.

Playwright coverage of these flows happens in Plan 06 — that plan closes the phase with browser-level E2E proof.
</success_criteria>

<output>
After completion, create `.planning/phases/03-role-experience-and-chat-ui/03-05-SUMMARY.md`. Capture:
- New test count delta (≥15) and total repo test count.
- Manual smoke notes: Consumer + Author role pick (verify 5 vs 8 chips visible), chip-submit, Stop, New conversation, Change-role flow with "Change role and clear" confirm button — all verified via `pnpm dev`.
- List of critical tests by name:
  - "Pitfall 13 — change role confirm aborts + clears + setRole order"
  - "Stop preserves accumulated text (Pitfall 5 + stoppedByUser)"
  - "Retry rebuilds user turn and re-sends"
  - "Returning user skips RoleSelect"
  - "Author chip count 8" (CHECKER Issue 4 integration cross-check)
- **Compositional contract evidence (CHECKER Issue 1 Fix B):** include the output of `git diff --stat <plan-04-SHA>..HEAD src/chat-ui/InputBar.tsx src/chat-ui/Message.tsx src/chat-ui/MessageList.tsx` — all three should be 0 lines modified.
- Known-ok tradeoffs:
  - Autoscroll on new message is not implemented here — it's a visual polish item for Plan 06 E2E observation. If it's missing and the user complains during UAT, add a simple `useEffect` with a ref.scrollIntoView at ChatSurface bottom.
  - Relative-timestamp tick refresh (every 30s) not yet added — messages update on next render; acceptable for v1.
- Flag that Plan 06 validates these flows in real Playwright against `pnpm dev`.
</output>
