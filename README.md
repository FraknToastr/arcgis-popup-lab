# ArcGIS Popup Live Bridge Prototype v1.1

Version 1.1 adds **bridge-table persistence** for multipatch and other read-only ArcGIS Pro layers while retaining the direct editable-feature workflow from v1.0.

## What the system now supports

### Direct mode

The hosted app updates and verifies a real attribute through an editable `FeatureServer/<layer id>` endpoint.

### Bridge mode

The original feature remains unchanged. A stable feature key identifies a row in the editable hosted bridge table. The hosted popup reads and writes that row, so the value displayed in a multipatch popup can persist and can be changed from the external scroller app.

```text
Read-only or multipatch feature
    │ bridge_key / GlobalID
    ▼
Hosted bridge-table feature-state row
    │
    ├── hosted popup reads and writes the value
    ├── external scroller app reads and writes the value
    └── value survives popup closure and ArcGIS Pro restart
```

GitHub Pages hosts only the interfaces. ArcGIS hosted services provide authentication, persistence, and shared communication.

## Package contents

- `source-popup.html` / `source-popup.js` — Layer A publisher with direct and bridge modes
- `scroller.html` / `scroller.js` — external demoscene sine scroller and Layer B editor
- `target-popup.html` / `target-popup.js` — Layer B receiver with direct and bridge modes
- `auth.js` — OAuth 2.0 authorization code with PKCE, using the proven out-of-band flow
- `arcgis-rest.js` — ArcGIS metadata, query, add, update, channel, and feature-state helpers
- `config.js` — public configuration; no client secrets
- `arcade/layer_a_source_popup.arcade` — source popup expression
- `arcade/layer_b_target_popup.arcade` — target popup expression
- `Popup_Live_Bridge_Schema_Tool.pyt` — schema tool, also supplied under `tools/`
- `live_message_seed.csv` — seed channel row
- `live_message_schema.json` — full bridge-table schema
- `MULTIPATCH_GUIDE.md` — read-only and multipatch setup
- `SETUP_CHECKLIST.md` and `TEST_PROTOCOL.md`

## Data architecture

The shared hosted table stores two record types.

### Channel record

Used by the Layer A publisher and the full-screen sine scroller.

```text
record_type = channel
channel_id  = DEMO_01
state_id    = channel:DEMO_01
message     = current scroller message
```

### Feature-state record

Used when Layer A or Layer B is configured in bridge mode.

```text
record_type      = feature_state
state_id         = BUILDINGS_3D|1B9A...F0
layer_key        = BUILDINGS_3D
feature_key      = 1B9A...F0
feature_key_field= bridge_key
display_field    = popup_message
message          = current persistent popup value
```

`state_id` is logically unique and is constructed from `layer_key + "|" + feature_key`.

## 1. Prepare the schemas

Add `Popup_Live_Bridge_Schema_Tool.pyt` to ArcGIS Pro and run **Prepare Popup Live Bridge Schema**.

For each input layer choose:

- **Direct attribute** — adds only the direct text field;
- **Bridge table** — adds and populates only `bridge_key`;
- **Both** — prepares both paths.

For a multipatch layer select **Bridge table** or **Both**. Run the tool against the source geodatabase feature class before publishing when the online scene layer does not permit schema changes.

The tool:

- adds `scroller_message` or your selected Layer A direct field when requested;
- adds `popup_message` or your selected Layer B direct field when requested;
- adds `bridge_key` as `TEXT(64)` when bridge mode is requested;
- fills blank bridge keys from GlobalID where available, otherwise with UUID values;
- checks that bridge keys are unique;
- adds the complete shared-table schema;
- adds optional indexes on `bridge_key`, `channel_id`, and `state_id`;
- creates or completes the `DEMO_01` seed channel.

It never deletes existing data or workspaces.

## 2. Publish the shared bridge table

Publish the prepared table as an ArcGIS hosted table and enable:

- Query
- Create
- Update

The table is the only dataset that must be editable when both operational layers use bridge mode.

Do not create duplicate `channel_id` or `state_id` values.

## 3. Configure OAuth

Use the OAuth client ID proven in Popup Lab 7 and register this exact redirect URI:

```text
urn:ietf:wg:oauth:2.0:oob
```

No client secret is used or stored.

## 4. Configure `config.js`

Set the portal, client ID, bridge table URL, and direct-browser defaults.

```javascript
window.POPUP_BRIDGE_CONFIG = {
  portalUrl: "https://www.arcgis.com",
  clientId: "YOUR_CLIENT_ID",
  liveTableUrl: "https://.../FeatureServer/0",
  channelId: "DEMO_01",
  source: {
    mode: "bridge",
    layerKey: "BUILDINGS_3D",
    featureKeyField: "bridge_key",
    messageField: "scroller_message"
  },
  target: {
    mode: "bridge",
    layerKey: "OTHER_BUILDINGS_3D",
    featureKeyField: "bridge_key",
    displayField: "popup_message"
  }
};
```

The Arcade expressions override selected-feature values through query parameters.

## 5. Publish through GitHub Pages

Upload all web files to the repository root, retain `.nojekyll`, and enable GitHub Pages over HTTPS.

The v1.1 HTML files include versioned script and stylesheet URLs to reduce stale-cache confusion.

## 6. Configure the Layer A popup

Run `arcade/smoke_test.arcade`, then use `arcade/layer_a_source_popup.arcade`.

### Editable feature layer

```arcade
var SOURCE_MODE = "direct";
var SOURCE_SERVICE_URL = "https://.../FeatureServer/0";
var SOURCE_MESSAGE_FIELD = "scroller_message";
```

### Multipatch or read-only layer

```arcade
var SOURCE_MODE = "bridge";
var SOURCE_LAYER_KEY = "BUILDINGS_3D";
var SOURCE_KEY_FIELD = "bridge_key";
var SOURCE_MESSAGE_FIELD = "scroller_message";
```

In bridge mode the service URL is not used for the edit. The selected feature key is passed directly from Arcade to the hosted app.

## 7. Configure the Layer B popup

Use `arcade/layer_b_target_popup.arcade`.

### Editable feature layer

```arcade
var TARGET_MODE = "direct";
var TARGET_SERVICE_URL = "https://.../FeatureServer/0";
var TARGET_DISPLAY_FIELD = "popup_message";
```

### Multipatch or read-only layer

```arcade
var TARGET_MODE = "bridge";
var TARGET_LAYER_KEY = "OTHER_BUILDINGS_3D";
var TARGET_KEY_FIELD = "bridge_key";
var TARGET_DISPLAY_FIELD = "popup_message";
```

The open target popup polls the feature-state row and animates when its `message` changes.

## 8. External scroller workflow

Open `scroller.html` in a normal browser.

The Layer B editor now offers:

- **Direct FeatureServer attribute** — query an editable feature, select a field, update, and verify;
- **Bridge-table popup state** — enter the target layer key and feature key, then add or update the persistent state row.

For a multipatch target, use the same `TARGET_LAYER_KEY` and selected feature `bridge_key` used by its Arcade popup expression.

## Important limitation

Bridge mode changes the **persistent value displayed by the hosted popup**, not the original attribute stored inside the multipatch feature class or scene layer. The multipatch geometry and its source attributes remain unchanged.

If the actual source attribute must change, use an editable associated FeatureServer where available, republish from an updated source dataset, or introduce an ArcGIS Pro SDK/local workflow.
