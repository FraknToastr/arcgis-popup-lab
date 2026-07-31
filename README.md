# ArcGIS Pro Popup Lab 6

Lab 6 tests a real HTTPS-hosted iframe rather than a `data:` iframe.

## Files

- `index.html` — hosted test application
- `sw.js` — service worker and cache test
- `lab6-data.json` — same-origin fetch target
- `.nojekyll` — prevents Jekyll processing
- `popup_lab_6.arcade` — ArcGIS Pro popup Arcade element


## ArcGIS Pro expression validation

1. Add a new **Arcade popup element**.
2. Paste `popup_lab_6_smoke_test.arcade` first and click **Verify**.
3. After the green validation card appears, replace the entire expression with `popup_lab_6.arcade`.
4. Change only the text between the quotation marks on the `APP_URL` line. Keep both quotation marks and the final semicolon.
5. Do not paste Markdown code fences or the filename into the Arcade editor.

The primary expression is intentionally written without helper functions or optional field lookups for maximum compatibility with ArcGIS Pro 3.5.3.

## Publish with GitHub Pages

1. Create a GitHub repository, for example `arcgis-popup-lab-6`.
2. Upload all files except `popup_lab_6.arcade` to the repository root.
3. In **Settings → Pages**, choose **Deploy from a branch**.
4. Select the `main` branch and `/ (root)` folder.
5. Wait for the site URL, normally:

   `https://YOUR-GITHUB-USER.github.io/arcgis-popup-lab-6/`

6. Open the URL directly in a browser and verify that Lab 6 loads.
7. Open `popup_lab_6.arcade` and replace `APP_URL` with the published URL.
8. Add the expression as an **Arcade popup element** in ArcGIS Pro.

## Primary persistence test

1. Open a feature.
2. Save different notes in the localStorage and IndexedDB sections.
3. Record the hosted-app open count.
4. Close and reopen the popup.
5. Open another feature and return.
6. Toggle the layer.
7. Save and close the project, restart ArcGIS Pro, and return to the same feature.
8. Record whether both notes and the open count survived.

## Other tests

- Same-origin JSON fetch
- Service-worker registration
- Cache API read/write
- Blob download
- Data-URI download inside the hosted iframe
- Clipboard read/write
- Public ArcGIS REST query
- `postMessage` call to the parent
- BroadcastChannel communication between two hosted instances
- Cookie, sessionStorage and storage quota behaviour

## Security boundary

This package deliberately performs read-only ArcGIS REST queries. Do not place passwords, OAuth tokens, API keys or other secrets in:

- the GitHub repository;
- the static JavaScript source;
- the iframe URL;
- Arcade source code.

Authentication and persistent edits to an ArcGIS feature service should be designed after the Lab 6 results are known.
