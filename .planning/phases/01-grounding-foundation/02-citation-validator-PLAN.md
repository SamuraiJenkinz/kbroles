---
plan: 2
name: citation-validator
phase: 1
wave: 2
depends_on: [1]
files_modified:
  - src/grounding/validator.ts
  - src/grounding/fallback.ts
  - src/grounding/__tests__/validator.test.ts
autonomous: true

must_haves:
  truths:
    - "validateCitations(response, registry) returns a KbResponse with all citations that failed quote-substring validation stripped"
    - "Fabricated source_id is stripped; fabricated section_id is stripped; fabricated quote is stripped (case-sensitive, whitespace-normalised)"
    - "Verbatim quote from the registry passes (even when the quote in the response has different whitespace/line-wrapping from the registry body)"
    - "If can_answer is false on input, citations are forced to [] and answer/can_answer are preserved unchanged — no citation validation is performed, no fallback flip occurs (defensive: schema contract requires can_answer=false → citations=[], and the validator enforces this even if the model sends citations)"
    - "If can_answer is true and ALL citations are stripped, the response is flipped: answer replaced with FALLBACK_STRING verbatim, can_answer set to false, citations set to []"
    - "If MORE than one valid citation survives, only the FIRST is kept (GRND-04 enforcement)"
    - "Each stripped citation is recorded on the result's `_flips` diagnostic array (source_id, section_id, reason)"
    - "pnpm test -- src/grounding/__tests__/validator.test.ts passes all 10+ cases; pnpm tsc --noEmit clean"
  artifacts:
    - path: "src/grounding/validator.ts"
      provides: "validateCitations(response, registry) pure function + FLIP_REASON enum"
      exports: ["validateCitations", "ValidationResult", "FallbackFlip"]
    - path: "src/grounding/fallback.ts"
      provides: "FALLBACK_STRING constant — handover §15 copy verbatim"
      exports: ["FALLBACK_STRING"]
    - path: "src/grounding/__tests__/validator.test.ts"
      provides: "Unit tests across all validator branches with inline fixture registries"
  key_links:
    - from: "src/grounding/validator.ts"
      to: "src/grounding/registry.ts"
      via: "validateCitations takes registry as parameter (not imported singleton)"
      pattern: "validateCitations\\([^,]+,\\s*registry"
    - from: "src/grounding/validator.ts"
      to: "src/grounding/schema.ts"
      via: "imports KbResponse and Citation types"
      pattern: "import.*KbResponse.*from.*schema"
    - from: "src/grounding/validator.ts"
      to: "src/grounding/fallback.ts"
      via: "imports FALLBACK_STRING, uses on total-strip flip"
      pattern: "FALLBACK_STRING"
---

<objective>
Implement the deterministic server-side citation validator — the single piece of code that prevents hallucinated citations from reaching the user. Pure function, no I/O, parameter-injected registry, exhaustive tests. This is Pitfall #2's primary mitigation and is the core of Phase 1 Success Criterion #2.

Purpose: Block "plausible but hallucinated" citations cheaply without an LLM-judge second pass (ARCHITECTURE.md §4.2). The quote-substring check kills the failure mode where the model's answer is right but the cited section does not actually contain the quote.

Output: `validateCitations` function + `FALLBACK_STRING` constant + comprehensive unit test coverage.
</objective>

<context>
Depends on Plan 01 outputs. Before starting, read:

@.planning/phases/01-grounding-foundation/01-CONTEXT.md  (§2 Citation & validator contract — AUTHORITATIVE)
@.planning/phases/01-grounding-foundation/01-RESEARCH.md  (Gap 5 — validator algorithm, 6 edge cases)
@.planning/phases/01-grounding-foundation/01-scaffold-registry-schema-PLAN.md  (what was built in Plan 01)
@src/grounding/schema.ts  (KbResponse, Citation, SourceId types — USE THESE, do not redefine)
@src/grounding/registry.ts  (Registry type — parameter to validator)
@info/KB_Assistant_ClaudeCode_Handover.md  (§15 Grounded Response Architecture — fallback copy verbatim)

**Validator behaviour (locked in CONTEXT.md §2):**
1. If `can_answer === false` → skip citation validation; preserve `answer` and `can_answer`; force `citations: []`. The schema contract (CONTEXT.md §2) requires `can_answer=false → citations=[]`, so the validator defensively zeroes the array even when the model disobeys — there is no case where we want to surface citations alongside an "I can't answer" response.
2. Else for each citation: check `source_id` exists → section with matching `section_id` exists in that source → section body includes `quote` (whitespace-normalised substring, case-sensitive).
3. Failed citations are STRIPPED (not whole-response rejection). Log each strip.
4. If all citations stripped AND `can_answer === true` → FLIP: replace answer with FALLBACK_STRING, set `can_answer: false`, `citations: []`.
5. If >1 valid citation survives, keep only the first (GRND-04).

**Quote-match strictness:** Verbatim substring, whitespace normalisation only (runs of whitespace → single space, trim), case-sensitive, no punctuation folding.
</context>

<tasks>

<task id="2.1" type="auto" verify="test -f src/grounding/fallback.ts && pnpm tsc --noEmit">
  <name>Task 2.1: Define FALLBACK_STRING constant</name>
  <files>src/grounding/fallback.ts</files>
  <action>
    Create `src/grounding/fallback.ts`. The exact text comes from handover §15 Grounded Response Architecture and is quoted verbatim in PROJECT.md Active Requirements:

    > "That information isn't in the loaded documents yet. Flag the gap to the CTSS Knowledge team via KB0022991."

    ```ts
    /**
     * Out-of-scope fallback string — handover §15 Grounded Response Architecture,
     * also quoted in PROJECT.md Active Requirements and REQUIREMENTS.md FBK-01.
     *
     * This is the single source of truth for the fallback copy. The system prompt,
     * the validator (on total-strip flip), and the chat UI (FBK-01) all reference
     * this constant — do NOT hard-code the string anywhere else.
     */
    export const FALLBACK_STRING =
      "That information isn't in the loaded documents yet. Flag the gap to the CTSS Knowledge team via KB0022991."
    ```

    No tests for this file on its own — it is asserted via the validator tests (Task 2.3).
  </action>
  <verify>
    - `test -f src/grounding/fallback.ts`
    - `pnpm tsc --noEmit` exits 0
  </verify>
  <done>Single source of truth for fallback copy exists.</done>
</task>

<task id="2.2" type="auto" verify="pnpm tsc --noEmit">
  <name>Task 2.2: Implement validateCitations</name>
  <files>src/grounding/validator.ts</files>
  <action>
    Create `src/grounding/validator.ts`:

    ```ts
    import type { KbResponse, Citation, SourceId } from '@/grounding/schema'
    import type { Registry, Source } from '@/grounding/registry'
    import { FALLBACK_STRING } from '@/grounding/fallback'

    export type FlipReason =
      | 'unknown_source_id'
      | 'unknown_section_id'
      | 'quote_not_in_body'
      | 'trimmed_excess_citation'

    export interface FallbackFlip {
      source_id: string
      section_id: string
      reason: FlipReason
    }

    export interface ValidationResult extends KbResponse {
      /**
       * Diagnostic record of every citation the validator stripped.
       * Phase 2 will log this on the server per request.
       * Not part of the LLM response contract — prefixed `_` to signal non-wire.
       */
      _flips: FallbackFlip[]
    }

    /**
     * Normalise whitespace for quote-matching: collapse runs of whitespace to
     * single space, trim. Case-sensitive, no punctuation folding. Matches how
     * humans transcribe quotes from rendered markdown (line-wrap insensitive)
     * without loosening the contract enough to let paraphrases through.
     */
    function normalise(s: string): string {
      return s.replace(/\s+/g, ' ').trim()
    }

    function quoteExistsInBody(quote: string, body: string): boolean {
      return normalise(body).includes(normalise(quote))
    }

    function findSourceForId(registry: Registry, id: string): Source | undefined {
      // Guarded lookup — `id` comes from the LLM and may not be a valid SourceId key.
      return (registry as Record<string, Source | undefined>)[id]
    }

    /**
     * Validate citations against the registry.
     * - Pass-through answer/can_answer when can_answer is false; citations forced to [].
     * - Strip citations whose source_id / section_id / quote can't be verified.
     * - On total strip with can_answer true → flip to fallback.
     * - If >1 valid citation survives, keep only the first (GRND-04).
     */
    export function validateCitations(
      response: KbResponse,
      registry: Registry
    ): ValidationResult {
      const flips: FallbackFlip[] = []

      // Rule 1: can_answer=false — skip citation validation. Preserve answer
      // and can_answer; force citations to [] defensively. The schema contract
      // (CONTEXT.md §2) requires can_answer=false → citations=[], so if the
      // model emitted citations alongside can_answer=false they are contract
      // violations and we never want to surface them. This is NOT a flip — we
      // do not rewrite answer or toggle can_answer.
      if (response.can_answer === false) {
        return { ...response, citations: [], _flips: flips }
      }

      // Rule 2: validate each citation.
      const survivors: Citation[] = []
      for (const cite of response.citations) {
        const source = findSourceForId(registry, cite.source_id)
        if (!source) {
          flips.push({
            source_id: cite.source_id,
            section_id: cite.section_id,
            reason: 'unknown_source_id',
          })
          continue
        }
        const section = source.sections.find(s => s.id === cite.section_id)
        if (!section) {
          flips.push({
            source_id: cite.source_id,
            section_id: cite.section_id,
            reason: 'unknown_section_id',
          })
          continue
        }
        if (!quoteExistsInBody(cite.quote, section.body)) {
          flips.push({
            source_id: cite.source_id,
            section_id: cite.section_id,
            reason: 'quote_not_in_body',
          })
          continue
        }
        survivors.push({
          source_id: cite.source_id as SourceId,
          section_id: cite.section_id,
          quote: cite.quote,
        })
      }

      // Rule 3: total strip → fallback flip.
      if (survivors.length === 0) {
        return {
          can_answer: false,
          answer: FALLBACK_STRING,
          citations: [],
          _flips: flips,
        }
      }

      // Rule 4: enforce GRND-04 (≤1 citation) — keep only the first.
      if (survivors.length > 1) {
        for (let i = 1; i < survivors.length; i++) {
          flips.push({
            source_id: survivors[i].source_id,
            section_id: survivors[i].section_id,
            reason: 'trimmed_excess_citation',
          })
        }
      }

      return {
        can_answer: true,
        answer: response.answer,
        citations: [survivors[0]],
        _flips: flips,
      }
    }
    ```
  </action>
  <verify>`pnpm tsc --noEmit` exits 0 — no type errors.</verify>
  <done>Pure function implemented; no tests yet.</done>
</task>

<task id="2.3" type="auto" verify="pnpm test -- src/grounding/__tests__/validator.test.ts">
  <name>Task 2.3: Exhaustive validator tests with inline fixture registries</name>
  <files>src/grounding/__tests__/validator.test.ts</files>
  <action>
    Create `src/grounding/__tests__/validator.test.ts`. Use inline fixture registries — do NOT import the real REGISTRY (per RESEARCH.md Gap 1 "Inject the registry as a parameter").

    ```ts
    import { describe, it, expect } from 'vitest'
    import { validateCitations } from '@/grounding/validator'
    import type { Registry } from '@/grounding/registry'
    import type { KbResponse } from '@/grounding/schema'
    import { FALLBACK_STRING } from '@/grounding/fallback'

    // Minimal fixture registry — keep bodies small and verbatim-testable.
    const FIXTURE: Registry = {
      KB0020882: {
        id: 'KB0020882',
        title: 'Submit New/Update Technical Knowledge Article SOP',
        version: '9.0',
        url: 'https://mmcnow.service-now.com/kb_view.do?sysparm_article=KB0020882',
        sections: [
          {
            id: 'naming-convention',
            title: 'Article Naming Convention',
            body: 'Titles must follow the four-part format: [Application] - [Type] - [OPCO] - [Region], limited to 160 characters total.',
          },
        ],
      },
      KB0022991: {
        id: 'KB0022991',
        title: 'Technical Knowledge Base Article Management SOP',
        version: '13.0',
        url: 'https://mmcnow.service-now.com/kb_view.do?sysparm_article=KB0022991',
        sections: [
          {
            id: 'flagging-articles',
            title: 'Flagging Articles',
            body: 'Click the Flag Article button in the article header, enter a reason, and submit the flag.',
          },
          {
            id: 'approvers',
            title: 'Publishing Approvers',
            // Multi-line body to exercise whitespace normalisation
            body: 'Authorised approvers include:\n- Richard Danilowicz\n- Samantha Eaton\n- Matthew Renner',
          },
        ],
      },
      SNOW_FORM: {
        id: 'SNOW_FORM',
        title: 'ServiceNow Technical Knowledge Article Form',
        version: 'live',
        url: 'https://mmcnow.service-now.com/kb_view.do?sysparm_article=KB18801781',
        sections: [
          {
            id: 'required-fields',
            title: 'Required Fields',
            body: 'Required fields: Knowledge Base, Category, Short description, Article body.',
          },
        ],
      },
    }

    const goodResponse: KbResponse = {
      can_answer: true,
      answer: 'Click Flag Article in the article header.',
      citations: [{
        source_id: 'KB0022991',
        section_id: 'flagging-articles',
        quote: 'Click the Flag Article button in the article header',
      }],
    }

    describe('validateCitations — pass-through', () => {
      it('can_answer=false passes through untouched (no citation processing)', () => {
        const response: KbResponse = {
          can_answer: false,
          answer: FALLBACK_STRING,
          citations: [],
        }
        const result = validateCitations(response, FIXTURE)
        expect(result.can_answer).toBe(false)
        expect(result.answer).toBe(FALLBACK_STRING)
        expect(result.citations).toEqual([])
        expect(result._flips).toEqual([])
      })

      it('can_answer=false drops any citations the model sent (should be empty but be defensive)', () => {
        const response: KbResponse = {
          can_answer: false,
          answer: FALLBACK_STRING,
          citations: [{ source_id: 'KB0022991', section_id: 'flagging-articles', quote: 'whatever' }],
        }
        const result = validateCitations(response, FIXTURE)
        expect(result.citations).toEqual([])
      })
    })

    describe('validateCitations — good citation', () => {
      it('passes a verbatim-quoted citation through', () => {
        const result = validateCitations(goodResponse, FIXTURE)
        expect(result.can_answer).toBe(true)
        expect(result.citations).toHaveLength(1)
        expect(result.citations[0].section_id).toBe('flagging-articles')
        expect(result._flips).toEqual([])
      })

      it('passes a citation whose quote has different whitespace from registry body', () => {
        // Registry body: "Authorised approvers include:\n- Richard Danilowicz\n- Samantha Eaton\n..."
        // Model quote with different whitespace but same substring after normalisation:
        const response: KbResponse = {
          can_answer: true,
          answer: 'The approvers are listed in KB0022991.',
          citations: [{
            source_id: 'KB0022991',
            section_id: 'approvers',
            quote: 'Authorised approvers include: - Richard Danilowicz - Samantha Eaton',
          }],
        }
        const result = validateCitations(response, FIXTURE)
        expect(result.citations).toHaveLength(1)
        expect(result._flips).toEqual([])
      })
    })

    describe('validateCitations — strip cases', () => {
      it('strips fabricated quote (not a substring of body)', () => {
        const response: KbResponse = {
          ...goodResponse,
          citations: [{
            source_id: 'KB0022991',
            section_id: 'flagging-articles',
            quote: 'This text does not appear in the body anywhere',
          }],
        }
        const result = validateCitations(response, FIXTURE)
        // All stripped → fallback flip
        expect(result.can_answer).toBe(false)
        expect(result.answer).toBe(FALLBACK_STRING)
        expect(result.citations).toEqual([])
        expect(result._flips).toHaveLength(1)
        expect(result._flips[0].reason).toBe('quote_not_in_body')
      })

      it('strips fabricated section_id', () => {
        const response: KbResponse = {
          ...goodResponse,
          citations: [{
            source_id: 'KB0022991',
            section_id: 'section-that-does-not-exist',
            quote: 'Click the Flag Article button',
          }],
        }
        const result = validateCitations(response, FIXTURE)
        expect(result.can_answer).toBe(false)
        expect(result.answer).toBe(FALLBACK_STRING)
        expect(result._flips[0].reason).toBe('unknown_section_id')
      })

      it('strips fabricated source_id', () => {
        const response: KbResponse = {
          ...goodResponse,
          citations: [{
            source_id: 'KB_FAKE' as any,
            section_id: 'flagging-articles',
            quote: 'Click the Flag Article button',
          }],
        }
        const result = validateCitations(response, FIXTURE)
        expect(result.can_answer).toBe(false)
        expect(result.answer).toBe(FALLBACK_STRING)
        expect(result._flips[0].reason).toBe('unknown_source_id')
      })

      it('strips a citation whose quote differs only by capitalisation (case-sensitive)', () => {
        const response: KbResponse = {
          ...goodResponse,
          citations: [{
            source_id: 'KB0022991',
            section_id: 'flagging-articles',
            quote: 'click the flag article button',  // lowercase — should fail
          }],
        }
        const result = validateCitations(response, FIXTURE)
        expect(result.can_answer).toBe(false)
        expect(result._flips[0].reason).toBe('quote_not_in_body')
      })

      it('strips a paraphrased quote (not verbatim)', () => {
        const response: KbResponse = {
          ...goodResponse,
          citations: [{
            source_id: 'KB0022991',
            section_id: 'flagging-articles',
            quote: 'Press Flag Article button in header',  // paraphrase — should fail
          }],
        }
        const result = validateCitations(response, FIXTURE)
        expect(result.can_answer).toBe(false)
        expect(result._flips[0].reason).toBe('quote_not_in_body')
      })
    })

    describe('validateCitations — GRND-04 (≤1 citation)', () => {
      it('trims to one when multiple valid citations survive', () => {
        const response: KbResponse = {
          can_answer: true,
          answer: 'See both sections.',
          citations: [
            { source_id: 'KB0022991', section_id: 'flagging-articles', quote: 'Click the Flag Article button' },
            { source_id: 'SNOW_FORM', section_id: 'required-fields', quote: 'Required fields: Knowledge Base' },
          ],
        }
        const result = validateCitations(response, FIXTURE)
        expect(result.can_answer).toBe(true)
        expect(result.citations).toHaveLength(1)
        expect(result.citations[0].section_id).toBe('flagging-articles') // first one kept
        expect(result._flips).toHaveLength(1)
        expect(result._flips[0].reason).toBe('trimmed_excess_citation')
      })

      it('mixed case: one valid, one fabricated — valid kept, fabricated logged', () => {
        const response: KbResponse = {
          can_answer: true,
          answer: 'See these.',
          citations: [
            { source_id: 'KB0022991', section_id: 'flagging-articles', quote: 'Click the Flag Article button' },
            { source_id: 'KB0022991', section_id: 'flagging-articles', quote: 'FABRICATED' },
          ],
        }
        const result = validateCitations(response, FIXTURE)
        expect(result.citations).toHaveLength(1)
        expect(result.citations[0].quote).toBe('Click the Flag Article button')
        expect(result._flips).toHaveLength(1)
        expect(result._flips[0].reason).toBe('quote_not_in_body')
      })
    })

    describe('validateCitations — edge: empty citations array on can_answer true', () => {
      it('treats empty citations as total-strip → fallback flip', () => {
        const response: KbResponse = { can_answer: true, answer: 'Some answer.', citations: [] }
        const result = validateCitations(response, FIXTURE)
        expect(result.can_answer).toBe(false)
        expect(result.answer).toBe(FALLBACK_STRING)
        expect(result.citations).toEqual([])
      })
    })
    ```
  </action>
  <verify>
    - `pnpm test -- src/grounding/__tests__/validator.test.ts` passes all ~12 test cases
    - No test flakiness (run twice if unsure — results must be deterministic)
  </verify>
  <done>Validator tested end-to-end; all branches covered including the critical fabricated-quote case.</done>
</task>

<task id="2.4" type="auto" verify="pnpm test && pnpm tsc --noEmit">
  <name>Task 2.4: Full suite green + commit</name>
  <files>(none — verification + git)</files>
  <action>
    Run the full test suite (including Plan 01's tests, which should still pass):

    ```bash
    pnpm test
    pnpm tsc --noEmit
    ```

    All five test files should now pass: schema, registry, entities, validator. (Plan 01 owned the first three; this plan owns the fourth.)

    Commit:

    ```bash
    git add src/grounding/validator.ts src/grounding/fallback.ts src/grounding/__tests__/validator.test.ts .planning/phases/01-grounding-foundation/02-citation-validator-PLAN.md
    git commit -m "feat(phase-1/plan-02): citation quote-substring validator

    - validateCitations(response, registry) strips unknown source_id, unknown
      section_id, and quote-not-in-body citations
    - Whitespace-normalised substring match, case-sensitive (verbatim contract)
    - On total strip with can_answer=true → flip to FALLBACK_STRING
    - can_answer=false path preserves answer/can_answer; forces citations=[]
      defensively (schema requires can_answer=false → citations=[])
    - Enforces GRND-04 (≤1 citation) — trims excess after validation
    - Diagnostic _flips array records every strip for Phase 2 logging
    - 12 test cases: good citations, fabricated quote/section/source, whitespace
      tolerance, case-sensitivity, paraphrase rejection, multi-citation trim,
      mixed valid/invalid, empty-citations fallback

    GRND-03 (server-side quote-substring validation).
    Pitfall #2 (citation drift) primary mitigation ships here."
    ```
  </action>
  <verify>
    - `pnpm test` exits 0 with all four suites green
    - `pnpm tsc --noEmit` exits 0
    - `git log -1 --oneline` shows the Plan 02 commit
  </verify>
  <done>Validator committed; downstream plans can import `validateCitations` and `FALLBACK_STRING`.</done>
</task>

</tasks>

<verification>
- `pnpm test -- src/grounding/__tests__/validator.test.ts` — 12 cases pass
- `pnpm test` — all four suites (schema, registry, entities, validator) green
- `pnpm tsc --noEmit` — clean
- Phase 1 Success Criterion #2 is now verifiable: "Quote-substring validator rejects fabricated `quote`, passes verbatim `quote` from source registry" ✓
</verification>

<success_criteria>
- All must_haves true
- `validateCitations`, `FALLBACK_STRING`, `ValidationResult`, `FallbackFlip`, `FlipReason` exported from `@/grounding/validator` and `@/grounding/fallback`
- No regression in Plan 01's tests
- Commit in git history
</success_criteria>

<out_of_scope>
- **SSE streaming / mid-stream citation handling** → Phase 2 (GRND-07). Validator runs at response completion in Phase 2; Phase 1 just proves the logic.
- **Entity allowlist POST-CHECK on response content** → Phase 2 (CORP-02). The allowlist was EXTRACTED in Plan 01; its USE ships in Phase 2.
- **Logging `_flips` to structured logs** → Phase 2 (the `/api/chat` route will log `{ request_id, role, validator_flips, ... }`).
- **Integration with an actual LLM response** → Plans 03 (client) and 05 (smoke) tie it together.
</out_of_scope>

<pitfall_watch>
- **Pitfall #2 (citation drift):** This validator is the primary mitigation. The quote-substring check is the deterministic gate; the test suite has explicit cases for fabricated quote, fabricated section, fabricated source, and paraphrase rejection.
- **Whitespace tolerance:** CONTEXT.md §2 explicitly calls for whitespace normalisation on both sides. The test `passes a citation whose quote has different whitespace from registry body` locks this behaviour.
- **Case sensitivity is a feature:** The test `strips a citation whose quote differs only by capitalisation` asserts this intentionally — capitalisation drift is a signal the model is citing from memory, not from the text.
</pitfall_watch>
