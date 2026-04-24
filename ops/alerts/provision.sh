#!/usr/bin/env bash
# ops/alerts/provision.sh
#
# Idempotent provisioning script — deploys the KB Assistant workbook and
# alert rules to Azure. Safe to re-run; resources are updated in place.
#
# Prerequisites:
#   - az CLI authenticated (az login or service-principal env vars)
#   - aws CLI authenticated with access to /mmc/cts/kb-assistant secret
#   - az bicep installed (az bicep install)
#
# Usage:
#   export AZURE_RG=<resource-group-name>
#   export AI_RESOURCE_ID=<full-app-insights-resource-id>
#   bash ops/alerts/provision.sh
#
# Optional:
#   export AWS_REGION=<region>   # defaults to us-east-1
#
# See docs/ops/teams-webhook-validation-procedure.md for Teams webhook
# validation before pilot day 1.
# See docs/ops/workbook-deploy-procedure.md for workbook-only deploys.

set -euo pipefail

# ---------------------------------------------------------------------------
# Required environment variables
# ---------------------------------------------------------------------------
: "${AZURE_RG:?Required: set AZURE_RG to the Azure resource group name}"
: "${AI_RESOURCE_ID:?Required: set AI_RESOURCE_ID to the full App Insights resource ID}"

# AWS_REGION defaults to us-east-1 if not set
AWS_REGION="${AWS_REGION:-us-east-1}"

# Resolve script directory so relative paths work regardless of cwd
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

WORKBOOK_TEMPLATE="${REPO_ROOT}/ops/workbooks/kb-assistant-pilot.workbook.json"
ALERTS_BICEP="${REPO_ROOT}/ops/bicep/alerts.bicep"

# ---------------------------------------------------------------------------
# Fetch Teams webhook from AWS Secrets Manager
# ---------------------------------------------------------------------------
echo "==> Fetching Teams webhook URL from AWS Secrets Manager..."
WEBHOOK="$(aws secretsmanager get-secret-value \
  --region "${AWS_REGION}" \
  --secret-id /mmc/cts/kb-assistant \
  --query 'SecretString' \
  --output text \
  | jq -r '.TEAMS_WEBHOOK_URL')"

if [ -z "${WEBHOOK}" ] || [ "${WEBHOOK}" = "null" ]; then
  echo "ERROR: TEAMS_WEBHOOK_URL missing or null in /mmc/cts/kb-assistant secret."
  echo "       Store the Teams incoming webhook URL at key TEAMS_WEBHOOK_URL in"
  echo "       AWS Secrets Manager secret /mmc/cts/kb-assistant (region: ${AWS_REGION})."
  exit 1
fi

echo "    Webhook URL retrieved (${#WEBHOOK} chars)."

# ---------------------------------------------------------------------------
# Deploy workbook
# ---------------------------------------------------------------------------
echo ""
echo "==> Deploying KB Assistant Pilot workbook..."
az deployment group create \
  --resource-group "${AZURE_RG}" \
  --template-file "${WORKBOOK_TEMPLATE}" \
  --parameters workbookSourceId="${AI_RESOURCE_ID}"

echo "    Workbook deployed."

# ---------------------------------------------------------------------------
# Deploy alerts (Bicep)
# ---------------------------------------------------------------------------
echo ""
echo "==> Deploying alert rules and action group..."
az deployment group create \
  --resource-group "${AZURE_RG}" \
  --template-file "${ALERTS_BICEP}" \
  --parameters teamsWebhookUrl="${WEBHOOK}" appInsightsResourceId="${AI_RESOURCE_ID}"

echo "    Alerts deployed."

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
echo ""
echo "==> Provisioning complete."
echo "    Workbook:  KB Assistant Pilot Dashboard (workbookId: a1b2c3d4-e5f6-7890-abcd-ef1234567890)"
echo "    Action group: kb-assistant-alerts"
echo "    Alert rules: kb-p1-chat-5xx, kb-p2-fallback-rate, kb-p2-thumbs-down-rate, kb-p2-validator-flip-rate"
echo ""
echo "    NEXT STEPS:"
echo "    1. Validate Teams webhook: see docs/ops/teams-webhook-validation-procedure.md"
echo "    2. Verify workbook renders: see docs/ops/workbook-deploy-procedure.md (validation checklist)"
echo "    3. Section 5 (Eval trend) will show 'No data' until eval_run_completed emission follow-up lands."
