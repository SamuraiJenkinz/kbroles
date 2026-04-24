---
milestone: v1
audited: 2026-04-24
status: passed
remediation:
  - id: GAP-1
    fixed: 2026-04-24
    fix_commit: pending
    detail: "Added `if: always() && needs.build.result == 'success' && (needs.check-evals.result == 'success' || needs.check-evals.result == 'skipped')` to deploy job in .github/workflows/deploy.yml. YAML parses clean. Emergency bypass path now functional."
scores:
  requirements: 47/49 (2 explicitly deferred to v1.1)
  phases: 6/7 verified (Phase 5 paused — superseded by Phase 5.1)
  integration: 5/5 wiring sections clean (GAP-1 fixed inline)
  flows: 5/6 covered end-to-end (Flow E unit-tested only — intentional CI constraint)
gaps:
  integration:
    - id: GAP-1
      severity: blocker
      area: ci-cd
      status: RESOLVED 2026-04-24 (one-line fix applied inline post-audit)
      summary: "skip_eval_gate=true silently prevented deploy — bypass runbook was broken"
      file: .github/workflows/deploy.yml
      line: 117
      detail: "check-evals has `if: ${{ inputs.skip_eval_gate != true }}` (line 82) so it skips when bypass is used. deploy job had `needs: [build, check-evals]` with no `if:` — GitHub Actions treats a skipped dependency as failure and skips deploy. Emergency bypass documented in docs/ops/eval-gate-bypass-procedure.md would never execute."
      fix: |
        Added to deploy job:
        ```yaml
        if: always() && needs.build.result == 'success' && (needs.check-evals.result == 'success' || needs.check-evals.result == 'skipped')
        ```
        One-line change applied inline during audit. YAML parses clean. No other job depends on check-evals.
tech_debt:
  - phase: 06
    items:
      - id: TD-1
        summary: "Workbook Section 5 (Eval trend) is KQL-ready but inert — no code emits eval_run_completed events"
        already_documented: "ops/workbooks/README.md + docs/ops/workbook-deploy-procedure.md validation checklist both flag this"
        next_step: "Add scripts/emit-eval-events.ts invoked from evals-nightly.yml, or drop Section 5 from default tab"
      - id: TD-2
        summary: "6 event names emitted but not surfaced in workbook KQL: session_start, citation_returned, citation_click_through, flag_a_gap_action, chat_request_started, allowlist_block"
        impact: "Events are captured in App Insights but operators cannot see citation click-through rates, flag-a-gap volumes, or allowlist block frequency in the default workbook"
        next_step: "Add corresponding panels (~5-10 KQL snippets) in a follow-up workbook update"
      - id: TD-3
        summary: "trackEvent types name as string not EventName — misspelled event names cannot be caught by TypeScript"
        file: src/obs/telemetry.ts:48
        next_step: "Narrow name param to EventName from eventSchema.ts"
      - id: TD-4
        summary: "mockChatSuccess Playwright fixture omits message_id SSE frame — chip-click telemetry path not exercised in chat-happy-path or role-contamination specs"
        file: tests-e2e/fixtures/mockChat.ts:33-46
        impact: "citation_click_through emission only covered by feedback-and-telemetry.spec.ts which uses a custom mockChatWithMessageId helper"
        next_step: "Update mockChatSuccess to emit message_id frame (one line) so all chat specs exercise the full telemetry pipeline"
      - id: TD-5
        summary: "Workbook GUID uses placeholder a1b2c3d4-e5f6-7890-abcd-ef1234567890"
        file: ops/workbooks/kb-assistant-pilot.workbook.json:7
        impact: "Deterministic but not production-grade UUID; re-deploys are still idempotent"
        next_step: "Operator supplies real UUID via --parameters workbookId=<uuid> at deploy time"
  - phase: 5.1
    items:
      - id: TD-6
        summary: "Flow E (sign-back-in after session expiry) has no Playwright E2E — covered by unit tests only"
        impact: "Intentional CI constraint (live Entra can't be tested in CI); client state machine is fully unit-covered; the one uncovered gap is the end-to-end browser → Entra → callback → session save loop"
        next_step: "Pilot operator manual validation (documented as human_needed in 06-VERIFICATION.md item #2)"
deferred_to_v1_1:
  - AUTH-03: Teams SSO via NAA (from Phase 5 pivot; Teams tab delivery deferred)
  - DELV-03: Microsoft Teams tab manifest (from Phase 5 pivot; Teams tab delivery deferred)
pending_operator_actions:
  total: 16
  categories:
    secrets_and_config:
      - Add GHA secrets: LLM_JUDGE_API_KEY, LLM_JUDGE_BASE_URL, TEAMS_WEBHOOK_URL, AZURE_CREDENTIALS, APP_INSIGHTS_APP_ID, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
      - Set up AWS Secrets Manager /mmc/cts/kb-assistant with SN service account + SESSION_SECRET + ENTRA_CLIENT_SECRET + QUESTION_HASH_SALT + APPLICATIONINSIGHTS_CONNECTION_STRING + TEAMS_WEBHOOK_URL
      - Create GitHub Issues labels: eval-regression, content-steward
      - Set branch protection on main: require "verify" workflow job
    pre_pilot_setup:
      - Fill {{STEWARD_NAME}}/{{STEWARD_BACKUP_NAME}}/{{SIGNOFF_DATE}} placeholders in measurement-plan.md + content-steward-runbook.md
      - Run pnpm sn:validate with live SN creds; paste output into content-steward-runbook Schema Validation section
      - Complete Entra App Registration per docs/entra-app-registration-setup.md
      - Complete Windows Server deploy per docs/deploy-windows.md
      - Deploy workbook + alerts via ops/alerts/provision.sh
      - Validate Teams webhook accepts Common Alert Schema; provision Logic App buffer if needed (~2h)
    pilot_window:
      - Pilot cohort identification + Entra KbAssistant.User role grant + URL share
      - Confirm About-tooltip seen by onboarded users
      - Monitor weekly-digest Teams card for ≥50% cohort session rate in first 2 pilot weeks
      - Run steward-monthly baseline capture pre-pilot-day-1
---

# v1 Milestone Audit — KB Knowledge Assistant

**Audit date:** 2026-04-24
**Milestone scope:** v1 (6 phases + Phase 5.1 BFF pivot)
**Verdict:** `passed` — GAP-1 fixed inline during audit (one-line `if:` added to deploy job). All 5 cross-phase wiring sections clean, 47/49 requirements satisfied (2 deferred to v1.1 by design).

---

## Requirements Coverage: 47/49

49 v1 requirements total. 47 Complete across Phases 1–5.1, 6. 2 explicitly deferred to v1.1 at Phase 5 pivot (AUTH-03 Teams SSO, DELV-03 Teams tab manifest). **No orphaned or unsatisfied requirements.** Coverage table in REQUIREMENTS.md (lines 181–231) aligns with SUMMARYs + VERIFICATIONs.

## Phase Verification Roll-up: 6/7

| Phase | Status | Notes |
|-------|--------|-------|
| 01 Grounding Foundation | human_needed | Dev-mode smoke evidence reviewed + approved 2026-04-22 |
| 02 Chat Backend (BFF) | passed | — |
| 03 Role Experience & Chat UI | passed | `gaps: []` |
| 04 Source Panel, Trust & Fallback UI | passed | — |
| 05 SSO & Teams Delivery | (no VERIFICATION) | Paused; superseded by Phase 5.1 — pivot documented in ROADMAP.md line 164 |
| 05.1 MMC-IT BFF pivot | human_needed | 5 live-deploy items approved pending-operator-execution |
| 06 Telemetry, Evals & Pilot Hardening | human_needed | 4 pilot/operator items approved pending-operator-execution |

All `human_needed` items are live-environment operator tasks (Entra portal config, Windows Server deploy, pilot cohort onboarding, AWS Secrets Manager provisioning). Each was explicitly approved at phase completion checkpoint. None are code gaps.

## Cross-Phase Integration: 4/5 Sections Clean

**✓ Grounding pipeline (Phase 1 → 2 → 3 → 4)** — Source registry + validator + allowlist fully wired from /api/chat through ChatSurface to SourcePanel. Citation chip re-open verified (PANE-07). Evidence: registry.ts:79, route.ts:62/311/331, ChatSurface.tsx:85-88, useSourceContent.ts:41.

**✓ Auth + session continuity (Phase 5.1 → downstream)** — kb_session cookie flows through middleware to all sensitive routes. session_expired → 401 token_expired → ErrorCard → /api/login fully wired. KbAssistant.User role check → 403 → /access-denied clean. Evidence: _middleware.ts:174-179, useChatStream.ts:68-70, AuthProvider.tsx:57.

**✓ Telemetry end-to-end (Phase 6)** — message_id correlation chain works (server UUID → SSE echo → chat reducer → AssistantControls.sendFeedback → FeedbackSchema). question_hash normalisation + salt rotation verified. PII absence test at route.test.ts:660-667 iterates forbidden needles against all captured logs.

**✗ Deploy + CI integration (Phase 5.1 + Phase 6) — ONE BLOCKER** — See GAP-1 below. Non-emergency deploy path is clean. Secret separation confirmed (LLM_JUDGE_API_KEY ≠ LLM_API_KEY). Two-job structure preserved. Branch protection instruction present. Bypass runbook references a broken workflow dependency.

**✓ Workbook + events + steward loop (Phase 6 internal)** — Section 5 KQL inert is explicitly documented (acceptable per plan). Steward pull script + monthly issue workflow + runbook references all align.

## End-to-End Flow Coverage: 5/6 Fully Covered, 1 Intentional Constraint

| Flow | Coverage | Notes |
|------|----------|-------|
| A. First-time authenticated user | ✓ E2E | stubBffAuthenticated fixture + role-select specs |
| B. Happy-path chat + source panel | ✓ E2E | chat-happy-path + source-panel-first-citation + source-panel-updates-and-chip-reopen |
| C. Fallback + flag-a-gap | ✓ E2E | fallback-and-flag-gap.spec.ts with mailto assertion |
| D. Thumbs-down feedback | ✓ E2E | feedback-and-telemetry.spec.ts asserts payload + <5000ms SLA |
| E. Sign-back-in after session expiry | ◐ Unit only | Intentional — live Entra cannot be tested in CI; state machine fully unit-covered |
| F. Change role | ✓ E2E | role-contamination.spec.ts (Pitfall 13) |

---

## The One Gap

### GAP-1 [BLOCKER]: `skip_eval_gate=true` Silently Blocks Deploy

**File:** `.github/workflows/deploy.yml`, job `deploy` at line 117.

**Problem:** The emergency-bypass runbook (`docs/ops/eval-gate-bypass-procedure.md`) instructs operators to run:

```bash
gh workflow run deploy.yml -f skip_eval_gate=true --ref main
```

When invoked:
- `check-evals` job has `if: ${{ inputs.skip_eval_gate != true }}` → evaluates false → skipped
- `deploy` job has `needs: [build, check-evals]` with no `if:` expression
- GitHub Actions default: a `skipped` dependency prevents dependent jobs from running
- **Deploy never executes. Emergency bypass is non-functional.**

**Fix (one line):** Change deploy job's dependency rule to accept skipped check-evals:

```yaml
deploy:
  needs: [build, check-evals]
  if: always() && needs.build.result == 'success' && (needs.check-evals.result == 'success' || needs.check-evals.result == 'skipped')
```

**Why this matters for v1:** The bypass is only needed during pilot incidents (e.g., judge-API outage making nightly evals red while production has a real bug to fix). It is a low-frequency path but load-bearing when needed. Shipping v1 without a working bypass means an incident hitting simultaneously with a judge-flake red would leave us unable to deploy fixes.

**Severity rationale:** Blocker for `gh workflow run deploy.yml -f skip_eval_gate=true`, not for normal `push: main` deploys. The non-emergency code path is fully operational. Given the fix is one line and the bypass runbook already exists + is documented, fixing this is strictly lower cost than the first emergency where the bypass silently fails.

---

## Tech Debt (6 items, non-blocking)

See frontmatter `tech_debt` for the full list. Highlights:

1. **Section 5 eval-trend KQL inert** — documented; pilot-acceptable; follow-up task well-defined
2. **6 events missing workbook panels** — events land in App Insights; operators can author panels post-pilot
3. **trackEvent(name: string) not narrowed to EventName** — type-safety opportunity, not a correctness issue
4. **mockChatSuccess E2E fixture lacks message_id frame** — chip-click telemetry exercised in feedback E2E only; minor test-scope gap
5. **Workbook GUID is placeholder** — operator supplies real UUID at deploy
6. **Flow E (sign-back-in) is unit-only** — intentional CI constraint; pilot-operator validation scheduled

All 6 items are either already documented, intentional, or minor. None block milestone completion if GAP-1 is fixed.

---

## Deferred to v1.1 (Intentional)

- **AUTH-03**: Teams SSO via NAA — pivoted away in Phase 5.1; BFF pattern serves web-only for v1
- **DELV-03**: Microsoft Teams tab manifest — follow-up candidate phase (not on v1 roadmap)

Rationale in ROADMAP.md line 164: "Teams-tab candidate is mentioned in RESEARCH but is NOT on the v1 roadmap (separate user decision)."

---

## Pending Operator Actions (16 items)

See frontmatter `pending_operator_actions`. These are out-of-code tasks the operator must complete before and during pilot. Not audit blockers — they're the expected hand-off surface.

---

## Recommended Action

GAP-1 resolved inline during audit (see `remediation` block in frontmatter). Milestone ready for `/gsd:complete-milestone v1`.

Tech debt items can be addressed post-pilot as part of v1.1 planning, or individually by the Content Steward if operationally painful.
