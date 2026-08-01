# Setup checklist — v1.1

## ArcGIS Pro schema

- [ ] Add `Popup_Live_Bridge_Schema_Tool.pyt` to ArcGIS Pro.
- [ ] Layer A is prepared as Direct, Bridge, or Both.
- [ ] Layer B is prepared as Direct, Bridge, or Both.
- [ ] Multipatch/read-only layers have populated, unique `bridge_key` values.
- [ ] The shared bridge table has all fields in `live_message_schema.json`.
- [ ] `channel_id = DEMO_01` exists once only.

## Hosted data

- [ ] Shared bridge table is published as `FeatureServer/<layer id>`.
- [ ] Shared bridge table advertises Query, Create, and Update.
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
- [ ] Pages load over HTTPS.

## ArcGIS Pro popups

- [ ] `smoke_test.arcade` validates.
- [ ] Layer A expression has the correct `SOURCE_MODE`.
- [ ] Layer B expression has the correct `TARGET_MODE`.
- [ ] Bridge-mode expressions use the correct layer key and feature key field.
- [ ] Stale popup instances are closed before retesting.
