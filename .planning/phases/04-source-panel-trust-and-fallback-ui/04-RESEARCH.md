# Phase 4: Source Panel, Trust & Fallback UI — Research

**Researched:** 2026-04-23
**Domain:** React panel layout, markdown rendering, Radix primitives, sessionStorage/localStorage, mailto encoding, Tailwind v4 theming
**Confidence:** HIGH (all findings grounded in actual codebase + installed node_modules inspection)

---

## Summary

Phase 4 builds on a well-established Phase-3 stack (Next.js 16.2.4, React 19.2.5, Tailwind v4.2.4, Radix Primitives, lucide-react 1.8.0). All key decisions in CONTEXT.md can be implemented without adding any new dependencies. The REGISTRY already parses `<!-- section:ID -->` anchors and exposes `{id, title, body}` per section — the panel body content is already available server-side and must be passed to the client safely.

The canonical section-to-colour map (research item #1) is derived below by grepping the actual source files. All required lucide icons (items #2, #16) are confirmed present in the installed `lucide-react@1.8.0` package. The markdown renderer question (item #3) resolves to hand-rolled rendering using a function that strips the `<!-- section:... -->` marker and renders the `body` string already pre-extracted by the registry parser — no external markdown library is needed.

For the mobile drawer (item #4), Radix Dialog `modal={false}` is the right primitive for the desktop non-modal pane; a second Dialog instance (modal, CSS-positioned right, translate-x animated) handles mobile. One `SourcePanel` component renders both, switching behaviour via a `useMediaQuery` hook or a CSS-only responsive approach. `vaul` is not installed and should not be added — Radix Dialog already covers the use case.

**Primary recommendation:** No new npm packages required. Implement all Phase 4 features using existing stack: Radix Dialog + Popover + lucide-react + Tailwind v4 CSS variables.

---

## Standard Stack

All packages below are already installed. No new dependencies needed.

### Core (confirmed installed)
| Library | Version | Purpose | Confirmed |
|---------|---------|---------|-----------|
| `@radix-ui/react-dialog` | 1.1.15 | Source panel (desktop non-modal + mobile modal drawer) | pnpm-lock.yaml |
| `@radix-ui/react-popover` | 1.1.15 | About-this-assistant tooltip (first-run + ℹ click) | pnpm-lock.yaml |
| `lucide-react` | 1.8.0 | All badge icons (Flag, Upload, Paperclip, Tags, FileText, ClipboardList, CircleOff) | node_modules confirmed |
| `tailwindcss` | 4.2.4 | Styling — @theme CSS vars pattern, no tailwind.config.ts needed | globals.css confirmed |
| `clsx` + `tailwind-merge` | 2.1.1 + 3.5.0 | cn() utility (already in `src/chat-ui/cn.ts`) | node_modules confirmed |
| `zod` | 4.3.6 | `CONTENT_STEWARD_EMAIL` addition to EnvSchema | already in env.ts |

### Not Installed — Do NOT Add
| Library | Status | Decision |
|---------|--------|----------|
| `vaul` | NOT installed | Do not add — Radix Dialog covers mobile drawer |
| `react-markdown` | NOT installed | Do not add — hand-roll section body renderer (see §Architecture) |
| `marked` | NOT installed | Do not add |
| `@tailwindcss/typography` | NOT installed | Do not add — hand-roll prose styles in Tailwind v4 @theme |

---

## Canonical Section → Colour Map (Research Item #1)

Produced by grepping `<!-- section:... -->` anchors from all three source files.

### KB0022991 sections (section-level colours per handover §14)

| section_id | Section Title | Colour Group | Tailwind Class Family | Lucide Icon |
|------------|---------------|--------------|----------------------|-------------|
| `publishing-approval` | Publishing and Approval Workflow | Publishing (green) | `green-*` | `Upload` |
| `approvers` | Publishing Approvers | Publishing (green) | `green-*` | `Upload` |
| `edit-retire-delete` | Edit / Retire / Delete Lifecycle | Publishing (green) | `green-*` | `Upload` |
| `flagging-articles` | Flagging Articles | Flagging (red) | `red-*` | `Flag` |
| `knowledge-blocks` | Knowledge Blocks | Publishing (green) | `green-*` | `Upload` |
| `criteria-check` | Colleague Knowledge Criteria Check | Publishing (green) | `green-*` | `Upload` |

**Rationale for groupings:** Handover §14 assigns Flagging (red) to the flagging workflow section; remaining KB0022991 sections are about the publishing/authoring lifecycle → green. `criteria-check` is a pre-approval gate, logically part of Publishing.

**Default for uncovered KB0022991 section_ids:** amber (per CONTEXT.md).

### KB0020882 sections (source-level blue, all sections)

| section_id | Section Title | Colour | Lucide Icon |
|------------|---------------|--------|-------------|
| `who-can-submit` | Who Can Submit | Blue | `FileText` |
| `article-creation-steps` | Article Creation Steps | Blue | `FileText` |
| `naming-convention` | Article Naming Convention | Blue | `FileText` |
| `required-fields` | Required Fields | Blue | `FileText` |
| `resolution-field-software` | Resolution Field — Software | Blue | `FileText` |
| `resolution-field-support-process` | Resolution Field — Support Process | Blue | `FileText` |
| `security-rules` | Security Rules | Blue | `FileText` |
| `attachments` | Attachments | Blue (source-level override) | `Paperclip` |
| `categorisation` | Categorisation | Blue (source-level override) | `FileText` |

**Note on KB0020882 Attachments:** The source-level colour for KB0020882 is blue. The handover §14 assigns "Attachments purple" at a section-group level, but that purple assignment is for SNOW_FORM's attachment-related fields, not KB0020882's attachments section. Planner should confirm: apply source-level blue for all KB0020882 sections including `attachments`, or override `attachments` → purple. Recommend blue (source-level) for simplicity — purple is used for SNOW_FORM.

### SNOW_FORM sections (source-level purple, all sections)

| section_id | Section Title | Colour | Lucide Icon |
|------------|---------------|--------|-------------|
| `required-fields` | Required Fields | Purple | `ClipboardList` |
| `short-description` | Short Description Field | Purple | `ClipboardList` |
| `article-body` | Article Body Field | Purple | `ClipboardList` |
| `resolution-field` | Resolution Field | Purple | `ClipboardList` |
| `configuration-item` | Configuration Item Field | Purple | `ClipboardList` |
| `optional-fields` | Optional Fields | Purple | `ClipboardList` |
| `workflow-fields` | Workflow State Fields | Purple | `ClipboardList` |

### Colour → Tailwind CSS Variable Map

The existing `globals.css` uses `@theme { --color-* }` Tailwind v4 pattern. New badge colours must be added there. Recommended additions:

```css
/* Source Panel badge colours — Phase 4 */
--color-badge-blue-600:   #2563eb;  /* KB0020882 */
--color-badge-blue-50:    #eff6ff;
--color-badge-red-600:    #dc2626;  /* Flagging */
--color-badge-red-50:     #fef2f2;
--color-badge-green-600:  #16a34a;  /* Publishing — NOTE: same as consumer-600 */
--color-badge-green-50:   #f0fdf4;  /* same as consumer-50 */
--color-badge-purple-600: #9333ea;  /* SNOW_FORM — NOTE: same as author-600 */
--color-badge-purple-50:  #faf5ff;  /* same as author-50 */
--color-badge-amber-600:  #d97706;  /* Fallback/default — NOTE: same as warning-600 */
--color-badge-amber-50:   #fffbeb;  /* same as warning-50 */
```

**Important:** green-600 = consumer-600, purple-600 = author-600, amber-600 = warning-600 already exist. The planner can alias the existing variables rather than adding duplicates, or add named badge-* aliases for clarity. One source of truth.

### Canonical `sourceBadges.ts` Structure

Create `src/ui/sourceBadges.ts`. The planner should model it as:

```typescript
export type BadgeColour = 'blue' | 'red' | 'green' | 'purple' | 'amber'

export interface BadgeDef {
  colour: BadgeColour
  iconName: string  // lucide icon component name
  label: string     // human-readable section label
}

// Keyed by `${source_id}/${section_id}` — the slash separator avoids
// section_id collisions across sources (e.g. 'required-fields' exists in
// both KB0020882 and SNOW_FORM).
export const SOURCE_BADGES: Record<string, BadgeDef> = { ... }

// Source-level fallback (when section_id not in map)
export const SOURCE_FALLBACK: Record<string, BadgeColour> = {
  KB0020882: 'blue',
  KB0022991: 'amber',   // default for uncovered sections
  SNOW_FORM: 'purple',
}
```

---

## Architecture Patterns

### Recommended Project Structure (Phase 4 additions)

```
src/
├── chat-ui/
│   ├── SourcePanel.tsx          # NEW — unified panel+drawer component
│   ├── FallbackCard.tsx         # NEW — visually distinct fallback (not a Message)
│   ├── usePanelState.ts         # NEW — sessionStorage panel_open + loaded source
│   ├── useAboutTooltip.ts       # NEW — localStorage about_tooltip_seen_v1
│   ├── Header.tsx               # MODIFY — add freshness line + About Popover trigger
│   ├── MessageList.tsx          # MODIFY — render FallbackCard for fallback messages
│   ├── Message.tsx              # MODIFY — citation chips become clickable; active chip ring
│   ├── ChatSurface.tsx          # MODIFY — add SourcePanel, wire panel state
│   ├── chatReducer.ts           # NO CHANGE — state already handles 'fallback' correctly
│   └── types.ts                 # NO CHANGE — Citation type already has source_id + section_id
├── ui/
│   ├── sourceBadges.ts          # NEW — canonical colour/icon map (referenced above)
│   └── sourceTitles.ts          # MODIFY — extend with all real section titles
└── config/
    └── env.ts                   # MODIFY — add CONTENT_STEWARD_EMAIL
```

### Pattern 1: Desktop Non-Modal Persistent Pane (Radix Dialog modal={false})

Radix Dialog supports `modal={false}`. In non-modal mode:
- Focus is NOT trapped inside the panel
- ESC still closes (Radix handles this)
- Background is NOT blocked — chat remains interactive
- No overlay is rendered

The `ChangeRoleDialog` already uses Radix Dialog in modal mode. The SourcePanel uses `modal={false}` for desktop.

```typescript
// Desktop: non-modal persistent pane (chat shrinks, panel appears right)
<Dialog.Root open={panelOpen} onOpenChange={setPanelOpen} modal={false}>
  <Dialog.Portal>
    {/* NO Dialog.Overlay for desktop — chat must remain interactive */}
    <Dialog.Content
      aria-labelledby="source-panel-title"
      // CSS: fixed right-0 top-0 h-full w-[40vw], no overlay
      className="fixed right-0 top-0 h-full w-[40vw] bg-white shadow-lg ..."
      onOpenAutoFocus={(e) => e.preventDefault()} // don't steal focus from chat
    >
      ...
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```

**CRITICAL:** `onOpenAutoFocus={(e) => e.preventDefault()}` is required for the desktop panel — auto-focus would steal keyboard focus from the chat input, which is the active surface. The ChangeRoleDialog intentionally auto-focuses (it's a modal interruption), but the panel must not.

### Pattern 2: Mobile Drawer (Same Radix Dialog, modal=true, right-slide CSS)

On mobile (<1024px), use the same Dialog with `modal={true}` and CSS to position as a right-side drawer with slide-in animation.

```typescript
// Mobile: full-height overlay drawer
// Use CSS translate + Tailwind to slide from right
<Dialog.Overlay className="fixed inset-0 bg-black/30 lg:hidden" />
<Dialog.Content
  className="fixed right-0 top-0 h-full w-full bg-white shadow-xl
             translate-x-0 data-[state=closed]:translate-x-full
             transition-transform duration-200 lg:hidden"
>
```

**Single component, two modes:** One `SourcePanel` component checks `isDesktop` (via `window.matchMedia('(min-width: 1024px)')` or Tailwind responsive) and passes the appropriate `modal` prop. This avoids duplicating the panel content.

**Alternative (simpler):** Pure CSS responsive — render ONE Dialog, always `modal={false}`, and use Tailwind breakpoint classes to change the backdrop visibility and layout. On desktop: no overlay. On mobile: overlay via a CSS-absolute `div` sibling that only shows below lg. This avoids the JS media query and React re-mounting on resize. Recommended.

### Pattern 3: ChatSurface Layout — Chat + Panel Side-by-Side

The current `ChatSurface` is `flex flex-col` full height. Panel open requires chat column to shrink.

```typescript
// ChatSurface.tsx — outer shell becomes flex-row on desktop when panel open
<div className={cn(
  "flex min-h-screen flex-col",
  panelOpen && "lg:flex-row"
)}>
  {/* Chat column */}
  <div className={cn(
    "flex flex-1 flex-col",
    panelOpen && "lg:w-[60%]"
  )}>
    {/* existing Header + main + InputBar */}
  </div>

  {/* Source panel (only rendered on lg+) */}
  <SourcePanel open={panelOpen} ... />
</div>
```

### Pattern 4: Section Highlight — CSS Animation (No JS Polling)

CONTEXT.md: "2s background fade-highlight via CSS animation, not JS polling." Implement via a CSS keyframes animation + a data attribute trigger.

```css
/* globals.css */
@keyframes section-highlight {
  0%   { background-color: var(--color-badge-amber-50); }
  100% { background-color: transparent; }
}

[data-highlight="true"] {
  animation: section-highlight 2s ease-out forwards;
}
```

To trigger: when the panel loads a new `{source_id, section_id}`, find the section DOM element and toggle a `data-highlight` attribute. React key trick: assign `key={section_id}` to the highlighted section `div` so React re-mounts it (replaying the animation) when the section changes.

### Pattern 5: Markdown Rendering for Section Body

The REGISTRY `parseSource()` already extracts `section.body` as a trimmed string containing the raw markdown (with the `<!-- section:... -->` marker stripped). The body contains:
- `## Section Title` headings
- `**bold**` inline
- `- item` unordered lists
- `1. item` ordered lists
- Fenced code blocks

No external markdown library is needed for this content. **Use a lightweight custom renderer** that transforms the extracted `body` string to React elements. This avoids adding react-markdown (which pulls in remark/rehype chain) and keeps the bundle clean.

Implementation approach: a `renderSectionMarkdown(body: string): React.ReactNode` function that:
1. Strips the leading `## Heading` line (already used as panel title)
2. Splits on double-newlines into blocks
3. Renders each block as `<ul>` / `<ol>` / `<pre>` / `<p>` depending on leading characters

The content is static and controlled (comes from our own grounding sources, not user input). No XSS risk. No DOMPurify needed.

**Confidence (HIGH):** The body strings are short (50–100 lines max), contain only basic markdown, and are entirely within our control.

### Pattern 6: Panel Typography — Hand-Rolled (No @tailwindcss/typography)

`@tailwindcss/typography` is NOT installed. For Tailwind v4 it requires `@tailwindcss/typography@next` (v5 alpha). Do not add it. Instead, hand-roll the 5–6 prose rules needed for the panel:

```css
/* In globals.css or as Tailwind utilities in the component */
.panel-prose p    { @apply text-sm leading-relaxed text-foreground mb-3 }
.panel-prose ul   { @apply list-disc pl-5 text-sm mb-3 }
.panel-prose ol   { @apply list-decimal pl-5 text-sm mb-3 }
.panel-prose li   { @apply mb-1 }
.panel-prose code { @apply font-mono text-xs bg-neutral-100 px-1 rounded }
.panel-prose strong { @apply font-semibold }
```

Or use inline Tailwind classes on each rendered element type (preferred for Tailwind v4 — avoids @apply anti-patterns).

### Pattern 7: sessionStorage Panel State (`panel_open`)

```typescript
// src/chat-ui/usePanelState.ts
export function usePanelState() {
  const [open, setOpen] = useState(() =>
    typeof window !== 'undefined'
      ? sessionStorage.getItem('panel_open') === 'true'
      : false
  )
  const [loaded, setLoaded] = useState<{source_id: string, section_id: string} | null>(null)
  const [hasAutoOpened, setHasAutoOpened] = useState(false)

  const openPanel = useCallback((source_id: string, section_id: string) => {
    setOpen(true)
    setLoaded({ source_id, section_id })
    sessionStorage.setItem('panel_open', 'true')
  }, [])

  const closePanel = useCallback(() => {
    setOpen(false)
    sessionStorage.setItem('panel_open', 'false')
    // Do NOT clear `loaded` — close preserves which source was last shown
  }, [])

  // Auto-open on first citation in session (only once)
  const autoOpenOnFirstCitation = useCallback((source_id: string, section_id: string) => {
    if (!hasAutoOpened) {
      setHasAutoOpened(true)
      if (!open) openPanel(source_id, section_id)
      else setLoaded({ source_id, section_id }) // panel already open: just update content
    } else if (open) {
      setLoaded({ source_id, section_id }) // session's subsequent citations: update if open
    }
  }, [hasAutoOpened, open, openPanel])

  return { open, loaded, openPanel, closePanel, autoOpenOnFirstCitation }
}
```

### Pattern 8: localStorage About Tooltip (`about_tooltip_seen_v1`)

```typescript
// src/chat-ui/useAboutTooltip.ts
export function useAboutTooltip() {
  const [seen, setSeen] = useState(true) // default true prevents flash
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const isSeen = localStorage.getItem('about_tooltip_seen_v1') === 'true'
    setSeen(isSeen)
    if (!isSeen) setOpen(true) // auto-open on first visit
  }, [])

  const dismiss = useCallback(() => {
    setSeen(true)
    setOpen(false)
    localStorage.setItem('about_tooltip_seen_v1', 'true')
  }, [])

  return { open, setOpen, dismiss }
}
```

**SSR note:** `localStorage` is unavailable during SSR. Default `seen=true` prevents the tooltip from flashing open on server-render. The `useEffect` runs client-side only and corrects to `false` if not yet seen.

### Pattern 9: Citation Chip Active-State Ring (Shared Colour Constant)

CONTEXT.md: "active chip gets a colour-matched ring — shared constant prevents drift."

The `sourceBadges.ts` already contains `BadgeColour` → CSS variable mappings. Citation chips read the same constant as the panel header badge. No separate lookup:

```typescript
// In Message.tsx — citation chip rendering
import { getSourceBadge } from '@/ui/sourceBadges'

const badge = getSourceBadge(cit.source_id, cit.section_id)
const isActive = loaded?.source_id === cit.source_id && loaded?.section_id === cit.section_id

<button
  onClick={() => onChipClick(cit.source_id, cit.section_id)}
  className={cn(
    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]',
    badgeClasses[badge.colour],          // same class as panel badge
    isActive && ringClasses[badge.colour] // outline ring matching badge colour
  )}
>
```

The `ringClasses` map: `{ blue: 'ring-2 ring-blue-600', red: 'ring-2 ring-red-600', ... }`. Defined in `sourceBadges.ts` alongside badge classes — one file owns all colour mappings.

### Pattern 10: FallbackCard (NOT a Message)

CONTEXT.md is explicit: fallback does NOT render with KB avatar, timestamp, feedback thumbs, or copy button. It is a distinct element in the message list.

```typescript
// src/chat-ui/MessageList.tsx modification
messages.map((m) => {
  if (m.kind === 'assistant' && m.state === 'fallback') {
    return <FallbackCard key={m.id} message={m} onFlagGap={onFlagGap} />
  }
  // ... existing logic
})
```

Current `Message.tsx` handles `state === 'fallback'` with a styled border variant. Phase 4 **replaces** this with a completely separate `FallbackCard` component in `MessageList.tsx`'s render branch. The existing `isFallback` branch in `Message.tsx` is removed.

### Pattern 11: `mailto:` URL Construction (Windows/Outlook Safety)

**Research item #8 — mailto pitfalls on Windows/Outlook:**

Key facts verified:
1. **Line breaks:** Use `%0D%0A` (CRLF) for Outlook compatibility. `%0A` (LF only) works in most mail clients but Outlook on Windows may render as literal `\n`. Use CRLF to be safe.
2. **Subject encoding:** Use `encodeURIComponent()` for both subject and body. This handles spaces as `%20` (correct for mailto), not `+` (only correct for form data).
3. **Body length:** RFC 2368 has no formal limit, but Outlook enforces ~2000 chars. The proposed body (question + role + timestamp + request ID) is ~200-300 chars — well within limits.
4. **Newlines in body:** The body template from CONTEXT.md uses blank lines between fields. Each `\n` → `%0D%0A`.

```typescript
function buildMailtoLink(question: string, role: string, requestId: string): string {
  const email = process.env.NEXT_PUBLIC_CONTENT_STEWARD_EMAIL ?? ''
  const subject = encodeURIComponent(`KB Assistant: unanswered question (role: ${role})`)
  const body = encodeURIComponent(
    `Question:\r\n${question}\r\n\r\nRole: ${role}\r\nTimestamp: ${new Date().toISOString()}\r\nRequest ID: ${requestId}`
  )
  return `mailto:${email}?subject=${subject}&body=${body}`
}
```

**Note:** `CONTENT_STEWARD_EMAIL` must be exposed to the client as `NEXT_PUBLIC_CONTENT_STEWARD_EMAIL`. It is NOT secret (it's an email address). Add both `CONTENT_STEWARD_EMAIL` (for env.ts/server) and `NEXT_PUBLIC_CONTENT_STEWARD_EMAIL` (for client mailto builder). OR: expose it via the `/api/prompts` response or a new `/api/config` endpoint to avoid NEXT_PUBLIC_ altogether. Recommend: add `NEXT_PUBLIC_CONTENT_STEWARD_EMAIL` to env.ts as an optional public var since it's a non-secret UI constant.

### Pattern 12: Radix Dialog Focus Behaviour — Desktop vs Modal

**Research item #9 — one component or two?**

Use ONE SourcePanel component that adapts based on viewport. Key Radix Dialog props:

- `modal={false}`: desktop — no focus trap, no overlay, background interactive
- `modal={true}`: mobile — focus trap, overlay, ESC closes
- `onOpenAutoFocus={(e) => e.preventDefault()}`: desktop only — prevents stealing chat input focus

Implementation: a `useIsDesktop` hook (SSR-safe) that returns `true` when `window.matchMedia('(min-width: 1024px)').matches`. Pass this to SourcePanel which renders one Dialog with the appropriate props.

ESC behaviour: Radix Dialog handles ESC in both modes via its `DismissableLayer`. No custom key handler needed.

**The existing `ChangeRoleDialog` pattern is modal:** it uses the default (`modal={true}`) and is correct for an interruption dialog. The SourcePanel reuses the same primitive but with different props — no architectural conflict.

### Pattern 13: Freshness Line — Registry as Source of Truth

REGISTRY is a server-only module (`readFileSync` at module init). The freshness line must be derived from REGISTRY on the server and passed to the client. Two options:

1. **Server Component prop:** If `ChatSurface` is refactored to accept a `freshnessInfo` prop from a server component, pass the version strings down. Clean but requires ChatSurface to accept new props from layout.tsx or page.tsx.
2. **`/api/config` endpoint (recommended):** A new `GET /api/config` returning `{ versions: { KB0022991: '13.0', KB0020882: '9.0', SNOW_FORM: '2026-04-23' } }`. The Header fetches this once on mount (cached, no auth needed). Consistent with the `/api/prompts` pattern already in the stack.

The `SNOW_FORM` version is `"live"` in the current source file (not a date). For the freshness line format `Form schema YYYY-MM-DD`, use the file's last-modified date (from `fs.statSync`) OR change the `servicenow-form.md` `version` attribute to a date. Recommend: change `version="live"` to `version="2026-04-23"` in the source file.

### Anti-Patterns to Avoid

- **Don't import REGISTRY in client components.** `registry.ts` uses `readFileSync` — it will crash in the browser bundle. The section body content must be fetched via API or passed as a Server Component prop.
- **Don't put `data-highlight` on the whole section list.** Only the currently-cited section gets the animation. Keying on `section_id` in the React render ensures clean re-animation.
- **Don't use `localStorage` for `panel_open`.** CONTEXT.md explicitly says `sessionStorage` — per-tab, not per-device.
- **Don't render FallbackCard inside Message.tsx.** The existing `isFallback` branch in Message.tsx must be removed and replaced with the MessageList-level branch.
- **Don't use `encodeURI()` for mailto body.** Use `encodeURIComponent()` — `encodeURI()` does not encode `?`, `=`, `&`, `#`, which would break the URL if the question text contains those characters.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Focus trap in panel | Custom focus management | Radix Dialog (FocusScope built-in) | Handles Tab, Shift+Tab, all edge cases |
| ESC dismiss | `keydown` listener | Radix Dialog DismissableLayer | Handles all cases including nested dialogs |
| Popover open/close | State + click-outside | Radix Popover (already in Header) | Already installed, already used |
| Markdown → React | react-markdown / marked | Custom `renderSectionMarkdown()` | Content is controlled, 5 element types only |
| CSS slide animation | Framer Motion | Tailwind + CSS `transition-transform` | No animation library needed for simple slide |
| `aria-live` citations | Custom announcer | Radix Dialog `aria-labelledby` | Panel title already announces on open |

---

## Common Pitfalls

### Pitfall 19: Anchor IDs from Section Markers, Not Heading Slugs

**What goes wrong:** Developers derive scroll-target IDs from heading text (`## Publishing and Approval Workflow` → `#publishing-and-approval-workflow`) rather than the `<!-- section:publishing-approval -->` marker. The panel scrolls to the wrong element or not at all.

**Root cause:** Familiarity with standard markdown-to-HTML pipeline (e.g. GitHub) that slugifies headings. This codebase uses a different convention: section IDs are explicitly authored in `<!-- section:ID -->` comments, NOT derived from headings.

**How to avoid:** Every rendered section block gets `id={section.id}` where `section.id` comes from the REGISTRY, NOT from the heading text. Example:

```typescript
sections.map(section => (
  <div key={section.id} id={section.id} ...>
    {renderSectionMarkdown(section.body)}
  </div>
))
```

Panel scroll: `document.getElementById(section_id)?.scrollIntoView()`

**Anchor-check test design (Research item #6):** Write a Vitest unit test in `src/grounding/__tests__/` that:
1. Imports `REGISTRY` 
2. For each source, iterates `source.sections`
3. Asserts that `section.id` matches the `<!-- section:ID -->` syntax (verifies the parser is extracting IDs correctly, not slugifying)
4. In the E2E test (Playwright), after panel opens: `await page.locator(`#${section_id}`).isVisible()` — verifies the DOM element with the registry-derived ID exists and is scrolled into view

```typescript
// Vitest anchor-check (src/grounding/__tests__/anchorIds.test.ts)
import { REGISTRY } from '@/grounding/registry'
it('all section IDs are kebab-case registry anchors, not heading slugs', () => {
  for (const source of Object.values(REGISTRY)) {
    for (const section of source.sections) {
      // IDs come from <!-- section:ID --> — must be kebab-case, no spaces
      expect(section.id).toMatch(/^[a-z][a-z0-9-]*$/)
      // Must NOT be a heading slug (would contain no hyphens for 1-word headings,
      // or would have different casing)
      // Basic check: section.id must appear literally in the source body marker
      // (already guaranteed by parseSource SECTION_RE, but belt-and-suspenders)
    }
  }
})
```

### Pitfall 20: Fallback Visually Indistinct From Grounded Answer

**What goes wrong:** Fallback card is styled as a "warning variant" of a normal message bubble (border-left accent on the same white card). Users misread it as a grounded but hedged answer.

**How to avoid:** Three SIMULTANEOUS signals (per CONTEXT.md):
1. Amber border: `border border-amber-400`
2. Amber background tint: `bg-amber-50`
3. Bold heading + `CircleOff` icon at top-left (NOT the KB avatar)
4. No avatar, no timestamp, no thumbs, no copy button

**The existing `Message.tsx` fallback styling** (`border-l-4 border-warning-600 pl-3` with `<Info size={14}` and "This answer is a general response") is **insufficient** — it still renders within a normal bubble with KB avatar + timestamp + controls. Phase 4 removes this and replaces with a fully separate `FallbackCard` component.

### Pitfall 16: Icon Pairing on Every Colour-Coded Element

**What goes wrong:** A badge renders only the colour dot (no icon), or only the icon (no colour). Fails for colour-blind users.

**How to avoid:** The `sourceBadges.ts` canonical map stores both `colour` and `iconName` per entry. Every badge render site uses BOTH from the same lookup — they cannot drift independently.

**Current state in Message.tsx:** Citation chips already use `<Paperclip size={10} aria-hidden />` but with no colour differentiation (all chips are neutral grey). Phase 4 upgrades them to use the `sourceBadges.ts` map for colour AND icon simultaneously.

### Pitfall: REGISTRY Client Bundle Crash

**What goes wrong:** A developer imports `REGISTRY` or `parseSource` in a client component (`'use client'`). `readFileSync` is not available in the browser — the component crashes with `Cannot read properties of undefined (reading 'readFileSync')`.

**How to avoid:** Panel content (section body text) must come from a server-only source. Two safe patterns:
1. `/api/chat` response already includes `citations[].section_id` — the panel fetches the section body from a new `GET /api/sources/{source_id}/{section_id}` endpoint.
2. Alternatively, build-time: add a `'use server'` Server Component that renders the panel body server-side and passes HTML string down. Simpler for v1.

Recommend option 1: a lightweight `GET /api/sources` endpoint that returns section content by `{source_id, section_id}` query params. This keeps client/server separation clean and matches the existing API-route pattern.

### Pitfall: First-Run Tooltip Flash (SSR + localStorage)

**What goes wrong:** Component reads `localStorage` at render time. During SSR/hydration, `localStorage` doesn't exist. The tooltip flashes open/closed during hydration.

**How to avoid:** Default `seen = true` (hidden) at mount. Set to `false` only after `useEffect` confirms `localStorage.getItem('about_tooltip_seen_v1') !== 'true'`. This guarantees: no flash on SSR, tooltip opens smoothly after hydration on first visit.

### Pitfall: `panel_open` sessionStorage Value Type

**What goes wrong:** `sessionStorage.setItem('panel_open', true)` — JS coerces `true` to the string `"true"`, but `!!sessionStorage.getItem('panel_open')` returns `true` even when the value is `"false"`. The panel never closes.

**How to avoid:** Read with an explicit comparison: `sessionStorage.getItem('panel_open') === 'true'`. Always write `'true'` or `'false'` string literals, never the boolean.

---

## Code Examples

### Radix Dialog — Non-Modal Desktop Panel

```typescript
// Source: @radix-ui/react-dialog v1.1.15 (installed, confirmed modal prop)
<Dialog.Root open={open} onOpenChange={onClose} modal={false}>
  <Dialog.Portal>
    {/* No Overlay for desktop non-modal */}
    <Dialog.Content
      aria-labelledby="panel-title"
      onOpenAutoFocus={(e) => e.preventDefault()}
      className="fixed right-0 top-0 h-full w-[40vw] bg-white border-l
                 border-neutral-border flex flex-col shadow-lg focus:outline-none"
    >
      ...
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```

### Section Scroll + Highlight Trigger

```typescript
// After panel loads new source, scroll cited section into view
useEffect(() => {
  if (!loaded) return
  const el = document.getElementById(loaded.section_id)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    // Toggle data-highlight to replay CSS animation
    el.removeAttribute('data-highlight')
    void el.offsetHeight  // force reflow to replay animation
    el.setAttribute('data-highlight', 'true')
  }
}, [loaded])
```

### mailto Construction (URL-safe)

```typescript
// Pitfall: use encodeURIComponent, not encodeURI; use \r\n for Outlook
function buildMailtoLink(params: {
  question: string, role: string, requestId: string, email: string
}): string {
  const { question, role, requestId, email } = params
  const subject = encodeURIComponent(`KB Assistant: unanswered question (role: ${role})`)
  const body = encodeURIComponent([
    `Question:`,
    question,
    ``,
    `Role: ${role}`,
    `Timestamp: ${new Date().toISOString()}`,
    `Request ID: ${requestId}`,
  ].join('\r\n'))
  return `mailto:${email}?subject=${subject}&body=${body}`
}
```

### Playwright localStorage Testing Pattern

```typescript
// Clear localStorage before test (established pattern from existing E2E tests)
await page.addInitScript(() => localStorage.clear())
// OR seed a specific key:
await page.addInitScript(() => {
  localStorage.setItem('about_tooltip_seen_v1', 'true')
})
// Verify tooltip did NOT auto-open:
await expect(page.getByRole('dialog', { name: /about this assistant/i }))
  .not.toBeVisible()
```

The existing E2E tests use `page.addInitScript(() => sessionStorage.clear())` extensively. The same pattern applies to `localStorage.clear()` for About-tooltip tests. `addInitScript` runs before page load — correct for testing first-run behaviour.

---

## State of the Art

| Old Approach (Phase 3) | Phase 4 Approach | Why Changed |
|------------------------|------------------|-------------|
| Citation chip = neutral grey `<span>` (no click handler) | Colour-coded clickable `<button>` with active ring | Panel requires chip → panel navigation |
| Fallback = styled left-border inside normal message | FallbackCard = independent component, NOT a Message | Three-signal visual distinction (Pitfall 20) |
| Header = role pill + New conversation only | Header + freshness line + ℹ icon for About Popover | Trust indicators required by SC#5 |
| No source panel | SourcePanel = Radix Dialog (non-modal desktop, modal mobile) | Core Phase 4 requirement |

---

## Open Questions

1. **KB0020882 `attachments` section colour:** CONTEXT.md says "Attachments purple" at the section-group level, and KB0020882 is "blue" at the source level. The `attachments` section exists in KB0020882. Should it be blue (source-level) or purple (overriding the source colour because handover §14 says "Attachments purple")? Recommend blue (source-level) for KB0020882 since handover §14's "Attachments purple" appears to refer to the SNOW_FORM attachment fields. Planner should confirm with the handover §14 original if available.

2. **REGISTRY exposure to client:** Section body text must reach the client. Three options: (a) new `GET /api/sources` endpoint, (b) include section content in the SSE response's `citations` event, (c) Server Component prop drilling. Option (a) matches the existing API pattern and is recommended. Planner must choose and task accordingly.

3. **`SNOW_FORM` version string:** Currently `version="live"` in `servicenow-form.md`. The freshness line format says `Form schema YYYY-MM-DD`. Planner must decide: update the source file's version attribute to a date string, OR derive the date from `fs.statSync(filepath).mtime` in the registry parser.

4. **Freshness line source:** CONTEXT.md says "sourced at build/request time from registry." If using an API endpoint (`/api/config`), the versions are request-time. If using Server Component props, build-time. Both are acceptable — planner should pick based on whether live version updates (without redeploy) are needed.

---

## Sources

### Primary (HIGH confidence — code inspection)
- `/c/kbroles/src/grounding/sources/kb0022991.md` — all 6 section IDs extracted directly
- `/c/kbroles/src/grounding/sources/kb0020882.md` — all 9 section IDs extracted directly
- `/c/kbroles/src/grounding/sources/servicenow-form.md` — all 7 section IDs extracted directly
- `/c/kbroles/src/grounding/registry.ts` — SECTION_RE regex and parseSource() behaviour confirmed
- `/c/kbroles/node_modules/@radix-ui/react-dialog/dist/index.d.ts` — `modal?: boolean` confirmed
- `/c/kbroles/node_modules/lucide-react/dist/esm/icons/` — Flag, Upload, Paperclip, Tags, FileText, ClipboardList, CircleOff all confirmed present
- `/c/kbroles/src/app/globals.css` — Tailwind v4 `@theme` pattern confirmed, existing colour variables
- `/c/kbroles/pnpm-lock.yaml` — exact installed versions for all packages
- `/c/kbroles/src/chat-ui/*.tsx` — all Phase 3 components read; Message.tsx fallback branch identified for replacement
- `/c/kbroles/tests-e2e/` — `page.addInitScript(() => sessionStorage.clear())` pattern confirmed

### Secondary (MEDIUM confidence — RFC + widely documented)
- RFC 2368 (mailto URL scheme) — body length limits
- Windows/Outlook CRLF requirement for mailto body — well-known cross-client compatibility requirement

---

## Metadata

**Confidence breakdown:**
- Section → colour map: HIGH — derived from actual file content
- Standard stack (no new deps): HIGH — node_modules inspected
- Architecture patterns: HIGH — based on actual component code read
- mailto encoding: MEDIUM — RFC-based, Outlook CRLF is well-documented
- Pitfalls: HIGH — derived from actual code + CONTEXT.md constraints

**Research date:** 2026-04-23
**Valid until:** 2026-05-23 (stable stack; source files unlikely to change)
