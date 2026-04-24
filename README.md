# KB Assistant

Role-aware AI chat assistant for MMC Colleague Technology's ServiceNow Knowledge Base. Every answer cites the exact SOP section it came from and opens that section in an inline source panel. Built for pilot cohort; web-only for v1 (Teams tab deferred to v1.1).

- **Grounded in 3 sources:** KB0020882 v9.0 (authoring SOP), KB0022991 v13.0 (management SOP), ServiceNow Technical Knowledge form schema
- **Grounding discipline:** quote-substring validator + entity allowlist + negative-out-of-scope eval suite gate every response
- **Auth:** Entra ID SSO via BFF pattern (`@azure/msal-node` auth code flow + iron-session cookie); `KbAssistant.User` App Role gates the pilot cohort
- **Deploy:** On-prem Windows Server (IIS reverse proxy + Scheduled Task) with secrets in AWS Secrets Manager

---

## Tech Stack

- **Runtime:** Next.js 16 (App Router, `output: 'standalone'`), React 19, Node 20
- **LLM:** Azure OpenAI (gpt-4o) via MGTI corporate ingress — dual-mode client falls back to direct OpenAI in dev
- **Auth:** `@azure/msal-node` + `iron-session` (HttpOnly cookie, App Role gating)
- **UI:** Tailwind v4 + Radix Primitives (Dialog, Popover, RadioGroup, Tooltip) + lucide-react
- **Validation:** Zod at every boundary (env, requests, SSE frames, ServiceNow payloads)
- **Tests:** Vitest (728 unit tests), Playwright (22 E2E specs)
- **Eval harness:** bespoke Vitest runner with 6 suites (entity-allowlist, citation-substring, negative-oos, paired-role, injection-refuse, positional) + LLM-judge best-of-3
- **Observability:** Azure Monitor OpenTelemetry distro + pino dual-emit; 15-event schema with question-hash-only anonymisation

---

## Quick-Start (developer)

Five-minute local dev setup. You will chat against **direct OpenAI** (not MGTI), with auth stubbed in dev mode.

```bash
# 1. Install
pnpm install

# 2. Configure .env.local — copy .env.example and set LLM_API_KEY to a real OpenAI key
cp .env.example .env.local
# Edit .env.local → LLM_API_KEY=sk-...

# 3. Dev server
pnpm dev
# → http://localhost:3000

# 4. Pick a role (Consumer or Author) and ask a question
```

In local dev, Entra is stubbed (defaults `dev-only-do-not-use-in-prod` in `src/config/env.ts`). The middleware permits requests without a session when `NODE_ENV !== 'production'`, so you can use the app end-to-end without real Entra credentials.

For Entra wiring, MGTI ingress, AWS Secrets Manager, and IIS reverse proxy setup, see [`docs/deploy-windows.md`](docs/deploy-windows.md).

> **Note:** `.env.example` is partially stale (contains pre-pivot `NEXT_PUBLIC_ENTRA_*` keys that are no longer read by any code). `src/config/env.ts` is the authoritative env schema.

---

## Testing

```bash
pnpm typecheck       # tsc --noEmit — runs clean on main
pnpm lint            # next lint
pnpm test            # Vitest — 728 unit tests
pnpm test:e2e        # Playwright — 22 E2E specs (needs pnpm dev running on :3000)
pnpm eval:fast       # deterministic suites (entity-allowlist + citation-substring) — ~500ms
pnpm eval:slow       # LLM-judge suites (needs LLM_JUDGE_API_KEY); skips cleanly without it
pnpm eval            # everything
```

CI runs `eval:fast` as a hard PR gate (ci.yml). Nightly cron runs `eval:slow` and auto-opens a `eval-regression` issue + posts a Teams notification on failure (evals-nightly.yml).

---

## Documentation Index

**For users (pilot cohort):**
- [`docs/user-guide.md`](docs/user-guide.md) — how to use the chat, understand citations, flag gaps, give feedback

**For admins & operators:**
- [`docs/admin-guide.md`](docs/admin-guide.md) — orientation map tying together day-0 setup, day-to-day tasks, alert response, and all runbooks
- [`docs/entra-app-registration-setup.md`](docs/entra-app-registration-setup.md) — Entra App Registration + App Roles + AWS Secrets Manager CLI
- [`docs/deploy-windows.md`](docs/deploy-windows.md) — Windows Server + IIS + Scheduled Task + GitHub Actions runner
- [`docs/env-handling.md`](docs/env-handling.md) — AWS Secrets Manager → `loadSecrets()` → `process.env` cascade
- [`docs/content-steward-runbook.md`](docs/content-steward-runbook.md) — monthly ServiceNow pull + flagged-article review
- [`docs/measurement-plan.md`](docs/measurement-plan.md) — pre-registered pilot metrics + confounders
- [`docs/ops/eval-gate-bypass-procedure.md`](docs/ops/eval-gate-bypass-procedure.md) — emergency deploy bypass
- [`docs/ops/teams-webhook-validation-procedure.md`](docs/ops/teams-webhook-validation-procedure.md) — validating the pilot Teams webhook
- [`docs/ops/workbook-deploy-procedure.md`](docs/ops/workbook-deploy-procedure.md) — App Insights workbook + Azure Monitor alerts

**For developers:**
- [`docs/api-chat-contract.md`](docs/api-chat-contract.md) — `/api/chat` SSE contract
- [`docs/phase-0-smoke.md`](docs/phase-0-smoke.md) — MGTI ingress smoke-test evidence

**Project history:**
- [`.planning/PROJECT.md`](.planning/PROJECT.md) — project brief, core value, key decisions, current state
- [`.planning/MILESTONES.md`](.planning/MILESTONES.md) — shipped versions (v1 Pilot Release, 2026-04-24)
- [`.planning/milestones/v1-ROADMAP.md`](.planning/milestones/v1-ROADMAP.md) — full v1 phase/plan archive
- [`.planning/milestones/v1-REQUIREMENTS.md`](.planning/milestones/v1-REQUIREMENTS.md) — 47/49 shipped, 2 deferred to v1.1
- [`.planning/milestones/v1-MILESTONE-AUDIT.md`](.planning/milestones/v1-MILESTONE-AUDIT.md) — audit passed 2026-04-24
- [`.planning/phases/`](.planning/phases) — per-plan PLAN/SUMMARY/VERIFICATION artifacts

---

## Project Status

**v1 Pilot Release** shipped 2026-04-24 (tag `v1`). Code-complete; 16 operator actions pending before pilot day 1 (see [`docs/admin-guide.md`](docs/admin-guide.md) §Day-0 setup or the milestone audit's `pending_operator_actions` frontmatter).

**Deferred to v1.1:** Microsoft Teams tab (AUTH-03 + DELV-03) at Phase 5.1 pivot decision.
