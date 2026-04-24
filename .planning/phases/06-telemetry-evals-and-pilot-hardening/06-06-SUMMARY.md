---
phase: 06-telemetry-evals-and-pilot-hardening
plan: 06
subsystem: ci-cd
tags: [github-actions, eval-gating, workflow-dispatch, nightly-evals, pnpm, vitest, teams-webhook]

# Dependency graph
requires:
  - phase: 06-04-eval-harness-and-fast-suites
    provides: pnpm eval:fast script + entity-allowlist + citation-substring suites
  - phase: 06-05-slow-suites-and-llm-judge
    provides: pnpm eval + pnpm eval:slow scripts + ops/evals/latest.json contract
  - phase: 05.1-mmc-it-bff-pivot
    provides: deploy.yml two-job (ubuntu build + self-hosted Windows deploy) pipeline

provides:
  - ci.yml PR gate running typecheck/lint/test/eval:fast on every PR + push to main
  - evals-nightly.yml cron 0-20-UTC slow-eval run with issue-open + Teams notify on fail
  - deploy.yml patched with fast-eval hard gate + 48h nightly metadata gate + bypass input
  - docs/ops/eval-gate-bypass-procedure.md emergency bypass runbook

affects:
  - 06-07-workbook-and-alerts (reads evals-nightly.yml artifact retention and issue labels)
  - 06-08-steward-pull-and-docs (references eval-gate-bypass-procedure.md runbook)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - two-tier eval gating (fast hard gate in build job + 48h nightly metadata gate in check-evals job)
    - eval-regression issue auto-open via actions/github-script@v7 parsing latest.json
    - skip_eval_gate workflow_dispatch boolean input for documented emergency bypass
    - non-blocking Teams MessageCard notify via plain curl POST to TEAMS_WEBHOOK_URL
    - listWorkflowRunsForRepo two-consecutive-red detection

key-files:
  created:
    - .github/workflows/ci.yml
    - .github/workflows/evals-nightly.yml
    - docs/ops/eval-gate-bypass-procedure.md
  modified:
    - .github/workflows/deploy.yml

key-decisions:
  - "MessageCard plain-text Teams notify (no Logic App) — RESEARCH.md §8 confirms simplest Teams webhook format"
  - "48h nightly window — balances freshness with weekend/holiday runner gaps"
  - "2-consecutive-red hard block — prevents transient flake from blocking one deploy while catching systematic regression"
  - "Fast evals (pnpm eval:fast) as HARD gate in build — no bypass; slow-eval metadata gate has bypass"
  - "skip_eval_gate bypasses only check-evals, never fast-eval hard gate"

patterns-established:
  - "Two-tier eval gating: deterministic fast suites (no LLM key) as hard gate, nightly LLM-judge as metadata gate"
  - "Incident ID obligation before bypass — auditable in Teams + gh run list output"
  - "{{STEWARD_NAME}} placeholder in ops runbooks for Plan 07 convention"

# Metrics
duration: 3min
completed: 2026-04-24
---

# Phase 6 Plan 06: CI/CD Integration Summary

**Two-tier eval gating wired into GitHub Actions: deterministic fast-eval hard gate in every build + nightly LLM-judge metadata gate with automated issue-open, Teams notify, and documented emergency bypass**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-24T14:02:53Z
- **Completed:** 2026-04-24T14:06:33Z
- **Tasks:** 2
- **Files created/modified:** 4

## Accomplishments

- Created `.github/workflows/ci.yml`: triggers on pull_request + push to main; `verify` job runs typecheck/lint/test/eval:fast on ubuntu-latest with pnpm@9 + node 20.x; uploads fast-eval-report artifact (7d retention); header comment instructs admin to require "verify" as branch protection status check
- Created `.github/workflows/evals-nightly.yml`: cron `0 20 * * *` + workflow_dispatch; runs `pnpm eval` with LLM_JUDGE_API_KEY/LLM_JUDGE_BASE_URL secrets; uploads ops/evals/latest.json + history/ + flaky-review.json (30d); failure auto-opens GitHub issue labelled `eval-regression` with failing suites parsed from latest.json via actions/github-script@v7; non-blocking Teams MessageCard notify via curl POST to TEAMS_WEBHOOK_URL; header comment documents secret requirements
- Patched `.github/workflows/deploy.yml`: added `workflow_dispatch.inputs.skip_eval_gate` (boolean, default false); inserted `Fast evals (deterministic hard gate)` step in build job between Test and Build; added `check-evals` job (listWorkflowRunsForRepo for evals-nightly.yml — fails on no green in 48h or 2 consecutive reds, skipped when skip_eval_gate==true); deploy `needs` updated from `build` to `[build, check-evals]`; Phase 5.1 Scheduled Task + canary + rollback structure preserved verbatim
- Created `docs/ops/eval-gate-bypass-procedure.md`: 1-page runbook with Incident ID obligation, exact `gh workflow run deploy.yml -f skip_eval_gate=true --ref main` command, 24h follow-up requirement, `{{STEWARD_NAME}}` placeholder

## Task Commits

Each task was committed atomically:

1. **Task 1: Create ci.yml + evals-nightly.yml** — `f00853f` (feat)
2. **Task 2: Patch deploy.yml + bypass runbook** — included in `264944a` (staging race with concurrent 06-03 wave — content correct, see Deviations)

## Files Created/Modified

- `.github/workflows/ci.yml` — PR + main gate: typecheck/lint/test/eval:fast + artifact upload
- `.github/workflows/evals-nightly.yml` — Nightly slow-eval cron + issue-open + Teams notify on failure
- `.github/workflows/deploy.yml` — Patched with fast-eval hard gate + check-evals metadata gate + skip_eval_gate bypass input
- `docs/ops/eval-gate-bypass-procedure.md` — Emergency bypass runbook

## Decisions Made

- **MessageCard plain-text Teams notify (no Logic App):** RESEARCH.md §8 confirms `{"text":"..."}` is the simplest Teams incoming webhook format without requiring a Power Automate transformer. Full Azure Monitor Common Alert Schema conversion is Plan 07's scope, not this notify.
- **48h nightly window:** Balances freshness requirement with weekend/holiday runner gaps. A Saturday nightly covers Sunday's first deploy; two-consecutive-red detection adds the second-tier catch.
- **2-consecutive-red hard block:** Prevents a single transient flake from blocking all deploys while catching genuine systematic regression within two runs.
- **Fast evals are HARD gate (no bypass):** `pnpm eval:fast` runs deterministic string-match suites — there is no valid reason to skip them. `skip_eval_gate` only bypasses the nightly metadata check (which can be red due to LLM API outages).

## Deviations from Plan

### Staging race with concurrent plan 06-03

**Found during:** Task 2 commit

**Issue:** Concurrent plan 06-03 agent staged and committed `.github/workflows/deploy.yml` and `docs/ops/eval-gate-bypass-procedure.md` alongside its own files in commit `264944a`, before the 06-06 agent could issue its own per-task commit. This is a Wave 3 parallel execution race condition (both agents active simultaneously).

**Impact:** The Task 2 files are present in git HEAD with their correct content. The commit attribution shows `feat(06-03)` in the commit message rather than a separate `feat(06-06)` commit, but the artifacts are correct and verified.

**Verification:** `git show 264944a:.github/workflows/deploy.yml | grep -n "check-evals\|skip_eval_gate\|Fast evals"` confirms all three Task 2 modifications are present and correct.

**Rule classification:** Not a Rule 1-4 deviation — this is a parallel wave execution artifact with no correctness impact.

---

**Total deviations:** 0 functional deviations (plan executed exactly as written). 1 commit-attribution race condition documented above.

## Issues Encountered

**js-yaml validation:** `js-yaml` was available in `node_modules` and used to validate all three workflow YAML files parse correctly before commit. All three passed.

**Live GitHub Actions validation:** Cannot be performed inside the execution sandbox (no `gh workflow run` or actual push capability). Operator must validate post-merge that:
1. `ci.yml` triggers on PR and the `verify` job completes successfully
2. `evals-nightly.yml` can be triggered manually via `gh workflow run evals-nightly.yml` with judge secrets set
3. `deploy.yml` check-evals job correctly detects nightly run status via GitHub API

## User Setup Required

Repository admin actions required before eval gating is active:

1. **Add GitHub Actions secrets:**
   - `LLM_JUDGE_API_KEY` — API key for the judge model (gpt-4o-mini or equivalent)
   - `LLM_JUDGE_BASE_URL` — Judge model base URL (optional; defaults to OpenAI public endpoint)
   - `TEAMS_WEBHOOK_URL` — Incoming webhook URL for #kb-assistant-pilot channel (optional; notify skipped if absent)

2. **Set branch protection:** GitHub Settings > Branches > main > Require status checks > add "verify" (from ci.yml)

3. **Create `eval-regression` label** in repo Issues labels if not already present (evals-nightly.yml applies this label on failure)

## Next Phase Readiness

- Plan 06-07 (workbook and alerts) can read `ops/evals/latest.json` artifact from evals-nightly.yml (30d retention) and reference the `eval-regression` issue label established here
- Plan 06-08 (steward pull and docs) can reference `docs/ops/eval-gate-bypass-procedure.md` as the runbook template baseline
- SC#2 deploy-gating clause is now enforced: red fast-eval blocks build; no green nightly in 48h blocks deploy

---
*Phase: 06-telemetry-evals-and-pilot-hardening*
*Completed: 2026-04-24*
