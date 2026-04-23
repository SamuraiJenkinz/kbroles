# Phase 3: Role Experience & Chat UI - Context

**Gathered:** 2026-04-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Ship the UI layer that consumes the locked Phase-2 `/api/chat` SSE contract and `/api/prompts` chip endpoint: role-select landing → role-aware multi-turn chat with avatars, streaming text, suggested-prompt chips, stop / new-conversation / change-role affordances, copy-answer with citation suffix, 👍 / 👎 feedback, hover timestamps, and a graceful error + retry card on infrastructure failure. All 16 Phase-3 requirements (AUTH-02, ROLE-01..05, CHAT-01..07, FDBK-01, FDBK-02, UTIL-01) live here.

**Explicitly NOT in this phase:**
- Source panel behaviour + Open-in-ServiceNow permalinks (Phase 4, PANE-01..07)
- Distinct fallback UI treatment + flag-a-gap button (Phase 4, FBK-01/03/04)
- First-run "About this assistant" tooltip + freshness/version header (Phase 4, TRST-01/02)
- SSO / Entra gate before role-select (Phase 5, AUTH-01/03)
- Telemetry event capture for 👍/👎, chip_vs_freeform, citation_click_through (Phase 6, FDBK-03, TELE-01..04)
- True token-streaming on the client (v1.1 — wire contract already forward-compatible)

The Phase-2 contract is canonical: client appends on `answer_delta`, replaces on `fallback`, renders retry on `error`, stops on any terminal event (`done` | `fallback` | `error`). `X-Request-Id` is echoed in every bug-report affordance.

</domain>

<decisions>
## Implementation Decisions

### Role-select landing & persistence

- **Layout**: Two cards side-by-side on ≥768px viewports, stacked on mobile. Equal visual weight (neither pre-selected). Each card = icon + role name + 1-line scope description. Fully keyboard-navigable (Tab between cards, Enter / Space selects, focus ring visible).
- **Card content** (planner may refine wording from handover, shape is locked):
  - **Knowledge Consumer** — "Find answers about KB articles, flagging, and feedback workflows." Green accent + person icon.
  - **KB Author / SME** — "Get help with KB form fields, section anchors, and publishing." Purple accent + pencil icon.
- **Persistence model** (AUTH-02 compliance — session-only, in-memory per tab):
  - **Role** → `sessionStorage.kbroles.role` (per-tab; survives refresh in same tab, new tab re-prompts).
  - **Conversation messages** → React state only. NOT persisted.
  - **Input-draft buffer** → `sessionStorage.kbroles.draft` (debounced on keystroke, restored on mount IF non-empty). This is the Pitfall-17 "local-storage buffer" — scoped to the unsent draft only, not full history. Accidental refresh does not lose the long question the user was typing.
- **Return-user flow**: If `sessionStorage.kbroles.role` is set on mount, skip the role-select screen and land directly in chat (empty state with greeting + chips). The role badge in the chat header (ROLE-03) is the primary affordance to return to role-select.
- **"Change role" flow** (Pitfall 18 compliance): Always shows a confirm modal BEFORE clearing: "Changing role will clear this conversation. Continue?" — Cancel (default focus) / Change role. On confirm: clear messages (in-memory), clear role (sessionStorage), clear draft, route to role-select.

### Chat surface styling

- **Role-aware greeting** (ROLE-04): Renders as a top-anchored card on empty chat (no messages). Scopes expectations to reduce out-of-scope asks (Pitfall 1 downstream signal):
  - **Consumer** — "Hi — I'm your KB assistant for flagging articles, leaving feedback, and navigating the CTSS knowledge workflow. Ask me something or pick a starter below."
  - **Author** — "Hi — I'm your KB assistant for authoring and publishing articles. Ask about form fields, section anchors, or pick a starter below."
  - Tone: professional-but-warm, MMC-corporate-appropriate. No emoji decoration in greeting body. Dismissed implicitly by sending a first message.
- **Role badge** (ROLE-03): Pill in top-left of chat header. **Green + person icon** for Consumer, **purple + pencil icon** for Author (Pitfall 16 — color never alone; every colour-coded element has an icon pair). Pill is clickable → opens a small dropdown with "Change role" option (routes through the confirm modal).
- **Message bubbles** (CHAT-01, per handover §14):
  - **Me** (user) — right-aligned, primary-accent fill, 12px radius, no avatar. Max-width ~70ch on desktop, fluid on mobile.
  - **KB** (assistant) — left-aligned, neutral-card fill, 12px radius, WITH a small "KB" circular badge avatar in brand-muted tone. Max-width ~70ch.
  - No conversational "tails" on bubbles — cleaner enterprise feel.
- **Typing indicator** (CHAT-02): Three animated dots inside a KB-avatar'd empty bubble, left-aligned. Appears immediately on request dispatch and is replaced by streaming text on the first `answer_delta`. Announced to screen readers via an ARIA live region ("Assistant is typing").
- **Streaming render**: Each `answer_delta` APPENDS to the in-progress bubble (Phase 2 = single delta; v1.1 = many — client code is identical, no branching). No placeholder "generating…" text.
- **Citations** (per-message, below bubble body): Rendered as pill chips — `📄 KB0020882 · §7 Resolution`. In Phase 3 these are **visually present but click is a no-op** (source-panel open behaviour is Phase 4 / PANE-01). Title lookup (e.g. "Flagging Articles" for section `flagging-articles`) comes from a local map in `src/ui/sourceTitles.ts` seeded from handover §14.
- **Fallback marker** (minimal — full treatment is Phase 4): When a `fallback` SSE event arrives, the bubble REPLACES accumulated text with `event.text`, adds a subtle left-border accent + ℹ︎ icon so it doesn't look like a grounded answer. No flag-a-gap button yet (FBK-04 is Phase 4).
- **Timestamps** (CHAT-06): Relative format ("just now", "2m ago", "14:32 yesterday") on hover over a message. Absolute timestamp shown as a native `title` tooltip on the relative text. Keyboard-focus also reveals the relative text (no hover-only — accessibility).
- **Accessibility baseline**: WCAG 2.1 AA contrast, focus rings on every interactive element, ARIA live region for streaming state transitions, icon + color pairing everywhere. Color is never the only signal.

### Input & chips

- **Chip surface** (ROLE-05): Role-specific chip row renders ABOVE the input bar, **only on empty chat** (no messages). After the first message is sent, chips hide permanently for that conversation to conserve vertical space. Chips return on "New conversation".
- **Chip layout**: Single horizontal scroll row on desktop, wraps to multi-row on mobile.
- **Chip source**: Fetched from `GET /api/prompts?role=<role>` on chat mount (cached at the edge per Phase-2 contract). On 5xx / network failure, render the chip row empty and log once — the chat still works via freeform typing.
- **Chip-click behaviour**: **Auto-submit immediately** (not prefill). Chips are curated, tested prompts; they exist because the user wants that exact question answered. Prefill adds friction with no UX benefit. If the user wants to tweak, they type freeform.
- **Input bar**:
  - Textarea, auto-expands up to 5 lines then internal scroll.
  - **Placeholder** (role-aware): "Ask about KB flagging, feedback, or article workflows…" (Consumer) / "Ask about KB form fields, anchors, or publishing…" (Author).
  - **Submit**: Icon button (paper-plane / arrow). Disabled when input is empty OR a stream is in flight (see in-flight state below).
  - **Keyboard** (CHAT-05): `Enter` submits, `Shift+Enter` inserts a newline. Hint text "Enter to send · Shift+Enter for newline" shown BELOW input on empty-state only (keeps surface clean once conversation starts).
  - **Focus**: Auto-focused on chat mount and re-focused after each send.
- **In-flight state**: During an active stream, **submit is disabled**; the textarea remains editable (user can draft the next message). Submit re-enables when the stream reaches a terminal event (`done` / `fallback` / `error`) or when the user clicks Stop.

### Controls, feedback & errors

#### Primary controls

- **Chat header (top strip)**:
  - **Left** — role pill (ROLE-03) with dropdown → "Change role" option.
  - **Right** — "New conversation" button (CHAT-04).
- **Stop response** (CHAT-03): Inline with the input bar — the submit icon **swaps** to a stop icon while a stream is in flight. Click → client-side `AbortController.abort()` on the `fetch`. Partial `answer_delta` text already rendered **stays** in the bubble with a small muted "Stopped by you" footer. No server-side kill — Phase-2 semaphore releases on client disconnect.
- **Visual distinction** (CHAT-04): "New conversation" is clearly lower-stakes than "Change role". Keep them in different regions of the header (right vs left) and use distinct iconography (↻ refresh for New, role-pill for Change).

#### "New conversation" flow

- Click → **no confirm** (lower stakes; wipes conversation only, role preserved). If a stream is in flight, the action first aborts the stream, then clears.
- Reset to: empty messages, greeting visible, chip row visible.

#### "Change role" flow

See Role-select landing above. Always confirm.

#### Copy answer (UTIL-01)

- Each completed assistant message shows a "Copy" icon-button. Desktop: visible on hover (and on keyboard focus). Touch: always visible.
- **Copy format** — verbatim Phase-3 success-criterion text:
  ```
  <answer text>
  
  (Source: KB0022991 · Flagging Articles)
  ```
  Source suffix uses the **first** citation's `source_id` + the section title resolved via `sourceTitles.ts`. If the message has **no** citations (e.g. a fallback), copy is just the body text — no source suffix.

#### Thumbs 👍 / 👎 (FDBK-01, FDBK-02)

- Per completed assistant message, `👍 / 👎` pair is **always visible** at the bubble footer (no hover-to-reveal — discoverability + accessibility).
- **State**: Click persists for the session (filled / highlighted chip). Clicking again toggles off. 👍 and 👎 are mutually exclusive (clicking one clears the other).
- **👍**: Local state only in Phase 3 — no POST. Telemetry wiring is FDBK-03 / Phase 6.
- **👎**: Opens an **inline-expand** panel directly under the message (not a modal, not a popover — inline keeps the answer in view). Fixed-option radio group:
  - Hallucinated
  - Wrong citation
  - Incomplete
  - Other
- No free-text field in v1 (FDBK-02 is explicit).
- After selection: panel collapses, state persists as "👎 · wrong citation".

#### Error card & retry (CHAT-07)

- Triggered when:
  - `fetch` throws (network failure / CORS / abort-by-error) OR
  - HTTP response is not `ok` on the pre-stream path (400/401/413/429/500 — see contract §7) OR
  - SSE stream closes with a terminal `error{code, message}` frame (contract §6).
- **Rendering**: Replace the in-progress assistant bubble (if any) with an error card — neutral-warning border, ⚠ icon, role-neutral copy "Something went wrong. Your question wasn't answered.", and a **Retry** button.
- **Retry behaviour**: Re-dispatches the exact prior `POST /api/chat` body (same `role`, same `messages[]` up to and including the user turn that failed). The failed assistant bubble is removed; a fresh in-flight bubble replaces it.
- **Error-code variants** (copy + retry semantics, all per contract §6 / §7):
  - `upstream_timeout` → "The knowledge service took too long. Retry?" — safe to retry immediately.
  - `upstream_5xx` → "The knowledge service is temporarily unavailable. Retry in a moment?" — allow retry, no auto.
  - `schema_reject_after_retry` → "We couldn't format the answer. Refresh and try again." — retry may help, no auto.
  - `internal` (catch-all incl. upstream auth break) → "Something went wrong on our side. Please try again." — no auto-retry.
  - `rate_limited` (pre-stream 429) → "The assistant is busy. We'll retry in {retryAfter}s." — allow auto-retry honouring `Retry-After` header, max one auto-retry per user action, then manual-only.
- **`X-Request-Id` surfacing**: Every error card includes a small collapsed "Details" affordance showing `Request ID: <uuid>` so users can paste it into a bug report (contract §10 echoes this on both SSE and pre-stream error responses).
- **4xx client errors (`role_missing`, `messages_empty`, etc.)**: Should not occur in normal use — the client always constructs valid requests. If they do surface, show a "unexpected error — please refresh" banner (not a chat bubble) with the `X-Request-Id`. These are operator-bug signals, not conversational turns.

### Claude's Discretion

The planner / researcher has full flexibility on these — they don't change behaviour, only presentation:

- Styling library + component primitives — Tailwind + headless primitives (Radix / React Aria) is the default recommendation; planner confirms during research.
- Icon library (lucide-react is the default recommendation — tree-shakeable, React-19-compatible).
- Exact color palette values, typography scale, spacing scale (must satisfy WCAG AA contrast on all interactive states).
- Animation timings for typing dots, card hovers, confirm-modal transitions.
- Specific tooltip / popover implementation (Radix Tooltip vs native `title` — Radix recommended for the relative-timestamp hover so it's keyboard-accessible).
- File / folder layout under `src/` (existing convention: `src/chat/`, `src/grounding/`, etc. — frontend will likely add `src/components/`, `src/ui/`, `src/app/(chat)/`).
- State-management choice — local React state is sufficient; Zustand / Jotai is optional if the planner finds cross-component wiring gnarly.
- Whether to split the chat into multiple route segments (`/` for role-select, `/chat` post-role) or a single stateful page with conditional render — either is fine.

</decisions>

<specifics>
## Specific Ideas

- **Aesthetic reference** — enterprise-clean, Linear-issue-card tidy, Teams-sidebar-compatible. Not chatbot-consumer-playful. Corporate MMC context sets the register.
- **"KB" avatar** — a small circular badge with the letters "KB" in a muted brand tone, placed left of every assistant bubble. This is the only avatar in the UI — user messages have none.
- **Handover §14 is the source of truth** for avatars and message-level styling cues; §16 is the source of truth for chip wording (server-owned — client just renders `/api/prompts` responses).
- **Streaming feel** — even though Phase-2 is a single-delta facade, the typing-indicator-then-text render path is already the v1.1 shape. No re-architecture when the backend upgrades.
- **Tone calibration** — greetings scope the assistant's domain explicitly so out-of-scope asks reach the fallback path less often. Consumer greeting mentions "flagging, feedback, navigation"; Author greeting mentions "form fields, anchors, publishing". Both derived from Phase-2 allowlist domains.

</specifics>

<deferred>
## Deferred Ideas

Captured here so they aren't lost; all belong to other phases.

- **Source panel auto-open + citation chip click behaviour** — Phase 4 (PANE-01..07). Phase 3 renders citation chips as visually-present, click-is-no-op.
- **Distinct fallback UI treatment** (full border / icon / copy divergence + flag-a-gap button) — Phase 4 (FBK-01 / FBK-03 / FBK-04). Phase 3 ships the minimal marker only.
- **"About this assistant" first-run tooltip** + freshness / version header indicator — Phase 4 (TRST-01 / TRST-02).
- **Entra SSO gate before role-select** + Teams-host detection + NAA auth flow — Phase 5 (AUTH-01 / AUTH-03, DELV-02).
- **Telemetry POST for 👍 / 👎** + `message_id` schema + chip-vs-freeform + citation-click-through + session events — Phase 6 (FDBK-03, TELE-01..04).
- **Citation-level 👍 / 👎** (distinct from answer-level) — CITFDBK-01, deferred v2 per REQUIREMENTS.md.
- **Full conversation history persistence across tabs / sessions** — v1.1 / backlog. Violates AUTH-02 if done client-side without ceremony; would need a design pass on multi-tab reconciliation. Phase-3 buffers draft-only.
- **Multi-tab conversation sync / concurrent edits** — v1.1 / backlog. Last-writer-wins on the draft buffer is sufficient for v1.
- **True token streaming on the client** (many `answer_delta` frames) — v1.1. Contract is already forward-compatible; Phase-3 client code handles both single-delta and many-delta transparently.
- **Voice input / screen-reader enhancements beyond WCAG 2.1 AA baseline** — backlog.

</deferred>

---

*Phase: 03-role-experience-and-chat-ui*
*Context gathered: 2026-04-22*
