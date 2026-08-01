# Setup checklist — v1.2

## ArcGIS Pro schema

- [ ] Add `Popup_Live_Bridge_Schema_Tool.pyt` to ArcGIS Pro.
- [ ] Layer A is prepared as Direct, Bridge, or Both.
- [ ] Layer B is prepared as Direct, Bridge, or Both.
- [ ] Multipatch/read-only layers have populated, unique `bridge_key` values.
- [ ] `live_message_seed.csv` is selected only as a seed input.
- [ ] The output geodatabase and output table name are valid.
- [ ] The tool returns a **Prepared live bridge table** with an Object ID.
- [ ] The prepared table contains all fields in `live_message_schema.json`.
- [ ] `channel_id = DEMO_01` exists once only.

## Hosted data

- [ ] The prepared geodatabase bridge table—not the CSV—is published as `FeatureServer/<layer id>`.
- [ ] The hosted bridge table advertises Query, Create, and Update.
- [ ] Direct-mode layers advertise Query and Update.
- [ ] Bridge-mode operational layers may remain read-only.

## OAuth

- [ ] OAuth client ID is current.
- [ ] `urn:ietf:wg:oauth:2.0:oob` is registered exactly.
- [ ] No client secret is present in GitHub or Arcade.

## GitHub Pages

- [ ] All package web files are in the Pages repository root.
- [ ] `.nojekyll` is present.
- [ ] `config.js` placeholders are replaced.
- [ ] `liveTableUrl` points to the hosted prepared table.
- [ ] Pages load over HTTPS.

## ArcGIS Pro popups

- [ ] `smoke_test.arcade` validates.
- [ ] Layer A expression has the correct `SOURCE_MODE`.
- [ ] Layer B multipatch expression uses `TARGET_MODE = "bridge"`.
- [ ] Both expressions use the correct logical layer key and feature key field.
- [ ] Stale popup instances are closed before retesting.
