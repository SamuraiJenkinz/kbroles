---
phase: 06
plan: 07
name: workbook-and-alerts
subsystem: observability
status: complete
completed: 2026-04-24
duration: "~7 minutes"

tags:
  - azure-monitor
  - app-insights-workbook
  - bicep
  - alert-rules
  - teams-webhook
  - ops-tooling

dependency-graph:
  requires:
    - 06-01-telemetry-foundation (trackEvent + OTel SDK)
    - 06-02-question-hash-and-server-events (EVENT_NAMES catalog + server emissions)
    - 06-03-client-events-and-feedback-endpoint (client-side event emissions)
  provides:
    - App Insights workbook with 5 sections (ARM template, version-controlled KQL)
    - Azure Monitor action group + 4 alert rules (Bicep)
    - Idempotent provisioning shell wrapper
    - Teams webhook validation runbook with Logic App buffer fallback
  affects:
    - 06-08-steward-pull-and-docs (Content Steward uses this workbook as primary interface)

tech-stack:
  added:
    - Microsoft.Insights/workbooks ARM template (apiVersion 2022-04-01)
    - Microsoft.Insights/actionGroups Bicep (apiVersion 2023-01-01)
    - Microsoft.Insights/scheduledQueryRules Bicep (apiVersion 2023-03-15-preview)
  patterns:
    - deterministic-GUID workbook idempotence
    - Bicep alerts via scheduledQueryRules (vs metricAlert) for percentage-based SLOs
    - Teams webhook validation runbook with Logic App buffer documented (not pre-built)
    - aws secretsmanager pull at deploy time — never committed to source control

file-tracking:
  key-files:
    created:
      - ops/workbooks/kb-assistant-pilot.workbook.json
      - ops/workbooks/README.md
      - ops/bicep/alerts.bicep
      - ops/bicep/alerts.parameters.example.json
      - ops/bicep/README.md
      - ops/alerts/provision.sh
      - docs/ops/workbook-deploy-procedure.md
      - docs/ops/teams-webhook-validation-procedure.md
      - docs/ops/fixtures/common-alert-schema-sample.json
    modified: []

decisions:
  made:
    - id: D1
      title: Workbook as ARM template (not serializedData blob)
      rationale: Full ARM template enables `az deployment group create` with idempotent re-deploys via deterministic workbookId GUID. Raw serializedData export alone cannot be deployed without wrapping.
    - id: D2
      title: P1 as scheduledQueryRule (not metricAlert)
      rationale: Percentage-based 5xx threshold requires KQL division (failed/total). metricAlert cannot compute ratios natively without a custom metrics pipeline. scheduledQueryRule keeps all 4 rules consistent — same resource type, same parameter wiring, same action group reference. Plan-authorized deviation.
    - id: D3
      title: Teams webhook Logic App fallback documented (not pre-built)
      rationale: Building the Logic App speculatively adds ~2h complexity when it may not be needed. The procedure documents the exact steps to provision it within 2h if Teams rejects Common Alert Schema. Operator validates pre-pilot via curl test.
    - id: D4
      title: Section 5 (eval_run_completed) kept as inert KQL
      rationale: The KQL is correct and version-controlled. No plan currently emits eval_run_completed to App Insights. Cross-plan code changes were explicitly ruled out by the plan instruction. Follow-up task documents the exact path (scripts/emit-eval-events.ts + evals-nightly.yml step) when ready.
    - id: D5
      title: AWS Secrets Manager pull in provision.sh (not parameters file)
      rationale: Keeps the real webhook URL out of any file on disk. provision.sh fetches at runtime via aws secretsmanager get-secret-value and passes directly to az deployment group create --parameters. Never logged or written to disk.
---

# Phase 06 Plan 07: Workbook and Alerts Summary

**One-liner:** ARM workbook template (5 KQL sections) + Bicep scheduledQueryRules action group (4 alerts) wired to Teams webhook via Common Alert Schema, deployed idempotently via provision.sh.

## What was built

### Task 1: App Insights Workbook ARM Template

`ops/workbooks/kb-assistant-pilot.workbook.json` is a deployable ARM template (`Microsoft.Insights/workbooks`, apiVersion `2022-04-01`) containing:

- **Parameters:** `workbookId` (deterministic GUID `a1b2c3d4-e5f6-7890-abcd-ef1234567890`), `workbookSourceId`, `workbookDisplayName`
- **Time-range picker** (`type:9`) defaulting to last 7 days with 24h/7d/30d options
- **5 sections × 2 items each** (type:1 markdown header + type:3 KQL query):
  - Section 1 — Usage: distinct_sessions/users, questions, chip_pct; role pie (`role_selected`)
  - Section 2 — Quality: thumbs_down_pct, fallback_pct, validator_flip_pct; down-reasons bar (`thumbs_rating`, `fallback_trigger`, `chat_request_completed`, `validator_flip`)
  - Section 3 — Content gaps: top-20 fallback hashes, top-20 thumbs-down hashes by `question_hash` (`fallback_trigger`, `thumbs_rating`)
  - Section 4 — System health: requests `url endswith "/api/chat"` count/5xx/p50/p95; `ingress_error` bar
  - Section 5 — Eval trend: `eval_run_completed` timechart — **INERT pilot day 1** (see follow-up requirement below)

All event names verified against `src/obs/eventSchema.ts` EVENT_NAMES.

Supporting docs:
- `ops/workbooks/README.md`: workbookId rationale, add-section guide, Advanced-Editor round-trip workflow, Section 5 warning
- `docs/ops/workbook-deploy-procedure.md`: first-time/update/rollback `az deployment group create` commands; validation checklist with explicit Section 5 pending-follow-up flag

### Task 2: Bicep Alert Rules + Provision Script

`ops/bicep/alerts.bicep` deploys:
- `Microsoft.Insights/actionGroups@2023-01-01` `kb-assistant-alerts`: Teams webhook with `useCommonAlertSchema: true`
- 4 `Microsoft.Insights/scheduledQueryRules@2023-03-15-preview`:
  - `kb-p1-chat-5xx` (sev 1): 5xx > 5% of /api/chat over 10m, evaluated every 1m
  - `kb-p2-fallback-rate` (sev 2): fallback_trigger > 25% of completions over 1h, evaluated every 15m
  - `kb-p2-thumbs-down-rate` (sev 2): thumbs_down > 15% of ratings over 24h, evaluated every 1h
  - `kb-p2-validator-flip-rate` (sev 2): validator_flip > 5% of completions over 24h, evaluated every 1h

`ops/alerts/provision.sh`:
- Bash strict mode (`set -euo pipefail`)
- `AZURE_RG` + `AI_RESOURCE_ID` env var assertions; `AWS_REGION` defaults to `us-east-1`
- Fetches `TEAMS_WEBHOOK_URL` from AWS Secrets Manager at `/mmc/cts/kb-assistant` via `aws secretsmanager get-secret-value | jq -r .TEAMS_WEBHOOK_URL`
- Two sequential `az deployment group create` calls (workbook then alerts)
- Idempotent — safe to re-run; mode 100755

Supporting docs:
- `ops/bicep/alerts.parameters.example.json`: `REPLACE_ME_FROM_SECRETS_MANAGER` placeholder only
- `ops/bicep/README.md`: quick index, alert table, P1 design note, modification guide, secrets policy
- `docs/ops/teams-webhook-validation-procedure.md`: curl test with `docs/ops/fixtures/common-alert-schema-sample.json`, pass/fail paths, Logic App buffer fallback (~2h), `{{STEWARD_BACKUP_NAME}}` placeholder
- `docs/ops/fixtures/common-alert-schema-sample.json`: valid minimal Common Alert Schema payload (kb-p1-chat-5xx shape)

## Decisions Made

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Full ARM template (not raw serializedData) | Enables `az deployment group create` idempotent deploy with deterministic GUID |
| D2 | P1 as scheduledQueryRule (not metricAlert) | Percentage SLO needs KQL division; keeps all 4 rules consistent resource type |
| D3 | Logic App buffer documented not pre-built | Speculative 2h work avoided; operator validates pre-pilot via curl, builds if needed |
| D4 | Section 5 kept as inert KQL | eval_run_completed not yet emitted; cross-plan code changes ruled out; follow-up documented |
| D5 | Webhook URL fetched at deploy runtime | Keeps secret out of all files; provision.sh fetches and passes inline to az CLI |

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as specified for all success criteria.

### Authorized Deviations (documented in plan)

**[Plan-authorized] P1 as scheduledQueryRule**
- The plan explicitly authorizes P1 as scheduledQueryRule instead of metricAlert: "Implementing P1 as scheduledQueryRule NOT metricAlert (plan-authorized deviation for consistency with P2)"
- KQL percentage calculation cannot be expressed as a native metric threshold without a custom metrics ingestion pipeline
- Documented in `ops/bicep/alerts.bicep` file header and `ops/bicep/README.md`

**[Plan-authorized] Section 5 inert**
- The plan explicitly authorizes documenting Section 5 as inert: "Do NOT add cross-plan emission code"
- `eval_run_completed` is defined in EVENT_NAMES but no plan emits it to App Insights
- Documented in `ops/workbooks/README.md` (follow-up requirement) and `docs/ops/workbook-deploy-procedure.md` (validation checklist)

### Cross-plan Attribution Note

During Task 2 commit, files from the concurrent 06-08 agent (`scripts/pull-servicenow-feedback.ts`, `scripts/validate-servicenow-schema.ts`, `scripts/__tests__/pull-servicenow-feedback.test.ts`, `ops/rejected-articles/`) were committed under the 06-07 commit hash `be9d974`. These files were already staged by the 06-08 agent. No content conflict exists — both plans' files are correct. The 06-08 SUMMARY should reference these files as committed in `be9d974`.

## Verification Results

| Check | Result |
|-------|--------|
| `python -m json.tool < ops/workbooks/kb-assistant-pilot.workbook.json` | PASS |
| `python -m json.tool < ops/bicep/alerts.parameters.example.json` | PASS |
| `python -m json.tool < docs/ops/fixtures/common-alert-schema-sample.json` | PASS |
| `bash -n ops/alerts/provision.sh` | PASS |
| `git ls-files -s ops/alerts/provision.sh` shows mode 100755 | PASS |
| All 9 queried EVENT_NAMES present in workbook KQL | PASS |
| Alert KQL uses correct event names from schema | PASS |
| 728 unit tests green (716 baseline + 12 concurrent 06-08) | PASS |
| Phase 5.1 deploy pipeline unchanged | PASS |
| `pnpm typecheck` | FAIL (concurrent 06-08 agent TypeScript errors in scripts/ — not this plan's files) |

### Live Azure validation caveat

`az deployment group create` and `az bicep build` cannot be run in the automated sandbox (no live Azure subscription). These are **operator-run tasks** post-merge:
1. `az bicep build --file ops/bicep/alerts.bicep` — confirms Bicep compiles to valid ARM
2. `bash ops/alerts/provision.sh` — deploys workbook + alerts to the pilot Azure resource group
3. Teams webhook curl test per `docs/ops/teams-webhook-validation-procedure.md`

These are documented as pre-pilot operator responsibilities, not CI blocking checks.

## Follow-up Requirements

### Section 5 activation (eval_run_completed emission)

Section 5 of the workbook shows "No data" until `eval_run_completed` events flow to App Insights. The follow-up path:

1. Create `scripts/emit-eval-events.ts` that reads `ops/evals/latest.json` and POSTs one `eval_run_completed` event per suite to App Insights using the OTel SDK (`trackEvent` from `src/obs/telemetry.ts`)
2. Add a final step to `.github/workflows/evals-nightly.yml` that calls this script (with `APPLICATIONINSIGHTS_CONNECTION_STRING` available as a GitHub secret)

Track as a Phase 6 follow-up item.

## Next Phase Readiness

- Content Steward workbook is version-controlled and deployable
- Alert rules cover all 4 required P1/P2 conditions from CONTEXT.md
- Teams webhook validation procedure provides the pre-pilot operator checklist
- Plan 06-08 (steward pull + docs) can proceed — workbook is the interface it documents
