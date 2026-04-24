# Project Milestones: KB Knowledge Assistant

Reverse-chronological log of shipped versions. Full details in `.planning/milestones/v[X.Y]-ROADMAP.md` and `.planning/milestones/v[X.Y]-REQUIREMENTS.md`.

---

## v1 Pilot Release (Shipped: 2026-04-24)

**Delivered:** A role-aware, Entra-gated, MGTI-backed Next.js chat assistant for the MMC Colleague Technology KB — with citation-discipline enforcement at every layer, on-prem Windows deploy via the MMC-IT BFF pattern, and a pre-registered telemetry + eval pipeline ready for pilot.

**Phases completed:** 1–6 plus inserted Phase 5.1 BFF pivot (35 plans total; Phase 5 paused at 4/5, superseded by 5.1)

**Key accomplishments:**

- Grounding layer (Phase 1): source registry, quote-substring validator, dual-mode LLM factory, role-aware system prompt composer, MGTI smoke-tested against corporate ingress
- Streaming `/api/chat` BFF (Phase 2): SSE pipeline with citation hold, entity-allowlist post-check, typed errors, bounded retry (429/5xx/network), fallback trigger discipline
- Role-aware chat UI (Phase 3): Consumer/Author roles with 13 suggested-prompt chips, role-contamination guards (Pitfall 13), draft buffer (Pitfall 17), 6 lifecycle controls, 14 Playwright specs
- Source panel + trust surface (Phase 4): auto-opening cited-section panel, colour-coded badges, ServiceNow permalinks, distinct fallback card (three-signal per Pitfall 20), About tooltip, freshness header
- MMC-IT BFF pivot (Phase 5.1): replaced SPA+NAA with server-side Entra auth code flow (msal-node + iron-session), `KbAssistant.User` App Role gating, on-prem Windows deploy (IIS reverse proxy + Scheduled Task + AWS Secrets Manager), operator runbooks
- Telemetry + eval + steward loop (Phase 6): Azure Monitor OTel with 15-event schema + question hashing (no PII), 6-suite eval harness with judge best-of-3, CI/CD eval gate + emergency bypass, App Insights workbook + alerts, monthly ServiceNow steward pull, pre-registered measurement plan per Pitfall 14

**Stats:**

- 339 files changed, 75,513 insertions
- ~22,500 LOC TypeScript (src + tests-e2e + scripts)
- 6 phases, 35 plans (Phase 5 paused at 4/5)
- 178 commits across 3 days (2026-04-22 → 2026-04-24)
- 728/728 unit tests green, 22/22 E2E green, typecheck clean

**Git range:** `fa3270d` (docs: initialize project) → `c92286e` (fix(06-06): unblock skip_eval_gate bypass)

**Full details:** [milestones/v1-ROADMAP.md](milestones/v1-ROADMAP.md) · [milestones/v1-REQUIREMENTS.md](milestones/v1-REQUIREMENTS.md) · [milestones/v1-MILESTONE-AUDIT.md](milestones/v1-MILESTONE-AUDIT.md)

**What's next:** v1.1 — close AUTH-03 (Teams SSO) + DELV-03 (Teams manifest) deferrals, drain Phase 6 tech debt (workbook Section 5 + 6 unsurfaced events + TypeScript narrowing of trackEvent), or execute pilot + capture baseline-vs-post metrics per measurement-plan.md (run `/gsd:new-milestone`).

---
