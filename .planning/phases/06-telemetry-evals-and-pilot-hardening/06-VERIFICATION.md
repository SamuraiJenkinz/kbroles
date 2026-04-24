---
phase: 06-telemetry-evals-and-pilot-hardening
verified: 2026-04-24T10:55:00Z
status: human_needed
score: 4/5 must-haves automated-verified; SC#5 is a live-operator activity
human_verification:
  - test: Confirm pilot cohort identified and onboarded
    expected: Named individuals granted KbAssistant.User App Role in Entra, assistant URL bookmarked, weekly digest shows at least one session from at least 50pct of cohort within first two pilot weeks
    why_human: Live-operator activity during the pilot window; no codebase artifact can pre-confirm access grants or session counts for live users
  - test: App Insights dashboard refresh cycle for thumbs-down event (SC#4 partial)
    expected: After a thumbs-down click, workbook Section 2 thumbs_down_pct tile updates within one manual refresh of the Azure portal page
    why_human: Requires a live Azure App Insights resource; KQL and workbook JSON are verified in-code but live ingestion latency is an operator observation
  - test: ServiceNow instance schema pre-flight (TELE-04 operator step)
    expected: pnpm sn:validate exits 0; u_rejection_reason or rejection_reason present true; workflow_state values include retired/outdated/draft
    why_human: Requires live ServiceNow credentials and SN_INSTANCE env var; script exists but cannot run without live SN instance
  - test: Content Steward named and signoff dates filled in measurement-plan.md and content-steward-runbook.md
    expected: STEWARD_NAME STEWARD_BACKUP_NAME SIGNOFF_DATE placeholders replaced with real values before pilot day 1
    why_human: Organisational/personnel activity; placeholder text intentionally left for PM/steward to fill before pilot start
---

# Phase 6: Telemetry, Evals and Pilot Hardening - Verification Report

**Phase Goal:** A pre-registered telemetry schema is live in Application Insights capturing session / role / chip-vs-freeform / citation-click-through / thumbs / fallback-fire events with question-hash-only anonymisation; the grounding eval suite gates deploys; a named Content Steward owns the monthly rejected/flagged article pull from ServiceNow; the pilot cohort is identified, onboarded, and actively using the assistant.

**Verified:** 2026-04-24T10:55:00Z
**Status:** human_needed
**Re-verification:** No - initial verification

---

## Test Baseline

| Suite | Result |
|-------|--------|
| pnpm typecheck | PASS (0 errors) |
| pnpm test (unit) | PASS - 728/728 tests, 71 test files |
| pnpm eval:fast | PASS - 2/2 tests (entity-allowlist + citation-substring both green) |
| pnpm eval:slow | NOT RUN - requires LLM_JUDGE_API_KEY (per instructions) |

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Complete event stream (9 user-visible events) with no raw question text | VERIFIED | src/obs/eventSchema.ts L53-69: all 15 EVENT_NAMES present. route.ts emits all server events with SessionContext spread. route.test.ts L1014-1035 PII-absence assertion passes. 728/728 unit tests pass. |
| 2 | pnpm eval:fast and eval:slow gate deploys; all 6 suite thresholds match ROADMAP SC2 exactly | VERIFIED | thresholds.ts: entity-allowlist=1.0, citation-substring=0.99, negative-oos=0.95, paired-role=0.98, injection-refuse=0.95, positional=0.02. All 6 suites 70-282 lines. pnpm eval:fast green 2/2. ci.yml + evals-nightly.yml + deploy.yml all wired. |
| 3 | Written measurement plan names Content Steward, cadence, SN source, baseline, signoff; signed off before pilot day 1 | VERIFIED (code) / human_needed (signoff) | docs/measurement-plan.md 152 lines: all sections present. docs/content-steward-runbook.md 158 lines: all substantive. Scripts and workflows present. STEWARD_NAME placeholder requires pre-pilot fill-in. |
| 4 | Thumbs-down writes FDBK-03 payload within 5 seconds; dashboard shows event | VERIFIED (code+E2E) / human_needed (live dashboard) | feedback/route.ts L65-72 emits exact FDBK-03 shape. E2E spec asserts elapsed < 5000ms (L148) and payload (L151-161). Workbook Section 2 KQL confirmed. |
| 5 | Pilot cohort identified, onboarded, at least 50pct weekly session | human_needed | Live-operator activity during pilot window. Code infrastructure complete: About tooltip, bookmarkable URL, weekly digest workflow, session_id_hash counting in workbook KQL. |

**Score:** 4/5 truths automated-verified; SC5 is a live-operator activity (expected and scoped).

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| src/obs/eventSchema.ts | 15-event catalog + SessionContext | VERIFIED | 96 lines; 15 EVENT_NAMES; SessionContext interface |
| src/obs/telemetry.ts | OTel span emitter + pino dual-emit | VERIFIED | 77 lines; trackEvent wraps OTel INTERNAL span |
| src/obs/questionHash.ts | SHA-256 16-hex hash; no raw text exit | VERIFIED | 68 lines; hashQuestion/hashIdentifier; raw text never emitted |
| src/instrumentation.node.ts | useAzureMonitor bootstrap | VERIFIED | 58 lines; loadSecrets then useAzureMonitor; graceful no-op when absent |
| src/app/api/chat/route.ts | trackEvent calls for all server events | VERIFIED | 524 lines; chat_request_started L219, session_start L226, role_selected L227, chip_vs_freeform L235-240, question_hash L248-251, citation_returned L371-377, fallback_trigger 4 paths, chat_request_completed L483-496 |
| src/app/api/feedback/route.ts | Iron-session + Zod + FDBK-03 | VERIFIED | 87 lines; iron-session gate L36; Zod FeedbackSchema L25-31; trackEvent thumbs_rating L65-72 |
| src/app/api/telemetry/route.ts | Citation click-through + flag-a-gap sink | VERIFIED | 104 lines; closed enum; PII key stripping L35-55; iron-session gate |
| src/chat-ui/AssistantControls.tsx | sendFeedback wiring | VERIFIED | sendFeedback imported L7; called on thumbs-up L50 and thumbs-down+reason L87 |
| src/chat-ui/ChatSurface.tsx | sendClientEvent citation_click_through | VERIFIED | sendClientEvent imported L18; called on chip click L204 |
| src/chat-ui/FallbackCard.tsx | sendClientEvent flag_a_gap_action | VERIFIED | sendClientEvent imported L8; called on flag link click L57 |
| src/evals/suites/entity-allowlist.eval.ts | 100pct threshold | VERIFIED | 70 lines; imports THRESHOLDS; threshold=1.0 |
| src/evals/suites/citation-substring.eval.ts | 99pct threshold | VERIFIED | 115 lines; imports THRESHOLDS; threshold=0.99 |
| src/evals/suites/negative-oos.eval.ts | 95pct threshold | VERIFIED | 116 lines; imports THRESHOLDS |
| src/evals/suites/paired-role.eval.ts | 98pct threshold | VERIFIED | 178 lines; imports THRESHOLDS |
| src/evals/suites/injection-refuse.eval.ts | 95pct threshold | VERIFIED | 127 lines; imports THRESHOLDS |
| src/evals/suites/positional.eval.ts | delta <=2pp threshold | VERIFIED | 282 lines; imports THRESHOLDS; positional delta logic |
| src/evals/runner/thresholds.ts | Exact ROADMAP SC2 values | VERIFIED | 23 lines; all 6 thresholds match SC2 exactly |
| src/evals/runner/judge.ts | judgeBinary best-of-3 | VERIFIED | 74 lines; 3 parallel judge calls; majority vote >=2/3 |
| src/evals/runner/flakeQuarantine.ts | computeFlakes + writeFlakeReport | VERIFIED | 170 lines; variance_pp > 10 triggers quarantine; append-only |
| .github/workflows/ci.yml | pnpm eval:fast step | VERIFIED | 62 lines; Fast evals deterministic gate step; blocks merge on red |
| .github/workflows/evals-nightly.yml | Cron + LLM_JUDGE_API_KEY + issue-open + Teams | VERIFIED | 109 lines; cron 20:00 UTC; LLM_JUDGE_API_KEY env; issue-open + Teams notify on failure |
| .github/workflows/deploy.yml | check-evals job 48h window + bypass | VERIFIED | 194 lines; listWorkflowRunsForRepo 48h; two-consecutive-red detection; skip_eval_gate bypass |
| docs/measurement-plan.md | Steward name, cadence, SN source, baseline, signoff | VERIFIED | 152 lines; all sections present; STEWARD_NAME placeholder awaits operator fill-in |
| docs/content-steward-runbook.md | Steward ownership, cadence, procedure, escalation | VERIFIED | 158 lines; all sections substantive |
| scripts/pull-servicenow-feedback.ts | --baseline flag + typed output | VERIFIED | Exists; --baseline flag; KbRecord + PullOutput interfaces L23-40 |
| scripts/validate-servicenow-schema.ts | Schema pre-flight | VERIFIED | Exists; loadSecrets wired; one-time operator pre-flight |
| .github/workflows/steward-monthly.yml | 1st-of-month cron + weekend-skip + issue-open | VERIFIED | cron 01:00 UTC 1st; weekend-skip; issue-open + archive commit |
| .github/workflows/weekly-digest.yml | Sunday 23:00 UTC cron + Teams post | VERIFIED | cron Sunday 23:00 UTC; App Insights KQL; Teams webhook post |
| ops/workbooks/kb-assistant-pilot.workbook.json | Section 2 thumbs_rating KQL | VERIFIED | countif thumbs_rating rating==down in Section 2; Section 5 inert on pilot day 1 |
| tests-e2e/feedback-and-telemetry.spec.ts | SC4 <5000ms + FDBK-03 payload | VERIFIED | 274 lines; elapsed < 5000ms L148; full payload assertions L151-161 |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| src/app/api/chat/route.ts | trackEvent | 9+ distinct calls | WIRED | All SC1 events with SessionContext spread |
| src/app/api/feedback/route.ts | trackEvent thumbs_rating | Zod + trackEvent | WIRED | Exact FDBK-03 payload at L65-72 |
| src/app/api/telemetry/route.ts | trackEvent clientEvent | PII filter + trackEvent | WIRED | citation_click_through + flag_a_gap_action |
| src/chat-ui/AssistantControls.tsx | /api/feedback | sendFeedback | WIRED | thumbs-up L50 + thumbs-down+reason L87 |
| src/chat-ui/ChatSurface.tsx | /api/telemetry | sendClientEvent | WIRED | chip click L204 |
| src/chat-ui/FallbackCard.tsx | /api/telemetry | sendClientEvent | WIRED | flag link click L57 |
| src/obs/questionHash.ts | trackEvent question_hash | hashQuestion in route.ts | WIRED | Raw text hashed; 16-hex prefix emitted; raw never exits module |
| src/instrumentation.ts | useAzureMonitor | dynamic import | WIRED | Node-only; graceful no-op without connection string |
| src/evals/runner/thresholds.ts | each suite .eval.ts | import THRESHOLDS | WIRED | All 6 suites use their named key |
| deploy.yml check-evals | evals-nightly.yml | listWorkflowRunsForRepo 48h | WIRED | check-evals gates deploy; skip_eval_gate bypass available |
| steward-monthly.yml | pull-servicenow-feedback.ts | pnpm exec tsx | WIRED | --baseline flag wired via workflow_dispatch input L60-64 |

---

### Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| FDBK-03 (thumbs-down payload to telemetry) | SATISFIED | None - feedback/route.ts L65-72; E2E asserts in less than 5000ms |
| TELE-01 (pre-registered telemetry schema) | SATISFIED | None - eventSchema.ts EVENT_NAMES is the single source of truth |
| TELE-02 (anonymised, no raw question text) | SATISFIED | None - questionHash.ts; route.test.ts L1014-1035 PII-absence passes |
| TELE-03 (App Insights / OTel integration) | SATISFIED | None - instrumentation.node.ts calls useAzureMonitor |
| TELE-04 (monthly pull + named Content Steward) | SATISFIED (code) / human_needed (live ops) | Steward name + signoff require pre-pilot fill-in |

---

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| ops/workbooks/kb-assistant-pilot.workbook.json Section 5 | PENDING/INERT note in tile title | Info | Intentional; eval_run_completed follow-up scoped post-pilot; not a blocker |
| docs/measurement-plan.md + content-steward-runbook.md | STEWARD_NAME / SIGNOFF_DATE placeholders | Info | Intentional; filled by PM/steward before pilot day 1; not a blocker |

---

### Human Verification Required

#### 1. Content Steward Named and Docs Signed Off (SC3)

**Test:** Confirm STEWARD_NAME, STEWARD_BACKUP_NAME, SIGNOFF_DATE replaced in docs/measurement-plan.md and docs/content-steward-runbook.md; signoff checklist ticked.
**Expected:** Named individual committed; PM reviewed metrics; engineering on-call reviewed alerts; baseline captured.
**Why human:** Personnel and organisational activity; cannot be verified from code.

#### 2. Pilot Cohort Onboarded and 50pct Weekly Session (SC5)

**Test:** During pilot window - verify KbAssistant.User App Role granted in Entra, URL bookmarked, weekly digest Teams message shows at least one session from at least 50pct of cohort.
**Expected:** At least 50pct of cohort has a logged session in App Insights within first two pilot weeks.
**Why human:** Live-operator activity; code infrastructure complete (About tooltip, bookmarkable URL, weekly digest, KQL).

#### 3. App Insights Live Ingestion - Thumbs-Down Dashboard Visibility (SC4 partial)

**Test:** Click thumbs-down on a live message; wait 60 seconds; manually refresh the App Insights workbook in Azure portal.
**Expected:** Section 2 thumbs_down_pct tile increments; event appears in Section 3 top-20 table.
**Why human:** Requires APPLICATIONINSIGHTS_CONNECTION_STRING on Windows deployment; ingestion latency is an operator observation.

#### 4. ServiceNow Schema Pre-Flight (TELE-04)

**Test:** With live SN credentials, run pnpm sn:validate; paste output into docs/content-steward-runbook.md Schema Validation section.
**Expected:** u_rejection_reason or rejection_reason present: true; workflow_state includes retired, outdated, draft.
**Why human:** Requires live ServiceNow instance access.

---

## Gaps Summary

No automated gaps found. All codebase artifacts exist, are substantive, and are wired correctly for SC1 through SC4. The SC5 items (pilot cohort onboarding, weekly session tracking) and four human verification items are live-operator activities that execute during and around the pilot window. This is the expected state at the end of Phase 6 code delivery.

---

## Recommended Action

**Proceed.** The codebase is fully ready for pilot launch. Pre-pilot operator checklist:

1. Fill STEWARD_NAME, STEWARD_BACKUP_NAME, SIGNOFF_DATE in docs before pilot day 1.
2. Run pnpm sn:validate; paste output into runbook Schema Validation section.
3. Trigger steward-monthly.yml with baseline:true before pilot day 1 to capture baseline-pre-pilot.json.
4. Grant KbAssistant.User App Role to pilot cohort in Entra; share assistant URL; confirm About tooltip seen.
5. Set LLM_JUDGE_API_KEY, TEAMS_WEBHOOK_URL, AZURE_CREDENTIALS, APP_INSIGHTS_APP_ID, STEWARD_GH_HANDLE as GitHub repository secrets/variables.
6. Workbook Section 5 eval trend is intentionally inert on pilot day 1; follow-up task to emit eval_run_completed events is scoped post-pilot.

---

_Verified: 2026-04-24T10:55:00Z_
_Verifier: Claude (gsd-verifier)_
