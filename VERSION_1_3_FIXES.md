# Version 1.3 fixes

## Demoscene scroller stage

When the control panel is open, the animated sine scroller now uses only the visible stage to the left of the panel. The message no longer travels behind the panel. Collapsing the panel restores the full-screen stage.

## Multipatch bridge-key protection

A copied ArcGIS attribute-table row is tab-delimited. Earlier builds could accept the whole row as the feature key, producing an unsafe `state_id` containing values such as `<Null>`. ArcGIS Online correctly rejected that value as unsafe HTML.

Version 1.3 now:

- extracts the final GUID from a pasted tab-delimited row when one is present;
- normalises GUIDs to uppercase without braces;
- rejects keys containing HTML or control characters;
- limits feature keys to 255 characters and logical layer keys to safe identifier characters;
- adds an Arcade multipatch guard that falls back to GlobalID or Object ID rather than passing a serialised feature row.

For the sample multipatch feature shown during testing, the correct feature key is:

```text
F7423684-4AE6-4408-8D05-6F58AD7183C2
```

Paste only the `bridge_key` value into the external scroller. Do not copy the entire attribute-table row.
