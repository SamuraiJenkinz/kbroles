# Deploy KB Assistant Pilot Workbook

## Prerequisites

- Azure CLI (`az`) installed and authenticated (`az login`)
- Contributor access to the App Insights resource group
- The App Insights full resource ID (format: `/subscriptions/<sub-id>/resourceGroups/<rg>/providers/microsoft.insights/components/<ai-name>`)

## First-time deploy

```bash
az deployment group create \
  --resource-group <AI_RG> \
  --template-file ops/workbooks/kb-assistant-pilot.workbook.json \
  --parameters workbookSourceId=<full-AI-resource-id>
```

Replace `<AI_RG>` with the resource group name and `<full-AI-resource-id>` with the full App Insights resource ID.

The `workbookId` parameter defaults to `a1b2c3d4-e5f6-7890-abcd-ef1234567890`. This deterministic GUID ensures idempotence — do not override it unless you intentionally want a second workbook.

## Update deploy

Identical command. The deterministic `workbookId` means re-runs update the existing workbook in place. No duplicates are created.

```bash
az deployment group create \
  --resource-group <AI_RG> \
  --template-file ops/workbooks/kb-assistant-pilot.workbook.json \
  --parameters workbookSourceId=<full-AI-resource-id>
```

## Automated deploy (via provision.sh)

The `ops/alerts/provision.sh` wrapper deploys both the workbook and alerts in one command. Prefer this for routine operations:

```bash
export AZURE_RG=<AI_RG>
export AI_RESOURCE_ID=<full-AI-resource-id>
# AWS_REGION defaults to us-east-1 if not set
bash ops/alerts/provision.sh
```

See `ops/alerts/provision.sh` for full details.

## Rollback

To remove the workbook:

```bash
# Option 1: Delete the ARM deployment (does not delete the resource by default)
az deployment group delete --resource-group <AI_RG> --name <deployment-name>

# Option 2: Delete the workbook resource directly
az monitor app-insights workbook delete \
  --resource-group <AI_RG> \
  --name a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

The workbook is restored by rerunning the deploy command from the current git HEAD. Git is the source of truth; portal edits not committed will be overwritten on next deploy.

## Validation checklist (pre-pilot)

Run these checks after the first deploy or any update:

- [ ] **All 5 sections render** — open the workbook in the Azure portal and confirm each section header and KQL tile appears without errors (empty data is OK pre-pilot; a KQL parse error is not).
- [ ] **Section 1 shows at least one session** — run `pnpm dev`, open the assistant, send one chat message, wait ~2 minutes for App Insights ingestion, then refresh the workbook. The "distinct_sessions" tile should show 1.
- [ ] **Section 2 quality rates** — if a thumbs-down or fallback was triggered in the test above, verify the rates are non-zero.
- [ ] **Section 3 content gaps** — may be empty on day 1; confirm the table renders without KQL errors.
- [ ] **Section 4 system health** — the `/api/chat` health tile should show the request from the test above with `count_total >= 1` and a non-zero `p50_ms`.
- [ ] **Section 5 eval trend — PENDING follow-up** — this section will show "No data" until the `eval_run_completed` event emission follow-up is completed. This is expected on pilot day 1. See `ops/workbooks/README.md` for details. Do NOT treat this as a deploy failure.

## Live Azure validation caveat

The `az deployment group create` command cannot be validated in the automated CI pipeline (no live Azure subscription in CI). This is an **operator-run task**. The JSON template is validated locally via `python -m json.tool` in CI. Live deployment validation is a post-merge operator responsibility, to be completed before pilot day 1.
