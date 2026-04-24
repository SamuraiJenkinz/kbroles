---
phase: 06-telemetry-evals-and-pilot-hardening
plan: 06
type: execute
wave: 3
depends_on:
  - 06-04-eval-harness-and-fast-suites-PLAN.md
  - 06-05-slow-suites-and-llm-judge-PLAN.md
files_modified:
  - .github/workflows/ci.yml
  - .github/workflows/evals-nightly.yml
  - .github/workflows/deploy.yml
  - docs/ops/eval-gate-bypass-procedure.md
autonomous: true
blocks_execution_on:
  - "Plan 06-04 merged (fast suites exist)"
  - "Plan 06-05 merged (slow suites exist)"
  - "Repository admin must add GitHub Actions secrets: LLM_JUDGE_API_KEY, LLM_JUDGE_BASE_URL (separate from production LLM_API_KEY/LLM_BASE_URL) — surface as a blocker at execution time if absent"
  - "Repository admin should set a monthly spend cap on the LLM_JUDGE_API_KEY provider account (~$20/mo ceiling; RESEARCH.md §4 projects ~$0.36/mo at current fixture size, leaving headroom)"

must_haves:
  truths:
    - "Every PR to main runs pnpm eval:fast as a required status check; fast-eval red blocks merge"
    - "Every night at 20:00 UTC a scheduled workflow runs pnpm eval:slow and uploads the JSON report"
    - "A slow-eval failure auto-opens a GitHub issue labelled eval-regression with the failures block from ops/evals/latest.json"
    - "deploy.yml runs fast evals BEFORE build completes (hard gate) + checks that a green nightly run exists within the last 48h (metadata gate)"
    - "Two consecutive nightly reds flip the metadata gate red; deploys blocked until a human resolves"
    - "An emergency-deploy bypass exists (workflow_dispatch input skip_eval_gate=true) documented in docs/ops/eval-gate-bypass-procedure.md"
    - "Teams notification on nightly red lands in #kb-assistant-pilot via webhook"
    - "No regressions to the Phase 5.1 two-job (build ubuntu → deploy windows) structure"
  artifacts:
    - path: ".github/workflows/ci.yml"
      provides: "PR gate running pnpm test + pnpm eval:fast"
    - path: ".github/workflows/evals-nightly.yml"
      provides: "Nightly slow-eval run with issue-open + Teams notify on fail"
    - path: ".github/workflows/deploy.yml"
      provides: "Existing deploy pipeline extended with check-evals job"
    - path: "docs/ops/eval-gate-bypass-procedure.md"
      provides: "Runbook: when and how to set skip_eval_gate=true"
  key_links:
    - from: ".github/workflows/deploy.yml"
      to: "ops/evals/latest.json artifact from evals-nightly.yml"
      via: "actions/github-script fetching recent workflow_runs"
      pattern: "listWorkflowRunsForRepo.*evals-nightly"
    - from: ".github/workflows/deploy.yml"
      to: "pnpm eval:fast"
      via: "step in the build job before pnpm build"
      pattern: "pnpm eval:fast"
    - from: ".github/workflows/evals-nightly.yml"
      to: "Teams webhook"
      via: "POST to TEAMS_WEBHOOK_URL secret on failure"
      pattern: "TEAMS_WEBHOOK_URL"
---

<objective>
Wire the eval harness into the existing CI/CD pipeline so deploys are genuinely gated on grounding quality. Three changes:
1. New `.github/workflows/ci.yml` running pnpm test + pnpm eval:fast on every PR (required check).
2. New `.github/workflows/evals-nightly.yml` running pnpm eval:slow on a cron with artifact upload + issue-open + Teams notification on failure.
3. Patch `.github/workflows/deploy.yml` to (a) run pnpm eval:fast as a hard gate in the build job and (b) add a new `check-evals` job that confirms a green nightly run exists within 48h (metadata gate), with a documented bypass.

Purpose: ROADMAP SC#2 explicitly requires "red suite fails deploy gate" — this plan enforces it. Addresses Pitfall 1 (make the neg-oos threshold load-bearing) and Pitfall 15 (nightly evals catch regressions from steward-added fixtures before production).

Output: Three workflow files (one new + one new + one patched) + a 1-page bypass runbook.
</objective>

<execution_context>
@C:\Users\taylo\.claude/get-shit-done/workflows/execute-plan.md
@C:\Users\taylo\.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/06-telemetry-evals-and-pilot-hardening/06-CONTEXT.md
@.planning/phases/06-telemetry-evals-and-pilot-hardening/06-RESEARCH.md

# Direct dependencies
@.planning/phases/06-telemetry-evals-and-pilot-hardening/06-04-eval-harness-and-fast-suites-PLAN.md
@.planning/phases/06-telemetry-evals-and-pilot-hardening/06-05-slow-suites-and-llm-judge-PLAN.md

# Existing baseline — DO NOT regress the two-job structure
@.github/workflows/deploy.yml
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create ci.yml (PR gate) + evals-nightly.yml (nightly slow run)</name>
  <files>
    .github/workflows/ci.yml
    .github/workflows/evals-nightly.yml
  </files>
  <action>
    1. Create `.github/workflows/ci.yml` — runs on every PR:
       ```yaml
       name: CI
       on:
         pull_request:
           branches: [main]
         push:
           branches: [main]
       jobs:
         verify:
           name: Verify (typecheck, lint, test, fast-eval)
           runs-on: ubuntu-latest
           steps:
             - uses: actions/checkout@v4
             - uses: pnpm/action-setup@v4
               with: { version: 9 }
             - uses: actions/setup-node@v4
               with: { node-version: '20.x', cache: 'pnpm' }
             - run: pnpm install --frozen-lockfile
             - name: Typecheck
               run: pnpm typecheck
             - name: Lint
               run: pnpm lint
             - name: Unit + component tests
               run: pnpm test
             - name: Fast evals (deterministic gate)
               run: pnpm eval:fast
               # No judge key needed — entity-allowlist + citation-substring are string-match only
             - name: Upload eval report
               if: always()
               uses: actions/upload-artifact@v4
               with:
                 name: fast-eval-report-${{ github.run_id }}
                 path: ops/evals/latest.json
                 retention-days: 7
       ```
       Branch protection on main must require the "verify" job as a status check — add a note in the workflow comment telling the repo admin to configure this in GitHub Settings > Branches.

    2. Create `.github/workflows/evals-nightly.yml`:
       ```yaml
       name: Nightly Slow Evals
       on:
         schedule:
           - cron: '0 20 * * *'   # 20:00 UTC = 06:00 AEST next day
         workflow_dispatch: {}
       jobs:
         slow-evals:
           name: Slow evals (LLM-judge suites)
           runs-on: ubuntu-latest
           steps:
             - uses: actions/checkout@v4
             - uses: pnpm/action-setup@v4
               with: { version: 9 }
             - uses: actions/setup-node@v4
               with: { node-version: '20.x', cache: 'pnpm' }
             - run: pnpm install --frozen-lockfile
             - name: Run full eval suite (fast + slow)
               id: eval
               run: pnpm eval
               env:
                 LLM_JUDGE_API_KEY: ${{ secrets.LLM_JUDGE_API_KEY }}
                 LLM_JUDGE_BASE_URL: ${{ secrets.LLM_JUDGE_BASE_URL }}
                 # Production LLM creds intentionally absent — evals call the judge
                 # model directly and, for positional/paired-role, run against a
                 # judge-only pipeline per Plan 05.
             - name: Upload eval report
               if: always()
               uses: actions/upload-artifact@v4
               with:
                 name: nightly-eval-report-${{ github.run_id }}
                 path: |
                   ops/evals/latest.json
                   ops/evals/history/
                   ops/evals/flaky-review.json
                 retention-days: 30
             - name: Open GitHub issue on failure
               if: failure()
               uses: actions/github-script@v7
               with:
                 script: |
                   const fs = require('fs')
                   let body = 'Nightly eval failed — full report in artifact.'
                   try {
                     const report = JSON.parse(fs.readFileSync('ops/evals/latest.json', 'utf8'))
                     const failingSuites = report.suites.filter(s => !s.threshold_met)
                     body = ['## Failing suites', ...failingSuites.map(s => `- **${s.suite}**: pass_rate ${(s.pass_rate*100).toFixed(1)}% (threshold ${(s.threshold*100).toFixed(1)}%)`), '', '<details><summary>Full failures</summary>', '', '```json', JSON.stringify(failingSuites.flatMap(s => s.failures), null, 2), '```', '</details>'].join('\n')
                   } catch (e) { body += `\n\nReport parse error: ${e.message}` }
                   await github.rest.issues.create({
                     owner: context.repo.owner,
                     repo: context.repo.repo,
                     title: `Nightly eval failure ${new Date().toISOString().slice(0,10)}`,
                     body,
                     labels: ['eval-regression'],
                   })
             - name: Notify Teams on failure
               if: failure() && env.TEAMS_WEBHOOK_URL != ''
               env:
                 TEAMS_WEBHOOK_URL: ${{ secrets.TEAMS_WEBHOOK_URL }}
               run: |
                 curl -sS -X POST -H 'Content-Type: application/json' \
                   -d "{\"text\":\"[kb-assistant] Nightly eval red — run ${{ github.run_id }} — see issue in repo.\"}" \
                   "$TEAMS_WEBHOOK_URL" || echo "Teams webhook post failed (non-blocking)"
       ```
       Note: the Teams notify uses MessageCard text format (plain `{"text":"..."}`). RESEARCH.md §8 confirms this is the simplest format Teams incoming webhooks accept without a Power Automate transformer. The full Azure Monitor Common Alert Schema conversion is for Plan 07 alerts, not this notify.

    3. Document in a comment at the top of evals-nightly.yml: "If the workflow fails due to missing LLM_JUDGE_API_KEY, add the secret at repo Settings > Secrets and variables > Actions. See .planning/phases/06-telemetry-evals-and-pilot-hardening/06-RESEARCH.md §Open Questions #4 for judge-model rationale."
  </action>
  <verify>
    - Create a throwaway branch, push a trivial change → ci.yml runs, all steps (typecheck, lint, test, eval:fast) pass, report artifact uploaded.
    - Trigger evals-nightly.yml manually via `gh workflow run evals-nightly.yml` → runs to completion with judge creds, uploads artifact.
    - Force a fixture to fail (bad fixture in a feature branch) → ci.yml's eval:fast step fails, merge is blocked.
    - Force a slow suite to fail (or fake a nightly red by editing a fixture temporarily on a PR that gets re-run via workflow_dispatch) → github issue created, Teams webhook hit.
  </verify>
  <done>
    - ci.yml runs on every PR + push to main, requires all steps green.
    - evals-nightly.yml runs at 20:00 UTC nightly + on-demand via workflow_dispatch.
    - Nightly failure auto-opens an issue labelled `eval-regression` with the failing suites listed.
    - Teams notify posts to TEAMS_WEBHOOK_URL (non-blocking if secret absent).
    - Artifacts retain for 7d (PR) / 30d (nightly).
  </done>
</task>

<task type="auto">
  <name>Task 2: Patch deploy.yml with fast-eval hard gate + 48h nightly-green metadata gate</name>
  <files>
    .github/workflows/deploy.yml
    docs/ops/eval-gate-bypass-procedure.md
  </files>
  <action>
    Preserve the existing two-job structure (ubuntu build → self-hosted windows deploy). DO NOT REGRESS the Phase 5.1 pipeline — this plan ADDs gating, it doesn't restructure.

    1. Add a `workflow_dispatch` input to allow emergency bypass:
       ```yaml
       on:
         push:
           branches: [main]
         workflow_dispatch:
           inputs:
             skip_eval_gate:
               description: 'Emergency bypass — skip 48h nightly-eval metadata gate'
               type: boolean
               default: false
       ```

    2. In the existing `build` job, ADD a step AFTER "Test (unit)" and BEFORE "Build (Next.js standalone)":
       ```yaml
       - name: Fast evals (deterministic hard gate)
         run: pnpm eval:fast
         # Required: fails the pipeline if entity-allowlist or citation-substring threshold missed.
         # No LLM_JUDGE_API_KEY needed — fast suites are deterministic.
       ```
       This is a HARD gate — a red fast eval blocks the build entirely, no bypass.

    3. Add a NEW `check-evals` job between build and deploy:
       ```yaml
       check-evals:
         name: Verify nightly eval is green (48h window)
         runs-on: ubuntu-latest
         needs: build
         if: ${{ inputs.skip_eval_gate != true }}
         steps:
           - uses: actions/github-script@v7
             with:
               script: |
                 const cutoff = Date.now() - 48 * 60 * 60 * 1000
                 const runs = await github.rest.actions.listWorkflowRunsForRepo({
                   owner: context.repo.owner,
                   repo: context.repo.repo,
                   workflow_id: 'evals-nightly.yml',
                   per_page: 10,
                 })
                 const recentGreen = runs.data.workflow_runs.find(
                   r => r.conclusion === 'success' && new Date(r.updated_at).getTime() > cutoff
                 )
                 if (!recentGreen) {
                   core.setFailed('No green nightly eval run in the last 48h. Deploy blocked. See docs/ops/eval-gate-bypass-procedure.md for emergency bypass.')
                 }
                 // Two-consecutive-red detection:
                 const recentRuns = runs.data.workflow_runs.slice(0, 2)
                 if (recentRuns.length === 2 && recentRuns.every(r => r.conclusion === 'failure')) {
                   core.setFailed('Last 2 nightly eval runs both red. Deploy blocked — investigate before shipping.')
                 }
       ```

    4. Update the existing `deploy` job to `needs: [build, check-evals]` (so deploy runs only after BOTH gates pass). Confirm: existing `needs: build` becomes `needs: [build, check-evals]`.

    5. Create `docs/ops/eval-gate-bypass-procedure.md` — a short runbook:
       ```markdown
       # Emergency Eval-Gate Bypass Procedure

       Use ONLY when:
       - Production is broken AND the fix has been reviewed AND manual smoke-test is green AND the nightly eval gate is red for reasons unrelated to the fix (e.g. judge-API outage, ServiceNow-downstream flake).

       ## Procedure
       1. Tag the incident in #kb-assistant-pilot Teams with an Incident ID.
       2. Trigger deploy manually: `gh workflow run deploy.yml -f skip_eval_gate=true --ref main`.
       3. Within 24h, investigate the nightly red and re-run `gh workflow run evals-nightly.yml`.
       4. If the red persists, open a PR adding quarantine entries or fixture fixes; the next deploy may NOT use skip_eval_gate without a fresh Incident ID.

       ## Reviewed
       - Content Steward: {{STEWARD_NAME}}
       - Engineer on call: see STATE.md
       ```
       Placeholder `{{STEWARD_NAME}}` matches the Plan 07 runbook convention.

    6. Add a note in the deploy.yml header comment: "Phase 6 Plan 06-06 added eval gating. See .planning/phases/06-telemetry-evals-and-pilot-hardening/06-06-ci-cd-integration-PLAN.md."
  </action>
  <verify>
    - Push a change; deploy.yml build job runs fast evals; if passing, build continues; if failing, build fails.
    - Simulate "no recent green nightly" (manually delete recent green runs via `gh run delete` in a fork for the test) — check-evals job fails with the expected message.
    - Use `gh workflow run deploy.yml -f skip_eval_gate=true` on main → check-evals job is skipped, deploy runs.
    - 19/19 E2E and 597+ unit tests continue to pass (this task only adds workflow steps; no source changes).
  </verify>
  <done>
    - deploy.yml's build job has a fast-eval hard gate.
    - A new check-evals job gates deploy on a 48h-green nightly OR sets failure on 2 consecutive reds.
    - `workflow_dispatch.inputs.skip_eval_gate` allows documented emergency bypass.
    - docs/ops/eval-gate-bypass-procedure.md explains when and how to use the bypass.
    - Phase 5.1 two-job structure preserved end-to-end.
  </done>
</task>

</tasks>

<verification>
- Push an intentionally-failing eval fixture to a PR: ci.yml fails at the "Fast evals" step, merge is blocked.
- Revert the PR, confirm ci.yml is green again, merge goes through.
- Trigger evals-nightly.yml manually: runs slow suites, uploads artifact; if forced-fail, opens an issue.
- Push a main-branch change with a recent green nightly: deploy.yml runs fast evals, passes, check-evals passes (finds recent green), deploy proceeds, /api/health canary confirms production.
- Use `gh workflow run deploy.yml -f skip_eval_gate=true`: check-evals is skipped; deploy proceeds.
- All existing 19/19 E2E and 597/597 unit tests remain green.
</verification>

<success_criteria>
Completes SC#2's deploy-gating clause ("a red suite fails the deploy gate"). Operationalises Pitfall 1 (grounding evals become ship-blocking, not advisory).

- [ ] ci.yml requires eval:fast on every PR
- [ ] evals-nightly.yml runs on cron, opens issues + Teams-notifies on fail
- [ ] deploy.yml hard-gates on eval:fast + metadata-gates on 48h nightly + 2-consecutive-red block
- [ ] Bypass is documented, auditable, and off-by-default
- [ ] Existing pipeline + test baseline preserved
</success_criteria>

<output>
After completion, create `.planning/phases/06-telemetry-evals-and-pilot-hardening/06-06-SUMMARY.md`. Frontmatter: `subsystem: ci-cd`, `patterns.added: [two-tier eval gating (fast hard + nightly metadata), eval-regression issue auto-open, skip_eval_gate workflow_dispatch input]`, `decisions.made: [MessageCard plain-text Teams notify (no Logic App), 48h nightly window, 2-consecutive-red hard block]`, `files.key: [.github/workflows/{ci,evals-nightly,deploy}.yml, docs/ops/eval-gate-bypass-procedure.md]`.
</output>
