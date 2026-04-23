# Phase 5: SSO & Teams Delivery - Context

**Gathered:** 2026-04-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Entra ID SSO gates the app in both the standalone MMC web client AND a Microsoft Teams personal tab (via NAA — Nested App Authentication — using a single codebase). The app is deployed to an MMC-sanctioned Azure App Service (Linux, Node 20.9+) with a CI/CD pipeline from the `main` branch. The Teams manifest (schema 1.22, `webApplicationInfo.nestedAppAuthInfo`, `brk-multihub://` redirect) sideloads and runs in the Teams client.

In scope: auth wiring (browser + Teams host), tenant allowlist enforcement in `_middleware.ts`, Teams manifest packaging, App Service deployment, CI/CD from main, canary smoke gate, first-run UX parity with standalone web.

Out of scope (deferred to Phase 6 or v2): telemetry events (App Insights), measurement plan, pilot-cohort onboarding process, eval-suite deploy gate, role-inference from Entra groups, channel/group/meeting Teams surfaces, automated rollback, staging/dev-Azure environment tiers.

Requirements covered: AUTH-01, AUTH-03, DELV-01, DELV-02, DELV-03, DELV-04.

</domain>

<decisions>
## Implementation Decisions

### Auth boundary & tenant gating

- **Tenant allowlist is the sole code-level gate.** `env().ENTRA_TENANT_ID` (added to EnvSchema in this phase) is the only tenant permitted. `src/app/api/_middleware.ts` replaces its Phase-2 stub with: parse `Authorization: Bearer <jwt>` → validate JWT signature against Entra JWKS → verify `aud` matches the App Registration client ID → verify `tid === env().ENTRA_TENANT_ID` → attach `jwt.oid`, `jwt.tid`, `jwt.preferred_username` to the request context for logging. No user/group gating in code.
- **Pilot cohort gating handled in Entra, not in code.** Enterprise Application → "Assignment required: Yes" + explicit user/group assignment to the pilot cohort. This keeps the allowlist dynamic (Content Steward updates it in Entra; no redeploy) and keeps code simple.
- **JWT validation library: `jose`** (WebCrypto-based, framework-agnostic, works in Next.js Node runtime). JWKS cached in-memory with a TTL matching Entra's rotation guidance (24h is safe; `jose` handles the fetch+cache pattern via `createRemoteJWKSet`).

### Blocked-user UX

- **Blocked tenant (authenticated to Entra, wrong `tid`)** → full-page `/access-denied` route. Copy: "This assistant is available only to MMC colleagues. If you believe this is an error, contact the CTSS Knowledge team." Content Steward email comes from existing `CONTENT_STEWARD_EMAIL` env var (Phase 4). No tenant ID, JWT claims, or technical detail leaked.
- **No Entra token at all / signature fails / token expired before first API call** → redirect to Entra sign-in. MSAL redirect flow on standalone web (default); `microsoftTeams.authentication.getAuthToken()` silent flow on Teams host.
- **Token expires mid-chat-stream** → `/api/chat` returns a new typed error `{ error: 'token_expired' }` (9th error code; acceptable extension as all 8 existing codes are pre-Phase-5). Frontend ErrorCard renders "Your session expired — sign back in" with a primary action that triggers `msalInstance.acquireTokenSilent()`; if silent acquisition fails, falls back to `acquireTokenRedirect()`. On success, user hits the existing "Retry" affordance (Phase 3 contract) to replay the message. In-flight stream aborts cleanly via the existing AbortController machinery.
- **Sign-out flow** → header dropdown gains "Sign out" option (below existing "Change role"). Reuses `ChangeRoleDialog` confirm pattern when draft or in-flight stream exists. On confirm: clear in-memory chat state, call `useRolePersistence` + `useDraftBuffer` reset, `msalInstance.logoutRedirect({ postLogoutRedirectUri: '/' })`. Post-logout lands on Entra sign-in.
- **Multi-tab behavior** → no special handling. MSAL's default broadcast-channel session sharing across tabs. Each tab retains its own in-memory chat state (matches existing Phase 3 design).

### Teams integration

- **Personal tab only** for v1. No channel tab, group tab, or meeting extension. Rationale: channel/group surfaces need context inference (which team, which channel) that isn't in the v1 requirement set.
- **Manifest 1.22** with `webApplicationInfo.nestedAppAuthInfo` (locked by Phase-0 pitfall research). Single `configurableTabs: []` (none) + `staticTabs: [{ entityId: 'kb-assistant', contentUrl: 'https://<app-service>/?host=teams', scopes: ['personal'] }]`. Valid-domains includes the App Service URL.
- **Manifest name/description/icons** sourced from MMC branding inputs the user provides during planning; Claude's discretion covers layout (192×192 color + 32×32 outline to Teams spec), developer name (MMC / CTSS Knowledge team), privacy/terms URLs (MMC intranet — user provides).
- **First-run in Teams = same as standalone web.** Role select shows; `useRolePersistence` remembers across launches; identical UX. No Teams-specific greeting variant, no Teams-specific chip set.
- **No role-inference from Entra groups.** Explicit role selection stays. Users who legitimately switch between Consumer and Author questions need the manual toggle.
- **Host detection:** `src/auth/detectHost.ts` returns `'teams' | 'browser'`. Detection signal: `microsoftTeams.app.initialize()` resolves (Teams host) vs rejects/times-out-150ms (browser host). Timeout is the deterministic fallback — don't rely on user-agent sniffing.
- **Single SPA App Registration** with BOTH the standalone redirect URI (`https://<app-service>/auth/redirect`) AND the `brk-multihub://` NAA redirect. NOT two separate registrations. Rationale: same codebase, same user pool, same tenant allowlist; NAA's design assumption is single-registration dual-surface.

### CI/CD pipeline

- **GitHub Actions.** Matches repo host (`samurainjenkinz/GitHub`). Azure DevOps would require a second platform integration for a solo-pilot project.
- **OIDC federated credential** from GitHub Actions → Azure (via `azure/login@v2`). No long-lived secrets in the workflow; the workflow never sees `LLM_*`, MGTI credentials, or `ENTRA_TENANT_ID`. App Service Application Settings (set via Azure portal) carry all runtime env vars, documented by `docs/env-handling.md` (Phase 2 deliverable).
- **Single environment for pilot.** One prod App Service. No staging, no dev-Azure. Dev testing happens locally via dev-mode factory (`pnpm dev` → api.openai.com — Plan 05 baseline). Rationale: staging/dev-Azure tiers would triple operational surface (three App Services, three env-var sets, three CA bundles) for no pilot-value gain.
- **Trigger: auto-deploy on push to `main`.** No tag-gating, no manual approval step for v1. Rationale: solo project, rapid iteration during pilot. Phase 6 may revisit this when eval-suite deploy gate lands.
- **Canary smoke = new `/api/health` endpoint.** Lightweight route (returns 200 with `{ status: 'ok', checks: { env: 'ok', mgti: 'reachable' } }`). Checks: `env()` parses successfully, MGTI ingress reachable via `HEAD` (no body, minimal cost). Pipeline post-deploy step hits `/api/health`; non-200 fails the workflow. Does NOT exercise `/api/chat` (would burn MGTI tokens on every commit). A full `/api/chat` smoke belongs in Phase 6 as a nightly scheduled workflow.
- **Rollback: manual.** `git revert` + push for forward-fix. Azure App Service Deployment Center retains the last N artifacts and supports click-to-rollback in the portal as a backstop. No automated rollback logic for v1.
- **Build artifact:** Next.js `output: 'standalone'` bundle (locked by ROADMAP.md phase goal). Deployed via `azure/webapps-deploy@v3`. App Service uses `node server.js` as the startup command.

### External sequencing & fallbacks

- **Azure App Service provisioning owned by user (SamuraiJenkinz).** Likely via MMC self-service portal or MMC platform team ticket. Plan's deploy-pipeline sub-plan is gated behind a human-checkpoint: "App Service Linux Node 20.9+ provisioned, `NODE_EXTRA_CA_CERTS` configured with MMC CA bundle, Application Settings populated per `docs/env-handling.md`, startup command `node server.js` set." Until this checkpoint clears, Teams manifest packaging + SSO wiring can proceed in parallel.
- **Entra App Registration + admin consent owned by MMC IT / Identity team.** User drives the ticket. SSO-wiring sub-plan is gated behind a human-checkpoint: "App Registration created as SPA with `https://<app-service>/auth/redirect` + `brk-multihub://` redirect URIs, admin consent granted for tenant, `ENTRA_TENANT_ID` + `ENTRA_CLIENT_ID` known." Claude implements against whatever values the user returns with.
- **Teams sideload policy fallback:** if MMC Teams Admin Center blocks custom-app sideloading for the pilot cohort, fallback = **standalone-web-only pilot**. The Teams manifest still ships (phase requirement remains). Pilot cohort gets the App Service URL bookmark instead of a Teams tab. When sideload policy resolves later, the manifest is already built — just needs submission to Teams Admin Center. Does NOT block Phase 5 closure.
- **Tenant admin consent workflow:** NAA requires admin consent for the scope set (`openid`, `profile`, `email`, `User.Read`). User submits the admin-consent URL to MMC Identity team once the App Registration exists. Claude includes the exact admin-consent URL template in the implementation handoff doc.

### Claude's Discretion

- Exact `/access-denied` page layout, illustration, spacing (MMC branding tokens — follow existing Phase 4 typography/color system)
- `/api/health` response schema beyond the `{ status, checks }` shape locked above
- Teams manifest icon files (user provides source; Claude generates 192×192 + 32×32 at implementation time)
- MSAL configuration object shape (cacheLocation, authority URL structure — follow MSAL.js v3 docs)
- GitHub Actions workflow file structure (single `.github/workflows/deploy.yml` vs split build/deploy workflows)
- JWKS cache TTL within the 1h–24h range
- Error-card copy for `token_expired` (one-liner following existing ErrorCard voice)
- `detectHost.ts` timeout threshold (100–200ms range acceptable)

</decisions>

<specifics>
## Specific Ideas

- **NAA over OBO:** pitfall research from Plan 05 locked NAA (Nested App Authentication) over the legacy on-behalf-of flow. NAA uses `createNestablePublicClientApplication` + `microsoftTeams.app.getContext` — single SPA registration, single codebase, silent-SSO inside Teams.
- **"Same codebase for browser + Teams" is load-bearing.** `src/auth/detectHost.ts` is the branching point; everything downstream (auth module, token acquisition, UI) shares a single implementation. No forked components.
- **App Service startup command must be explicit.** `output: 'standalone'` produces a `server.js` at the root; Azure App Service Linux defaults don't always pick it up without the startup command set in Application Settings.
- **NODE_EXTRA_CA_CERTS is shell-env only** (Node.js #51426 documented in `docs/env-handling.md`). Must be in Azure Application Settings, not in `.env.production` or any file the app reads at boot.
- **Test matrix for Pitfall 9 (Teams full-client):** Teams desktop (Windows + macOS), Teams web (Edge + Chrome), Teams mobile (iOS + Android). Phase 5 success criterion #2 explicitly calls out desktop + web; mobile is best-effort for v1 per ROADMAP pitfall focus.
- **Plan 02-01 left exact replacement points** — `src/app/api/_middleware.ts` has a `PHASE 5 REPLACEMENT POINT` comment block that describes the exact four-step transformation (bearer parse → JWT validate → tenant check → oid/tid attach). Plan 5 implementation follows that block literally.

</specifics>

<deferred>
## Deferred Ideas

- **Telemetry events for SSO flow** (sign-in latency, Teams-vs-browser host breakdown, tenant-blocked counts) — belongs in Phase 6 (App Insights schema lands there).
- **Channel / group / meeting Teams tabs** — v2. Requires context inference from Teams API that's out of v1 scope.
- **Role-inference from Entra group membership** — v2. Would require Microsoft Graph `User.Read.All` scope and a group-to-role mapping config; keeping explicit selection for v1.
- **Automated rollback on failed canary** — v1.1. Current plan is manual; Azure App Service Deployment Center provides click-to-rollback as the backstop.
- **Staging / dev-Azure environment tier** — post-pilot. Adds operational surface; not warranted until pilot scales beyond the initial cohort.
- **Full `/api/chat` canary smoke (not just `/api/health`)** — Phase 6 nightly scheduled workflow. Burning MGTI tokens on every commit is wasteful; nightly is the right cadence.
- **MSAL cache to IndexedDB instead of sessionStorage** — post-pilot. sessionStorage is simpler and sufficient for pilot cohort.
- **CSP / security headers tuning** — post-pilot hardening. Next.js defaults + App Service defaults are acceptable for pilot.

</deferred>

---

*Phase: 05-sso-and-teams-delivery*
*Context gathered: 2026-04-23*
