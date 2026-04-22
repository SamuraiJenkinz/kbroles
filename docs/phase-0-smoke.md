# Phase-0 Smoke Resolutions

Evidence record for the five Phase-0 checks that gate Phase 1 closure.
Each check must read PASS (or, for Smoke 4, DEFERRED) before Phase 1 is marked
complete in STATE.md / ROADMAP.md.

Re-run via:

```bash
pnpm smoke -- --mode=dev       # against api.openai.com
pnpm smoke -- --mode=prod      # against MGTI ingress (requires MGTI key + NODE_EXTRA_CA_CERTS)
```

`NODE_EXTRA_CA_CERTS` must be set in the SHELL ENVIRONMENT (or App Service Application Settings), NOT in a `.env` file — Node reads it at TLS init before dotenv runs. See nodejs/node issue #51426.

---

## Smoke 1 — MGTI `baseURL` suffix

**Result:** PASS *(dev mode — prod-mode run pending MGTI access)*
**Date:** 2026-04-22
**Operator:** TK
**Mode:** dev

**What we're testing:** The `LLM_BASE_URL` env value resolves and auth works end-to-end.

**Evidence (dev mode):**
- `baseURL`: `https://api.openai.com/v1`
- `model`: `gpt-4o-2024-08-06`
- `responseSnippet`: `Acknowledged.`

**Remediation if FAIL:**
On 404/405, try alternative suffixes in order: `/coreapi/openai`, `/coreapi/openai/`, `/coreapi/openai/v1`. Update `LLM_BASE_URL` in App Service Application Settings (or `.env.local` for dev) and re-run.

---

## Smoke 2 — `response_format: json_schema` strict mode

**Result:** PASS *(dev mode — prod-mode run pending MGTI access)*
**Date:** 2026-04-22
**Operator:** TK
**Mode:** dev

**What we're testing:** Endpoint honours `response_format: { type: 'json_schema', strict: true }` with our `CITATION_SCHEMA` and returns JSON matching the `{ can_answer, answer, citations[] }` shape.

**Evidence (dev mode):**
- `can_answer`: `true`
- `answer_preview`: `The Short description field must contain the article title and follow the four-part naming convention: [Application/Topi`
- `citation_count_model`: `1` / `citation_count_validated`: `1`
- `validator_flips`: `0` (the model's citation passed the quote-substring validator — end-to-end grounding works)
- `enum_first_source`: `locked` (CITATION_SCHEMA source_id enum is live)

**Remediation if FAIL:**
If strict mode is rejected with 400 or silently ignored: set `STRICT_SCHEMA_SUPPORTED=false` in App Service App Settings (dev: add to shell). `streamAnswer` will fall back to `response_format: json_object` + Ajv validation + one retry. Already implemented in `src/llm/stream.ts`; no code change needed.

---

## Smoke 3 — Streaming chunk cadence through APIM

**Result:** PASS *(dev mode against api.openai.com — prod/APIM run pending MGTI access)*
**Date:** 2026-04-22
**Operator:** TK
**Mode:** dev

**What we're testing:** Streaming responses arrive in real-time chunks through MGTI's APIM (not buffered and delivered in one lump).

**Thresholds:** PASS = P95 inter-chunk latency < 500 ms AND chunk count > 10 on a ~500-token response.

**Evidence (dev mode):**
- `chunkCount`: `195`
- `firstChunkLatencyMs`: `868`
- `p95InterChunkMs`: `65` (well under 500 ms threshold — public OpenAI reference baseline)

**Note on dev vs. prod:** This run exercises `api.openai.com` directly, which is a clean reference baseline. The actual Pitfall #10 risk is MGTI's APIM buffering streaming chunks and delivering them in one lump; that only shows up when `--mode=prod` runs. Prod-mode run is a non-blocking Phase 2 gate (see STATE.md Blockers/Concerns).

**Remediation if FAIL (prod mode):**
Non-blocking for Phase 1 closure. Document the result. If APIM is buffering, Phase 2 (`/api/chat` streaming route) will need a non-streaming fallback — include the finding in Phase 2 CONTEXT. Engage MMC platform team on APIM tuning in parallel.

---

## Smoke 4 — Entra SPA + `brk-multihub://` consent

**Result:** DEFERRED — see Phase 5 (SSO & Teams Delivery)
**Date:** YYYY-MM-DD
**Operator:** <initials>

**What we're testing:** Not exercised by this script. Phase 1 scope is DOCUMENT ONLY per `01-CONTEXT.md` §4. The Entra app registration, `brk-multihub://` redirect URI type, and all MSAL client code land in Phase 5.

**Phase 1 manual actions (to be completed during Phase 1):**
- [ ] Identified MMC Entra admin contact: (name, team, email)
- [ ] Confirmed MMC tenant allows registering `brk-multihub://` redirect URI type: (yes / no / pending)
- [ ] Screenshot of expected consent screen (if tenant already has a reference NAA app): `docs/phase-0-evidence/entra-consent.png` (optional; placeholder until Phase 5 execution)

If the tenant policy blocks `brk-multihub://`, escalate now — it is a blocker for Phase 5 Success Criterion 2 (Teams tab silent SSO).

---

## Smoke 5 — Corporate CA chain for outbound HTTPS

**Result:** FAIL | PASS | N/A (dev-mode only run) *(pending first prod run)*
**Date:** YYYY-MM-DD
**Operator:** <initials>
**Mode:** prod (required — Smoke 5 does not apply to dev mode)

**What we're testing:** Running `--mode=prod` reaches MGTI over HTTPS without `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. This requires `NODE_EXTRA_CA_CERTS` pointing at the MMC corporate CA bundle PEM file.

**Evidence:**
- `NODE_EXTRA_CA_CERTS` path:
- CA chain test (pass/fail):
- If failed, the specific error:

**Remediation if FAIL:**
1. Request the MMC corporate CA bundle PEM file from MMC platform team.
2. Install it at a known local path (dev) or App Service-mounted path (prod).
3. Set `NODE_EXTRA_CA_CERTS=<absolute-path-to-bundle>` in SHELL ENVIRONMENT (dev shell, or App Service Application Settings).
4. **Do NOT** put this in a `.env` file — Node reads it at TLS init before dotenv runs. Known Node.js limitation: nodejs/node issue #51426.
5. Re-run `pnpm smoke -- --mode=prod`.

---

## Phase 1 closure

Phase 1 is marked complete (in `.planning/STATE.md` and `.planning/ROADMAP.md`) when:

- [ ] Smokes 1, 2, 3 — PASS in both `--mode=dev` and `--mode=prod` (or documented remediation plan for any FAIL that is non-blocking per CONTEXT.md)
- [ ] Smoke 4 — DEFERRED, with Phase 1 manual checklist items ticked
- [ ] Smoke 5 — PASS in `--mode=prod` (dev-mode run is N/A)
- [ ] Evidence attached to each section above
- [ ] This file committed to git
