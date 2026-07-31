# Popup Lab 7 v1.1 patch

## Fixed

- The Arcade expression no longer assumes the Object ID field is named `OBJECTID`.
- It detects the real field through `Schema($feature).objectIdField` and passes both its name and value to the hosted app.
- All URL parameters are encoded using Arcade `UrlEncode()`.
- Section 4 now permits a manual Object ID for direct-browser diagnostics.
- Section 1 reports the Object ID field supplied by ArcGIS Pro.
- A clear warning appears when the GitHub page was opened directly rather than through the popup iframe.

## Important

The layer used in the supplied Lab 7 result advertises `Query` only. It can complete the feature-query test after the Object ID issue is corrected, but it cannot complete the real update or rollback tests. Use an editable test layer that advertises `Update` for those sections.
