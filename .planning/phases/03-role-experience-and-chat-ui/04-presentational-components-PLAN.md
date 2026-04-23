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
  - src/chat-ui/__tests__/Header.test.tsx
autonomous: true

must_haves:
  truths:
    - "RoleSelect renders two role cards (Knowledge Consumer, KB Author / SME) with icon + label; Tab navigates between cards; Enter/Space selects; WCAG AA focus ring visible — Pitfall 16 guarantee (icon always paired with colour)"
    - "InputBar Enter submits (CHAT-05), Shift+Enter inserts a newline, submit button disabled when input is empty OR isStreaming=true; during stream the submit icon swaps to stop (Square) and clicking calls onStop (CHAT-03)"
    - "InputBar is wrapped with `forwardRef<HTMLTextAreaElement, InputBarProps>` so parent components (Plan 05 ChatSurface) can imperatively focus the textarea via `ref.current.focus()` after send/role-transition (CONTEXT §Input bar auto-focus)"
    - "Message renders user bubble right-aligned primary-accent AND assistant bubble left-aligned neutral-card with KB circular badge; citations render as pill chips below the bubble; state='fallback' adds a left-border accent + Info icon; state='error' does NOT render the bubble body (parent renders <ErrorCard onRetry={() => onRetry?.(message.id)}/> in place via the onRetry prop)"
    - "Message and MessageList both expose an `onRetry?: (id: string) => void` prop; MessageList forwards onRetry to each Message; Message wires onRetry through to ErrorCard for state='error' bubbles — Plan 05 provides the handler"
    - "AssistantControls Copy button writes `<answer>\\n\\n(Source: <source_id> · <title>)` to clipboard via navigator.clipboard.writeText; if no citations, copy body only; source title resolved from SOURCE_TITLES map (Plan 02); if title missing, fallback is source_id alone"
    - "FeedbackPanel (👎 expand) renders a Radix RadioGroup with the four fixed options (hallucinated / wrong_citation / incomplete / other) and NO free-text field (FDBK-02 explicit); selecting a reason calls onReason and the panel collapses; Cancel button calls onCancel only (closes the panel) — it does NOT clear existing feedback"
    - "ChangeRoleDialog is a Radix Dialog; Cancel has autoFocus (default-focused per CONTEXT §Change role flow + Pitfall 18); confirm button is labelled 'Change role and clear' (distinct from the Header popover 'Change role' option — disambiguates E2E selectors); confirm only closes + fires onConfirm; ESC and overlay click also dismiss (Radix default behaviour)"
    - "ErrorCard renders ⚠ icon + role-neutral copy + code-specific message + Retry button + collapsed 'Details' showing Request ID; Retry button fires onRetry callback"
    - "Timestamp renders a Radix Tooltip; the time element is tabIndex=0 (keyboard focus reveals absolute time — CHAT-06 accessibility requirement); both hover AND focus open the tooltip"
    - "ChipRow renders ChipItem[] as buttons in a horizontal flex row; each chip click calls onChip(text) which auto-submits the full prompt text (CONTEXT §Input & chips — chip click auto-submits, not prefill)"
    - "Header role pill ALWAYS renders both an `<svg>` icon AND a role-specific colour class (`consumer-*` or `author-*`) together — Pitfall 16 icon-colour pairing is enforced at the persistent in-chat indicator, not just the role-select cards"
    - "Every component file starts with 'use client' and does NOT import from @/chat, @/grounding, or @/prompts (bundle-safety guard)"
  artifacts:
    - path: "src/chat-ui/cn.ts"
      provides: "cn(...classes) = twMerge(clsx(classes)) — conditional className helper (Pitfall 7 guard against Tailwind v4 class-order ambiguity)"
      exports: ["cn"]
    - path: "src/chat-ui/RoleSelect.tsx"
      provides: "<RoleSelect onPick={(role) => void} /> — two-card landing"
      exports: ["RoleSelect"]
    - path: "src/chat-ui/Message.tsx"
      provides: "<Message message={Message} onCopy onFeedback onRetry /> — user OR assistant bubble with citations + controls slot; state='error' renders <ErrorCard onRetry={() => onRetry?.(message.id)}/> instead of the bubble body"
      exports: ["Message"]
    - path: "src/chat-ui/MessageList.tsx"
      provides: "<MessageList messages={Message[]} inFlightId={string|null} onCopy onFeedback onRetry /> — rendered list + TypingDots bubble when the in-flight bubble has empty text; onRetry forwards to each Message"
      exports: ["MessageList"]
    - path: "src/chat-ui/TypingDots.tsx"
      provides: "<TypingDots /> three-dot animation with role=status + aria-live='polite' + 'Assistant is typing' SR text (CHAT-02)"
      exports: ["TypingDots"]
    - path: "src/chat-ui/ChipRow.tsx"
      provides: "<ChipRow chips={ChipItem[]} onChip={(text)=>void} disabled={boolean} />"
      exports: ["ChipRow"]
    - path: "src/chat-ui/InputBar.tsx"
      provides: "<InputBar ref={HTMLTextAreaElement} value onChange onSubmit onStop isStreaming placeholder /> — wrapped with forwardRef<HTMLTextAreaElement, InputBarProps>; Enter/Shift+Enter, submit/stop swap; parent can call ref.current.focus() imperatively"
      exports: ["InputBar"]
    - path: "src/chat-ui/Timestamp.tsx"
      provides: "<Timestamp at={number} /> — Radix Tooltip over <time> with keyboard tabIndex (CHAT-06)"
      exports: ["Timestamp"]
    - path: "src/chat-ui/AssistantControls.tsx"
      provides: "<AssistantControls message feedback onCopy onFeedback /> — Copy + 👍/👎 pair always visible"
      exports: ["AssistantControls"]
    - path: "src/chat-ui/FeedbackPanel.tsx"
      provides: "<FeedbackPanel onReason={(reason)=>void} onCancel /> — Radix RadioGroup with four fixed options; Cancel closes panel only (does not clear feedback)"
      exports: ["FeedbackPanel"]
    - path: "src/chat-ui/ChangeRoleDialog.tsx"
      provides: "<ChangeRoleDialog open onOpenChange onConfirm /> — Radix Dialog confirm (Pitfall 18); confirm button label 'Change role and clear' (distinct from the Header popover 'Change role' trigger)"
      exports: ["ChangeRoleDialog"]
    - path: "src/chat-ui/ErrorCard.tsx"
      provides: "<ErrorCard errorCode requestId onRetry /> — CHAT-07 infrastructure error + X-Request-Id surfacing"
      exports: ["ErrorCard"]
    - path: "src/chat-ui/Header.tsx"
      provides: "<Header role onChangeRole onNewConversation /> — role pill (left) + New conversation (right); role pill uses Radix Popover with 'Change role' option; pill always renders svg icon + role-specific colour class"
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
    - from: "src/chat-ui/InputBar.tsx"
      to: "react"
      via: "forwardRef<HTMLTextAreaElement, InputBarProps> export so ChatSurface (Plan 05) can imperatively focus the textarea"
      pattern: "forwardRef"
    - from: "src/chat-ui/Message.tsx"
      to: "src/chat-ui/ErrorCard.tsx"
      via: "When message.state==='error', Message renders <ErrorCard onRetry={() => onRetry?.(message.id)} errorCode={message.errorCode} requestId={message.requestId}/> — the onRetry prop bridges reducer dispatch (Plan 05) through to the error UI"
      pattern: "onRetry"
---

<objective>
Build the complete presentational layer for Phase 3: role-select landing, chat header, message bubbles + citations + controls, typing dots, chip row, input bar with Enter/Shift+Enter + forwardRef, timestamp tooltip, change-role confirm dialog, inline 👎 feedback panel, error card. Every component is stateless-over-props (or uses only local ephemeral state like dialog-open); state machine logic lives in Plan 05's wiring.

Purpose: isolating presentation from state means Plan 05's ChatPage/ChatSurface can compose these components without caring about Radix portal semantics, Tailwind class-order edge cases, or keyboard-event handling. It also means this plan's tests can be pure render-assertion tests — no fetch, no stream, no reducer.

**Contract ownership:** This plan owns the contracts for InputBar (forwardRef), Message/MessageList (onRetry), ChangeRoleDialog (confirm button label). Plan 05 consumes these contracts without mutating them — Plan 05 is purely compositional.

Output: 13 component files + 1 className helper + 6 jsdom-tagged test files covering the interaction surfaces that derive directly from Phase-3 success criteria (role-select, input keyboard + forwardRef focus, Header pill icon-colour pair, assistant controls including UTIL-01 copy format, error card, change-role confirm).
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

**Selector disambiguation (checker Issue 2):** The Header popover exposes a button labelled `Change role` that OPENS ChangeRoleDialog. The dialog's CONFIRM button is labelled **`Change role and clear`** (not plain "Change role"). This ensures `getByRole('button', { name: /^change role$/i })` never collides with `getByRole('button', { name: /change role and clear/i })` during Radix portal teardown. Plan 06 E2E specs MUST use the new label.

**Testing strategy:**

- Tests opt into jsdom via `// @vitest-environment jsdom` docblock at file head.
- Use @testing-library/react for render + screen queries.
- Use @testing-library/user-event v14+ for realistic keyboard interactions (CHAT-05 Enter/Shift+Enter must be tested with `user.keyboard` not fireEvent).
- Mock `navigator.clipboard` where needed (set `Object.defineProperty(navigator, 'clipboard', { writable: true, value: { writeText: vi.fn() } })`).

- Six test files in this plan (RoleSelect, InputBar, AssistantControls, ErrorCard, ChangeRoleDialog, Header). Other components are trivial glue (Message, MessageList, TypingDots, Timestamp, ChipRow) and are tested at integration time in Plan 06 (E2E). If a purely-visual component has interaction logic worth isolating, add a test for it.
</context>

<tasks>

<task type="auto">
  <name>Task 4.1: Core layout components — cn, RoleSelect, Message, MessageList, TypingDots, ChipRow, Timestamp, Header + RoleSelect test + Header test</name>
  <files>src/chat-ui/cn.ts, src/chat-ui/RoleSelect.tsx, src/chat-ui/Message.tsx, src/chat-ui/MessageList.tsx, src/chat-ui/TypingDots.tsx, src/chat-ui/ChipRow.tsx, src/chat-ui/Timestamp.tsx, src/chat-ui/Header.tsx, src/chat-ui/__tests__/RoleSelect.test.tsx, src/chat-ui/__tests__/Header.test.tsx</files>
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
       - Props: `{ message: Message, onCopy?: (id: string) => void, onFeedback?: (id: string, next: Feedback | null) => void, onRetry?: (id: string) => void }`.
       - Branch on `message.kind`:
         - `user`: right-aligned blue bubble, no avatar, no controls.
         - `assistant` with state='error': render `<ErrorCard errorCode={message.errorCode} requestId={message.requestId} onRetry={() => onRetry?.(message.id)} />` in place of the bubble body. No avatar, no controls — the ErrorCard is the entire slot.
         - `assistant` otherwise: KB circular avatar (small span with "KB" text) + bubble:
           - Body text (message.text). If state==='streaming' AND text==='', parent's MessageList swaps in TypingDots instead.
           - state==='fallback': add left-border-l-4 border-warning-600 + <Info size={14}/> at top-left (Pitfall 16 colour+icon pairing).
           - Citations (if citations.length > 0): render pill chips below body — `<Paperclip size={12}/> <source_id> · §<section_id>` (click is no-op in Phase 3 per CONTEXT §Citations).
           - Timestamp at bottom-right.
           - AssistantControls (Copy + 👍/👎) at bubble footer if state==='done' OR 'fallback'.
       - Styling uses cn() for conditional classes. Bubble max-width 70ch desktop, fluid mobile.

       **onRetry contract (CHECKER Issue 1 Fix B):** `onRetry?: (id: string) => void` is plumbed through as an explicit prop. When state==='error', Message calls `onRetry?.(message.id)` via the ErrorCard's onRetry handler. If onRetry prop is undefined (e.g. in an isolated unit test), the retry button is rendered but click is a no-op — this keeps Message fully usable without parent wiring. Plan 05's ChatSurface is the real consumer that provides onRetry.

    6. **Create `src/chat-ui/MessageList.tsx`** — `'use client'` — renders Message[] + injects TypingDots:
       - Props: `{ messages: Message[], inFlightId: string | null, onCopy, onFeedback, onRetry?: (id: string) => void }`.
       - For each message, render `<Message message={m} onCopy={onCopy} onFeedback={onFeedback} onRetry={onRetry} />`. onRetry is forwarded, not called directly, so Message owns the "bind to message.id" step.
       - If an assistant message has state==='streaming' AND text==='' AND message.id === inFlightId, render <TypingDots/> in place of the empty body.
       - Empty state (messages.length === 0): render nothing (greeting card is owned by ChatSurface in Plan 05 so chip-row logic stays co-located).
       - Container: `flex-col gap-4 overflow-y-auto p-4`. Autoscroll to bottom on new message is Plan 05's concern (uses useEffect with refs).

       **onRetry contract (CHECKER Issue 1 Fix B):** `onRetry?: (id: string) => void` is pure forwarding — MessageList passes it through to every Message without binding. This matches React's "hoist callbacks, pass references" convention and keeps MessageList stateless. Plan 05 provides the handler.

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

    10. **Create `src/chat-ui/__tests__/Header.test.tsx`** — `// @vitest-environment jsdom` (CHECKER Issue 3 — ROLE-03 Header pill icon+colour pairing):

        Assert the Pitfall-16 icon+colour invariant on the PERSISTENT in-chat indicator (the role pill), so that a regression dropping the icon from the pill would fail unit-test fast, not rely on E2E:

        ```tsx
        // @vitest-environment jsdom
        import { render, screen } from '@testing-library/react'
        import userEvent from '@testing-library/user-event'
        import { describe, expect, it, vi } from 'vitest'
        import { Header } from '../Header'

        describe('Header — Pitfall 16 icon+colour pairing on role pill', () => {
          it('consumer pill renders an svg icon AND a consumer-specific colour class', () => {
            render(<Header role="consumer" onChangeRole={vi.fn()} onNewConversation={vi.fn()} />)
            const pill = screen.getByRole('button', { name: /Knowledge Consumer/i })
            // ICON present — lucide-react renders an <svg>
            expect(pill.querySelector('svg')).toBeTruthy()
            // COLOUR class present — pill className contains a consumer-* token
            expect(pill.className).toMatch(/consumer-/)
          })

          it('author pill renders an svg icon AND an author-specific colour class', () => {
            render(<Header role="author" onChangeRole={vi.fn()} onNewConversation={vi.fn()} />)
            const pill = screen.getByRole('button', { name: /KB Author/i })
            expect(pill.querySelector('svg')).toBeTruthy()
            expect(pill.className).toMatch(/author-/)
          })

          it('popover "Change role" option invokes onChangeRole', async () => {
            const onChangeRole = vi.fn()
            const user = userEvent.setup()
            render(<Header role="consumer" onChangeRole={onChangeRole} onNewConversation={vi.fn()} />)
            // Open the pill popover
            await user.click(screen.getByRole('button', { name: /Knowledge Consumer/i }))
            // Click "Change role" inside the popover
            await user.click(await screen.findByRole('button', { name: /^change role$/i }))
            expect(onChangeRole).toHaveBeenCalledTimes(1)
          })

          it('New conversation button invokes onNewConversation', async () => {
            const onNewConversation = vi.fn()
            const user = userEvent.setup()
            render(<Header role="consumer" onChangeRole={vi.fn()} onNewConversation={onNewConversation} />)
            await user.click(screen.getByRole('button', { name: /new conversation/i }))
            expect(onNewConversation).toHaveBeenCalledTimes(1)
          })
        })
        ```

        These 4 tests guard ROLE-03 at the unit level — a future PR that strips the icon from the pill (leaving colour-only) fails this test, not only Plan 06 E2E.

    11. **Commit:** `feat(phase-3/plan-04): add core layout components + RoleSelect + Header tests (Pitfall 16 enforced at pill + role-select)`.
  </action>
  <verify>
    - `pnpm typecheck` passes.
    - `pnpm test` green; ≥6 new RoleSelect tests + ≥4 new Header tests; no regressions.
    - grep for 'use client' at the top of each new component file — all 8 present.
    - grep -E "from ['\"]@/(chat|grounding|prompts)['\"]" src/chat-ui/*.tsx → NO matches.
    - The Tab-navigation + Enter + Space tests are named explicitly in the RoleSelect test file (for checker searchability).
    - Header test file asserts both `svg` AND role-specific colour class on pill — grep Header.test.tsx for `querySelector\('svg'\)` AND `toMatch(/consumer-/)` AND `toMatch(/author-/)`.
  </verify>
  <done>
    Eight presentational components shipped; role-select is keyboard-first + icon-paired + test-verified. Header pill has ROLE-03 icon+colour pair guaranteed at unit level. TypingDots has ARIA live region. Header distinguishes Change role vs New conversation per CONTEXT §Primary controls. Every file is a client component, no server imports. Message + MessageList expose the onRetry contract for Plan 05 consumption.
  </done>
</task>

<task type="auto">
  <name>Task 4.2: Input / controls / dialog / error — InputBar (forwardRef), AssistantControls, FeedbackPanel, ChangeRoleDialog (disambiguated label), ErrorCard + tests</name>
  <files>src/chat-ui/InputBar.tsx, src/chat-ui/AssistantControls.tsx, src/chat-ui/FeedbackPanel.tsx, src/chat-ui/ChangeRoleDialog.tsx, src/chat-ui/ErrorCard.tsx, src/chat-ui/__tests__/InputBar.test.tsx, src/chat-ui/__tests__/AssistantControls.test.tsx, src/chat-ui/__tests__/ErrorCard.test.tsx, src/chat-ui/__tests__/ChangeRoleDialog.test.tsx</files>
  <action>
    1. **Create `src/chat-ui/InputBar.tsx`** — `'use client'`. **Wrap with `forwardRef<HTMLTextAreaElement, InputBarProps>`** (CHECKER Issue 1 Fix B — the forwardRef is owned by Plan 04, not mid-task-added by Plan 05):

       ```tsx
       'use client'
       import { forwardRef } from 'react'
       import { Send, Square } from 'lucide-react'

       export interface InputBarProps {
         value: string
         onChange: (v: string) => void
         onSubmit: () => void
         onStop: () => void
         isStreaming: boolean
         placeholder: string
         hintVisible?: boolean
       }

       export const InputBar = forwardRef<HTMLTextAreaElement, InputBarProps>(function InputBar(
         { value, onChange, onSubmit, onStop, isStreaming, placeholder, hintVisible },
         ref,
       ) {
         const canSubmit = value.trim().length > 0 && !isStreaming
         return (
           <div className="border-t border-neutral-border p-3">
             <div className="flex items-end gap-2">
               <textarea
                 ref={ref}
                 value={value}
                 onChange={(e) => onChange(e.target.value)}
                 onKeyDown={(e) => {
                   if (e.key === 'Enter' && !e.shiftKey) {
                     e.preventDefault()
                     if (canSubmit) onSubmit()
                   }
                 }}
                 placeholder={placeholder}
                 rows={1}
                 style={{ minHeight: '44px', maxHeight: '160px' }}
                 className="flex-1 resize-none overflow-y-auto rounded-md border border-neutral-border bg-white px-3 py-2 text-sm"
               />
               {isStreaming ? (
                 <button
                   type="button"
                   onClick={onStop}
                   aria-label="Stop response"
                   className="rounded-md bg-foreground p-2 text-white"
                 >
                   <Square size={16} />
                 </button>
               ) : (
                 <button
                   type="button"
                   onClick={onSubmit}
                   disabled={!canSubmit}
                   aria-label="Send message"
                   className="rounded-md bg-foreground p-2 text-white disabled:opacity-40"
                 >
                   <Send size={16} />
                 </button>
               )}
             </div>
             {hintVisible && (
               <p className="mt-1 text-[11px] text-neutral-muted">Enter to send · Shift+Enter for newline</p>
             )}
           </div>
         )
       })
       ```

       Key requirements:
       - `forwardRef<HTMLTextAreaElement, InputBarProps>` wrapping is MANDATORY — Plan 05's ChatSurface imperatively focuses the textarea via a ref after send and role-transition (CONTEXT §Input bar). Without forwardRef, the ref would attach to the wrapper div and Plan 05 would silently fail to focus.
       - Keyboard handler on textarea onKeyDown: if `e.key === 'Enter' && !e.shiftKey` → `e.preventDefault()`, call onSubmit() only if value.trim().length > 0 AND !isStreaming. `Shift+Enter` is left to default behaviour (inserts newline).
       - Submit button:
         - If isStreaming: render Square icon (stop), onClick=onStop, aria-label="Stop response".
         - Else: render Send icon (paper-plane), onClick=onSubmit, disabled when value.trim()==='', aria-label="Send message".
       - Hint text `Enter to send · Shift+Enter for newline` under the input ONLY when `hintVisible` is true (Plan 05 sets this true on empty chat).
       - Auto-expand textarea: `rows={1}` + `style={{minHeight: '44px', maxHeight: '160px'}}` + `overflow-y-auto`. Plan 06 E2E will visually confirm.

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

       **FeedbackPanel Cancel button semantics (NIT clarification):** The Cancel button inside FeedbackPanel calls `onCancel()` only — which in AssistantControls sets `setShowFeedback(false)`. It does NOT dispatch `onFeedback(null)`. Rationale: Cancel means "I changed my mind about leaving negative feedback" — it should NOT clear any existing down feedback, only close the reason-selection panel. Toggle-off of existing down feedback is a separate path (clicking 👎 again while a down reason is already set).

    4. **Create `src/chat-ui/ChangeRoleDialog.tsx`** from RESEARCH §Example 2 verbatim, with ONE change (CHECKER Issue 2):

       **Confirm button label: `Change role and clear`** (not plain "Change role"). This disambiguates the dialog's confirm button from the Header popover's `Change role` OPTION that TRIGGERS the dialog. E2E selectors (Plan 06) will use:
       - Popover option: `getByRole('button', { name: /^change role$/i })` → opens the dialog
       - Dialog confirm: `getByRole('button', { name: /change role and clear/i })` → confirms the change

       Add `aria-describedby` wiring to the Description for completeness. Cancel button has `autoFocus` (CONTEXT §Change role flow — Cancel is default-focused; Pitfall 18 guard against muscle-memory confirmation).

       Structure:
       ```tsx
       'use client'
       import * as Dialog from '@radix-ui/react-dialog'

       export function ChangeRoleDialog({
         open, onOpenChange, onConfirm,
       }: { open: boolean; onOpenChange: (v: boolean) => void; onConfirm: () => void }) {
         return (
           <Dialog.Root open={open} onOpenChange={onOpenChange}>
             <Dialog.Portal>
               <Dialog.Overlay className="fixed inset-0 bg-black/30" />
               <Dialog.Content
                 aria-describedby="change-role-desc"
                 className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 shadow-xl"
               >
                 <Dialog.Title className="text-lg font-semibold">Change role?</Dialog.Title>
                 <Dialog.Description id="change-role-desc" className="mt-2 text-sm text-neutral-muted">
                   This will clear this conversation. Your draft is also discarded.
                 </Dialog.Description>
                 <div className="mt-4 flex justify-end gap-2">
                   <Dialog.Close asChild>
                     <button autoFocus className="rounded-md border border-neutral-border px-3 py-1.5 text-sm">
                       Cancel
                     </button>
                   </Dialog.Close>
                   <button
                     onClick={() => { onConfirm(); onOpenChange(false) }}
                     className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white"
                   >
                     Change role and clear
                   </button>
                 </div>
               </Dialog.Content>
             </Dialog.Portal>
           </Dialog.Root>
         )
       }
       ```

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
       - **forwardRef exposes the textarea (CHECKER Issue 1 Fix B)**: create a wrapper component that uses `useRef<HTMLTextAreaElement>(null)` and passes the ref to `<InputBar ref={ref} ... />`. Assert `ref.current` is the textarea element (tagName === 'TEXTAREA'). Then call `ref.current!.focus()` and assert `document.activeElement === ref.current`. This proves Plan 05's ChatSurface can imperatively focus the textarea.

    7. **Create `src/chat-ui/__tests__/AssistantControls.test.tsx`** — `// @vitest-environment jsdom`:
       - **Copy-with-citation (UTIL-01 exact format)**: render AssistantControls on a done assistant message with text='Flagging an article is simple. Click the flag icon.' and citations[0]={source_id:'KB0022991', section_id:'flagging-articles', quote:'irrelevant'}. Mock navigator.clipboard.writeText=vi.fn().resolves. Click Copy → verify writeText called with `"Flagging an article is simple. Click the flag icon.\n\n(Source: KB0022991 · Flagging Articles)"`.
       - **Copy-without-citation (fallback case)**: done message, citations=[], text='<fallback string>'. Click Copy → writeText called with just the text (NO source suffix).
       - **Copy-with-unknown-section degrades to section_id alone**: citation section_id='some-unrecognised-anchor'. Expected copy: `(Source: KB0022991 · some-unrecognised-anchor)` — falls back to raw section_id.
       - **Copy fail graceful (Pitfall 10 — NIT improvement)**: mock `navigator.clipboard.writeText` to reject with an error. Use `await user.click(copyButton)` inside a `try { ... } catch (e) { fail('copy should not throw') }` block — directly assert the click promise resolves. This is stricter than relying on jsdom's unhandled-rejection tracking:
         ```ts
         it('graceful no-throw when clipboard.writeText rejects (Pitfall 10)', async () => {
           const writeText = vi.fn().mockRejectedValue(new Error('NotAllowed'))
           Object.defineProperty(navigator, 'clipboard', { writable: true, value: { writeText } })
           const user = userEvent.setup()
           render(<AssistantControls message={doneMessageWithCitation} onFeedback={vi.fn()} />)
           const copyBtn = screen.getByRole('button', { name: /copy/i })
           await expect(user.click(copyBtn)).resolves.toBeUndefined()
           expect(writeText).toHaveBeenCalledOnce()
         })
         ```
       - **👍 toggle**: click 👍 → onFeedback('up') called. Click again → onFeedback(null). Third click → onFeedback('up').
       - **👎 opens panel**: no current feedback, click 👎 → FeedbackPanel rendered (find by role='region' aria-label contains 'not helpful'). Select 'Wrong citation' radio → onFeedback({kind:'down', reason:'wrong_citation'}) called; panel is removed (assert unmount after a tick).
       - **👎 with existing down toggles off**: message.feedback={kind:'down', reason:'hallucinated'}; click 👎 → onFeedback(null) called (no panel re-open since already down).
       - **👎 panel Cancel closes but does NOT dispatch (NIT clarification)**: with no prior feedback, click 👎 → panel opens. Click the panel's Cancel button. Assert: panel unmounts (region no longer in DOM) AND `onFeedback` was NOT called (vi.fn().mock.calls.length === 0 for the entire test). This enforces Cancel ≠ toggle-off.
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
       - Confirm (**"Change role and clear"** button — CHECKER Issue 2) click → onConfirm called AND onOpenChange(false) called (in that order). Explicit selector: `screen.getByRole('button', { name: /change role and clear/i })`.
       - **Selector disambiguation regression test**: inside the open dialog, assert that the confirm button's accessible name is EXACTLY the string `Change role and clear` (not just "Change role"). `expect(screen.getByRole('button', { name: 'Change role and clear' })).toBeInTheDocument()` — regression guard against anyone reverting the label.
       - Background clicks on the overlay → onOpenChange(false) (Radix default behaviour).

    10. **Commit:** `feat(phase-3/plan-04): add InputBar (forwardRef) + AssistantControls + FeedbackPanel + ChangeRoleDialog (disambiguated confirm label) + ErrorCard with full keyboard + copy + feedback tests`.
  </action>
  <verify>
    - `pnpm typecheck` passes.
    - `pnpm test` green; ≥7 InputBar (including forwardRef focus test) + ≥9 AssistantControls (including Cancel-does-not-dispatch) + ≥5 ErrorCard + ≥7 ChangeRoleDialog (including disambiguated label regression) ≈ ≥28 new tests in Task 4.2.
    - UTIL-01 exact format string `"(Source: KB0022991 · Flagging Articles)"` present in AssistantControls test assertions (grep).
    - FDBK-02 — grep AssistantControls.tsx and FeedbackPanel.tsx for any `textarea` or `input type="text"` → MUST return NO matches (zero free-text fields allowed per FDBK-02).
    - CHAT-05 — grep InputBar test file for "{Shift>}{Enter}" OR "Shift.*Enter" — must be present.
    - Pitfall 18 — grep ChangeRoleDialog test file for 'autoFocus' OR 'default focused' OR 'toHaveFocus' — must be present.
    - **forwardRef guard (CHECKER Issue 1 Fix B)**: grep InputBar.tsx for `forwardRef<HTMLTextAreaElement` — must match.
    - **forwardRef focus test (CHECKER Issue 1 Fix B)**: grep InputBar.test.tsx for `ref.current` AND `focus` — must match.
    - **Confirm label disambiguation (CHECKER Issue 2)**: grep ChangeRoleDialog.tsx for `Change role and clear` — must match. grep ChangeRoleDialog.test.tsx for `change role and clear` (case-insensitive) — must match.
  </verify>
  <done>
    Every Phase-3 interaction surface now has a tested component. CHAT-05 keyboard semantics, UTIL-01 copy suffix, FDBK-02 no-free-text, Pitfall 18 Cancel-default-focus, and CHAT-07 error copy + X-Request-Id are all test-enforced. InputBar ships with forwardRef so Plan 05 can focus it without mutating Plan 04 contracts. ChangeRoleDialog confirm label is disambiguated so Plan 06 E2E selectors are unambiguous during Radix portal teardown.
  </done>
</task>

</tasks>

<verification>
  - `pnpm typecheck` clean.
  - `pnpm test` green — ≥38 new tests across both tasks (4 Header + 6 RoleSelect in Task 4.1 + ≥28 in Task 4.2).
  - Every new component file starts with `'use client'` (except cn.ts which is a plain helper).
  - grep -E "from ['\"]@/(chat|grounding|prompts)['\"]" src/chat-ui/*.tsx → no matches (bundle-safety).
  - Radix imports in ChangeRoleDialog.tsx (dialog), Timestamp.tsx (tooltip), Header.tsx (popover), FeedbackPanel.tsx (radio-group) — all present.
  - lucide-react imports use named icons (User, Pencil, Send, Square, RefreshCw, Copy, ThumbsUp, ThumbsDown, AlertTriangle, Info, Paperclip, ChevronDown) not default exports.
  - Copy-format string exact match: test file contains the literal `(Source: KB0022991 · Flagging Articles)`.
  - **InputBar forwardRef (CHECKER Issue 1)**: `grep -E "forwardRef<HTMLTextAreaElement" src/chat-ui/InputBar.tsx` matches; test asserts `ref.current.focus()` works.
  - **Message/MessageList onRetry (CHECKER Issue 1)**: `grep -E "onRetry\\??:" src/chat-ui/Message.tsx src/chat-ui/MessageList.tsx` matches in both files.
  - **Header pill icon+colour pair (CHECKER Issue 3)**: `src/chat-ui/__tests__/Header.test.tsx` exists with `querySelector('svg')` AND `toMatch(/consumer-/)` AND `toMatch(/author-/)` assertions.
  - **Dialog confirm label (CHECKER Issue 2)**: `grep "Change role and clear" src/chat-ui/ChangeRoleDialog.tsx` matches.
</verification>

<success_criteria>
Phase-3 SC #1 — RoleSelect renders two cards with correct labels + icons; keyboard-accessible (Tab/Enter/Space). Header pill ALSO guarantees icon+colour pairing on the persistent in-chat indicator (ROLE-03).
Phase-3 SC #2 — Message + MessageList + TypingDots + Timestamp cover the streaming-bubble shape; AssistantControls provides 👍/👎 attachment.
Phase-3 SC #3 — Header provides New conversation + Change-role entry points (distinct regions per CHAT-04); ChangeRoleDialog provides the confirm gate (Pitfall 18) with the disambiguated **"Change role and clear"** confirm label; InputBar provides Stop button during streaming (CHAT-03).
Phase-3 SC #4 — InputBar keyboard submit (CHAT-05) + forwardRef focus; ErrorCard with Retry button (CHAT-07); Message/MessageList expose onRetry so Plan 05 can wire Retry through without mutating Plan 04 contracts.
Phase-3 SC #5 — AssistantControls copy with `(Source: ...)` suffix (UTIL-01); FeedbackPanel fixed-option radio group (FDBK-02); Cancel closes panel only (does NOT clear existing feedback).

Pitfall coverage:
- Pitfall 16 (accessibility — icon + colour pair): test-enforced in RoleSelect test AND Header test (covers both the landing selection AND the persistent in-chat pill — ROLE-03 at full coverage).
- Pitfall 18 (Change Role confirm): test-enforced in ChangeRoleDialog test — Cancel default-focused, "Change role and clear" confirm label explicit.
- Pitfall 10 (clipboard secure-context fail): AssistantControls test asserts graceful no-throw on writeText rejection via direct `resolves.toBeUndefined()` assertion.
- FDBK-02 no-free-text: grep-enforced — no `textarea`/`input type="text"` in AssistantControls/FeedbackPanel. Cancel ≠ dispatch (test-enforced).
- CHECKER Issue 1 Fix B: InputBar forwardRef + Message/MessageList onRetry prop-plumbed — Plan 05 is purely compositional.
- CHECKER Issue 2: Dialog confirm label disambiguated → Plan 06 E2E selectors are unambiguous.
- CHECKER Issue 3: Header pill icon+colour pair test-enforced at unit level (ROLE-03 no longer E2E-only).
</success_criteria>

<output>
After completion, create `.planning/phases/03-role-experience-and-chat-ui/03-04-SUMMARY.md`. Capture:
- New test count delta (≥38) and total repo test count.
- File list with line counts.
- UTIL-01 exact format verified by test: `(Source: KB0022991 · Flagging Articles)`.
- FDBK-02 zero-free-text verified by grep.
- **Contract summary (CHECKER Issue 1 Fix B):**
  - InputBar exports `forwardRef<HTMLTextAreaElement, InputBarProps>` — Plan 05 consumes via `<InputBar ref={inputRef} />`.
  - Message/MessageList expose `onRetry?: (id: string) => void` — Plan 05 provides the handler; Plan 04 artefacts are NOT mutated by Plan 05.
- **Disambiguated labels (CHECKER Issue 2):** ChangeRoleDialog confirm button label is `Change role and clear`. Plan 06 E2E selectors target this string.
- **ROLE-03 unit coverage (CHECKER Issue 3):** Header.test.tsx asserts pill `svg` + role-specific colour class for both roles.
- Flag that Plan 05 composes these into ChatSurface + wires reducer dispatches without touching Plan 04 artefact prop shapes.
</output>
