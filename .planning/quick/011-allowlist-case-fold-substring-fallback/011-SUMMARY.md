---
quick: 011
title: Allowlist two-tier name check — case-insensitive corpus fallback
date: 2026-05-12
commit: 8a7c2eb
subsystem: chat
tags: [allowlist, corp-02, anthropic, claude, opus, false-positive-reduction]

dependency-graph:
  requires: [quick-008, quick-009, quick-010]
  provides: dramatic reduction in false-positive allowlist_violation fallbacks under Anthropic Opus + strict-tools (live Phase B data)
  affects: []

tech-stack:
  added: []
  patterns:
    - "two-tier check: strict equality → case-insensitive substring fallback"
    - "precompute lowercased corpus once at module load to keep per-call cost negligible"
    - "preserve the original security invariant (fabricated-name guard) — fix only the false-positive surface"

key-files:
  created:
    - .planning/quick/011-allowlist-case-fold-substring-fallback/011-PLAN.md
    - .planning/quick/011-allowlist-case-fold-substring-fallback/011-SUMMARY.md
  modified:
    - src/grounding/entities.ts
    - src/chat/allowlist.ts
    - src/chat/__tests__/allowlist.test.ts

decisions:
  - id: substring-fallback-over-allowlist-expansion
    choice: "Tier 2 = case-insensitive substring match against the lowercased source corpus"
    rationale: "Considered the alternative of pre-generating case variants of every source bigram and adding them to the allowlist. Substring-against-lowercased-corpus is simpler, has identical security properties (a bigram absent from the corpus in any casing still fails), handles arbitrary phrasings without enumerating variants, and is O(corpus-length) per check — submillisecond at our corpus size."
    alternatives: ["expand allowlist with case variants of every extracted name — more code, same outcome", "loosen NAME_RE to match mixed-case bigrams — broader change, harder to reason about"]

  - id: keep-original-tier-1-strict-equality
    choice: "Preserve the existing strict-equality check as Tier 1; only ADD Tier 2 as a fallback"
    rationale: "Backward compatibility: every existing test scenario that passes today continues to pass via Tier 1 unchanged. Tier 2 is purely additive — it only converts previously-failing requests into passes. No existing pass becomes a fail."
    alternatives: ["replace strict equality with case-fold-only — but that loses the explicit-allowlist semantics for the harvested approver names from KB0022991"]

  - id: kbids-and-urls-stay-case-sensitive
    choice: "Only apply the Tier 2 fallback to the names check; KB IDs and URLs keep their strict-equality match"
    rationale: "KB IDs are uppercase by regex (`/\\bKB\\d{5,}\\b/`) — no casing variance to handle. URLs are case-significant per RFC 3986 for some path segments and the host. Loosening these would weaken the fabricated-KB-ID and fabricated-URL guards without any false-positive problem to solve."
    alternatives: []

metrics:
  duration: "~25 minutes (incl. test debug for NAME_RE regex behaviour)"
  completed: 2026-05-12
  files_changed: 3
  new_tests: 7
  test_count_before: 773
  test_count_after: 780
  new_dependencies: 0
---

# Quick Task 011: Allowlist two-tier name check

**One-liner:** the entity-allowlist names check now falls back to a case-insensitive substring search against the source corpus when strict-equality fails — letting LLM-introduced title-case variants of source-mentioned terms (e.g. `"Knowledge Base"` vs source `"Knowledge base"`) pass while preserving the fabricated-name guard.

## Commit

| Field | Value |
|---|---|
| Hash | `8a7c2eb` |
| Subject | `feat(allowlist): two-tier name check with case-insensitive corpus fallback` |
| Branch | `master` |
| Co-Author | `Claude Opus 4.7 (1M context) <noreply@anthropic.com>` |

## How this surfaced

Phase B live data on prod (D:\kbroles + LLM_PROVIDER=anthropic + ANTHROPIC_MODEL=eu.anthropic.claude-opus-4-6-v1), 2026-05-12:

| Failure mode | Count (out of 14) | % |
|---|---|---|
| Success | 7 | 50% |
| `quote_not_in_body` | **0** | **0%** |
| `allowlist_violation` (class: names) | 7 | 50% |

Opus 4.6 + Quick 009 strict-tools mode had completely eliminated citation paraphrase. The remaining 50% failure rate was 100% allowlist-driven, all on class `names` with 1-3 token violations each — Claude introducing title-case formatting like `"Knowledge Base"` or `"Subject Matter"` where the source uses sentence-case `"Knowledge base"` / `"Subject matter expert"`.

The pre-existing CORP-02 allowlist enforces strict equality against names extracted from source bodies via `NAME_RE` (which requires BOTH words title-cased to match). Sentence-case source phrases are never harvested into `ENTITY_ALLOWLIST.names`, so the answer's title-case re-mention fails the strict check despite the referent being in-source.

## The fix

`src/grounding/entities.ts`:

Added `SOURCE_CORPUS_LOWERCASE` — concatenation of every section body across `REGISTRY`, joined by `\n`, lowercased once at module load. ~10K characters total.

`src/chat/allowlist.ts`:

```typescript
const badNames = names.filter(n => {
  // Tier 1 — strict equality (existing CORP-02 behaviour)
  if (ENTITY_ALLOWLIST.names.has(n)) return false
  // Tier 2 — case-insensitive substring fallback against source corpus
  if (SOURCE_CORPUS_LOWERCASE.includes(n.toLowerCase())) return false
  return true
})
```

KB IDs and URLs paths unchanged (case-sensitive).

## Tests added (7 new, all in src/chat/__tests__/allowlist.test.ts)

| Test | Verifies |
|---|---|
| `passes "Knowledge Base"` | Title-case variant of source `"Knowledge base"` → Tier 2 substring match |
| `passes "Subject Matter"` | Title-case variant of `"Subject matter expert"` → Tier 2 |
| `passes "Resolution Field"` | Tier 2 substring match works on multi-casing source term |
| `passes "Configuration Item"` | Already passes Tier 1 (source has title-case); regression check that Tier 2 doesn't break it |
| `STILL FAILS on "Acme Corporation"` | Fabricated name not in corpus in any casing → invariant preserved |
| `STILL FAILS on "Jane Doe"` | Original CORP-02 fabricated-approver test under new logic |
| `counts multiple bad names correctly when mixed` | "Knowledge Base" passes via Tier 2, "Acme Corporation" and "Jane Doe" fail — tokenCount: 2 |

NAME_RE regex behaviour subtlety (worth flagging for future maintainers): in PowerShell-style text like `"The Subject Matter expert"`, NAME_RE matches `"The Subject"` (sentence-initial title-case bigram) first because the regex is greedy left-to-right. The "Subject Matter" substring never gets captured because `lastIndex` advances past it. The new tests are phrased to avoid preceding title-case words for clean isolation of the bigram under test. Comments in the test file document this constraint.

## Confirmed invariants

- `git diff HEAD~1 HEAD -- src/grounding/validator.ts` is empty.
- `git diff HEAD~1 HEAD -- src/llm/` is empty — no LLM-layer changes.
- `git diff HEAD~1 HEAD -- src/app/api/chat/` is empty — route handler unchanged.
- KB ID and URL checks behave identically.
- All 773 pre-existing tests pass.
- `pnpm typecheck` clean.

## Test counts

| Scope | Before | After | Delta |
|---|---|---|---|
| `src/chat/__tests__/allowlist.test.ts` | 7 | 14 | +7 |
| Whole suite | 773 | 780 | +7 |

## Expected production impact

Live Phase B data showed 7/14 = 50% allowlist_violation failures. All 7 had `class: "names"` with `token_count: 1-3`. Reviewing the 7 failing question hashes against expected source content, every failing name token was almost certainly a title-case variant of a source-mentioned term (Subject Matter, Knowledge Base, Configuration Item, etc.). With Tier 2 in place:

- Tier 2 fall-through allows: title-case variants of source terms (the actual false positives)
- Tier 2 still blocks: fabricated names not in corpus (the CORP-02 threat)

Projected pass rate on the Author chip suite under Opus 4.6 + Quick 009 + Quick 011: **85%+** (from baseline 50% → up by retiring the false-positive surface).

## Deviations from plan

One test required a second iteration: the initial `"The Subject Matter expert..."` phrasing failed because NAME_RE captures `"The Subject"` greedy-left, not `"Subject Matter"`. The corpus contains `"the subject matter expert"` lowercase (so the latter would Tier-2-pass), but `"the subject"` as a standalone phrase doesn't appear. Reworded the test to `"Each article documents the Subject Matter expert assignment."` — phrased so NAME_RE captures cleanly on `"Subject Matter"`. Added an inline comment to flag this constraint for future test authors.

## Push status

To be pushed by orchestrator after this commit lands.

## Follow-up

- **Quick 012 candidate** — provider logging in the `chat_request_completed` event. Currently no log line indicates whether the request was dispatched to the OpenAI or Anthropic adapter; we inferred it from token counts and latency. One-line addition to `src/app/api/chat/route.ts`.
- **Quick 013 candidate** — Bedrock prompt caching via `cache_control` on the tools array. Now that we're sending 6125 prompt tokens consistently and the tools array is stable, caching the system prompt + tools would cut cost ~10x on cache hits.
- **Quick 014 candidate** — stochastic regression eval (the unchanged candidate from prior STATE.md).
- **Quick 015 candidate** — GHA deploy.yml audit (the unchanged candidate).

## Operator action

After pull + rebuild + restart, fire the failing question hashes from the previous test run (1b22b8...8a, 676ca8...ae, 38f6f3...5e, 21b04f...79) and verify pass rate improves to ≥85%. The failure pattern should shift from `allowlist_violation` to either success or (rarely) a genuine fabricated-name catch.
