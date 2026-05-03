---
phase: quick-007
plan: 07
type: execute
wave: 1
depends_on: [quick-003, quick-005]
files_modified:
  - package.json
autonomous: true

must_haves:
  truths:
    - "`pnpm build` invokes Webpack, not Turbopack."
    - "`pnpm build` produces a working `.next/standalone/` bundle on Windows Server (no parseSource(undefined) crash during page-data collection)."
    - "All 733 unit tests stay green; no TypeScript change."
  artifacts:
    - path: "package.json"
      provides: "build script invokes `next build --webpack` to opt out of Turbopack default in Next 16.2.4."
  key_links:
    - from: "package.json scripts.build"
      to: "next build --webpack"
      via: "matches the Webpack `asset/source` rule already wired in next.config.ts:28-31"
      pattern: "next build --webpack"
---

<objective>
Sister fix to Quick 005 — extend the `--webpack` opt-out to the build script.

## What Quick 005 missed

Quick 005 fixed `pnpm dev` by adding `--webpack` to the dev script. The
working assumption at the time was that `next build` already used Webpack
(based on the prior CLI behavior in Next 15 and earlier). That assumption
was wrong: **Next.js 16.2.4 made Turbopack the default for `next build` too,
not just `next dev`.**

The bug only surfaced when the operator ran `pnpm build` on the prod Windows
Server (`D:\kbroles`) after pulling Quick 005 and Quick 006:

```
▲ Next.js 16.2.4 (Turbopack)             # ← banner during `next build`!
- Environments: .env.production
  Creating an optimized production build ...
  ✓ Compiled successfully in 8.2s
  ✓ Finished TypeScript in 7.2s
  Collecting page data using 3 workers  .TypeError: Cannot read properties of undefined (reading 'match')
    at t (D:\kbroles\.next\server\chunks\[root-of-the-server]__0ijpuzw._.js:1:1154)
    ...
> Build error occurred
Error: Failed to collect page data for /api/chat
```

Same root cause as Quick 005: Turbopack's `{ type: 'raw' }` rule for `*.md`
silently returns `undefined` under Next 16.2.4, so `parseSource(undefined)`
in `src/grounding/registry.ts:46` crashes during the page-data collection
phase of the build (when route modules are evaluated to discover their
data requirements).

## Why this didn't surface in CI / prior deploys

Suspected: prior deploys to D:\kbroles were either pre-built artifact
uploads (the untracked `kbassistant-build.tar.gz` / `.zip` files in the
repo's working tree are circumstantial evidence) or built by GHA which
may have been quietly failing since Quick 003 shipped on 2026-05-01.
A separate audit of recent GHA runs is recommended after this fix lands.

## Why not fix the Turbopack rule

Same rationale as Quick 005's decision-A: the next.config.ts:23-25 comment
already documents a prior failed attempt with `loaders: []` exhibiting the
same silent-undefined failure mode under Turbopack. The Next 16 raw-import
surface appears unstable. Webpack is the proven path — used successfully
by every prior production build of this codebase.

Output: A single fix commit on master modifying only package.json.
</objective>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/quick/005-force-webpack-for-pnpm-dev/005-SUMMARY.md
@next.config.ts
@src/grounding/registry.ts
</context>

<discovery_findings>

## Key facts verified before planning

1. **Next.js 16.2.4 `next build --help` lists `--webpack` as a build flag**:
   ```
   --turbo                Builds using Turbopack.
   --turbopack            Builds using Turbopack.
   --webpack              Builds using webpack.
   ```
   So the same opt-out mechanism works for `next build` as for `next dev`.

2. **Banner confirmation**: when invoked without flags, the build banner
   reads `▲ Next.js 16.2.4 (Turbopack)`. After `--webpack`, expect
   `▲ Next.js 16.2.4 (webpack)` — same convention as the dev banner.

3. **Webpack rule for .md files is already wired** in next.config.ts:28-31
   (the same rule that's been producing working production builds since
   Quick 003 — when the build path used Webpack by default in earlier
   Next.js versions).

4. **No code changes required outside package.json** — same as Quick 005.

</discovery_findings>

<tasks>

<task type="auto">
  <name>Task 1: Add --webpack flag to build script</name>
  <files>
    package.json
  </files>
  <action>
    Edit `package.json` script `build` from `"next build"` to `"next build --webpack"`.

    Verify locally (best-effort — full build can take 1-2 minutes):

    ```
    pnpm build
    # Banner should read "▲ Next.js 16.2.4 (webpack)"
    # Build should complete with "✓ Compiled successfully" and produce
    # .next/standalone/ without crashing during page-data collection.
    ```

    Run unit tests + typecheck (both should be unchanged from baseline):

    ```
    pnpm typecheck
    pnpm test
    ```

    Commit:

    ```
    fix(build): force Webpack for `next build` to restore .md raw-import resolution

    Sister fix to quick-005. Quick 005 added --webpack to the dev script
    on the assumption that `next build` already used Webpack. That
    assumption was wrong — Next.js 16.2.4 made Turbopack the default for
    `next build` too, not just `next dev`.

    Surfaced when the operator ran `pnpm build` on the prod Windows
    Server (D:\kbroles) after pulling quick-005 + quick-006:
      ▲ Next.js 16.2.4 (Turbopack)
      Collecting page data using 3 workers  .TypeError: Cannot read properties of undefined (reading 'match')
      ...
      Failed to collect page data for /api/chat

    Same parseSource(undefined) crash chain as quick-005: Turbopack's
    `{ type: 'raw' }` rule for *.md silently returns undefined under
    Next 16.2.4, so registry.ts crashes at page-data collection time.

    The Webpack rule (next.config.ts:28-31 asset/source) is the proven
    path that's been producing working production bundles since quick-003.

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
    - `pnpm build` banner reads `▲ Next.js 16.2.4 (webpack)`.
    - `pnpm build` completes with `✓ Compiled successfully` and produces
      `.next/standalone/server.js`.
    - `git diff HEAD~1 HEAD` shows ONLY a one-line change in `package.json`.
  </verify>
  <done>
    - Single-line commit on master modifying only `package.json scripts.build`.
    - Operator can run `pnpm build` on the prod server without the EBUSY +
      parseSource(undefined) sequence and produce a working standalone bundle.
  </done>
</task>

</tasks>

<success_criteria>
- [x] `pnpm build` boots in Webpack mode (banner confirms)
- [x] Build produces `.next/standalone/` without crash during page-data collection
- [x] All 733 unit tests stay green
- [x] Typecheck clean
- [x] Single-file commit on master (`package.json` only)
- [x] Co-Authored-By trailer: `Claude Opus 4.7 (1M context)`
</success_criteria>

<output>
After completion, create `.planning/quick/007-force-webpack-for-pnpm-build/007-SUMMARY.md`.
</output>
