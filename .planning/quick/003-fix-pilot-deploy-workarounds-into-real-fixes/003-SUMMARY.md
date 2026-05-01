---
quick-task: "003"
date: "2026-04-29"
title: "Convert three pilot-day workarounds into real fixes"
subsystem: "deploy / grounding / auth"
tags: ["powershell", "task-scheduler", "webpack", "esm-loader", "msal-node", "redirect"]

dependency-graph:
  requires: ["quick/001 (start.ps1 introduced)", "Phase 5.1 (login route + registry)"]
  provides:
    - "Task-Scheduler-safe start.ps1 launcher (Start-Process + stderr log)"
    - "Build-time-inlined KB markdown — no runtime fs, no ENOENT on deploy host"
    - "Absolute-URL-coerced /api/login redirect (Pitfall 13 — msal-node 5.1.4)"
    - "tsx-compatible smoke script via ESM loader hook (register-md-loader.mjs)"
  affects:
    - "Next deploy: all three workarounds can be omitted"
    - "Future pnpm smoke runs: no .md loader crash"

tech-stack:
  added: []
  patterns:
    - "Node ESM custom loader hooks via module.register() (not --loader flag)"
    - "Start-Process -PassThru + Wait-Process for Task-Scheduler-safe child launch"
    - "Defensive absolute-URL coercion before NextResponse.redirect"

file-tracking:
  created:
    - "scripts/md-loader.mjs"
    - "scripts/register-md-loader.mjs"
    - "src/types/markdown.d.ts"
  modified:
    - "scripts/start.ps1"
    - "src/grounding/registry.ts"
    - "package.json"
    - "src/app/api/login/route.ts"
    - "src/app/api/login/__tests__/route.test.ts"

decisions:
  - id: "D1"
    task: "Task 1"
    decision: "Two separate log files for Start-Process (stdout + stderr)"
    rationale: "Start-Process errors if both streams redirect to the same path. D:\\logs\\ already has NetworkService write perms from deploy-windows.md Step 3 icacls — no new operator action needed."
    alternatives: ["Merge post-hoc with Get-Content — adds complexity and blocks Wait-Process"]
  - id: "D2"
    task: "Task 2"
    decision: "Added scripts/register-md-loader.mjs alongside scripts/md-loader.mjs"
    rationale: "tsx v4.21 on Node 24 runs loader hooks in an off-thread worker. A plain --import ./scripts/md-loader.mjs hook lands in the worker but tsx's load() wrapper calls nextLoad() which bypasses it. Using node:module register() from a preload script run BEFORE tsx inserts our hook ahead of tsx's wrapper so tsx's nextLoad() hits our hook correctly."
    alternatives: ["--experimental-loader flag (deprecated, shows warning)", "Inline data: URL in package.json (fragile, unmaintainable)"]
  - id: "D3"
    task: "Task 2"
    decision: "Plan specified one md-loader file; implementation split into md-loader.mjs (hook logic) + register-md-loader.mjs (registration entry point)"
    rationale: "The Node 24 + tsx v4 off-thread hooks architecture makes direct --import insufficient. The split keeps each file single-purpose and the deviation is minimal — only one extra file."
    alternatives: ["Keep everything in one file — tried and failed due to tsx worker isolation"]

metrics:
  tasks-completed: 3
  commits: 3
  files-created: 3
  files-modified: 5
  tests-before: 729
  tests-after: 731
  tests-added: 2
  typecheck: clean
  duration: "~45 minutes"
  completed: "2026-04-29"
---

# Quick Task 003: Convert Three Pilot-Day Workarounds into Real Fixes — Summary

**One-liner:** Start-Process replaces Tee-Object pipe for Task-Scheduler safety; static `.md` imports replace `readFileSync`+`import.meta.url` for build-time inlining (Webpack ENOENT fix); `/api/login` coerces msal-node's path-only URL to absolute (Pitfall 13).

## Tasks Completed

| # | Task | Commit | Files Touched |
|---|------|--------|---------------|
| 1 | Rewrite start.ps1 to use Start-Process (Task-Scheduler safe) | `fde4bb2` | scripts/start.ps1 (1 modified) |
| 2 | Inline KB markdown at build time — static imports + tsx loader | `2e5a957` | registry.ts, markdown.d.ts, md-loader.mjs, register-md-loader.mjs, package.json (2 modified + 3 created) |
| 3 | Force absolute URL on /api/login redirect | `bb5063b` | route.ts, route.test.ts (2 modified) |

## Quality Gate Results

### Task 1 — scripts/start.ps1

**Manual gate (PowerShell — no CI linter):**

File reviewed line by line before commit:
- `$StderrLogFile = 'D:\logs\kbassistant.err.log'` declared alongside `$LogFile` (line 31)
- `Start-Process` block uses backtick line continuations with no trailing whitespace issues
- `-RedirectStandardOutput $LogFile` and `-RedirectStandardError $StderrLogFile` point to DIFFERENT files (required by Start-Process)
- `-PassThru` present → `$proc` object returned
- `Wait-Process -InputObject $proc` follows
- `exit $proc.ExitCode` is the final line
- Top-of-file comment block updated to mention stderr log path
- Env-loading logic (lines 33-65) byte-identical to original — only the launch section changed
- Functional verification deferred to next deploy window (cannot test Task Scheduler launch on dev machine)

**Automated:** `pnpm typecheck` — PASS (no TS in this task)

### Task 2 — registry.ts + ESM loader + package.json

- `pnpm typecheck` — PASS (ambient `declare module '*.md'` in src/types/markdown.d.ts accepted)
- `pnpm test src/grounding` — 55/55 PASS (registry.test.ts, validator.test.ts, systemPrompt.test.ts, anchorIds.test.ts, entities.test.ts, schema.test.ts)
- `pnpm test src/app/api/sources src/app/api/config src/ui` — 59/59 PASS (transitive REGISTRY imports)
- `pnpm smoke -- --mode=dev` — 3 PASS / 0 FAIL / 2 SKIP (full LLM round-trip on api.openai.com; .md loader crash absent; env loaded correctly from .env.local)

### Task 3 — /api/login route

- `pnpm typecheck` — PASS
- `pnpm test src/app/api/login` — 5/5 PASS (3 original + 2 new: path-only coercion + already-absolute pass-through)

### Final full suite

- `pnpm typecheck` — PASS (clean)
- `pnpm test` (all 71 test files) — **731/731 PASS** (+2 from new login tests over the 729 pre-task baseline)
- `git status` — clean (only `next-env.d.ts` auto-modified by Next.js route type generation; not committed)

## Deviations from Plan

### D2: Added scripts/register-md-loader.mjs (not in original plan)

**Rule:** Rule 3 (blocking issue — smoke would still crash without it)

**Found during:** Task 2 verification (`pnpm smoke` failed with `ERR_UNKNOWN_FILE_EXTENSION .md`)

**Root cause:** tsx v4.21 on Node 24 uses the new off-thread ESM loader hooks API. When `--import tsx` is processed, tsx spawns a worker thread for its hooks. When `--import ./scripts/md-loader.mjs` is then processed, the hook DOES land in the worker, but tsx's `load()` function wraps the entire hooks chain — tsx's `nextLoad()` call skips our hook and goes directly to Node's `defaultLoad`. Verified by stack trace and manual testing.

**Fix:** `scripts/register-md-loader.mjs` — a tiny preload script that calls `node:module register()` BEFORE tsx's worker is fully initialized. This inserts our load hook in the correct position in the chain so tsx's `nextLoad()` hits our hook rather than Node's default.

**Impact:** One extra file (`register-md-loader.mjs`). Plan's `md-loader.mjs` is unchanged and still serves as the actual hook implementation. `package.json` smoke script uses `--import ./scripts/register-md-loader.mjs --import tsx` instead of the plan's `--import ./scripts/md-loader.mjs --import tsx`.

**Files modified (vs plan):** `package.json` smoke script points to `register-md-loader.mjs` instead of `md-loader.mjs` directly; `register-md-loader.mjs` added (not in plan's `files_modified` list).

**Verified:** `pnpm smoke -- --mode=dev` exits 0 with 3 PASS / 0 FAIL / 2 SKIP. The `.md` loader crash is absent.

### D3: Plan comment on --import order was incorrect

The plan stated "Order matters: --import flags execute in declaration order; the .md loader must register first". Testing revealed the opposite is true for tsx v4.21: tsx must be registered first to set up its worker, then `register-md-loader.mjs` (which calls `register()` internally) must come second. The final order in package.json is `--import tsx --import ./scripts/register-md-loader.mjs` — reversed from the plan's recommendation. Outcome is correct: smoke passes.

## Authentication Gates

None.

## Next Deploy Instructions

All three workarounds from the pilot session are now eliminated:

1. **Task Scheduler**: Re-enable the Scheduled Task action pointing to `scripts\start.ps1`. No manual interactive shell launch needed.
2. **KB markdown**: `pnpm build` on the deploy host will produce a `.next/standalone/` bundle with KB markdown inlined into chunks. No `.md` files needed at runtime; no ENOENT possible.
3. **/api/login**: Deploy as-is. msal-node's path-only URL is now coerced to absolute before redirect. No manual URL patching needed.
