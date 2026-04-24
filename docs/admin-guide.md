# KB Assistant — Admin & Operator Guide

**Audience:** Anyone responsible for keeping the KB Assistant running — pilot operator, Entra administrator, Ops engineer, Content Steward. This is the **orientation map** that ties together the individual runbooks.

**Scope:** v1 Pilot Release (shipped 2026-04-24). Web-only; Teams tab deferred to v1.1.

---

## Who Does What

| Role | Owns | Typical cadence |
|------|------|-----------------|
| **Entra administrator** | App Registration, App Roles, user/group assignment, client secret rotation | Day-0 setup + ad-hoc (new pilot user, secret expiry every 24 months) |
| **Ops engineer** | Windows Server box, IIS reverse proxy, Scheduled Task, GitHub Actions runner, deploy workflow, P1 alert response | Day-0 deploy + ad-hoc (P1/P2 alerts, redeploys, rollbacks, SOP re-embed) |
| **Content Steward** | Monthly ServiceNow flagged-article pull, weekly Teams digest review, thumbs-down pattern review, pilot-gap triage | Monthly (1st of month auto-opens issue) + weekly (Sunday 23:00 UTC auto-posts) + ad-hoc (thumbs-down spike) |
| **Eval gatekeeper** (usually Ops) | Nightly eval suite green, emergency bypass authorisation, eval-regression issue triage | On failure (auto-opens GitHub issue) |
| **Pilot coordinator** (usually Knowledge team) | Pilot cohort identification, onboarding, About-tooltip confirmation, ≥50% weekly session monitoring | Pilot window only (first 2 weeks are the critical measurement window) |

One person can hold multiple roles. In v1, the named Content Steward fills `{{STEWARD_NAME}}` in measurement-plan.md + content-steward-runbook.md placeholders before pilot day 1.

---

## Day-0 Pilot Setup (16 items)

Before pilot day 1, someone must complete these. They're grouped by owner, and each points to the runbook with the exact commands. **None of these are in code** — all are live-environment operator tasks.

### Secrets & CI config (Ops)

1. **Add GitHub Actions secrets:**
   - `LLM_JUDGE_API_KEY`, `LLM_JUDGE_BASE_URL` — for nightly eval LLM judge
   - `TEAMS_WEBHOOK_URL` — for eval-regression + weekly-digest notifications
   - `AZURE_CREDENTIALS` — service-principal JSON for `azure/login@v2` (weekly digest KQL query)
   - `APP_INSIGHTS_APP_ID` — the App Insights API App ID for `az monitor app-insights query`
   - `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` — for the monthly ServiceNow pull script reaching Secrets Manager
2. **Create GitHub Issues labels:** `eval-regression`, `content-steward`
3. **Set branch protection on `main`:** require the `verify` workflow job to pass before merge

### AWS Secrets Manager (Ops)

4. **Provision `/mmc/cts/kb-assistant` secret** with these keys:
   - `ENTRA_CLIENT_SECRET` (from Entra App Registration — 24-month rotation)
   - `SESSION_SECRET` (32+ random bytes — iron-session AES-256-GCM requirement)
   - `QUESTION_HASH_SALT` (rotate annually; pre-register rotation in measurement-plan)
   - `APPLICATIONINSIGHTS_CONNECTION_STRING` (from App Insights resource blade)
   - `TEAMS_WEBHOOK_URL` (from the pilot Teams channel)
   - `SERVICENOW_SERVICE_ACCOUNT`, `SN_INSTANCE` (read-only SN creds for the monthly pull)

   See [`docs/env-handling.md`](env-handling.md) for the full key list and the `loadSecrets()` cascade.

### Entra App Registration (Entra admin)

5. **Complete [`docs/entra-app-registration-setup.md`](entra-app-registration-setup.md)** — 7 steps:
   - App Registration with Web platform + exact-match redirect URI
   - Client secret (24-month rotation — diary entry required)
   - `KbAssistant.User` App Role
   - Graph `User.Read` admin consent
   - Enterprise Application user/group assignment
   - Validation: sign in yourself first before opening to pilot

### Windows Server deploy (Ops)

6. **Complete [`docs/deploy-windows.md`](deploy-windows.md)** — 7 steps:
   - Node 20 system-wide install
   - AWS SDK credential chain verification
   - Deploy directory + first artifact placement
   - Scheduled Task config (machine-scope env vars, restart-on-failure, PowerShell logging)
   - IIS reverse proxy with URL Rewrite + ARR (SSE-safe: `responseBufferLimit=0`, `X-Accel-Buffering: no`)
   - GitHub Actions self-hosted runner installation
   - First deploy verify + `/api/health` canary

### Telemetry & alerting (Ops)

7. **Deploy App Insights workbook + Azure Monitor alerts:** run `ops/alerts/provision.sh` (fetches webhook from AWS Secrets Manager, runs `az deployment group create` for both the workbook ARM template and alerts Bicep). See [`docs/ops/workbook-deploy-procedure.md`](ops/workbook-deploy-procedure.md). Supply a real workbook GUID via `--parameters workbookId=<uuid>` (the placeholder in the template is deterministic but not production-grade).
8. **Validate Teams webhook** accepts Common Alert Schema — follow [`docs/ops/teams-webhook-validation-procedure.md`](ops/teams-webhook-validation-procedure.md). If your tenant's Teams Connector blocks the schema, provision the Logic App buffer (~2h of work, documented in the same runbook).

### Pre-pilot documentation (Content Steward)

9. **Fill placeholders** in:
   - `docs/content-steward-runbook.md` — `{{STEWARD_NAME}}`, `{{STEWARD_BACKUP_NAME}}`
   - `docs/measurement-plan.md` — `{{STEWARD_NAME}}`, `{{SIGNOFF_DATE}}`
10. **Run `pnpm sn:validate`** with live ServiceNow credentials; paste output into the runbook's "Schema Validation" section. This confirms `u_rejection_reason` and `workflow_state` fields exist with expected enums.

### Pilot window (Pilot coordinator)

11. **Identify pilot cohort** — list of named colleagues (Tier II/III, SMEs, Knowledge team members for the Author lane; Tier I analysts for the Consumer lane)
12. **Grant `KbAssistant.User` App Role** in Entra Enterprise Application → Users and groups
13. **Share the production URL** with the cohort + a one-line "click this, pick a role, ask away" instruction
14. **Confirm About-tooltip** was seen by each onboarded user (ask via 1:1 or in the pilot channel)
15. **Monitor the weekly-digest Teams card** (posts Sunday 23:00 UTC = Monday 09:00 AEST) — target: ≥50% of the cohort had a session in the past 7 days, within the first 2 pilot weeks. If below threshold, reach out to non-active users individually.
16. **Run baseline capture:** `pnpm pull:servicenow -- --baseline` before pilot day 1 to capture the 90-day pre-pilot flagged-rate snapshot. The paired comparison depends on this — DO NOT skip it. Output lands in `ops/rejected-articles/baseline-pre-pilot.json`.

---

## Day-to-Day Admin Tasks

### Adding a new user to the pilot

1. Entra admin opens the App Registration → Enterprise Application → Users and groups → **+ Add user/group**
2. Select the user → assign **`KbAssistant.User`** role → save
3. Share the production URL with the user
4. Tell them about the About-tooltip + user guide

No app-side action needed — the `KbAssistant.User` role check is runtime; the user can sign in as soon as the role is assigned.

### Responding to P1 alert (chat 5xx > 5% over 10 min)

1. Teams alert fires → action is **"Investigate immediately"**
2. Check `/api/health` on the production URL → if 200, the ingress is up; if 503, node process or MGTI is down
3. Check Windows Scheduled Task `KbAssistant` status on the server (`schtasks /query /tn KbAssistant`)
4. Check `C:\deploy\kb-assistant\logs\` for pino output; look for upstream 5xx spikes, auth failures, or out-of-memory events
5. If MGTI is the problem: contact the MMC platform team (the ingress isn't under our control)
6. If the node process is the problem: `schtasks /end /tn KbAssistant` then `schtasks /run /tn KbAssistant` to restart; or redeploy last-known-good
7. If it's a code regression: use the eval-gate bypass (see below) to push a fix

### Responding to P2 alerts

- **Fallback rate > 25% / 1h** — either users are asking lots of out-of-scope questions (content gap) or the assistant is incorrectly refusing. Review a sample of fallback questions in the workbook → Gap Analysis section; cross-reference against `flag_a_gap_action` events. If refusing-in-error, thumbs down → eval suite expansion.
- **Thumbs-down rate > 15% / 24h** — review the dropdown reasons in App Insights. `hallucinated` patterns mean the SOP section's content needs re-embedding with better grounding; `wrong citation` means the validator let something through. Escalate to the Knowledge team + eval suite maintainer.
- **Validator flip rate > 5% / 24h** — the quote-substring validator stripped citations from >5% of responses, forcing fallback. Either LLM output quality dropped (check if MGTI changed model versions) or the SOP text drifted (check git log for source registry changes). Look at `src/evals/suites/paired-role.eval.ts` for flaky vs real regression.

### Reviewing nightly eval failures

1. GitHub Issue auto-opens with label `eval-regression`, body lists failing suites
2. Check the `evals-nightly.yml` run logs for `flaky-review.json` — if the failure is in the quarantine list, it's a known-flaky test, not a real regression
3. If real: inspect the LLM judge output in the workflow artifacts; the judge includes reasoning for each failed case
4. Common real regressions:
   - **Model drift** (MGTI swapped gpt-4o to a newer build) — lock the model version in `LLM_MODEL` env
   - **Fixture drift** (SOP text updated but fixture quote wasn't) — update `src/evals/suites/*.eval.ts` fixtures
   - **Prompt regression** (someone touched `composeSystemPrompt`) — check the git diff, re-snapshot if intentional
5. If the failure is blocking a deploy and we need to ship urgently, use the bypass (see next section)

### Emergency deploy bypass

When the judge API is flaky and production has a real bug, use the bypass:

```bash
gh workflow run deploy.yml -f skip_eval_gate=true --ref main
```

This skips the `check-evals` job. Full procedure in [`docs/ops/eval-gate-bypass-procedure.md`](ops/eval-gate-bypass-procedure.md) — requires an Incident ID and a post-incident write-up.

**Confirmed working as of 2026-04-24** (commit c92286e added the one-line `if:` on the `deploy` job that was previously blocking bypass — see milestone audit GAP-1).

### Rotating secrets

| Secret | Rotation cadence | How |
|--------|------------------|-----|
| `ENTRA_CLIENT_SECRET` | 24 months | Entra portal → App Registration → Certificates & secrets → **+ New client secret** → copy to AWS Secrets Manager `/mmc/cts/kb-assistant` → redeploy (picks up new value at Scheduled Task restart) |
| `SESSION_SECRET` | Annually (or on suspected compromise) | Generate 32+ random bytes → update AWS Secrets Manager → redeploy. **All active sessions are invalidated** — users sign back in. |
| `QUESTION_HASH_SALT` | Annually | Generate fresh value → update AWS Secrets Manager → redeploy. **Pre-register rotation in measurement-plan** so the question-hash join across the rotation is documented (old hashes != new hashes for the same question text). |
| `LLM_API_KEY` (MGTI) | Per MGTI policy | MGTI platform team issues → update AWS Secrets Manager → redeploy |
| `LLM_JUDGE_API_KEY` | Per OpenAI account policy | Update in GitHub Actions repo secrets → next nightly run uses new key |

### Updating SOP source text (KB0022991 v13 → v14 scenario)

When ServiceNow publishes a new SOP version:

1. Open the source file in the repo — `src/grounding/sources/KB0022991.md` (or whichever)
2. Replace content with the new version's verbatim text (preserve XML boundary tags + `<!-- section:... -->` anchors)
3. Update the version string in `src/grounding/registry.ts` (`KB0022991` entry → `version: '14.0'`)
4. Re-run the anchor check: `pnpm test src/__tests__/anchorIds.test.ts` — verifies all citations in eval fixtures still match section IDs
5. Update eval fixtures if the SOP restructured sections — `src/evals/suites/citation-substring.eval.ts`, `src/evals/suites/paired-role.eval.ts`
6. Open a PR titled `chore(grounding): update KB0022991 v13.0 → v14.0`
7. CI runs eval:fast + test suite; merge when green
8. Deploy — the About-popover freshness line updates automatically from the registry

**Total time:** ~30 min if the SOP restructure is small; longer if sections were renamed (fixture updates dominate).

---

## Monitoring

**App Insights workbook** (5 sections): Usage / Quality / Gaps / Health / EvalTrend. Deploy + URL in [`docs/ops/workbook-deploy-procedure.md`](ops/workbook-deploy-procedure.md).

- **Section 1 Usage** — sessions, unique users, questions per session, chip vs freeform ratio
- **Section 2 Quality** — thumbs-up rate, thumbs-down rate + reason breakdown
- **Section 3 Gaps** — fallback rate, flag-a-gap volume, unanswered-question hash frequency
- **Section 4 Health** — 5xx rate, latency p50/p95/p99, validator flip rate, ingress error rate
- **Section 5 EvalTrend** — **inert in v1** (TD-1) — KQL is complete but no code emits `eval_run_completed` events yet. Either add `scripts/emit-eval-events.ts` or hide Section 5 until v1.1.

**Weekly Teams digest** (posts Sunday 23:00 UTC = Monday 09:00 AEST via `weekly-digest.yml`): sessions, users, thumbs-down count, fallback count, total requests for the past 7 days. Plain-text MessageCard. Non-blocking — if Teams rejects, the GH Action still succeeds.

**Alerts** (4 scheduled query rules, Bicep-provisioned):
- P1 `kb-p1-chat-5xx` — 5xx > 5% over 10 min
- P2 `kb-p2-fallback-rate` — fallback > 25% over 1h
- P2 `kb-p2-thumbs-down-rate` — thumbs-down > 15% over 24h
- P2 `kb-p2-validator-flip-rate` — validator flip > 5% over 24h

---

## Escalation

| Situation | Contact |
|-----------|---------|
| MGTI ingress down / slow | MMC platform team (operate MGTI corporate ingress) |
| Entra / SSO not working (portal-side) | MMC Entra admin team + your local IT helpdesk |
| AWS Secrets Manager access issues | MMC IAM / platform team |
| P1 alert not firing as expected | Ops engineer + review `alerts.bicep` config |
| ServiceNow API credentials revoked | Service account owner (typically ServiceNow admin team) |
| Content quality issue (assistant says something wrong) | Content Steward → Knowledge team → author of the specific SOP section |
| User reports sensitive data in feedback | Immediate: disable feedback temporarily; investigate in App Insights; coordinate with privacy office. (Free-text feedback is disabled in v1 precisely to prevent this class of issue.) |

---

## Deferred to v1.1

- **AUTH-03 / DELV-03** — Microsoft Teams tab delivery. Requires reintroducing NAA alongside BFF (dual-host auth). Not on v1 roadmap; scope belongs in the next milestone.

---

## Pointers

### Runbooks (specific procedures)

- [`docs/entra-app-registration-setup.md`](entra-app-registration-setup.md) — Entra setup end-to-end
- [`docs/deploy-windows.md`](deploy-windows.md) — Windows Server + IIS deploy
- [`docs/env-handling.md`](env-handling.md) — AWS Secrets Manager + env schema
- [`docs/content-steward-runbook.md`](content-steward-runbook.md) — monthly pull + review
- [`docs/measurement-plan.md`](measurement-plan.md) — pre-registered pilot metrics
- [`docs/ops/eval-gate-bypass-procedure.md`](ops/eval-gate-bypass-procedure.md) — emergency deploy bypass
- [`docs/ops/teams-webhook-validation-procedure.md`](ops/teams-webhook-validation-procedure.md) — Teams webhook setup
- [`docs/ops/workbook-deploy-procedure.md`](ops/workbook-deploy-procedure.md) — App Insights workbook + alerts

### Project context

- [`README.md`](../README.md) — dev quick-start, tech stack, test commands
- [`docs/user-guide.md`](user-guide.md) — for the pilot cohort
- [`.planning/PROJECT.md`](../.planning/PROJECT.md) — project brief + key decisions
- [`.planning/milestones/v1-ROADMAP.md`](../.planning/milestones/v1-ROADMAP.md) — what shipped in v1 and why
- [`.planning/milestones/v1-MILESTONE-AUDIT.md`](../.planning/milestones/v1-MILESTONE-AUDIT.md) — audit + tech-debt + operator-actions

### Code references (when you need ground-truth)

- `src/config/env.ts` — authoritative env schema (zod)
- `src/obs/eventSchema.ts` — authoritative telemetry event catalog
- `src/auth/msalClient.ts` + `src/auth/session.ts` — BFF auth implementation
- `src/app/api/_middleware.ts` — session cookie validation + role check
- `src/app/api/chat/route.ts` — chat pipeline with all telemetry emission points
- `src/grounding/registry.ts` — source registry + entity allowlist

---

*Updated: 2026-04-24 for v1 Pilot Release.*
