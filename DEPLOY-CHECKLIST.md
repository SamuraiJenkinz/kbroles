# Deploy Checklist — v1 Pilot Release

**Purpose:** Single tracking document for the v1 rollout. Check items off as you complete them. Commit the update so everyone can see progress.

**Background reading before starting:**
- [`docs/admin-guide.md`](docs/admin-guide.md) — orientation map (owners, cadence, escalation)
- [`docs/deploy-windows.md`](docs/deploy-windows.md) — Windows Server deploy runbook (default: AWS Secrets Manager path)
  - [`docs/deploy-windows.md` §4.2 (alternative)](docs/deploy-windows.md) — no-AWS env-file-on-disk path; supporting files: `.env.production.example` (template), `scripts/start.ps1` (launcher). Use this if the pilot box has no AWS CLI access.
- [`docs/entra-app-registration-setup.md`](docs/entra-app-registration-setup.md) — Entra setup runbook
- [`.planning/milestones/v1-MILESTONE-AUDIT.md`](.planning/milestones/v1-MILESTONE-AUDIT.md) — source list of pending operator actions (frontmatter `pending_operator_actions`)

**How to use:**
1. Pick up an unchecked item
2. Execute per its linked runbook
3. Verify via the "Done when" column
4. Update this file (tick the box, add your initials + date in the notes column)
5. Commit — `chore(deploy): <item-id> done — <one-line note>`

---

## Legend

- **🔴 Hard blocker** — deploy physically cannot run until done
- **🟡 Soft blocker** — deploy succeeds but pilot doesn't work
- **🟢 Pilot launch** — after deploy is green, required before sharing with cohort
- **🔵 Operational** — ongoing cadence after pilot starts

---

## 🔴 Hard Blockers (deploy pipeline cannot execute)

Without these, `.github/workflows/deploy.yml` either fails immediately (no runner, missing secret) or the app starts but crashes on first authenticated request.

### Infrastructure

- [ ] **HB-1** Self-hosted Windows runner installed on the Windows Server target
  - **Owner:** Ops
  - **How:** `docs/deploy-windows.md` §6 (GitHub Actions runner install — `.\config.cmd --runasservice` with label `kbassistant`)
  - **Done when:** `gh api repos/SamuraiJenkinz/kbroles/actions/runners` shows a runner with status `online` and labels include `self-hosted`, `windows`, `kbassistant`
  - **Notes:**

- [ ] **HB-2** Windows Server prepared: Node 20, IIS + URL Rewrite + ARR, SSL cert, deploy directory
  - **Owner:** Ops
  - **How:** `docs/deploy-windows.md` §§1–2, §5
  - **Done when:** `node -v` shows v20.x on the server; IIS Manager shows the site with URL Rewrite + ARR installed; `C:\deploy\kb-assistant\` exists; TLS cert bound to 443
  - **Notes:**

- [ ] **HB-3** Windows Scheduled Task `KbAssistant` configured (not yet started)
  - **Owner:** Ops
  - **How:** `docs/deploy-windows.md` §4 (machine-scope env vars, restart-on-failure, PowerShell logging wrapper, "Allow task to be run on demand")
  - **Done when:** `schtasks /query /tn KbAssistant` returns the task definition; task is stopped (will start on first successful deploy)
  - **Notes:**

### GitHub Actions configuration

- [ ] **HB-4** GitHub Actions repository variable `APP_HOSTNAME` set to the production hostname
  - **Owner:** Ops
  - **How:** GitHub repo → Settings → Secrets and variables → Actions → Variables → **New repository variable** → name `APP_HOSTNAME`, value e.g. `kb-assistant.mmc.com`
  - **Done when:** `gh variable list` shows `APP_HOSTNAME` (or set via the web UI)
  - **Notes:**

- [ ] **HB-5** GitHub Actions secrets added:
  - `AZURE_CREDENTIALS` (service-principal JSON for `azure/login@v2` — for weekly digest + alerts provision)
  - `APP_INSIGHTS_APP_ID` (App Insights API App ID)
  - `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (for steward pull script reaching AWS Secrets Manager)
  - `LLM_JUDGE_API_KEY`, `LLM_JUDGE_BASE_URL` (nightly eval judge)
  - `TEAMS_WEBHOOK_URL` (eval-regression + weekly-digest notifications)
  - **Owner:** Ops
  - **How:** GitHub repo → Settings → Secrets and variables → Actions → Secrets → **New repository secret** for each
  - **Done when:** `gh secret list` shows all 7 names
  - **Notes:**

### Secrets store

- [ ] **HB-6** Secrets store provisioned (EITHER AWS Secrets Manager OR env-file-on-disk)
  - **Owner:** Ops

  **Recommended path — AWS Secrets Manager:**
  Provision secret `/mmc/cts/kb-assistant` in `us-east-1` with 7 keys:
  - `ENTRA_CLIENT_SECRET` (from Entra — see HB-8)
  - `SESSION_SECRET` (32+ random bytes; `openssl rand -base64 48` works)
  - `QUESTION_HASH_SALT` (random, pre-register rotation cadence)
  - `APPLICATIONINSIGHTS_CONNECTION_STRING` (from App Insights resource blade)
  - `TEAMS_WEBHOOK_URL` (same value as HB-5's GHA secret)
  - `SERVICENOW_SERVICE_ACCOUNT` (read-only SN creds — Basic auth `user:password`)
  - `SN_INSTANCE` (e.g. `mmcnow.service-now.com`)
  - **How:** `docs/env-handling.md` + `docs/entra-app-registration-setup.md` §6 (`aws secretsmanager create-secret`)

  **OR (alternative for no-AWS pilots) — env-file-on-disk:**
  - Follow `docs/deploy-windows.md` §4.2 (alternative) for full instructions.
  - Copy `.env.production.example` from the repo root, fill in all 11 keys, place at `D:\kbroles\.env.production` on the Windows box.
  - Lock down ACL to the service account (`icacls D:\kbroles\.env.production /inheritance:r /grant:r "<svcAcct>:R"`).
  - Use `scripts/start.ps1` as the Scheduled Task launcher (reads the env file, then starts Node with logging — see HB-3).
  - Do NOT set `AWS_SECRET_NAME` or `AWS_REGION` as machine-scope env vars — their absence is what activates the env-file path in `loadSecrets()`.

  - **Done when:** EITHER `aws secretsmanager get-secret-value --secret-id /mmc/cts/kb-assistant --region us-east-1` returns a JSON blob with all 7 keys, OR `D:\kbroles\.env.production` exists on the Windows box with all 11 keys populated and ACL'd to the service account per `docs/deploy-windows.md` §4.2 (alternative).
  - **Notes:**

- [ ] **HB-7** *(optional — skip if using HB-6 env-file alternative)* Windows Server IAM credentials configured (AWS SDK credential chain finds them)
  - **Owner:** Ops
  > If using the env-file-on-disk path (HB-6 alternative), this item can be skipped. The Scheduled Task launches via `scripts/start.ps1` which doesn't reach AWS at runtime.
  - **How:** `docs/deploy-windows.md` §2 (either IAM role via instance profile, or `C:\Users\<SvcAccount>\.aws\credentials` + `config`)
  - **Done when:** `aws sts get-caller-identity --region us-east-1` works on the Windows box as the service account the Scheduled Task runs as
  - **Notes:**

### Entra

- [ ] **HB-8** Entra App Registration complete
  - **Owner:** Entra admin
  - **How:** `docs/entra-app-registration-setup.md` §§1–5
  - **Done when:** App Registration exists with:
    - Web platform + exact-match redirect URI `https://<APP_HOSTNAME>/api/auth/callback` (Pitfall 4 — trailing-slash matters)
    - Client secret generated with **24-month expiry** diary entry
    - App Role `KbAssistant.User` defined (id captured into `docs/entra-app-registration-setup.md`)
    - Graph `User.Read` admin consent granted
    - Enterprise Application exists (auto-created on first consent)
  - **Notes:**

### MGTI / LLM

- [ ] **HB-9** MGTI ingress key + URL + CA bundle obtained
  - **Owner:** Ops (coordinates with MMC platform team)
  - **How:** MMC platform team provides `LLM_API_KEY` + confirms `LLM_BASE_URL` + provides corporate CA bundle for `NODE_EXTRA_CA_CERTS`
  - **Done when:** Values recorded in EITHER AWS Secrets Manager OR `D:\kbroles\.env.production` (`LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`) AND the CA bundle file is on the Windows box with `NODE_EXTRA_CA_CERTS` set as machine-scope env var (the Scheduled Task reads it at start — NOT from .env, regardless of which secrets path you chose, see `docs/env-handling.md` §3)
  - **Notes:**

---

## 🔴 Go / No-Go Gate #1 — First Deploy

**Before triggering the first deploy**, all HB-1 through HB-9 must be checked.

- [ ] **GATE-1** All hard blockers green; first deploy triggered
  - **How:** `git push origin main` (or re-run deploy via `gh workflow run deploy.yml --ref main`)
  - **Done when:** `/api/health` canary returns `{status:'ok'}` from the Windows Server; Scheduled Task `KbAssistant` shows status `Running`
  - **Notes:**

- [ ] **GATE-1.1** Entra admin signs in as themselves first (smoke test the full auth loop)
  - **Done when:** Admin can reach `https://<APP_HOSTNAME>/`, completes Entra sign-in, lands on role-select screen
  - **If it fails:** common error codes are `AADSTS50011` (redirect URI mismatch — re-check HB-8), `AADSTS700218` (client secret wrong — re-check HB-6 ENTRA_CLIENT_SECRET), `403 access_denied` (admin doesn't have `KbAssistant.User` role — grant it to themselves via HB-8's Enterprise Application)
  - **Notes:**

---

## 🟡 Soft Blockers (deploy green, pilot won't work)

### Observability

- [ ] **SB-1** App Insights workbook deployed
  - **Owner:** Ops
  - **How:** `docs/ops/workbook-deploy-procedure.md` — run `ops/alerts/provision.sh` workbook portion with a real UUID: `--parameters workbookId=$(uuidgen)`
  - **Done when:** Azure Portal → Monitor → Workbooks shows `kb-assistant-pilot` workbook; all 5 sections render (Section 5 EvalTrend will be empty — TD-1, known gap)
  - **Notes:**

- [ ] **SB-2** Azure Monitor alerts provisioned (4 rules)
  - **Owner:** Ops
  - **How:** `docs/ops/workbook-deploy-procedure.md` — `ops/alerts/provision.sh` alerts portion (deploys `alerts.bicep` — action group + 4 scheduledQueryRules)
  - **Done when:** Azure Portal → Monitor → Alerts → Alert rules shows 4 rules (`kb-p1-chat-5xx`, `kb-p2-fallback-rate`, `kb-p2-thumbs-down-rate`, `kb-p2-validator-flip-rate`); action group has the Teams webhook URL bound
  - **Notes:**

- [ ] **SB-3** Teams webhook validated against Common Alert Schema
  - **Owner:** Ops
  - **How:** `docs/ops/teams-webhook-validation-procedure.md` — curl test with sample payload. If tenant blocks the schema, provision the Logic App buffer (~2h of work, documented in the same runbook)
  - **Done when:** A synthetic P2 alert trigger posts to the pilot Teams channel with readable content
  - **Notes:**

- [ ] **SB-4** Branch protection on `main` requires `verify` workflow job
  - **Owner:** Ops
  - **How:** GitHub repo → Settings → Branches → Branch protection rules → **Add rule** → pattern `main`, require status checks, select `verify` job
  - **Done when:** A test PR shows "Merging is blocked — required checks have not passed" until CI completes
  - **Notes:**

- [ ] **SB-5** GitHub Issues labels created: `eval-regression`, `content-steward`
  - **Owner:** Ops
  - **How:** `gh label create eval-regression --color B60205` and `gh label create content-steward --color 0E8A16` (or via web UI)
  - **Done when:** `gh label list` shows both
  - **Notes:**

### Pre-pilot sign-off

- [ ] **SB-6** `{{STEWARD_NAME}}`, `{{STEWARD_BACKUP_NAME}}`, `{{SIGNOFF_DATE}}` placeholders filled in:
  - `docs/content-steward-runbook.md`
  - `docs/measurement-plan.md`
  - **Owner:** Content Steward (self-signs) + Knowledge team lead
  - **Done when:** `grep -rn '{{' docs/` returns zero matches in those two files
  - **Notes:**

- [ ] **SB-7** ServiceNow schema validation passed with live creds
  - **Owner:** Content Steward
  - **How:** `pnpm sn:validate` (reads `SERVICENOW_SERVICE_ACCOUNT` + `SN_INSTANCE` from env/AWS)
  - **Done when:** Output pasted into `docs/content-steward-runbook.md` §Schema Validation; confirms `u_rejection_reason` + `workflow_state` fields exist with expected enums
  - **Notes:**

- [ ] **SB-8** Measurement plan signed off
  - **Owner:** Pilot coordinator + Content Steward + Knowledge team lead
  - **How:** Review `docs/measurement-plan.md` — confirm 4 pre-registered primary metrics + 5 secondary metrics + 4 pre-registered confounders make sense for the cohort
  - **Done when:** Signoff checklist at bottom of `measurement-plan.md` has every box checked with named signatory + date
  - **Notes:**

- [ ] **SB-9** Baseline flagged-article rate captured (pre-pilot snapshot)
  - **Owner:** Content Steward
  - **How:** `pnpm pull:servicenow -- --baseline` (requires HB-6 + HB-7 complete so AWS creds work)
  - **Done when:** `ops/rejected-articles/baseline-pre-pilot.json` exists and is committed to the repo; captures 90 days of pre-pilot flagged-rate data
  - **Notes:**

---

## 🔴 Go / No-Go Gate #2 — Pilot Launch Authorisation

**Before inviting the pilot cohort**, all SB-1 through SB-9 must be checked.

- [ ] **GATE-2** Pilot launch authorised by Knowledge team lead
  - **How:** Knowledge team lead reviews this checklist, SB-8 signatures, and the milestone audit (`.planning/milestones/v1-MILESTONE-AUDIT.md`)
  - **Done when:** Authorising email / Teams message on file; add link or screenshot reference here
  - **Notes:**

---

## 🟢 Pilot Launch

### Cohort onboarding

- [ ] **PL-1** Pilot cohort identified (named list)
  - **Owner:** Pilot coordinator (with Knowledge team)
  - **Guidance:** Target Author lane first (Tier II/III + SMEs + Knowledge team). Add Consumer lane if bandwidth allows. Keep total < 30 for first-week measurement clarity.
  - **Done when:** List of named users + email addresses recorded (in a secure location — do not commit to repo)
  - **Notes:**

- [ ] **PL-2** `KbAssistant.User` App Role granted to each cohort member
  - **Owner:** Entra admin
  - **How:** Entra portal → App Registration → Enterprise Application → Users and groups → **+ Add user/group** → select user → assign `KbAssistant.User` role
  - **Done when:** Every name on PL-1's list appears in the Enterprise Application user list with role `KbAssistant.User`
  - **Notes:**

- [ ] **PL-3** Production URL shared with cohort + onboarding message sent
  - **Owner:** Pilot coordinator
  - **Suggested message:** Short intro + link to `docs/user-guide.md` + encouragement to flag gaps freely
  - **Done when:** Message sent; record channel/method here
  - **Notes:**

- [ ] **PL-4** Confirm About-tooltip seen by each cohort member (Pilot day 1–3)
  - **Owner:** Pilot coordinator
  - **How:** 1:1 check-in or pilot-channel ask ("did you see the 'About this assistant' popover? Any questions?")
  - **Done when:** Every cohort member has at least one `session_start` event in App Insights AND has confirmed seeing the About popover
  - **Notes:**

---

## 🔵 Operational (ongoing — first 2 weeks critical)

- [ ] **OP-1** Week-1 digest reviewed (posts Monday ~09:00 AEST via `weekly-digest.yml`)
  - **Target:** ≥50% of PL-1's cohort had at least one session in the past 7 days
  - **If below threshold:** reach out individually to non-active users; common causes are "forgot the URL" / "didn't know I was onboarded" / "couldn't sign in and didn't flag it"
  - **Notes:**

- [ ] **OP-2** Week-2 digest reviewed
  - **Target:** ≥50% cumulative cohort activity; trending stable or up on sessions + thumbs-up rate
  - **Notes:**

- [ ] **OP-3** First monthly Content Steward issue triaged (auto-opens 1st of month via `steward-monthly.yml`)
  - **Owner:** Content Steward (named in SB-6)
  - **How:** `docs/content-steward-runbook.md` — pull output + fill the 50-item decision checklist in the auto-opened issue
  - **Notes:**

- [ ] **OP-4** Post-pilot paired-metric comparison run (end of pilot window)
  - **Owner:** Content Steward + Knowledge team
  - **How:** `pnpm pull:servicenow` (no `--baseline` flag — captures current snapshot), compare against `baseline-pre-pilot.json` from SB-9
  - **Done when:** Comparison written up; decision made on GA (v1.1+) vs iterate vs pause
  - **Notes:**

---

## Reference: Known Tech Debt (non-blocking)

See `.planning/milestones/v1-MILESTONE-AUDIT.md` frontmatter `tech_debt` for full details. None of these block launch:

- **TD-1** Workbook Section 5 (EvalTrend) is inert — no code emits `eval_run_completed` events yet
- **TD-2** 6 events emitted but not surfaced in workbook KQL panels
- **TD-3** `trackEvent(name: string)` not narrowed to `EventName` type
- **TD-4** `mockChatSuccess` fixture lacks `message_id` SSE frame
- **TD-5** Workbook GUID placeholder (operator supplies real UUID at SB-1 deploy time)
- **TD-6** Flow E (sign-back-in) Playwright coverage — intentional CI constraint (live Entra can't be tested in CI)

---

## Status Summary

> Update this line as you progress.

**As of _______________:** Hard blockers N/N · Soft blockers N/N · Pilot launch N/N · Operational N/N

**Next blocker:** ____________

**Estimated pilot day 1:** ____________

---

*Created: 2026-04-24 for v1 Pilot Release rollout. Maintained by whoever is driving the deploy.*
