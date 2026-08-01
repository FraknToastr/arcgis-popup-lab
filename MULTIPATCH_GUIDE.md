# Multipatch and read-only layer guide

## Why bridge mode is required

A multipatch scene layer often exposes a `SceneServer` for display and query but does not advertise the editable `Update` capability required by `updateFeatures`. The prototype therefore stores the live popup value in a separate editable hosted table.

## Recommended setup

1. Run the PYT against the source multipatch feature class in its geodatabase.
2. Choose **Bridge table** or **Both**.
3. Accept the default `bridge_key` field and populate blank keys.
4. Republish or refresh the scene layer so the key is exposed to ArcGIS Pro popup Arcade.
5. Publish the shared bridge table separately with Query, Create, and Update.
6. Configure the popup expression with:

```arcade
var TARGET_MODE = "bridge";
var TARGET_LAYER_KEY = "BUILDINGS_3D";
var TARGET_KEY_FIELD = "bridge_key";
```

`TARGET_LAYER_KEY` must be a stable logical name that is identical in the popup and the external app. It is not required to match the ArcGIS layer title, although using a clear permanent identifier is recommended.

## Stable identity hierarchy

The Arcade expressions attempt identity in this order:

1. configured `bridge_key` or other key field;
2. `GlobalID` / `GLOBALID`;
3. Object ID as a fallback.

`bridge_key` or GlobalID is preferred because Object IDs can change when data is republished or rebuilt.

## What changes

Bridge mode persists:

- popup display text;
- a message version;
- update time and username;
- the logical layer and feature identity.

It does not edit:

- multipatch geometry;
- the scene layer's original attribute row;
- the local geodatabase without a separate ArcGIS Pro process.

## External app to multipatch popup

In `scroller.html`:

1. select **Bridge-table popup state**;
2. enter the bridge table URL;
3. enter the same logical layer key;
4. enter the selected multipatch feature's `bridge_key`;
5. enter the popup display field name;
6. load the target;
7. enter the new value and apply it.

The already-open multipatch popup detects the new value on its next polling cycle.
