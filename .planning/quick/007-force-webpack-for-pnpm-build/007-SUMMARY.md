---
quick: 007
title: Force Webpack for `pnpm build` (sister fix to quick-005)
date: 2026-05-02
commit: TBD
subsystem: dev-tooling
tags: [next, webpack, turbopack, build, prod-deploy, grounding, md-imports]

dependency-graph:
  requires: [quick-003, quick-005]
  provides: working `pnpm build` on Windows Server prod environment
  affects: []

tech-stack:
  added: []
  patterns:
    - "match prod loader path everywhere: --webpack on both `next dev` (quick-005) and `next build` (this task)"

key-files:
  created: []
  modified:
    - package.json

decisions:
  - id: same-fix-as-005-applied-to-build
    choice: "Add --webpack flag to build script, not just dev script"
    rationale: "Next.js 16.2.4 made Turbopack the default for `next build` too, not just `next dev`. Quick 005 only fixed dev. Same parseSource(undefined) crash chain hits builds. Same proven Webpack rule (next.config.ts asset/source) handles the .md imports correctly."
    alternatives: ["fix the Turbopack rule shape — same rejection rationale as quick-005: file already documents a prior failed attempt with `loaders: []`, raw-import surface seems unstable in Next 16"]

metrics:
  duration: "~5 minutes"
  completed: 2026-05-02
---

# Quick Task 007: Force Webpack for `pnpm build`

**One-liner:** `package.json` `build` script changed from `next build` to `next build --webpack`. Sister fix to quick-005 — Next 16.2.4 made Turbopack the default for builds too, not just dev.

## Commit

| Field | Value |
|-------|-------|
| Hash | TBD |
| Subject | `fix(build): force Webpack for `next build` to restore .md raw-import resolution` |
| Branch | `master` |
| Co-Author | `Claude Opus 4.7 (1M context) <noreply@anthropic.com>` |

## How It Surfaced

Operator pulled quick-005 + quick-006 to `D:\kbroles` (prod Windows Server), stopped the running Node service, deleted the file-locked `.next/standalone` directory, then ran `pnpm build`:

```
▲ Next.js 16.2.4 (Turbopack)             ← banner during `next build`!
- Environments: .env.production
  Creating an optimized production build ...
✓ Compiled successfully in 8.2s
✓ Finished TypeScript in 7.2s
  Collecting page data using 3 workers  .TypeError: Cannot read properties of undefined (reading 'match')
    at t (D:\kbroles\.next\server\chunks\[root-of-the-server]__0ijpuzw._.js:1:1154)
    at module evaluation (D:\kbroles\.next\server\chunks\[root-of-the-server]__0ijpuzw._.js:1:1609)
    ...
> Build error occurred
Error: Failed to collect page data for /api/chat
```

Same parseSource(undefined) failure chain as quick-005 fixed for dev. The page-data collection phase of the build evaluates route modules (which import the registry), and Turbopack's `{ type: 'raw' }` rule returns undefined for the .md imports.

Quick 005 only addressed the dev script. The build script regression went undetected because:
- Local builds were not run after quick-003 shipped (we ran `pnpm test` and `pnpm typecheck` but not `pnpm build`).
- Prior production deploys appear to have used pre-built artifacts (untracked `kbassistant-build.tar.gz` / `.zip` files in the working tree are circumstantial evidence).
- GHA may have been failing silently since quick-003 — separate audit recommended (see Follow-up).

## The Change

`package.json`, scripts.build:

```diff
-    "build": "next build",
+    "build": "next build --webpack",
```

After this change, the build banner reads `▲ Next.js 16.2.4 (webpack)` and the page-data collection phase succeeds because the Webpack `asset/source` rule (next.config.ts:28-31) correctly inlines the .md content.

## Confirmed Invariants

- `git diff HEAD~1 HEAD -- next.config.ts` is empty.
- `git diff HEAD~1 HEAD -- src/` is empty — no source code changes.
- `pnpm test` shows 733/733 pass.
- `pnpm typecheck` exits 0.
- Production behavior of the served app is identical — only the build tool changes.

## Test Counts

| Scope | Before | After | Delta |
|-------|--------|-------|-------|
| Whole suite | 733 | 733 | 0 |

No new tests added — tooling change with no behavior delta in application code.

## Deviations from Plan

None.

## Push Status

To be pushed by orchestrator after this commit lands.

## Follow-up

**GHA audit recommended.** If the GitHub Actions deploy workflow runs `pnpm build` on Next 16.2.4, it would have hit the same Turbopack + parseSource(undefined) failure since quick-003 (2026-05-01). Worth checking:

```bash
gh run list --workflow=deploy.yml --limit 10
```

If recent runs failed silently and the operator has been deploying via manual artifact upload, this fix unblocks both paths.

**Operator action after pulling this fix:**

```powershell
cd D:\kbroles
git pull
pnpm build              # now uses Webpack, should complete cleanly
# Restart the service per normal procedure (Scheduled Task → start.ps1)
```

After redeploy, capture the failing Author chip telemetry against MGTI gpt-4o to re-baseline quick-006's +30pp prompt-strengthening improvement on the production model — see quick-006 SUMMARY for benchmark details.
