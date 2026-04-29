---
phase: quick/001-add-no-aws-env-file-deploy-path
plan: 001
subsystem: deploy/secrets
tags: [powershell, secrets, deploy, env-file, windows, no-aws]
completed: 2026-04-29
duration: ~5m

dependency-graph:
  requires: []
  provides:
    - env-file-on-disk deploy path for operators without AWS CLI access
    - scripts/start.ps1 launcher that reads D:\kbroles\.env.production
    - loadSecrets() early-return guard when AWS_SECRET_NAME unset
    - test coverage for no-AWS branch (1 new test)
    - docs cross-linking between deploy-windows.md and env-handling.md
  affects:
    - DEPLOY-CHECKLIST.md (can now link to deploy-windows.md Step 4.2 alternative)
    - Future operators discovering no-AWS path via docs

tech-stack:
  added: []
  patterns:
    - early-return guard before dynamic AWS SDK import
    - PowerShell env-file loader (split on first =, preserves base64 = chars)

key-files:
  created:
    - .env.production.example
    - scripts/start.ps1
  modified:
    - .gitignore
    - src/config/secrets.ts
    - src/config/__tests__/secrets.test.ts
    - docs/deploy-windows.md
    - docs/env-handling.md

decisions:
  - id: D1
    decision: Set AWS_SECRET_NAME in beforeEach of existing secrets tests
    rationale: >
      The early-return guard fires when AWS_SECRET_NAME is unset. The existing
      beforeEach deleted it, which would have caused all existing AWS-path tests
      to hit the new guard and return {} instead of exercising the AWS SDK path.
      Setting it in beforeEach restores the correct environment for those tests;
      the new no-AWS test deletes it explicitly.
    outcome: 8/8 secrets tests pass; AWS-path behaviour unchanged.
---

# Quick Task 001: Add No-AWS Env-File Deploy Path — Summary

**One-liner:** Env-file-on-disk alternative to AWS Secrets Manager for on-prem Windows pilot with no AWS CLI, implemented via `scripts/start.ps1` + `loadSecrets()` early-return guard + test + docs.

---

## Tasks Completed

| Task | Name | Commit | Files Changed |
|------|------|--------|---------------|
| 1 | Env-file template + start.ps1 wrapper | `f32bec5` | `.env.production.example`, `.gitignore`, `scripts/start.ps1` |
| 2 | secrets.ts early-return guard + test | `b64f383` | `src/config/secrets.ts`, `src/config/__tests__/secrets.test.ts` |
| 3 | Docs — deploy-windows.md + env-handling.md | `1b6b11b` | `docs/deploy-windows.md`, `docs/env-handling.md` |

**Files touched:** 7 files across 3 commits.

---

## Test Results

- **Typecheck:** clean (0 errors) after Task 2 `!` non-null assertion on `secretName`.
- **secrets.test.ts:** 8/8 pass (7 existing + 1 new `returns {} without importing AWS SDK when AWS_SECRET_NAME is unset`).
- **Full suite:** 729/729 tests pass (728 v1 baseline + 1 new).

**AWS-happy-path unchanged:** The existing tests that exercise the AWS SDK path were restored to working condition by adding `process.env.AWS_SECRET_NAME = '/mmc/cts/kb-assistant'` to `beforeEach`. The caching test, write-into-process-env test, dev-wins-over-AWS test, and all failure-mode tests (send reject, empty SecretString, SDK missing, malformed JSON) all continue to pass — zero behaviour change on the AWS path.

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Existing secrets tests required AWS_SECRET_NAME in beforeEach**

- **Found during:** Task 2 test run (would have had all 7 existing AWS-path tests fail if not addressed)
- **Issue:** The early-return guard fires when `AWS_SECRET_NAME` is unset. The existing `beforeEach` already deleted `AWS_SECRET_NAME` (as part of the env snapshot). All 7 existing tests would have hit the guard and returned `{}` instead of exercising the AWS SDK mock, causing assertion failures.
- **Fix:** Added `process.env.AWS_SECRET_NAME = '/mmc/cts/kb-assistant'` at the end of `beforeEach`. The new no-AWS test calls `delete process.env.AWS_SECRET_NAME` explicitly before calling `loadSecrets()`.
- **Files modified:** `src/config/__tests__/secrets.test.ts`
- **Commit:** `b64f383`

No other deviations — plan executed as written.

---

## Cross-links

- Full operator runbook for no-AWS path: `docs/deploy-windows.md` **Step 4.2 (alternative) — Env file on disk (no AWS path)**
- Env cascade addendum: `docs/env-handling.md` §5 (alternative cascade paragraph)
- `DEPLOY-CHECKLIST.md` can now link to `docs/deploy-windows.md` Step 4.2 (alternative) for operators without AWS access.

---

*Quick task 001 — executed 2026-04-29. Duration: ~5 min. No phase number; tracked in STATE.md quick tasks.*
