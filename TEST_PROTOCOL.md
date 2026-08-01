# End-to-end test protocol — v1.2

## A. Schema preparation

1. Run the revised PYT with Polygon Layer A, Multipatch Layer B, and `live_message_seed.csv`.
2. Confirm existing Layer A and Layer B fields are accepted rather than duplicated.
3. Confirm the CSV is reported as a seed table with no Object ID.
4. Confirm a geodatabase table named `Popup_Live_Bridge` is created or reused.
5. Confirm the derived output table has an Object ID, all required fields, and one `DEMO_01` channel row.

## B. Hosted bridge table

1. Publish the prepared geodatabase table as a hosted table.
2. Enable Query, Create, and Update.
3. Put its `FeatureServer/<layer id>` URL into `config.js`.

## C. Layer A to external scroller

1. Open the Layer A hosted popup and authenticate.
2. Change `scroller_message` and publish it to `DEMO_01`.
3. Open `scroller.html` in a normal browser.
4. Confirm the new value appears in the sine scroller on the next polling cycle.

## D. External app to multipatch Layer B popup

1. Open a multipatch feature popup and note its `bridge_key` diagnostic.
2. In the external app select **Bridge-table popup state**.
3. Enter the Layer B logical key and the selected multipatch `bridge_key`.
4. Apply a new popup message.
5. Confirm the already-open Layer B popup changes on its next polling cycle.
6. Close and reopen the popup and restart ArcGIS Pro; confirm the bridge-table value persists.

## E. Safety confirmation

- Confirm the multipatch geometry and original source attribute remain unchanged.
- Confirm only the hosted bridge table contains the persistent display-state edit.
