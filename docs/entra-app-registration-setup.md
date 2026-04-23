# Entra App Registration Setup — KB Assistant

This document is the one-time manual setup the KB Assistant owner performs in the MMC Entra tenant admin portal AFTER the code is pushed to the repo and the on-prem Windows deploy is ready (see `docs/deploy-windows.md`).

**Time required:** ~20 minutes.

**Prerequisites:** Entra admin role in the MMC tenant (Application Administrator OR Cloud Application Administrator OR Global Administrator). If you don't have this, file a ticket with the MMC IT Identity team.

**What you're creating:** a new App Registration named `KB Assistant` with:
- Platform: `Web` (NOT Single-page application — the old Phase-5 SPA registration is superseded by Phase 5.1)
- Redirect URI: `https://<app-host>/api/auth/callback` (exact match — see **Pitfall 4** below)
- Client secret (stored in AWS Secrets Manager, not in source control)
- App Role `KbAssistant.User` (access gate — see **Pitfall 5** below)
- Pilot users/group assigned to the App Role in Enterprise Applications

Throughout this doc, `<app-host>` is a placeholder for the Windows Server FQDN that serves the app (e.g. `usdf11v1784.mercer.com`). Replace every occurrence with your real host before you click anything.

---

## Step 1 — Create the App Registration

1. Sign in to https://entra.microsoft.com with your Entra admin account.
2. Navigate: **Identity → Applications → App registrations → New registration**.
3. Fill in the form:
   - **Name:** `KB Assistant`
   - **Supported account types:** `Accounts in this organizational directory only (Single tenant)` — if MMC is the only tenant; choose differently only if your tenant topology requires guests/B2B.
   - **Redirect URI:**
     - Platform: `Web`
     - URI: `https://<app-host>/api/auth/callback`
     - Replace `<app-host>` with your Windows Server FQDN. This value MUST match `APP_BASE_URL` in the deployed env **exactly** — no trailing slash, no port suffix, no path variation. **Pitfall 4** — even a single-character mismatch causes `AADSTS50011` at login.
4. Click **Register**.
5. On the Overview page, copy the **Application (client) ID** and **Directory (tenant) ID**. Save both — they become `ENTRA_CLIENT_ID` and `ENTRA_TENANT_ID` in AWS Secrets Manager (see Step 6).

**How you know it worked:** the Overview page shows the app name, client ID, tenant ID, and the redirect URI `https://<app-host>/api/auth/callback` listed under "Redirect URIs" with platform `Web`.

---

## Step 2 — Create a Client Secret

1. Still on the App Registration page, click **Certificates & secrets** in the left nav.
2. Click **Client secrets → New client secret**.
3. Description: `kb-assistant-bff-secret` (or any name — this is operator-visible only).
4. Expires: `24 months` (or per MMC policy — set a rotation reminder in your calendar for 60 days before expiry).
5. Click **Add**.
6. **IMPORTANT:** Copy the `Value` column IMMEDIATELY. This is the only time Entra will display it — if you close the page without copying, you must delete and create a new secret. Save this value as `ENTRA_CLIENT_SECRET` in your notes (it will be written to AWS Secrets Manager in Step 6).

**How you know it worked:** the secret appears in the "Client secrets" list with an expiry date. Treat the copied secret value like a password — anyone with it can impersonate the app.

---

## Step 3 — Define the App Role

The App Role `KbAssistant.User` is the access gate. Only users assigned this role will receive `roles: ["KbAssistant.User"]` in their id_token — the middleware allows them through. Users without the role receive `roles: undefined`, which the middleware coerces to `[]` per **Pitfall 5** and returns `forbidden`.

1. Click **App roles** in the left nav.
2. Click **Create app role**.
3. Fill in:
   - **Display name:** `KB Assistant User`
   - **Allowed member types:** `Users/Groups`
   - **Value:** `KbAssistant.User` ← This exact string must match the `REQUIRED_ROLE` constant in `src/app/api/_middleware.ts`. Do not change casing, do not add spaces, do not add a prefix.
   - **Description:** `Access to KB Assistant pilot`
   - **Do you want to enable this app role?** CHECKED.
4. Click **Apply**.

**How you know it worked:** the App Role `KbAssistant.User` appears in the list with status "Enabled". Later, once you finish Steps 4–6 and deploy, a user with this role assigned will see `id_token.roles == ["KbAssistant.User"]` (verified indirectly via successful sign-in); a user without the role will see `roles` absent from the token entirely — the BFF coerces to `[]` and returns `forbidden`.

---

## Step 4 — Grant API Permissions

1. Click **API permissions** in the left nav.
2. The default `Microsoft Graph → User.Read` (Delegated) is usually present after Step 1. If it's missing, click **Add a permission → Microsoft Graph → Delegated permissions → User.Read → Add permissions**.
3. The implicit permissions `openid`, `profile`, `email` are required by the auth code flow. Click **Add a permission → Microsoft Graph → Delegated permissions** → tick `openid`, `profile`, `email` → **Add permissions**.
4. Click **Grant admin consent for <MMC tenant name>**. Confirm. All four permissions (`openid`, `profile`, `email`, `User.Read`) should show status "Granted for <tenant>" with green checkmarks.

**How you know it worked:** all four permissions show "Granted" status with green checkmarks. Without admin consent, users see a consent prompt at first sign-in which is a poor pilot experience; with admin consent, the flow is silent.

---

## Step 5 — Assign Pilot Users/Group to the App Role

This is the step that actually controls who can sign in. Without it, even users in the correct tenant with the App Role defined are still blocked — Entra only sends the `roles` claim for users who are explicitly assigned to the role.

1. Navigate to **Identity → Applications → Enterprise applications** (note: different from App registrations — the Enterprise Application is the user-facing side).
2. Find `KB Assistant` in the list (search by name). The Enterprise Application was auto-created when you registered the App in Step 1.
3. Click **Users and groups → Add user/group**.
4. Under "Users and groups": select the pilot security group (preferred) or individual users. Ask MMC IT Identity for the appropriate pilot group name, or create a new security group named e.g. `KB-Assistant-Pilot` in Entra.
5. Under "Select a role": select `KB Assistant User` (the role defined in Step 3).
6. Click **Assign**.

**Optional hardening:** navigate to **Properties** of the same Enterprise Application and set **Assignment required?** to `Yes`. This means ONLY users in the assigned group can sign in at all — non-assigned MMC users get blocked at the Entra sign-in screen before they even reach the app. Recommended for the pilot.

**How you know it worked:** the pilot group appears in **Users and groups** with the role `KB Assistant User` next to it. If you used the "Assignment required" hardening above, a user NOT in the pilot group who tries to sign in will be blocked by Entra with a message like "You can't sign in here" — they never reach the app's middleware.

---

## Step 6 — Write Secrets to AWS Secrets Manager

Three values from Steps 1–2 go to AWS Secrets Manager:

- `ENTRA_CLIENT_ID` (Step 1)
- `ENTRA_TENANT_ID` (Step 1)
- `ENTRA_CLIENT_SECRET` (Step 2)

You also need to generate/gather these values:

- `SESSION_SECRET` — 64-character random string (iron-session AES key). Generate with `openssl rand -base64 48` or equivalent. Must be unique per deployment environment.
- `LLM_API_KEY` — MGTI API key (obtain from the MGTI team if not already on the box).
- `LLM_BASE_URL` — MGTI endpoint URL.

Create (or update) the secret via the AWS CLI. This is the primary path because it's scriptable, auditable, and less error-prone than the Console. The Console is available as a fallback if you prefer a GUI.

**Primary path — AWS CLI (PowerShell on the Windows box or your laptop with `secretsmanager:CreateSecret` permission):**

```powershell
$body = @{
  SESSION_SECRET = '<64-char-random>'
  ENTRA_CLIENT_ID = '<client-id-from-step-1>'
  ENTRA_TENANT_ID = '<tenant-id-from-step-1>'
  ENTRA_CLIENT_SECRET = '<client-secret-from-step-2>'
  LLM_API_KEY = '<mgti-api-key>'
  LLM_BASE_URL = '<mgti-endpoint>'
} | ConvertTo-Json

aws secretsmanager create-secret `
  --name /mmc/cts/kb-assistant `
  --region us-east-1 `
  --secret-string $body
```

If the secret already exists (you are re-running this doc), swap `create-secret` for `update-secret` and add `--secret-id /mmc/cts/kb-assistant` instead of `--name`:

```powershell
aws secretsmanager update-secret `
  --secret-id /mmc/cts/kb-assistant `
  --region us-east-1 `
  --secret-string $body
```

**Fallback — AWS Console:** navigate to **AWS Console → Secrets Manager → us-east-1 → Store a new secret → Other type of secret**. Paste the JSON body above as the secret value. Name the secret `/mmc/cts/kb-assistant`. No rotation schedule needed (rotation is manual per the policy in the rotation section below).

**How you know it worked:** run this command on the Windows box or any machine with credentials:

```powershell
aws secretsmanager get-secret-value --secret-id /mmc/cts/kb-assistant --region us-east-1
```

The response should contain a `SecretString` field whose JSON matches what you wrote. The app's `loadSecrets()` function will pick up these values at the first call (cold start) after deployment and write them onto `process.env`.

---

## Step 7 — Smoke Test the Sign-in Flow

Once `docs/deploy-windows.md` Steps 1–7 are also done AND the app is deployed and running:

1. In a clean browser window (or Incognito mode — avoids a cached session from a prior run), visit `https://<app-host>/`.
2. You should be redirected to `https://login.microsoftonline.com/<tenant>/oauth2/v2.0/authorize?client_id=<your-client-id>&redirect_uri=https%3A%2F%2F<app-host>%2Fapi%2Fauth%2Fcallback&...`.
3. Sign in with a user who is in the pilot assignment group (Step 5).
4. Consent to the requested scopes on first-ever sign-in (should be silent after admin consent in Step 4).
5. You should land back on `https://<app-host>/` with the role-select screen visible.
6. Open DevTools → Application → Cookies. Confirm a cookie named `kb_session` is present, `HttpOnly: true`, `Secure: true`, `SameSite: Lax`.

**If you see `AADSTS50011`:** the redirect URI in Step 1 doesn't match `APP_BASE_URL + /api/auth/callback` exactly. Fix by editing the App Registration's Authentication → Redirect URIs entry. This is **Pitfall 4** — the #1 cause of first-deploy sign-in failures.

**If you see a 403 / "access restricted" page:** the user is signed in at the Entra level but is missing the `KbAssistant.User` App Role. Verify Step 5 assignment — the user must be in the pilot group AND the pilot group must be assigned the `KB Assistant User` role (not just added as a member of the Enterprise Application).

**If you see `AADSTS7000218`:** the client secret in AWS Secrets Manager is wrong or expired. Regenerate the secret in Step 2, update AWS Secrets Manager (Step 6 with `update-secret`), restart the Scheduled Task (see `docs/deploy-windows.md` — `schtasks /end /tn KbAssistant` then `schtasks /run /tn KbAssistant`).

**If you see a browser error `ERR_SSL_PROTOCOL_ERROR` or cert warnings:** IIS reverse proxy isn't terminating TLS correctly. See `docs/deploy-windows.md` Step 5 (IIS reverse proxy).

---

## Rotation / maintenance

- **Client secret expiry:** set a calendar reminder 60 days before the Step 2 expiry date. Rotation procedure:
  1. Return to **Certificates & secrets** in the App Registration.
  2. Create a second client secret (new `Value` issued). Copy immediately.
  3. Run `aws secretsmanager update-secret --secret-id /mmc/cts/kb-assistant --region us-east-1 --secret-string <new-json-body>` with the new secret value.
  4. Restart the Scheduled Task: `schtasks /end /tn KbAssistant` then `schtasks /run /tn KbAssistant`.
  5. Sign in once with a pilot user to verify the new secret works (should be no visible change — successful login).
  6. ONLY AFTER verified success: delete the old secret in **Certificates & secrets**. Never leave two valid secrets any longer than necessary.

- **Pilot user/group additions:** re-run Step 5 for each new user/group. No app restart needed — the `roles` claim is read fresh from each new id_token.

- **Moving from pilot to v1.1 (additional hosts, Teams integration):** add additional redirect URIs under App Registration → Authentication (example: a second URI `https://<new-host>/api/auth/callback`). Do NOT delete the existing `https://<app-host>/api/auth/callback` URI while the Windows box is still serving traffic. Teams integration (AUTH-03 / DELV-03) is deferred to v1.1 — see `.planning/ROADMAP.md` Phase 5 / Phase 5.1 sections for context.

- **Revoking pilot access:** remove the user/group from **Enterprise applications → KB Assistant → Users and groups**. The next session expiry (~8 hours per iron-session default) will force re-auth, which will fail role check. For immediate revocation, restart the Scheduled Task to invalidate the msal-node CCA cache.

---

## Reference: what each value becomes at runtime

| Entra value | AWS Secrets Manager key | Read by | Used for |
|---|---|---|---|
| Application (client) ID (Step 1) | `ENTRA_CLIENT_ID` | `src/auth/msalClient.ts` | msal-node CCA `clientId` |
| Directory (tenant) ID (Step 1) | `ENTRA_TENANT_ID` | `src/auth/msalClient.ts` | msal-node CCA `authority` (`https://login.microsoftonline.com/<tenant>`) |
| Client secret value (Step 2) | `ENTRA_CLIENT_SECRET` | `src/auth/msalClient.ts` | msal-node CCA `clientSecret` |
| App Role `Value` (Step 3) | (hard-coded in `_middleware.ts`) | `src/app/api/_middleware.ts` | `REQUIRED_ROLE` constant compared to `session.user.roles[]` |
| Redirect URI (Step 1) | (derived from `APP_BASE_URL` env) | `/api/login` + `/api/auth/callback` route handlers | msal-node `redirectUri` parameter (**Pitfall 4** match) |

---

*Last updated: Phase 5.1 — MMC-IT BFF pivot. See `.planning/phases/05.1-mmc-it-bff-pivot-xmcp-pattern/05.1-RESEARCH.md` for architectural rationale and Pitfalls 1–11 reference.*
