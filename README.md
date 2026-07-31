# ArcGIS Pro Popup Lab 7 v1.2

Lab 7 tests authenticated query and controlled editing from a GitHub Pages application embedded in an ArcGIS Pro popup.

## Why v1.2 changed the sign-in flow

ArcGIS Online's authorization page refuses to render inside the popup iframe. ArcGIS Pro's popup web context also does not provide a usable child OAuth window. The earlier popup and in-frame redirect paths are therefore removed.

Version 1.2 uses ArcGIS's supported out-of-band redirect with authorization code + PKCE:

1. the embedded app creates a PKCE verifier and authorization URL;
2. the user opens ArcGIS sign-in in the normal browser;
3. ArcGIS redirects to its `/oauth2/approval` page;
4. the user copies the full approval-page URL from the browser address bar;
5. the user pastes it into the embedded app;
6. the embedded app extracts the short-lived code and exchanges it with the original PKCE verifier.

No client secret, password or access token is placed in GitHub, Arcade or a URL.

## Package files

- `index.html` — hosted Lab 7 application
- `styles.css` — application styling
- `app.js` — external-browser PKCE, query, edit, verification and rollback logic
- `config.js` — direct-browser fallback configuration
- `.nojekyll` — prevents Jekyll processing
- `popup_lab_7.arcade` — ArcGIS Pro popup expression
- `popup_lab_7_smoke_test.arcade` — minimal validation expression
- `LAB_7_RESULTS.md` — result-recording template
- `PATCH_NOTES_v1.2.md` — change summary

## 1. OAuth application configuration

In the ArcGIS OAuth application's redirect URI list, add this exact value:

`urn:ietf:wg:oauth:2.0:oob`

Keep the GitHub callback URI only if another application still uses it; Lab 7 v1.2 does not need it.

## 2. Publish the hosted app

Upload the hosted files to the GitHub Pages repository root, replacing the previous Lab 7 files:

- `index.html`
- `styles.css`
- `app.js`
- `config.js`
- `.nojekyll`

Delete or ignore the older `oauth-callback.html` and `callback.js`; they are not used by v1.2.

## 3. Configure the Arcade expression

Paste `popup_lab_7.arcade` into an Arcade popup element and configure:

```arcade
var APP_URL = "https://YOUR-GITHUB-USER.github.io/YOUR-REPOSITORY/";
var CLIENT_ID = "YOUR_CLIENT_ID";
var PORTAL_URL = "https://www.arcgis.com";
var SERVICE_URL = "https://YOUR-FEATURE-SERVICE/FeatureServer/0";
```

The expression detects the actual Object ID field using `Schema($feature).objectIdField`.

## 4. Run external sign-in

1. Open a feature popup in ArcGIS Pro.
2. Click **1. Prepare external sign-in**.
3. Click **2. Open ArcGIS sign-in in browser**.
4. Sign in and approve the application.
5. On the ArcGIS approval page, press **Ctrl+L**, then **Ctrl+C** to copy the full URL from the address bar.
6. Return to ArcGIS Pro and paste the URL into **Authorization result**.
7. Click **3. Complete sign-in from pasted code**.

You may paste the raw authorization code instead of the full URL.

The prepared transaction expires after 15 minutes. Authorization codes are single-use.

## 5. Continue the Lab 7 tests

1. Load secured layer metadata.
2. Query the selected feature.
3. Confirm the service advertises `Update` before attempting an edit.
4. Use a disposable or non-critical record.
5. Apply one attribute update, verify by re-query, then restore the original value.

## Known boundaries

- ArcGIS authorization cannot run inside the popup iframe.
- OAuth popup windows are not dependable from this ArcGIS Pro popup context.
- The out-of-band flow requires one manual copy/paste step.
- The target service must advertise `Update` for edit and rollback tests.
- ArcGIS Pro may require a layer refresh or visibility toggle after an external edit.
