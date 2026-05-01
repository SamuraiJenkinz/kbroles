---
phase: quick-004
plan: 04
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/api/chat/route.ts
  - src/obs/telemetry.ts
  - src/app/api/chat/__tests__/route.test.ts
  - src/obs/__tests__/telemetry.test.ts
autonomous: true

must_haves:
  truths:
    - "When validator strips citations partially, the validator_flip event payload contains the per-citation flip details (source_id + section_id + reason)."
    - "When validator strips ALL citations and the route emits fallback_trigger with reason='all_citations_stripped', the event payload contains the per-citation flip details."
    - "Citation quote text NEVER appears in any flip payload (FallbackFlip interface in validator.ts is unchanged)."
    - "If a request produces more than 10 flips, the payload caps at 10 entries and includes flips_truncated=true."
    - "Existing chat-route + grounding + obs tests stay green (no behavior change to validator, fallback rendering, or UX)."
  artifacts:
    - path: "src/app/api/chat/route.ts"
      provides: "validator_flip and fallback_trigger(all_citations_stripped) trackEvent calls now include flips array."
      contains: "summarizeFlips"
    - path: "src/obs/telemetry.ts"
      provides: "trackEvent extended with optional 4th param `extras` for structured (non-AppInsights) fields that flow only to pino."
      exports: ["trackEvent"]
    - path: "src/app/api/chat/__tests__/route.test.ts"
      provides: "New test asserts flips array is passed to trackEvent on all_citations_stripped path."
    - path: "src/obs/__tests__/telemetry.test.ts"
      provides: "Existing telemetry tests stay green; new assertion that extras param flows to pino but NOT to OTel attributes."
  key_links:
    - from: "src/app/api/chat/route.ts:318 (validator_flip)"
      to: "validated._flips"
      via: "summarizeFlips(validated._flips, 10) → trackEvent extras param"
      pattern: "summarizeFlips\\(validated\\._flips"
    - from: "src/app/api/chat/route.ts:327 (fallback_trigger all_citations_stripped)"
      to: "validated._flips"
      via: "summarizeFlips(validated._flips, 10) → trackEvent extras param"
      pattern: "summarizeFlips\\(validated\\._flips"
    - from: "src/obs/telemetry.ts:trackEvent"
      to: "logger.info payload"
      via: "spreads extras into the pino log object only (not OTel span attrs)"
      pattern: "logger\\.info\\(.*\\.\\.\\.extras"
---

<objective>
Close a diagnostic gap in chat-route telemetry. Currently when the validator strips
citations — partial or total — the structured log only records the COUNT of strips
(`validator_flips: 1`). When suggested-prompt chips for the KB Author role land on
the `all_citations_stripped` fallback path, the operator cannot tell WHICH citations
the model fabricated (e.g. wrong source_id, wrong section_id, hallucinated quote)
without re-running the request locally.

The validator at `src/grounding/validator.ts` already builds `_flips: FallbackFlip[]`
on every call, where each flip has `{source_id, section_id, reason}` — quote text is
deliberately excluded. The chat route currently consumes only `_flips.length` and
discards the array.

This plan adds the flip details to two existing trackEvent calls in
`src/app/api/chat/route.ts` (the `validator_flip` event and the
`fallback_trigger` event with `reason: 'all_citations_stripped'`), with a defensive
length cap of 10 entries and a `flips_truncated: true` marker when the cap fires.

Behavior of validator, fallback rendering, allowlist post-check, SSE frame ordering,
and UX is UNCHANGED. Only the structured-log/event payloads gain new diagnostic fields.

Purpose: Operator can read App Insights / pino logs and see exactly which citations
the model invented, without re-running the request. Drives KB-author-role debugging
of suggested-prompt chips that land on the fallback path.

Output: A single commit on master. The deploy is operator-controlled and out of scope.
</objective>

<execution_context>
@C:\Users\taylo\.claude\get-shit-done\workflows\execute-plan.md
@C:\Users\taylo\.claude\get-shit-done\templates\summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md

# Direct dependencies for this change
@src/app/api/chat/route.ts
@src/grounding/validator.ts
@src/obs/telemetry.ts
@src/obs/eventSchema.ts
@src/app/api/chat/__tests__/route.test.ts
</context>

<discovery_findings>

## Key facts verified before planning (preserve in implementation)

1. **FallbackFlip type already excludes quote** (`src/grounding/validator.ts:11-15`):
   ```ts
   export interface FallbackFlip {
     source_id: string
     section_id: string
     reason: 'unknown_source_id' | 'unknown_section_id' | 'quote_not_in_body' | 'trimmed_excess_citation'
   }
   ```
   Do NOT modify this interface to include the quote. If you discover a previous
   modification adding quote, REVERT it in this commit.

2. **Validator exposes flips on every call** (`src/grounding/validator.ts:56-130`):
   The `_flips: FallbackFlip[]` array is built on every code path
   (can_answer=false path, partial-strip path, total-strip path, GRND-04 ≤1
   citation trim path) and returned in `ValidationResult`. The route already
   destructures `validated._flips.length` at line 312 — the full array is
   already in scope.

3. **Existing trackEvent contract DROPS non-string-non-number values**
   (`src/obs/telemetry.ts:48-76`). The current signature is:
   ```ts
   trackEvent(name, dimensions: Record<string, string|undefined>, measurements: Record<string, number>)
   ```
   At lines 60 and 66, only `typeof v === 'string' && v.length > 0` (dimensions)
   or `Number.isFinite(v)` (measurements) values survive. Arrays would be
   silently stripped by the `Object.entries(...)` loop, so `flips` cannot just
   be added to the dimensions arg.

   **Two viable options:**

   **Option A (chosen):** Extend `trackEvent` with an optional 4th `extras`
   parameter — a `Record<string, unknown>` that is spread ONLY into the
   pino `logger.info(...)` payload, NOT into the OTel span attributes. This
   keeps App Insights schema clean (App Insights customDimensions are flat
   strings only) while letting structured fields (arrays/objects) flow into
   pino's JSON output. This matches the deliverables' example log shape
   (flips appears as a JSON array, not a stringified blob).

   **Option B (rejected):** JSON.stringify the flips and add as a string
   dimension. Rejected because the deliverables explicitly show the flips
   field as an array in the log shape, and a stringified blob is harder to
   query in pino-pretty / jq locally and harder to project into App Insights
   workbook KQL than the equivalent JSON serialization done by pino itself.

4. **Test mock pattern** (`src/app/api/chat/__tests__/route.test.ts:47-82`):
   `trackEvent` is mocked at module level via `mocks.trackEventSpy` — the spy
   captures the FULL call arguments before any filtering. Existing tests assert
   on `call[1]` (dimensions). The new test will assert on the new 4th-position
   `extras` arg.

5. **Current call sites to modify** (verified by direct read):
   - Line 318: `trackEvent('validator_flip', { ...ctx, message_id }, { validator_flips: validatorFlips })`
   - Line 327: `trackEvent('fallback_trigger', { ...ctx, message_id, reason: 'all_citations_stripped' })`

   Other `fallback_trigger` emissions on this path (line 307 `can_answer_false`,
   line 338 `allowlist_violation`) do NOT get flips added — they're triggered by
   different upstream conditions and the validator may not have run (line 307)
   or flips are not the diagnostic signal (line 338).

</discovery_findings>

<tasks>

<task type="auto">
  <name>Task 1: Add flips diagnostics to validator_flip and all_citations_stripped events</name>
  <files>
    src/obs/telemetry.ts
    src/app/api/chat/route.ts
    src/app/api/chat/__tests__/route.test.ts
    src/obs/__tests__/telemetry.test.ts
  </files>
  <action>
    Make ONE atomic change across four files. Single commit.

    ## Step 1 — Extend `trackEvent` with optional 4th `extras` param

    Edit `src/obs/telemetry.ts`. Modify the `trackEvent` function signature and
    body so that an optional 4th parameter `extras: Record&lt;string, unknown&gt; = {}`
    is accepted. Behavior:

    - `extras` is NOT added to OTel span attributes (App Insights customDimensions
      are flat strings only — adding array/object values pollutes the schema).
    - `extras` IS spread into the `logger.info(...)` payload, AFTER `...dimensions`
      and `...measurements`, so structured fields (arrays, objects) appear in
      the pino JSON output.

    Suggested final shape (preserve existing comments and PII-strip semantics):

    ```ts
    export type EventExtras = Record&lt;string, unknown&gt;

    export function trackEvent(
      name: string,
      dimensions: EventDimensions = {},
      measurements: EventMeasurements = {},
      extras: EventExtras = {},
    ): void {
      const attrs: Record&lt;string, string | number&gt; = { 'event.name': name }
      for (const [k, v] of Object.entries(dimensions)) {
        if (typeof v === 'string' && v.length &gt; 0) attrs[k] = v
      }
      for (const [k, v] of Object.entries(measurements)) {
        if (Number.isFinite(v)) attrs[k] = v
      }
      const span = tracer.startSpan(name, { kind: SpanKind.INTERNAL, attributes: attrs })
      span.end()
      // extras flow ONLY to pino — pino serialises arrays/objects to JSON,
      // App Insights would coerce them to '[object Object]' which is useless.
      logger.info({ event: name, ...dimensions, ...measurements, ...extras }, name)
    }
    ```

    Add a JSDoc note on the new param explaining the OTel-skip rationale and the
    PII guidance (extras must remain PII-safe — same rules as dimensions; the
    pino scrubber is a backstop only).

    ## Step 2 — Add `summarizeFlips` helper and wire it into the two event sites

    Edit `src/app/api/chat/route.ts`.

    Near the top of the file (after the imports block, before the `POST` handler),
    add a small helper:

    ```ts
    /**
     * Summarise FallbackFlip[] for telemetry. Caps at `max` entries and emits a
     * truncation marker. NEVER includes citation quote text — FallbackFlip itself
     * deliberately omits quote (validator.ts:11-15) and this helper only forwards
     * the three safe fields. PII-safe.
     */
    function summarizeFlips(
      flips: ReadonlyArray&lt;{ source_id: string; section_id: string; reason: string }&gt;,
      max = 10,
    ): { flips: Array&lt;{ source_id: string; section_id: string; reason: string }&gt;; flips_truncated: boolean } {
      const truncated = flips.length &gt; max
      const sliced = (truncated ? flips.slice(0, max) : flips).map(f =&gt; ({
        source_id: f.source_id,
        section_id: f.section_id,
        reason: f.reason,
      }))
      return { flips: sliced, flips_truncated: truncated }
    }
    ```

    Modify the existing trackEvent call at the partial-strip site (currently
    line 318). Pass the flip summary as the new 4th `extras` arg:

    ```ts
    if (validatorFlips &gt; 0 && validated.can_answer !== false) {
      trackEvent(
        'validator_flip',
        { ...ctx, message_id },
        { validator_flips: validatorFlips },
        summarizeFlips(validated._flips, 10),
      )
    }
    ```

    Modify the existing trackEvent call at the all_citations_stripped site
    (currently line 327). The signature requires positional measurements, so
    pass `{}` for the third arg:

    ```ts
    trackEvent(
      'fallback_trigger',
      { ...ctx, message_id, reason: 'all_citations_stripped' },
      {},
      summarizeFlips(validated._flips, 10),
    )
    ```

    Do NOT modify any other trackEvent call site (line 307 can_answer_false,
    line 338 allowlist_violation, etc.). Those are out of scope.

    ## Step 3 — Add test for the new behavior

    Edit `src/app/api/chat/__tests__/route.test.ts`. Locate the existing test
    block that already exercises the all_citations_stripped path (search for
    `'fallback_trigger with reason="all_citations_stripped"'` — currently around
    line 975). Immediately after that test, add ONE new test:

    ```ts
    it('fallback_trigger with reason="all_citations_stripped" includes flips array (per-citation diagnostics)', async () =&gt; {
      mockStreamAnswer.mockResolvedValue({
        response: {
          can_answer: true,
          answer: 'An answer that looked OK.',
          citations: [
            // unknown_source_id flip — WRONG_SOURCE not in REGISTRY
            { source_id: 'WRONG_SOURCE', section_id: 'who-can-submit', quote: 'irrelevant' },
            // quote_not_in_body flip — real source/section but bogus quote
            { source_id: 'KB0020882', section_id: 'who-can-submit', quote: 'absolutely-not-a-real-quote-string' },
          ],
        },
        usage: { prompt_tokens: 80, completion_tokens: 30 },
      })

      const res = await POST(makePost(validBody()))
      await readAllSseFrames(res)

      const calls = getEventCalls()
      const fallbackCall = calls.find(
        c =&gt; c[0] === 'fallback_trigger' && (c[1] as Record&lt;string, unknown&gt;)['reason'] === 'all_citations_stripped',
      )
      expect(fallbackCall).toBeTruthy()
      // The new 4th-position `extras` arg carries the flips diagnostic payload.
      const extras = fallbackCall![3] as { flips: Array&lt;Record&lt;string, string&gt;&gt;; flips_truncated: boolean }
      expect(extras).toBeTruthy()
      expect(Array.isArray(extras.flips)).toBe(true)
      expect(extras.flips.length).toBeGreaterThanOrEqual(1)
      expect(extras.flips_truncated).toBe(false)
      // Privacy: NO quote text leaks into the flip records.
      for (const f of extras.flips) {
        expect(Object.keys(f).sort()).toEqual(['reason', 'section_id', 'source_id'])
        expect(typeof f.source_id).toBe('string')
        expect(typeof f.section_id).toBe('string')
        expect(typeof f.reason).toBe('string')
      }
    })
    ```

    Notes:
    - `getEventCalls()` already exists in this file (Plan 06-02 scaffolding).
      Confirm it returns the FULL `mock.calls` array (4-tuples now). If the
      helper currently slices to length-3, widen its return type — the spy
      itself captures all positional args regardless.
    - Use `WRONG_SOURCE` and a bogus quote on a real `(KB0020882, who-can-submit)`
      pair to force two distinct flip reasons (`unknown_source_id` and
      `quote_not_in_body`). This exercises the helper across multiple flip kinds
      and gives ≥1 flip in the assertion (the validator stops early on the
      unknown_source_id, but the second citation will still be processed and
      flipped on quote-not-in-body — confirm by reading validator.ts:69-102).

    ## Step 4 — Update telemetry tests for the new param

    Edit `src/obs/__tests__/telemetry.test.ts` (it exists — confirm via Glob
    before editing). Add ONE small assertion to the existing test suite:

    - The 4th-position `extras` param flows into the pino `logger.info` payload.
    - The 4th-position `extras` param is NOT added to the OTel span attributes
      (assert via the existing OTel attribute capture, if the test uses one;
      otherwise assert that `attrs['flips']` is undefined / not present in
      whatever shape the existing test inspects).

    If the existing telemetry test file does not have an attribute-capture
    pattern, add a minimal new test using the same OTel mock setup the file
    already uses. Do not refactor existing tests.

    ## Step 5 — Verify privacy + cap invariants by inspection

    After editing, re-read the modified `route.ts` and confirm:
    - `summarizeFlips` only forwards `source_id`, `section_id`, `reason`.
    - The cap is 10 (matches deliverables) and `flips_truncated: true` is set
      when the cap fires.
    - `validator.ts` was NOT touched — `git diff src/grounding/validator.ts`
      should be empty.
    - No new dependencies in `package.json`.

    ## Step 6 — Run typecheck + targeted tests

    Run in order, fix forward on failure:
    ```
    pnpm typecheck
    pnpm test src/app/api/chat src/grounding src/obs
    ```

    Expected: clean typecheck, all 70+ existing tests green plus the new test.

    ## Step 7 — Commit + push

    Commit with the exact subject from the deliverables:

    ```
    feat(telemetry): emit validator-flip details on validator_flip and all_citations_stripped events

    Adds per-citation diagnostic detail to two telemetry events on the chat
    pipeline:
    - validator_flip (partial strips, request still succeeds)
    - fallback_trigger reason=all_citations_stripped (total strip)

    The validator's existing FallbackFlip array (source_id + section_id +
    reason — quote text deliberately excluded) is forwarded to pino via a
    new optional 4th `extras` param on trackEvent. Capped at 10 entries
    with a flips_truncated marker. App Insights customDimensions schema
    is unaffected (extras flow only to pino, not to OTel attributes).

    Closes the diagnostic gap surfaced when KB-Author suggested-prompt
    chips land on the all_citations_stripped fallback path: operator can
    now see exactly which (source_id, section_id) pairs the model
    fabricated and the per-citation flip reason.

    Behavior of validator, fallback rendering, SSE frame ordering, and UX
    is unchanged.

    Co-Authored-By: Claude Opus 4.7 (1M context) &lt;noreply@anthropic.com&gt;
    ```

    NOTE: Use Co-Authored-By 4.7 (NOT 4.5 — that template predates the current
    model). Pass the message via HEREDOC to preserve formatting.

    Then push:
    ```
    git push origin master
    ```

    Operator will redeploy on their schedule — no deploy step in this plan.
  </action>
  <verify>
    Run from repo root:

    ```
    pnpm typecheck
    pnpm test src/app/api/chat src/grounding src/obs
    git diff src/grounding/validator.ts        # must be empty
    git log -1 --pretty=format:'%s'            # must match the commit subject
    git log -1 --pretty=format:'%(trailers:key=Co-Authored-By)' | grep -F 'Claude Opus 4.7 (1M context)'
    ```

    Manual read-back:
    - Open `src/app/api/chat/route.ts`, confirm `summarizeFlips(validated._flips, 10)`
      appears at BOTH the partial-strip site and the all_citations_stripped site.
    - Confirm `summarizeFlips` only references `source_id`, `section_id`, `reason`
      — no reference to `quote` anywhere in the helper or the call sites.
    - Open `src/obs/telemetry.ts`, confirm the new `extras` param is spread into
      `logger.info(...)` AFTER dimensions/measurements, and is NOT added to
      `attrs` (the OTel attributes object).
    - Confirm `git status` shows changes ONLY in the four files listed in
      `&lt;files&gt;` above (plus optional `pnpm-lock.yaml` if pnpm decided to
      touch it — there should be NO new dependencies; if lockfile changed,
      investigate and revert).
  </verify>
  <done>
    - `pnpm typecheck` exits 0.
    - `pnpm test src/app/api/chat src/grounding src/obs` passes (existing 70+
      tests stay green; new flip-logging test passes; new telemetry-extras test
      passes).
    - `validator.ts` and the `FallbackFlip` interface are byte-identical to
      before this commit (verified via empty diff).
    - The commit landed on `master` with the exact subject from the deliverables
      and the Claude Opus 4.7 (1M context) trailer.
    - `git push origin master` succeeded.
    - Read-back inspection confirms: flips appear in both event call sites,
      quote text is not in the flip payload, length cap of 10 is applied,
      flips_truncated marker is emitted on cap.
  </done>
</task>

</tasks>

<verification>

## Phase-level checks

1. Validator behavior unchanged: `git diff` on `src/grounding/validator.ts` is empty.
2. No new dependencies: `git diff package.json pnpm-lock.yaml` is empty (or the
   only change is whitespace / nothing of substance — investigate any lockfile
   churn).
3. SSE frame ordering unchanged: existing test
   `'all_citations_stripped: validator strips fake-quote citation → one fallback,
   zero answer_delta'` (route.test.ts:300) stays green untouched.
4. PII boundary preserved: the new test asserts `Object.keys(f).sort()` equals
   exactly `['reason', 'section_id', 'source_id']` — any future regression that
   adds quote (or any other field) to flip records will fail this test.
5. Cap behavior: not directly exercised in the new test (asserts `flips_truncated
   === false` for ≤2 flips). The truncation logic is straightforward and reviewed
   by inspection in Step 5; if a unit test for `summarizeFlips` is desirable, add
   it as a focused test in `src/app/api/chat/__tests__/` — OPTIONAL, only if
   straightforward.

</verification>

<success_criteria>

- [ ] `pnpm typecheck` clean
- [ ] `pnpm test src/app/api/chat src/grounding src/obs` green
- [ ] `git diff src/grounding/validator.ts` empty
- [ ] No new package.json dependencies
- [ ] `validator_flip` trackEvent call site includes `summarizeFlips(validated._flips, 10)` as 4th arg
- [ ] `fallback_trigger` (reason=all_citations_stripped) trackEvent call site includes `summarizeFlips(validated._flips, 10)` as 4th arg
- [ ] `summarizeFlips` only forwards `source_id`, `section_id`, `reason` (no quote)
- [ ] `summarizeFlips` caps at 10 entries and sets `flips_truncated: true` on overflow
- [ ] `trackEvent` signature accepts optional 4th `extras` param; extras flow to pino but not OTel
- [ ] New test in `route.test.ts` asserts flips array shape on all_citations_stripped path
- [ ] Commit subject: `feat(telemetry): emit validator-flip details on validator_flip and all_citations_stripped events`
- [ ] Co-Authored-By trailer: `Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
- [ ] `git push origin master` succeeded

</success_criteria>

<output>
After completion, create `.planning/quick/004-emit-validator-flip-details-on-fallback/004-SUMMARY.md`
documenting:
- Commit SHA and subject
- The four files modified
- Confirmation: validator.ts unchanged
- Confirmation: no new dependencies
- Test counts before/after (e.g. "726 → 727 tests")
- Push timestamp / branch state
</output>
