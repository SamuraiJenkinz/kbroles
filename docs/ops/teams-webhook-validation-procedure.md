# Validating the Teams Incoming Webhook (Pre-Pilot)

Azure Monitor Action Groups send **Common Alert Schema** JSON to webhook receivers. Teams incoming webhooks natively accept MessageCard (legacy) format. These are different schemas. Validate compatibility BEFORE pilot day 1 to avoid silent alert delivery failures.

## Why this matters

If Teams rejects the Common Alert Schema payload, P1 and P2 alerts will fire in Azure Monitor but no notification will appear in the Teams channel. The fallback path (Logic App buffer, ~2h) is documented below.

## Prerequisites

- Teams channel `#kb-assistant-pilot` with an incoming webhook connector created.
- Webhook URL stored in AWS Secrets Manager at `/mmc/cts/kb-assistant` (key: `TEAMS_WEBHOOK_URL`).
- `curl` and `aws` CLI available on the workstation.

## Steps

### 1. Retrieve the webhook URL

```bash
WEBHOOK_URL="$(aws secretsmanager get-secret-value \
  --region us-east-1 \
  --secret-id /mmc/cts/kb-assistant \
  --query 'SecretString' \
  --output text \
  | jq -r '.TEAMS_WEBHOOK_URL')"
echo "Webhook URL retrieved: ${#WEBHOOK_URL} chars"
```

### 2. Send a test Common Alert Schema payload

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d @docs/ops/fixtures/common-alert-schema-sample.json \
  "$WEBHOOK_URL"
```

The fixture at `docs/ops/fixtures/common-alert-schema-sample.json` is a minimal but structurally-complete Common Alert Schema payload simulating a `kb-p1-chat-5xx` firing.

### 3. Observe the Teams channel

Open the `#kb-assistant-pilot` channel and check for a new message.

#### Pass path

A card renders in the channel (even if the formatting is plain text rather than a rich card). This confirms Teams accepts the webhook payload.

Action: Proceed with `ops/alerts/provision.sh`. Azure Monitor will route real alerts through the same path.

#### Fail path

Teams shows **"Unable to display card"**, the message appears blank, or the `curl` command returns a non-200 response.

Action: **Add a Logic App buffer** (see below). Budget ~2 hours. Do not proceed with alert provisioning until the Logic App is in place.

## Logic App buffer fallback

If Teams rejects Common Alert Schema directly, insert a Logic App as a translation layer:

1. Create an Azure Logic App with an **HTTP Request** trigger (generates a new webhook URL).
2. Add a **Parse JSON** action using the Common Alert Schema as the schema template (paste the fixture).
3. Add a **Post message in a chat or channel (V3)** Teams action mapping `essentials.alertRule`, `essentials.severity`, and `essentials.firedDateTime` to the message body.
4. Update the action group's `serviceUri` in `ops/bicep/alerts.bicep` to the Logic App trigger URL.
5. Store the Logic App URL in AWS Secrets Manager at `/mmc/cts/kb-assistant` (key: `TEAMS_WEBHOOK_URL`) — `provision.sh` will use it automatically.

**Owner for Logic App provisioning:** `{{STEWARD_BACKUP_NAME}}`

See also: [RESEARCH.md §Pitfall 7 — Logic App buffer for Common Alert Schema compatibility].

## Escalation

| Issue | Fix | Owner | Budget |
|-------|-----|-------|--------|
| Teams rejects Common Alert Schema | Logic App buffer (above) | `{{STEWARD_BACKUP_NAME}}` | ~2h |
| AWS Secrets Manager missing TEAMS_WEBHOOK_URL | Create Teams connector, add to secret | Operator | ~15m |
| Logic App fails to post to Teams | Check Teams connector permissions; re-authorize | `{{STEWARD_BACKUP_NAME}}` | ~30m |

## References

- `docs/ops/fixtures/common-alert-schema-sample.json` — test payload
- `ops/bicep/alerts.bicep` — action group definition (`useCommonAlertSchema: true`)
- `ops/alerts/provision.sh` — automated deploy script
- [Azure Common Alert Schema docs](https://learn.microsoft.com/azure/azure-monitor/alerts/alerts-common-schema)
