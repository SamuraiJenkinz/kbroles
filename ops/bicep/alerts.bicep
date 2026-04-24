// KB Assistant Pilot — Azure Monitor Alert Rules + Action Group
//
// Deploys:
//   - 1 action group (Teams webhook via Common Alert Schema)
//   - 1 P1 scheduledQueryRule: /api/chat 5xx > 5% over 10 min
//   - 3 P2 scheduledQueryRules: fallback rate, thumbs-down rate, validator-flip rate
//
// NOTE — P2 nightly eval-fail alert:
//   The "2 consecutive nightly eval failures" alert is NOT implemented here as
//   an Azure Monitor alert. It is handled by the evals-nightly.yml GitHub Actions
//   workflow (Plan 06-06), which opens a GitHub issue and sends a Teams MessageCard
//   via curl when two consecutive runs fail. Azure Monitor lacks cross-run state
//   tracking needed for the "2-consecutive" condition.
//
// NOTE — P1 implementation as scheduledQueryRule (not metricAlert):
//   The 5xx percentage threshold is a ratio (failed/total), which metricAlert
//   cannot compute natively without a custom metric. Using scheduledQueryRule
//   keeps all four alert rules consistent (same resource type, same deploy path,
//   same action group wiring) and avoids the custom-metrics ingestion pipeline.
//   This is a plan-authorized deviation documented in ops/bicep/README.md.
//
// Bicep build: az bicep build --file ops/bicep/alerts.bicep
// Deploy:      run ops/alerts/provision.sh (idempotent)

@description('Azure region for resources. Defaults to resource group location.')
param location string = resourceGroup().location

@description('Teams incoming webhook URL — NEVER commit the real value. Pass at deploy time from AWS Secrets Manager (/mmc/cts/kb-assistant key: TEAMS_WEBHOOK_URL) or via ops/alerts/provision.sh which fetches it automatically.')
@secure()
param teamsWebhookUrl string

@description('Full resource ID of the App Insights resource these alerts monitor. Example: /subscriptions/<sub>/resourceGroups/<rg>/providers/microsoft.insights/components/<ai-name>')
param appInsightsResourceId string

// ---------------------------------------------------------------------------
// Action Group — Teams webhook
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// P1 — /api/chat 5xx rate > 5% over 10 minutes
// ---------------------------------------------------------------------------
// Fires when more than 5% of /api/chat responses in the last 10 minutes
// returned a 5xx status code. Evaluated every 1 minute.

resource p1ChatErrorRate 'Microsoft.Insights/scheduledQueryRules@2023-03-15-preview' = {
  name: 'kb-p1-chat-5xx'
  location: location
  properties: {
    displayName: 'P1: /api/chat 5xx error rate above 5% in last 10 minutes'
    description: 'Fires when 5xx responses exceed 5% of all /api/chat requests in a 10-minute window. Investigate app logs immediately.'
    severity: 1
    enabled: true
    evaluationFrequency: 'PT1M'
    windowSize: 'PT10M'
    scopes: [
      appInsightsResourceId
    ]
    criteria: {
      allOf: [
        {
          query: '''requests
| where timestamp > ago(10m) and url endswith "/api/chat"
| summarize
    count_total = count(),
    count_5xx   = countif(resultCode startswith "5")
| extend error_rate_pct = 100.0 * count_5xx / iif(count_total == 0, 1, count_total)
| where error_rate_pct > 5'''
          timeAggregation: 'Count'
          operator: 'GreaterThan'
          threshold: 0
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    actions: {
      actionGroups: [
        actionGroup.id
      ]
    }
  }
}

// ---------------------------------------------------------------------------
// P2 — Fallback trigger rate > 25% over 1 hour
// ---------------------------------------------------------------------------
// Fires when more than 25% of completed chat requests triggered a fallback
// in the last hour. Indicates content coverage degradation.

resource p2FallbackRate 'Microsoft.Insights/scheduledQueryRules@2023-03-15-preview' = {
  name: 'kb-p2-fallback-rate'
  location: location
  properties: {
    displayName: 'P2: Fallback trigger rate above 25% in last hour'
    description: 'Fires when fallback_trigger events exceed 25% of (chat_request_completed + fallback_trigger) in the last hour. Review content gaps in Section 3 of the workbook.'
    severity: 2
    enabled: true
    evaluationFrequency: 'PT15M'
    windowSize: 'PT1H'
    scopes: [
      appInsightsResourceId
    ]
    criteria: {
      allOf: [
        {
          query: '''customEvents
| where timestamp > ago(1h)
| summarize
    fallback_count   = countif(name == "fallback_trigger"),
    completed_count  = countif(name == "chat_request_completed")
| extend fallback_pct = 100.0 * fallback_count / iif(fallback_count + completed_count == 0, 1, fallback_count + completed_count)
| where fallback_pct > 25'''
          timeAggregation: 'Count'
          operator: 'GreaterThan'
          threshold: 0
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    actions: {
      actionGroups: [
        actionGroup.id
      ]
    }
  }
}

// ---------------------------------------------------------------------------
// P2 — Thumbs-down rate > 15% over 24 hours
// ---------------------------------------------------------------------------
// Fires when more than 15% of thumbs_rating events in the last 24 hours
// are rated "down". Indicates answer quality degradation.

resource p2ThumbsDown 'Microsoft.Insights/scheduledQueryRules@2023-03-15-preview' = {
  name: 'kb-p2-thumbs-down-rate'
  location: location
  properties: {
    displayName: 'P2: Thumbs-down rate above 15% in last 24 hours'
    description: 'Fires when thumbs_rating "down" events exceed 15% of all thumbs_rating events in the last 24 hours. Review Section 2 of the workbook for reasons breakdown.'
    severity: 2
    enabled: true
    evaluationFrequency: 'PT1H'
    windowSize: 'PT24H'
    scopes: [
      appInsightsResourceId
    ]
    criteria: {
      allOf: [
        {
          query: '''customEvents
| where timestamp > ago(24h) and name == "thumbs_rating"
| summarize
    total_ratings = count(),
    down_ratings  = countif(customDimensions["rating"] == "down")
| extend thumbs_down_pct = 100.0 * down_ratings / iif(total_ratings == 0, 1, total_ratings)
| where thumbs_down_pct > 15'''
          timeAggregation: 'Count'
          operator: 'GreaterThan'
          threshold: 0
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    actions: {
      actionGroups: [
        actionGroup.id
      ]
    }
  }
}

// ---------------------------------------------------------------------------
// P2 — Validator flip rate > 5% over 24 hours
// ---------------------------------------------------------------------------
// Fires when validator_flip events (citations stripped by validateCitations)
// exceed 5% of chat_request_completed events in the last 24 hours.
// Indicates KB citation quality or allowlist drift.

resource p2ValidatorFlip 'Microsoft.Insights/scheduledQueryRules@2023-03-15-preview' = {
  name: 'kb-p2-validator-flip-rate'
  location: location
  properties: {
    displayName: 'P2: Validator flip rate above 5% in last 24 hours'
    description: 'Fires when validator_flip events exceed 5% of chat_request_completed events in the last 24 hours. Indicates citations are being stripped at an elevated rate — check the KB allowlist.'
    severity: 2
    enabled: true
    evaluationFrequency: 'PT1H'
    windowSize: 'PT24H'
    scopes: [
      appInsightsResourceId
    ]
    criteria: {
      allOf: [
        {
          query: '''customEvents
| where timestamp > ago(24h)
| summarize
    completed_count = countif(name == "chat_request_completed"),
    flip_count      = countif(name == "validator_flip")
| extend validator_flip_pct = 100.0 * flip_count / iif(completed_count == 0, 1, completed_count)
| where validator_flip_pct > 5'''
          timeAggregation: 'Count'
          operator: 'GreaterThan'
          threshold: 0
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    actions: {
      actionGroups: [
        actionGroup.id
      ]
    }
  }
}
