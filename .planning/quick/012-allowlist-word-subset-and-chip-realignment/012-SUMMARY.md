---
quick: 012
title: Allowlist Tier 3 word-subset + auth-02 chip text realignment
date: 2026-05-12
commit: 288c60c
subsystem: chat + prompts
tags: [allowlist, chip, anthropic, claude, opus, false-positive-reduction, paraphrase-prevention]

dependency-graph:
  requires: [quick-009, quick-011]
  provides: closes the residual 30% allowlist failure rate on chip auth-02 in Phase B production data
  affects: []

tech-stack:
  added: []
  patterns:
    - "two-layer fix: prevention (chip rewording) + recovery (Tier 3 fallback)"
    - "word-subset check preserves the CORP-02 fabricated-name guard via .every() short-circuit"
    - "shifted threat model — strict-tools + validator carry primary enforcement; allowlist is final belt-and-suspenders"

key-files:
  created:
    - .planning/quick/012-allowlist-word-subset-and-chip-realignment/012-PLAN.md
    - .planning/quick/012-allowlist-word-subset-and-chip-realignment/012-SUMMARY.md
  modified:
    - src/prompts/suggested.ts
    - src/chat/allowlist.ts
    - src/chat/__tests__/allowlist.test.ts

decisions:
  - id: ship-both-layers
    choice: "Update the chip text AND add the Tier 3 fallback in the same Quick"
    rationale: "The chip rewrite alone reduces the failure rate by eliminating the specific paraphrase pattern. Tier 3 alone fixes any unforeseen instances of the same general class. Together they're prevention + recovery — operator gets both immediate-impact-with-no-code-redeploy AND robustness against future chip authors using similar terminology."
    alternatives: ["chip-only fix — would solve auth-02 specifically but leave the broader class of issues unaddressed", "Tier 3-only fix — works but leaves the chip text suboptimal for prompt engineering reasons"]

  - id: substring-not-word-boundary
    choice: "Tier 3 checks each constituent word as a substring (.includes), not as a tokenised word match"
    rationale: "Source text contains compound words like 'ServiceNow', 'markdown', 'screenshots' that the model commonly splits or re-segments. Substring matching on individual words allows 'Service Now' to match 'ServiceNow', 'Mark Down' to match 'markdown', etc. — handling the compound-word-split failure pattern alongside the named-bigram case."
    alternatives: ["regex word-boundary match — would miss compound splits; less permissive but more brittle"]

  - id: dont-edit-handover-doc
    choice: "Update chip text in src/prompts/suggested.ts only; leave info/KB_Assistant_ClaudeCode_Handover.md for the operator to update separately"
    rationale: "info/ is untracked per .gitignore — operator-local documentation outside the repo's commit history. The chip file's header notes the handover is the upstream source of truth, so updates there should be authored deliberately by the operator with full handover-document context. The inline comment in src/prompts/suggested.ts auth-02 flags this for the next handover revision."
    alternatives: ["edit both — but info/ files are operator-managed and not part of this code change's scope"]

  - id: keep-original-tier-1-and-tier-2-untouched
    choice: "Tier 3 is purely additive — Tier 1 strict equality and Tier 2 substring check are unchanged"
    rationale: "Same rationale as Quick 011's additive design: every request that passed Tier 1 or Tier 2 yesterday continues to pass via the same path today. Tier 3 only converts previously-failing requests into passes. No existing pass becomes a fail. Backward compatibility is automatic."
    alternatives: []

metrics:
  duration: "~30 minutes"
  completed: 2026-05-12
  files_changed: 3
  new_tests: 4
  test_count_before: 780
  test_count_after: 784
  new_dependencies: 0
---

# Quick Task 012: Allowlist Tier 3 + chip auth-02 realignment

**One-liner:** Closes the residual 30% Phase B failure rate on chip auth-02 with two coordinated changes — (a) rewrite the chip from "article structure" to "article body format" (source-aligned wording, reduces paraphrase incidence), and (b) add a Tier 3 word-subset fallback to the entity-allowlist so future similar paraphrases pass without code changes.

## Commit

| Field | Value |
|---|---|
| Hash | `288c60c` |
| Subject | `feat(allowlist+chip): Tier 3 word-subset fallback + auth-02 chip realignment` |
| Branch | `master` |
| Co-Author | `Claude Opus 4.7 (1M context) <noreply@anthropic.com>` |

## How this surfaced

Phase B production data after Quick 011 shipped, on D:\kbroles + LLM_PROVIDER=anthropic + ANTHROPIC_MODEL=eu.anthropic.claude-opus-4-6-v1 (2026-05-12):

| Result | Count (of 10) |
|---|---|
| ✅ PASS | 7 (70%) |
| ❌ `allowlist_violation` (names, 1 token) | 3 (30%) |
| ❌ `quote_not_in_body` | 0 |

All 3 failures on the same `question_hash: 676ca81e36b850ae`. Operator confirmed: that's chip `auth-02` (`src/prompts/suggested.ts:65`), text `"What's the naming convention and article structure?"`.

Source-corpus diagnostic:
- `grep -oiE "article structure" src/grounding/sources/*.md` → **0 matches** (no casing)
- `grep -oiE "article body" src/grounding/sources/*.md` → 4+ matches (multiple casings)
- `grep -oi "structure" src/grounding/sources/*.md` → 1 match (standalone)
- `grep -oi "article" src/grounding/sources/*.md` → many matches

Claude is echoing the chip's `"article structure"` wording back into its answer as title-case `"Article Structure"`. The bigram doesn't exist in source, so Quick 011's Tier 2 substring fallback can't help — there's no substring to match. The constituent words DO exist in source separately, but Quick 011 didn't have a word-level check.

## Two layers shipped

### 1. Chip rewrite — `src/prompts/suggested.ts`

```diff
-      label: "What's the naming convention and article structure?",
-      text:  "What's the naming convention and article structure?",
+      label: "What's the naming convention and article body format?",
+      text:  "What's the naming convention and article body format?",
```

`"article body"` is verbatim in `servicenow-form.md` ("## Article Body Field" + prose). `"format"` appears in all three sources. Claude has no incentive to construct a non-source bigram when the source-aligned wording is right there in the question.

Inline comment flags that the upstream `info/KB_Assistant_ClaudeCode_Handover.md §16` (untracked operator-managed handover doc) should be updated to match. Not auto-edited in this commit.

### 2. Allowlist Tier 3 — `src/chat/allowlist.ts`

After Tier 1 (strict equality, existing) and Tier 2 (substring, Quick 011), add Tier 3:

```typescript
const words = n.toLowerCase().split(/\s+/)
if (words.every(w => SOURCE_CORPUS_LOWERCASE.includes(w))) return false
```

Splits the answer-side bigram on whitespace, checks each constituent word as a substring of the lowercased corpus. Allows model-paraphrased title-case bigrams that combine source vocabulary into a phrase the source doesn't use verbatim.

**CORP-02 invariant preserved** via `.every()` short-circuit: `"Jane Doe"` fails because `"jane"` is absent from the corpus (the `.every()` returns false on the first miss, short-circuiting without even checking `"doe"`). Same for `"Acme Corporation"` — `"acme"` is genuinely absent.

## Tests added (4 new, all in `src/chat/__tests__/allowlist.test.ts`)

| Test | Verifies |
|---|---|
| `"Article Structure" passes` | The Phase B chip auth-02 failure pattern is now allowed (both `article` + `structure` in source separately) |
| `"Service Now" passes` | Compound-word-split case (`servicenow` provides both `service` + `now` as substrings) — handles the related failure mode |
| `"Jane Doe" still fails` | CORP-02 invariant: `jane` is absent → `.every()` short-circuits → name fails |
| `"Acme Corporation" still fails` | CORP-02 invariant: `acme` is absent → name fails |

## Confirmed invariants

- `git diff HEAD~1 HEAD -- src/grounding/` is empty — no source/registry/validator changes.
- `git diff HEAD~1 HEAD -- src/llm/` is empty — no adapter changes.
- `git diff HEAD~1 HEAD -- src/app/api/` is empty — no route handler changes.
- `git diff HEAD~1 HEAD -- src/chat/concurrency.ts` empty, no semaphore changes.
- Prompts route test still passes (asserts on chip IDs only, not text).
- 780 pre-existing tests pass.
- `pnpm typecheck` clean.

## Test counts

| Scope | Before | After | Delta |
|---|---|---|---|
| `src/chat/__tests__/allowlist.test.ts` | 14 | 18 | +4 |
| Whole suite | 780 | 784 | +4 |

## Expected production impact

Phase B data: 3/10 failures, all on chip auth-02. With Quick 012:

- **Chip rewrite alone**: Claude no longer has the "article structure" terminology nudge — the chip says "article body format". Claude either uses verbatim source phrasings (Tier 1 pass) or a slight variant (Tier 2 / Tier 3 pass).
- **Tier 3 alone**: Even if the chip wording stayed, Tier 3 catches "Article Structure" because both `article` and `structure` are in source.
- **Both together**: Belt-and-suspenders. Projected pass rate: ≥90% on the failing chip.

Projected overall Author chip pass rate after Quick 012: 80-90% (from 70% with Quick 011, from 50% with strict-tools alone, from 0% on gpt-4o-mini production).

## Deviations from plan

None. Implementation went smoothly.

## Push status

To be pushed by orchestrator after this commit lands.

## Operator action

After pull + rebuild + restart:

```powershell
cd D:\kbroles
schtasks /end /tn KbAssistant
git pull
pnpm build
Copy-Item -Recurse -Force .next\static .next\standalone\.next\
schtasks /run /tn KbAssistant
```

Then fire chip auth-02 (the now-reworded "naming convention and article body format" question) 5-10 times. Expected: ≥90% pass rate. The remaining failures (if any) would likely be `class: names` with phrases neither in source nor in source-vocabulary subsets — those are real fabrication catches.

**Optional follow-up:** update `info/KB_Assistant_ClaudeCode_Handover.md §16` to reflect the chip text change. The handover is operator-managed (untracked file); update at your discretion.

## Follow-up

Open follow-ups (renumbered):

- **Quick 013 candidate** — provider logging on `chat_request_completed` event (1-line addition to route.ts; observability gap surfaced when we had to infer Anthropic-vs-OpenAI from token counts and latency).
- **Quick 014 candidate** — Bedrock prompt caching via `cache_control` annotations (potential 10x cost reduction on cache hits at the current 6125 prompt-token volume + stable tools array; pending MGTI confirmation that cache_control passes through).
- **Quick 015 candidate** — stochastic regression eval (chip stability test fires each chip N=20 times, asserts ≥90% pass rate). With the allowlist now relatively forgiving, this gives a real metric for declaring the pilot stable.
- **Quick 016 candidate** — GHA deploy.yml audit (predates this work, still relevant).
- **Quick 017 candidate** — text-mode markdown-fence stripping (only if `ANTHROPIC_TOOLS_SUPPORTED=false` escape hatch is ever needed).
- **Quick 018 candidate** — wire `chip_id` from the client so `chip_vs_freeform` telemetry correctly identifies chip-driven requests as `"chip"` (Phase 3 deferred work).
