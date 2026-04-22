---
phase: 01-grounding-foundation
verified: 2026-04-22T14:25:00Z
status: human_needed
score: 5/5 must-haves verified (2 with documented prod-mode deferrals)
re_verification:
  previous_status: none
  previous_score: n/a
  gaps_closed: []
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Review dev-mode smoke evidence in docs/phase-0-smoke.md (lines 27-77)"
    expected: "Smokes 1/2/3 show PASS with real evidence: can_answer=true, citation_count_validated=1, validator_flips=0, chunkCount=195, P95=65ms"
    why_human: "Evidence captured by operator in live run; verifier cannot re-hit api.openai.com without network/API key"
  - test: "Re-run pnpm smoke --mode=prod once MGTI access lands"
    expected: "MGTI baseURL resolves with api-key header; json_schema strict returns KbResponse shape; chunk cadence P95 under 500ms; no CA verification failure"
    why_human: "Requires MGTI API key, gpt-4o deployment name, MMC corporate CA bundle PEM - none available locally. Documented deferral per Plan 05 Task 5.6 gate=non-blocking."
---

# Phase 1: Grounding Foundation Verification Report

**Phase Goal:** The grounding layer exists, is framework-agnostic, and has been proved to work end-to-end against both the local OpenAI dev path and the MGTI corporate ingress - before any UI or chat route exists.

**Verified:** 2026-04-22T14:25:00Z
**Status:** human_needed
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

**Truth 1:** pnpm test runs snapshot tests on composeSystemPrompt(role) for both consumer and author and they pass, including role-specific few-shots and the citation contract block.

- Status: VERIFIED
- Evidence: pnpm test output shows 8 test files passed and 70 tests passed. Snapshot file src/grounding/__tests__/__snapshots__/systemPrompt.test.ts.snap contains the author snapshot at line 3 and consumer snapshot at line 360. 10 structural invariant tests in systemPrompt.test.ts:17-104 assert the citation_contract block tags, injection-resistance clause, fallback string, all three source IDs, section anchors, 2 example few-shots per role, and full layer ordering from header to footer.

**Truth 2:** Quote-substring validator rejects fabricated quote and passes a known-good verbatim quote.

- Status: VERIFIED
- Evidence: src/grounding/validator.ts:36-38 implements quoteExistsInBody via whitespace-normalised String.includes(). validator.ts:89-96 strips citations whose quote is not in the cited section body. validator.test.ts:121-137 asserts a fabricated quote leads to a fallback flip with reason quote_not_in_body. validator.test.ts:94-100 asserts a verbatim-quoted good citation passes with empty _flips. validator.test.ts:169-194 also covers case-sensitivity and paraphrase rejection.

**Truth 3:** Smoke script hits both direct OpenAI and MGTI ingress using the same createLlmClient() factory - only env vars differ - and receives structured response with json_schema strict honoured on both.

- Status: PARTIALLY VERIFIED (dev-mode proven; prod-mode BLOCKED non-blocking)
- Evidence: src/llm/client.ts:21-35 branches only on LLM_AUTH_MODE (bearer vs api-key) with zero NODE_ENV. client.test.ts:24-51 asserts both modes with identical shape assertions. scripts/phase0-smoke.ts:275-304 calls same createLlmClient() regardless of mode. Dev-mode live run recorded in docs/phase-0-smoke.md:27-30,46-51 shows can_answer=true, citation_count_validated=1, validator_flips=0. Prod-mode run deferred per Plan 05 Task 5.6, tracked as Phase 2 kickoff gate.

**Truth 4:** All five Phase-0 smoke resolutions are documented and green.

- Status: PARTIALLY VERIFIED (3 green dev-mode, 1 deferred-by-design, 1 blocked non-blocking)
- Evidence: docs/phase-0-smoke.md Phase 1 closure checklist lines 120-128 show Smokes 1/2/3 PASS dev-mode, Smoke 4 DEFERRED to Phase 5 by design, Smoke 5 BLOCKED pending MGTI access non-blocking. Evidence shape matches script output fields in scripts/phase0-smoke.ts:85-90, 135-144, 200-205.

**Truth 5:** Three source files exist in src/grounding/sources/ as verbatim markdown with XML boundary tags and section anchors; registry loader produces typed Source array with section IDs matching schema enum.

- Status: VERIFIED
- Evidence: kb0020882.md 114 lines, kb0022991.md 106 lines, servicenow-form.md 84 lines. Each opens at line 1 with single-line source tag. Section anchors: KB0020882 has 9, KB0022991 has 6, SNOW_FORM has 7 - all kebab-case. registry.ts:13-15 reads via readFileSync; registry.ts:38-73 parseSource extracts structured Source; registry.ts:86-88 sanity check asserts IDs match SourceId enum. schema.ts:19 defines matching enum.

**Score:** 5/5 truths substantively verified (Truths 3 and 4 have documented prod-mode deferrals per phase plan)

### Required Artifacts

All 19 expected artifacts EXIST, are SUBSTANTIVE (well above stub line-count thresholds), and are WIRED (imports confirmed via grep).

- src/grounding/schema.ts (39 lines): CITATION_SCHEMA with source_id enum [KB0020882, KB0022991, SNOW_FORM], additionalProperties false, required fields, quote maxLength 280. Consumed by registry.ts, validator.ts, stream.ts, phase0-smoke.ts.
- src/grounding/registry.ts (88 lines): readFileSync with import.meta.url URL resolution, portable across Vitest, tsx, Next.js, Node. parseSource regex extracts source tag and section anchors. Fails-fast sanity check on IDs. 9 tests in registry.test.ts.
- src/grounding/sources/kb0020882.md (114 lines, v9.0): 9 section anchors at lines 3, 10, 24, 41, 55, 72, 85, 94, 104.
- src/grounding/sources/kb0022991.md (106 lines, v13.0): 6 section anchors. Approvers section lines 21-34 contains all 7 named approvers verbatim.
- src/grounding/sources/servicenow-form.md (84 lines, v=live): 7 section anchors. URL references sample record KB18801781.
- src/grounding/entities.ts (48 lines): extract() iterates REGISTRY via NAME_RE / KB_ID_RE / URL_RE. entities.test.ts:24 asserts all 7 approvers (Richard Danilowicz, Samantha Eaton, Nicholas Hile, Matthew Renner, Julie Ramos, Brandon Young, Spencer Barratt); entities.test.ts:28-32 asserts all 3 KB IDs (KB0020882, KB0022991, KB18801781).
- src/grounding/validator.ts (131 lines): pure function, registry injected as parameter. Handles can_answer=false pass-through, unknown source_id, unknown section_id, quote_not_in_body, total-strip-to-fallback, GRND-04 one-citation trim. 12 tests cover every branch.
- src/grounding/fallback.ts (10 lines): single source of truth for fallback copy. Consumed by commonRules.ts, validator.ts, fewShots.ts.
- src/grounding/systemPrompt.ts (79 lines): composeSystemPrompt joins 5 layers in locked order (ROLE_PRELUDES[role], COMMON_RULES_HEADER, renderSources(REGISTRY), renderFewShots(role), COMMON_RULES_FOOTER). Pure function asserted by test:100-103.
- src/grounding/commonRules.ts (49 lines): CITATION_CONTRACT_BLOCK names source_id enum verbatim. HEADER has injection-resistance clause. FOOTER reiterates 3 rules (PITFALLS #7 bookending).
- src/grounding/rolePreludes.ts (22 lines): Role type = consumer or author. ROLE_PRELUDES record with distinct preludes targeting Knowledge Consumer / KB Author or SME audiences.
- src/grounding/fewShots.ts (83 lines): 2 shots per role (in-scope + out-of-scope). Quote values verified as verbatim registry substrings by systemPrompt.test.ts:111-129.
- src/config/env.ts (37 lines): zod-validated EnvSchema. STRICT_SCHEMA_SUPPORTED with z.enum and default true. env() cached accessor. Rejects typos at loadEnv time.
- src/llm/client.ts (35 lines): branches only on LLM_AUTH_MODE. api-key mode sets defaultHeaders api-key with placeholder apiKey (SDK requirement). Grep NODE_ENV in src/ returns only a comment at client.ts:15 asserting absence. GRND-06 invariant held.
- src/llm/stream.ts (113 lines): primary json_schema strict with CITATION_SCHEMA; fallback json_object + Ajv + one retry. Env flag via validated env() (grep process.env.STRICT_SCHEMA_SUPPORTED in src/llm returns only tests). 8 tests.
- scripts/phase0-smoke.ts (350 lines): 5 Smokes with dependency-aware SKIP if Smoke 1 fails. CLI parser exported and unit-tested.
- scripts/__tests__/phase0-smoke.test.ts (20 lines, 5 tests): CLI parser coverage. Live-endpoint tests intentionally NOT in vitest suite.
- docs/phase-0-smoke.md (128 lines): per-smoke Result/Date/Operator/Mode/Evidence/Remediation. Closure checklist ticks all 5 with prod-mode caveats.
- .env.example (25 lines): documents STRICT_SCHEMA_SUPPORTED and NODE_EXTRA_CA_CERTS shell-env requirement (references nodejs/node issue 51426).

### Key Link Verification

| From | To | Via | Status |
|------|----|----|--------|
| composeSystemPrompt | REGISTRY | renderSources(REGISTRY) | WIRED - systemPrompt.ts:74 + test:48-53 |
| composeSystemPrompt | FEW_SHOTS | renderFewShots(role) | WIRED - systemPrompt.ts:75 |
| composeSystemPrompt | citation contract | CITATION_CONTRACT_BLOCK in HEADER | WIRED - commonRules.ts:39 + test:21-26 |
| validateCitations | registry lookup | findSourceForId + sections.find | WIRED - validator.ts:40-43,71,80 + 12 tests |
| validateCitations | FALLBACK_STRING | total-strip flip | WIRED - validator.ts:105-112 + 3 tests |
| streamAnswer | CITATION_SCHEMA | response_format json_schema | WIRED - stream.ts:68 + stream.test.ts:71-78 |
| streamAnswer | env() | STRICT_SCHEMA_SUPPORTED via validated env | WIRED - stream.ts:48,52 + stream.test.ts:162-171 |
| createLlmClient | env() | single LLM_AUTH_MODE branch | WIRED - client.ts:22-35 + client.test.ts:24-51 |
| phase0-smoke.ts | full Phase 1 chain | same code path as Phase 2 /api/chat | WIRED - imports all four; dev-mode evidence confirms end-to-end |
| ENTITY_ALLOWLIST | REGISTRY | extract() at module load | WIRED - entities.ts:26-43 + entities.test.ts |

### Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| GRND-01 source registry | SATISFIED | Truth 5 |
| GRND-02 citation schema | SATISFIED | schema.ts:5-26 + schema.test.ts 4/4 |
| GRND-03 quote validator | SATISFIED | Truth 2 |
| GRND-04 one-citation cap | SATISFIED | validator.ts:115-123 + 2 tests |
| GRND-05 single composeSystemPrompt | SATISFIED | Truth 1 - no divergent prompt trees (grep confirmed) |
| GRND-06 zero NODE_ENV in code | SATISFIED | Grep src/ returns only the asserting comment at client.ts:15 |
| CORP-01 dual-mode client + MGTI smoke | PARTIALLY SATISFIED | Dev-mode proven; live MGTI smoke BLOCKED pending access, tracked as Phase 2 gate |

### Anti-Patterns Found

No blocker anti-patterns. Only matches:

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/llm/client.ts | 12, 26 | placeholder | INFO | Intentional - apiKey placeholder required by OpenAI SDK when real auth is via defaultHeaders in api-key mode. Documented inline. |
| src/llm/__tests__/client.test.ts | 39, 47 | placeholder | INFO | Test asserting the above intentional value. |

All empty-array returns (validator _flips, citations) are legitimate contract values, not stubs.

### Build Validation Performed

- pnpm test: 70 passed / 0 failed / 8 test files
- pnpm tsc --noEmit: exit code 0 (strict typecheck clean)
- Grep NODE_ENV in src/: only one match, a comment at client.ts:15 asserting its absence
- Grep process.env.STRICT_SCHEMA_SUPPORTED in src/llm: only in test files; production code reads via env()

### Gaps Summary

No code-level gaps. All 5 must-haves have substantive, wired implementations. 70/70 tests pass. TypeScript strict typecheck exits 0. All 19 artifacts verified at existence, substantive, and wired levels.

Two documented operational deferrals (non-blocking for Phase 1 per plan):

- Truth 3 is met on direct OpenAI end-to-end; proof on MGTI is deferred. Factory code is demonstrably capable of hitting both (client.test.ts:38-51 exercises the api-key branch with an MGTI-shaped baseURL). BLOCKING piece is operational (MGTI key + CA bundle + deployment name), not code.
- Truth 4: 3 smokes green dev-mode, 1 deferred-by-design (Smoke 4 to Phase 5), 1 blocked non-blocking (Smoke 5 to Phase 2 kickoff). All 5 documented with evidence or remediation.

These deferrals are explicit in 05-phase0-smoke-PLAN Task 5.6 (gate=non-blocking) and docs/phase-0-smoke.md closure checklist lines 120-128.

### Phase 2 Readiness Recommendation

Phase 2 can begin. The grounding substrate is load-bearing-complete:

- composeSystemPrompt + validateCitations + createLlmClient + streamAnswer + REGISTRY + CITATION_SCHEMA + ENTITY_ALLOWLIST all exist, are typed, and are unit-tested (70/70 green).
- Phase 2 /api/chat route has everything it needs to be planned and scaffolded against these exports.
- The one open gate - prod-mode MGTI smoke (Smokes 1/2/3/5) - blocks live /api/chat construction against MGTI, NOT Phase 2 planning, CONTEXT writing, or BFF route scaffolding against the dev endpoint.
- .planning/STATE.md Blockers/Concerns tracks the MGTI dependency for session-boundary visibility.

Status is human_needed rather than passed because prod-mode smoke evidence physically cannot be captured by an automated verifier without MGTI credentials. Appropriate human actions: (a) accept dev-mode evidence in docs/phase-0-smoke.md and (b) acknowledge prod-mode deferral as a Phase 2 kickoff item. Neither is a code gap; both are captured in gate=non-blocking plan metadata.

---

Verified: 2026-04-22T14:25:00Z
Verifier: Claude (gsd-verifier)
