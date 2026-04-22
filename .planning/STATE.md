# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-22)
See: .planning/REQUIREMENTS.md (49 v1 requirements across 12 categories)
See: .planning/ROADMAP.md (6 phases, standard depth)

**Core value:** Every answer is verifiable against the authoritative SOP — users read the cited source section without leaving the conversation. No ungrounded answers, no invented field names or approver names.
**Current focus:** Phase 1 — Grounding Foundation

## Current Position

Phase: 1 of 6 (Grounding Foundation)
Plan: 2 of 5 in current phase
Status: In progress
Last activity: 2026-04-22 — Completed 02-citation-validator-PLAN.md

Progress: [████░░░░░░] 40%

## Performance Metrics

**Velocity:**
- Total plans completed: 2
- Average duration: 4.5 min
- Total execution time: ~9 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 — Grounding Foundation | 2 / 5 | 9 min | 4.5 min |

**Recent Trend:**
- 01-scaffold-registry-schema: 7 min, 8 tasks, 6 feat commits + 1 docs metadata commit, 23/23 tests green
- 02-citation-validator: 2 min, 4 tasks, 2 feat + 1 test commit + 1 docs metadata commit, 35/35 tests green (12 new)

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

Last session: 2026-04-22 17:17 UTC
Stopped at: Completed 02-citation-validator-PLAN.md
Resume file: None
