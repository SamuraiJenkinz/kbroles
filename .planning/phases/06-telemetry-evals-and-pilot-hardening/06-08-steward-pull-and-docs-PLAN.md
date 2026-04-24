---
phase: 06-telemetry-evals-and-pilot-hardening
plan: 08
type: execute
wave: 4
depends_on:
  - 06-01-telemetry-foundation-PLAN.md
  - 06-07-workbook-and-alerts-PLAN.md
files_modified:
  - src/config/secrets.ts
  - scripts/pull-servicenow-feedback.ts
  - scripts/__tests__/pull-servicenow-feedback.test.ts
  - scripts/validate-servicenow-schema.ts
  - .github/workflows/steward-monthly.yml
  - .github/workflows/weekly-digest.yml
  - ops/rejected-articles/.gitkeep
  - ops/rejected-articles/README.md
  - docs/content-steward-runbook.md
  - docs/measurement-plan.md
  - vitest.config.ts
autonomous: true
blocks_execution_on:
  - "Operator must provision a ServiceNow service account with read access to kb_knowledge + kb_feedback and store credentials as JSON blob in AWS Secrets Manager at /mmc/cts/kb-assistant (key: SERVICENOW_SERVICE_ACCOUNT)"
  - "SN_INSTANCE env var (e.g. 'mmcnow') and APPLICATIONINSIGHTS_CONNECTION_STRING available as GHA secrets for the monthly pull workflow"
  - "User picks the Content Steward name + backup name before pilot day 1 — placeholders land in the runbook PR at that time"
  - "Open question from RESEARCH.md: u_rejection_reason field existence on the live SN instance — Task 1a validates via REST API Explorer before the pull script runs"

must_haves:
  truths:
    - "scripts/pull-servicenow-feedback.ts pulls rejected/outdated articles + kb_feedback rows from ServiceNow via REST and writes ops/rejected-articles/YYYY-MM.json"
    - "A baseline pull (ops/rejected-articles/baseline-pre-pilot.json) is captured by running the same script with a 90-day window"
    - ".github/workflows/steward-monthly.yml runs on the 1st of each month on ubuntu-latest, skips cleanly when the 1st is a weekend"
    - "A monthly run opens a GitHub issue titled 'Content Steward review: YYYY-MM rejected articles (N items)' with a checklist of articles + links"
    - ".github/workflows/weekly-digest.yml runs Mondays 09:00 AEST, queries App Insights for the weekly summary, posts a single Teams card (P3 tier from CONTEXT.md)"
    - "docs/content-steward-runbook.md + docs/measurement-plan.md committed with {{STEWARD_NAME}} + {{STEWARD_BACKUP_NAME}} placeholders, signed off before pilot day 1"
    - "No existing test (597 unit + 19 E2E) regresses; scripts/ code is stand-alone and does not run in the main test suite"
  artifacts:
    - path: "scripts/pull-servicenow-feedback.ts"
      provides: "Monthly SN pull — writes dated JSON to ops/rejected-articles/"
    - path: "scripts/validate-servicenow-schema.ts"
      provides: "Pre-task: queries SN instance, confirms u_rejection_reason + workflow_state enum"
    - path: ".github/workflows/steward-monthly.yml"
      provides: "Cron on 1st of month, weekend-skip, issue-open"
    - path: ".github/workflows/weekly-digest.yml"
      provides: "P3 weekly summary to Teams on Monday AEST morning"
    - path: "docs/content-steward-runbook.md"
      provides: "Steward ownership, cadence, pull steps, PR template, escalation"
      contains: "{{STEWARD_NAME}}"
    - path: "docs/measurement-plan.md"
      provides: "Paired-metric baseline methodology, monthly comparison plan, signoff checklist"
      contains: "paired-metric baseline"
  key_links:
    - from: "scripts/pull-servicenow-feedback.ts"
      to: "src/config/secrets.ts (loadSecrets pattern)"
      via: "await loadSecrets(); JSON-parse SERVICENOW_SERVICE_ACCOUNT"
      pattern: "loadSecrets|SERVICENOW_SERVICE_ACCOUNT"
    - from: ".github/workflows/steward-monthly.yml"
      to: "scripts/pull-servicenow-feedback.ts"
      via: "node --loader tsx scripts/pull-servicenow-feedback.ts"
      pattern: "pull-servicenow-feedback"
    - from: ".github/workflows/weekly-digest.yml"
      to: "Teams webhook + App Insights KQL"
      via: "az monitor log-analytics query + curl to TEAMS_WEBHOOK_URL"
      pattern: "TEAMS_WEBHOOK_URL|az monitor"
---

<objective>
Stand up the monthly Content-Steward loop (SN pull → JSON archive → GitHub issue) and the weekly P3 digest, plus the two signed-off documents required by ROADMAP SC#3 (measurement-plan) and Pitfall 8 (named steward). Capture a pre-pilot baseline so the paired-metric comparison in measurement-plan.md has a starting value.

Purpose: Satisfies TELE-04 (monthly pull process + named Content Steward) and the documentation half of SC#3. Addresses Pitfalls 8 (version-poller + named steward), 14 (pre-registered measurement plan), and 15 (real-query review expands fixture coverage).

Output: `scripts/pull-servicenow-feedback.ts` + `scripts/validate-servicenow-schema.ts` + two GHA workflows + two docs with placeholders + ops/rejected-articles/ directory convention + baseline-pre-pilot.json capture step.
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
@.planning/phases/06-telemetry-evals-and-pilot-hardening/06-01-telemetry-foundation-PLAN.md
@.planning/phases/06-telemetry-evals-and-pilot-hardening/06-07-workbook-and-alerts-PLAN.md

# Existing loader pattern to reuse
@src/config/secrets.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add SN credential to SECRET_KEYS + implement schema-validate + pull scripts</name>
  <files>
    src/config/secrets.ts
    scripts/validate-servicenow-schema.ts
    scripts/pull-servicenow-feedback.ts
    scripts/__tests__/pull-servicenow-feedback.test.ts
    ops/rejected-articles/.gitkeep
    ops/rejected-articles/README.md
  </files>
  <action>
    1. Extend `SECRET_KEYS` in `src/config/secrets.ts` — add:
       - `'SERVICENOW_SERVICE_ACCOUNT'` (JSON blob string: `{"username":"...","password":"..."}`)
       - `'SN_INSTANCE'` (the SN subdomain, e.g. `mmcnow`)
       - `'TEAMS_WEBHOOK_URL'` (used by weekly-digest workflow; already referenced in Plan 07 via parameters but now committed as a SECRET_KEYS entry for dev-env completeness)
       Preserve all existing entries. The module-cached loader picks these up at the first loadSecrets() call — no body changes needed.

    2. Create `scripts/validate-servicenow-schema.ts` — a dry-run that addresses RESEARCH.md Open Question #1 (u_rejection_reason field existence):
       ```typescript
       import { loadSecrets } from '../src/config/secrets'

       async function main() {
         await loadSecrets()
         const sa = JSON.parse(process.env.SERVICENOW_SERVICE_ACCOUNT ?? '{}')
         const token = Buffer.from(`${sa.username}:${sa.password}`).toString('base64')
         const instance = process.env.SN_INSTANCE
         const schemaUrl = `https://${instance}.service-now.com/api/now/doc/table/schema/kb_knowledge`
         const res = await fetch(schemaUrl, { headers: { Authorization: `Basic ${token}`, Accept: 'application/json' } })
         if (!res.ok) throw new Error(`SN schema fetch ${res.status}: ${await res.text()}`)
         const { result } = (await res.json()) as { result: { elements: Array<{ name: string; label: string }> } }
         const fields = result.elements.map(e => e.name)
         console.log('kb_knowledge fields:', fields.length)
         const hasRejectionReason = fields.includes('u_rejection_reason') || fields.includes('rejection_reason')
         console.log('u_rejection_reason or rejection_reason present:', hasRejectionReason)
         if (!hasRejectionReason) console.warn('WARN: no rejection_reason field. Pull script will omit it from the output.')
         // Also print the workflow_state enum choices
         const wsRes = await fetch(`https://${instance}.service-now.com/api/now/table/sys_choice?sysparm_query=name=kb_knowledge^element=workflow_state`, {
           headers: { Authorization: `Basic ${token}`, Accept: 'application/json' },
         })
         if (wsRes.ok) {
           const { result: choices } = await wsRes.json() as { result: Array<{ value: string; label: string }> }
           console.log('workflow_state values:', choices.map(c => c.value))
         }
       }
       main().catch(e => { console.error(e); process.exit(1) })
       ```
       Add a `pnpm sn:validate` script in package.json: `"sn:validate": "tsx scripts/validate-servicenow-schema.ts"`.
       This script is run ONCE by the operator before the first monthly pull, and saved output is pasted into the runbook as a reference.

    3. Create `scripts/pull-servicenow-feedback.ts` — the monthly pull per RESEARCH.md §6:
       ```typescript
       import { loadSecrets } from '../src/config/secrets'
       import { mkdir, writeFile } from 'node:fs/promises'
       import path from 'node:path'

       interface KbRecord {
         sys_id: string
         number: string
         short_description: string
         workflow_state: string
         rejection_reason?: string     // optional; may be u_rejection_reason
         sys_updated_on: string
         feedback_count?: number
       }

       async function snGet(pathname: string, params: Record<string, string>) {
         const sa = JSON.parse(process.env.SERVICENOW_SERVICE_ACCOUNT!)
         const token = Buffer.from(`${sa.username}:${sa.password}`).toString('base64')
         const instance = process.env.SN_INSTANCE!
         const url = new URL(`https://${instance}.service-now.com${pathname}`)
         Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
         const res = await fetch(url, { headers: { Authorization: `Basic ${token}`, Accept: 'application/json' } })
         if (!res.ok) throw new Error(`SN ${res.status}: ${await res.text()}`)
         return (await res.json()) as { result: Record<string, unknown>[] }
       }

       async function main() {
         await loadSecrets()
         const isBaseline = process.argv.includes('--baseline')
         const windowLabel = isBaseline ? 'baseline-pre-pilot' : new Date().toISOString().slice(0, 7)
         const rangeKql = isBaseline
           ? 'sys_updated_onONLast 90 days@javascript:gs.beginningOfLast90Days()@javascript:gs.endOfLast90Days()'
           : 'sys_updated_onONThis month@javascript:gs.beginningOfThisMonth()@javascript:gs.endOfThisMonth()'

         const kb = await snGet('/api/now/table/kb_knowledge', {
           sysparm_query: `workflow_stateINretired,outdated,draft^${rangeKql}`,
           sysparm_fields: 'sys_id,number,short_description,workflow_state,u_rejection_reason,sys_updated_on',
           sysparm_limit: '500',
         })

         // Correlate with kb_feedback rows for each article
         const feedback = await snGet('/api/now/table/kb_feedback', {
           sysparm_query: `${rangeKql}`,
           sysparm_fields: 'article.sys_id,article.number,rating,comments,sys_created_on',
           sysparm_limit: '2000',
         })
         const feedbackByArticle = new Map<string, number>()
         for (const row of feedback.result) {
           const articleId = row['article.sys_id'] as string | undefined
           if (articleId) feedbackByArticle.set(articleId, (feedbackByArticle.get(articleId) ?? 0) + 1)
         }

         const records: KbRecord[] = kb.result.map(r => ({
           sys_id: r.sys_id as string,
           number: r.number as string,
           short_description: r.short_description as string,
           workflow_state: r.workflow_state as string,
           rejection_reason: (r.u_rejection_reason as string) || undefined,
           sys_updated_on: r.sys_updated_on as string,
           feedback_count: feedbackByArticle.get(r.sys_id as string) ?? 0,
         }))

         const outDir = path.join(process.cwd(), 'ops/rejected-articles')
         await mkdir(outDir, { recursive: true })
         const outFile = path.join(outDir, `${windowLabel}.json`)
         await writeFile(outFile, JSON.stringify({ captured_at: new Date().toISOString(), window: windowLabel, count: records.length, records }, null, 2), 'utf8')
         console.log(`Wrote ${records.length} records to ${outFile}`)
       }

       main().catch(e => { console.error(e); process.exit(1) })
       ```
       NB: field `u_rejection_reason` is optional — the TS `as string | undefined` + `|| undefined` guard handles absence. Pagination: 500 limit is safe for monthly pulls (~<200 records typical per CONTEXT.md). If the X-Total-Count response header exceeds 500, log a warning; add a TODO to paginate.

    4. `scripts/__tests__/pull-servicenow-feedback.test.ts` — Vitest test that mocks global `fetch` and asserts:
       - Request URLs include the expected sysparm_query + sysparm_fields.
       - The auth header is `Basic <base64(user:pass)>`.
       - The aggregated output includes `feedback_count` from the second call.
       - `--baseline` flag changes the output filename to `baseline-pre-pilot.json`.
       - Missing `u_rejection_reason` in the response yields `undefined` (not the string `'undefined'`).
       Do NOT hit the real SN API. Use `vi.stubGlobal('fetch', mockFn)`.

    5. `ops/rejected-articles/.gitkeep` + `ops/rejected-articles/README.md`:
       ```markdown
       # Rejected Articles Archive

       Output from `scripts/pull-servicenow-feedback.ts`. One file per month: YYYY-MM.json. `baseline-pre-pilot.json` captured once before pilot.

       File shape: `{ captured_at, window, count, records: [{sys_id, number, short_description, workflow_state, rejection_reason?, sys_updated_on, feedback_count}] }`.

       Steward's monthly workflow consumes these via the GHA-opened issue's checklist links.
       ```
  </action>
  <verify>
    - `pnpm tsc --noEmit scripts/pull-servicenow-feedback.ts` typechecks.
    - `pnpm test scripts/__tests__/pull-servicenow-feedback.test.ts` passes (≥5 assertions).
    - Extend `vitest.config.ts` so script tests run under `pnpm test`: add `scripts/__tests__/**/*.test.*` to the Vitest `include` glob (next to the existing `src/**/*.test.*`). This is unconditional — do NOT skip on the assumption the glob already covers scripts/. Commit the config change in the same commit as the test file.
    - `pnpm test` overall: 597+ prior + new script test, all green; the new script test must show up in the run summary (not silently skipped).
    - `ls ops/rejected-articles/` shows the placeholder README and .gitkeep.
  </verify>
  <done>
    - SECRET_KEYS extended with SERVICENOW_SERVICE_ACCOUNT, SN_INSTANCE, TEAMS_WEBHOOK_URL.
    - Two scripts committed: validate-servicenow-schema (dry-run) + pull-servicenow-feedback (monthly + --baseline).
    - Unit test covers auth, fields, paths, --baseline flag, absent u_rejection_reason handling.
    - ops/rejected-articles/ exists as a convention directory with README.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create steward-monthly + weekly-digest GHA workflows</name>
  <files>
    .github/workflows/steward-monthly.yml
    .github/workflows/weekly-digest.yml
  </files>
  <action>
    1. `.github/workflows/steward-monthly.yml` per RESEARCH.md §5b — first-of-month with weekend skip:
       ```yaml
       name: Content Steward Monthly Pull
       on:
         schedule:
           - cron: '0 1 1 * *'   # 01:00 UTC on the 1st of each month
         workflow_dispatch:
           inputs:
             baseline:
               description: 'Run with --baseline flag (pre-pilot snapshot)'
               type: boolean
               default: false
       jobs:
         pull:
           name: Pull rejected/outdated articles from ServiceNow
           runs-on: ubuntu-latest
           steps:
             - name: Skip if scheduled on weekend
               if: ${{ github.event_name == 'schedule' }}
               run: |
                 DAY=$(date -u +%u)   # 1=Mon .. 7=Sun
                 if [ "$DAY" -ge 6 ]; then
                   echo "::notice::First of month is a weekend (day $DAY). Skipping auto-run. Operator: trigger via workflow_dispatch next business day."
                   exit 0
                 fi
             - uses: actions/checkout@v4
             - uses: pnpm/action-setup@v4
               with: { version: 9 }
             - uses: actions/setup-node@v4
               with: { node-version: '20.x', cache: 'pnpm' }
             - run: pnpm install --frozen-lockfile
             - name: Run SN pull
               env:
                 AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
                 AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
                 AWS_REGION: us-east-1
                 AWS_SECRET_NAME: /mmc/cts/kb-assistant
               run: |
                 if [ "${{ inputs.baseline }}" = "true" ]; then
                   pnpm exec tsx scripts/pull-servicenow-feedback.ts --baseline
                 else
                   pnpm exec tsx scripts/pull-servicenow-feedback.ts
                 fi
             - name: Commit archive + open steward issue
               uses: actions/github-script@v7
               env:
                 MONTH: ${{ github.run_id }}
               with:
                 script: |
                   const fs = require('fs')
                   const path = require('path')
                   const files = fs.readdirSync('ops/rejected-articles').filter(f => f.endsWith('.json') && f !== 'README.md')
                   const latest = files.sort().pop()
                   if (!latest) { core.setFailed('No archive file written'); return }
                   const data = JSON.parse(fs.readFileSync(`ops/rejected-articles/${latest}`, 'utf8'))
                   const body = [
                     `Monthly steward review for window **${data.window}** — ${data.count} records.`,
                     '',
                     '## Checklist — decide which articles warrant new eval fixtures',
                     ...data.records.slice(0, 50).map(r => `- [ ] **${r.number}** — ${r.short_description} — state: ${r.workflow_state} — feedback: ${r.feedback_count ?? 0} — reason: ${r.rejection_reason ?? '(none)'}`),
                     '',
                     data.records.length > 50 ? `_(+${data.records.length - 50} more in ops/rejected-articles/${latest})_` : '',
                     '',
                     '## Decision framework',
                     '- Signal (update `src/evals/fixtures/real-query-coverage.json` via PR)',
                     '- Noise (mark with NOISE comment, archive)',
                     '- Needs-investigation (link to Teams thread)',
                     '',
                     'Runbook: docs/content-steward-runbook.md',
                   ].join('\n')
                   await github.rest.issues.create({
                     owner: context.repo.owner,
                     repo: context.repo.repo,
                     title: `Content Steward review: ${data.window} rejected articles (${data.count} items)`,
                     body,
                     labels: ['content-steward'],
                     assignees: [process.env.STEWARD_GH_HANDLE].filter(Boolean),
                   })
             - name: Commit archive back to main
               run: |
                 git config user.name 'github-actions[bot]'
                 git config user.email 'github-actions[bot]@users.noreply.github.com'
                 git add ops/rejected-articles/
                 git commit -m "chore(steward): monthly SN pull $(date -u +%Y-%m)" || echo "nothing to commit"
                 git push
       ```
       Document: `STEWARD_GH_HANDLE` is an optional repo variable (not a secret) set to the steward's GitHub username; absent → no auto-assign. The `aws` credentials are repo secrets configured by the operator.

    2. `.github/workflows/weekly-digest.yml` — P3 tier from CONTEXT.md:
       ```yaml
       name: Weekly Pilot Digest
       on:
         schedule:
           - cron: '0 23 * * 0'   # Sunday 23:00 UTC = Monday 09:00 AEST (UTC+10, AEST has no DST)
         workflow_dispatch: {}
       jobs:
         digest:
           name: Post weekly digest to Teams
           runs-on: ubuntu-latest
           steps:
             - uses: azure/login@v2
               with:
                 creds: ${{ secrets.AZURE_CREDENTIALS }}
             - name: Query App Insights for weekly summary
               id: q
               run: |
                 SUMMARY=$(az monitor app-insights query \
                   --app "${{ secrets.APP_INSIGHTS_APP_ID }}" \
                   --analytics-query "
                     customEvents
                     | where timestamp > ago(7d)
                     | summarize
                         sessions = dcount(tostring(customDimensions[\"session_id_hash\"])),
                         users = dcount(tostring(customDimensions[\"user_id_hash\"])),
                         thumbs_down = countif(name == 'thumbs_rating' and customDimensions[\"rating\"] == 'down'),
                         fallback = countif(name == 'fallback_trigger'),
                         total_requests = countif(name == 'chat_request_completed')
                   " --query 'tables[0].rows[0]' -o json)
                 echo "summary<<EOF" >> $GITHUB_OUTPUT
                 echo "$SUMMARY" >> $GITHUB_OUTPUT
                 echo "EOF" >> $GITHUB_OUTPUT
             - name: Post to Teams
               env:
                 TEAMS: ${{ secrets.TEAMS_WEBHOOK_URL }}
                 SUMMARY: ${{ steps.q.outputs.summary }}
               run: |
                 # Read SUMMARY from the env var (not an inline expression) to avoid shell-injection
                 # on quotes/newlines in the KQL JSON output. jq --arg reads stdin env vars safely.
                 PAYLOAD=$(jq -n --arg s "$SUMMARY" '{text: ("**Weekly KB Assistant Digest**\n```json\n" + $s + "\n```\nWorkbook: https://portal.azure.com/#@tenant/.../workbook")}')
                 curl -sS -X POST -H 'Content-Type: application/json' -d "$PAYLOAD" "$TEAMS"
       ```
       The plain-text MessageCard format (RESEARCH.md §8) is used; no Logic App needed for this. If the steward wants richer formatting later, the workflow can be upgraded.

    NB: `AZURE_CREDENTIALS` is a SP JSON blob (operator task to provision via `az ad sp create-for-rbac`). Document this prerequisite in the workflow's top comment.
  </action>
  <verify>
    - `gh workflow run steward-monthly.yml -f baseline=true` — triggers the baseline run; watch it complete; `ops/rejected-articles/baseline-pre-pilot.json` is created and committed to main.
    - `gh workflow run weekly-digest.yml` — posts a card to Teams with the previous-7-day summary.
    - On a Saturday, the scheduled cron hits the skip path (log message visible, exit 0).
    - Linting: `yamllint .github/workflows/*.yml` is clean.
  </verify>
  <done>
    - steward-monthly.yml runs on schedule + workflow_dispatch (with --baseline input).
    - Weekend-skip works; operator can trigger manually post-skip.
    - Issue opened with a checklist of records + decision framework + runbook link.
    - Archive committed back to main via GH Actions bot.
    - weekly-digest.yml posts a Teams card every Monday 09:00 AEST.
  </done>
</task>

<task type="auto">
  <name>Task 3: Write content-steward-runbook.md + measurement-plan.md with placeholders</name>
  <files>
    docs/content-steward-runbook.md
    docs/measurement-plan.md
  </files>
  <action>
    1. Create `docs/content-steward-runbook.md`:
       ```markdown
       # Content Steward Runbook

       **Steward:** {{STEWARD_NAME}}
       **Backup:** {{STEWARD_BACKUP_NAME}}
       **Signoff date:** {{SIGNOFF_DATE}} (must precede pilot day 1)

       ## Ownership
       One named individual is accountable for the monthly rejected-article review and eval-fixture backlog. Vacation coverage is the backup above.

       ## Cadence
       - Monthly: 1st business day of each month — review the auto-opened GitHub issue
       - Weekly: glance at the App Insights Workbook for anomalies (no deliverable)
       - Ad-hoc: respond to eval-regression issues opened by the nightly CI job

       ## Monthly pull procedure
       1. On the 1st of each month, GitHub Actions runs `scripts/pull-servicenow-feedback.ts` (see .github/workflows/steward-monthly.yml).
       2. An issue titled "Content Steward review: YYYY-MM rejected articles (N items)" is auto-opened and assigned.
       3. For each article in the checklist:
          - **Signal**: real gap → open a PR adding an entry to `src/evals/fixtures/real-query-coverage.json` or `src/evals/fixtures/negative-oos.json` per article type
          - **Noise**: procedural rejection, already re-published → mark the checkbox with "NOISE: <reason>"
          - **Needs investigation**: not enough context → open a Teams thread in #kb-assistant-pilot
       4. Close the issue when all items are triaged. Archive is preserved in `ops/rejected-articles/YYYY-MM.json`.

       ## PR template for new fixtures
       ```markdown
       ## What
       Add {N} fixtures derived from YYYY-MM rejected-article review.

       ## Why
       Article(s) {KB numbers} surfaced gaps in {suite(s)}.

       ## Eval impact
       - negative-out-of-scope: +{N} fixtures
       - paired-role: +{N} fixtures
       - real-query-coverage: +{N} fixtures

       ## Verification
       - `pnpm eval:slow` passes locally
       - Nightly eval picks up the new fixtures on the next run
       ```

       ## Escalation
       - Two consecutive nightly reds → investigate before next deploy (see docs/ops/eval-gate-bypass-procedure.md)
       - ServiceNow pull failure → manually run `pnpm exec tsx scripts/pull-servicenow-feedback.ts` and file an infra issue
       - Steward + backup both unavailable → PM picks a third delegate; this is allowed once per quarter

       ## Signoff
       - [ ] Steward reviewed this runbook
       - [ ] Backup reviewed this runbook
       - [ ] PM reviewed measurement-plan.md
       - Date: {{SIGNOFF_DATE}}
       ```

    2. Create `docs/measurement-plan.md`:
       ```markdown
       # Measurement Plan — KB Assistant Pilot

       **Owner:** {{STEWARD_NAME}}
       **Pilot window:** {{PILOT_START_DATE}} → {{PILOT_END_DATE}} (TBD)
       **Signoff date:** {{SIGNOFF_DATE}} (must precede pilot day 1 per Pitfall 14)

       ## Primary metrics (pre-registered)
       1. **Paired-metric flagged-article-rate**: 30/60/90-day monthly rate of articles transitioning to `retired`/`outdated`/`draft` states.
          - Baseline: `ops/rejected-articles/baseline-pre-pilot.json` captured pre-pilot via `steward-monthly --baseline`.
          - Monthly comparison: `ops/rejected-articles/YYYY-MM.json` vs baseline.
          - Success signal: not monotonic improvement expected; reduction ≥10% over pilot suggests pilot helped. Absent effect is NOT failure by itself; confounders documented below.
       2. **Fallback rate**: workbook Section 2 `fallback_pct` over 7d, target ≤ 25%. Trending directionally important more than absolute level.
       3. **Thumbs-down rate per role**: workbook Section 2 thumbs_down_pct; target ≤ 15% per role; 👎 reasons distribution guides fix backlog priority.
       4. **Grounding eval pass rates**: all 6 eval suites hold their thresholds (neg-oos 95%, paired-role 98%, citation-substring 99%, injection-refuse 95%, entity-allowlist 100%, positional |t1-t8|≤2pp) for the duration of pilot.

       ## Secondary metrics
       - Usage: distinct sessions + users over 7d (Section 1).
       - Citation click-through rate per source_id (Section 2 breakdown).
       - Validator flip rate ≤ 5% (Section 2).
       - System health: p50 < 2s, p95 < 8s, 5xx < 1% (Section 4).
       - Eval-run trend stable/improving (Section 5).

       ## Confounders (pre-registered)
       - Incidental ServiceNow article cleanup unrelated to assistant (control via: steward annotates "noise" entries).
       - Seasonal/holiday dip in KB usage (control via: YoY comparison where a prior year exists).
       - Pilot cohort self-selection bias (user handles cohort selection out-of-band; record selection method in pilot-start README).

       ## Data sources
       - App Insights customEvents (pilot window)
       - ServiceNow `kb_knowledge` + `kb_feedback` tables (baseline + monthly pulls)
       - `ops/evals/history/*.json` (eval pass-rate trend)

       ## Review cadence
       - Weekly: Monday 9 AM AEST Teams digest (workflow: weekly-digest.yml).
       - Monthly: Content Steward review issue (workflow: steward-monthly.yml).
       - End-of-pilot: 1-page retro by Steward + PM comparing primary metrics to baseline.

       ## Signoff
       - [ ] Steward reviewed and committed to cadence
       - [ ] PM reviewed; primary/secondary metrics agreed
       - [ ] Eng on-call reviewed (alerting + rollback)
       - Date: {{SIGNOFF_DATE}}

       ## References
       - ROADMAP Phase 6 SC#3
       - CONTEXT.md §Steward + rejected-article pull
       - RESEARCH.md §6 (SN REST fields)
       - ops/rejected-articles/baseline-pre-pilot.json
       ```

    3. Both docs use Handlebars-style placeholders `{{STEWARD_NAME}}`, `{{STEWARD_BACKUP_NAME}}`, `{{SIGNOFF_DATE}}`, `{{PILOT_START_DATE}}`, `{{PILOT_END_DATE}}`. A follow-up PR (user-driven, not in this plan) fills them in before pilot day 1.

    4. Link both docs from the repo root README.md IF an existing "Operations" or "Docs" section exists. Do NOT invent a new README structure if none exists.
  </action>
  <verify>
    - `ls docs/content-steward-runbook.md docs/measurement-plan.md` exist.
    - `grep "{{STEWARD_NAME}}" docs/*.md` matches (placeholder preserved).
    - `grep "{{SIGNOFF_DATE}}" docs/*.md` matches.
    - Both docs reference the correct workflow filenames, script filenames, and ops/ paths.
  </verify>
  <done>
    - docs/content-steward-runbook.md committed with placeholders.
    - docs/measurement-plan.md committed with primary + secondary metrics + confounders + signoff checklist.
    - Docs explicitly reference the pre-pilot baseline capture (Pitfall 14).
    - Docs reference all previously-built plan artifacts (workflows, scripts, ops/ dirs) for traceability.
  </done>
</task>

</tasks>

<verification>
- `pnpm exec tsx scripts/validate-servicenow-schema.ts` (operator, manual) confirms `u_rejection_reason` presence and workflow_state enum values, output pasted into the runbook.
- `gh workflow run steward-monthly.yml -f baseline=true` completes, produces `ops/rejected-articles/baseline-pre-pilot.json`, opens a GH issue.
- `gh workflow run weekly-digest.yml` posts a Teams card.
- Both docs exist with placeholders.
- 597+ unit tests (plus 1 script test) + 19+ E2E continue to pass.
</verification>

<success_criteria>
Satisfies TELE-04 (monthly pull + named steward + documented cadence) + ROADMAP SC#3 (measurement plan signed off pre-pilot). Addresses Pitfalls 8 (named steward + version poller), 14 (pre-registered measurement plan), 15 (monthly real-query coverage loop).

- [ ] SN pull script works against the live instance (validated by schema dry-run first)
- [ ] Baseline capture step is documented + runnable via workflow_dispatch
- [ ] Monthly steward workflow opens a checklist issue on the 1st
- [ ] Weekly digest posts to Teams Monday 09:00 AEST
- [ ] Runbook + measurement-plan have {{STEWARD_NAME}} placeholders ready for pre-pilot fill-in
- [ ] 597+ unit tests + 19/19 E2E remain green
</success_criteria>

<output>
After completion, create `.planning/phases/06-telemetry-evals-and-pilot-hardening/06-08-SUMMARY.md`. Frontmatter: `subsystem: ops+docs`, `patterns.added: [cron-1st-of-month with weekend skip, schema-validate-before-pull, Handlebars placeholders for steward name]`, `decisions.made: [GitHub-hosted not Windows runner for SN pull; MessageCard plain-text for Teams digest; --baseline flag reuses same script]`, `files.key: [scripts/pull-servicenow-feedback.ts, .github/workflows/steward-monthly.yml, docs/content-steward-runbook.md, docs/measurement-plan.md]`.
</output>
