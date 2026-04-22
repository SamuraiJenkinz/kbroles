# Stack Research — KB Knowledge Assistant

**Domain:** Internal enterprise role-aware AI chat assistant (web + Teams tab), source-grounded, Entra-SSO'd, deployed on MMC-sanctioned Azure.
**Researched:** 2026-04-22
**Confidence:** HIGH on framework/auth/Teams/hosting picks; MEDIUM on the exact AI-SDK-v5 request shape against MMC's non-standard ingress (needs a 10-minute smoke test in Phase 0).

---

## TL;DR — The Prescribed Stack

| Layer | Pick | Version | Confidence |
|---|---|---|---|
| Framework | **Next.js 16 App Router** (React 19.2) | `next@16.x`, `react@19.2.x` | HIGH |
| Language | **TypeScript strict** | `typescript@5.6+` | HIGH |
| Bundler | **Turbopack** (default in Next 16) | bundled | HIGH |
| Styling | **Tailwind CSS v4** + **shadcn/ui** (copy-in, Radix-based) | `tailwindcss@4.x` | HIGH |
| Chat UI | **Vercel AI SDK v5** `useChat` + custom shell (not Assistant UI) | `ai@5.x`, `@ai-sdk/react@2.x` | HIGH |
| Model client | **AI SDK v5 `createAzure`** with `baseURL` + `headers` override, `useDeploymentBasedUrls: true` | `@ai-sdk/azure@2.x` | HIGH on API; MEDIUM on exact MMC-ingress shape |
| Backend shape | **Next.js Route Handlers** (`app/api/chat/route.ts`) streaming via `toUIMessageStreamResponse()` | Next 16 | HIGH |
| Auth (web + Teams) | **@azure/msal-browser** with **Nested App Authentication (NAA)** via `createNestablePublicClientApplication`, **@azure/msal-react** for React hooks | `@azure/msal-browser@4.x`, `@azure/msal-react@5.x` | HIGH |
| Teams SDK | **@microsoft/teams-js** v2 with `app.initialize()` host-detection fallback | `@microsoft/teams-js@2.52+` | HIGH |
| Teams manifest | **Microsoft 365 app manifest schema 1.22** (for NAA prefetch) — `webApplicationInfo.nestedAppAuthInfo` | schema `1.22` | HIGH |
| Hosting | **Azure App Service (Linux, Node 20.9+)** with Next.js `output: 'standalone'` | — | HIGH |
| CI/CD | **GitHub Actions** → Azure App Service deploy slot | — | HIGH |
| Unit testing | **Vitest** + React Testing Library | `vitest@3.x` | HIGH |
| Evals (the layer that matters) | **Bespoke Vitest suite** driving the `/api/chat` handler against a fixed Q&A fixture set — **primary quality gate, not UI tests** | — | HIGH |
| E2E (light) | **Playwright** — smoke only, not comprehensive | `@playwright/test@1.x` | HIGH |
| Observability | **Application Insights Node SDK (Azure Monitor OpenTelemetry distro)** with **custom event** telemetry for anonymized Q&A pairs | `@azure/monitor-opentelemetry@1.x` | HIGH |
| Logging | Structured JSON via `pino`; AppInsights auto-collects console | `pino@9.x` | HIGH |
| Env/secrets | App Service App Settings + Key Vault reference for `AZURE_OPENAI_KEY` | — | HIGH |

---

## 1. Frontend Framework & Build Tooling — **Next.js 16 App Router + React 19.2 + TypeScript strict**

### Pick: `next@16` (released Oct 2025, stable in April 2026)

**Why:**
- **One deployable unit for web + Teams tab**: Teams tabs are just iframes of a hosted URL — a Next.js app serves both personas with zero bifurcation. Same codebase, same build, same deploy. An SPA + separate API would double the surface area for no gain on a session-only app.
- **Route Handlers give us a first-class streaming endpoint**: `app/api/chat/route.ts` + `toUIMessageStreamResponse()` is literally one function. No Express, no Fastify, no Functions cold-start tax.
- **React Server Components let the role-select screen + source-panel chrome render server-side**, reducing client JS. The chat shell itself is a Client Component (it has to be — it uses hooks).
- **Stable Turbopack** = fast dev + fast CI builds. `next build --turbopack` is the default.
- **Node 20.9+ requirement** aligns with App Service Linux current LTS node runtimes.

**Don't do:**
- **Vite + React + separate API (Express/Fastify)**: doubles the deploy, splits CORS headaches, forces us to re-invent streaming glue. Zero upside for this scope.
- **Remix / React Router v7 in framework mode**: viable but smaller Azure ecosystem, smaller hiring pool inside MMC, and the AI SDK's `useChat` story is more polished on Next.
- **Next.js 15**: 15 is still supported, but 16 has been stable for 6 months and ships React Compiler + stable Turbopack. Starting greenfield on N-1 is choosing to be behind on day one.
- **Pages Router**: legacy. App Router is the path forward and is where streaming + RSC live.

**Version pin:** `next@^16.0.0`, `react@^19.2.0`, `react-dom@^19.2.0`, `typescript@^5.6.0`, `@types/react@^19`, `@types/node@^20.9`.

**Confidence:** HIGH.

---

## 2. Chat UI — **Vercel AI SDK v5 `useChat` + hand-rolled shell**

### Pick: `ai@5` + `@ai-sdk/react@2` for the streaming hook; build the visual shell ourselves with Tailwind v4 + shadcn/ui primitives.

**Why:**
- **`useChat` is exactly the primitive we need**: it handles streaming message state, optimistic UI, message history, error retry, abort — the boring plumbing that's worth 2 days of implementation. This is ~30 lines of hook wiring, not a vendor-lock-in framework.
- **`toUIMessageStreamResponse()` on the server pairs 1:1 with `useChat` on the client** — the transport is typed end-to-end, and it handles SSE framing correctly for Azure/App-Service's streaming support.
- **The visual shell is bespoke anyway**: the spec (section 14 of the handover) calls for a two-panel layout with a sliding source panel, role-specific suggested prompts, role badges, specific corner-radius rules, and colour-coded source chips. No off-the-shelf chat UI handles this without fighting it — build it on shadcn primitives (Button, Card, ScrollArea, Sheet for the source panel) and keep full control of the surface.

**Don't do:**
- **Assistant UI (`@assistant-ui/react`)**: opinionated, heavier, designed for agent-with-tools UX. Overkill for a two-doc grounded Q&A. We'd spend more time overriding its defaults than writing our own.
- **LangChain.js / LangGraph**: **explicitly avoid**. Our grounding is stuffed-context — no retrieval, no agents, no tools. LangChain adds 3 layers of abstraction over what is, functionally, `messages.create()`. It obscures the system prompt (the single most important artifact in this build), makes evals harder, and gives every future developer a bigger surface area to misunderstand.
- **Copilot Kit**: fine framework, wrong shape — it wants to provide agentic UI + runtime. We don't need either.
- **Build our own SSE parser**: `useChat` already does this correctly. Writing it again is hobby work, not production work.

**Version pin:** `ai@^5.0.0`, `@ai-sdk/react@^2.0.0`.

**Confidence:** HIGH.

---

## 3. Backend Shape — **Next.js Route Handlers, streaming only, no DB**

### Pick: Single `app/api/chat/route.ts` POST handler, streaming. Optional `app/api/health/route.ts`. That's it.

**Why:**
- **Session-only state** (PROJECT non-negotiable) → no DB, no persistence layer, no Prisma, no Drizzle. Conversation history lives in the `useChat` hook's client state and is sent in the request body on each turn. Role lives in `sessionStorage` on the client. When the tab closes, it's gone. This is the correct shape for the product.
- **Streaming is non-negotiable for chat UX**: users must see tokens flow. Route Handlers in Next 16 stream natively over SSE via the AI SDK's `toUIMessageStreamResponse()`. App Service's Linux Node runtime supports long-lived streaming responses (this is verified against App Service docs for 2026 — the old WebSockets-only restriction is gone for SSE over HTTP/1.1 and HTTP/2).
- **Route Handlers run in the Node runtime, not Edge**: required because we need `fetch` against a corporate ingress that likely presents a corporate root CA. Edge runtime doesn't let us touch `NODE_EXTRA_CA_CERTS`.
- **No separate Azure Functions project**: adds CI/CD complexity, a second auth integration point, and cold-start latency for no benefit at this scope.

**Server endpoints we will build:**
| Route | Method | Purpose |
|---|---|---|
| `/api/chat` | POST | Accepts `{role, messages}`, streams assistant response with a citation tag at the end |
| `/api/health` | GET | Returns `200 OK` for App Service warm-up + Teams manifest validation |
| `/api/sources` | GET (static) | Serves the three source documents as parsed JSON for the right-hand source panel (read at server startup from `/content/`, cached forever) |

**Don't do:**
- **Edge runtime**: can't load corporate CA cert bundle cleanly, can't do long-lived streams past CDN edge timeouts, zero benefit on a corporate deploy.
- **Separate Express/Fastify backend**: two things to deploy, two things to auth, CORS. Nope.
- **Azure Functions**: fine for event-driven workloads, wrong for a sync chat endpoint where you want the same auth context as the frontend.

**Confidence:** HIGH.

---

## 4. OpenAI / Azure OpenAI Client — **AI SDK v5 `createAzure` with `baseURL` + `headers` override**

### This is the most architecturally-specific decision in the stack. Read carefully.

### Pick: `@ai-sdk/azure` v2 with explicit `baseURL`, `headers: { 'api-key': ... }`, and `useDeploymentBasedUrls: true`.

**The MMC constraint:**
- Production endpoint: `https://stg1.mmc-dallas-int-non-prod-ingress.mgti.mmc.com/coreapi/openai/...`
- Auth: `api-key: <key>` header (NOT `Authorization: Bearer <token>`)
- Path shape: looks like the **legacy Azure deployment path** (`/openai/deployments/{deploymentId}/chat/completions?api-version=...`), routed through a corporate ingress at a non-`*.openai.azure.com` FQDN. We do NOT get the new OpenAI-v1-spec `/openai/v1/chat/completions`-style URL — MMC's gateway fronts the classic deployment-based Azure API.

**Why `createAzure` over the raw `openai` npm SDK:**
- `@ai-sdk/azure` is built on top of `@ai-sdk/openai` and natively emits the `api-key` header (not Bearer). No custom header gymnastics.
- It exposes both `baseURL` (overrides the `resourceName`-based URL entirely) and `useDeploymentBasedUrls` (forces the legacy `/deployments/{id}/path?api-version=...` shape, which is what MMC's gateway expects).
- Tight integration with `useChat` / `streamText` / `generateObject` — the full AI SDK toolchain works off a single provider instance.

**Production config (MMC ingress):**
```ts
// lib/ai/provider.ts
import { createAzure } from '@ai-sdk/azure';

export const azure = createAzure({
  baseURL: process.env.AZURE_OPENAI_BASE_URL,
  //   e.g. https://stg1.mmc-dallas-int-non-prod-ingress.mgti.mmc.com/coreapi/openai
  apiKey: process.env.AZURE_OPENAI_KEY,          // sent as api-key header by @ai-sdk/azure
  apiVersion: process.env.AZURE_OPENAI_API_VERSION ?? '2024-10-21',
  useDeploymentBasedUrls: true,                   // emits /deployments/{id}/chat/completions?api-version=
});

export const chatModel = azure.chat(
  process.env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-4o'
);
```

**Local-dev config (direct OpenAI key, same call site):**
```ts
// lib/ai/provider.ts — branch on env
import { createAzure } from '@ai-sdk/azure';
import { createOpenAI } from '@ai-sdk/openai';

const useDirectOpenAI = process.env.USE_DIRECT_OPENAI === '1';

export const chatModel = useDirectOpenAI
  ? createOpenAI({ apiKey: process.env.OPENAI_API_KEY }).chat('gpt-4o')
  : createAzure({ /* as above */ }).chat(process.env.AZURE_OPENAI_DEPLOYMENT!);
```

Both expose the same `LanguageModelV2` interface — `streamText({ model: chatModel, ... })` is identical in both branches. No adapter layer needed.

**URL assembly verification (the thing to smoke-test in Phase 0):**
With `baseURL = https://stg1.mmc-dallas-int-non-prod-ingress.mgti.mmc.com/coreapi/openai` and `useDeploymentBasedUrls: true`, the SDK will POST to:
```
https://stg1.mmc-dallas-int-non-prod-ingress.mgti.mmc.com/coreapi/openai/deployments/gpt-4o/chat/completions?api-version=2024-10-21
```
This matches the Azure OpenAI classic path. **This assumption must be verified with a curl-equivalent smoke test in Phase 0 (10 min).** If MMC's ingress has an extra path segment, add it to `baseURL`.

**Why NOT the raw `openai` npm SDK:**
- Would work, but then we hand-roll SSE parsing for `useChat`. We already picked the AI SDK for the frontend — use it end-to-end.

**Why NOT `AzureOpenAI` class from the `openai` npm package:**
- Ties us to Azure AD token provider pattern, which doesn't match the simple api-key ingress. `createAzure` is the 2025+ idiomatic choice.

**Don't do:**
- Custom fetch wrapper: fine for 50 lines, wrong for a shipping product. The SDK's retry/timeout/error-parsing is worth keeping.
- LangChain `AzureChatOpenAI`: see LangChain warning above.
- Sending `Authorization: Bearer`: MMC's gateway rejects this (the handover implies the ingress expects `api-key`).

**Confidence:** HIGH on the library choice and the header/URL shape. **MEDIUM** on the exact `baseURL` path suffix — we need a 5-minute smoke test against staging to confirm whether `baseURL` should end in `/openai`, `/coreapi/openai`, or `/coreapi/openai/deployments`. Do this in Phase 0 and pin the finding before writing any real code.

---

## 5. Auth — **@azure/msal-browser v4 + @azure/msal-react v5 with NAA (Nested App Authentication)**

### This is the key architectural win for the web + Teams dual-deploy.

### Pick: NAA (`createNestablePublicClientApplication`) with a graceful fallback to standard MSAL popup/redirect for the standalone-web case.

**Why NAA:**
- **NAA is now GA across Teams, Outlook, and M365** (announced 2025, fully rolled out before April 2026). It is Microsoft's explicit current recommendation for SPA-shaped tabs and Add-ins.
- **No backend token exchange**: our frontend calls `acquireTokenSilent` and gets a token for the Entra app's own resource. Zero OBO glue, no `/api/token-exchange` endpoint, no middle-tier.
- **Same client-side code path works in Teams and standalone web**: MSAL's `createNestablePublicClientApplication` returns a public client that behaves like a regular `PublicClientApplication` when NAA isn't available (i.e., we're in a browser tab outside Teams), falling back to the usual popup/redirect flow.
- **Drops the legacy `getAuthToken` / `tab-sso` OBO pattern entirely** — that pattern required a server endpoint that exchanged a Teams token for a Graph-or-downstream token. With NAA we bypass it.
- **Versions:** `@azure/msal-browser@4.x` and `@azure/msal-react@5.x` (v5 dropped React 18, requires React 19.2+ — which matches our React 19.2 pick above).

**What we register in Entra:**
1. **One app registration** (SPA platform, not Web or API):
   - Redirect URIs (SPA type):
     - `https://kbassist.mmc.com/` (production web)
     - `https://localhost:3000/` (dev)
     - `brk-multihub://kbassist.mmc.com` (NAA broker URI — this is the magic piece)
   - API permissions: `User.Read` delegated (for `name` / `upn` / `email`; that's all we need).
   - Expose an API with `Application ID URI = api://kbassist.mmc.com/{client-id}` (required for the manifest's `webApplicationInfo.resource`, even though NAA doesn't use it for actual token exchange — Teams cross-checks it).

**MSAL initialization (single module, works in both hosts):**
```ts
// lib/auth/msal.ts
import {
  createNestablePublicClientApplication,
  type IPublicClientApplication,
} from '@azure/msal-browser';
import { app as teamsApp } from '@microsoft/teams-js';

const msalConfig = {
  auth: {
    clientId: process.env.NEXT_PUBLIC_ENTRA_CLIENT_ID!,
    authority: `https://login.microsoftonline.com/${process.env.NEXT_PUBLIC_ENTRA_TENANT_ID}`,
    redirectUri: typeof window !== 'undefined' ? window.location.origin : '',
    supportsNestedAppAuth: true,   // key flag — lights up NAA when host is Teams
  },
};

let pca: IPublicClientApplication | null = null;

export async function initMsal(): Promise<IPublicClientApplication> {
  if (pca) return pca;

  // Initialize Teams FIRST (per Microsoft guidance for NAA).
  // This no-ops cleanly when running outside Teams.
  try {
    await teamsApp.initialize();
  } catch { /* not in Teams host — fine, MSAL falls back to standard flow */ }

  pca = await createNestablePublicClientApplication(msalConfig);
  return pca;
}
```

**React integration:**
```tsx
// app/providers.tsx
'use client';
import { MsalProvider } from '@azure/msal-react';
import { useEffect, useState } from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
  const [pca, setPca] = useState<IPublicClientApplication | null>(null);
  useEffect(() => { initMsal().then(setPca); }, []);
  if (!pca) return null;  // or a skeleton
  return <MsalProvider instance={pca}>{children}</MsalProvider>;
}
```

**Why NOT App Service Easy Auth:**
- Easy Auth is a great option for server-rendered apps with no frontend auth state. But we have an SPA shape (client-side `useChat` state, client-side role selection, client-side Teams detection). Easy Auth would give us an `X-MS-CLIENT-PRINCIPAL-NAME` header on API routes but wouldn't solve the Teams-tab SSO story — inside Teams, Easy Auth redirects would break the iframe. We'd still need MSAL for Teams. So we'd have two auth systems; the simplification is illusory.
- **One exception:** we WILL enable Easy Auth as a defense-in-depth layer on the App Service to require an authenticated Entra session before any request reaches Next.js. MSAL handles user-facing auth state; Easy Auth prevents unauthenticated traffic from hitting our routes at all. Both layers check the same tenant, so they compose cleanly.

**Why NOT `@auth/core` (Auth.js) with Entra provider:**
- Auth.js does server-side session cookies, which work fine for web but are awkward inside a Teams iframe (SameSite/cookie-partitioning issues under the Teams desktop WebView2 host). MSAL with NAA is designed for this; Auth.js is not.
- Auth.js's Entra provider is OAuth code-flow-based and doesn't expose the `acquireTokenSilent` primitive we'd need if we ever want to call Graph.

**Don't do:**
- Legacy `microsoftTeams.authentication.getAuthToken()` + server-side OBO flow: still works but adds a server endpoint and is explicitly deprecated in favor of NAA for new builds.
- Roll our own OIDC: you're joking.

**Confidence:** HIGH. NAA is the documented, GA, Microsoft-recommended path for this exact scenario as of 2026.

---

## 6. Teams Integration — **@microsoft/teams-js v2.52+ + schema 1.22 manifest**

### Pick: `@microsoft/teams-js@^2.52.0`; Teams app manifest version `1.22` with `nestedAppAuthInfo` for token prefetch.

**Why this version:**
- **2.52 is the current release** (April 2026), supports NAA, supports M365 host extension (so the same manifest works in Teams + Outlook + M365.com if we ever want it).
- **Schema 1.22 unlocks NAA token prefetching** via `webApplicationInfo.nestedAppAuthInfo` — the host pre-acquires the token during tab load, eliminating the first-render auth flash.

**Minimum manifest shape (`teams/manifest.json`):**
```json
{
  "$schema": "https://developer.microsoft.com/en-us/json-schemas/teams/v1.22/MicrosoftTeams.schema.json",
  "manifestVersion": "1.22",
  "version": "1.0.0",
  "id": "<generated-GUID>",
  "developer": {
    "name": "MMC Colleague Technology",
    "websiteUrl": "https://kbassist.mmc.com",
    "privacyUrl": "https://kbassist.mmc.com/privacy",
    "termsOfUseUrl": "https://kbassist.mmc.com/terms"
  },
  "name": { "short": "KB Assist", "full": "KB Knowledge Assistant" },
  "description": { "short": "...", "full": "..." },
  "icons": { "color": "color.png", "outline": "outline.png" },
  "accentColor": "#0066CC",
  "staticTabs": [{
    "entityId": "kbassist-home",
    "name": "KB Assist",
    "contentUrl": "https://kbassist.mmc.com/",
    "scopes": ["personal"]
  }],
  "validDomains": ["kbassist.mmc.com"],
  "webApplicationInfo": {
    "id": "<entra-client-id>",
    "resource": "api://kbassist.mmc.com/<entra-client-id>",
    "nestedAppAuthInfo": [{
      "redirectUri": "brk-multihub://kbassist.mmc.com",
      "scopes": ["openid", "profile", "offline_access", "User.Read"],
      "claims": "{}"
    }]
  }
}
```

**Teams SDK usage in the app:**
- Call `teamsApp.initialize()` once on mount, before MSAL (per Microsoft's guidance).
- Use `teamsApp.getContext()` to detect Teams theme (default/dark/contrast) and wire it to Tailwind dark-mode class — this is the one cross-host cosmetic that matters.
- Host detection for logging: `(await teamsApp.getContext()).app.host.name` returns "Teams" / "Outlook" / "Office" / undefined — tag every telemetry event with it.

**Don't do:**
- **Teams Toolkit (`@microsoft/teamsapp-cli`) scaffolding**: adds a layer of indirection, uses older MSAL patterns, and assumes an OBO backend. We're not using the toolkit's auth story — just its manifest schema. Hand-write the manifest.
- **Older schema (<1.22)**: loses NAA prefetching.

**Confidence:** HIGH.

---

## 7. Hosting — **Azure App Service (Linux, Node 20.9+) with Next.js standalone output**

### Pick: Linux App Service, Premium v3 P0v3 or P1v3 tier, `output: 'standalone'` build, GitHub Actions deploy.

**Why App Service over Static Web Apps:**
- **Static Web Apps' Next.js hybrid support is still labeled with "preview" limitations in 2026** — 250 MB app size cap, limits on long-running streaming, occasional App-Router RSC edge cases. For a small internal app where we need SSE streaming to work reliably against a corporate ingress, **pay the 2 minutes of extra setup to be on a fully-supported platform**.
- **App Service gives us `NODE_EXTRA_CA_CERTS` support** — if MMC's ingress presents a corporate root CA, we drop the PEM file into the deploy and set the env var. SWA can do this too but with more friction.
- **App Service supports VNet integration + Private Endpoint** if the ingress is network-restricted. SWA's private-link story is weaker.
- **Deploy slots** for zero-downtime blue-green (swap staging → prod).
- **Easy Auth** is a first-class App Service feature (see auth section — we use it as belt-and-braces).

**Why NOT Static Web Apps:**
- Preview-quality Next.js hybrid.
- Weaker networking story for corporate ingress.
- We'd still need App Service to host long-running streaming reliably.
- Doesn't give us much for the session-only, no-CDN-benefit shape of this app.

**Why NOT Container Apps / AKS:**
- Massive overkill for a Next.js app with a single node process and no horizontal scale needs (internal app, expected low-to-medium traffic).

**Why NOT Azure Functions:**
- Cold start on a chat UX is user-hostile. Sync HTTP + Next.js route handlers = zero cold start on warm App Service.

**Build configuration (`next.config.ts`):**
```ts
import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  output: 'standalone',            // produces a minimal ~50 MB deploy
  experimental: {
    // cacheComponents not needed — we have no cached data fetches
  },
  // If Teams app embeds us in an iframe, which it does:
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'Content-Security-Policy', value: "frame-ancestors 'self' https://teams.microsoft.com https://*.teams.microsoft.com https://*.microsoft365.com https://outlook.office.com https://outlook.office365.com;" },
      ],
    }];
  },
};
export default nextConfig;
```

**Startup command on App Service:**
```bash
node server.js   # from .next/standalone/, after copying public/ and .next/static into it
```

**CI/CD — GitHub Actions sketch:**
```yaml
# .github/workflows/deploy.yml
name: Deploy
on: { push: { branches: [main] } }
jobs:
  build-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20.9', cache: 'npm' }
      - run: npm ci
      - run: npm run test
      - run: npm run evals      # custom script — see Testing section
      - run: npm run build
      - run: |
          cp -r public .next/standalone/
          cp -r .next/static .next/standalone/.next/
      - uses: azure/webapps-deploy@v3
        with:
          app-name: kbassist-prod
          slot-name: staging
          package: .next/standalone/
          publish-profile: ${{ secrets.AZURE_PUBLISH_PROFILE }}
      - run: az webapp deployment slot swap ... # after smoke tests
```

**Confidence:** HIGH.

---

## 8. Testing — **Vitest + custom grounding-eval suite as the primary quality gate; Playwright smoke only**

### This is the most opinionated pick in the doc. Read before skimming.

**The insight:** For this product, the thing that breaks is not the UI. The thing that breaks is "the model generated an answer that isn't in the source documents." UI tests do nothing for that. **Grounding evals are the primary quality gate.**

### Three test layers, in decreasing order of importance:

#### Layer 1 — **Grounding evals** (PRIMARY, blocks deploys)
Custom Vitest suite in `evals/` that drives the real `/api/chat` handler (with a mocked Azure OpenAI response OR, in a nightly job, the real endpoint in staging) against a fixture set:

```ts
// evals/grounding.test.ts
import { describe, it, expect } from 'vitest';
import { POST } from '@/app/api/chat/route';

const fixtures = [
  {
    role: 'author',
    question: 'What goes in the Resolution field?',
    mustCiteDoc: 'KB0020882',
    mustCiteSection: /resolution/i,
    mustMention: ['Configuration Item', 'SME', 'assignment group'],
    mustNotMention: ['password', 'external download'],  // security rule
  },
  // ~40 fixtures across the two roles covering the suggested-prompts grid (section 16)
  // plus adversarial prompts: "summarise the KB" (out of scope), "what's the weather" (off-topic), etc.
];

describe('grounding evals', () => {
  for (const fx of fixtures) {
    it(`[${fx.role}] ${fx.question}`, async () => {
      const res = await POST(new Request('http://t/api/chat', {
        method: 'POST',
        body: JSON.stringify({ role: fx.role, messages: [{role:'user', content: fx.question}] }),
      }));
      const text = await res.text();
      expect(text).toMatch(fx.mustCiteSection);
      expect(text).toContain(fx.mustCiteDoc);
      fx.mustMention?.forEach(m => expect(text).toContain(m));
      fx.mustNotMention?.forEach(m => expect(text).not.toContain(m));
    });
  }
});
```

**This suite is what proves the "Authors produce better articles" success metric is achievable.** It's also the regression net when we upgrade the model or tweak the system prompt.

#### Layer 2 — **Unit tests** (Vitest + RTL)
- System-prompt assembly logic (role → prompt, document formatting).
- Citation extractor (parse the `[SOURCE: KB0020882 § Resolution]` tag out of the stream).
- Source-panel section-router (which document + section given a citation).
- MSAL init fallback logic (Teams vs standalone).

#### Layer 3 — **Playwright smoke** (2-3 tests, not comprehensive)
- Role-select screen renders and both cards click.
- Send a message, see a response stream, source panel opens.
- Change role resets conversation.

**Version pins:** `vitest@^3`, `@testing-library/react@^17`, `@vitejs/plugin-react@^5`, `@playwright/test@^1.51`.

**Don't do:**
- **Chasing 80%+ UI coverage**: the UI is a thin shell over a streaming hook. High UI coverage on this product is test-theatre.
- **Jest**: slower, more config, nothing Vitest doesn't do better for Vite/Next projects in 2026.

**Confidence:** HIGH.

---

## 9. Observability — **Azure Monitor OpenTelemetry Distro + anonymized custom events**

### Pick: `@azure/monitor-opentelemetry@1.x` auto-instrumentation + explicit `customEvents` for anonymized Q&A pair logging.

**Why:**
- **App Service has native Application Insights integration** — connection string via app setting, zero glue.
- **OpenTelemetry distro is Microsoft's current-recommended approach** (2024+) over the classic `applicationinsights` npm package. Auto-instruments HTTP, fetch (the outgoing Azure OpenAI calls), and logs.
- **Custom events are the mechanism for the anonymized-Q&A-for-product-metrics requirement** from PROJECT.md's success metric. We log enough to measure product quality without storing user-identifying history.

**The anonymized Q&A telemetry pattern (this is how we measure "authors produce better articles"):**

```ts
// lib/telemetry/qa-event.ts
import { metrics, trace } from '@opentelemetry/api';
import { createHash } from 'node:crypto';

const tracer = trace.getTracer('kbassist');

export function logQaEvent(params: {
  role: 'consumer' | 'author';
  userUpnHash: string;        // SHA-256 of UPN — stable per-user but not reversible
  turnIndex: number;
  question: string;
  answerCitedDoc: string | null;
  answerCitedSection: string | null;
  answerWasFallback: boolean; // true if the model hit the "not in loaded docs" branch
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  host: 'teams' | 'web';
}) {
  const span = tracer.startSpan('qa.turn');
  span.setAttributes({
    'kb.role': params.role,
    'kb.user_hash': params.userUpnHash,
    'kb.turn_index': params.turnIndex,
    'kb.question_length': params.question.length,
    'kb.question_hash': sha256(params.question),   // dedup identical questions across users
    'kb.cited_doc': params.answerCitedDoc ?? 'none',
    'kb.cited_section': params.answerCitedSection ?? 'none',
    'kb.was_fallback': params.answerWasFallback,
    'kb.prompt_tokens': params.promptTokens,
    'kb.completion_tokens': params.completionTokens,
    'kb.latency_ms': params.latencyMs,
    'kb.host': params.host,
  });
  span.end();
}

function sha256(s: string) {
  return createHash('sha256').update(s).digest('hex').slice(0, 16);
}
```

**What this gives us (queryable in App Insights Kusto):**
- Which questions get asked most (by hash).
- Which sections of which docs get cited most (author coverage heatmap).
- Fallback rate (% of turns that couldn't be answered from the docs → gap analysis).
- Author vs consumer usage split.
- P50/P95 latency.
- Token spend per turn → cost forecasting.
- **No user content is stored.** Question hashes are deterministic but one-way; UPN hashes are salted per-env.

**Log retention:** App Service → App Insights default 90 days is fine for this scope.

**Don't do:**
- **Persist full Q&A transcripts to a DB**: violates the "session-only, no DB" non-negotiable and creates a GDPR-adjacent data store.
- **Log raw questions as string properties**: even "internal" enterprise apps accidentally log sensitive data; hash by default, let yourself be surprised by it later if you ever need content review via a deliberate opt-in.
- **`winston` / `bunyan`**: fine, but `pino` is faster and AppInsights auto-collects it equivalently.

**Confidence:** HIGH.

---

## 10. Full `package.json` dependency pin (the prescriptive answer)

```json
{
  "dependencies": {
    "next": "^16.0.0",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "ai": "^5.0.0",
    "@ai-sdk/react": "^2.0.0",
    "@ai-sdk/azure": "^2.0.0",
    "@ai-sdk/openai": "^2.0.0",
    "@azure/msal-browser": "^4.0.0",
    "@azure/msal-react": "^5.3.0",
    "@microsoft/teams-js": "^2.52.0",
    "@azure/monitor-opentelemetry": "^1.0.0",
    "@opentelemetry/api": "^1.9.0",
    "pino": "^9.0.0",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@types/node": "^20.9",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/postcss": "^4.0.0",
    "vitest": "^3.0.0",
    "@testing-library/react": "^17.0.0",
    "@testing-library/jest-dom": "^6.0.0",
    "@vitejs/plugin-react": "^5.0.0",
    "jsdom": "^26.0.0",
    "@playwright/test": "^1.51.0",
    "eslint": "^9.0.0",
    "eslint-config-next": "^16.0.0",
    "prettier": "^3.0.0"
  },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "node server.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "evals": "vitest run evals/",
    "e2e": "playwright test",
    "lint": "next lint",
    "typecheck": "tsc --noEmit"
  }
}
```

---

## What NOT to Use (the roll-up)

| Avoid | Why | Use Instead |
|---|---|---|
| LangChain / LangGraph | Over-abstracts stuffed-context grounding; obscures the system prompt; makes evals harder | `streamText()` from AI SDK + a well-formed system prompt |
| Vector DB (Pinecone, Azure AI Search, pgvector, Chroma) | Three docs. Fits in 40K tokens. Stuff the whole thing. | System prompt concatenation |
| Embeddings (`text-embedding-*`) | No retrieval needed | — |
| Next.js Pages Router | Legacy; no RSC, no streaming-first design | App Router |
| Next.js 15 | N-1 on day one of a greenfield build | Next.js 16 |
| Vite + Express/Fastify | Splits frontend/backend, doubles deploy, zero benefit at this scope | Next.js full-stack |
| Assistant UI / Copilot Kit | Opinionated, heavyweight, wrong shape for 2-doc Q&A | `useChat` + hand-rolled shell on shadcn |
| Auth.js / NextAuth Entra provider | Server-cookie auth doesn't work cleanly inside Teams iframe | MSAL + NAA |
| Teams Toolkit scaffolding | Pulls in OBO-flow assumptions that NAA replaces | Hand-written manifest + MSAL |
| Legacy Teams `getAuthToken` OBO flow | Deprecated in favor of NAA; requires server token exchange | NAA via `createNestablePublicClientApplication` |
| Azure Static Web Apps | Next.js hybrid still preview-flavored; weaker corporate-network story | App Service Linux |
| Azure Functions for chat endpoint | Cold-start on chat is user-hostile | Next.js Route Handler on warm App Service |
| Edge runtime for `/api/chat` | Can't load corporate CA, stream timeouts, no benefit | Node runtime (default) |
| `AzureOpenAI` class from `openai` package | Assumes Azure AD token provider; awkward against simple api-key ingress | `@ai-sdk/azure` `createAzure` |
| Prisma/Drizzle/Postgres/Mongo | Session-only state; no persistence requirement | `useChat` client state + `sessionStorage` |
| Jest | Slower, more config, no benefit over Vitest on Vite-era tooling | Vitest |
| Persisting Q&A transcripts | Violates session-only constraint; GDPR surface area | Anonymized custom events to AppInsights |
| `winston` / `bunyan` (over `pino`) | Slower, more legacy patterns | `pino` + AppInsights auto-collect |

---

## Version Compatibility Notes

| Pair | Compatible? | Notes |
|---|---|---|
| Next 16 + React 19.2 | ✅ | React 19.2 is the bundled version in Next 16 |
| `@azure/msal-react@5` + React 19.2 | ✅ | v5 explicitly requires React 19.2+; dropped 18 |
| `@azure/msal-browser@4` + NAA | ✅ | NAA requires `supportsNestedAppAuth: true` + `createNestablePublicClientApplication` |
| `@microsoft/teams-js@2.52` + manifest `1.22` | ✅ | 1.22 is required for `nestedAppAuthInfo` prefetch |
| AI SDK v5 + Next 16 Route Handlers | ✅ | `toUIMessageStreamResponse()` returns a standard `Response` |
| Tailwind v4 + Next 16 | ✅ | Use `@tailwindcss/postcss` plugin, not the v3 plugin |
| App Service Linux Node 20.9 + Next 16 standalone | ✅ | Matches Next 16's minimum Node version |
| `ai@5` + `@ai-sdk/azure@2` | ✅ | Major versions aligned |

---

## Stack Patterns by Variant

**If MMC's ingress turns out to require a path segment other than `/coreapi/openai`:**
- Adjust `AZURE_OPENAI_BASE_URL` env var only. Everything else stays. (This is why we isolated the provider in `lib/ai/provider.ts`.)

**If MGTI later exposes an OpenAI-v1-spec-compatible endpoint (not legacy deployment path):**
- Set `useDeploymentBasedUrls: false`. Nothing else changes.

**If we later need to call Microsoft Graph (e.g. to surface the user's display name in the header):**
- Add `User.Read` to the MSAL `accessTokenRequest.scopes`. NAA already supports it. No new Entra config.

**If the app needs to extend to Outlook or M365 hosts (future):**
- Change `staticTabs` scopes in the manifest to include `"groupChat"` or `"team"`. The code already works because we're using NAA. Zero code changes required.

**If traffic grows and we need horizontal scale:**
- App Service scale-out. Session state is client-only, so N instances are trivially load-balanceable.

---

## Phase 0 Smoke Tests (things to verify before any real code)

These are the "MEDIUM confidence" items — verify them in under 30 min total, then pin.

1. **Exact Azure ingress URL shape** — curl (or PowerShell `Invoke-WebRequest`) against MMC's ingress with `api-key` header, a known deployment name, and a trivial chat payload. Confirm the exact path prefix `baseURL` needs. **Blocks all AI work until confirmed.**
2. **Corporate root CA** — does Node's `fetch` trust the ingress cert out of the box, or do we need `NODE_EXTRA_CA_CERTS`? If the latter, get the PEM now.
3. **Entra admin consent** — who in MMC's AAD admin team grants consent for a new app registration with `User.Read` + SPA redirects (including the `brk-multihub://` URI)? NAA needs that redirect-URI type which some tenants have lock-down policies on.
4. **App Service Premium tier provisioning** — who provisions? What region? Is VNet integration required by MMC's ingress?
5. **Teams admin policy** — can an MMC dev sideload a personal-scope Teams app for testing, or does every change require going through Teams Admin Center? Gates the iteration loop.

---

## Sources

- [Next.js 16 release notes (Oct 2025)](https://nextjs.org/blog/next-16) — HIGH confidence on framework choice and React 19.2 pairing
- [AI SDK Providers: Azure OpenAI](https://ai-sdk.dev/providers/ai-sdk-providers/azure) — HIGH on `createAzure`, `baseURL`, `useDeploymentBasedUrls`, `api-key` header
- [AI SDK v5 announcement (Vercel)](https://vercel.com/blog/ai-sdk-5) — HIGH on `useChat` + `toUIMessageStreamResponse` contract
- [SSO authentication for nested apps — Microsoft Learn](https://learn.microsoft.com/en-us/microsoftteams/platform/concepts/authentication/nested-authentication) — HIGH on NAA, `createNestablePublicClientApplication`, manifest `nestedAppAuthInfo`, `brk-multihub://` redirect URI
- [Nested App Authentication GA announcement (Microsoft 365 Dev Blog)](https://devblogs.microsoft.com/microsoft365dev/nested-app-authentication-now-generally-available-across-microsoft-365/) — HIGH on NAA being the recommended 2026 path
- [@azure/msal-react on npm](https://www.npmjs.com/package/@azure/msal-react) — HIGH on v5.3 + React 19.2+ requirement
- [@microsoft/teams-js on npm](https://www.npmjs.com/package/@microsoft/teams-js) — HIGH on 2.52 current version
- [@microsoft/teams-js CHANGELOG](https://github.com/OfficeDev/microsoft-teams-library-js/blob/main/packages/teams-js/CHANGELOG.md) — HIGH on versioning
- [Teams app manifest — Update Manifest to Enable SSO for Tabs](https://learn.microsoft.com/en-us/microsoftteams/platform/tabs/how-to/authentication/tab-sso-manifest) — HIGH on `webApplicationInfo` shape
- [OpenAI Compatible Providers: Custom Providers (AI SDK)](https://ai-sdk.dev/providers/openai-compatible-providers/custom-providers) — HIGH on custom header override pattern
- [Next.js deployment to Azure App Service Linux (modern42, 2026)](https://www.modern42.com/blog/deploy-next-js-16-pnpm-linux-azure-web-app) — HIGH on standalone output deploy shape
- [Next.js on Azure Static Web Apps (Microsoft Learn)](https://learn.microsoft.com/en-us/azure/static-web-apps/deploy-nextjs-hybrid) — used to justify NOT picking SWA (preview-flavored hybrid support)
- [Azure App Service Authentication and Authorization (Easy Auth)](https://learn.microsoft.com/en-us/azure/app-service/overview-authentication-authorization) — HIGH on belt-and-braces Easy Auth layer
- [Application Insights OpenTelemetry overview](https://learn.microsoft.com/en-us/azure/azure-monitor/app/app-insights-overview) — HIGH on observability pattern
- [Vitest vs Jest vs Playwright 2026 comparison (DevToolReviews)](https://www.devtoolreviews.com/reviews/vitest-vs-jest-vs-playwright-2026-comparison) — MEDIUM confidence but consistent with other sources on Vitest as current default
- [Tailwind v4 + shadcn/ui integration docs](https://ui.shadcn.com/docs/tailwind-v4) — HIGH on Tailwind v4 production readiness
- Project handover document at `C:\kbroles\info\KB_Assistant_ClaudeCode_Handover.md` — sections 14–16 (UI spec), 18 (integration notes)
- Project constraints from user prompt: MMC ingress URL shape, `api-key` header auth, gpt-4o, session-only state, Web + Teams tab dual deploy

---

*Stack research for: role-aware source-grounded enterprise chat assistant*
*Researched: 2026-04-22*
