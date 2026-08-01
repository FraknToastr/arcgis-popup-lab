# Multipatch and read-only layer guide — v1.2

## Why bridge mode is required

A multipatch scene layer often exposes a `SceneServer` for display and query but does not advertise the editable `Update` capability required by `updateFeatures`. The prototype stores the live popup value in a separate editable hosted table.

## Recommended setup

1. Run the v1.2 PYT against the source multipatch feature class in its geodatabase.
2. Choose **Bridge table** for Layer B, or **Both** only when a direct field is also useful locally.
3. Accept the default `bridge_key` field and populate blank keys.
4. Select `live_message_seed.csv` as the seed input.
5. Let the tool create `Popup_Live_Bridge` in the selected geodatabase.
6. Republish or refresh the scene layer so `bridge_key` is exposed to popup Arcade.
7. Publish the prepared geodatabase bridge table separately with Query, Create, and Update.
8. Configure the popup expression with:

```arcade
var TARGET_MODE = "bridge";
var TARGET_LAYER_KEY = "SID_2026_MULTIPATCH";
var TARGET_KEY_FIELD = "bridge_key";
```

`TARGET_LAYER_KEY` must be a stable logical name that is identical in the popup and the external app.

## Stable identity hierarchy

The Arcade expressions attempt identity in this order:

1. configured `bridge_key` or other key field;
2. `GlobalID` / `GLOBALID`;
3. Object ID as a fallback.

`bridge_key` or GlobalID is preferred because Object IDs can change when data is republished or rebuilt.

## What bridge mode changes

Bridge mode persists:

- popup display text;
- message version;
- update time and username;
- logical layer and feature identity.

It does not edit:

- multipatch geometry;
- the scene layer's original attribute row;
- the local geodatabase without a separate ArcGIS Pro process.

## External app to multipatch popup

In `scroller.html`:

1. select **Bridge-table popup state**;
2. use the hosted prepared bridge table URL;
3. enter the same logical Layer B key;
4. enter the selected multipatch feature's `bridge_key`;
5. enter the popup display field name;
6. load the target;
7. enter the new value and apply it.

The already-open multipatch popup detects the new value on its next polling cycle.
