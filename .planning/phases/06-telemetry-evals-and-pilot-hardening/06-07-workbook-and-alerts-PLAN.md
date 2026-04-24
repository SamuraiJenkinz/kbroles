---
phase: 06-telemetry-evals-and-pilot-hardening
plan: 07
type: execute
wave: 4
depends_on:
  - 06-01-telemetry-foundation-PLAN.md
  - 06-02-question-hash-and-server-events-PLAN.md
  - 06-03-client-events-and-feedback-endpoint-PLAN.md
  - 06-06-ci-cd-integration-PLAN.md
files_modified:
  - ops/workbooks/kb-assistant-pilot.workbook.json
  - ops/workbooks/README.md
  - ops/bicep/alerts.bicep
  - ops/bicep/alerts.parameters.example.json
  - ops/bicep/README.md
  - ops/alerts/provision.sh
  - docs/ops/workbook-deploy-procedure.md
  - docs/ops/teams-webhook-validation-procedure.md
autonomous: true
blocks_execution_on:
  - "APPLICATIONINSIGHTS_CONNECTION_STRING + App Insights resource ID must exist (operator provisions)"
  - "Teams webhook URL provisioned and stored in AWS Secrets Manager at /mmc/cts/kb-assistant/teams-webhook-url"
  - "Teams webhook payload format validated pre-pilot — if Teams rejects Common Alert Schema JSON, a 1-2h Logic App buffer task is flagged in docs/ops/teams-webhook-validation-procedure.md (RESEARCH.md §Pitfall 7)"
  - "Plans 06-01/02/03 merged so customEvents actually exist for the workbook to query"

must_haves:
  truths:
    - "ops/workbooks/kb-assistant-pilot.workbook.json is a deployable ARM template with a stable workbookId"
    - "The workbook has 5 sections: Usage, Quality signals, Content gaps, System health, Eval trend — all KQL version-controlled"
    - "Workbook deploys via az deployment group create and is idempotent (repeated deploys do not duplicate)"
    - "Azure Monitor action group wired to Teams webhook via Common Alert Schema"
    - "Four alert rules provisioned: P1 (5xx>5%/10m), P2 fallback>25%/1h, P2 thumbs_down>15%/24h, P2 validator_flip>5%/24h, P2 nightly-eval-fail (2 consecutive)"
    - "Weekly Monday 9 AM AEST P3 digest exists (implemented as a scheduled GHA workflow posting to Teams, not an Azure Monitor alert)"
    - "Phase 5.1 deploy pipeline unchanged; this plan only adds ops/ artifacts"
  artifacts:
    - path: "ops/workbooks/kb-assistant-pilot.workbook.json"
      provides: "Full ARM template for the Usage/Quality/Gaps/Health/Eval workbook"
    - path: "ops/bicep/alerts.bicep"
      provides: "Action group + 4 alert rules as Bicep"
    - path: "ops/alerts/provision.sh"
      provides: "Idempotent shell wrapper calling az deployment group create for both workbook and alerts"
    - path: "docs/ops/workbook-deploy-procedure.md"
      provides: "One-page runbook: how to deploy the workbook to a new/existing AI resource"
    - path: "docs/ops/teams-webhook-validation-procedure.md"
      provides: "Pre-pilot checklist for validating Teams webhook accepts Common Alert Schema"
  key_links:
    - from: "ops/workbooks/kb-assistant-pilot.workbook.json"
      to: "App Insights customEvents table"
      via: "5 KQL queries reading name == 'session_start' / 'thumbs_rating' / 'fallback_trigger' / 'validator_flip' / 'eval_run_completed' etc"
      pattern: "customEvents|thumbs_rating|fallback_trigger"
    - from: "ops/bicep/alerts.bicep"
      to: "Teams webhook URL"
      via: "parameter → webhookReceivers.serviceUri"
      pattern: "webhookReceivers|serviceUri"
    - from: "ops/alerts/provision.sh"
      to: "Azure subscription"
      via: "az deployment group create with subscription + resourceGroup"
      pattern: "az deployment group create"
---

<objective>
Ship the Content Steward's primary interface (App Insights Workbook) and the Azure Monitor alert rules as version-controlled ARM/Bicep templates plus an idempotent provisioning script. The workbook is the source of truth for dashboards — no ad-hoc KQL scattered in docs.

Purpose: ROADMAP SC#4 requires "dashboard shows the event within one refresh cycle" — this plan builds that dashboard. Addresses the ownership side of SC#3 (the Steward has a single interface) and operationalises the alert tiers from CONTEXT.md. RESEARCH.md §7-8 locks schema and bicep structure.

Output: `ops/workbooks/kb-assistant-pilot.workbook.json` (ARM template) + `ops/bicep/alerts.bicep` (action group + 4 alerts) + `ops/alerts/provision.sh` (wrapper) + two operator runbooks.
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

# Direct dependencies — the workbook queries events emitted by these plans
@.planning/phases/06-telemetry-evals-and-pilot-hardening/06-01-telemetry-foundation-PLAN.md
@.planning/phases/06-telemetry-evals-and-pilot-hardening/06-02-question-hash-and-server-events-PLAN.md
@.planning/phases/06-telemetry-evals-and-pilot-hardening/06-03-client-events-and-feedback-endpoint-PLAN.md
@.planning/phases/06-telemetry-evals-and-pilot-hardening/06-06-ci-cd-integration-PLAN.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Author the App Insights Workbook ARM template with 5 sections</name>
  <files>
    ops/workbooks/kb-assistant-pilot.workbook.json
    ops/workbooks/README.md
    docs/ops/workbook-deploy-procedure.md
  </files>
  <action>
    1. Create `ops/workbooks/kb-assistant-pilot.workbook.json` as a full ARM template (not just `serializedData`). Use the deployable Microsoft.Insights/workbooks resource type. Structure:
       ```json
       {
         "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#",
         "contentVersion": "1.0.0.0",
         "parameters": {
           "workbookId": {
             "type": "string",
             "defaultValue": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
             "metadata": { "description": "Deterministic GUID — keeps re-deploys idempotent" }
           },
           "workbookSourceId": {
             "type": "string",
             "metadata": { "description": "Full resource ID of the App Insights resource this workbook reads from" }
           },
           "workbookDisplayName": {
             "type": "string",
             "defaultValue": "KB Assistant Pilot Dashboard"
           }
         },
         "resources": [
           {
             "type": "Microsoft.Insights/workbooks",
             "apiVersion": "2022-04-01",
             "name": "[parameters('workbookId')]",
             "location": "[resourceGroup().location]",
             "kind": "shared",
             "properties": {
               "displayName": "[parameters('workbookDisplayName')]",
               "sourceId": "[parameters('workbookSourceId')]",
               "category": "workbook",
               "serializedData": "__REPLACE_WITH_SERIALIZED_JSON__"
             }
           }
         ]
       }
       ```
       The `serializedData` string is a JSON-stringified object with `{"version":"Notebook/1.0","items":[...]}`. Build it by hand; each of the 5 sections is TWO items: a `type:1` markdown header ("## Section N — Usage") followed by a `type:3` KQL query item.

    2. Five sections with the KQL queries from RESEARCH.md §7 (adapt names to match the event catalog from Plan 02):

       Section 1 — Usage:
       ```kql
       customEvents
       | where timestamp > ago(7d)
       | summarize
           distinct_sessions = dcount(tostring(customDimensions["session_id_hash"])),
           distinct_users    = dcount(tostring(customDimensions["user_id_hash"])),
           questions         = countif(name == "question_hash"),
           chip_pct = round(100.0 * countif(name=="chip_vs_freeform" and customDimensions["chip_or_freeform"]=="chip")
                                  / countif(name=="chip_vs_freeform"), 1)
       ```
       Add a second tile in the same section showing role distribution:
       ```kql
       customEvents
       | where timestamp > ago(7d) and name == "role_selected"
       | summarize count() by role = tostring(customDimensions["role"])
       | render piechart
       ```

       Section 2 — Quality signals:
       ```kql
       customEvents
       | where timestamp > ago(24h)
       | summarize
           thumbs_down_pct = round(100.0 * countif(name=="thumbs_rating" and customDimensions["rating"]=="down")
                                       / iif(countif(name=="thumbs_rating") == 0, 1, countif(name=="thumbs_rating")), 1),
           fallback_pct    = round(100.0 * countif(name=="fallback_trigger")
                                       / iif(countif(name=="chat_request_completed") + countif(name=="fallback_trigger") == 0, 1, countif(name=="chat_request_completed") + countif(name=="fallback_trigger")), 1),
           validator_flip_pct = round(100.0 * countif(name=="validator_flip")
                                       / iif(countif(name=="chat_request_completed") == 0, 1, countif(name=="chat_request_completed")), 1)
       ```
       Add a breakdown tile: thumbs_down reasons over 7d:
       ```kql
       customEvents
       | where timestamp > ago(7d) and name == "thumbs_rating" and customDimensions["rating"] == "down"
       | summarize count() by reason = tostring(customDimensions["reason"])
       | render barchart
       ```

       Section 3 — Content gaps (Pitfall 15 — the steward's monthly review surface):
       ```kql
       customEvents
       | where timestamp > ago(30d) and name == "fallback_trigger"
       | summarize count() by question_hash = tostring(customDimensions["question_hash"])
       | top 20 by count_ desc
       ```
       Second tile: thumbs-down grouped by question_hash:
       ```kql
       customEvents
       | where timestamp > ago(30d) and name == "thumbs_rating" and customDimensions["rating"]=="down"
       | summarize count(), citations = make_set(tostring(customDimensions["citation_source_id"])) by question_hash = tostring(customDimensions["question_hash"])
       | top 20 by count_ desc
       ```

       Section 4 — System health:
       ```kql
       requests
       | where timestamp > ago(1h) and url endswith "/api/chat"
       | summarize
           count_total = count(),
           count_5xx   = countif(resultCode startswith "5"),
           p50_ms      = percentile(duration, 50),
           p95_ms      = percentile(duration, 95)
       | extend error_rate_pct = round(100.0 * count_5xx / count_total, 2)
       ```
       Plus an ingress-error breakdown:
       ```kql
       customEvents
       | where timestamp > ago(24h) and name == "ingress_error"
       | summarize count() by error_code = tostring(customDimensions["error_code"])
       | render barchart
       ```

       Section 5 — Eval trend (Pitfall 1 — neg-oos is the canary):
       ```kql
       customEvents
       | where timestamp > ago(30d) and name == "eval_run_completed"
       | extend suite=tostring(customDimensions["suite"]),
                pass_rate=todouble(customMeasurements["pass_rate"])
       | summarize avg_pass_rate = avg(pass_rate) by suite, bin(timestamp, 1d)
       | render timechart
       ```
       The nightly eval workflow (Plan 06) does NOT currently emit `eval_run_completed` to App Insights. Add that emission in a SMALL step:
       - Extend `.github/workflows/evals-nightly.yml` (Plan 06) — NO, that's in a merged plan. Instead, add a POST-step in `src/evals/runner/report.ts` (extend Plan 04/05 artifact): after writing `ops/evals/latest.json`, if `APPLICATIONINSIGHTS_CONNECTION_STRING` is set in env, emit one `eval_run_completed` per suite via a lightweight Application Insights ingestion API call (or use the OTel SDK if the eval runner ever gets that dep). Simplest path: add a short JS script in `scripts/emit-eval-events.ts` called as the last step of evals-nightly.yml that reads latest.json and POSTs to the AI ingestion endpoint directly using a minimal `fetch` + instrumentation key. Document this additional step.
       - If this cross-plan wiring is too intrusive, DOCUMENT the requirement in ops/workbooks/README.md: "Section 5 activates only once the eval runner emits eval_run_completed events — see Phase 6 follow-up."

       Choose the documentation approach (do not add cross-plan code changes). The KQL is still ready for the day the emission lands.

    3. Add a parameter at the top of the workbook for a `timeRange` (last 7d/24h/30d as a picker) — use `type: 9` parameter item. This lets the steward flip the whole workbook's time horizon without editing KQL.

    4. Build the `serializedData` string carefully (embedded JSON as a string within JSON — escape quotes). The final file must be valid JSON. Use a temporary builder script if needed (`scripts/build-workbook.ts` — optional; can be one-off not committed).

    5. Create `ops/workbooks/README.md` explaining: the deterministic workbookId rationale, how to add a section (copy an existing type:3 item, change the query), and how to update the serializedData (edit in the portal's Advanced Editor, export, paste back, validate).

    6. Create `docs/ops/workbook-deploy-procedure.md`:
       ```markdown
       # Deploy KB Assistant Pilot Workbook

       ## First-time deploy
       ```bash
       az deployment group create \
         --resource-group <AI_RG> \
         --template-file ops/workbooks/kb-assistant-pilot.workbook.json \
         --parameters workbookSourceId=<full-AI-resource-id>
       ```

       ## Update deploy
       Same command. Deterministic workbookId means re-runs update in place.

       ## Rollback
       `az deployment group delete --name <deployment-name>`; workbook is restored by the next redeploy from git.

       ## Validation checklist (pre-pilot)
       - [ ] All 5 sections render
       - [ ] Section 1 shows at least one session after `pnpm dev` + one chat round trip
       - [ ] Section 5 warning "no eval_run_completed events yet" is shown OR events are present
       ```
  </action>
  <verify>
    - `az deployment group create --template-file ops/workbooks/kb-assistant-pilot.workbook.json --parameters workbookSourceId=<actual-ai-resource-id> --resource-group <rg>` succeeds (operator runs this; plan-execute documents the command, can't validate in CI without live Azure).
    - `python -m json.tool < ops/workbooks/kb-assistant-pilot.workbook.json` succeeds — JSON is valid.
    - Each KQL query in the serializedData parses (use `az monitor log-analytics query --workspace <id> --analytics-query "<kql>"` for a smoke test if the operator has a workspace — plan-execute documents; not blocking).
  </verify>
  <done>
    - Valid ARM-template JSON at ops/workbooks/kb-assistant-pilot.workbook.json.
    - 5 sections with KQL matching the event catalog from Plan 02.
    - Deterministic workbookId → idempotent re-deploys.
    - README + deploy runbook committed.
    - Workbook source-of-truth discipline: no ad-hoc KQL elsewhere in docs (grep confirms).
  </done>
</task>

<task type="auto">
  <name>Task 2: Provision action group + 4 alert rules via Bicep + shell wrapper</name>
  <files>
    ops/bicep/alerts.bicep
    ops/bicep/alerts.parameters.example.json
    ops/bicep/README.md
    ops/alerts/provision.sh
    docs/ops/teams-webhook-validation-procedure.md
  </files>
  <action>
    1. Create `ops/bicep/alerts.bicep` per RESEARCH.md §8:
       ```bicep
       @description('Azure region for resources')
       param location string = resourceGroup().location

       @description('Teams incoming webhook URL — keep out of source control; pass via --parameters')
       @secure()
       param teamsWebhookUrl string

       @description('Full resource ID of the App Insights resource these alerts monitor')
       param appInsightsResourceId string

       resource actionGroup 'Microsoft.Insights/actionGroups@2023-01-01' = {
         name: 'kb-assistant-alerts'
         location: 'global'
         properties: {
           groupShortName: 'KBAssist'
           enabled: true
           webhookReceivers: [
             {
               name: 'teams-pilot'
               serviceUri: teamsWebhookUrl
               useCommonAlertSchema: true
             }
           ]
         }
       }

       // P1: /api/chat 5xx > 5% over 10 min — metric alert on requests/failed
       resource p1ChatErrorRate 'Microsoft.Insights/metricAlerts@2018-03-01' = {
         name: 'kb-p1-chat-5xx'
         location: 'global'
         properties: {
           severity: 1
           enabled: true
           scopes: [appInsightsResourceId]
           evaluationFrequency: 'PT1M'
           windowSize: 'PT10M'
           criteria: {
             'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
             allOf: [
               {
                 name: 'failedRequestPct'
                 metricNamespace: 'microsoft.insights/components'
                 metricName: 'requests/failed'
                 operator: 'GreaterThan'
                 threshold: 5
                 timeAggregation: 'Count'
                 criterionType: 'StaticThresholdCriterion'
                 // In practice this needs to be a percentage calculation;
                 // may require a log-search alert instead. Document the tradeoff.
               }
             ]
           }
           actions: [{ actionGroupId: actionGroup.id }]
         }
       }

       // P2: fallback rate > 25% / 1h — log search alert (KQL over customEvents)
       resource p2FallbackRate 'Microsoft.Insights/scheduledQueryRules@2023-03-15-preview' = {
         name: 'kb-p2-fallback-rate'
         location: location
         properties: {
           displayName: 'Fallback trigger rate above 25% in last hour'
           severity: 2
           enabled: true
           evaluationFrequency: 'PT15M'
           windowSize: 'PT1H'
           scopes: [appInsightsResourceId]
           criteria: {
             allOf: [
               {
                 query: '''customEvents
                           | where timestamp > ago(1h)
                           | summarize fallback_pct = 100.0 * countif(name=="fallback_trigger")
                             / iif(count() == 0, 1, count())
                           | where fallback_pct > 25'''
                 timeAggregation: 'Count'
                 operator: 'GreaterThan'
                 threshold: 0
               }
             ]
           }
           actions: { actionGroups: [actionGroup.id] }
         }
       }

       // P2: thumbs_down > 15% / 24h
       resource p2ThumbsDown 'Microsoft.Insights/scheduledQueryRules@2023-03-15-preview' = {
         name: 'kb-p2-thumbs-down-rate'
         // ... similar shape, window 24h, query computes thumbs_down_pct
       }

       // P2: validator_flip > 5% / 24h
       resource p2ValidatorFlip 'Microsoft.Insights/scheduledQueryRules@2023-03-15-preview' = {
         name: 'kb-p2-validator-flip-rate'
         // ... similar shape, window 24h
       }
       ```
       Document the P1 metric-vs-log tradeoff: the 5xx percentage threshold is cleanest as a log search alert; the metric variant above may need tweaking. Given the 5 min workbook refresh is fine for P1 too, implement P1 ALSO as a scheduled query rule for consistency — document that choice.

       P2 nightly-eval-fail alert is NOT an Azure Monitor alert — it's covered by Plan 06's evals-nightly.yml GitHub-issue + Teams-notify path. Document this in the Bicep file header.

    2. Create `ops/bicep/alerts.parameters.example.json`:
       ```json
       {
         "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#",
         "contentVersion": "1.0.0.0",
         "parameters": {
           "teamsWebhookUrl": { "value": "REPLACE_ME_FROM_SECRETS_MANAGER" },
           "appInsightsResourceId": { "value": "/subscriptions/<sub-id>/resourceGroups/<rg>/providers/Microsoft.Insights/components/<ai-name>" }
         }
       }
       ```
       NEVER commit the real webhook URL. The operator reads it from AWS Secrets Manager at `/mmc/cts/kb-assistant/teams-webhook-url` and injects via `--parameters teamsWebhookUrl=<value>`.

    3. Create `ops/alerts/provision.sh` — one-shot wrapper:
       ```bash
       #!/usr/bin/env bash
       set -euo pipefail

       : "${AZURE_RG:?set to the Azure resource group}"
       : "${AI_RESOURCE_ID:?set to the App Insights resource ID}"
       # Pull the webhook from AWS Secrets Manager (requires aws CLI + creds).
       : "${AWS_REGION:=us-east-1}"
       WEBHOOK="$(aws secretsmanager get-secret-value --region "$AWS_REGION" \
         --secret-id /mmc/cts/kb-assistant --query 'SecretString' --output text \
         | jq -r '.TEAMS_WEBHOOK_URL')"
       test -n "$WEBHOOK" || { echo "TEAMS_WEBHOOK_URL missing from secrets"; exit 1; }

       echo "==> Deploying workbook..."
       az deployment group create \
         --resource-group "$AZURE_RG" \
         --template-file "$(dirname "$0")/../workbooks/kb-assistant-pilot.workbook.json" \
         --parameters workbookSourceId="$AI_RESOURCE_ID"

       echo "==> Deploying alerts..."
       az deployment group create \
         --resource-group "$AZURE_RG" \
         --template-file "$(dirname "$0")/../bicep/alerts.bicep" \
         --parameters teamsWebhookUrl="$WEBHOOK" appInsightsResourceId="$AI_RESOURCE_ID"

       echo "==> Done. Teams webhook validation: see docs/ops/teams-webhook-validation-procedure.md"
       ```
       Make executable: `chmod +x ops/alerts/provision.sh` (git preserves the bit).

    4. Create `docs/ops/teams-webhook-validation-procedure.md` — RESEARCH.md Pitfall 7 surface:
       ```markdown
       # Validating the Teams Incoming Webhook (Pre-Pilot)

       Azure Monitor Action Groups send Common Alert Schema JSON. Teams incoming webhooks accept MessageCard (legacy). Validate BEFORE pilot day 1.

       ## Steps
       1. Create an incoming webhook in the #kb-assistant-pilot Teams channel.
       2. Store the URL in AWS Secrets Manager at /mmc/cts/kb-assistant (key: TEAMS_WEBHOOK_URL).
       3. Send a test Common Alert Schema payload:
          ```bash
          curl -X POST -H "Content-Type: application/json" \
            -d @fixtures/common-alert-schema-sample.json \
            "$WEBHOOK_URL"
          ```
          (include a sample payload in docs/ops/fixtures/ — one alert-fired example)
       4. Observe the Teams channel.
          - If a card renders (even raw): OK, proceed with Bicep deploy.
          - If Teams rejects or shows "Unable to display card": add a Logic App HTTP trigger → Parse JSON → Post Message to Teams. Budget ~2 hours. Document the Logic App URL as the new `teamsWebhookUrl` value.

       ## Escalation
       Issue: Teams rejects Common Alert Schema.
       Fix path: Logic App buffer. See RESEARCH.md §8.
       Owner: {{STEWARD_BACKUP_NAME}} for the Logic App provisioning.
       ```

    5. `ops/bicep/README.md` — quick index + notes on how to modify (edit alerts.bicep, re-run provision.sh; idempotent).

    NOTE: Bicep templates require `az bicep` installed. provision.sh assumes the operator has it (the deploy.yml self-hosted runner has no Azure CLI need — this is operator-only, run from an admin workstation).
  </action>
  <verify>
    - `bicep build ops/bicep/alerts.bicep` produces a valid ARM template (operator runs locally; document the command).
    - `bash -n ops/alerts/provision.sh` parses cleanly.
    - `jq . < ops/bicep/alerts.parameters.example.json` validates.
    - `chmod +x ops/alerts/provision.sh` visible in `git ls-files --stage`.
  </verify>
  <done>
    - alerts.bicep defines action group + P1 + 3 P2 alerts tied to the action group.
    - parameters.example.json never contains real secrets; real values pulled from AWS Secrets Manager at run time.
    - provision.sh is one command for the operator to re-deploy everything idempotently.
    - Teams webhook validation runbook published with a concrete fix path (Logic App buffer).
  </done>
</task>

</tasks>

<verification>
- Operator runs `bash ops/alerts/provision.sh` → workbook deploys, alerts deploy, idempotent re-run is a no-op.
- Ad-hoc POST to Teams webhook from curl with a sample Common Alert Schema payload lands in the channel as a readable card OR is documented as needing the Logic App buffer.
- Workbook opens in the Azure portal and renders all 5 sections (empty queries OK pre-pilot — the KQL parses).
- Phase 5.1 deploy pipeline unchanged (this plan only adds ops/ artifacts).
</verification>

<success_criteria>
Completes SC#4 (workbook refresh cycle visible for thumbs_down). Addresses CONTEXT.md alert-tier requirements for P1 page, P2 notifies, P3 digest (P3 moves to Plan 08 — steward docs).

- [ ] ARM workbook template valid JSON, deterministic workbookId
- [ ] 5 workbook sections with version-controlled KQL
- [ ] 4 alert rules + action group provisioned via Bicep
- [ ] Teams webhook validation runbook with Logic App buffer fallback
- [ ] Phase 5.1 pipeline and test baseline unchanged
</success_criteria>

<output>
After completion, create `.planning/phases/06-telemetry-evals-and-pilot-hardening/06-07-SUMMARY.md`. Frontmatter: `subsystem: observability`, `patterns.added: [deterministic-GUID workbook idempotence, Bicep alerts via scheduledQueryRules, Teams webhook validation runbook]`, `decisions.made: [workbook as ARM template not just serializedData, log-search-alerts over metric-alerts for percentage-based SLOs, Teams incoming webhook with Logic App fallback documented not pre-built]`, `files.key: [ops/workbooks/kb-assistant-pilot.workbook.json, ops/bicep/alerts.bicep, ops/alerts/provision.sh]`.
</output>
