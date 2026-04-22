# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-22)
See: .planning/REQUIREMENTS.md (49 v1 requirements across 12 categories)
See: .planning/ROADMAP.md (6 phases, standard depth)

**Core value:** Every answer is verifiable against the authoritative SOP — users read the cited source section without leaving the conversation. No ungrounded answers, no invented field names or approver names.
**Current focus:** Phase 1 — Grounding Foundation

## Current Position

Phase: 1 of 6 (Grounding Foundation)
Plan: 4 of 5 in current phase
Status: In progress
Last activity: 2026-04-22 — Completed 04-system-prompt-composer-PLAN.md

Progress: [████████░░] 80%

## Performance Metrics

**Velocity:**
- Total plans completed: 4
- Average duration: 4 min
- Total execution time: ~16 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 — Grounding Foundation | 4 / 5 | 16 min | 4 min |

**Recent Trend:**
- 01-scaffold-registry-schema: 7 min, 8 tasks, 6 feat commits + 1 docs metadata commit, 23/23 tests green
- 02-citation-validator: 2 min, 4 tasks, 2 feat + 1 test commit + 1 docs metadata commit, 35/35 tests green (12 new)
- 03-llm-client-factory: 3 min, 5 tasks, 2 feat + 2 test commits + 1 docs metadata commit, 48/48 tests green (13 new)
- 04-system-prompt-composer: 4 min, 6 tasks, 4 feat + 1 test commit + 1 docs metadata commit, 65/65 tests green (17 new)

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

### Pending Todos

None.

### Blockers/Concerns

**Phase-0 smoke tests (must resolve before Phase 1 closes — addressed in Plan 05):**
- Exact MGTI `baseURL` suffix (5-min curl test)
- MGTI honours `response_format: json_schema` strict mode (unvalidated)
- MGTI streaming chunk cadence through APIM (risk of buffering)
- Entra admin consent for SPA + `brk-multihub://` redirect URI
- Teams sideload policy (MMC may restrict custom-app sideloading)
- Corporate CA chain for outbound HTTPS from App Service to MGTI
- App Service provisioning ownership (who creates the Azure resources)
- Named Content Steward for monthly rejected-article pull from ServiceNow (required before pilot)

## Session Continuity

Last session: 2026-04-22 17:20 UTC
Stopped at: Completed 04-system-prompt-composer-PLAN.md
Resume file: None
