# Windows Server Deployment — KB Assistant

One-time setup for the on-prem Windows Server box that hosts the KB Assistant. After this runbook, the GitHub Actions `deploy` workflow (`.github/workflows/deploy.yml`) will push updates automatically on every merge to `main`.

**Time required:** ~90 minutes for the first full run-through (most of it waiting for installs + waiting for IT to provision things you can't do yourself).

**Prerequisites:**
- Windows Server (2019 or later) with Administrator access OR a named service account with equivalent rights.
- Domain-joined box inside the MMC corporate network, reachable on a DNS name the pilot users can resolve (e.g. `usdf11v1784.mercer.com`).
- AWS credentials already configured on the box per planning context — credentials sit at `%USERPROFILE%\.aws\credentials` for the service account, OR `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` env vars at machine scope.
- Entra App Registration complete (see `docs/entra-app-registration-setup.md`) — you need the client ID / tenant ID / client secret before Step 2.
- AWS Secrets Manager secret `/mmc/cts/kb-assistant` exists (see `docs/entra-app-registration-setup.md` Step 6) — `loadSecrets()` reads this at startup.
- SSL certificate for the FQDN — PEM or PFX from the MMC network team. Required for IIS binding in Step 5.

Throughout this doc, `<app-host>` is a placeholder for the Windows Server FQDN (e.g. `usdf11v1784.mercer.com`). Replace every occurrence with your real host before running commands.

---

## Step 1 — Install Node.js 20

1. Download the Node.js 20.x LTS Windows Installer (`.msi`) from https://nodejs.org/en/download.
2. Run the installer **as Administrator**. Default location is `C:\Program Files\nodejs\`. Accept all defaults, including the "Add to PATH" option.
3. Verify in a NEW PowerShell window (open after install so the PATH refresh takes effect):
   ```powershell
   node --version   # → v20.x.x
   npm --version    # → 10.x.x
   ```

**Pitfall:** installing Node under an individual user profile (via nvm-windows, for example) means the Windows Scheduled Task running as a service account or `LocalSystem` won't find `node.exe`. Always install system-wide with the official `.msi`. The Scheduled Task action in Step 4 references the full path `C:\Program Files\nodejs\node.exe`.

**How you know it worked:** `Get-Command node` prints `C:\Program Files\nodejs\node.exe` in a fresh PowerShell window, and `node --version` prints a v20 release.

---

## Step 2 — Verify AWS Credentials

The app's `loadSecrets()` function reads `/mmc/cts/kb-assistant` from AWS Secrets Manager (region `us-east-1`) via the standard AWS SDK credential chain: environment variables → `%USERPROFILE%\.aws\credentials` file → process credential provider.

1. Open PowerShell **as the account the Scheduled Task will run as** (usually `LocalSystem`, or a named service account per your tenant policy).
2. If you don't have the AWS CLI installed, download and install it from https://aws.amazon.com/cli/.
3. Test:
   ```powershell
   aws secretsmanager get-secret-value --secret-id /mmc/cts/kb-assistant --region us-east-1
   ```
4. Expected: a JSON response with a `SecretString` field containing your secret JSON. If you get `AccessDenied` or `NoCredentialProviders`, credentials are not reachable from this account. Check:
   - Machine-scope env vars are set: `[System.Environment]::GetEnvironmentVariable('AWS_ACCESS_KEY_ID', 'Machine')` prints a value.
   - OR the service account's `%USERPROFILE%\.aws\credentials` has a `[default]` profile with `aws_access_key_id` + `aws_secret_access_key`.
   - The IAM principal has at minimum `secretsmanager:GetSecretValue` on `/mmc/cts/kb-assistant`.

**Do NOT proceed to Step 3 until this call succeeds under the account the Scheduled Task will run as.** A successful `get-secret-value` here is the single strongest guarantee that `loadSecrets()` will work at runtime.

**How you know it worked:** the CLI returns a JSON object with `SecretString`, `ARN`, `Name: "/mmc/cts/kb-assistant"`, and `VersionId`. The `SecretString` value is a JSON blob containing `SESSION_SECRET`, `ENTRA_CLIENT_ID`, `ENTRA_TENANT_ID`, `ENTRA_CLIENT_SECRET`, `LLM_API_KEY`, `LLM_BASE_URL`.

---

## Step 3 — Create the Deploy Directory

Pick the deploy root. The default used by `.github/workflows/deploy.yml` is `D:\kbroles\.next\standalone`. You can override this via a GitHub Repository Variable `KBASSISTANT_DEPLOY_ROOT` — see Step 6.

```powershell
New-Item -ItemType Directory -Path 'D:\kbroles\.next\standalone' -Force
New-Item -ItemType Directory -Path 'D:\logs' -Force
```

The standalone bundle will be extracted into `D:\kbroles\.next\standalone` by each deploy. Initially the directory is empty — the first workflow run populates it with `server.js`, `.next/`, `public/`, and `node_modules/` per the Next.js `output: 'standalone'` bundler.

**How you know it worked:** `Test-Path D:\kbroles\.next\standalone` returns `True` and `Test-Path D:\logs` returns `True`. Both are empty for now.

---

## Step 4 — Create the Windows Scheduled Task

The Node.js server runs as a Windows **Scheduled Task** — this is the MMC standard per the planning context. Not a Windows Service wrapper, not a user-mode process manager. The Scheduled Task triggers at system startup and restarts automatically on failure. The GitHub Actions deploy workflow uses `schtasks /end` + `schtasks /run` to stop/start the process during each rotation.

### 4.1 — Create the task via Task Scheduler GUI

1. Open **Task Scheduler** (`taskschd.msc`).
2. In the right pane, click **Create Task…** (NOT Create Basic Task — we need the advanced settings that Basic Task hides).
3. **General tab:**
   - Name: `KbAssistant`
   - Description: `KB Knowledge Assistant — Next.js standalone server`
   - Security options → **Run whether user is logged on or not** (checked).
   - User account: the service account from Step 2 (`LocalSystem`, or a named service account — whichever you verified in Step 2).
   - Configure for: Windows Server (your version, e.g. Windows Server 2019).
4. **Triggers tab:**
   - New → Begin the task: `At startup`. No other settings — just the startup trigger.
   - (Optional belt-and-suspenders) add a second `Daily` trigger that fires at off-peak hours. If the box runs for weeks without reboot, a daily restart keeps memory use bounded. Skip if your operational preference is "restart only on upgrade".
5. **Actions tab:**
   - New → Action: `Start a program`.
   - Program/script: `C:\Program Files\nodejs\node.exe`
   - Add arguments: `D:\kbroles\.next\standalone\server.js`
   - Start in: `D:\kbroles\.next\standalone`
   - (If you later add logging — see 4.3 — change the Action to `powershell.exe` with arguments `-ExecutionPolicy Bypass -File D:\kbroles\start.ps1`.)
6. **Conditions tab:** uncheck **Start the task only if the computer is on AC power** (not applicable to server hardware anyway).
7. **Settings tab:**
   - **Allow task to be run on demand:** CHECKED (required — the GitHub Actions workflow uses `schtasks /run` which is an on-demand start).
   - **If the task fails, restart every:** `1 minute`, **Attempt to restart up to:** `3 times`.
   - **If the running task does not end when requested, force it to stop:** CHECKED.
   - **If the task is already running, then the following rule applies:** `Do not start a new instance`.
   - Leave **Stop the task if it runs longer than** UNCHECKED — the server is long-running by design.
8. Click **OK**. Provide the service account password if prompted.

### 4.2 — Configure machine-scope environment variables

The Scheduled Task inherits the SYSTEM or service-account environment at task start. Set the following at MACHINE scope so both the self-hosted runner (for deploy-time access) and the task (for runtime access) see them:

```powershell
[System.Environment]::SetEnvironmentVariable('NODE_ENV', 'production', 'Machine')
[System.Environment]::SetEnvironmentVariable('PORT', '3001', 'Machine')
[System.Environment]::SetEnvironmentVariable('HOSTNAME', '127.0.0.1', 'Machine')
[System.Environment]::SetEnvironmentVariable('APP_BASE_URL', 'https://<app-host>', 'Machine')
[System.Environment]::SetEnvironmentVariable('AWS_SECRET_NAME', '/mmc/cts/kb-assistant', 'Machine')
[System.Environment]::SetEnvironmentVariable('AWS_REGION', 'us-east-1', 'Machine')
```

Replace `<app-host>` with your real FQDN. `HOSTNAME=127.0.0.1` and `PORT=3001` keep the Node server bound to loopback — IIS reverse-proxies the public 443 traffic to it in Step 5.

**Reboot the box OR explicitly restart the Scheduled Task after setting machine-scope env vars.** Processes started before the env vars were set will not see them. A simple `schtasks /end /tn KbAssistant` + `schtasks /run /tn KbAssistant` is sufficient if the task was running.

### 4.3 — (Recommended) Wrap the action for stdout logging

Scheduled Tasks by default do NOT capture stdout/stderr. Node's `console.log` output is lost. For a pilot-grade box, wrap the action in a PowerShell script that redirects output to a file.

Create `D:\kbroles\start.ps1`:

```powershell
# D:\kbroles\start.ps1 — wraps Node.js standalone server, redirects stdout/stderr to D:\logs\kbassistant.log
& 'C:\Program Files\nodejs\node.exe' 'D:\kbroles\.next\standalone\server.js' *>&1 | Tee-Object -FilePath 'D:\logs\kbassistant.log' -Append
```

Then change the Scheduled Task Action (Step 4.1 #5) to:
- Program/script: `powershell.exe`
- Add arguments: `-ExecutionPolicy Bypass -File D:\kbroles\start.ps1`
- Start in: `D:\kbroles\.next\standalone`

**Log rotation:** for pilot scale, let `D:\logs\kbassistant.log` grow and monitor disk weekly — you'll tidy up in Phase 6. For an early rotation hook, add a second daily Scheduled Task that rotates the log to `kbassistant-<date>.log` and compresses older files.

### 4.4 — Verify the task is queryable and startable

```powershell
schtasks /query /tn KbAssistant       # Should return the task definition (Ready / Running / Disabled states)
schtasks /run /tn KbAssistant         # On-demand run (same call the deploy workflow makes)
netstat -ano | findstr :3001          # Should show a Node process LISTENING on 127.0.0.1:3001
```

NOTE: `/api/health` returns 200 only after the deploy dir is populated (Step 7). If you run `/api/health` now with an empty `D:\kbroles\.next\standalone`, the task will crash-loop (no `server.js` to execute). That's fine — the crash loop stops hitting its 3-attempt restart limit, and the first successful deploy will put things right.

**How you know it worked:** `schtasks /query /tn KbAssistant` returns the task. `schtasks /run /tn KbAssistant` returns "SUCCESS: Attempted to run the scheduled task". `Get-Content D:\logs\kbassistant.log -Tail 20` (if logging is wired per 4.3) shows either Node startup OR a module-not-found error about `server.js` — both are expected states before the first deploy.

---

## Step 5 — Configure IIS Reverse Proxy

IIS terminates TLS at 443 and forwards plain HTTP to `127.0.0.1:3001` (the Node server from Step 4). The SSL cert comes from the MMC network team (PEM or PFX).

### 5.1 — Install IIS + URL Rewrite + ARR

1. In **Server Manager → Add Roles and Features**, install the **Web Server (IIS)** role. Accept default role services.
2. Download and install (one-time):
   - **URL Rewrite 2.1** module: https://www.iis.net/downloads/microsoft/url-rewrite
   - **Application Request Routing 3.0** (ARR) module: https://www.iis.net/downloads/microsoft/application-request-routing

Both installers are `.msi` files — run as Administrator.

### 5.2 — Create the IIS site

1. In **IIS Manager**, right-click **Sites → Add Website**.
2. Fill in:
   - Site name: `kbassistant`
   - Physical path: `D:\inetpub\kbassistant` (create this directory if it doesn't exist — IIS just needs a physical path for the rewrite rule; no files go here except `web.config`).
   - Binding: `https` / `443` / `<app-host>`. Select your SSL certificate from the dropdown (install the cert into the machine cert store first if it's a PFX — double-click, "Install to Local Machine → Personal").
3. Click **OK**.

### 5.3 — Enable ARR proxy + set SSE-safe buffer

This is **critical** for SSE streaming. Without it, `/api/chat` tokens buffer until the stream closes (**Pitfall 6**).

1. In IIS Manager, click the **server root** (top of the tree — not the `kbassistant` site).
2. Double-click **Application Request Routing Cache**.
3. In the right pane, click **Server Proxy Settings**.
4. Check **Enable proxy**.
5. **Response buffer threshold (KB):** set to `0`. ← This disables ARR's output buffering. (`responseBufferLimit=0` is the equivalent web.config name.)
6. Click **Apply**.

### 5.4 — Add the rewrite rule

Create `D:\inetpub\kbassistant\web.config` with this content:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="ReverseProxyToNode" stopProcessing="true">
          <match url="(.*)" />
          <action type="Rewrite" url="http://127.0.0.1:3001/{R:1}" />
          <serverVariables>
            <set name="HTTP_X_FORWARDED_PROTO" value="https" />
          </serverVariables>
        </rule>
      </rules>
    </rewrite>
    <httpProtocol>
      <customHeaders>
        <add name="X-Accel-Buffering" value="no" />
      </customHeaders>
    </httpProtocol>
  </system.webServer>
</configuration>
```

Two load-bearing pieces here (both Pitfall 6 territory):

- `X-Forwarded-Proto: https` — tells Node that the origin connection was HTTPS even though the reverse-proxy hop is HTTP. iron-session's `secure: true` cookie attribute relies on this being consistent with the HTTPS front-end.
- `X-Accel-Buffering: no` — a hint that some proxies (nginx-style) honor for SSE streams. IIS + ARR does not honor it directly (hence `responseBufferLimit=0` in 5.3 is the actual fix), but setting the header is harmless and helps if the traffic ever traverses an additional proxy layer.

### 5.5 — Allow `serverVariables` in the URL Rewrite rule (one-time IIS config)

By default, IIS does not let `serverVariables` be set from a site-level `web.config`. You must allow `HTTP_X_FORWARDED_PROTO` at the server root:

1. IIS Manager → **server root → Configuration Editor**.
2. Section: `system.webServer/rewrite/allowedServerVariables`.
3. Click **Collection** → Edit Items → Add `HTTP_X_FORWARDED_PROTO` → Apply.

Without this, the rewrite rule silently ignores the `serverVariables` set directive and `X-Forwarded-Proto` is never sent.

### 5.6 — Verify the proxy end-to-end

```powershell
# From the Windows box itself:
curl.exe -k -I http://127.0.0.1:3001/api/health    # Node direct — 200 OK {"status":"ok"} after first deploy
curl.exe -I https://<app-host>/api/health           # Via IIS proxy — same 200 OK
```

Expected: both calls return HTTP 200. The IIS call may warn on cert validation if you're using `-k` (skip cert verify) with a self-signed or dev cert; in production the MMC cert should validate cleanly.

**SSE buffering check (after full deploy + Entra sign-in are working):** visit `https://<app-host>/`, sign in, ask a question. In browser DevTools → Network tab → select the `/api/chat` request → Preview pane. Tokens should appear incrementally as they stream, not all at once at stream close. If tokens only appear after the "done" event, `responseBufferLimit=0` (5.3) didn't take effect — revisit ARR settings.

**How you know it worked:** `https://<app-host>/api/health` returns 200 `{"status":"ok"}`. Browser loads `https://<app-host>/` and redirects to Entra sign-in (meaning the request reached Node, which read `APP_BASE_URL`, and kicked off the auth flow).

---

## Step 6 — Register the GitHub Actions Self-Hosted Runner

The deploy workflow targets `runs-on: [self-hosted, windows, kbassistant]`. You must register a GitHub Actions self-hosted runner on the Windows box with those labels.

1. In GitHub: **Settings → Actions → Runners → New self-hosted runner**.
2. Select **Windows** and **x64**. GitHub displays a one-time registration token + exact PowerShell commands.
3. Follow the shown PowerShell commands on the Windows box, adding the `--labels kbassistant` flag at config time:
   ```powershell
   # Example (GitHub shows the exact commands with a one-time token):
   mkdir C:\actions-runner; cd C:\actions-runner
   Invoke-WebRequest -Uri https://github.com/actions/runner/releases/download/v2.x.x/actions-runner-win-x64-2.x.x.zip -OutFile actions-runner.zip
   Expand-Archive actions-runner.zip -DestinationPath .
   .\config.cmd --url https://github.com/<org>/<repo> --token <RUNNER_TOKEN> --labels kbassistant --runasservice
   ```
4. When asked about service installation: choose **yes** (runs as a Windows service, not an interactive foreground process).
5. Verify: in GitHub **Settings → Actions → Runners**, the new runner shows up with status `Idle`, labels `self-hosted`, `windows`, `X64`, `kbassistant`.

### 6.1 — Optional GitHub Repository Variables

In **Settings → Secrets and variables → Actions → Variables**, add these Repository Variables if your Windows box uses non-default paths:

| Variable | Default (if unset) | Purpose |
|---|---|---|
| `KBASSISTANT_DEPLOY_ROOT` | `D:\kbroles\.next\standalone` | Where the standalone bundle is extracted |
| `KBASSISTANT_SCHEDULED_TASK` | `KbAssistant` | Matches Step 4 task name |
| `KBASSISTANT_HEALTH_URL` | `http://localhost:3001/api/health` | Canary URL the deploy job hits after restart |

The workflow's defaults match the defaults in this runbook, so you can skip setting any of these if you followed Steps 3–4 verbatim.

**How you know it worked:** runner shows `Idle` in GitHub. Push a trivial commit to `main` (or manually run **Actions → Deploy to On-Prem Windows → Run workflow**). The `build` job runs on `ubuntu-latest`; the `deploy` job picks up on the self-hosted Windows runner and executes.

---

## Step 7 — First Deploy + Verify

1. Push a commit to `main` (or trigger the `deploy` workflow manually via Actions → Run workflow). Watch the run.
2. Expected timing: `build` job (~3 min on ubuntu-latest) → `deploy` job (~2 min on self-hosted Windows) → end-to-end ~5 min.
3. After both jobs green-check, visit `https://<app-host>/` in a browser. Expected: redirect to Entra sign-in.
4. Sign in with a user assigned the `KbAssistant.User` role (see `docs/entra-app-registration-setup.md` Step 5).
5. You should land on the role-select screen. Pick a role. Ask a question. Watch tokens stream in incrementally (not buffered — confirms IIS SSE config from Step 5 is correct).

### 7.1 — What the deploy workflow actually does

For reference (so you know what to look for in the runner logs):

1. **Build job (ubuntu-latest):** checkout → pnpm install → pnpm build (`output: 'standalone'`) → copies `public/` + `.next/static/` into the standalone folder (Pitfall 3) → tars → uploads artifact.
2. **Deploy job (self-hosted Windows):** download artifact → stops Scheduled Task (`schtasks /end`) → renames current `$deployRoot` → `$deployRoot.prev` → extracts new bundle → starts Scheduled Task (`schtasks /run`) → 30 s warm-up sleep → canary `Invoke-RestMethod` on `$healthUrl`.
3. **On canary failure (`if: failure()` step):** stops task → deletes new bundle → renames `.prev` back to primary → restarts task. This preserves the last-known-good deployment on every failed rollout.

### 7.2 — If something fails

- **Node crash on startup:** `Get-Content D:\logs\kbassistant.log -Tail 50` — look for missing env vars (`AWS_SECRET_NAME` unset → `loadSecrets()` falls through, then `env()` validation fails), bad secret JSON (`loadSecrets()` parse error), wrong port (another process on 3001).
- **Scheduled Task failures:** Event Viewer → Applications and Services Logs → Microsoft → Windows → TaskScheduler → Operational log. Look for task-start failures, which usually indicate a wrong executable path or permission issues.
- **IIS 502 Bad Gateway:** Node isn't listening on 3001. Confirm `netstat -ano | findstr :3001`. Confirm `D:\logs\kbassistant.log` shows "ready on http://127.0.0.1:3001" (or similar Next.js startup line). Confirm the Scheduled Task says "Running".
- **IIS 500 Internal Server Error with no Node log entry:** URL Rewrite rule isn't matching. Check `D:\inetpub\kbassistant\web.config` exists and has the `ReverseProxyToNode` rule. Check ARR proxy is enabled (5.3). Check IIS logs at `C:\inetpub\logs\LogFiles\W3SVC<n>\`.
- **SSE buffering (tokens arrive all at once at stream close):** `responseBufferLimit=0` didn't take. Revisit Step 5.3 — ARR Server Proxy Settings → Response buffer threshold (KB) = 0. Apply. IIS may need a restart (`iisreset`).

**How you know it worked:** end-to-end pilot user story completes — visit `https://<app-host>/`, sign in with Entra, pick a role, ask a question, watch incremental token stream, get a cited answer. `D:\logs\kbassistant.log` shows structured JSON Pino logs for each request.

---

## Rollback

The deploy workflow auto-rolls back on canary failure. If it didn't fire (or you need to manually roll back to the previous deploy for any reason):

```powershell
schtasks /end /tn KbAssistant
Remove-Item D:\kbroles\.next\standalone -Recurse -Force
Rename-Item D:\kbroles\.next\standalone.prev D:\kbroles\.next\standalone
schtasks /run /tn KbAssistant
```

If `D:\kbroles\.next\standalone.prev` doesn't exist (first-ever deploy, or a prior run already cleaned it up), no automatic rollback is possible — fix forward by pushing a revert commit and letting the deploy workflow bring the box back up.

**How you know it worked:** `curl.exe https://<app-host>/api/health` returns `{"status":"ok"}` and the running deployment is the previous commit (git SHA visible in the Next.js build output or by revisiting the site with a force-refresh).

---

## Reference: file and path inventory

| Path | Purpose | Created by |
|---|---|---|
| `C:\Program Files\nodejs\node.exe` | Node runtime | Step 1 (Node installer) |
| `D:\kbroles\.next\standalone\` | Deploy root — standalone Next.js bundle | Step 3 (empty), Step 7 (populated by deploy) |
| `D:\kbroles\.next\standalone.prev\` | Last-good deploy (rollback target) | deploy workflow (created on each successful deploy) |
| `D:\kbroles\start.ps1` | Optional wrapper for stdout logging | Step 4.3 (if you followed the logging recommendation) |
| `D:\logs\kbassistant.log` | Node.js stdout/stderr | Step 4.3 wrapper output |
| `D:\inetpub\kbassistant\web.config` | IIS reverse-proxy rewrite rule | Step 5.4 |
| `C:\inetpub\logs\LogFiles\W3SVC<n>\` | IIS access + error logs | IIS (automatic) |
| `C:\actions-runner\` | GitHub Actions self-hosted runner install root | Step 6 (runner config) |
| Task Scheduler → `KbAssistant` task | Process lifecycle for Node server | Step 4 |
| AWS Secrets Manager `/mmc/cts/kb-assistant` | Secrets source (read by `loadSecrets()` at startup) | `docs/entra-app-registration-setup.md` Step 6 |

---

*Last updated: Phase 5.1 — MMC-IT BFF pivot (on-prem Windows deploy). Process supervisor is Windows Scheduled Task. See `.planning/phases/05.1-mmc-it-bff-pivot-xmcp-pattern/05.1-RESEARCH.md` for architectural rationale.*
