# Phase 6: Telemetry, Evals & Pilot Hardening — Research

**Researched:** 2026-04-24
**Domain:** Azure Monitor Application Insights (Node.js SDK), OpenTelemetry, eval harness architecture, GitHub Actions scheduling, ServiceNow REST, Azure Workbooks ARM
**Confidence:** HIGH on SDK/API, MEDIUM on eval architecture, LOW on ServiceNow field names

---

## Summary

Phase 6 wires telemetry, eval gates, and steward tooling together. The biggest shape decision — which App Insights SDK surface to use — resolves clearly: use `@azure/monitor-opentelemetry` (version 1.16.0+, OTel-native) NOT the classic `applicationinsights` package, because the classic package has serious webpack/ESM bundling issues with Next.js App Router that require hacky NormalModuleReplacementPlugin workarounds. The OTel path initialises cleanly in `instrumentation.ts` with a Node-only dynamic import guard, needs one addition to `serverExternalPackages`, and custom business events emit via `@opentelemetry/api` spans with attributes (these become `customEvents` in App Insights).

For evals, the stack already uses Vitest + a clean `src/llm/` client abstraction. Bespoke Vitest runner suites beat promptfoo here: promptfoo YAML config is powerful for prompt-engineer workflows but adds an unnecessary opaque dependency when the existing Vitest + MSW test infrastructure already handles fixture → LLM call → assertion loops. The bespoke path gives full TypeScript control over per-suite thresholds, best-of-3 judge retry, and flake quarantine.

The 5-second thumbs-down criterion (SC#4) is NOT achievable end-to-end through App Insights standard ingestion (~2-5 min pipeline). The pragmatic read is: "visible within one workbook refresh" means visible within the 5-min workbook auto-refresh after the server `trackEvent` completes — not 5 seconds wall-clock to portal. The 5s budget is the browser → `/api/feedback` → server `trackEvent` round-trip; Live Metrics Stream cannot be embedded in a Workbook tile and is a separate portal view only.

**Primary recommendation:** `@azure/monitor-opentelemetry@^1.16.0` + bespoke Vitest eval runner + `POST /api/feedback` endpoint for thumbs rating.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why This |
|---------|---------|---------|----------|
| `@azure/monitor-opentelemetry` | ^1.16.0 | App Insights OTel distro — auto-instruments HTTP, emits traces/metrics/logs | Official MS distro, ESM-compatible, cleanly integrates with Next.js `instrumentation.ts` |
| `@opentelemetry/api` | ^1.9.0 (peer) | Tracer/meter/logger API for custom spans and events | Required to emit business events as custom spans |
| `vitest` | already installed ^3.0.0 | Eval runner harness | Already present; full TypeScript, fixture imports, async iterator support |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `uuid` | Node built-in `crypto.randomUUID()` | message_id generation | Already used in `/api/chat` |
| `node:crypto` | built-in | SHA-256 question hashing | Use `createHash`, NOT `subtle.digest` (see pitfall #1) |

### Do NOT Install

| Package | Reason |
|---------|--------|
| `applicationinsights` (classic) | webpack bundling issues with `native_metrics.node` and `@opentelemetry/*` in Next.js App Router; requires `NormalModuleReplacementPlugin` hacks |
| `promptfoo` | Powerful but opaque YAML DSL; adds heavy dependency for a pattern Vitest already handles |
| `deepeval` | Python-only; incompatible stack |
| `@0dep/pino-applicationinsights` | Community transport, unmaintained — OTel path subsumes this need |

**Installation:**
```bash
pnpm add @azure/monitor-opentelemetry @opentelemetry/api
```

---

## Architecture Patterns

### 1. App Insights Initialisation: `instrumentation.ts` + `instrumentation.node.ts`

**Pattern (HIGH confidence — verified against official docs + Next.js 15/16 docs):**

```
src/
  instrumentation.ts          # entry — runtime guard only
  instrumentation.node.ts     # Node-only — calls useAzureMonitor
  obs/
    logger.ts                 # existing pino logger (unchanged)
    telemetry.ts              # thin wrapper: trackBusinessEvent(), hashQuestion()
```

`instrumentation.ts`:
```typescript
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation.node')
  }
}
```

`instrumentation.node.ts`:
```typescript
import { useAzureMonitor } from '@azure/monitor-opentelemetry'

// MUST be called before any other imports that touch http/net.
// Connection string read from process.env (loaded by loadSecrets() at app start).
useAzureMonitor({
  azureMonitorExporterOptions: {
    connectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING,
  },
  enableLiveMetrics: true,          // ~1s latency portal view (separate from workbook)
  enableStandardMetrics: true,
  samplingRatio: 1,                  // zero sampling for pilot
  instrumentationOptions: {
    http: { enabled: true },
    bunyan: { enabled: false },
    winston: { enabled: false },
  },
})
```

`next.config.ts` — add to existing `serverExternalPackages`:
```typescript
serverExternalPackages: ['pino', 'pino-pretty', '@azure/monitor-opentelemetry'],
```

**Critical:** `useAzureMonitor` must run before any HTTP module is imported. The `instrumentation.ts` file satisfies this because Next.js calls `register()` before routing starts.

**ESM note:** The package docs say ESM apps need `--import @azure/monitor-opentelemetry/loader` as a Node.js flag. However, Next.js standalone output runs `node server.js` (CJS entry point generated by Next.js). The `instrumentation.ts` dynamic import approach covers the Next.js case — the `--import` flag is needed only for raw ESM entry-point apps. Verified: no extra Node flags needed for Next.js standalone.

---

### 2. Custom Business Events (pino ↔ App Insights correlation)

**Decision (MEDIUM confidence):** Do NOT use a pino transport to App Insights. Use a thin dual-emit wrapper in `src/obs/telemetry.ts` that:
- Emits structured pino log (existing path)
- Emits an OTel span with attributes for App Insights `customEvents`

**Why not pino transport:** The available transports (`pino-applicationinsights`, `@0dep/pino-applicationinsights`) target the classic `applicationinsights` SDK, not `@azure/monitor-opentelemetry`. Maintaining two SDK paths would be fragile.

**Correlation mechanism:** `@azure/monitor-opentelemetry` auto-instruments `http` — each inbound request gets a trace span. The OTel `trace.getActiveSpan()` within a route handler carries the same `operation_id` that App Insights will surface. Emit custom events as child spans of that active span:

```typescript
// src/obs/telemetry.ts
import { trace, SpanKind, SpanStatusCode } from '@opentelemetry/api'

const tracer = trace.getTracer('kb-assistant')

export function trackBusinessEvent(
  name: string,
  dimensions: Record<string, string>,
  measurements?: Record<string, number>,
): void {
  const span = tracer.startSpan(name, {
    kind: SpanKind.INTERNAL,
    attributes: {
      ...dimensions,
      ...measurements,
      'event.name': name,   // App Insights surfaces this as customEvent name
    },
  })
  span.end()
  // Also emit to pino for local dev visibility:
  logger.info({ event: name, ...dimensions, ...measurements }, name)
}
```

**Correlation field:** `request_id` from pino is a custom dimension on each business event. Carry it into `trackBusinessEvent()` calls from route handlers.

**OTel → App Insights mapping:** Spans become `customEvents` in App Insights when the span name matches an event name and the span kind is INTERNAL. The `operation_Id` in App Insights is the OTel `traceId`, so pino's `request_id` and App Insights `operation_Id` will diverge (pino uses UUID, OTel uses hex trace ID). Recommendation: emit both as custom dimensions on each event. Do not try to force them to match — they serve different audiences.

---

### 3. Question Hashing

**Implementation (HIGH confidence — Node built-ins):**

Use `node:crypto` `createHash` synchronously. Do NOT use `subtle.digest` (Web Crypto) — it returns a Promise and adds async complexity in a hot path; `createHash` is synchronous and available in all Node.js versions.

```typescript
// src/obs/hashQuestion.ts
import { createHash } from 'node:crypto'

const SALT_ENV = 'QUESTION_HASH_SALT'

/** Returns a 16-char hex prefix of SHA-256(salt+normalised). */
export function hashQuestion(raw: string): string {
  const salt = process.env[SALT_ENV] ?? ''
  const normalised = raw
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.?!]+$/, '')
  return createHash('sha256')
    .update(salt + normalised)
    .digest('hex')
    .slice(0, 16)
}
```

**Secret loading:** `QUESTION_HASH_SALT` is loaded from AWS Secrets Manager path `/mmc/cts/kb-assistant/question-hash-salt` via the existing `loadSecrets()` pattern — extend `SECRET_KEYS` in `src/config/secrets.ts`. The module-level cache in `loadSecrets()` means zero per-request Secrets Manager calls; `hashQuestion()` reads from `process.env` which is set during `loadSecrets()` at startup. No new infrastructure needed.

**Normalisation spec:** NFC normalisation, lowercase, collapse whitespace (`\s+` → ` `), trim, strip trailing `.?!`. This matches the CONTEXT.md spec and is sufficient for deduplication without over-stripping.

---

### 4. Eval Runner Architecture

**Decision: Bespoke Vitest runner (HIGH confidence for this project).**

**Rationale:**
- Vitest is already installed and the test infrastructure (MSW, TypeScript, fixture import) is mature
- `src/llm/client.ts` provides a clean abstraction — eval tests call `createLlmClient()` just like production code
- promptfoo's evaluate() API is powerful but requires YAML config DSL and its own provider abstraction that duplicates `src/llm/client.ts`; it also installs ~50MB of transitive deps
- The required features (best-of-3 retry, per-suite thresholds, flake quarantine, JSON report) are 100-200 lines of TypeScript on top of Vitest

**File layout:**
```
src/evals/
  fixtures/
    entity-allowlist.json          # deterministic
    citation-substring.json        # deterministic
    negative-oos.json              # LLM-judge
    paired-role.json               # LLM-judge
    injection-refuse.json          # LLM-judge
    positional.json                # LLM-judge (multi-turn)
    real-query-coverage.json       # steward-appended
  runner/
    types.ts                       # EvalFixture, EvalResult, SuiteReport
    judge.ts                       # LLM-judge call with best-of-3 retry
    thresholds.ts                  # per-suite pass rate config
    report.ts                      # writes JSON to ops/evals/latest.json
  suites/
    entity-allowlist.eval.ts       # fast
    citation-substring.eval.ts     # fast
    negative-oos.eval.ts           # slow (LLM-judge)
    paired-role.eval.ts            # slow
    injection-refuse.eval.ts       # slow
    positional.eval.ts             # slow (multi-turn)
```

**Fixture shape for standard suites:**
```json
[
  {
    "id": "neg-oos-001",
    "input": "What is the capital of France?",
    "expected_behavior": "refuse",
    "description": "Out-of-scope geography question"
  }
]
```

**Positional fixture shape (multi-turn):**
```json
[
  {
    "id": "pos-001",
    "turns": [
      {"role": "user", "content": "How do I reset my password?"},
      {"role": "assistant", "content": "__EVAL_FILL__"}
    ],
    "target_turn": 0,
    "anchor_topic": "password-reset"
  }
]
```

For positional evals: drive `/api/chat` as a headless POST with a cookie jar (iron-session cookie mock via `iron-session`'s `sealData` directly in the eval harness — no browser needed). Compare entailment score at turn 1 vs turn 8 by running the same question at both turn depths and scoring with the LLM judge. "Entailment" is binary: judge rates whether the answer correctly addresses the anchor topic (1/0). The |t1 - t8| ≤ 2pp threshold is checked across the fixture set.

**Best-of-3 retry in judge.ts:**
```typescript
async function judgeWithRetry(prompt: string): Promise<0 | 1> {
  const votes = await Promise.all([judge(prompt), judge(prompt), judge(prompt)])
  return (votes.filter(v => v === 1).length >= 2) ? 1 : 0
}
```

**Flake quarantine:** Track run-to-run variance across 3 consecutive nightly runs. If a fixture ID's pass rate fluctuates > 10pp between runs, append to `ops/evals/flaky-review.json` and exclude from threshold gate. Implement as a post-run script reading the last 3 JSON reports.

**Vitest config for evals:**
```json
// vitest.eval.config.ts — separate config, not the main test run
{
  test: {
    include: ['src/evals/suites/**/*.eval.ts'],
    testTimeout: 60000,
    reporters: ['json'],
    outputFile: 'ops/evals/latest.json'
  }
}
```

**`pnpm eval` script:** `vitest run --config vitest.eval.config.ts`

**Sub-suite selection:** `pnpm eval --project entity-allowlist` or via `--grep` on describe block names.

---

### 5. GitHub Actions Workflow Specifics

**a. `evals-nightly.yml`:**
```yaml
on:
  schedule:
    - cron: '0 20 * * *'   # 8 PM UTC = 6 AM AEST next day
  workflow_dispatch: {}

jobs:
  slow-evals:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: '20.x', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm eval
        env:
          LLM_JUDGE_API_KEY: ${{ secrets.LLM_JUDGE_API_KEY }}
          LLM_JUDGE_BASE_URL: ${{ secrets.LLM_JUDGE_BASE_URL }}
          # Project LLM creds not needed — evals call judge directly
      - name: Upload eval report
        uses: actions/upload-artifact@v4
        with:
          name: eval-report-${{ github.run_id }}
          path: ops/evals/latest.json
      - name: Fail and open issue on threshold miss
        if: failure()
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs')
            const report = JSON.parse(fs.readFileSync('ops/evals/latest.json', 'utf8'))
            await github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: `Nightly eval failure ${new Date().toISOString().slice(0,10)}`,
              body: '```json\n' + JSON.stringify(report.failures, null, 2) + '\n```',
              labels: ['eval-failure']
            })
```

**Report format:** Write a JSON file with `{ suites: [{name, passRate, threshold, passed}], failures: [...], timestamp }`. The deploy gate reads `ops/evals/latest.json` artifact.

**b. `steward-monthly.yml` — "first business day" workaround:**

Cron does NOT support "first business day" natively. Standard pattern: schedule on `0 1 1-7 * 1` (first Monday of month) — but this misses months where the 1st is Mon and schedules the 2nd Mon. The correct approach:

```yaml
on:
  schedule:
    - cron: '0 1 1 * *'    # run on the 1st of each month
  workflow_dispatch: {}

jobs:
  steward-pull:
    runs-on: ubuntu-latest   # GitHub-hosted (no sensitive data in build step)
    steps:
      - name: Skip if weekend
        run: |
          DAY=$(date +%u)   # 1=Mon ... 7=Sun
          if [ "$DAY" -ge 6 ]; then
            echo "First of month is weekend; skipping (operator runs manually next business day)"
            exit 0
          fi
      - ... rest of steps
```

Accept the edge case: if the 1st is a weekend, the workflow exits 0 (no error) and the operator's runbook says "check the GH Actions tab on the first business day and trigger manually if needed." This is simpler and more reliable than complex date arithmetic in bash.

**Runner choice:** GitHub-hosted `ubuntu-latest`. The pull script hits ServiceNow REST (outbound HTTP) and AWS Secrets Manager — both accessible from GitHub-hosted runners via secrets. No reason to use the self-hosted Windows box for this.

**c. `deploy.yml` gate for eval metadata:**

Add a `check-evals` job between `build` and `deploy`:

```yaml
check-evals:
  name: Verify nightly eval is green (48h window)
  runs-on: ubuntu-latest
  needs: build
  steps:
    - uses: actions/github-script@v7
      with:
        script: |
          const cutoff = Date.now() - 48 * 60 * 60 * 1000
          const runs = await github.rest.actions.listWorkflowRunsForRepo({
            owner: context.repo.owner,
            repo: context.repo.repo,
            workflow_id: 'evals-nightly.yml',
            status: 'success',
            per_page: 5,
          })
          const recent = runs.data.workflow_runs.find(
            r => new Date(r.updated_at).getTime() > cutoff
          )
          if (!recent) {
            core.setFailed('No green nightly eval run in the last 48h. Deploy blocked.')
          }
```

Fast evals (deterministic suites) run in the existing `build` job via `pnpm eval --project fast` before `pnpm build`. Add to the `build` job:

```yaml
- name: Fast evals (deterministic gate)
  run: pnpm eval --project fast   # entity-allowlist + citation-substring only
  env:
    # No judge key needed — fast suites are string-match only
```

---

### 6. ServiceNow REST Pull

**Auth decision (MEDIUM confidence):** Use HTTP Basic Auth for the service account. OAuth client credentials for ServiceNow Table API requires additional ACL/scope configuration that can fail silently ("User is not authenticated" error when token is valid but ACL hasn't been updated). For a read-only monthly pull from a service account, Basic Auth is simpler and well-supported. Store credentials as a single JSON blob in AWS Secrets Manager at `/mmc/cts/kb-assistant/servicenow-service-account`: `{ "username": "...", "password": "..." }`.

**Endpoint and fields:**

`GET /api/now/table/kb_knowledge` — NOT `kb_article` (that is not a standard SN table name). The canonical table is `kb_knowledge`.

Known fields on `kb_knowledge`:
- `sys_id` — record identifier
- `number` — human-readable KB number (e.g., KB0012345)
- `short_description` — title
- `workflow_state` — values: `draft`, `review`, `published`, `retired`, `outdated`
- `kb_knowledge_base` — ref to knowledge base (dot-walk: `kb_knowledge_base.title`)

**Pitfall:** `rejection_reason` is NOT a standard field on `kb_knowledge`. It may be a custom field (`u_rejection_reason`) or stored on a related workflow task record. The pull script should include `u_rejection_reason` in `sysparm_fields` and gracefully handle null/missing. Verify against the actual SN instance using the REST API Explorer (`/api/now/doc/table/schema/kb_knowledge`) before the script runs.

`GET /api/now/table/kb_feedback` — contains user feedback on articles:
- `article` — ref link to `kb_knowledge.sys_id`
- `rating` — numeric
- `comments` — free text
- `sys_created_on` — timestamp

**Query for rejected/outdated/flagged articles:**
```
sysparm_query=workflow_stateINretired,outdated,draft^sys_updated_onONLast 90 days@javascript:gs.beginningOfLast90Days()@javascript:gs.endOfLast90Days()
sysparm_fields=sys_id,number,short_description,workflow_state,u_rejection_reason,sys_updated_on
sysparm_limit=100
sysparm_offset=0
```

**Pagination:** Use `sysparm_limit`/`sysparm_offset` loop. Default limit is 10,000 but 100 is safe. Check `X-Total-Count` response header to know if there are more pages.

**TypeScript client skeleton:**
```typescript
// scripts/pull-servicenow-feedback.ts
async function snGet(path: string, params: Record<string, string>) {
  const secrets = await loadSecrets() // existing pattern
  const { username, password } = JSON.parse(secrets.SERVICENOW_SERVICE_ACCOUNT)
  const token = Buffer.from(`${username}:${password}`).toString('base64')
  const url = new URL(`https://${process.env.SN_INSTANCE}.service-now.com${path}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url, {
    headers: { 'Authorization': `Basic ${token}`, 'Accept': 'application/json' },
  })
  if (!res.ok) throw new Error(`SN ${res.status}: ${await res.text()}`)
  return res.json() as Promise<{ result: unknown[] }>
}
```

No external HTTP client needed — Node 20 `fetch` is sufficient.

**Rate limits:** ServiceNow Table API has no published rate limit for authenticated service accounts on standard Enterprise instances. The monthly pull (~200 records max) will not approach any limit.

---

### 7. App Insights Workbook Format

**Schema:** `serializedData` is a JSON string with schema `{"version":"Notebook/1.0","items":[...]}`. Each item has a `type` (1=text/markdown, 3=KQL query, 9=parameter, 12=ARM query). The `type:3` item carries the KQL query inline as a string.

**Version-control strategy (MEDIUM confidence):**

Store the workbook as `ops/workbooks/kb-assistant-pilot.workbook.json` — a full ARM template (not just serializedData). Deploy via:
```bash
az deployment group create \
  --resource-group <rg> \
  --template-file ops/workbooks/kb-assistant-pilot.workbook.json \
  --parameters workbookSourceId=<ai-resource-id>
```

Use a deterministic `workbookId` (a GUID derived from the workbook name) to avoid duplicate workbook creation on repeated deploys:
```json
"workbookId": { "defaultValue": "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }
```

**Templatise the resource ID:** Export from portal in ARM template mode (Advanced Editor → ARM Template), then replace the hardcoded subscription/resourceGroup values with ARM template expressions using the `union()`/`json()` pattern. At minimum, the `workbookSourceId` parameter references the App Insights resource; keep it as a parameter defaulting to the production resource ID.

**KQL query sketches for the 5 workbook sections:**

*Section 1 — Usage:*
```kql
customEvents
| where timestamp > ago(7d)
| summarize sessions=dcount(tostring(customDimensions["session_id_hash"])),
            questions=countif(name == "question_hash"),
            chip_pct=round(100.0 * countif(customDimensions["chip_or_freeform"]=="chip") / countif(name=="chip_vs_freeform"), 1)
| project sessions, questions, chip_pct
```

*Section 2 — Quality signals:*
```kql
customEvents
| where timestamp > ago(24h)
| summarize
    thumbs_down_pct = round(100.0 * countif(name=="thumbs_rating" and customDimensions["rating"]=="down") / countif(name=="thumbs_rating"), 1),
    fallback_pct = round(100.0 * countif(name=="fallback_trigger") / countif(name=="chat_request_completed"), 1),
    validator_flip_pct = round(100.0 * countif(name=="validator_flip") / countif(name=="chat_request_completed"), 1)
```

*Section 3 — Content gaps:*
```kql
customEvents
| where name == "flag_a_gap_action" and timestamp > ago(30d)
| summarize count() by tostring(customDimensions["source_id"])
| order by count_ desc
| take 20
```

*Section 4 — System health:*
```kql
requests
| where timestamp > ago(1h)
| summarize
    p50=percentile(duration, 50),
    p95=percentile(duration, 95),
    error_rate=round(100.0 * countif(success==false) / count(), 2)
| project p50, p95, error_rate
```

*Section 5 — Eval trend:*
```kql
customEvents
| where name == "eval_run_completed" and timestamp > ago(30d)
| extend suite=tostring(customDimensions["suite"]),
         pass_rate=todouble(customMeasurements["pass_rate"])
| summarize avg(pass_rate) by suite, bin(timestamp, 1d)
| render timechart
```

---

### 8. Alert Rules + Teams Webhook

**Alert type decision (MEDIUM confidence):**

- P1 (5xx > 5% / 10 min): Use **metric alert** on `requests/failed` (built-in App Insights metric) — no KQL needed, sub-minute evaluation.
- P2 (fallback > 25%/1h, thumbs_down > 15%/24h, validator_flip > 5%/24h): Use **log search alert** (KQL-based) — these require custom event aggregation not available as pre-built metrics.
- P3 (weekly digest): GitHub Actions scheduled summary posted to Teams via webhook — NOT an Azure Monitor alert.

**Teams webhook format:** Azure Monitor Action Groups send webhook payloads in the [Common Alert Schema](https://learn.microsoft.com/en-us/azure/azure-monitor/alerts/alerts-common-schema) JSON format. Teams incoming webhooks do NOT accept Adaptive Cards from Azure Monitor directly — they accept `MessageCard` format (legacy) or you use a Power Automate flow to transform. The practical approach for this project:

Use Teams **incoming webhook** (not Adaptive Cards). The Action Group sends the Common Alert Schema JSON to the webhook URL; Teams displays the raw JSON card. This is sufficient for pilot: the on-call team sees the alert, opens the workbook. DO NOT spend Phase 6 time building a Power Automate transformation flow.

**Webhook URL storage:** Store in AWS Secrets Manager at `/mmc/cts/kb-assistant/teams-webhook-url`. Retrieve during Bicep/az-cli alert provisioning and set as the Action Group webhook endpoint. The URL does not need to be in application code.

**Bicep provisioning (check into `ops/bicep/alerts.bicep`):**
```bicep
resource actionGroup 'microsoft.insights/actionGroups@2022-06-01' = {
  name: 'kb-assistant-alerts'
  location: 'global'
  properties: {
    groupShortName: 'KBAssist'
    enabled: true
    webhookReceivers: [{
      name: 'teams-pilot'
      serviceUri: teamsWebhookUrl  // parameter
      useCommonAlertSchema: true
    }]
  }
}
```

Deploy once via `az deployment group create`; idempotent if resource name stays stable.

---

### 9. Positional Eval (Turn 1 vs Turn 8) Detail

**Session state mocking (MEDIUM confidence):**

`iron-session` uses `sealData`/`unsealData` from the `iron-webcrypto` library internally. For eval headless calls, the simplest approach is: call the actual `/api/chat` endpoint via `fetch` in the eval harness, building up a `messages` array across turns (the route handler is stateless — it receives the full message history on each call). Session cookie mocking is NOT needed because `/api/chat` does not store conversation state server-side; the client sends the full `messages` array each turn.

**Turn-8 simulation:**
```typescript
const messages = []
for (let turn = 0; turn < 8; turn++) {
  const userMsg = turn === 0 ? fixture.anchor_question : fixture.filler_questions[turn - 1]
  messages.push({ role: 'user', content: userMsg })
  const response = await callChat(messages)   // POST /api/chat with messages[]
  messages.push({ role: 'assistant', content: response.answer })
}
// Score turn-8 answer on anchor_topic using judge
```

For the eval harness, call `/api/chat` via localhost during the nightly GHA run (the app is NOT running in CI). Instead, call `src/llm/` directly, bypassing HTTP: import `createLlmClient()` and `streamAnswer()` from the existing modules. This avoids needing a running server and aligns with how other evals call the LLM client.

**Scoring:** Judge prompt: "Does this answer correctly and specifically address the topic of {anchor_topic}? Answer 1 for yes, 0 for no." Compare binary score at turn 1 vs turn 8 across the fixture set. The threshold is |avg(turn1_scores) - avg(turn8_scores)| ≤ 0.02 (2 percentage points).

---

### 10. Thumbs-Down Round-Trip to Dashboard (SC#4 Interpretation)

**Ingestion reality (HIGH confidence):**

Standard App Insights ingestion latency: 2–5 minutes for `customEvents` data to appear in Log Analytics queries / Workbook tiles. This is a hard platform constraint — it is NOT possible to make a `trackEvent` call appear in a KQL workbook query within 5 seconds.

**Live Metrics Stream** has ~1s latency but:
- It is NOT embeddable in a Workbook tile (portal-only view)
- It is a streaming portal session, not persisted
- After September 30 2025, API keys for live metrics are retired — requires Entra auth

**SC#4 correct interpretation:** The "5s" and "dashboard shows within one refresh" are TWO separate criteria that refer to different things:
- **5s budget:** Browser click → `/api/feedback` POST → server `trackEvent()` call completes (server confirms telemetry flush initiated). This IS achievable: the `/api/feedback` endpoint is a simple `trackEvent` + JSON 200, completing in < 200ms.
- **"visible within one refresh":** The 5-minute workbook auto-refresh means data appears within ~5 min of the server call. For a pilot with ~50 users, this is operationally acceptable.

**Recommendation:** Document SC#4 as: "👎 click → server telemetry call < 5s (measured), workbook visibility < 5 min (platform constraint)." No additional infrastructure (SSE, local file tail) is needed. The `thumbs_rating` event carries `{ message_id, role, rating, citation_source_id, citation_section_id, reason }` as custom dimensions.

**Separate `POST /api/feedback` endpoint (confirmed decision):** Keep thumbs rating separate from `/api/chat` event stream. The feedback endpoint:
- Validates iron-session (same middleware as other auth routes)
- Accepts `{ message_id, rating: 'up'|'down', reason?, citation_source_id?, citation_section_id? }`
- Calls `trackBusinessEvent('thumbs_rating', {...})` 
- Returns `{ ok: true }` within < 200ms

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| App Insights SDK | Custom HTTP exporter to `/v2/track` | `@azure/monitor-opentelemetry` | Retry, batching, sampling, Live Metrics, correlation — all handled |
| SHA-256 hashing | Web Crypto `subtle.digest` | `node:crypto` `createHash` (sync) | Simpler, synchronous, same security |
| LLM eval framework from scratch | Full bespoke harness | Vitest + bespoke judge.ts (100-200 lines) | Vitest already handles async, timeouts, reporters |
| ServiceNow HTTP client | `axios` or `node-fetch` | Node 20 built-in `fetch` | Already available, no extra dep |
| Teams Adaptive Card transformation | Power Automate flow | Teams incoming webhook + Common Alert Schema raw JSON | Sufficient for pilot; Adaptive Cards require Logic Apps or Power Automate |
| Workbook GUID generation | UUID library | ARM `[newGuid()]` or hardcoded deterministic GUID | Prevent duplicate workbook creation on re-deploy |

---

## Common Pitfalls

### Pitfall 1: `useAzureMonitor` called after HTTP module load
**What goes wrong:** OpenTelemetry instrumentation patches `node:http` at import time. If any route handler or library that uses HTTP is imported before `useAzureMonitor()`, those requests are never traced.
**Prevention:** Guard in `instrumentation.ts` → `instrumentation.node.ts` with dynamic import. The `register()` function runs before Next.js routes are registered.
**Warning sign:** No HTTP request spans visible in App Insights despite `trackEvent` calls appearing.

### Pitfall 2: Missing `serverExternalPackages` for `@azure/monitor-opentelemetry`
**What goes wrong:** Next.js tries to bundle `@azure/monitor-opentelemetry` into the server bundle. The package uses OpenTelemetry's loader hooks and native Node.js binding paths that fail under webpack.
**Prevention:** Add `'@azure/monitor-opentelemetry'` to `serverExternalPackages` in `next.config.ts`. Extend the existing `['pino', 'pino-pretty']` array.
**Warning sign:** Build error mentioning `@opentelemetry/instrumentation` or `shimmer` during `pnpm build`.

### Pitfall 3: `APPLICATIONINSIGHTS_CONNECTION_STRING` not in `process.env` at `register()` time
**What goes wrong:** `useAzureMonitor()` in `instrumentation.node.ts` runs at server startup. If `loadSecrets()` hasn't been called yet, `process.env.APPLICATIONINSIGHTS_CONNECTION_STRING` is undefined and the SDK silently skips telemetry.
**Prevention:** Add `APPLICATIONINSIGHTS_CONNECTION_STRING` to `SECRET_KEYS` in `src/config/secrets.ts`. In `instrumentation.node.ts`, call `await loadSecrets()` before `useAzureMonitor()`. The module-level cache means this is safe to call at startup.

### Pitfall 4: `kb_knowledge` workflow_state values differ from expected
**What goes wrong:** The script queries `workflow_stateINrejected,outdated,flagged` but ServiceNow's actual values may be `retired`, `review`, or custom strings depending on the instance configuration. The pull returns 0 records silently.
**Prevention:** Before writing the script, use the REST API Explorer on the actual SN instance to inspect `kb_knowledge` enum values: `GET /api/now/table/kb_knowledge?sysparm_fields=workflow_state&sysparm_limit=5`. Validate field name `u_rejection_reason` exists (vs `rejection_reason`).

### Pitfall 5: eval runner calls real LLM during unit `pnpm test`
**What goes wrong:** Eval fixtures import from `src/llm/client.ts` — if the main Vitest config picks up `*.eval.ts` files, they run on every `pnpm test` PR check and burn API quota / slow CI.
**Prevention:** Separate `vitest.eval.config.ts` with explicit `include: ['src/evals/suites/**/*.eval.ts']`. Main `vitest.config.ts` must NOT glob `*.eval.ts`. Confirm existing `test` script uses the main config only.

### Pitfall 6: Nightly eval 48h gate creates false blocks on redeploy
**What goes wrong:** If no nightly eval has run in the last 48h (e.g., weekend deploy after a Friday pause), the gate blocks production deploys.
**Prevention:** The gate job must support `workflow_dispatch` bypass: add a `skip-eval-gate` boolean input to `deploy.yml`. Document in runbook: "emergency deploys can set skip-eval-gate=true with mandatory post-deploy eval run."

### Pitfall 7: Teams webhook rejecting Common Alert Schema payload
**What goes wrong:** Teams incoming webhooks (legacy) accept `MessageCard` format. Azure Monitor sends Common Alert Schema JSON. Teams may display a generic "unknown format" card or silently discard.
**Mitigation:** Test the webhook manually with a sample Common Alert Schema payload before pilot day 1. If Teams rejects it, add an Azure Logic App with HTTP trigger → Parse JSON → Post Message to Teams (one-step, ~15 min to configure). Flag this as a pre-pilot verification task.

---

## Code Examples

### `instrumentation.node.ts` initialisation
```typescript
// src/instrumentation.node.ts
import { loadSecrets } from './config/secrets'
import { useAzureMonitor } from '@azure/monitor-opentelemetry'

export async function initAzureMonitor() {
  await loadSecrets()  // ensures APPLICATIONINSIGHTS_CONNECTION_STRING is in process.env
  useAzureMonitor({
    azureMonitorExporterOptions: {
      connectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING,
    },
    enableLiveMetrics: true,
    samplingRatio: 1,
    instrumentationOptions: {
      http: { enabled: true },
      bunyan: { enabled: false },
      winston: { enabled: false },
    },
  })
}

// Call immediately (top-level await in ESM, or IIFE in CJS)
initAzureMonitor().catch(console.error)
```

### Tracking a business event
```typescript
// src/obs/telemetry.ts
import { trace, SpanKind } from '@opentelemetry/api'

const tracer = trace.getTracer('kb-assistant', '1.0.0')

export function trackEvent(
  name: string,
  dims: Record<string, string>,
  meas?: Record<string, number>,
): void {
  const span = tracer.startSpan(name, {
    kind: SpanKind.INTERNAL,
    attributes: { 'event.name': name, ...dims, ...meas },
  })
  span.end()
}
```

### Question hash (verified Node.js pattern)
```typescript
// src/obs/hashQuestion.ts — Source: Node.js crypto docs
import { createHash } from 'node:crypto'
export function hashQuestion(raw: string): string {
  const salt = process.env.QUESTION_HASH_SALT ?? ''
  const n = raw.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim().replace(/[.?!]+$/, '')
  return createHash('sha256').update(salt + n).digest('hex').slice(0, 16)
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `applicationinsights` 2.x classic SDK | `@azure/monitor-opentelemetry` OTel distro | 2023–2024 | Classic SDK enters maintenance; OTel is the forward path |
| API keys for Live Metrics | Entra auth for Live Metrics | Retired Sep 30 2025 | Must use Entra auth if enabling Live Metrics control channel custom filters |
| Pino transport to App Insights | Dual-emit via OTel span attributes | N/A | Cleaner; avoids second SDK |

**Deprecated:**
- `applicationinsights@2.x` setup pattern (`appInsights.setup(connStr).start()`): still works but Classic SDK is maintenance-mode. Do not use for new code.
- Live Metrics API key auth: retired as of Sep 30 2025; Live Metrics still works but custom filters require Entra auth.

---

## Open Questions

1. **`u_rejection_reason` field existence on the actual MMC SN instance**
   - What we know: `rejection_reason` is not a standard SN field; likely custom
   - What's unclear: field name (`u_rejection_reason`?), which table it's on, whether it's on `kb_knowledge` or a linked workflow record
   - Recommendation: Add a pre-task to run `GET /api/now/doc/table/schema/kb_knowledge` against the actual instance before implementing the pull script; treat field as optional/nullable

2. **Teams webhook payload acceptance**
   - What we know: Azure Monitor Action Groups send Common Alert Schema JSON; Teams incoming webhooks expect MessageCard
   - What's unclear: Whether MMC's Teams tenant auto-converts, or whether an intermediate Logic App is needed
   - Recommendation: Make Teams webhook validation a pre-pilot day-1 checklist item; plan 2-hour buffer for Logic App setup if needed

3. **App Insights resource provisioning (operator task, not in scope)**
   - What we know: No App Insights resource exists yet; connection string must come from operator
   - What's unclear: Whether this is in a shared Azure subscription or a new one; whether Entra auth is required
   - Recommendation: CONTEXT.md notes this is an operator task; planner should add a blocker dependency on operator providing the connection string before Phase 6 tasks that need it can run

4. **LLM judge model (MGTI vs direct gpt-4o)**
   - What we know: The MGTI ingress is the production LLM path; direct gpt-4o API is ~$0.01/call, ~$180/month for nightly evals
   - What's unclear: Whether the judge can use the MGTI ingress (would use MMC's contract) or needs a separate direct OpenAI key
   - Recommendation: Use a separate `LLM_JUDGE_API_KEY` / `LLM_JUDGE_BASE_URL` pair in GitHub secrets for the nightly runner; this isolates eval costs from production usage and avoids MGTI rate limits during a spike

---

## Sources

### Primary (HIGH confidence)
- `@azure/monitor-opentelemetry` official README — `useAzureMonitor` API, connection string, ESM guidance (fetched from learn.microsoft.com, 2026-02-24)
- Next.js official docs — `instrumentation.ts` pattern, `NEXT_RUNTIME` guard, `serverExternalPackages` (fetched from nextjs.org, version 16.2.4, 2026-04-21)
- Azure Monitor Live Metrics docs — 1s latency, Node.js support, Sep 2025 API key retirement (fetched from learn.microsoft.com, 2026-03-06)
- Azure Workbooks ARM automation docs — `serializedData` schema, `apiVersion`, ARM template export/import pattern (fetched from learn.microsoft.com, 2026-04-02)
- `applicationinsights@3.14.0` README — version, ESM warning, `useAzureMonitor` timing constraint (fetched from github.com/microsoft/ApplicationInsights-node.js, 2026-02-26)

### Secondary (MEDIUM confidence)
- GitHub Discussion #55405 (vercel/next.js) — bundling pitfalls with classic `applicationinsights` in App Router (webpack NormalModuleReplacementPlugin workarounds required)
- ServiceNow Community — `kb_knowledge` table REST access, workflow_state enum values, Basic auth vs OAuth client credentials issues
- ServiceNow Community — pagination with `sysparm_limit`/`sysparm_offset`, `X-Total-Count` header

### Tertiary (LOW confidence — verify before implementing)
- ServiceNow `kb_feedback` table field names (`article`, `rating`, `comments`) — derived from community posts, not official schema docs; validate against actual instance
- `u_rejection_reason` field existence — inferred from convention; not confirmed in official docs
- Teams incoming webhook Common Alert Schema acceptance — noted as potential issue from GitHub/community sources; needs hands-on verification

---

## Metadata

**Confidence breakdown:**
- Standard stack (OTel SDK choice): HIGH — official docs, verified ESM compatibility
- App Insights initialisation pattern: HIGH — official Next.js + Azure Monitor docs
- Question hashing: HIGH — Node.js built-ins
- Eval runner architecture: MEDIUM — judgment call; promptfoo capability confirmed but bespoke Vitest path inferred from existing stack fit
- ServiceNow REST fields: LOW — community posts only; field names need instance validation
- Workbook ARM schema: HIGH — official docs with code examples
- Alert → Teams webhook: MEDIUM — known limitation documented; workaround path unclear without testing

**Research date:** 2026-04-24
**Valid until:** 2026-05-24 (stable Azure SDK, 30 days)

## RESEARCH COMPLETE
