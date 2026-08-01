# ArcGIS Popup Live Bridge Prototype v1.2

Version 1.2 retains the direct-edit and bridge-table workflows from v1.1 and repairs the schema preparation workflow for the supplied `live_message_seed.csv`.

A CSV has no ArcGIS Object ID. It is a **seed source**, not the operational live bridge table. The revised PYT now creates or reuses a geodatabase table, adds the complete bridge schema, safely merges the CSV seed row, and returns the prepared table as a derived output.

## Supported architecture

### Direct mode

The hosted app updates and verifies a real attribute through an editable `FeatureServer/<layer id>` endpoint.

### Bridge mode

The original feature remains unchanged. A stable feature key identifies a row in the editable hosted bridge table. The hosted popup reads and writes that row, so a value displayed in a multipatch or other read-only popup can persist and can be changed from the external scroller app.

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

GitHub Pages hosts the interfaces. ArcGIS hosted services provide authentication, persistence, and shared communication.

## Package contents

- `source-popup.html` / `source-popup.js` — Layer A publisher with direct and bridge modes
- `scroller.html` / `scroller.js` — external demoscene sine scroller and Layer B editor
- `target-popup.html` / `target-popup.js` — Layer B receiver with direct and bridge modes
- `auth.js` — OAuth 2.0 authorization code with PKCE using the proven out-of-band flow
- `arcgis-rest.js` — ArcGIS metadata, query, add, update, channel, and feature-state helpers
- `config.js` — public configuration; no client secrets
- `arcade/layer_a_source_popup.arcade` — Layer A popup expression
- `arcade/layer_b_target_popup.arcade` — Layer B popup expression
- `Popup_Live_Bridge_Schema_Tool.pyt` — schema tool, duplicated under `tools/`
- `live_message_seed.csv` — seed input only; not the live table
- `live_message_schema.json` — complete bridge-table schema
- `SCHEMA_TOOL_GUIDE.md` — detailed PYT instructions
- `MULTIPATCH_GUIDE.md` — read-only and multipatch setup
- `SETUP_CHECKLIST.md` and `TEST_PROTOCOL.md`

## Data architecture

The shared hosted table stores two record types.

### Channel record

```text
record_type = channel
channel_id  = DEMO_01
state_id    = channel:DEMO_01
message     = current scroller message
```

### Feature-state record

```text
record_type       = feature_state
state_id          = BUILDINGS_3D|1B9A...F0
layer_key         = BUILDINGS_3D
feature_key       = 1B9A...F0
feature_key_field = bridge_key
display_field     = popup_message
message           = current persistent popup value
```

`state_id` is logically unique and is constructed from `layer_key + "|" + feature_key`.

## 1. Prepare the schemas

Add `Popup_Live_Bridge_Schema_Tool.pyt` to ArcGIS Pro and run **Prepare Popup Live Bridge Schema**.

For each operational layer choose:

- **Direct attribute** — adds only the direct text field;
- **Bridge table** — adds and populates only `bridge_key`;
- **Both** — prepares both paths.

For a multipatch Layer B, select **Bridge table** or **Both**. Run the tool against the source geodatabase multipatch feature class before publishing when the online scene layer does not permit schema changes.

For **Existing live bridge table or seed CSV**, either:

- select an existing geodatabase/enterprise/hosted table that already has an Object ID; or
- select the supplied `live_message_seed.csv`.

When a CSV or other no-OID table is selected, the tool uses:

- **Output geodatabase when input has no Object ID** — defaults to the current project geodatabase;
- **Output bridge table name** — defaults to `Popup_Live_Bridge`.

The resulting geodatabase table is returned as **Prepared live bridge table**.

The tool is safe to rerun. Existing fields, bridge keys, output tables, and populated live values are retained. It never deletes fields, records, datasets, workspaces, or geodatabases.

## 2. Publish the prepared bridge table

Publish the **Prepared live bridge table** from the geodatabase as an ArcGIS hosted table. Enable:

- Query
- Create
- Update

Do not use the CSV path as `liveTableUrl`. Do not point the applications at `live_message_seed.csv`.

The table is the only dataset that must be editable when both operational layers use bridge mode.

## 3. Configure OAuth

Use the OAuth client ID proven in Popup Lab 7 and register this exact redirect URI:

```text
urn:ietf:wg:oauth:2.0:oob
```

No client secret is used or stored.

## 4. Configure `config.js`

```javascript
window.POPUP_BRIDGE_CONFIG = {
  portalUrl: "https://www.arcgis.com",
  clientId: "YOUR_CLIENT_ID",
  liveTableUrl: "https://.../FeatureServer/0",
  channelId: "DEMO_01",
  source: {
    mode: "direct",
    layerKey: "CITY_PLAN_SHAPE",
    featureKeyField: "bridge_key",
    messageField: "scroller_message"
  },
  target: {
    mode: "bridge",
    layerKey: "SID_2026_MULTIPATCH",
    featureKeyField: "bridge_key",
    displayField: "popup_message"
  }
};
```

For the reported Polygon Layer A plus Multipatch Layer B workflow, use direct or both mode for Layer A and bridge mode for Layer B.

## 5. Publish through GitHub Pages

Upload the web files to the repository root, retain `.nojekyll`, and enable GitHub Pages over HTTPS.

The v1.2 HTML files use versioned script and stylesheet URLs to reduce stale-cache confusion.

## 6. Configure Layer A

Run `arcade/smoke_test.arcade`, then use `arcade/layer_a_source_popup.arcade`.

Editable Polygon example:

```arcade
var SOURCE_MODE = "direct";
var SOURCE_SERVICE_URL = "https://.../FeatureServer/0";
var SOURCE_MESSAGE_FIELD = "scroller_message";
```

## 7. Configure multipatch Layer B

Use `arcade/layer_b_target_popup.arcade`:

```arcade
var TARGET_MODE = "bridge";
var TARGET_LAYER_KEY = "SID_2026_MULTIPATCH";
var TARGET_KEY_FIELD = "bridge_key";
var TARGET_DISPLAY_FIELD = "popup_message";
```

The open target popup polls the feature-state row and animates when its `message` changes.

## 8. External scroller workflow

Open `scroller.html` in a normal browser.

For the multipatch target select **Bridge-table popup state**, then use the same logical layer key and selected feature `bridge_key` used by the Layer B Arcade expression.

## Important limitation

Bridge mode changes the persistent value displayed by the hosted popup. It does not alter the original multipatch attribute row or geometry. To modify the actual multipatch source attributes, use an editable associated FeatureServer where available, republish from an updated source dataset, or introduce an ArcGIS Pro SDK/local process.
