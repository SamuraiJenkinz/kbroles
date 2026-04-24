# KB Assistant Alerts — Bicep

## Quick index

| File | Purpose |
|------|---------|
| `alerts.bicep` | Action group (Teams webhook) + 4 alert rules |
| `alerts.parameters.example.json` | Parameter template — copy and fill in; NEVER commit real values |

## Alert rules

| Name | Severity | Condition | Window | Frequency |
|------|----------|-----------|--------|-----------|
| `kb-p1-chat-5xx` | P1 (sev 1) | `/api/chat` 5xx > 5% | 10m | 1m |
| `kb-p2-fallback-rate` | P2 (sev 2) | fallback > 25% of requests | 1h | 15m |
| `kb-p2-thumbs-down-rate` | P2 (sev 2) | thumbs-down > 15% of ratings | 24h | 1h |
| `kb-p2-validator-flip-rate` | P2 (sev 2) | validator_flip > 5% of completions | 24h | 1h |

All four rules fire to the `kb-assistant-alerts` action group, which posts to the Teams webhook via **Common Alert Schema** (useCommonAlertSchema: true).

## P1 as scheduledQueryRule (design note)

P1 is intentionally implemented as a `scheduledQueryRule` (log-search alert), not a `metricAlert`. A percentage-based 5xx threshold requires dividing failed count by total count — this is a KQL computation, not a native metric threshold. Using `scheduledQueryRule` keeps all four rules consistent (same resource type, same parameter wiring, same action group reference) and avoids a custom-metrics ingestion pipeline.

## P2 nightly eval-fail (not here)

The "2 consecutive nightly eval failures" alert is handled by `.github/workflows/evals-nightly.yml` (Plan 06-06), not Azure Monitor. It opens a GitHub issue and sends a Teams MessageCard on consecutive CI failures. Azure Monitor cannot track cross-run state for the "2 consecutive" condition.

## How to modify alerts

1. Edit `alerts.bicep` (thresholds, window sizes, KQL queries).
2. Commit the change — git is the source of truth.
3. Re-run `ops/alerts/provision.sh` (idempotent; updates existing rules in place).

## Build and validate

```bash
# Compile Bicep to ARM JSON (requires az bicep installed)
az bicep build --file ops/bicep/alerts.bicep

# Validate parameters file
python -m json.tool < ops/bicep/alerts.parameters.example.json
```

## Deploy

Never run `az deployment group create` directly with a webhook URL on the command line (shell history). Use `ops/alerts/provision.sh` which fetches the webhook from AWS Secrets Manager:

```bash
export AZURE_RG=<resource-group>
export AI_RESOURCE_ID=<full-app-insights-resource-id>
bash ops/alerts/provision.sh
```

## Secrets policy

- `teamsWebhookUrl` is marked `@secure()` — the Bicep compiler will redact it from deployment logs.
- `alerts.parameters.example.json` contains only a `REPLACE_ME_FROM_SECRETS_MANAGER` placeholder.
- The real webhook URL lives in AWS Secrets Manager at `/mmc/cts/kb-assistant` (key: `TEAMS_WEBHOOK_URL`).
- `provision.sh` fetches it at runtime via `aws secretsmanager get-secret-value` and passes it directly to `az deployment group create --parameters`. The URL is never written to a file or logged.
