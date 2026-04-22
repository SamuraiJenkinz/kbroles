# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-22)
See: .planning/REQUIREMENTS.md (49 v1 requirements across 12 categories)
See: .planning/ROADMAP.md (6 phases, standard depth)

**Core value:** Every answer is verifiable against the authoritative SOP — users read the cited source section without leaving the conversation. No ungrounded answers, no invented field names or approver names.
**Current focus:** Phase 2 — Chat Backend (BFF)

## Current Position

Phase: 2 of 6 (Chat Backend BFF)
Plan: 2 of 4 in current phase (chat-primitives) — COMPLETE; Plan 1 (infra-ops-setup) still IN PROGRESS paused at Task 1.1 checkpoint
Status: Plan 02 complete (wave-1 parallel with Plan 01); awaiting human for prod-mode Phase-0 smoke to unblock Plan 01
Last activity: 2026-04-22 — Plan 02 complete end-to-end (3 tasks, 3 feat commits 81b2410 / 83c3a2b / 6a42198, 40 new unit tests, 134/134 green); SUMMARY.md at .planning/phases/02-chat-backend-bff/02-02-SUMMARY.md

Progress: [██████████░░] Phase 1 of 6 complete; Phase 2 Plan 2 of 4 complete, Plan 1 of 4 in progress

## Performance Metrics

**Velocity:**
- Total plans completed: 6
- Average duration: ~6.5 min
- Total execution time: ~39 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 — Grounding Foundation | 5 / 5 (complete) | ~31 min | ~6 min |
| 2 — Chat Backend BFF     | 1 / 4 (Plan 02 complete; Plan 01 in progress; Plans 03/04 pending) | ~8 min so far | ~8 min |

**Recent Trend:**
- 01-scaffold-registry-schema: 7 min, 8 tasks, 6 feat commits + 1 docs metadata commit, 23/23 tests green
- 02-citation-validator: 2 min, 4 tasks, 2 feat + 1 test commit + 1 docs metadata commit, 35/35 tests green (12 new)
- 03-llm-client-factory: 3 min, 5 tasks, 2 feat + 2 test commits + 1 docs metadata commit, 48/48 tests green (13 new)
- 04-system-prompt-composer: 4 min, 6 tasks, 4 feat + 1 test commit + 1 docs metadata commit, 65/65 tests green (17 new)
- 05-phase0-smoke: ~15 min active + user-loop, 7 tasks (5 committed + 1 verify-only + 1 deferred prod checkpoint), 1 feat + 1 test + 2 docs commits + 2 orchestrator fixes + 1 plan-metadata commit, 70/70 tests green (5 new CLI parser); dev-mode Smokes 1/2/3 PASS; prod deferred
- 02-02-chat-primitives: 8 min active, 3 tasks autonomous (no checkpoints), 3 feat commits 81b2410 / 83c3a2b / 6a42198 + pending docs metadata commit, 134/134 tests green (40 new: 6 sse + 13 partialAnswer + 7 allowlist + 8 concurrency + 6 env + 14 requestSchema + 8 suggested; also absorbed 2 logger tests from parallel Plan 01); 6 source modules + entities.ts regex widening + env schema extension

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

**Plan 02-02 decisions (chat-primitives):**

| Plan  | Decision | Rationale |
|-------|----------|-----------|
| 02-02 | chatSemaphore uses LAZY initialization (first-call get) rather than module-load `new AsyncSemaphore(env().MAX_INFLIGHT_STREAMS)` | Module-load env() call forces every test that imports src/chat/* to populate four LLM_* env vars even for tests that never touch the semaphore. Lazy init keeps module imports cheap and test isolation clean. |
| 02-02 | URL regex trailing-punctuation caveat handled in test fixtures, not regex | The URL regex greedily captures adjacent punctuation; ENTITY_ALLOWLIST harvests URLs from `<source url="...">` attributes (no punctuation). Fixing the regex would require handling Markdown-link parens, URL-encoded parens, trailing dots — non-trivial for a corner case. Positive-path tests author URL + whitespace. |
| 02-02 | parseChatRequest runs granular field checks BEFORE zod safeParse, uses safeParse as belt-and-suspenders | 02-CONTEXT §4.1 locks 8 specific error codes. Bare zod safeParse produces a tree of generic issues that cannot be mapped 1:1 without fragile error-path string matching. Granular-first keeps codes deterministic; zod remains the type-inference source. |
| 02-02 | entities.ts regexes widened to named exports rather than duplicated in allowlist.ts | Single source of truth — same regexes feed boot-time ENTITY_ALLOWLIST extraction AND runtime post-check. Duplication would create drift risk where a corpus-format change updates one set but not the other. Task 2.2 action block explicitly permitted. |
| 02-02 | Release clamped to initialCap — stray double-release cannot inflate capacity | Defensive correctness: a double-release bug in route handler's finally block would otherwise permanently raise the cap. Clamping means a bug causes momentary over-permit-by-zero but never capacity leak. |
| 02-02 | chatSemaphore exported as wrapper object (tryAcquire/release/available) not direct AsyncSemaphore instance | Wrapper lets __resetForTests swap the underlying instance transparently — callers hold a stable reference that always routes to the current instance. |

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

Last session: 2026-04-22 — Phase 2 Plan 02 (chat-primitives) complete (wave-1 parallel with Plan 01); Plan 01 still paused at Task 1.1 checkpoint
Stopped at: Plan 02 complete; Plan 01 awaiting prod-mode Phase-0 smoke (unchanged); Plans 03 + 04 not started
Resume signals (Plan 01):
  - "prod-smoke-green" → continue to Plan 01 Task 1.2 (pino install + logger — NOTE: Plan 02 absorbed 2 logger tests from a parallel Plan 01 stub that landed on master; verify Plan 01's logger.ts exists before adding) and Task 1.3 (stub middleware)
  - "blocked: no-mgti-access" → mark docs/phase-0-smoke.md prod sections `pending: no-mgti-access <date>`; continue to Plan 01 Tasks 1.2/1.3; Plan 04 Task 2 stays blocked
  - "failed: smoke-N <note>" → capture remediation (often a Plan 03 timeout retune), then continue to Plan 01 Tasks 1.2/1.3
Resume signals (Plans 03/04):
  - Both ready to plan/execute — Plan 02 primitives provide all their dependency surface (AsyncSemaphore / SseEvent / checkEntityAllowlist / parseChatRequest / SUGGESTED_PROMPTS / partialAnswer)
  - Plan 03 (upstream-resilience) wraps `streamAnswer` with retry/timeout; uses Plan 02's SseEvent error codes
  - Plan 04 (route-wiring) composes all primitives; blocked on prod-mode smoke per Phase 2 entry gates
Resume file: None
