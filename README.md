# ArcGIS Pro Popup Lab 7

Lab 7 tests whether a GitHub Pages application embedded in an ArcGIS Pro popup can:

1. authenticate an ArcGIS user with OAuth 2.0 authorization code + PKCE;
2. read a secured feature layer;
3. update one controlled attribute;
4. re-query the feature to verify the server value;
5. restore the original value;
6. determine whether ArcGIS Pro refreshes after the external edit.

## Safety rules

- Use a disposable test layer or a non-critical test record.
- Test one ordinary text, number or date field only.
- The application never changes geometry.
- Do not put a client secret, password, access token or refresh token in GitHub, Arcade, config files or URLs.
- The Client ID is public application configuration and is expected to be visible.
- The app intentionally discards any refresh token returned by ArcGIS.
- The active access token is retained only in `sessionStorage` for the hosted-app session.

## Package files

- `index.html` — hosted Lab 7 application
- `styles.css` — application styling
- `app.js` — OAuth, query, update, verification and rollback logic
- `oauth-callback.html` — registered OAuth callback page
- `callback.js` — PKCE authorization-code exchange
- `config.js` — direct-browser fallback configuration
- `.nojekyll` — prevents Jekyll processing
- `popup_lab_7.arcade` — ArcGIS Pro popup expression
- `popup_lab_7_smoke_test.arcade` — minimal validation expression
- `LAB_7_RESULTS.md` — result-recording template

## 1. Prepare the test feature layer

The target must be an ArcGIS Feature Service layer whose URL ends with:

`/FeatureServer/<layer id>`

The signed-in test user must have permission to:

- access the service;
- query the layer;
- update the selected record and field.

Use the same service-backed layer in ArcGIS Pro so the popup `OBJECTID` matches the service record.

## 2. Publish the hosted app

1. Create a GitHub repository, for example `arcgis-popup-lab-7`.
2. Upload these hosted files to the repository root:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `oauth-callback.html`
   - `callback.js`
   - `config.js`
   - `.nojekyll`
3. In GitHub repository settings, enable Pages from the `main` branch and repository root.
4. Wait for the HTTPS site, normally:

   `https://YOUR-GITHUB-USER.github.io/arcgis-popup-lab-7/`

5. Open the site directly and verify that Build 007 loads.

## 3. Register the OAuth browser application

Create or register an OAuth browser application in the ArcGIS Online organisation or ArcGIS Enterprise portal that secures the test service.

Register this exact redirect URI:

`https://YOUR-GITHUB-USER.github.io/arcgis-popup-lab-7/oauth-callback.html`

Copy the resulting **Client ID**. Do not use the Client Secret.

The OAuth app and the signed-in account must be permitted to access the target organisation and service.

## 4. Configure the Arcade expression

1. Add a new **Arcade popup element**.
2. Paste `popup_lab_7_smoke_test.arcade` first and click **Verify**.
3. Confirm that the green validation card appears.
4. Replace the entire expression with `popup_lab_7.arcade`.
5. Change only these four quoted values:

```arcade
var APP_URL = "https://YOUR-GITHUB-USER.github.io/YOUR-REPOSITORY/";
var CLIENT_ID = "YOUR_CLIENT_ID";
var PORTAL_URL = "https://www.arcgis.com";
var SERVICE_URL = "https://YOUR-FEATURE-SERVICE/FeatureServer/0";
```

For ArcGIS Enterprise, `PORTAL_URL` should be the portal root, for example:

`https://gis.example.gov.au/portal`

The expression assumes the layer Object ID field is available as `$feature.OBJECTID`. Change that single reference if the popup layer exposes the Object ID under a different field name.

## 5. Run the OAuth tests

### Popup path

1. Click **Sign in — popup test**.
2. Complete the ArcGIS sign-in and consent screen.
3. Confirm that the callback closes or reports success.
4. Confirm that Lab 7 displays the authenticated username.

A failure stating that the OAuth transaction is unavailable indicates that ArcGIS Pro opened the login in a separate browser profile. This is a useful boundary result, not a credential error.

### Iframe redirect fallback

If the popup path fails, click **Sign in — iframe redirect fallback**. This temporarily navigates the embedded application to ArcGIS sign-in, then returns through `oauth-callback.html`.

## 6. Run the editing test

1. Click **Load secured layer metadata**.
2. Confirm that the layer advertises `Update` and that editable fields are listed.
3. Click **Query this feature**.
4. Select a non-critical editable field.
5. Enter a clearly recognisable test value.
6. Tick the explicit authorisation checkbox.
7. Click **Apply update and verify**.
8. Confirm that:
   - `updateFeatures` reports success;
   - the app re-queries the feature;
   - the verified server value matches the proposed value.
9. Close and reopen the ArcGIS Pro popup and inspect the native popup/layer value.
10. Use **Revert to original value** and verify the original value is restored.

## 7. Interpret common failures

### OAuth redirect mismatch

The registered redirect URI must exactly match the displayed callback URI, including HTTPS, repository path, filename and trailing path structure.

### OAuth popup does not return

ArcGIS Pro may have opened authentication in another browser context. Test the iframe redirect fallback.

### CORS or failed fetch

The feature service or portal may not allow the GitHub Pages origin, or a reverse proxy/web-tier authentication layer may reject the request headers.

### Metadata loads but Update is unavailable

The service does not advertise the Update capability, the signed-in user lacks edit permission, or the layer is read-only.

### Update succeeds but ArcGIS Pro still shows the old value

The server edit may be correct while ArcGIS Pro retains a cached feature or popup. Close/reopen the popup, refresh the layer, or toggle layer visibility before judging the server result.

### 400, 403, 498 or 499 errors

- `400` — invalid request, field value, redirect URI or PKCE transaction
- `403` — user or application lacks permission
- `498` / `499` — token invalid, expired or required

## Official references

- ArcGIS OAuth authorization-code flow with PKCE
- ArcGIS OAuth `/authorize` and `/token` operations
- ArcGIS Feature Service `query` operation
- ArcGIS Feature Service `updateFeatures` operation
- ArcGIS HTTP authorization headers
