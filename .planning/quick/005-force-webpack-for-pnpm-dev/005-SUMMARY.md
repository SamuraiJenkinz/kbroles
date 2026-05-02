---
quick: 005
title: Force Webpack for `pnpm dev` to restore .md raw-import resolution
date: 2026-05-02
commit: e7e6870
subsystem: dev-tooling
tags: [next, webpack, turbopack, dev-server, grounding, md-imports]

dependency-graph:
  requires: [quick-003]
  provides: working `pnpm dev` for local diagnostic + iteration work
  affects: [quick-006]

tech-stack:
  added: []
  patterns:
    - "match prod loader path in dev: avoid Webpack/Turbopack loader divergence by using --webpack for `next dev`"

key-files:
  created: []
  modified:
    - package.json

decisions:
  - id: webpack-not-turbopack
    choice: "Force Webpack for `next dev` via --webpack flag"
    rationale: "Quick 003's `import x from './x.md'` works under Webpack (already used by `next build` standalone). Turbopack's `{ type: 'raw' }` rule silently returns undefined in Next 16.2.4, crashing parseSource(undefined) at module load. Adding --webpack matches the prod loader path and sidesteps the unstable Turbopack raw-import surface."
    alternatives: ["fix the Turbopack rule shape — rejected because the file already documents a prior failed attempt with `loaders: []`, the Next 16 raw-import surface seems unstable, and Webpack-mode dev startup is comparable speed (~393ms vs ~473ms)"]

metrics:
  duration: "~5 minutes"
  completed: 2026-05-02
---

# Quick Task 005: Force Webpack for `pnpm dev`

**One-liner:** `package.json` `dev` script changed from `next dev` to `next dev --webpack`, restoring `/api/chat` after Quick 003's build-time .md imports broke under Turbopack.

## Commit

| Field | Value |
|-------|-------|
| Hash | `e7e6870` |
| Subject | `fix(dev): force Webpack for `next dev` to restore .md raw-import resolution` |
| Branch | `master` |
| Co-Author | `Claude Opus 4.7 (1M context) <noreply@anthropic.com>` |

## The Bug

Quick 003 (commit `2e5a957`) replaced runtime `readFileSync` calls with build-time
static imports:

```ts
// src/grounding/registry.ts:11-13
import kb0020882Raw from './sources/kb0020882.md'
import kb0022991Raw from './sources/kb0022991.md'
import snowFormRaw from './sources/servicenow-form.md'
```

Three loaders were configured to handle the imports across the three runtime
contexts:

| Context | Loader | Status |
|---------|--------|--------|
| `next build` (production standalone) | Webpack `{ test: /\.md$/, type: 'asset/source' }` | ✅ works |
| `pnpm test` (Vitest) | `rawMarkdown` plugin in `vitest.config.mts` | ✅ works |
| `pnpm smoke` (tsx) | ESM loader hook in `scripts/md-loader.mjs` | ✅ works |
| `pnpm dev` (Next 16.2.4 Turbopack default) | Turbopack `{ '*.md': { type: 'raw' } }` | ❌ returns `undefined` |

Result: `parseSource(undefined)` crashed at module load with
`TypeError: Cannot read properties of undefined (reading 'match')` at
`src/grounding/registry.ts:46`, 500ing every `/api/chat` request in dev.

Production bundle was unaffected because GHA `next build` uses the Webpack
path. The regression was invisible until local dev was needed for diagnostic
work on the failing Author chip (Quick 006).

## The Fix

One-line change in `package.json`:

```diff
-    "dev": "next dev",
+    "dev": "next dev --webpack",
```

`next dev --webpack` opts out of the Next 16 Turbopack default and uses the
same Webpack rule path that `next build` already uses successfully.

## Verification

```
$ pnpm dev
▲ Next.js 16.2.4 (webpack)        # was "(Turbopack)" before
- Local:         http://localhost:3000
✓ Ready in 393ms                  # was 473ms with Turbopack — comparable

$ curl -sN -X POST http://localhost:3000/api/chat \
    -H "Content-Type: application/json" \
    -d '{"role":"author","messages":[{"role":"user","content":"How do I flag an article?"}]}'
data: {"type":"message_id","id":"..."}
data: {"type":"answer_delta","text":"..."}
data: {"type":"citations","citations":[...]}
data: {"type":"done","can_answer":true,"validator_flips":0}
```

200 OK + SSE frames as expected. No module-load 500.

## Confirmed Invariants

- `git diff HEAD~1 HEAD -- next.config.ts` is empty — the Webpack rule was
  already wired; no config changes needed.
- `git diff HEAD~1 HEAD -- src/` is empty — no source code changes.
- `pnpm test` shows 733/733 pass (unchanged from Quick 004 baseline).
- `pnpm typecheck` exits 0.
- Production build path (`next build`) is unchanged.

## Test Counts

| Scope | Before | After | Delta |
|-------|--------|-------|-------|
| Whole suite | 733 | 733 | 0 |

No new tests added — this is a tooling change with no behavior delta in
application code.

## Deviations from Plan

None.

## Push Status

To be pushed by orchestrator after this docs commit lands.

## Follow-up

The Turbopack `{ type: 'raw' }` rule in `next.config.ts:19-27` is now dormant
but kept for forward compatibility in case a future Next.js release fixes the
Turbopack raw-import surface. If hot-reload performance under Webpack becomes
user-visible at scale, revisit by either:

1. Updating the Turbopack rule to whatever Next 17+ documents as the correct
   raw-import shape; or
2. Replacing the rule with a `loaders: ['raw-loader']` form (requires adding
   `raw-loader` as a devDependency).
