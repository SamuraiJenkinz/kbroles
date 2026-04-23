---
phase: 3
plan: 1
name: scaffold-ui-stack
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - pnpm-lock.yaml
  - postcss.config.mjs
  - vitest.config.mts
  - playwright.config.ts
  - src/app/layout.tsx
  - src/app/page.tsx
  - src/app/globals.css
  - src/app/providers.tsx
  - tests-e2e/.gitkeep
  - .gitignore
autonomous: true

must_haves:
  truths:
    - "pnpm dev serves http://localhost:3000 and renders a visible skeleton without hydration warnings (Pitfall 6 — no Date.now()/Math.random() in server-rendered markup)"
    - "Tailwind v4 utility classes resolve (text-sm, bg-white, rounded-md etc) via @import 'tailwindcss' in globals.css — no tailwind.config.js required"
    - "Radix Tooltip.Provider is mounted at the app root so any descendant Tooltip.Root has a default delayDuration applied"
    - "lucide-react icon imports resolve (User, Pencil, Send, Square, RefreshCw, Copy, ThumbsUp, ThumbsDown, AlertTriangle, Info — the full Phase-3 vocabulary) with tree-shaken SVG output"
    - "pnpm typecheck passes with JSX, DOM lib, and Radix type imports all resolved"
    - "pnpm test runs (224+) existing node-env tests without regression; new jsdom-tagged test files can run alongside via per-file docblock"
    - "pnpm exec playwright test executes (even against an empty spec suite) after playwright.config.ts + chromium install"
    - ".gitignore excludes test-results/, playwright-report/, and /.next as expected"
  artifacts:
    - path: "package.json"
      provides: "Tailwind v4, Radix primitives (dialog/tooltip/radio-group/popover), lucide-react, clsx, tailwind-merge in deps; @testing-library/react + @testing-library/user-event + @vitejs/plugin-react + jsdom + @playwright/test in devDeps"
      contains: "@radix-ui/react-dialog"
    - path: "postcss.config.mjs"
      provides: "@tailwindcss/postcss plugin wiring so Next builds Tailwind utilities"
      min_lines: 3
    - path: "vitest.config.mts"
      provides: "React JSX transform plugin added so .tsx files with JSX compile under vitest; rawMarkdown plugin preserved"
      contains: "plugin-react"
    - path: "playwright.config.ts"
      provides: "Playwright config targeting pnpm dev on :3000; chromium project"
      min_lines: 15
    - path: "src/app/layout.tsx"
      provides: "Root server layout — html/body, globals.css import, lang='en', suppressHydrationWarning only where justified"
      min_lines: 15
    - path: "src/app/globals.css"
      provides: "@import 'tailwindcss'; + @theme block with baseline tokens (background, foreground, consumer-green, author-purple, neutral-card)"
      min_lines: 20
    - path: "src/app/providers.tsx"
      provides: "'use client' wrapper mounting Radix <Tooltip.Provider delayDuration={300}> around children"
      min_lines: 8
    - path: "src/app/page.tsx"
      provides: "Placeholder server component rendering a skeleton card — replaced by ChatPage orchestrator in Plan 05"
      min_lines: 10
  key_links:
    - from: "src/app/layout.tsx"
      to: "src/app/globals.css"
      via: "import './globals.css'"
      pattern: "import.*globals\\.css"
    - from: "src/app/layout.tsx"
      to: "src/app/providers.tsx"
      via: "wraps {children} in <Providers>"
      pattern: "Providers"
    - from: "src/app/providers.tsx"
      to: "@radix-ui/react-tooltip"
      via: "Tooltip.Provider import"
      pattern: "@radix-ui/react-tooltip"
    - from: "vitest.config.mts"
      to: "@vitejs/plugin-react"
      via: "plugins: [react(), tsconfigPaths(), rawMarkdown]"
      pattern: "plugin-react|react\\(\\)"
    - from: "postcss.config.mjs"
      to: "@tailwindcss/postcss"
      via: "plugins: {'@tailwindcss/postcss': {}}"
      pattern: "@tailwindcss/postcss"
---

<objective>
Bring the UI stack online. The repo currently has zero client UI — no layout.tsx, no CSS, no component test infra, no E2E infra. This plan installs every dependency Phase 3 needs, wires configs (postcss, vitest with React plugin, Playwright), and creates the root app shell (layout + globals.css + providers + placeholder page) so that `pnpm dev` renders a visible skeleton at http://localhost:3000 without hydration warnings.

Purpose: every downstream Phase-3 plan imports from `@radix-ui/react-*`, `lucide-react`, Tailwind utilities, `@testing-library/react`, and eventually runs Playwright specs. Without this plan there is nothing for them to build on. This plan is the **entry gate** for Plans 02–06.

Output: deps installed, configs wired, root shell rendering, pnpm test + pnpm dev + pnpm exec playwright all functional.
</objective>

<execution_context>
@C:\Users\taylo\.claude/get-shit-done/workflows/execute-plan.md
@C:\Users\taylo\.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
Phase 3 builds the first UI layer on top of a complete Phase-2 backend. The backend exposes two wire contracts (`POST /api/chat` SSE + `GET /api/prompts`) documented at `docs/api-chat-contract.md`. This plan does NOT touch those endpoints.

Before starting, read:

@.planning/phases/03-role-experience-and-chat-ui/03-CONTEXT.md  (§Claude's Discretion — stack choices confirmed by RESEARCH.md)
@.planning/phases/03-role-experience-and-chat-ui/03-RESEARCH.md  (§Standard Stack — authoritative dep list + versions; §Architecture Patterns — project structure; §State of the Art — Tailwind v4 CSS-first)
@docs/api-chat-contract.md  (no direct import — just awareness that Plan 03+ will fetch /api/chat from the client)

@package.json                  (current deps — preserve server-only entries)
@vitest.config.mts             (rawMarkdown plugin — KEEP; add React plugin alongside)
@next.config.ts                (serverExternalPackages pino — preserve; do not modify)
@tsconfig.json                 (strict, bundler resolution, @/* alias — already configured for UI)

**Stack (LOCKED — RESEARCH.md §Standard Stack):**
- Tailwind CSS v4 (CSS-first, no tailwind.config.js)
- Radix Primitives: @radix-ui/react-dialog, @radix-ui/react-tooltip, @radix-ui/react-radio-group, @radix-ui/react-popover
- lucide-react (icons)
- clsx + tailwind-merge (Pitfall 7 — class conflict resolution for dynamic bubble styling)
- @testing-library/react + @testing-library/user-event + @vitejs/plugin-react + jsdom (component tests, per-file docblock env)
- @playwright/test (E2E — Plan 06)

**Package manager:** pnpm (matches repo). Use `pnpm add` / `pnpm add -D`.

**Anti-patterns to avoid:**
- Do NOT flip vitest.config.mts `environment` from 'node' to 'jsdom' globally — the 224 existing backend tests rely on node env for perf; UI tests use per-file `// @vitest-environment jsdom` docblock (RESEARCH §Testing split).
- Do NOT create a tailwind.config.js — Tailwind v4 is CSS-first; theme tokens live in `@theme { ... }` inside globals.css.
- Do NOT add a tailwind.config.ts "for compatibility" — v4 actively removed the JS config file (RESEARCH §State of the Art).
- Do NOT use Date.now() or Math.random() in src/app/page.tsx body (Pitfall 6 — SSR/CSR hydration mismatch). The placeholder is static markup.
</context>

<tasks>

<task type="auto">
  <name>Task 1.1: Install deps + wire postcss + vitest-react + Playwright</name>
  <files>package.json, pnpm-lock.yaml, postcss.config.mjs, vitest.config.mts, playwright.config.ts, tests-e2e/.gitkeep, .gitignore</files>
  <action>
    1. **Install runtime deps** (pnpm add):
       ```
       pnpm add @radix-ui/react-dialog @radix-ui/react-tooltip @radix-ui/react-radio-group @radix-ui/react-popover lucide-react clsx tailwind-merge
       ```

    2. **Install devDeps** (pnpm add -D):
       ```
       pnpm add -D tailwindcss @tailwindcss/postcss postcss @testing-library/react @testing-library/user-event @vitejs/plugin-react jsdom @playwright/test
       ```
       Then run: `pnpm exec playwright install --with-deps chromium` (installs the chromium browser binary; `--with-deps` attempts to install OS-level system deps but on Windows it is a no-op — proceed regardless).

    3. **Create `postcss.config.mjs`** (Tailwind v4 requires the new @tailwindcss/postcss plugin, NOT the legacy `tailwindcss` PostCSS entry):
       ```js
       export default {
         plugins: {
           '@tailwindcss/postcss': {},
         },
       }
       ```

    4. **Update `vitest.config.mts`** — add `@vitejs/plugin-react` to plugins array. Keep rawMarkdown and tsconfigPaths. Keep `environment: 'node'` as the default (per-file `// @vitest-environment jsdom` docblock will override for UI tests — this is the documented Vitest pattern; ADR: RESEARCH §Open Questions Q3 — docblock chosen over Vitest projects because Phase-3 UI tests stay well under 30 files).

       ```ts
       import react from '@vitejs/plugin-react'
       // ...
       export default defineConfig({
         plugins: [react(), tsconfigPaths(), rawMarkdown],
         test: {
           environment: 'node',
           include: ['src/**/__tests__/**/*.test.ts', 'src/**/__tests__/**/*.test.tsx', 'scripts/**/__tests__/**/*.test.ts'],
         },
       })
       ```

       Note: widen `include` to match `.test.tsx` (Phase-3 component tests).

    5. **Create `playwright.config.ts`** at repo root:
       ```ts
       import { defineConfig, devices } from '@playwright/test'

       export default defineConfig({
         testDir: './tests-e2e',
         fullyParallel: true,
         forbidOnly: !!process.env.CI,
         retries: process.env.CI ? 2 : 0,
         reporter: 'list',
         use: {
           baseURL: 'http://localhost:3000',
           trace: 'on-first-retry',
         },
         webServer: {
           command: 'pnpm dev',
           url: 'http://localhost:3000',
           reuseExistingServer: !process.env.CI,
           timeout: 120_000,
         },
         projects: [
           { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
         ],
       })
       ```

    6. **Create `tests-e2e/.gitkeep`** (empty; Plan 06 adds specs into this directory).

    7. **Update `.gitignore`** — append if not already present:
       ```
       # Playwright
       /test-results/
       /playwright-report/
       /blob-report/
       /playwright/.cache/
       ```
       Verify `.next/` is already ignored (it should be from the Next.js scaffold).

    8. **Add scripts to package.json** `"scripts"` block:
       - `"test:e2e": "playwright test"`
       - Keep all existing scripts intact.

    9. **Commit:** `chore(phase-3/plan-01): install Tailwind v4 + Radix + lucide + testing infra + Playwright`.
  </action>
  <verify>
    - `pnpm install` exits 0 after lockfile update.
    - `pnpm typecheck` passes (no type errors introduced).
    - `pnpm test` still green — expect 224+ tests passing (no UI tests yet; node env preserved).
    - `pnpm exec playwright test --list` lists 0 tests without error (proves config loads).
    - `ls node_modules/@radix-ui/react-dialog/dist` shows built files.
    - `ls node_modules/@tailwindcss/postcss` exists.
  </verify>
  <done>
    All Phase-3 deps are installed and resolvable. PostCSS + Tailwind v4 are wired. Vitest runs with the React plugin available. Playwright config exists and lists specs. No regressions in existing test suite.
  </done>
</task>

<task type="auto">
  <name>Task 1.2: Root app shell — layout.tsx, globals.css, providers.tsx, placeholder page.tsx</name>
  <files>src/app/layout.tsx, src/app/globals.css, src/app/providers.tsx, src/app/page.tsx</files>
  <action>
    1. **Create `src/app/globals.css`** — Tailwind v4 CSS-first entry + theme tokens:
       ```css
       @import "tailwindcss";

       @theme {
         /* Neutral surfaces */
         --color-background: #f7f7f8;
         --color-foreground: #111827;
         --color-neutral-card: #ffffff;
         --color-neutral-border: #e5e7eb;
         --color-neutral-muted: #6b7280;

         /* Role accents (LOCKED by ROLE-03 / Pitfall 16 — always paired with icon) */
         --color-consumer-600: #16a34a;  /* green-600 */
         --color-consumer-50:  #f0fdf4;  /* green-50  */
         --color-author-600:   #9333ea;  /* purple-600 */
         --color-author-50:    #faf5ff;  /* purple-50  */

         /* Accent for user bubble */
         --color-primary: #2563eb;  /* blue-600 */

         /* Warning for error card */
         --color-warning-600: #d97706;  /* amber-600 */
         --color-warning-50:  #fffbeb;  /* amber-50  */

         /* Spacing scale additions if needed — defaults carry over */
         --radius-bubble: 12px;
       }

       html, body { height: 100%; }
       body {
         background: var(--color-background);
         color: var(--color-foreground);
         font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
         -webkit-font-smoothing: antialiased;
       }

       /* Focus ring baseline (WCAG 2.1 AA) */
       :focus-visible {
         outline: 2px solid var(--color-primary);
         outline-offset: 2px;
       }
       ```

       Tokens chosen here are referenced by every subsequent plan. The names `consumer-*` and `author-*` are the canonical colour-role pairing (Pitfall 16 always pairs these with an icon).

    2. **Create `src/app/providers.tsx`** — `'use client'` wrapper mounting Radix Tooltip.Provider:
       ```tsx
       'use client'
       import * as Tooltip from '@radix-ui/react-tooltip'
       import type { ReactNode } from 'react'

       export function Providers({ children }: { children: ReactNode }) {
         return (
           <Tooltip.Provider delayDuration={300} skipDelayDuration={100}>
             {children}
           </Tooltip.Provider>
         )
       }
       ```
       Every Phase-3 component tree will be mounted under this provider so Tooltip.Root instances (Timestamp, role pill, etc.) inherit the delay config.

    3. **Create `src/app/layout.tsx`** — root server component (Next.js App Router requires this file):
       ```tsx
       import type { ReactNode } from 'react'
       import { Providers } from './providers'
       import './globals.css'

       export const metadata = {
         title: 'KB Assistant',
         description: 'Ask about KB articles, flagging, feedback, and the CTSS knowledge workflow.',
       }

       export default function RootLayout({ children }: { children: ReactNode }) {
         return (
           <html lang="en">
             <body>
               <Providers>{children}</Providers>
             </body>
           </html>
         )
       }
       ```

    4. **Create `src/app/page.tsx`** — placeholder server component that Plan 05 will replace with `<ChatPage />`. For now render a static skeleton so `pnpm dev` has something to show and hydration is clean (Pitfall 6 — no Date.now/Math.random in render body):
       ```tsx
       // PHASE-3 PLAN-01: placeholder root page.
       // Plan 05 replaces this with the ChatPage orchestrator ('use client').

       export default function HomePage() {
         return (
           <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center p-6">
             <div className="rounded-xl border border-neutral-border bg-neutral-card p-8 shadow-sm">
               <h1 className="text-xl font-semibold text-foreground">KB Assistant</h1>
               <p className="mt-2 text-sm text-neutral-muted">
                 UI coming online — Phase 3 scaffolding in progress.
               </p>
             </div>
           </main>
         )
       }
       ```

       Note: uses Tailwind utility classes that reference the @theme tokens (e.g. `bg-neutral-card`, `text-neutral-muted`). If Tailwind v4 classname generation is working, these resolve; if Tailwind is broken, the page renders unstyled — easy visual smoke.

    5. **Commit:** `feat(phase-3/plan-01): add root app shell — layout, globals.css, providers, placeholder page`.
  </action>
  <verify>
    - `pnpm typecheck` passes.
    - `pnpm dev` starts without errors; visiting http://localhost:3000 renders the skeleton card with styled text (background, border, rounded corners visible — confirms Tailwind is compiling); open browser devtools Console and confirm NO hydration warnings ("Warning: Text content did not match..." or "Hydration failed...").
    - `pnpm test` — no regression; still 224+ passing.
    - View-source the rendered HTML — confirm the `<html lang="en">` and `<body>` are present and the Providers-wrapped tree renders {children}.
  </verify>
  <done>
    Navigating to http://localhost:3000 shows a styled skeleton card with no console errors. Tailwind v4 is compiling. Radix Tooltip.Provider mounted at root. layout + globals + providers + placeholder all in place. Plan 05 has a clear hand-off point (page.tsx body replacement).
  </done>
</task>

</tasks>

<verification>
  - `pnpm install` clean.
  - `pnpm typecheck` clean (no errors from @radix-ui/* or @testing-library/* or lucide-react type imports resolving).
  - `pnpm test` green — 224+ existing tests all pass (no regressions from vitest.config.mts edit).
  - `pnpm dev` serves http://localhost:3000 with a visibly-styled skeleton card and zero console errors (especially NO hydration warnings).
  - `pnpm exec playwright test --list` prints "0 tests" cleanly (proves playwright.config.ts loads).
  - View-source inspection: `<link>` or injected CSS contains a Tailwind utility rule for `bg-neutral-card` or similar (proves @tailwindcss/postcss ran).
  - Radix Tooltip.Provider visible in the React component tree (via React DevTools in a browser — OPTIONAL manual check; not a hard gate).
</verification>

<success_criteria>
Phase-3 SC #1 dependency — the landing experience cannot render without a root app shell. This plan delivers the shell.
Phase-3 SC #2–#5 dependency — all subsequent plans assume Tailwind utility classes resolve, Radix primitives are importable, and component tests can run under jsdom. This plan makes all three true.

Coverage:
- RESEARCH §Standard Stack: every listed dep installed at the recommended version range.
- RESEARCH §Pattern 4 (SSR-safe): the root page.tsx is a server component with static markup — no sessionStorage read in render, no Date.now in body (Pitfall 6 guardrail).
- RESEARCH §Testing split: vitest remains node-env by default; React plugin is added so UI tests can compile when individual test files opt into jsdom via docblock (Plan 03+).
- CONTEXT §Claude's Discretion: Tailwind + Radix + lucide + local state — all confirmed here by install.
</success_criteria>

<output>
After completion, create `.planning/phases/03-role-experience-and-chat-ui/03-01-SUMMARY.md`. Capture:
- Exact versions installed (from pnpm-lock.yaml) for Tailwind, Radix primitives, lucide-react, Playwright, RTL, user-event, jsdom, @vitejs/plugin-react.
- `pnpm test` total count (should be equal to the entering 224 — no new tests yet, no regressions).
- Screenshot description of `pnpm dev` output (styled skeleton, zero console warnings).
- Playwright version + `playwright.config.ts` webServer setup confirmed.
- Flag known-ok tradeoffs: vitest include glob now matches `.test.tsx` files; per-file docblock `// @vitest-environment jsdom` is the documented pattern for UI tests starting Plan 03.
</output>
