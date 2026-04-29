# Env-Handling Contract

**Status:** Phase 2 Plan 01 (infra-ops-setup); §5 rewritten Phase 5.1 (MMC-IT BFF pivot — AWS Secrets Manager replaces the superseded Phase-5 hosting plan).

**Why this doc exists:** Phase 1 Plan 05 decision #3 surfaced that `tsx` and Next.js load env vars differently, and `NODE_EXTRA_CA_CERTS` has a Node-level ordering constraint that no `.env` can satisfy. STATE.md Phase 2 entry gate ("Expand .env handling docs before Phase 2 plan") — closed by this document.

**Scope:** the four runtimes this repo spawns today (`next dev`, `next start`, `vitest run`, `pnpm smoke`) plus the Phase 5.1 production pattern (AWS Secrets Manager → `loadSecrets()` → `process.env`).

---

## 1. Files & Load Order

| File | Committed? | Read by | When |
|---|---|---|---|
| `.env.local` | NO (gitignored) | Next.js (dev + start), `pnpm smoke` via `node --env-file-if-exists` | Local-developer secrets (OpenAI key in dev mode; MGTI key when access lands) |
| `.env.development` | optional (usually committed) | `next dev` | Shared non-secret dev defaults (none today; placeholder for future) |
| `.env.production` | optional (usually committed) | `next start` | Non-secret prod defaults baked at build time |
| `.env` | NO (gitignored if used at all) | Next.js (all modes, lowest precedence) | Fallback; we deliberately do not use it — every secret must be explicit |
| (none) | — | `vitest run` | **Vitest does NOT auto-load any `.env` file** — see §2 row 3 |

**Next.js precedence** (highest to lowest, documented by Next.js): `process.env` → `.env.$(NODE_ENV).local` → `.env.local` (except when `NODE_ENV=test`) → `.env.$(NODE_ENV)` → `.env`. A value set in the shell always wins.

**Tsx and plain Node** do NOT participate in this precedence. They read `process.env` only; `.env` files are inert unless something explicitly loads them. We wrap `tsx`-invoked scripts with `node --env-file-if-exists=.env.local --import tsx` so `.env.local` is respected — this is the `pnpm smoke` pattern. Every future `tsx`-invoked script MUST replicate that wrapping or it will silently miss env vars (Phase 1 Plan 05 decision #3).

---

## 2. Per-Runtime Cheat Sheet

| Runtime | Env file auto-loaded | Wrapping flag / script | Production source |
|---|---|---|---|
| `next dev` | `.env.local` + `.env.development` (+ `.env.development.local` if present) | none — framework does it | n/a (dev only) |
| `next start` | `.env.local` + `.env.production` | none — framework does it | Windows Scheduled Task inherits machine-scope env vars; `loadSecrets()` pulls `/mmc/cts/kb-assistant` from AWS Secrets Manager onto `process.env` at cold start (Phase 5.1 — see §5) |
| `vitest run` | **nothing** — Vitest does not auto-load `.env` files | Set vars in shell before running, or use `vi.stubEnv('KEY', 'value')` / `vi.unstubAllEnvs()` inside the test file | n/a (CI loads from repo secrets or shell env) |
| `pnpm smoke` | `.env.local` (via Node's `--env-file-if-exists`) | `node --env-file-if-exists=.env.local --import tsx scripts/phase0-smoke.ts` — captured in `package.json` `smoke` script | n/a (operator-run; uses shell env for NODE_EXTRA_CA_CERTS) |

**Vitest note.** Because Vitest doesn't auto-load, tests must not depend on `.env.local` being present. Tests either:
- stub per-test with `vi.stubEnv('LLM_BASE_URL', 'https://…')` (preferred — isolates per-test state), OR
- rely on CI / shell to provide the var (e.g. `LLM_BASE_URL` is set in GH Actions secrets for integration suites that land in Phase 5).

The only unit test that currently touches env is `src/config/__tests__/env.test.ts`, which stubs via `vi.stubEnv` and resets with `__resetEnvCacheForTests()` between cases.

**`pnpm smoke` note.** `--env-file-if-exists` (Node ≥20.6 / ≥18.20) loads if present and silently no-ops if absent — safe for CI where the file won't exist. The flag MUST come before `--import tsx` because Node parses `--env-file-*` before any loader runs.

---

## 3. Secrets That MUST Live Outside .env Files

These values CANNOT be placed in any `.env` file and still work. They must be set in the shell environment (local dev), as machine-scope env vars on the Windows Server (Phase 5.1 — see `docs/deploy-windows.md` Step 4.2), or as CI secrets (GitHub Actions).

### `NODE_EXTRA_CA_CERTS`

- **Purpose:** absolute path to the MMC corporate CA bundle PEM file; required for HTTPS to the MGTI ingress.
- **Why not .env:** Node reads `NODE_EXTRA_CA_CERTS` at **TLS init**, which happens before any dotenv-style loader runs. By the time `next dev` or `--env-file-if-exists` parses a `.env` file, the TLS stack is already configured without the cert bundle. See [nodejs/node issue #51426](https://github.com/nodejs/node/issues/51426).
- **Local dev:** export in your shell (`export NODE_EXTRA_CA_CERTS=/absolute/path/to/mmc-ca.pem`) or in your shell rc file.
- **Windows dev:** `setx NODE_EXTRA_CA_CERTS "C:\path\to\mmc-ca.pem"` at the user level, or prepend inline: `NODE_EXTRA_CA_CERTS=C:\path\to\mmc-ca.pem pnpm smoke -- --mode=prod` in bash / `$env:NODE_EXTRA_CA_CERTS="..."; pnpm smoke -- --mode=prod` in PowerShell.
- **Production (Windows Server — Phase 5.1):** set as a machine-scope env var (`[System.Environment]::SetEnvironmentVariable('NODE_EXTRA_CA_CERTS', 'C:\path\to\mmc-ca.pem', 'Machine')`) — the Windows Scheduled Task inherits machine-scope env at start, which is before Node's TLS init. See `docs/deploy-windows.md` Step 4.2.
- **Verification:** `pnpm smoke -- --mode=prod` passes Smoke 5 without `UNABLE_TO_VERIFY_LEAF_SIGNATURE`.

### MSAL confidential-client secret + `SESSION_SECRET` — **Phase 5.1 addition (replaces the superseded Phase-5 secrets plan)**

- **Purpose:** `ENTRA_CLIENT_SECRET` is the confidential-client secret for the Entra app registration used by `src/auth/msalClient.ts` (server-side auth code flow — AUTH-01). `SESSION_SECRET` is the 32+ char AES key iron-session uses to seal the `kb_session` cookie.
- **Why not .env (production):** secrets in committed or half-committed files leak via misconfigured `.gitignore`. Phase 5.1 centralises both into AWS Secrets Manager at `/mmc/cts/kb-assistant` (us-east-1), retrieved via the AWS SDK default credential chain at app startup. See §5.
- **Local dev:** `.env.local` with any placeholder values is sufficient — the stub values never leave your laptop and the auth flow is exercised end-to-end against the real Entra tenant only on the on-prem Windows box.
- **Production (Windows Server):** `loadSecrets()` (`src/config/secrets.ts`) fetches the JSON blob from AWS Secrets Manager on first call, writes each key onto `process.env` if not already set (dev wins), and caches the result module-level. See §5 + `docs/deploy-windows.md` Step 2.

---

## 4. `.env.example` — Canonical Variable List

Keep this block in sync with the zod schema in `src/config/env.ts`. Copy to `.env.local` and fill in the values. Vars not listed here are not validated and not read by the app.

```
# ─── LLM client (src/config/env.ts) ───

# Auth mode for the OpenAI SDK. Dev → 'bearer' (api.openai.com); Prod → 'api-key' (MGTI).
LLM_AUTH_MODE=bearer

# Base URL. Dev → https://api.openai.com/v1. Prod → MGTI ingress suffix confirmed by
# Smoke 1 (candidates: /coreapi/openai/v1, /coreapi/openai, /coreapi/openai/).
LLM_BASE_URL=https://api.openai.com/v1

# API key. Dev → OpenAI personal key. Prod → MGTI-issued key (not in any .env;
# fed via AWS Secrets Manager → loadSecrets() in prod — see §5).
LLM_API_KEY=sk-...

# Model / deployment name. Dev → 'gpt-4o-2024-08-06'. Prod → MGTI gpt-4o deployment
# name (may differ from public model id).
LLM_MODEL=gpt-4o-2024-08-06

# Strict-JSON-schema support flag. Leave at 'true' unless Smoke 2 shows MGTI rejects
# response_format: { type: 'json_schema', strict: true }; then set to 'false' to
# activate the Ajv fallback path in src/llm/stream.ts. Defaults to 'true' if absent.
STRICT_SCHEMA_SUPPORTED=true

# ─── Phase 2 additions (not yet read; reserve the names) ───

# Max concurrent /api/chat streams the BFF will accept before returning 429.
# Default 20 (see .planning/phases/02-chat-backend-bff/02-CONTEXT.md §3).
# MAX_INFLIGHT_STREAMS=20

# Max messages in a single /api/chat request body. Default 20.
# MAX_MESSAGES=20

# Max chars per message content. Default 8000.
# MAX_MESSAGE_CHARS=8000

# ─── Phase 5 additions (stubbed in Phase 2) ───
# ENTRA_TENANT_ID=<mmc-tenant-guid>
# ENTRA_CLIENT_ID=<spa-app-registration-client-id>
# ENTRA_API_AUDIENCE=<api-app-registration-uri>

# ─── Shell-only — NEVER put in a .env file ───
# NODE_EXTRA_CA_CERTS=/absolute/path/to/mmc-ca.pem   # see §3
```

---

## 5. Phase 5.1 — AWS Secrets Manager + `loadSecrets()` cascade

Production env in this project is SERVER-SIDE ONLY. There are no `NEXT_PUBLIC_*` vars in use as of Phase 5.1 (the Phase-5 SPA/NAA registration that needed them is superseded — see `.planning/phases/05.1-mmc-it-bff-pivot-xmcp-pattern/05.1-RESEARCH.md`). The runtime cascade:

1. **AWS Secrets Manager** at `/mmc/cts/kb-assistant` (region `us-east-1`) — the authoritative source for secrets in production. JSON blob:
   ```json
   {
     "SESSION_SECRET": "<64-char-random — iron-session AES key>",
     "ENTRA_CLIENT_ID": "<app-registration-client-id>",
     "ENTRA_TENANT_ID": "<mmc-tenant-guid>",
     "ENTRA_CLIENT_SECRET": "<app-registration-client-secret>",
     "LLM_API_KEY": "<mgti-api-key>",
     "LLM_BASE_URL": "<mgti-endpoint>"
   }
   ```
2. **`loadSecrets()`** (`src/config/secrets.ts`) fetches this blob on first call, writes each key onto `process.env` IF not already set (dev overrides always win), and caches the result module-level. Subsequent calls are free — the AWS SDK is only hit once per process lifetime. Falls through silently with a single `info` log line if AWS is unreachable (local-dev mode).
3. **`env()`** (`src/config/env.ts`) validates the final `process.env` against the zod schema and returns the typed env object. Route handlers that need secrets call `await loadSecrets()` before `env()` fires (or once at app start via `instrumentation.ts`).

**Local dev:** create `.env.local` at the repo root. Values in `.env.local` take precedence over AWS (dev wins — `loadSecrets()` only writes missing keys). Local dev does NOT need AWS credentials — `loadSecrets()` catches unreachable-AWS errors and logs a single `info` line. Example:

```bash
# .env.local — git-ignored
LLM_AUTH_MODE=bearer
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=sk-...
LLM_MODEL=gpt-4o
SESSION_SECRET=local-dev-secret-at-least-32-chars-long
ENTRA_CLIENT_ID=dev-only-not-a-real-client-id
ENTRA_TENANT_ID=dev-only-not-a-real-tenant-id
ENTRA_CLIENT_SECRET=dev-only-not-a-real-secret
APP_BASE_URL=http://localhost:3000
```

**Production (Windows Server):**
- AWS credentials reach the Scheduled Task's user context via `%USERPROFILE%\.aws\credentials` OR machine-scope `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` env vars. See `docs/deploy-windows.md` Step 2 for verification.
- Non-secret runtime config (`NODE_ENV`, `PORT`, `HOSTNAME`, `APP_BASE_URL`, `AWS_SECRET_NAME`, `AWS_REGION`) is set as machine-scope env vars; Scheduled Task inherits. See `docs/deploy-windows.md` Step 4.2.
- At process start, `loadSecrets()` pulls the JSON blob from `/mmc/cts/kb-assistant` and populates the remaining `process.env` keys.

**Secret rotation:** update the JSON blob in AWS Secrets Manager (`aws secretsmanager update-secret --secret-id /mmc/cts/kb-assistant --region us-east-1 --secret-string <new-json>`) and restart the Scheduled Task (`schtasks /end /tn KbAssistant` → `schtasks /run /tn KbAssistant`). The module-level cache in `loadSecrets()` only resets on process start — restart is the rotation mechanism. See `docs/entra-app-registration-setup.md` Rotation section for the client-secret-specific walk-through.

**Alternative cascade — env file on disk (no AWS path):** For deploys without AWS access, an operator may place a `.env.production` file at `D:\kbroles\.env.production` (one level above the standalone deploy target so it survives GHA redeploys that wipe `.next\standalone\`). The launcher `scripts/start.ps1` reads this file and populates `process.env` before Node starts, after which `loadSecrets()` short-circuits because `AWS_SECRET_NAME` is unset. See `docs/deploy-windows.md` Step 4.2 (alternative) for the full operator runbook. `NODE_EXTRA_CA_CERTS` STILL must stay machine-scope (see §3).

**What's at this location at runtime** (for debugging a wedged deploy):

| Env key | Source (prod) | Source (dev) | Consumed by |
|---|---|---|---|
| `SESSION_SECRET` | AWS Secrets Manager | `.env.local` | `src/auth/session.ts` (iron-session seal) |
| `ENTRA_CLIENT_ID` | AWS Secrets Manager | `.env.local` | `src/auth/msalClient.ts` (CCA) |
| `ENTRA_TENANT_ID` | AWS Secrets Manager | `.env.local` | `src/auth/msalClient.ts` (authority URL) |
| `ENTRA_CLIENT_SECRET` | AWS Secrets Manager | `.env.local` | `src/auth/msalClient.ts` (CCA) |
| `APP_BASE_URL` | machine-scope env | `.env.local` | `/api/login` + `/api/auth/callback` (redirect URI) |
| `LLM_API_KEY` | AWS Secrets Manager | `.env.local` | `src/llm/client.ts` |
| `LLM_BASE_URL` | AWS Secrets Manager | `.env.local` | `src/llm/client.ts` |
| `NODE_EXTRA_CA_CERTS` | machine-scope env (set before the Scheduled Task starts) | shell (see §3) | Node.js TLS init (pre-dotenv) |

---

## 6. Troubleshooting

### `Error: Invalid env: {...}` thrown from `env()` / `loadEnv()`

Zod validation failed against `EnvSchema` in `src/config/env.ts`. The error body lists which keys failed and why (e.g. `LLM_BASE_URL: 'url'`). Fix:

1. Confirm the variable is present: `echo $LLM_BASE_URL` (or `$env:LLM_BASE_URL` on PowerShell).
2. If present in `.env.local` but missing in shell, confirm the runtime auto-loads `.env.local` (see §2 — Vitest doesn't; `pnpm smoke` needs the `--env-file-if-exists` flag; `tsx` alone doesn't).
3. If a literal typo: `STRICT_SCHEMA_SUPPORTED` must be exactly `true` or `false` (lowercase strings — zod enum). Not `True`, not `0`, not `1`.

### `Error: unable to verify the first certificate` / `UNABLE_TO_VERIFY_LEAF_SIGNATURE` during prod-mode smoke

`NODE_EXTRA_CA_CERTS` is not pointing at the MMC corporate CA bundle at TLS init time. Fix:

1. Confirm the var is set in the **shell**, not just in `.env.local`: `echo $NODE_EXTRA_CA_CERTS` should print an absolute path. If it prints nothing, export it in your shell (§3).
2. Confirm the file exists and is readable.
3. On macOS/Linux, confirm it's a PEM (starts with `-----BEGIN CERTIFICATE-----`).
4. **Never** put `NODE_EXTRA_CA_CERTS` in `.env.local` — `--env-file-if-exists` loads it AFTER Node's TLS stack initialises, so it's too late. This is [nodejs/node issue #51426](https://github.com/nodejs/node/issues/51426).

### `process.env.LLM_BASE_URL` is `undefined` in a Vitest test

Vitest does not auto-load `.env` files. Two fixes:

- **Preferred:** `vi.stubEnv('LLM_BASE_URL', 'https://stub.example.com/v1')` inside the test, followed by `vi.unstubAllEnvs()` in `afterEach`, and `__resetEnvCacheForTests()` from `src/config/env.ts` between cases that read `env()`.
- **For CI/integration suites (Phase 5):** set the var in the GitHub Actions workflow's `env:` block or `jobs.<id>.env:` from a repo secret.

### `next dev` fails with `Cannot find module 'real-require'` after adding pino

Turbopack bundled pino's worker-thread transport instead of externalising it. Fix: confirm `next.config.ts` lists `['pino', 'pino-pretty']` in `serverExternalPackages` (added in Phase 2 Plan 01 Task 1.2; see [Next.js 16.1 release notes](https://nextjs.org/blog/next-16-1) — the underlying fix is framework-level in 16.1+, but the direct packages still need listing).

### `tsx` script doesn't see env vars that `next dev` sees fine

`tsx` alone doesn't auto-load `.env`. Wrap with `node --env-file-if-exists=.env.local --import tsx your-script.ts` (see `package.json` `smoke` script for the reference pattern). The flag MUST come before `--import tsx`.

---

## 7. Appendix — Why This Matters

Three of the five Phase-0 smokes exercise the env layer:

- Smoke 1 (baseURL suffix) depends on `LLM_BASE_URL` reaching the smoke script → `.env.local` loading via the `--env-file-if-exists` wrapper.
- Smoke 5 (corporate CA) depends on `NODE_EXTRA_CA_CERTS` set at the shell level.
- Smoke 2 (strict JSON schema) depends on `STRICT_SCHEMA_SUPPORTED` being read as a typed enum, not a raw string (see `src/config/env.ts` lines 8–14 for the rationale comment).

Getting env handling wrong in any of these breaks the prod-mode smoke gate, which in turn blocks Plan 04 Task 2 (`/api/chat` route code). This document is the single source for re-orienting when a future "it works locally but fails in CI / on the Windows box" incident happens.
