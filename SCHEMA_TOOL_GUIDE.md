# Schema tool guide — v1.3

## Purpose

`Popup_Live_Bridge_Schema_Tool.pyt` prepares:

1. Layer A fields and stable feature identity;
2. Layer B fields and stable feature identity;
3. a real ArcGIS geodatabase bridge table with an Object ID and the complete live-state schema.

## Why the seed CSV cannot be the live table

`live_message_seed.csv` contains a sample channel row but has no ArcGIS Object ID. ArcGIS REST feature/table queries and edits require an ArcGIS table or feature layer with an Object ID. The CSV is therefore an import source only.

## Recommended values for Polygon Layer A and Multipatch Layer B

### Layer A

- Source persistence mode: `Both` or `Direct attribute`
- Source direct message field: `scroller_message`
- Source bridge key field: `bridge_key`

### Layer B

- Target persistence mode: `Bridge table`
- Target direct display field: `popup_message` is disabled in pure bridge mode
- Target bridge key field: `bridge_key`

### Shared live bridge table

- Existing live bridge table or seed CSV: `live_message_seed.csv`
- Output geodatabase when input has no Object ID: current project GDB or another file GDB
- Output bridge table name: `Popup_Live_Bridge`
- Populate blank bridge keys: checked
- Create or complete seed channel record: checked
- Seed channel ID: `DEMO_01`
- Add bridge lookup indexes: checked

## What the repaired workflow does

When the input has no Object ID, the tool:

1. creates `Popup_Live_Bridge` in the selected geodatabase, or reuses it if it already exists;
2. adds all fields in `live_message_schema.json`;
3. imports missing seed rows from the CSV;
4. completes blank values in an existing seed row but does not overwrite populated live values;
5. adds lookup indexes where supported;
6. validates logical uniqueness of `channel_id` and `state_id`;
7. returns the table path as **Prepared live bridge table**.

## Safe rerun after the v1.1 failure

The earlier run already added fields and bridge keys to Layer A and Layer B before stopping at the CSV. Rerun v1.3 with the same layers and values.

The revised tool will:

- accept the existing fields;
- preserve the existing `bridge_key` values;
- report zero new blank keys where appropriate;
- create or reuse the output bridge table;
- continue from the point that previously failed.

No cleanup or rollback of Layer A or Layer B is required.

## Publish step

Publish the derived **Prepared live bridge table** from the geodatabase to ArcGIS Online as a hosted table. Enable Query, Create, and Update. Use its `FeatureServer/<layer id>` URL in `config.js` and the hosted apps.

Do not publish or configure the CSV as the operational live table.
