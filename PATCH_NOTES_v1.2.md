# Patch notes — Lab 7 v1.2

- Removed the unusable OAuth popup test.
- Removed the in-frame redirect fallback that ArcGIS Online refuses to display.
- Added external-browser authorization code + PKCE using `urn:ietf:wg:oauth:2.0:oob`.
- Added preparation, browser-link and pasted-code completion steps.
- Accepts either the complete ArcGIS approval URL or the raw authorization code.
- Keeps access tokens in the hosted app's `sessionStorage` only.
- Build marker changed to `POPUP LAB — BUILD 0072`.
