# KB Assistant — Teams App Package

This directory contains the Microsoft Teams app manifest for the **KB Assistant** personal tab.
Schema version: **v1.22** (with `webApplicationInfo.nestedAppAuthInfo` — Nested App Authentication).

---

## Files

| File | Purpose | Hard constraint |
|------|---------|-----------------|
| `manifest.json` | Teams app manifest with placeholder tokens (must be substituted before packaging) | Schema 1.22; `nestedAppAuthInfo` MUST be an ARRAY |
| `color.png` | Color icon shown in the Teams app tray | **Exactly 192×192** (Pitfall 5) |
| `outline.png` | Monochrome outline icon (Teams uses it in focus states) | **Exactly 32×32** (Pitfall 5) |

---

## Placeholder substitutions

Before packaging, substitute the following placeholders in `manifest.json`:

| Placeholder | Replace with | Source |
|-------------|--------------|--------|
| `__CLIENT_ID__` | Entra App Registration client-id (GUID) — appears in BOTH top-level `id` and `webApplicationInfo.id` | Azure Portal → Entra → App registrations → Overview |
| `__VALID_DOMAIN__` | App Service hostname, e.g. `kb-assistant.azurewebsites.net` | Azure Portal → App Service → Overview → Default domain |
| `__RESOURCE__` | `https://<AZURE_WEBAPP_HOSTNAME>` | Same host as above, with `https://` prefix |
| `__REDIRECT_URI__` | `brk-multihub://<AZURE_WEBAPP_HOSTNAME>` | NAA redirect URI — this scheme MUST also be registered on the Entra App Registration |
| `__CONTENT_URL__` | `https://<AZURE_WEBAPP_HOSTNAME>/?host=teams` | The `?host=teams` query param is what `detectHost()` uses for Teams-side bootstrap |

On bash:

```bash
HOSTNAME="kb-assistant.azurewebsites.net"
CLIENT_ID="00000000-0000-0000-0000-000000000000"

sed -i.bak \
  -e "s|__CLIENT_ID__|${CLIENT_ID}|g" \
  -e "s|__VALID_DOMAIN__|${HOSTNAME}|g" \
  -e "s|__RESOURCE__|https://${HOSTNAME}|g" \
  -e "s|__REDIRECT_URI__|brk-multihub://${HOSTNAME}|g" \
  -e "s|__CONTENT_URL__|https://${HOSTNAME}/?host=teams|g" \
  manifest.json
rm -f manifest.json.bak
```

Do NOT commit the substituted manifest — the checked-in file stays parametric so the repo is environment-agnostic.

---

## Packaging

From the `teams/` directory (after placeholder substitution):

```bash
zip -j kb-assistant.zip manifest.json color.png outline.png
```

**The `-j` (junk paths) flag is MANDATORY** (Pitfall 5 / anti-pattern).
Teams Admin Center rejects the package if the zip contains `teams/manifest.json` instead of a root-level `manifest.json`. Using `zip -j` strips the directory prefix so the zip contents are:

```
kb-assistant.zip
├── manifest.json
├── color.png
└── outline.png
```

Verify:

```bash
unzip -l kb-assistant.zip
# Must show manifest.json, color.png, outline.png at root (no teams/ prefix).
```

---

## Sideload

1. Open the **Microsoft Teams Admin Center** (https://admin.teams.microsoft.com).
2. Navigate to **Teams apps → Manage apps**.
3. Click **Upload custom app**.
4. Select `kb-assistant.zip`.
5. Once accepted, edit the pilot **app permission policy** to allow the app.
6. Assign the policy to the pilot user cohort via **Teams apps → Permission policies**.
7. The app appears for pilot users in their Teams personal-app tray within a few minutes.

---

## Pitfall-9 manual test matrix

After sideload, run this matrix. All **REQUIRED** cells must pass to close Phase 5 Success Criterion #2.

Workflow per cell:
1. Open KB Assistant in the Teams client/surface under test.
2. Silent sign-in should occur via NAA (no popup, no second sign-in prompt).
3. Select a role (e.g. Consumer).
4. Ask: "What goes in the Resolution field?"
5. Verify the answer streams with at least one citation chip.
6. Click the chip → source panel opens to the cited section.

| Client | Platform | Status | Notes |
|--------|----------|--------|-------|
| Teams Desktop | Windows | **REQUIRED** (SC#2) | Primary target — MMC staff install |
| Teams Desktop | macOS | **REQUIRED** (SC#2) | Second primary target |
| Teams Web | Microsoft Edge | **REQUIRED** (SC#2) | Web fallback for users without desktop Teams |
| Teams Web | Chrome | **REQUIRED** (SC#2) | Second web browser |
| Teams Mobile | iOS | BEST-EFFORT | NAA may fall back to popup; acceptable if answer renders |
| Teams Mobile | Android | BEST-EFFORT | Same as iOS |

Record pass/fail per cell in the Phase-5 SUMMARY. Any REQUIRED-cell failure triggers a gap-closure plan before phase closure.

---

## Sideload fallback (web-only pilot)

If MMC Teams Admin Center **blocks sideloading** for the pilot cohort (policy-level gate), the pilot proceeds **web-only**:

- The manifest stays in this repo (phase requirement — it ships regardless).
- Pilot users bookmark `https://<AZURE_WEBAPP_HOSTNAME>/` directly instead of pinning the Teams tab.
- When the Teams sideload policy resolves later, the manifest is already built and can be uploaded without a rebuild.

This path is documented in `.planning/phases/05-sso-and-teams-delivery/05-CONTEXT.md` § External sequencing and does not block Phase 5 closure.

---

## Entra App Registration prerequisites

The manifest `webApplicationInfo` block assumes the Entra App Registration has:

1. **App type:** Single-page application (SPA).
2. **Redirect URIs** (both required):
   - `https://<AZURE_WEBAPP_HOSTNAME>/auth/redirect` — standalone web flow.
   - `brk-multihub://<AZURE_WEBAPP_HOSTNAME>` — NAA flow (matches `__REDIRECT_URI__`).
3. **API permissions:** `openid`, `profile`, `email`, `User.Read` with **admin consent granted** for the tenant.
4. **Enterprise Application → Assignment required = Yes**; pilot cohort users/groups assigned explicitly.

If the `brk-multihub://` redirect is missing on the App Registration, NAA silent acquisition inside Teams will fail even with a valid manifest.
