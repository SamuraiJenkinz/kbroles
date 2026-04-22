# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-22)
See: .planning/REQUIREMENTS.md (49 v1 requirements across 12 categories)
See: .planning/ROADMAP.md (6 phases, standard depth)

**Core value:** Every answer is verifiable against the authoritative SOP — users read the cited source section without leaving the conversation. No ungrounded answers, no invented field names or approver names.
**Current focus:** Phase 2 — Chat Backend (BFF)

## Current Position

Phase: 2 of 6 (Chat Backend BFF)
Plan: 0 of TBD in current phase
Status: Ready to plan
Last activity: 2026-04-22 — Phase 1 complete (plans 01-05 shipped; dev-mode Phase-0 smokes PASS; prod-mode deferred to Phase 2 kickoff)

Progress: [██████████] 100% (Phase 1 of 6)

## Performance Metrics

**Velocity:**
- Total plans completed: 5
- Average duration: ~6 min
- Total execution time: ~31 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 — Grounding Foundation | 5 / 5 (complete) | ~31 min | ~6 min |

**Recent Trend:**
- 01-scaffold-registry-schema: 7 min, 8 tasks, 6 feat commits + 1 docs metadata commit, 23/23 tests green
- 02-citation-validator: 2 min, 4 tasks, 2 feat + 1 test commit + 1 docs metadata commit, 35/35 tests green (12 new)
- 03-llm-client-factory: 3 min, 5 tasks, 2 feat + 2 test commits + 1 docs metadata commit, 48/48 tests green (13 new)
- 04-system-prompt-composer: 4 min, 6 tasks, 4 feat + 1 test commit + 1 docs metadata commit, 65/65 tests green (17 new)
- 05-phase0-smoke: ~15 min active + user-loop, 7 tasks (5 committed + 1 verify-only + 1 deferred prod checkpoint), 1 feat + 1 test + 2 docs commits + 2 orchestrator fixes + 1 plan-metadata commit, 70/70 tests green (5 new CLI parser); dev-mode Smokes 1/2/3 PASS; prod deferred

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table. Load-bearing decisions affecting Phase 1:

- Stuff-the-context grounding, no RAG (corpus = 3 docs, fits in 128K)
- gpt-4o (full), not gpt-4o-mini — grounding adherence non-negotiable
- Azure OpenAI via MGTI corporate ingress with `api-key` header
- Dual-mode LLM client (dev=OpenAI Bearer, prod=MGTI api-key) — zero `NODE_ENV` branching
- Structured output JSON Schema strict mode for citations + server-side quote-substring validation

**Plan 01 decisions:**

| Plan | Decision | Rationale |
|------|----------|-----------|
| 01-01 | KB_ID_RE loosened from `\bKB\d{7}\b` to `\bKB\d{5,}\b` | Corpus has both 7-digit (KB0020882, KB0022991) and 8-digit (KB18801781) IDs; RESEARCH.md recommendation was too narrow |
| 01-01 | Custom `rawMarkdown` Vite plugin instead of `assetsInclude` | Vite's `assetsInclude` returns URL references, not raw content; custom transform plugin matches Turbopack `{ type: 'raw' }` behaviour |
| 01-01 | Entity extractor scans source.url attribute too | KB18801781 appears only in the SNOW_FORM permalink, never in section body text |
| 01-01 | Per-task atomic commits (6 feat commits) rather than single combined commit | Follows task_commit_protocol — each task independently revertable |

**Plan 02 decisions:**

| Plan | Decision | Rationale |
|------|----------|-----------|
| 01-02 | `can_answer=false` is NOT a flip — validator preserves answer/can_answer unchanged, only defensively zeroes citations | CONTEXT.md §2 schema contract: can_answer=false => citations=[]; validator enforces this defensively even if the model sends citations alongside can_answer=false |
| 01-02 | Empty citations with can_answer=true treated as total-strip (fallback flip), not pass-through | An LLM that claims to answer but provides zero citations is indistinguishable from one whose citations were all stripped; neither is safe to surface |
| 01-02 | Case-sensitive quote match (no unicode/punctuation folding) | Capitalisation drift signals the model is paraphrasing from memory rather than copying from loaded text — the validator's core hallucination-detection signal |
| 01-02 | Guarded `Record<string, Source \| undefined>` registry lookup rather than narrowing `cite.source_id` to `SourceId` | LLM response is untrusted input; unknown source_ids must produce `unknown_source_id` flip, not a TypeScript assertion error |
| 01-02 | Per-task atomic commits (3 feat/test commits + 1 docs metadata commit) | Consistent with Plan 01 pattern; each task independently revertable |

**Plan 03 decisions:**

| Plan | Decision | Rationale |
|------|----------|-----------|
| 01-03 | Ajv promoted from devDependencies → dependencies | Fallback path is production-gated by env().STRICT_SCHEMA_SUPPORTED; code path is runtime-reachable and must resolve at prod bundle import time |
| 01-03 | Plain-object mock client for streamAnswer tests (not vi.mock) | SUT only needs client.chat.completions.create to be a vi.fn(); inline shape captures per-call params directly without hoisting complexity |
| 01-03 | `as unknown as { _opts: ... }` cast in tests (not `as any`) | Declares test-mock intent explicitly; satisfies strict TS and survives future linting without functional change |
| 01-03 | `pnpm remove ajv && pnpm add ajv` to force devDep→dep migration | `pnpm add ajv` alone reports "Already up to date" when entry exists in devDependencies; explicit remove + re-add is the idiomatic fix |

**Plan 04 decisions:**

| Plan | Decision | Rationale |
|------|----------|-----------|
| 01-04 | Few-shot quotes adapted to verbatim source text (markdown `**` preserved, "OPCO or Line of Business" written in full) | Validator normalises whitespace only, not markdown; plan suggested placeholder strings that Plan 01 did not end up authoring — adjustment explicitly permitted by plan ("adapt the quote value at implementation time to a REAL substring") |
| 01-04 | Added in-test verification loop asserting FEW_SHOTS quotes are verbatim substrings of REGISTRY bodies | Defence in depth: catches registry/fewShots drift at `pnpm test` time rather than waiting for Phase 6 eval fixtures to strip the quote mid-example |
| 01-04 | Task 4.0 (fallback.ts guard) is a no-op because Plan 02 already committed the file (`1e39e40`) earlier in Wave 2 | Wave-2 race resolved cleanly: plan specified "create if missing"; file existed, verification passed, no duplicate write — no commit needed |
| 01-04 | Layer-ordering test anchors on `<sources>\\n<source id=` (unambiguous block opening), not the bare `<sources>` string | The string `<sources>` appears twice in the prompt (once in header prose, once at block opening); disambiguating the anchor prevents false-negative on the ordering assertion |
| 01-04 | Per-task atomic commits (4 feat + 1 test + 1 docs metadata) | Consistent with Plan 01/02/03 precedent; each task independently revertable |

**Plan 05 decisions (Phase-0 findings that constrain Phase 2):**

| Plan | Decision | Rationale |
|------|----------|-----------|
| 01-05 | `api.openai.com/v1` honours `response_format: json_schema strict: true` end-to-end — dev-mode path works; prod-mode (MGTI) verification pending | Dev-mode Smoke 2 PASS with `can_answer=true`, a real citation whose quote is a verbatim substring of the loaded source (validator_flips=0). Fallback path (`STRICT_SCHEMA_SUPPORTED=false` + Ajv) already implemented in Plan 03 streamAnswer; prod can flip via one env var if MGTI rejects strict mode. |
| 01-05 | Dev-mode streaming cadence is a REFERENCE BASELINE only — Pitfall #10 (MGTI APIM buffering) is NOT ruled out | Dev-mode Smoke 3 against api.openai.com: 195 chunks, first-chunk 868ms, P95 inter-chunk 65ms (~10× under 500ms threshold). Proves code path + measurement harness work; does NOT probe APIM buffering. Prod-mode Smoke 3 remains a Phase 2 gate. |
| 01-05 | `tsx` requires `node --env-file-if-exists=.env.local` wrapping to load env vars (unlike Next.js which auto-loads) | Next.js auto-loads .env.local as part of framework runtime; tsx is a thin ESM loader with no env behaviour. Captured in package.json `smoke` script. Future tsx-invoked scripts in this repo must replicate this pattern. |
| 01-05 | Source markdown loaded via `readFileSync(fileURLToPath(new URL('./sources/X.md', import.meta.url)))` — NOT `import X from './X.md'` | Static .md imports require framework-specific loaders (Vitest rawMarkdown Vite plugin, Next.js Turbopack raw loader). readFileSync + URL resolution is portable across Vitest / Next.js server / tsx / vanilla Node with zero plugin config. Retrofit applied to `src/grounding/registry.ts` via orchestrator commit `bf696a3`. |
| 01-05 | Prod-mode Phase-0 smoke deferred to Phase 2 kickoff (non-blocking for Phase 1 closure per Plan 05 Task 5.6 escape hatch) | Plan 05's own guidance: "Phase 1 can close on dev-mode green + prod-mode documented-but-pending if MGTI access is not yet provisioned." User signal at checkpoint 5.6: `blocked: no-mgti-access`. Gates Phase 2 `/api/chat` route construction specifically; does not block Phase 2 planning. |

### Pending Todos

None.

### Blockers/Concerns

**Phase-0 resolutions (Plan 05 outcome):**
- ~~Exact MGTI `baseURL` suffix~~ — partial: dev-mode (api.openai.com/v1) confirmed PASS; MGTI suffix pending prod-mode run
- ~~MGTI honours `response_format: json_schema` strict mode~~ — partial: api.openai.com/v1 honours strict end-to-end (Smoke 2 PASS); MGTI pending prod-mode run. Fallback path already implemented + unit-tested.
- MGTI streaming chunk cadence through APIM — **Phase 2 gate**: dev-mode reference baseline P95=65ms over 195 chunks; prod-mode Smoke 3 still needed to rule out APIM buffering (Pitfall #10)
- Entra admin consent for SPA + `brk-multihub://` redirect URI — deferred to Phase 5 per Plan 05 Smoke 4 (DEFERRED by design)
- Teams sideload policy (MMC may restrict custom-app sideloading) — Phase 5
- Corporate CA chain for outbound HTTPS from App Service to MGTI — **Phase 2 gate**: Smoke 5 BLOCKED pending MGTI access + CA bundle
- App Service provisioning ownership (who creates the Azure resources) — Phase 5
- Named Content Steward for monthly rejected-article pull from ServiceNow — Phase 6 pilot prep

**Phase 2 entry gates (added by Plan 05):**
- **Prod-mode Phase-0 smoke pending MGTI creds + CA bundle; gates Phase 2 `/api/chat` route build.** Code path is proven in dev mode; prod run needs (a) MGTI API key, (b) `LLM_BASE_URL` suffix confirmed, (c) gpt-4o deployment name, (d) MMC corporate CA bundle PEM at a known path + `NODE_EXTRA_CA_CERTS` set in shell env. Re-run `pnpm smoke -- --mode=prod` before first /api/chat code commit.
- **Expand .env handling docs before Phase 2 plan.** .env.local loading contract under tsx vs Next.js is now understood (see Plan 05 decision #3) but not yet documented in a central README/ops note. Phase 2 planning doc should consolidate: which runtime loads which env file, what App Service Application Settings need for prod, and how NODE_EXTRA_CA_CERTS must be set in shell env (not .env).

## Session Continuity

Last session: 2026-04-22 — Plan 05 closure (Phase 1 complete)
Stopped at: Completed 05-phase0-smoke-PLAN.md (dev-mode green; prod-mode deferred to Phase 2 kickoff)
Resume file: None
