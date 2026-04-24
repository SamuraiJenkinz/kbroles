---
phase: 06-telemetry-evals-and-pilot-hardening
plan: 08
subsystem: ops+docs
tags: [servicenow, gha-workflows, content-steward, measurement-plan, teams-digest, bash, tsx]

# Dependency graph
requires:
  - phase: 06-01-telemetry-foundation
    provides: loadSecrets() + SECRET_KEYS tuple pattern + trackEvent()
  - phase: 06-07-workbook-and-alerts
    provides: App Insights workbook + Teams webhook plumbing referenced by weekly-digest

provides:
  - Monthly ServiceNow pull script (scripts/pull-servicenow-feedback.ts)
  - Pre-flight schema validator (scripts/validate-servicenow-schema.ts)
  - GHA steward-monthly workflow (cron + weekend-skip + issue-open + archive-commit)
  - GHA weekly-digest workflow (App Insights KQL + Teams MessageCard)
  - ops/rejected-articles/ archive convention directory with README
  - docs/content-steward-runbook.md with {{STEWARD_NAME}} placeholder
  - docs/measurement-plan.md with pre-registered metrics + confounders
  - SECRET_KEYS extended to 11 entries (SERVICENOW_SERVICE_ACCOUNT, SN_INSTANCE, TEAMS_WEBHOOK_URL)

affects:
  - pilot-operations (steward uses this runbook + workflows daily)
  - eval-fixture-backlog (Signal decisions from monthly triage add eval fixtures)
  - measurement-retro (measurement-plan drives end-of-pilot comparison)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - cron-1st-of-month with weekend skip via date -u +%u >= 6
    - schema-validate-before-pull (operator one-time dry-run before production use)
    - Handlebars-style placeholders ({{FIELD_NAME}}) for human-filled values in docs
    - jq --arg s "$ENV_VAR" pattern to prevent shell injection from KQL JSON output
    - STEWARD_GH_HANDLE as optional repo variable (not secret) for issue auto-assign

key-files:
  created:
    - scripts/pull-servicenow-feedback.ts
    - scripts/validate-servicenow-schema.ts
    - scripts/__tests__/pull-servicenow-feedback.test.ts
    - .github/workflows/steward-monthly.yml
    - .github/workflows/weekly-digest.yml
    - ops/rejected-articles/.gitkeep
    - ops/rejected-articles/README.md
    - docs/content-steward-runbook.md
    - docs/measurement-plan.md
  modified:
    - src/config/secrets.ts (SECRET_KEYS: 8 → 11 entries)
    - package.json (added sn:validate script)

key-decisions:
  - "GitHub-hosted ubuntu-latest runner for SN pull (not Windows self-hosted) — SN REST API is public HTTPS, no Windows-specific tooling needed"
  - "MessageCard plain-text format for Teams digest (no Logic App, no Adaptive Card) — P3 tier per CONTEXT.md; upgrade path noted in workflow comment"
  - "--baseline flag reuses same pull script (no separate script) — keeps the baseline/monthly outputs structurally identical for comparison"
  - "STEWARD_GH_HANDLE as repo variable not secret — it is a GitHub username (public), not a credential"
  - "Teams digest curl failure is non-blocking (exit 0 with warning) — digest is informational; App Insights retains data regardless"

patterns-established:
  - "cron-1st-of-month with weekend skip: date -u +%u >= 6 → notice + exit 0; operator triggers workflow_dispatch on next business day"
  - "schema-validate-before-pull: pnpm sn:validate confirms field existence before first production pull; output pasted into runbook"
  - "Handlebars placeholders in docs: {{FIELD_NAME}} signals human-fill-in before pilot day 1 without breaking markdown rendering"
  - "jq -n --arg s env-var: reads env var value (not inline ${{ }}) to prevent shell injection on JSON strings with quotes/newlines"

# Metrics
duration: 8min
completed: 2026-04-24
---

# Phase 6 Plan 08: Steward Pull and Docs Summary

**Monthly SN pull automation + weekly Teams digest + content-steward-runbook + pre-registered measurement plan with confounders; satisfies TELE-04 and ROADMAP SC#3**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-24T14:27:50Z
- **Completed:** 2026-04-24T14:35:50Z
- **Tasks:** 3
- **Files modified/created:** 11

## Accomplishments

- SECRET_KEYS extended to 11 entries (SERVICENOW_SERVICE_ACCOUNT, SN_INSTANCE, TEAMS_WEBHOOK_URL); module-cached loader picks them up with no body changes
- `scripts/pull-servicenow-feedback.ts` implements the full SN pull loop: snGet() helper with Basic auth + URL params, kb_knowledge + kb_feedback correlation, feedback_count aggregation, --baseline flag for 90-day pre-pilot snapshot, u_rejection_reason absent → undefined (not string 'undefined')
- 12 Vitest unit tests via vi.stubGlobal(fetch) covering auth header, URL params, error handling, feedback_count aggregation, --baseline flag, and absent-u_rejection_reason coercion
- steward-monthly.yml: cron '0 1 1 * *' + workflow_dispatch + weekend-skip + pnpm@9/node20 + AWS creds + actions/github-script@v7 issue-open with 50-item checklist + STEWARD_GH_HANDLE auto-assign + archive-commit via github-actions[bot]
- weekly-digest.yml: cron '0 23 * * 0' + azure/login@v2 + az monitor app-insights query + jq --arg env-var Teams post (shell-injection safe) + non-blocking curl
- docs/content-steward-runbook.md + docs/measurement-plan.md with {{STEWARD_NAME}} and all required placeholders; 4 pre-registered primary metrics, 4 pre-registered confounders

## Task Commits

1. **Task 1: SN pull + schema-validate scripts + SECRET_KEYS** — `be9d974` (feat — attributed to 06-07 concurrent agent, content correct; see Deviations)
2. **Task 2: steward-monthly + weekly-digest workflows** — `67e979c` (feat)
3. **Task 3: content-steward-runbook + measurement-plan** — `0acb0c1` (docs)

**Plan metadata:** (this commit)

## Files Created/Modified

- `src/config/secrets.ts` — SECRET_KEYS extended: added SERVICENOW_SERVICE_ACCOUNT, SN_INSTANCE, TEAMS_WEBHOOK_URL (total 11)
- `package.json` — added `sn:validate` script (`tsx scripts/validate-servicenow-schema.ts`)
- `scripts/validate-servicenow-schema.ts` — pre-flight schema dry-run; confirms u_rejection_reason + workflow_state enum; exits 1 on fetch failure
- `scripts/pull-servicenow-feedback.ts` — monthly SN pull; exports snGet() + KbRecord + PullOutput; --baseline flag branches to 90-day window
- `scripts/__tests__/pull-servicenow-feedback.test.ts` — 12 Vitest assertions; vi.stubGlobal(fetch); vi.mock(secrets)
- `vitest.config.mts` — no change needed; scripts/**/__tests__/**/*.test.ts glob already present from a previous plan run
- `.github/workflows/steward-monthly.yml` — cron + weekend-skip + baseline input + issue-open + archive-commit
- `.github/workflows/weekly-digest.yml` — cron + App Insights KQL + Teams post
- `ops/rejected-articles/.gitkeep` — tracks empty directory in git
- `ops/rejected-articles/README.md` — file shape documentation + steward workflow
- `docs/content-steward-runbook.md` — steward runbook with placeholders
- `docs/measurement-plan.md` — pre-registered measurement plan with placeholders

## Decisions Made

1. **GitHub-hosted ubuntu-latest for SN pull** — SN REST API is public HTTPS; no Windows tooling needed for the pull script. Windows runner reserved for the actual Windows app deployment.
2. **MessageCard plain-text for Teams digest** — P3 tier per CONTEXT.md; Adaptive Card upgrade is noted in the weekly-digest.yml comment as a follow-up.
3. **--baseline flag reuses same pull script** — baseline and monthly outputs are structurally identical JSON (only `window` field differs), making longitudinal comparison trivial.
4. **STEWARD_GH_HANDLE as repo variable (not secret)** — GitHub usernames are public information; using `vars.` not `secrets.` keeps it visible in workflow logs for debugging.
5. **Teams digest curl failure is non-blocking** — `|| echo "::warning::..."` ensures the workflow doesn't fail if Teams is momentarily down; App Insights retains all data regardless.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test `snGet > Authorization header` failed with "Cannot read properties of undefined (reading 'ok')"**

- **Found during:** Task 1 verification (`pnpm test scripts/__tests__/...`)
- **Issue:** Initial test used dynamic `import('../pull-servicenow-feedback.js')` inside `beforeEach` with `fetchMock.mockResolvedValueOnce()` but Vitest's module cache caused `fetch` inside the module to be captured before `vi.stubGlobal`. Also, test side-effects were running `main()` via the "passes sysparm_query" test which caused `ops/rejected-articles/2026-04.json` to be written.
- **Fix:** Rewrote tests to use top-level `vi.mock` for `secrets.js`, import `snGet` once in `beforeEach` after mocking, stub `globalThis.fetch` per-test, and separated pure data-transformation logic into standalone describe blocks (no module re-import needed).
- **Files modified:** `scripts/__tests__/pull-servicenow-feedback.test.ts`
- **Verification:** `pnpm test scripts/__tests__/...` shows 12/12 passing; `pnpm test` shows 728/728 passing
- **Committed in:** `be9d974` (via 06-07 concurrent agent)

**2. [Rule 1 - Bug] TypeScript errors in test file — `mock.calls[0] as [string, RequestInit]`**

- **Found during:** Task 1 verification (`pnpm typecheck`)
- **Issue:** `fetchSpy.mock.calls[0]` has type `[]` (empty tuple), not directly castable to `[string, RequestInit]`. TS2352 conversion error.
- **Fix:** Changed cast to `as unknown as [string, RequestInit]` to allow the intermediate type assertion.
- **Files modified:** `scripts/__tests__/pull-servicenow-feedback.test.ts`
- **Verification:** `pnpm typecheck` clean
- **Committed in:** `be9d974` (via 06-07 concurrent agent)

**3. [Commit attribution race] Task 1 files committed by concurrent 06-07 agent**

- **Found during:** Task 1 commit attempt (`git commit` — "no changes added to commit")
- **Issue:** The 06-07 agent ran concurrently and picked up all unstaged Task 1 files (`src/config/secrets.ts`, `package.json`, `scripts/**`, `ops/rejected-articles/`) in its `be9d974` commit. This is the "commit attribution race" documented in Wave 2/3 notes.
- **Impact:** None on content correctness — all files are committed with correct content, tests pass, typecheck is clean. Commit attribution is the only deviation.
- **Action:** Recorded `be9d974` as the Task 1 commit; proceeded with Task 2 and 3 as normal.

---

**Total deviations:** 2 auto-fixed (Rule 1 bugs) + 1 commit attribution race
**Impact on plan:** Both Rule-1 fixes essential for test correctness and type safety. Attribution race has no content impact. No scope creep.

## Issues Encountered

- vitest.config.mts glob already had `scripts/**/__tests__/**/*.test.ts` (added by a previous plan run), so the plan's "Extend vitest.config.ts" step was a no-op. The success criteria specify `scripts/__tests__/**/*.test.*` — the actual glob is more specific (`scripts/**/__tests__/**/*.test.ts`) but functionally equivalent and already picks up the new test file.
- Live GHA validation (`gh workflow run`, `az monitor` commands) cannot be executed from the sandbox. Both YAML files are parse-valid (js-yaml confirmed). Operator must validate the full execution path post-merge.

## User Setup Required

The following operator tasks are required before the workflows can run:

| Task | Where |
|------|-------|
| `SERVICENOW_SERVICE_ACCOUNT` JSON blob in AWS Secrets Manager at `/mmc/cts/kb-assistant` | AWS console or `aws secretsmanager` CLI |
| `SN_INSTANCE` value `mmcnow` in secrets blob | Same secret |
| `TEAMS_WEBHOOK_URL` in secrets blob | Teams channel connector settings |
| `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` repo secrets | GitHub repo → Settings → Secrets → Actions |
| `AZURE_CREDENTIALS` repo secret (SP JSON from `az ad sp create-for-rbac`) | GitHub repo → Settings → Secrets → Actions |
| `APP_INSIGHTS_APP_ID` repo secret | Azure portal → App Insights → Overview → Application ID |
| `STEWARD_GH_HANDLE` repo variable (optional) | GitHub repo → Settings → Variables → Actions |
| `content-steward` issue label | GitHub repo → Issues → Labels → New label |
| Run `pnpm sn:validate` once and paste output into runbook | Local dev with credentials in `.env.local` |
| Capture baseline: trigger `steward-monthly.yml` with `baseline: true` | GitHub → Actions → Content Steward Monthly Pull → Run workflow |

## Next Phase Readiness

- Phase 6 Plans 1–8 are now all complete or in-progress. This is Plan 8 (the final plan).
- The phase verifier should be run to confirm all Phase 6 success criteria are met.
- Pilot day 1 blockers remaining:
  - Fill in `{{STEWARD_NAME}}`, `{{STEWARD_BACKUP_NAME}}`, `{{SIGNOFF_DATE}}` in runbook + measurement plan
  - Fill in `{{PILOT_START_DATE}}` and `{{PILOT_END_DATE}}` in measurement plan
  - Fill in `{{STEWARD_NAME}}` in `docs/ops/eval-gate-bypass-procedure.md` (from Plan 06-06)
  - Capture pre-pilot baseline via `steward-monthly.yml` workflow dispatch with `baseline: true`
  - All operator setup tasks in the table above

---
*Phase: 06-telemetry-evals-and-pilot-hardening*
*Completed: 2026-04-24*
