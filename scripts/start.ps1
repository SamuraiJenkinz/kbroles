# scripts/start.ps1 — KB Assistant launcher for the no-AWS env-file-on-disk deploy path.
#
# Reads D:\kbroles\.env.production line by line, sets each KEY=VALUE pair into
# the current process environment, then launches node with Start-Process logging.
#
# Usage: powershell.exe -ExecutionPolicy Bypass -File scripts\start.ps1
#   (or change the Scheduled Task Action to reference this script — see
#    docs/deploy-windows.md Step 4.2 (alternative))
#
# This script is INTENTIONALLY server-specific:
#   - Env file path is hard-coded to D:\kbroles\.env.production (one level above
#     the standalone dir so it survives GHA redeploys that wipe .next\standalone\).
#   - Node exe path is hard-coded to C:\Program Files\nodejs\node.exe.
#   - Log path is hard-coded to D:\logs\kbassistant.log (created by Step 3 in
#     docs/deploy-windows.md).
#   - Stderr log path is hard-coded to D:\logs\kbassistant.err.log (created
#     alongside the stdout log; same icacls treatment).
#
# Security notes:
#   - No env values are ever written to stdout or the log file.
#   - Only a count of loaded vars is reported.
#   - Lock down D:\kbroles\.env.production with icacls after creation (see
#     docs/deploy-windows.md Step 4.2 (alternative)).

$ErrorActionPreference = 'Stop'

$EnvFile       = 'D:\kbroles\.env.production'
$NodeExe       = 'C:\Program Files\nodejs\node.exe'
$ServerJs      = 'D:\kbroles\.next\standalone\server.js'
$LogFile       = 'D:\logs\kbassistant.log'
$StderrLogFile = 'D:\logs\kbassistant.err.log'

# ── Guard: env file must exist before we try to load it ──────────────────────
if (-not (Test-Path $EnvFile)) {
    Write-Error "[start.ps1] FATAL: env file not found at $EnvFile. See docs\deploy-windows.md Step 4.2 (alternative)."
    exit 1
}

# ── Load env vars from file ───────────────────────────────────────────────────
$count = 0
foreach ($line in (Get-Content $EnvFile)) {
    $trimmed = $line.Trim()

    # Skip blank lines and comments.
    if ([string]::IsNullOrEmpty($trimmed) -or $trimmed.StartsWith('#')) {
        continue
    }

    # Find the first '=' — everything before is the key, everything after is
    # the value (preserves '=' characters inside values such as base64 strings).
    $eqIndex = $trimmed.IndexOf('=')
    if ($eqIndex -lt 0) {
        Write-Warning "[start.ps1] Skipping line with no '=' separator: $trimmed"
        continue
    }

    $key   = $trimmed.Substring(0, $eqIndex)
    $value = $trimmed.Substring($eqIndex + 1)

    Set-Item -Path "Env:$key" -Value $value
    $count++
}

# Report count only — never log values.
Write-Host "[start.ps1] Loaded $count env vars from $EnvFile"

# ── Launch Node in a child process with both streams redirected to disk ──────
#
# WHY Start-Process (not `& $NodeExe ... | Tee-Object`):
#   The pipe form works under an interactive admin shell but silently breaks
#   when this script is launched non-interactively by Task Scheduler. With no
#   TTY, Tee-Object's pipe context causes Node to detect a closed stdin and
#   exit shortly after `Ready in 0ms` — port 3001 never binds, IIS then 502s.
#   Start-Process gives the Node child its own (detached) standard handles
#   wired directly to log files, so stdin closure no longer signals shutdown.
#   Quick task 003 (2026-04-29) — converts the deploy-day workaround into the
#   real fix. See .planning/quick/003-fix-pilot-deploy-workarounds-into-real-fixes/.
#
# Start-Process requires DIFFERENT files for stdout vs stderr (it errors out if
# the same path is given for both). Stdout is the operational log the operator
# tails; stderr captures unexpected Node-level failures (rare).
#
# D:\logs\kbassistant.err.log is writable by NetworkService — already covered
# by the `icacls D:\logs /grant "NT AUTHORITY\NetworkService:(OI)(CI)W"` grant
# in docs/deploy-windows.md Step 3. No new operator action required.
$proc = Start-Process `
    -FilePath $NodeExe `
    -ArgumentList @($ServerJs) `
    -NoNewWindow `
    -RedirectStandardOutput $LogFile `
    -RedirectStandardError $StderrLogFile `
    -PassThru

Wait-Process -InputObject $proc
exit $proc.ExitCode
