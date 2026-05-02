---
phase: quick-005
plan: 05
type: execute
wave: 1
depends_on: [quick-003]
files_modified:
  - package.json
autonomous: true

must_haves:
  truths:
    - "`pnpm dev` boots Next.js in Webpack mode, not Turbopack."
    - "`pnpm dev` + POST /api/chat returns SSE frames (200), not a 500 from a failed `parseSource(undefined)` at module load."
    - "`pnpm build` (production standalone) is unchanged — already used Webpack via the next.config.ts webpack(config) function."
    - "All 733 unit tests stay green; no TypeScript change required."
  artifacts:
    - path: "package.json"
      provides: "dev script invokes `next dev --webpack` to opt out of Turbopack default in Next 16.2.4."
  key_links:
    - from: "package.json scripts.dev"
      to: "next dev --webpack"
      via: "matches the Webpack `asset/source` rule already wired in next.config.ts:28-31 for prod build"
      pattern: "next dev --webpack"
---

<objective>
Restore `pnpm dev` after a regression introduced by Quick 003 (commit 2e5a957
"inline KB markdown at build time"). That change replaced runtime `readFileSync`
calls with build-time `import x from './x.md'` static imports, with three
loaders for three contexts:

1. Webpack `asset/source` for `next build` (production standalone) — works.
2. Vitest `rawMarkdown` plugin for unit tests — works.
3. tsx ESM loader hook (`scripts/md-loader.mjs`) for `pnpm smoke` — works.
4. Turbopack `'*.md': { type: 'raw' }` for `next dev` — **silently returns
   `undefined`**, causing `parseSource(undefined)` to crash with
   `TypeError: Cannot read properties of undefined (reading 'match')` at
   `src/grounding/registry.ts:46` during module evaluation. Every `/api/chat`
   request returns 500 in dev.

The bug surfaced during diagnostic work on the failing Author chip "What
fields do I need to fill in on the form?" (see Quick 006). The standalone
production bundle is unaffected because GHA `next build` uses Webpack — that
path inlines the .md content correctly. Local dev was just never re-tested
after Quick 003 shipped.

Two viable fixes:

- **Option A (chosen):** Add `--webpack` to the dev script. `next dev --webpack`
  uses the Webpack rule path that already works in prod, eliminating the
  loader divergence between local dev and production.
- **Option B (rejected):** Find the correct Turbopack rule shape for raw .md
  imports in Next 16.2.4 and replace `{ type: 'raw' }`. Rejected because
  (a) the comment in next.config.ts:23-25 already documents that the prior
  attempt with `loaders: []` silently failed in the same way, suggesting the
  Turbopack raw-import surface in Next 16 is unstable; (b) using Webpack
  matches the production loader path, eliminating any future divergence
  between dev and prod behavior; (c) Webpack dev startup is ~393ms vs
  Turbopack's ~473ms — no meaningful speed difference at this project size.

Trade-off accepted: hot-reload performance under Webpack may degrade as the
codebase grows; if that becomes user-visible, revisit Option B.

Output: A single commit on master modifying only package.json.
</objective>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/quick/003-fix-pilot-deploy-workarounds-into-real-fixes/003-SUMMARY.md
@next.config.ts
@src/grounding/registry.ts
</context>

<discovery_findings>

## Key facts verified before planning

1. **Next.js 16.2.4 supports `--webpack` flag for `next dev`** (verified via
   `pnpm exec next dev --help`):
   ```
   --turbo                Starts development mode using Turbopack.
   --turbopack            Starts development mode using Turbopack.
   --webpack              Starts development mode using webpack.
   ```

2. **Next 16 defaults `next dev` to Turbopack** when no flag is passed. Confirmed
   via dev startup banner: `▲ Next.js 16.2.4 (Turbopack)` before the change.
   After the change: `▲ Next.js 16.2.4 (webpack)`.

3. **Webpack rule for .md files already exists** in next.config.ts:28-31:
   ```ts
   webpack(config) {
     config.module.rules.push({ test: /\.md$/, type: 'asset/source' })
     return config
   }
   ```
   This rule is exercised by `next build` (production standalone) and produces
   working .md inlining. Dev mode under `--webpack` reuses the same rule.

4. **Turbopack rule format is the suspect** — next.config.ts:19-27 has:
   ```ts
   turbopack: { rules: { '*.md': { type: 'raw' } } }
   ```
   The inline comment already documents that an earlier attempt with
   `loaders: []` "silently fails, returning undefined for `.md` imports" —
   `{ type: 'raw' }` was the supposed fix but is exhibiting the same failure
   mode against Next 16.2.4. Investigating the correct shape is OUT of scope
   for this task; we sidestep it entirely by using Webpack.

5. **No code changes required outside package.json** — the .md import
   statements in `src/grounding/registry.ts:11-13` and the parser in
   `src/grounding/registry.ts:36-71` are unchanged. The only thing changing
   is which build tool resolves the imports at dev time.

6. **No test changes required** — the test suite uses Vitest with its own
   `rawMarkdown` plugin (independent of both Turbopack and Webpack).

</discovery_findings>

<tasks>

<task type="auto">
  <name>Task 1: Add --webpack flag to dev script</name>
  <files>
    package.json
  </files>
  <action>
    Edit `package.json` script `dev` from `"next dev"` to `"next dev --webpack"`.
    No other scripts change. No dependencies change.

    Verify dev server boots and serves /api/chat:

    ```
    pnpm dev   # in one terminal — wait for "✓ Ready in <ms>"
    # In another terminal:
    curl -sN -X POST http://localhost:3000/api/chat \
      -H "Content-Type: application/json" \
      -d '{"role":"author","messages":[{"role":"user","content":"How do I flag an article?"}]}' \
      --max-time 60
    ```

    Expect SSE frames (`data: {"type":"message_id",...}` followed by either
    `answer_delta + citations + done` or `fallback`). Do NOT expect a 500.

    Run the unit suite to confirm no regression:

    ```
    pnpm typecheck
    pnpm test
    ```

    Commit:

    ```
    fix(dev): force Webpack for `next dev` to restore .md raw-import resolution

    Quick 003's switch to build-time `import x from './x.md'` works under
    Webpack (next build, the production standalone path) and tsx (pnpm smoke,
    via scripts/md-loader.mjs), but Turbopack's `{ type: 'raw' }` rule
    silently returns undefined under Next 16.2.4. parseSource(undefined)
    then crashes at module load (src/grounding/registry.ts:46), 500ing every
    /api/chat request in dev.

    Adding --webpack matches the prod build loader path (next.config.ts:28-31
    `asset/source`), eliminating the loader divergence between dev and prod.
    No code changes — the .md imports and parser are unchanged.

    Surfaced during diagnostic work on the failing Author chip "What fields
    do I need to fill in on the form?" (see quick-006). Production bundle
    unaffected; only local dev was broken.

    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
    ```

    Push:
    ```
    git push origin master
    ```
  </action>
  <verify>
    - `pnpm typecheck` exits 0.
    - `pnpm test` shows 733 pass.
    - `pnpm dev` banner reads `▲ Next.js 16.2.4 (webpack)`.
    - `curl POST /api/chat` returns SSE frames, not 500.
    - `git diff HEAD~1 HEAD` shows ONLY a one-line change in `package.json`.
  </verify>
  <done>
    - Single-line commit on master modifying only `package.json scripts.dev`.
    - Dev server compiles and serves `/api/chat` successfully.
    - Production bundle path (`next build`) is unchanged.
  </done>
</task>

</tasks>

<success_criteria>
- [x] `pnpm dev` boots in Webpack mode (banner confirms)
- [x] POST /api/chat returns 200 + SSE frames (no module-load 500)
- [x] All 733 unit tests stay green
- [x] Typecheck clean
- [x] Single-file commit on master (`package.json` only)
- [x] Co-Authored-By trailer: `Claude Opus 4.7 (1M context)`
</success_criteria>

<output>
After completion, create `.planning/quick/005-force-webpack-for-pnpm-dev/005-SUMMARY.md`.
</output>
