---
phase: 3
plan: 4
name: presentational-components
type: execute
wave: 2
depends_on: [1, 2]
files_modified:
  - src/chat-ui/RoleSelect.tsx
  - src/chat-ui/Message.tsx
  - src/chat-ui/MessageList.tsx
  - src/chat-ui/TypingDots.tsx
  - src/chat-ui/ChipRow.tsx
  - src/chat-ui/InputBar.tsx
  - src/chat-ui/Timestamp.tsx
  - src/chat-ui/AssistantControls.tsx
  - src/chat-ui/FeedbackPanel.tsx
  - src/chat-ui/ChangeRoleDialog.tsx
  - src/chat-ui/ErrorCard.tsx
  - src/chat-ui/Header.tsx
  - src/chat-ui/cn.ts
  - src/chat-ui/__tests__/RoleSelect.test.tsx
  - src/chat-ui/__tests__/InputBar.test.tsx
  - src/chat-ui/__tests__/AssistantControls.test.tsx
  - src/chat-ui/__tests__/ErrorCard.test.tsx
  - src/chat-ui/__tests__/ChangeRoleDialog.test.tsx
autonomous: true

must_haves:
  truths:
    - "RoleSelect renders two role cards (Knowledge Consumer, KB Author / SME) with icon + label; Tab navigates between cards; Enter/Space selects; WCAG AA focus ring visible — Pitfall 16 guarantee (icon always paired with colour)"
    - "InputBar Enter submits (CHAT-05), Shift+Enter inserts a newline, submit button disabled when input is empty OR isStreaming=true; during stream the submit icon swaps to stop (Square) and clicking calls onStop (CHAT-03)"
    - "Message renders user bubble right-aligned primary-accent AND assistant bubble left-aligned neutral-card with KB circular badge; citations render as pill chips below the bubble; state='fallback' adds a left-border accent + Info icon; state='error' does NOT render the bubble content (parent replaces with ErrorCard)"
    - "AssistantControls Copy button writes `<answer>\\n\\n(Source: <source_id> · <title>)` to clipboard via navigator.clipboard.writeText; if no citations, copy body only; source title resolved from SOURCE_TITLES map (Plan 02); if title missing, fallback is source_id alone"
    - "FeedbackPanel (👎 expand) renders a Radix RadioGroup with the four fixed options (hallucinated / wrong_citation / incomplete / other) and NO free-text field (FDBK-02 explicit); selecting a reason calls onReason and the panel collapses"
    - "ChangeRoleDialog is a Radix Dialog; Cancel has autoFocus (default-focused per CONTEXT §Change role flow + Pitfall 18); confirm only closes + fires onConfirm; ESC and overlay click also dismiss (Radix default behaviour)"
    - "ErrorCard renders ⚠ icon + role-neutral copy + code-specific message + Retry button + collapsed 'Details' showing Request ID; Retry button fires onRetry callback"
    - "Timestamp renders a Radix Tooltip; the time element is tabIndex=0 (keyboard focus reveals absolute time — CHAT-06 accessibility requirement); both hover AND focus open the tooltip"
    - "ChipRow renders ChipItem[] as buttons in a horizontal flex row; each chip click calls onChip(text) which auto-submits the full prompt text (CONTEXT §Input & chips — chip click auto-submits, not prefill)"
    - "Every component file starts with 'use client' and does NOT import from @/chat, @/grounding, or @/prompts (bundle-safety guard)"
  artifacts:
    - path: "src/chat-ui/cn.ts"
      provides: "cn(...classes) = twMerge(clsx(classes)) — conditional className helper (Pitfall 7 guard against Tailwind v4 class-order ambiguity)"
      exports: ["cn"]
    - path: "src/chat-ui/RoleSelect.tsx"
      provides: "<RoleSelect onPick={(role) => void} /> — two-card landing"
      exports: ["RoleSelect"]
    - path: "src/chat-ui/Message.tsx"
      provides: "<Message message={Message} onCopy onFeedback /> — user OR assistant bubble with citations + controls slot"
      exports: ["Message"]
    - path: "src/chat-ui/MessageList.tsx"
      provides: "<MessageList messages={Message[]} inFlightId={string|null} onCopy onFeedback /> — rendered list + TypingDots bubble when the in-flight bubble has empty text"
      exports: ["MessageList"]
    - path: "src/chat-ui/TypingDots.tsx"
      provides: "<TypingDots /> three-dot animation with role=status + aria-live='polite' + 'Assistant is typing' SR text (CHAT-02)"
      exports: ["TypingDots"]
    - path: "src/chat-ui/ChipRow.tsx"
      provides: "<ChipRow chips={ChipItem[]} onChip={(text)=>void} disabled={boolean} />"
      exports: ["ChipRow"]
    - path: "src/chat-ui/InputBar.tsx"
      provides: "<InputBar value onChange onSubmit onStop isStreaming placeholder /> — Enter/Shift+Enter, submit/stop swap"
      exports: ["InputBar"]
    - path: "src/chat-ui/Timestamp.tsx"
      provides: "<Timestamp at={number} /> — Radix Tooltip over <time> with keyboard tabIndex (CHAT-06)"
      exports: ["Timestamp"]
    - path: "src/chat-ui/AssistantControls.tsx"
      provides: "<AssistantControls message feedback onCopy onFeedback /> — Copy + 👍/👎 pair always visible"
      exports: ["AssistantControls"]
    - path: "src/chat-ui/FeedbackPanel.tsx"
      provides: "<FeedbackPanel onReason={(reason)=>void} onCancel /> — Radix RadioGroup with four fixed options"
      exports: ["FeedbackPanel"]
    - path: "src/chat-ui/ChangeRoleDialog.tsx"
      provides: "<ChangeRoleDialog open onOpenChange onConfirm /> — Radix Dialog confirm (Pitfall 18)"
      exports: ["ChangeRoleDialog"]
    - path: "src/chat-ui/ErrorCard.tsx"
      provides: "<ErrorCard errorCode requestId onRetry /> — CHAT-07 infrastructure error + X-Request-Id surfacing"
      exports: ["ErrorCard"]
    - path: "src/chat-ui/Header.tsx"
      provides: "<Header role onChangeRole onNewConversation /> — role pill (left) + New conversation (right); role pill uses Radix Popover with 'Change role' option"
      exports: ["Header"]
  key_links:
    - from: "src/chat-ui/AssistantControls.tsx"
      to: "src/ui/sourceTitles.ts"
      via: "resolveSourceTitle(citation.section_id) for UTIL-01 copy suffix"
      pattern: "resolveSourceTitle|SOURCE_TITLES"
    - from: "src/chat-ui/Timestamp.tsx"
      to: "@radix-ui/react-tooltip"
      via: "Tooltip.Root + Tooltip.Trigger + Tooltip.Content"
      pattern: "Tooltip\\."
    - from: "src/chat-ui/ChangeRoleDialog.tsx"
      to: "@radix-ui/react-dialog"
      via: "Dialog.Root + Dialog.Portal + Dialog.Overlay + Dialog.Content"
      pattern: "Dialog\\."
    - from: "src/chat-ui/FeedbackPanel.tsx"
      to: "@radix-ui/react-radio-group"
      via: "RadioGroup.Root with four Item values"
      pattern: "RadioGroup"
    - from: "src/chat-ui/Header.tsx"
      to: "@radix-ui/react-popover"
      via: "Popover.Root for the role-pill dropdown"
      pattern: "Popover\\."
    - from: "src/chat-ui/RoleSelect.tsx"
      to: "lucide-react"
      via: "User, Pencil icons (Pitfall 16 — icon + colour pairing)"
      pattern: "lucide-react"
---

<objective>
Build the complete presentational layer for Phase 3: role-select landing, chat header, message bubbles + citations + controls, typing dots, chip row, input bar with Enter/Shift+Enter, timestamp tooltip, change-role confirm dialog, inline 👎 feedback panel, error card. Every component is stateless-over-props (or uses only local ephemeral state like dialog-open); state machine logic lives in Plan 05's wiring.

Purpose: isolating presentation from state means Plan 05's ChatPage/ChatSurface can compose these components without caring about Radix portal semantics, Tailwind class-order edge cases, or keyboard-event handling. It also means this plan's tests can be pure render-assertion tests — no fetch, no stream, no reducer.

Output: 13 component files + 1 className helper + 5 jsdom-tagged test files covering the interaction surfaces that derive directly from Phase-3 success criteria (role-select, input keyboard, assistant controls including UTIL-01 copy format, error card, change-role confirm).
</objective>

<execution_context>
@C:\Users\taylo\.claude/get-shit-done/workflows/execute-plan.md
@C:\Users\taylo\.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
Depends on:
- Plan 01 (scaffold) — Radix primitives installed, Tailwind v4 compiling, lucide-react present, @testing-library/react + user-event + jsdom ready.
- Plan 02 (pure primitives) — imports `Role`, `Message`, `Citation`, `ChipItem` from `src/chat-ui/types.ts`; imports `resolveSourceTitle` from `src/ui/sourceTitles.ts`; imports `formatRelative` from `src/lib/time.ts`.

Runs in Wave 2 in PARALLEL with Plan 03 (hooks). Zero `files_modified` overlap.

Before starting, read:

@.planning/phases/03-role-experience-and-chat-ui/03-CONTEXT.md  (§Role-select landing — card layout + keyboard; §Chat surface styling — bubble styling; §Input & chips — chip auto-submit + keyboard; §Controls, feedback & errors — Copy / Thumbs / ErrorCard copy variants + error code mapping)
@.planning/phases/03-role-experience-and-chat-ui/03-RESEARCH.md  (§Don't Hand-Roll — use Radix for Dialog/Tooltip/RadioGroup/Popover; §Code Examples §Example 2 ChangeRoleDialog + §Example 3 Timestamp/Tooltip)
@docs/api-chat-contract.md  (§9 Citation shape — for chip rendering)
@info/KB_Assistant_ClaudeCode_Handover.md  (§14 avatar + bubble styling cues; §15 fallback copy text for reference — already surfaced via fallback SSE event)

@src/chat-ui/types.ts            (Plan 02 — Role, Message, Citation, ChipItem)
@src/ui/sourceTitles.ts          (Plan 02 — resolveSourceTitle)
@src/lib/time.ts                 (Plan 02 — formatRelative)

**Error-code → copy mapping (LOCKED — CONTEXT §Error card):**

| errorCode | Title / copy | Retry semantics |
|-----------|--------------|-----------------|
| `upstream_timeout` | "The knowledge service took too long. Retry?" | Safe — allow immediate retry. |
| `upstream_5xx` | "The knowledge service is temporarily unavailable. Retry in a moment?" | Allow retry, no auto. |
| `schema_reject_after_retry` | "We couldn't format the answer. Refresh and try again." | Retry may help. |
| `internal` (catch-all incl. rate_limited message 'rate_limited:N') | "Something went wrong. Please try again." | Honour Retry-After hint if message starts with `rate_limited:` — parse the suffix for auto-retry countdown (Plan 05 wiring handles the actual auto-retry; this component just shows the copy). |

**Auto-submit chip anti-pattern (Pitfall 9 — RESEARCH):** Chips auto-submit (CONTEXT §Chip-click behaviour). Pass a `disabled` prop from ChatSurface so chips don't double-fire during an in-flight stream. CONTEXT already locks "chips hide after first message", which is the primary guard; `disabled` is belt-and-suspenders.

**Important: DO NOT import from '@/chat/*', '@/grounding/*', or '@/prompts/*' (server modules — would bundle zod + env into the client).**

**Tailwind v4 class-order note (Pitfall 7):** For conditionally composed classNames (e.g. role-specific bubble colours), use `cn()` which runs `twMerge(clsx(...))` so later-named classes reliably override earlier ones regardless of source order.

**Testing strategy:**

- Tests opt into jsdom via `// @vitest-environment jsdom` docblock at file head.
- Use @testing-library/react for render + screen queries.
- Use @testing-library/user-event v14+ for realistic keyboard interactions (CHAT-05 Enter/Shift+Enter must be tested with `user.keyboard` not fireEvent).
- Mock `navigator.clipboard` where needed (set `Object.defineProperty(navigator, 'clipboard', { writable: true, value: { writeText: vi.fn() } })`).

- Only 5 test files in this plan (RoleSelect, InputBar, AssistantControls, ErrorCard, ChangeRoleDialog). Other components are trivial glue (Message, MessageList, TypingDots, Timestamp, ChipRow, Header) and are tested at integration time in Plan 06 (E2E). If a purely-visual component has interaction logic worth isolating, add a test for it.
</context>

<tasks>

<task type="auto">
  <name>Task 4.1: Core layout components — cn, RoleSelect, Message, MessageList, TypingDots, ChipRow, Timestamp, Header + RoleSelect test</name>
  <files>src/chat-ui/cn.ts, src/chat-ui/RoleSelect.tsx, src/chat-ui/Message.tsx, src/chat-ui/MessageList.tsx, src/chat-ui/TypingDots.tsx, src/chat-ui/ChipRow.tsx, src/chat-ui/Timestamp.tsx, src/chat-ui/Header.tsx, src/chat-ui/__tests__/RoleSelect.test.tsx</files>
  <action>
    1. **Create `src/chat-ui/cn.ts`**:
       ```ts
       import { clsx, type ClassValue } from 'clsx'
       import { twMerge } from 'tailwind-merge'
       export function cn(...inputs: ClassValue[]): string {
         return twMerge(clsx(inputs))
       }
       ```

    2. **Create `src/chat-ui/RoleSelect.tsx`** — `'use client'`. Props: `{ onPick: (role: Role) => void }`. Renders two role cards in a grid (lg:grid-cols-2, grid-cols-1 mobile). Each card is a `<button>` so Tab reaches it natively.
       ```tsx
       'use client'
       import { User, Pencil } from 'lucide-react'
       import type { Role } from './types'
       import { cn } from './cn'

       export function RoleSelect({ onPick }: { onPick: (role: Role) => void }) {
         return (
           <main className="mx-auto flex min-h-screen max-w-4xl items-center justify-center p-6">
             <section aria-labelledby="role-select-heading" className="w-full">
               <h1 id="role-select-heading" className="mb-2 text-center text-2xl font-semibold">
                 Who are you today?
               </h1>
               <p className="mb-8 text-center text-sm text-neutral-muted">
                 Pick the experience that matches what you want to do.
               </p>
               <div className="grid gap-4 md:grid-cols-2">
                 <RoleCard
                   label="Knowledge Consumer"
                   description="Find answers about KB articles, flagging, and feedback workflows."
                   accent="consumer"
                   icon={<User size={22} aria-hidden />}
                   onClick={() => onPick('consumer')}
                 />
                 <RoleCard
                   label="KB Author / SME"
                   description="Get help with KB form fields, section anchors, and publishing."
                   accent="author"
                   icon={<Pencil size={22} aria-hidden />}
                   onClick={() => onPick('author')}
                 />
               </div>
             </section>
           </main>
         )
       }

       function RoleCard({
         label, description, accent, icon, onClick,
       }: {
         label: string; description: string
         accent: 'consumer' | 'author'
         icon: React.ReactNode
         onClick: () => void
       }) {
         const accentClasses =
           accent === 'consumer'
             ? 'border-consumer-600/40 bg-consumer-50'
             : 'border-author-600/40 bg-author-50'
         const iconClasses =
           accent === 'consumer' ? 'text-consumer-600' : 'text-author-600'
         return (
           <button
             type="button"
             onClick={onClick}
             className={cn(
               'flex flex-col items-start gap-3 rounded-xl border p-6 text-left shadow-sm transition',
               'hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2',
               accentClasses,
             )}
           >
             <span className={cn('flex size-10 items-center justify-center rounded-full bg-white shadow-inner', iconClasses)}>
               {icon}
             </span>
             <span className="text-lg font-semibold">{label}</span>
             <span className="text-sm text-neutral-muted">{description}</span>
           </button>
         )
       }
       ```

       Icon + colour pairing (Pitfall 16): consumer card has BOTH green accent AND User icon; author has BOTH purple accent AND Pencil icon. Never colour alone.

    3. **Create `src/chat-ui/TypingDots.tsx`** — `'use client'` — three animated dots with ARIA live-region text:
       ```tsx
       'use client'
       export function TypingDots() {
         return (
           <div role="status" aria-live="polite" className="flex items-center gap-1 px-3 py-2">
             <span className="sr-only">Assistant is typing</span>
             <span className="size-2 animate-bounce rounded-full bg-neutral-muted [animation-delay:-0.3s]" />
             <span className="size-2 animate-bounce rounded-full bg-neutral-muted [animation-delay:-0.15s]" />
             <span className="size-2 animate-bounce rounded-full bg-neutral-muted" />
           </div>
         )
       }
       ```

    4. **Create `src/chat-ui/Timestamp.tsx`** from RESEARCH §Example 3 verbatim (`formatRelative(Date.now(), at)`). Add `tabIndex={0}` (CHAT-06 keyboard accessibility). Wrap in a Radix Tooltip (uses the Provider mounted in Plan 01).

       NOTE on re-renders: `formatRelative` is called at render time. For Plan 05's MessageList, a simple interval tick in the root ChatSurface (every 30s) will refresh relative times; Plan 04 does not need to own that — the component just renders the current value.

    5. **Create `src/chat-ui/Message.tsx`** — `'use client'` — renders one bubble:
       - Props: `{ message: Message, onCopy?: (id: string) => void, onFeedback?: (id: string, next: Feedback | null) => void }`.
       - Branch on `message.kind`:
         - `user`: right-aligned blue bubble, no avatar, no controls.
         - `assistant` with state='error': return null (parent renders ErrorCard in place).
         - `assistant` otherwise: KB circular avatar (small span with "KB" text) + bubble:
           - Body text (message.text). If state==='streaming' AND text==='', parent's MessageList swaps in TypingDots instead.
           - state==='fallback': add left-border-l-4 border-warning-600 + <Info size={14}/> at top-left (Pitfall 16 colour+icon pairing).
           - Citations (if citations.length > 0): render pill chips below body — `<Paperclip size={12}/> <source_id> · §<section_id>` (click is no-op in Phase 3 per CONTEXT §Citations).
           - Timestamp at bottom-right.
           - AssistantControls (Copy + 👍/👎) at bubble footer if state==='done' OR 'fallback'.
       - Styling uses cn() for conditional classes. Bubble max-width 70ch desktop, fluid mobile.

    6. **Create `src/chat-ui/MessageList.tsx`** — `'use client'` — renders Message[] + injects TypingDots:
       - Props: `{ messages: Message[], inFlightId: string | null, onCopy, onFeedback }`.
       - For each message, render <Message/>. If an assistant message has state==='streaming' AND text==='' AND message.id === inFlightId, render <TypingDots/> in place of the empty body.
       - Empty state (messages.length === 0): render nothing (greeting card is owned by ChatSurface in Plan 05 so chip-row logic stays co-located).
       - Container: `flex-col gap-4 overflow-y-auto p-4`. Autoscroll to bottom on new message is Plan 05's concern (uses useEffect with refs).

    7. **Create `src/chat-ui/ChipRow.tsx`** — `'use client'` — renders ChipItem[] as buttons:
       ```tsx
       'use client'
       import type { ChipItem } from './types'

       export function ChipRow({
         chips, onChip, disabled = false,
       }: { chips: ChipItem[]; onChip: (text: string) => void; disabled?: boolean }) {
         if (chips.length === 0) return null
         return (
           <div className="flex flex-wrap gap-2 md:flex-nowrap md:overflow-x-auto px-4 py-2" role="list">
             {chips.map(chip => (
               <button
                 key={chip.id}
                 type="button"
                 role="listitem"
                 disabled={disabled}
                 onClick={() => onChip(chip.text)}
                 className="shrink-0 rounded-full border border-neutral-border bg-white px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
               >
                 {chip.label}
               </button>
             ))}
           </div>
         )
       }
       ```

    8. **Create `src/chat-ui/Header.tsx`** — `'use client'`. Left: role pill (Radix Popover) with Change-role option. Right: New conversation button. Wire both callbacks from props:
       ```tsx
       'use client'
       import * as Popover from '@radix-ui/react-popover'
       import { User, Pencil, RefreshCw, ChevronDown } from 'lucide-react'
       import type { Role } from './types'
       import { cn } from './cn'

       export function Header({
         role, onChangeRole, onNewConversation,
       }: { role: Role; onChangeRole: () => void; onNewConversation: () => void }) {
         const label = role === 'consumer' ? 'Knowledge Consumer' : 'KB Author'
         const Icon = role === 'consumer' ? User : Pencil
         const pillClasses = role === 'consumer'
           ? 'bg-consumer-50 text-consumer-600 border-consumer-600/40'
           : 'bg-author-50 text-author-600 border-author-600/40'
         return (
           <header className="flex items-center justify-between border-b border-neutral-border px-4 py-3">
             <Popover.Root>
               <Popover.Trigger asChild>
                 <button className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium', pillClasses)}>
                   <Icon size={14} aria-hidden />
                   {label}
                   <ChevronDown size={12} aria-hidden />
                 </button>
               </Popover.Trigger>
               <Popover.Portal>
                 <Popover.Content align="start" sideOffset={6} className="rounded-md border bg-white p-1 shadow-md">
                   <button
                     onClick={onChangeRole}
                     className="w-full rounded px-3 py-1.5 text-left text-sm hover:bg-neutral-50"
                   >
                     Change role
                   </button>
                 </Popover.Content>
               </Popover.Portal>
             </Popover.Root>
             <button
               type="button"
               onClick={onNewConversation}
               className="inline-flex items-center gap-1.5 rounded-md border border-neutral-border px-3 py-1.5 text-sm hover:bg-neutral-50"
             >
               <RefreshCw size={14} aria-hidden />
               New conversation
             </button>
           </header>
         )
       }
       ```

       CHAT-04 distinction: New conversation is on the RIGHT with a refresh icon; Change role is accessed via the role pill on the LEFT — different regions + different iconography as CONTEXT §Primary controls locks.

    9. **Create `src/chat-ui/__tests__/RoleSelect.test.tsx`** — `// @vitest-environment jsdom`:
       - Renders both cards with text "Knowledge Consumer" and "KB Author / SME".
       - Both cards are `<button type="button">` (keyboard-focusable by default).
       - Clicking "Knowledge Consumer" card calls onPick('consumer') once.
       - Clicking "KB Author / SME" card calls onPick('author') once.
       - **Tab navigation**: render the component, use `user.tab()` from user-event → focus lands on the first card; another `user.tab()` → focus lands on the second card (document.activeElement assertion).
       - **Enter key selects**: focus first card via user.tab(), then `user.keyboard('{Enter}')` → onPick('consumer') fires.
       - **Space key selects**: same pattern, `user.keyboard(' ')` → onPick fires (default button behaviour).
       - **Icon + color pair (Pitfall 16 guard)**: assert the Consumer card has an `<svg>` descendant (lucide renders SVG) AND classes referencing 'consumer-' — both must be present. Same for author with Pencil + 'author-'. Combining these in one assertion proves colour never stands alone.

    10. **Commit:** `feat(phase-3/plan-04): add core layout components + RoleSelect test (accessibility guaranteed)`.
  </action>
  <verify>
    - `pnpm typecheck` passes.
    - `pnpm test` green; ≥6 new RoleSelect tests; no regressions. Total ≥283.
    - grep for 'use client' at the top of each new component file — all 8 present.
    - grep -E "from ['\"]@/(chat|grounding|prompts)['\"]" src/chat-ui/*.tsx → NO matches.
    - The Tab-navigation + Enter + Space tests are named explicitly in the test file (for checker searchability).
  </verify>
  <done>
    Eight presentational components shipped; role-select is keyboard-first + icon-paired + test-verified. TypingDots has ARIA live region. Header distinguishes Change role vs New conversation per CONTEXT §Primary controls. Every file is a client component, no server imports.
  </done>
</task>

<task type="auto">
  <name>Task 4.2: Input / controls / dialog / error — InputBar, AssistantControls, FeedbackPanel, ChangeRoleDialog, ErrorCard + tests</name>
  <files>src/chat-ui/InputBar.tsx, src/chat-ui/AssistantControls.tsx, src/chat-ui/FeedbackPanel.tsx, src/chat-ui/ChangeRoleDialog.tsx, src/chat-ui/ErrorCard.tsx, src/chat-ui/__tests__/InputBar.test.tsx, src/chat-ui/__tests__/AssistantControls.test.tsx, src/chat-ui/__tests__/ErrorCard.test.tsx, src/chat-ui/__tests__/ChangeRoleDialog.test.tsx</files>
  <action>
    1. **Create `src/chat-ui/InputBar.tsx`** — `'use client'`:
       - Props: `{ value, onChange(v: string), onSubmit(), onStop(), isStreaming: boolean, placeholder: string, hintVisible?: boolean }`.
       - Textarea (auto-expands up to 5 lines — use CSS `field-sizing: content` with max-height fallback OR a ref+scrollHeight approach; acceptable minimal impl: `rows={1}` + `style={{minHeight: '44px', maxHeight: '160px'}}` + `overflow-y-auto` on the textarea; Plan 06 E2E will visually confirm).
       - Keyboard handler on textarea onKeyDown: if `e.key === 'Enter' && !e.shiftKey` → `e.preventDefault()`, call onSubmit() only if value.trim().length > 0 AND !isStreaming. `Shift+Enter` is left to default behaviour (inserts newline).
       - Submit button:
         - If isStreaming: render Square icon (stop), onClick=onStop, aria-label="Stop response".
         - Else: render Send icon (paper-plane), onClick=onSubmit, disabled when value.trim()==='', aria-label="Send message".
       - Hint text `Enter to send · Shift+Enter for newline` under the input ONLY when `hintVisible` is true (Plan 05 sets this true on empty chat).

       Ref: CONTEXT §Input bar — textarea, auto-expand, Enter/Shift+Enter, placeholder role-aware (but placeholder comes from props; Plan 05 picks the wording).

    2. **Create `src/chat-ui/FeedbackPanel.tsx`** — `'use client'` — Radix RadioGroup, FOUR fixed options, NO free text (FDBK-02 explicit):
       ```tsx
       'use client'
       import * as RadioGroup from '@radix-ui/react-radio-group'
       import type { FeedbackDown } from './types'

       const REASONS: Array<{ id: FeedbackDown['reason']; label: string }> = [
         { id: 'hallucinated', label: 'Hallucinated' },
         { id: 'wrong_citation', label: 'Wrong citation' },
         { id: 'incomplete', label: 'Incomplete' },
         { id: 'other', label: 'Other' },
       ]

       export function FeedbackPanel({
         onReason, onCancel,
       }: { onReason: (r: FeedbackDown['reason']) => void; onCancel: () => void }) {
         return (
           <div role="region" aria-label="Why was this answer not helpful?" className="mt-2 rounded-md border border-neutral-border bg-neutral-50 p-3">
             <p className="mb-2 text-xs font-medium text-neutral-muted">Why was this answer not helpful?</p>
             <RadioGroup.Root
               className="grid gap-1.5"
               onValueChange={(v) => onReason(v as FeedbackDown['reason'])}
             >
               {REASONS.map(r => (
                 <div key={r.id} className="flex items-center gap-2">
                   <RadioGroup.Item value={r.id} id={`fb-${r.id}`} className="size-4 rounded-full border border-neutral-border">
                     <RadioGroup.Indicator className="flex size-full items-center justify-center after:block after:size-2 after:rounded-full after:bg-primary" />
                   </RadioGroup.Item>
                   <label htmlFor={`fb-${r.id}`} className="text-sm">{r.label}</label>
                 </div>
               ))}
             </RadioGroup.Root>
             <button onClick={onCancel} className="mt-2 text-xs text-neutral-muted underline">Cancel</button>
           </div>
         )
       }
       ```

    3. **Create `src/chat-ui/AssistantControls.tsx`** — `'use client'`. Copy button + 👍/👎 pair. Always visible (CONTEXT §Thumbs: no hover-to-reveal).

       Copy format (UTIL-01 LOCKED):
       ```
       <answer body>

       (Source: <source_id> · <title>)
       ```
       - If message has ≥1 citation: take `citations[0]` (server guarantees at most 1 per GRND-04). `title = resolveSourceTitle(citation.section_id) ?? citation.section_id` (degrades to section_id if title missing).
       - If no citations (fallback path): copy body text only — no suffix.
       - Use `navigator.clipboard.writeText(formatted)`. Wrap in try/catch — on rejection, silently no-op (Pitfall 10 — some hosts disallow clipboard; graceful fail).

       Props: `{ message: Message (assistant-kind, state 'done'|'fallback'), onFeedback: (next: Feedback | null) => void, onCopy?: () => void (optional observer) }`. Internal state: `showFeedback: boolean` (opens FeedbackPanel when 👎 is clicked and no feedback is set yet).

       Button states:
       - Copy (Copy icon): always enabled on done/fallback messages.
       - 👍 (ThumbsUp icon): `aria-pressed={feedback==='up'}`. Click calls onFeedback('up') (reducer handles toggle-off).
       - 👎 (ThumbsDown icon): `aria-pressed={feedback?.kind==='down'}`. Click with no current feedback → open FeedbackPanel locally. Click while panel open OR feedback is already down → call onFeedback(null) (toggle off).

       When FeedbackPanel is open, it renders inline below the controls. Selecting a reason: call onFeedback({kind:'down', reason}), close the panel.

    4. **Create `src/chat-ui/ChangeRoleDialog.tsx`** from RESEARCH §Example 2 verbatim. Add `aria-describedby` wiring to the Description for completeness. Cancel button has `autoFocus` (CONTEXT §Change role flow — Cancel is default-focused; Pitfall 18 guard against muscle-memory confirmation).

    5. **Create `src/chat-ui/ErrorCard.tsx`** — `'use client'`:
       ```tsx
       'use client'
       import { AlertTriangle } from 'lucide-react'
       import { useState } from 'react'
       import type { ErrorCode } from './types'

       const TITLE: Record<ErrorCode, string> = {
         upstream_timeout: 'The knowledge service took too long.',
         upstream_5xx: 'The knowledge service is temporarily unavailable.',
         schema_reject_after_retry: 'We could not format the answer.',
         internal: 'Something went wrong.',
       }

       export function ErrorCard({
         errorCode, requestId, message, onRetry,
       }: { errorCode: ErrorCode; requestId: string; message?: string; onRetry: () => void }) {
         const [open, setOpen] = useState(false)
         const isRateLimited = errorCode === 'internal' && (message ?? '').startsWith('rate_limited:')
         const title = isRateLimited
           ? 'The assistant is busy.'
           : TITLE[errorCode] ?? TITLE.internal
         return (
           <div role="alert" className="my-3 flex items-start gap-3 rounded-lg border border-warning-600/40 bg-warning-50 p-4">
             <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warning-600" aria-hidden />
             <div className="flex-1 text-sm">
               <p className="font-medium">{title}</p>
               <p className="mt-0.5 text-neutral-muted">
                 Your question wasn’t answered.
               </p>
               <div className="mt-3 flex items-center gap-3">
                 <button
                   type="button"
                   onClick={onRetry}
                   className="rounded-md bg-foreground px-3 py-1.5 text-xs text-white hover:opacity-90"
                 >
                   Retry
                 </button>
                 <button
                   type="button"
                   onClick={() => setOpen(o => !o)}
                   aria-expanded={open}
                   className="text-xs text-neutral-muted underline"
                 >
                   {open ? 'Hide details' : 'Details'}
                 </button>
               </div>
               {open && (
                 <p className="mt-2 rounded bg-white/60 p-2 font-mono text-[11px]">
                   Request ID: {requestId}
                 </p>
               )}
             </div>
           </div>
         )
       }
       ```

    6. **Create `src/chat-ui/__tests__/InputBar.test.tsx`** — `// @vitest-environment jsdom`:
       - Render with value='', onSubmit=vi.fn(), onStop=vi.fn(), isStreaming=false, placeholder='Ask…'.
       - Submit button disabled initially (value empty). Assert button has `disabled` attribute.
       - After user.type('hello'), submit button enabled. `user.keyboard('{Enter}')` → onSubmit called once; onStop NOT called.
       - **Shift+Enter inserts newline**: user.type('first'), `user.keyboard('{Shift>}{Enter}{/Shift}')`, user.type('second') → onSubmit NOT called; the textarea value (check via onChange) contains '\n'. Verify by driving a controlled-input test harness: wrap InputBar in a wrapper component that maintains value state via useState.
       - **Enter alone with empty input**: user.keyboard('{Enter}') → onSubmit NOT called (guard against empty submits).
       - **isStreaming swaps icon to Stop**: re-render with isStreaming=true. Assert submit button is now labelled "Stop response" (aria-label) and clicking it calls onStop.
       - **Textarea stays editable while streaming** (CONTEXT §In-flight state): during isStreaming=true, user can still type into the textarea (value propagates via onChange).

    7. **Create `src/chat-ui/__tests__/AssistantControls.test.tsx`** — `// @vitest-environment jsdom`:
       - **Copy-with-citation (UTIL-01 exact format)**: render AssistantControls on a done assistant message with text='Flagging an article is simple. Click the flag icon.' and citations[0]={source_id:'KB0022991', section_id:'flagging-articles', quote:'irrelevant'}. Mock navigator.clipboard.writeText=vi.fn().resolves. Click Copy → verify writeText called with `"Flagging an article is simple. Click the flag icon.\n\n(Source: KB0022991 · Flagging Articles)"`.
       - **Copy-without-citation (fallback case)**: done message, citations=[], text='<fallback string>'. Click Copy → writeText called with just the text (NO source suffix).
       - **Copy-with-unknown-section degrades to section_id alone**: citation section_id='some-unrecognised-anchor'. Expected copy: `(Source: KB0022991 · some-unrecognised-anchor)` — falls back to raw section_id.
       - **Copy fail graceful (Pitfall 10)**: mock writeText to reject — click Copy → does NOT throw, no unhandled rejection. (Test-level: attach an uncaughtException listener or await the click handler and assert no throw.)
       - **👍 toggle**: click 👍 → onFeedback('up') called. Click again → onFeedback(null). Third click → onFeedback('up').
       - **👎 opens panel**: no current feedback, click 👎 → FeedbackPanel rendered (find by role='region' aria-label contains 'not helpful'). Select 'Wrong citation' radio → onFeedback({kind:'down', reason:'wrong_citation'}) called; panel is removed (assert unmount after a tick).
       - **👎 with existing down toggles off**: message.feedback={kind:'down', reason:'hallucinated'}; click 👎 → onFeedback(null) called (no panel re-open since already down).
       - **👍 and 👎 mutually exclusive** (CONTEXT §Thumbs): message.feedback='up'; click 👎 → opens panel (need to choose a reason first); select reason → onFeedback({kind:'down', reason:'other'}). Reducer handles the actual state transition (Plan 02); this test just asserts the UI dispatches correctly.
       - **Always visible** (CONTEXT §Thumbs: no hover-to-reveal): render the controls and assert the buttons are NOT hidden behind a `:hover` style. Simplest: assert the buttons have NO `hidden` attribute and `display: none` is not computed. (A looser but pragmatic check: assert `screen.getByRole('button', {name:/copy/i})` is visible via RTL — screen queries skip display:none elements by default.)

    8. **Create `src/chat-ui/__tests__/ErrorCard.test.tsx`** — `// @vitest-environment jsdom`:
       - Render with errorCode='upstream_5xx', requestId='abc-123', onRetry=vi.fn().
       - Assert role='alert' present, warning icon rendered (svg descendant), copy matches the `TITLE.upstream_5xx` string.
       - Retry button click → onRetry called once.
       - Details toggle: click Details → request ID 'abc-123' appears in the DOM (checker can grep for the text). Click again → hidden.
       - **Rate-limited variant**: errorCode='internal', message='rate_limited:5' → title switches to 'The assistant is busy.' (not the generic internal copy). Retry button still present.
       - All four error codes produce distinct copy (parametrised test).
       - **X-Request-Id surfacing** (CONTEXT §Error card): requestId prop is rendered in DOM when Details is open — mandatory for bug reports.

    9. **Create `src/chat-ui/__tests__/ChangeRoleDialog.test.tsx`** — `// @vitest-environment jsdom`:
       - Render with `open={false}` → no dialog content (Radix renders portal content conditionally). Assert no element with role='dialog'.
       - Render with `open={true}` → dialog role present, title "Change role?", description mentions "clear this conversation".
       - **Cancel is default focused** (Pitfall 18): after open, `document.activeElement.textContent === 'Cancel'` (or assert the Cancel button has focus via `toHaveFocus()`).
       - Cancel click → onOpenChange(false) (Radix fires this). onConfirm NOT called.
       - **ESC key dismisses** (Radix default, but regression test): `user.keyboard('{Escape}')` → onOpenChange(false) called.
       - Confirm (Change role) click → onConfirm called AND onOpenChange(false) called (in that order).
       - Background clicks on the overlay → onOpenChange(false) (Radix default behaviour).

    10. **Commit:** `feat(phase-3/plan-04): add InputBar + AssistantControls + FeedbackPanel + ChangeRoleDialog + ErrorCard with full keyboard + copy + feedback tests`.
  </action>
  <verify>
    - `pnpm typecheck` passes.
    - `pnpm test` green; ≥6 InputBar + ≥8 AssistantControls + ≥5 ErrorCard + ≥6 ChangeRoleDialog = ≥25 new tests. Total ≥308.
    - UTIL-01 exact format string `"(Source: KB0022991 · Flagging Articles)"` present in AssistantControls test assertions (grep).
    - FDBK-02 — grep AssistantControls.tsx and FeedbackPanel.tsx for any `textarea` or `input type="text"` → MUST return NO matches (zero free-text fields allowed per FDBK-02).
    - CHAT-05 — grep InputBar test file for "{Shift>}{Enter}" OR "Shift.*Enter" — must be present.
    - Pitfall 18 — grep ChangeRoleDialog test file for 'autoFocus' OR 'default focused' OR 'toHaveFocus' — must be present.
  </verify>
  <done>
    Every Phase-3 interaction surface now has a tested component. CHAT-05 keyboard semantics, UTIL-01 copy suffix, FDBK-02 no-free-text, Pitfall 18 Cancel-default-focus, and CHAT-07 error copy + X-Request-Id are all test-enforced.
  </done>
</task>

</tasks>

<verification>
  - `pnpm typecheck` clean.
  - `pnpm test` green — ≥31 new tests across both tasks; total ≥308.
  - Every new component file starts with `'use client'` (except cn.ts which is a plain helper).
  - grep -E "from ['\"]@/(chat|grounding|prompts)['\"]" src/chat-ui/*.tsx → no matches (bundle-safety).
  - Radix imports in ChangeRoleDialog.tsx (dialog), Timestamp.tsx (tooltip), Header.tsx (popover), FeedbackPanel.tsx (radio-group) — all present.
  - lucide-react imports use named icons (User, Pencil, Send, Square, RefreshCw, Copy, ThumbsUp, ThumbsDown, AlertTriangle, Info, Paperclip, ChevronDown) not default exports.
  - Copy-format string exact match: test file contains the literal `(Source: KB0022991 · Flagging Articles)`.
</verification>

<success_criteria>
Phase-3 SC #1 — RoleSelect renders two cards with correct labels + icons; keyboard-accessible (Tab/Enter/Space).
Phase-3 SC #2 — Message + MessageList + TypingDots + Timestamp cover the streaming-bubble shape; AssistantControls provides 👍/👎 attachment.
Phase-3 SC #3 — Header provides New conversation + Change-role entry points (distinct regions per CHAT-04); ChangeRoleDialog provides the confirm gate (Pitfall 18); InputBar provides Stop button during streaming (CHAT-03).
Phase-3 SC #4 — InputBar keyboard submit (CHAT-05); ErrorCard with Retry button (CHAT-07).
Phase-3 SC #5 — AssistantControls copy with `(Source: ...)` suffix (UTIL-01); FeedbackPanel fixed-option radio group (FDBK-02).

Pitfall coverage:
- Pitfall 16 (accessibility — icon + colour pair): test-enforced in RoleSelect test.
- Pitfall 18 (Change Role confirm): test-enforced in ChangeRoleDialog test — Cancel default-focused, Confirm explicit.
- Pitfall 10 (clipboard secure-context fail): AssistantControls test asserts graceful no-throw on writeText rejection.
- FDBK-02 no-free-text: grep-enforced — no `textarea`/`input type="text"` in AssistantControls/FeedbackPanel.
</success_criteria>

<output>
After completion, create `.planning/phases/03-role-experience-and-chat-ui/03-04-SUMMARY.md`. Capture:
- New test count delta (≥31) and total repo test count (≥308).
- File list with line counts.
- UTIL-01 exact format verified by test: `(Source: KB0022991 · Flagging Articles)`.
- FDBK-02 zero-free-text verified by grep.
- Flag that Plan 05 will compose these into ChatSurface + wire reducer dispatches.
</output>
