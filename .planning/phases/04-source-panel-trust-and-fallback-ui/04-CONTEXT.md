# Phase 4: Source Panel, Trust & Fallback UI - Context

**Gathered:** 2026-04-23
**Status:** Ready for planning

> **Note:** User delegated all four discussed areas to Claude's discretion, grounded in domain research + Phase 3's shipped UI stack (Next.js 15 App Router, React 19, Radix Primitives, Tailwind v4, lucide-react) + the three focus pitfalls (19 anchor IDs, 20 fallback-visually-distinct, 16 icon-with-colour). Decisions below are concrete enough that researcher + planner can act without a second round of questions, but any decision can be overridden before Plan 01 starts.

<domain>
## Phase Boundary

Every cited assistant response opens a right-side source panel to the exact cited section with the correct colour-coded badge and an "Open in ServiceNow ↗" deep link. Follow-up citations update the open panel; citation chips in past messages re-open and re-load it. Ungrounded responses render as a visually distinct fallback card (not styled like a normal answer) with a working "Flag this gap" affordance. The chat header carries a grounding/freshness line ("Grounded in KB0022991 v13.0 · KB0020882 v9.0 · Form schema YYYY-MM-DD") and a first-run dismissible "About this assistant" tooltip.

Out of scope for this phase: in-panel search/find-in-page, commenting, admin-only views, multi-tab panels, panel drag-to-resize, real Content-Steward mailbox provisioning (Phase 6), Teams deep-link variant of flag-a-gap (Phase 5 `detectHost`).

</domain>

<decisions>
## Implementation Decisions

### Source panel — layout & open rules

- **Desktop (≥1024px):** Right-side persistent pane (not overlay). Chat column shrinks when panel is open. Fixed width ~40% of viewport (one breakpoint, no drag-to-resize in v1). Panel and chat occupy the same visual shell — users read source + chat side-by-side without losing context.
- **Tablet + mobile (<1024px):** Full-height drawer that slides over the chat from the right. Chat is covered, not split. Dismissed via explicit close button or ESC. Rationale: two-column on narrow viewports is cramped and makes both surfaces unusable.
- **Auto-open trigger:** FIRST cited response in the session opens the panel automatically to the first citation's `{source_id, section_id}`. Subsequent cited responses update the panel content ONLY IF panel is already open — never re-open a panel the user closed. This respects Pitfall 20's sibling principle (don't surprise the user) and matches Roadmap SC#1/#2 verbatim.
- **Citation-chip re-open:** Clicking any citation chip (whether in the latest message or an older one) opens the panel (if closed) and loads that `{source_id, section_id}`. Active chip gets a subtle ring/highlight matching the source colour to show "this is what's loaded in the panel".
- **Cited section highlight:** On load, panel scrolls the cited section into view AND applies a 2s background fade-highlight on the section body (bg tint → fade to transparent). Makes the relevant passage unmissable without requiring reading the whole doc. Implemented via CSS animation, not JS polling.
- **Panel structure (top→bottom):**
  1. Header bar: colour-coded document badge + icon + source title + version (e.g., `🟦 KB0020882 · v9.0`). Close button (X) at far right.
  2. Body: full source markdown rendered with section anchors. Auto-scrolled + highlighted as above. Monospace/prose-readable typography (Tailwind `prose` plugin OR hand-rolled — planner decides).
  3. Footer: "Open in ServiceNow ↗" link-styled button using `registry[source_id].url` (the `<source url="...">` attribute extracted in Phase 1).
- **Panel open/closed persistence:** `sessionStorage` key (`panel_open`). Fresh session re-auto-opens on first citation. `localStorage` is wrong here — we want "same tab remembers, new tab gets the auto-open onboarding again".
- **Close behaviour:** Closing the panel does NOT clear the "which source was loaded" memory within the session — re-opening via any chip click resumes at that source. Only a full session reset (new conversation / change role) clears panel-loaded state.
- **Accessibility:** Panel is a Radix Dialog/Drawer primitive with proper `aria-labelledby` pointing at the header, ESC-to-close, and focus-trap when opened via keyboard. Citation chip → panel transition announces via aria-live.

### Fallback card — visual treatment

- **Visual distinction (Pitfall 20):** Three simultaneous signals so users can't mistake fallback for a grounded answer:
  1. **Border:** 1px solid amber (`border-amber-400 dark:border-amber-600`). Amber, not red — red reads as error/bug; amber says "I can't verify this, not a malfunction".
  2. **Background:** Subtle amber tint (`bg-amber-50 dark:bg-amber-950/20`).
  3. **Icon + heading:** `lucide-react` `CircleOff` (or `HelpCircle` — planner picks, both convey "outside my knowledge") in amber, top-left. Bold heading above §15 body text.
- **No message-like affordances:** Fallback card does NOT render the KB/Me avatar pair, timestamp, feedback thumbs, or "Copy answer" button. It's a distinct UI element in the message list, not a styled-down `Message`. Reinforces "this is not an answer".
- **Pitfall 16 compliance (icon + colour + weight):** Three independent signals — icon (shape), colour (amber), typography (bold heading on normal body) — so the distinction survives colour-blindness, low-contrast displays, and grayscale printing.
- **Copy:** Render the exact handover §15 fallback text verbatim from the server's `fallback{text}` event. Do NOT re-word, do NOT add client-side templating. Server is the source of truth (Pitfall 5).
- **Layout inside the card:** Vertical stack — icon + heading row, §15 body paragraph, "Flag this gap" button as primary action at bottom-left.

### Flag-a-gap mechanism

- **v1 transport: `mailto:` link.** Works everywhere out-of-the-box, no provisioning, degrades gracefully outside Teams. Teams deep-link is out of scope for Phase 4.
- **Recipient:** Environment variable `CONTENT_STEWARD_EMAIL` (add to `EnvSchema` — planner). Default in `.env.example`: `kb-knowledge-team@mmc.com` (placeholder — Phase 6 wires the real named Content-Steward mailbox).
- **Subject:** `KB Assistant: unanswered question (role: ${role})` — role included so the steward can triage volume by audience.
- **Body (URL-encoded):**
  ```
  Question:
  ${question}

  Role: ${role}
  Timestamp: ${ISO 8601}
  Request ID: ${x-request-id from last /api/chat response}
  ```
  Request ID included so the steward can correlate with server logs when investigating (per Phase 2 log-shape decisions).
- **Button placement:** Always visible on fallback card — not behind a second click. Primary-action styling (solid bg, slightly muted from CTA amber).
- **Success-state:** After click, button label swaps to `Opened in mail client ✓` for the remainder of that message's lifecycle. Non-blocking acknowledgement — we can't verify the user actually sent the mail, and hiding the button would prevent a legitimate second click.
- **Teams deep-link (deferred):** Phase 5's `detectHost` can route to a Teams channel URL when host === 'teams'. Out of scope here; noted in Deferred Ideas.

### Trust header & About tooltip

- **Freshness line placement:** In the existing Phase 3 `Header` component, right-aligned, small + muted (`text-xs text-muted-foreground`). Desktop shows full text; mobile (<640px) shows `Grounded ℹ` with tap/hover to reveal full list. Content sourced at build/request time from the registry (`REGISTRY.KB0020882.version`, etc.) — never hardcoded.
- **Freshness line format:** `Grounded in KB0022991 v13.0 · KB0020882 v9.0 · Form schema YYYY-MM-DD` with `·` separators. Order matches handover §14 (Flagging/Publishing/Attachments live inside KB0022991 so they don't get their own entry here — the badge in the panel header carries the section-level colour).
- **About tooltip trigger (first-run):** On the FIRST landing at the chat surface after role-select (not on the role-select screen itself — too much information at once). Anchored to the header's `ℹ` icon. Auto-opens once per device via `localStorage` key `about_tooltip_seen_v1`.
- **About tooltip content (handover brief):** Three bullets —
  - **What I can answer:** flagging procedures (KB0022991), knowledge-article lifecycle (KB0020882), article form field guidance.
  - **What I can't:** anything outside those three sources, personal account info, real-time status.
  - **How to flag a gap:** "When I can't answer, use the 'Flag this gap' button on the fallback card."
- **Dismiss behaviour:** "Got it" button (primary) + X button. Both persist the `about_tooltip_seen_v1` key. If user clears `localStorage` or switches devices, tooltip re-shows — acceptable by design.
- **Always-available:** Clicking the `ℹ` icon anytime re-opens the same popover. The first-run auto-open is onboarding; click access is everyday. One component, two triggers.
- **Implementation primitive:** Radix Popover (not Tooltip — Tooltip is for hover; Popover stays open and is clickable/dismissable).

### Colour-coding per handover §14 (cross-cutting)

- **Badge colours are a `source_id + section_id → colour` map** (not `source_id → colour`). Decision because handover §14 gives 7 colours against 3 source_ids: KB0020882 (blue) and Form (purple) are source-level; Flagging (red) / Publishing (green) / Attachments (purple) / Categories (amber) are section groupings INSIDE KB0022991. Default for uncovered KB0022991 sections: amber.
- **Canonical colour table:** Researcher produces the exact `section_id → colour` map by grepping `<!-- section:... -->` anchors in `src/grounding/sources/kb0022991.md`. Planner locks it into a single exported constant (`src/ui/sourceBadges.ts`) used by both the chat's citation chips AND the panel header. One source of truth prevents drift.
- **Icon pairing (Pitfall 16):** Every colour has a dedicated lucide icon alongside it in the badge. Icons assigned by researcher from lucide's catalogue (e.g., `Flag` for Flagging red, `Upload` for Publishing green, `Paperclip` for Attachments purple, `Tags` for Categories amber, `FileText` for KB0020882 blue, `ClipboardList` for Form purple). Icons are NEVER shown alone without the colour, and colour is NEVER shown alone without the icon.

### Claude's Discretion

- Exact Tailwind colour values (amber shade, dark-mode variants) — planner picks within the family.
- Icon selection from lucide for colour badges — researcher surveys, planner locks.
- Panel body typography (Tailwind `@tailwindcss/typography` plugin vs hand-rolled prose styles) — planner picks based on markdown rendering complexity.
- Markdown renderer choice (`react-markdown` vs `marked + DOMPurify` vs server-render-only) — researcher evaluates, planner locks. Must handle the source docs' `<!-- section:... -->` comments + `**bold**` + `-` lists.
- Animation timings (panel slide-in, section-highlight fade) — planner picks.
- Exact CSS for fallback card (border radius, padding, icon size) — planner picks.
- Mobile drawer implementation (Radix Dialog with `side="right"` vs a dedicated Drawer primitive like `vaul`) — researcher evaluates, planner locks.

</decisions>

<specifics>
## Specific Ideas

- **Radix Popover for About tooltip, not Tooltip.** Tooltip is hover-only; Popover stays open and dismissable — the correct primitive for a first-run onboarding element.
- **Panel must NOT re-auto-open after the first session trigger.** "Auto-open on every cited response" is tempting but violates Pitfall-20-sibling "don't surprise the user" — if someone closed the panel intentionally, re-opening it is pushy. The chip highlight + click-to-reload is the right affordance.
- **`mailto:` beats Teams deep-link for v1.** Teams deep-link only works when the app is running in Teams; `mailto:` works in both Teams-embedded (opens Outlook) and standalone browser contexts. Phase 5's `detectHost` can upgrade the behaviour later.
- **Fallback amber, not red.** Red is for errors (5xx, retry card from Phase 3). Amber says "I can't verify this" — it's an information signal, not a fault signal.
- **Colour + icon + typographic weight is the Pitfall-16 contract.** Any two-signal implementation (colour + icon only, or colour + text only) fails for some accessibility profile.
- **Registry is the freshness-line source of truth.** `REGISTRY.KB0020882.version` already exists from Phase 1. Hardcoding versions in a component is a bug waiting for Phase 6's monthly refresh.

</specifics>

<deferred>
## Deferred Ideas

- **Panel drag-to-resize.** v1 uses fixed ~40% desktop width. If pilot feedback wants flexibility, add to v1.1 with a localStorage-persisted width value.
- **Teams deep-link variant of flag-a-gap.** Gated on Phase 5's `detectHost` landing. When inside Teams, the "Flag this gap" button should open a Teams chat to the Content-Steward channel instead of `mailto:`. Requires the Teams channel URL from the pilot setup.
- **Real Content-Steward mailbox.** Phase 6 pilot-prep names a specific person + mailbox. `.env.example` ships a placeholder.
- **In-panel find/search.** "Ctrl+F within the source panel" is a power-user feature. Out of scope for v1 — browser native Ctrl+F works over rendered markdown already.
- **Multi-source tabs in panel.** If the conversation cites three different sources, v1 just swaps panel content on each chip click. Tabbed UI (one tab per recently-cited source) is a deferred enhancement.
- **Admin "Flagged Gaps" dashboard view.** Captured in v2 backlog (CITFDBK-01, ADMIN-01, ADMIN-02 — already tagged "not mapped to v1 roadmap").
- **Commenting on panel content.** New capability — belongs in its own phase if it ever lands.
- **First-run tooltip per-user (not per-device).** Currently localStorage-keyed; a per-user flag would require Phase 5 auth to be in place. Deferred until after SSO lands.

</deferred>

---

*Phase: 04-source-panel-trust-and-fallback-ui*
*Context gathered: 2026-04-23*
