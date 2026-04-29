---
phase: quick/001-add-no-aws-env-file-deploy-path
plan: 001
type: execute
wave: 1
depends_on: []
files_modified:
  - .env.production.example
  - .gitignore
  - scripts/start.ps1
  - src/config/secrets.ts
  - src/config/__tests__/secrets.test.ts
  - docs/deploy-windows.md
  - docs/env-handling.md
autonomous: true

must_haves:
  truths:
    - "Operator without AWS CLI access can stand up the v1 pilot by editing one file (D:\\kbroles\\.env.production) and launching scripts/start.ps1"
    - "loadSecrets() short-circuits silently (no info log, no AWS SDK import) when AWS_SECRET_NAME is unset"
    - "Existing AWS Secrets Manager happy path is unchanged when AWS_SECRET_NAME is set"
    - "NODE_EXTRA_CA_CERTS stays out of the env file (must remain machine-scope per docs/env-handling.md §3)"
    - "The .env.production file lives one level above the deploy target so it survives GHA redeploys (which wipe D:\\kbroles\\.next\\standalone\\)"
    - "docs/deploy-windows.md and docs/env-handling.md describe the no-AWS env-file path so future operators discover it"
  artifacts:
    - path: ".env.production.example"
      provides: "Annotated template covering 11 SECRET_KEYS + non-secret runtime config, with placement / ACL / NODE_EXTRA_CA_CERTS exception comments"
    - path: "scripts/start.ps1"
      provides: "PowerShell wrapper that loads D:\\kbroles\\.env.production into $env: then launches node server.js with Tee-Object logging"
    - path: "src/config/secrets.ts"
      provides: "Early-return guard in loadSecrets() when AWS_SECRET_NAME is unset"
      contains: "if (!process.env.AWS_SECRET_NAME)"
    - path: "src/config/__tests__/secrets.test.ts"
      provides: "Test case proving loadSecrets() returns {} without dynamic import / info log when AWS_SECRET_NAME is unset"
    - path: "docs/deploy-windows.md"
      provides: "New 'Step 4.2 (alternative) — Env file on disk (no AWS path)' sub-section"
    - path: "docs/env-handling.md"
      provides: "Short addendum in §5 acknowledging the env-file-on-disk alternative cascade"
  key_links:
    - from: "scripts/start.ps1"
      to: "D:\\kbroles\\.env.production"
      via: "line-by-line read, split on first =, $env:KEY = VALUE"
      pattern: "Get-Content.*\\.env\\.production"
    - from: "scripts/start.ps1"
      to: "D:\\kbroles\\.next\\standalone\\server.js"
      via: "node.exe launch with Tee-Object logging"
      pattern: "node\\.exe.*server\\.js"
    - from: "src/config/secrets.ts"
      to: "process.env.AWS_SECRET_NAME"
      via: "early-return guard before dynamic AWS SDK import"
      pattern: "if \\(!process\\.env\\.AWS_SECRET_NAME\\)"
    - from: "docs/deploy-windows.md"
      to: "scripts/start.ps1"
      via: "Step 4.2 (alternative) sub-section reference"
      pattern: "scripts/start\\.ps1"
    - from: "docs/env-handling.md §5"
      to: "docs/deploy-windows.md Step 4.2 (alternative)"
      via: "cross-link"
      pattern: "deploy-windows\\.md"
---

<objective>
Add a no-AWS deployment path for the v1 pilot: an env-file-on-disk alternative to AWS Secrets Manager. Operator edits `D:\kbroles\.env.production` (one level above the wipe-on-deploy target), launches `scripts/start.ps1`, and the app boots using `process.env` exclusively. The existing AWS Secrets Manager happy path stays intact for any future operator who flips back.

Purpose: Unblock the on-prem Windows pilot deploy for an operator without AWS CLI access. The fallback-to-process.env behaviour already exists in `src/config/secrets.ts` lines 80-90; this plan adds the missing pieces: env file template, start.ps1 wrapper, a clean early-return guard (so the noisy info log doesn't fire on every cold start in env-file mode), test coverage for the new branch, and documentation across `docs/deploy-windows.md` and `docs/env-handling.md`.

Output: Env file template + wrapper script + secrets.ts guard + test + two doc updates, grouped into 3 atomic commits.
</objective>

<execution_context>
@C:\Users\taylo\.claude/get-shit-done/workflows/execute-plan.md
@C:\Users\taylo\.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

@src/config/secrets.ts
@src/config/__tests__/secrets.test.ts
@docs/deploy-windows.md
@docs/env-handling.md
@.gitignore
</context>

<tasks>

<task type="auto">
  <name>Task 1: Env-file template + start.ps1 wrapper</name>
  <files>.env.production.example, .gitignore, scripts/start.ps1</files>
  <action>
**1a. Create `.env.production.example` at the repo root.**

Header comment block must explain:
- This file is the TEMPLATE. The real file lives on the Windows box at `D:\kbroles\.env.production` — one level ABOVE `D:\kbroles\.next\standalone\` so it survives GHA redeploys (the standalone dir is wiped on every deploy per `docs/deploy-windows.md` Step 7).
- ACL guidance — after copying to the server, lock it down:
  `icacls D:\kbroles\.env.production /inheritance:r /grant:r "<svcAcct>:R"`
  (replace `<svcAcct>` with the service account that runs the Node process).
- `NODE_EXTRA_CA_CERTS` is intentionally NOT in this template. Node reads it at TLS init, BEFORE any dotenv runs (see `docs/env-handling.md` §3, nodejs/node#51426). It MUST stay machine-scope per `docs/deploy-windows.md` Step 4.2.
- `AWS_SECRET_NAME` is intentionally NOT in this template. Its absence is what triggers the env-file-on-disk fallback path in `src/config/secrets.ts`.

Then list, with one short comment per group:

```
# === Runtime (non-secret) ===
NODE_ENV=production
PORT=3001
HOSTNAME=127.0.0.1
APP_BASE_URL=https://kbassistant.example.mmc.com
LLM_AUTH_MODE=
LLM_MODEL=
CONTENT_STEWARD_EMAIL=

# === Secrets (11 keys, mirror SECRET_KEYS in src/config/secrets.ts:27-39) ===
SESSION_SECRET=
ENTRA_CLIENT_ID=
ENTRA_CLIENT_SECRET=
ENTRA_TENANT_ID=
LLM_API_KEY=
LLM_BASE_URL=
APPLICATIONINSIGHTS_CONNECTION_STRING=
QUESTION_HASH_SALT=
SERVICENOW_SERVICE_ACCOUNT=
SN_INSTANCE=
TEAMS_WEBHOOK_URL=
```

Leave values blank — operator fills in on the server.

**1b. Update `.gitignore`** — append a line excluding `.env.production` (the existing entries cover `.env`, `.env.local`, `.env.*.local`, but NOT a bare `.env.production`). Add it under the existing env block:

```
.env.production
```

**1c. Create `scripts/start.ps1`.**

Behaviour:
- Constant `$EnvFile = 'D:\kbroles\.env.production'` (hard-code; the wrapper is server-specific).
- If `Test-Path $EnvFile` is false, write a clear error to stderr and exit 1: `[start.ps1] FATAL: env file not found at $EnvFile. See docs\deploy-windows.md Step 4.2 (alternative).`
- Read the file with `Get-Content $EnvFile`. For each line:
  - Trim whitespace.
  - Skip if empty or starts with `#`.
  - Find the first `=`. If absent, skip (with a `Write-Warning`).
  - Split into `$key` (everything before the first `=`) and `$value` (everything after — preserves `=` chars in values like base64 strings).
  - Set `Set-Item -Path "Env:$key" -Value $value`.
  - Increment a counter.
- After the loop, log a single line (no values): `Write-Host "[start.ps1] Loaded $count env vars from $EnvFile"`.
- Launch node:
  ```
  & 'C:\Program Files\nodejs\node.exe' 'D:\kbroles\.next\standalone\server.js' *>&1 | Tee-Object -FilePath 'D:\logs\kbassistant.log' -Append
  exit $LASTEXITCODE
  ```
- Use `$ErrorActionPreference = 'Stop'` at the top so file-read failures throw cleanly.

Avoid: do NOT use `dotenv` or any external module — pure PowerShell, no dependencies. Do NOT log values. Do NOT touch `NODE_EXTRA_CA_CERTS`, `AWS_*`, or anything not in the env file.
  </action>
  <verify>
- `cat .env.production.example` shows all 11 SECRET_KEYS + the 7 runtime vars + header comments covering placement / ACL / NODE_EXTRA_CA_CERTS exception.
- `grep -q "^\.env\.production$" .gitignore` returns 0.
- `cat scripts/start.ps1` — manually read back, confirm: file existence guard, line parsing splits on first `=` only, no values logged, Tee-Object launch matches existing Step 4.3 pattern, exit code propagated.
- PowerShell syntax check (Windows): `pwsh -NoProfile -Command "& { . { Get-Command -Syntax scripts/start.ps1 } }"` OR simply `powershell -NoProfile -File scripts/start.ps1 -WhatIf` is fine; if neither runs in the dev env, just lint by reading.
  </verify>
  <done>
- `.env.production.example` exists at repo root with header comments + 18 vars (7 runtime + 11 secrets), no NODE_EXTRA_CA_CERTS, no AWS_* keys.
- `.gitignore` has a `.env.production` line.
- `scripts/start.ps1` exists, launches node from the unwiped path, loads env from `D:\kbroles\.env.production`, logs only a count, propagates exit code.
  </done>
</task>

<task type="auto">
  <name>Task 2: secrets.ts early-return guard + test coverage</name>
  <files>src/config/secrets.ts, src/config/__tests__/secrets.test.ts</files>
  <action>
**2a. Add early-return guard in `src/config/secrets.ts`.**

In `loadSecrets()`, BEFORE the existing `try { ... } catch { ... }` block (i.e. before line 49 — the dynamic AWS SDK import), AFTER the cache check on line 44, add:

```ts
// No-AWS deploy path: when AWS_SECRET_NAME is unset, callers rely on
// process.env populated by scripts/start.ps1 reading D:\kbroles\.env.production.
// Short-circuit BEFORE the dynamic AWS SDK import + the catch-and-log path
// to avoid a noisy info log on every cold start.
// See: docs/deploy-windows.md Step 4.2 (alternative).
if (!process.env.AWS_SECRET_NAME) {
  _cache = {}
  return _cache
}
```

Then DELETE the `?? '/mmc/cts/kb-assistant'` default on the existing `secretName` line — once the guard is in place, the default is unreachable, and keeping it would mislead future readers. Change:

```ts
const secretName = process.env.AWS_SECRET_NAME ?? '/mmc/cts/kb-assistant'
```

to:

```ts
const secretName = process.env.AWS_SECRET_NAME!  // guarded above
```

Leave the `try/catch` block, the dynamic import, the SECRET_KEYS loop, the `_cache` write, and the `__resetSecretsCacheForTests` export untouched. Leave the existing comment block (lines 1-25) untouched — it describes the AWS-happy-path behaviour which is still accurate when `AWS_SECRET_NAME` is set.

**2b. Update `src/config/__tests__/secrets.test.ts`.**

Read the existing test file first to match its style (vitest patterns, mock setup, `__resetSecretsCacheForTests` usage). Add ONE new test case. Pattern:

```ts
import { vi } from 'vitest'

it('returns {} without importing AWS SDK when AWS_SECRET_NAME is unset', async () => {
  __resetSecretsCacheForTests()
  delete process.env.AWS_SECRET_NAME

  // Spy on console.info — the early-return path must NOT log.
  const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

  // Spy on dynamic import — the early-return path must NOT import the SDK.
  // Use vi.doMock if the existing test file already mocks @aws-sdk/client-secrets-manager.
  // Otherwise, asserting infoSpy not called + result equality is sufficient evidence
  // the catch block didn't fire.

  const result = await loadSecrets()

  expect(result).toEqual({})
  expect(infoSpy).not.toHaveBeenCalled()

  infoSpy.mockRestore()
})
```

If the existing test file mocks `@aws-sdk/client-secrets-manager` at the top, also assert the mock was NOT called (e.g. `expect(GetSecretValueCommand).not.toHaveBeenCalled()`) — but only if doing so doesn't require restructuring the existing mocks. Simpler is fine.

If `src/config/__tests__/secrets.test.ts` does NOT exist (it does, per dir listing), create a minimal file covering this case + one happy-path case. It exists, so just append the new test case in the appropriate `describe` block.
  </action>
  <verify>
- `pnpm typecheck` passes (the `!` non-null assertion on `secretName` and the new guard must compile cleanly).
- `pnpm test src/config/__tests__/secrets.test.ts` — new test case passes, existing cases still pass.
- `grep -n "AWS_SECRET_NAME" src/config/secrets.ts` shows the guard line + the now-non-null-asserted line.
- Confirm by reading: when `AWS_SECRET_NAME` is unset, no `console.info` fires, no AWS SDK dynamic import is reached.
  </verify>
  <done>
- `loadSecrets()` short-circuits with `_cache = {}` when `AWS_SECRET_NAME` is unset, BEFORE the try/catch.
- Existing AWS-happy-path behaviour (when `AWS_SECRET_NAME` is set) is unchanged.
- One new test asserts the no-AWS path returns `{}` without logging or importing.
- Typecheck + test suite green.
  </done>
</task>

<task type="auto">
  <name>Task 3: Docs — deploy-windows.md Step 4.2 alternative + env-handling.md §5 addendum</name>
  <files>docs/deploy-windows.md, docs/env-handling.md</files>
  <action>
**3a. `docs/deploy-windows.md` — add new sub-section after Step 4.2.**

Read the existing file first; find Step 4.2 (machine-scope env vars block) and Step 4.3 (PowerShell wrapper section). Insert the new sub-section between them. Suggested heading: `### Step 4.2 (alternative) — Env file on disk (no AWS path)`.

Content:

```
For operators without AWS CLI access (e.g. the v1 pilot deploy), use this path
instead of populating AWS_* env vars in Step 4.2. The application's secrets
loader (src/config/secrets.ts) short-circuits to `process.env` when
`AWS_SECRET_NAME` is unset — see Task 2 of .planning/quick/001-add-no-aws-env-file-deploy-path.

**1. Place the env file on disk:**
   - Path: `D:\kbroles\.env.production`
   - Why one level ABOVE `D:\kbroles\.next\standalone\`: the standalone dir is
     wiped on every GHA redeploy (Step 7). Placing the env file outside it lets
     it survive redeploys.
   - Template: copy `.env.production.example` from the repo root, fill in
     values, transfer to the server.

**2. Lock down ACL** (run as admin):
   ```
   icacls D:\kbroles\.env.production /inheritance:r /grant:r "<svcAcct>:R"
   ```
   Replace `<svcAcct>` with the service account that launches the Node process.

**3. Vars that STAY machine-scope (do NOT move into the env file):**
   - `NODE_EXTRA_CA_CERTS` — Node reads at TLS init, before dotenv runs (see
     docs/env-handling.md §3 and nodejs/node#51426).
   - `AWS_REGION` (only if you later flip back to the AWS path).

**4. Launcher:** use `scripts/start.ps1` instead of the inline node launch in
   Step 4.3. The wrapper reads `D:\kbroles\.env.production` line by line, sets
   `$env:KEY = VALUE`, then launches node with the same Tee-Object logging.

See also: docs/env-handling.md §5.
```

Then update Step 4.3 (existing wrapper section) — add a one-line note at the top: "If using the no-AWS env-file-on-disk path (Step 4.2 alternative), use `scripts/start.ps1` from the repo instead of the inline launch below."

**3b. `docs/env-handling.md` §5 — add a short addendum.**

Read the file, find §5 (the cascade / precedence section). Append a short paragraph (4-6 lines) noting:

```
**Alternative cascade — env file on disk (no AWS path):** For deploys without
AWS access, an operator may place a `.env.production` file at
`D:\kbroles\.env.production` (one level above the standalone deploy target so
it survives redeploys). The launcher `scripts/start.ps1` reads this file and
populates `process.env` before Node starts, after which `loadSecrets()`
short-circuits because `AWS_SECRET_NAME` is unset. See
docs/deploy-windows.md Step 4.2 (alternative) for the full operator runbook.
`NODE_EXTRA_CA_CERTS` STILL must stay machine-scope (see §3).
```

Don't duplicate deploy-windows content — link to it.
  </action>
  <verify>
- `grep -n "Step 4.2 (alternative)" docs/deploy-windows.md` returns one match.
- `grep -n "scripts/start.ps1" docs/deploy-windows.md` returns at least one match (the new sub-section + the Step 4.3 cross-reference).
- `grep -n "Alternative cascade" docs/env-handling.md` returns one match in §5.
- `grep -n "deploy-windows.md" docs/env-handling.md` returns at least one match (the cross-link).
- `grep -n "NODE_EXTRA_CA_CERTS" docs/deploy-windows.md` — the new sub-section must mention it as a machine-scope exception.
- Manual read: the new sub-section reads cleanly, doesn't contradict Step 4.2 (it offers an alternative for operators who skip the AWS_* vars), and the §5 addendum acknowledges the alternative without re-explaining placement/ACL.
  </verify>
  <done>
- `docs/deploy-windows.md` has a new "Step 4.2 (alternative) — Env file on disk (no AWS path)" sub-section covering placement, ACL, machine-scope exceptions, and launcher.
- `docs/deploy-windows.md` Step 4.3 cross-references `scripts/start.ps1` for the no-AWS variant.
- `docs/env-handling.md` §5 has a short addendum acknowledging the env-file-on-disk alternative cascade with cross-links.
- No duplicated content between the two docs.
  </done>
</task>

</tasks>

<verification>
After all 3 tasks complete:

- `pnpm typecheck` — passes (Task 2 changed TS source).
- `pnpm test src/config/__tests__/secrets.test.ts` — all tests pass, including the new no-AWS branch test.
- `pnpm lint` — passes (Task 2's `!` non-null assertion may need a comment-suppress or eslint config check; resolve if the project disallows non-null assertions).
- Manual: read `scripts/start.ps1` end-to-end, confirm no values logged, file-not-found guard fires before launch, exit code propagated.
- Manual: read `.env.production.example` end-to-end, confirm header comments + 18 keys + no NODE_EXTRA_CA_CERTS + no AWS_* keys.
- Manual: read both doc updates, confirm cross-links resolve and content doesn't contradict existing Step 4.2 / §3.
</verification>

<success_criteria>
- An operator with NO AWS CLI access can:
  1. Copy `.env.production.example` to `D:\kbroles\.env.production` on the server, fill in 18 values.
  2. Run `icacls` ACL command to lock it down.
  3. Set `NODE_EXTRA_CA_CERTS` machine-scope (per existing Step 4.2).
  4. Launch via `scripts/start.ps1`.
  5. The app boots cleanly with no `[secrets] AWS Secrets Manager unavailable` info log on every cold start.

- An operator WITH AWS access (existing happy path) can still:
  1. Set `AWS_SECRET_NAME` + `AWS_REGION` machine-scope.
  2. Launch via the existing Step 4.3 inline wrapper.
  3. `loadSecrets()` calls AWS Secrets Manager exactly as before — zero behaviour change.

- Tests prove the new branch with one explicit assertion (no info log, no SDK import when `AWS_SECRET_NAME` unset).
- Future readers discover the no-AWS path via either `docs/deploy-windows.md` Step 4.2 alternative OR `docs/env-handling.md` §5.
</success_criteria>

<output>
After completion, create `.planning/quick/001-add-no-aws-env-file-deploy-path/001-SUMMARY.md` capturing:
- The 3 commits made (one per task) with their SHAs.
- Files changed counts.
- Confirmation that AWS-happy-path behaviour is unchanged (cite the test case).
- Cross-link to `docs/deploy-windows.md` Step 4.2 (alternative) so DEPLOY-CHECKLIST.md can link to it next.
</output>
