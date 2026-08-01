# End-to-end test protocol — v1.1

## Test A — bridge-mode Layer A to external scroller

1. Open `scroller.html` and leave live polling active on `DEMO_01`.
2. Open a multipatch or read-only Layer A popup configured with `SOURCE_MODE = "bridge"`.
3. Sign in through the external-browser PKCE flow.
4. Inspect the source. Confirm the diagnostics show a state ID such as `BUILDINGS_3D|<bridge_key>`.
5. Enter `MULTIPATCH SOURCE IS TRANSMITTING — 001`.
6. Leave both persistence and channel publication selected.
7. Confirm and save.
8. Confirm the bridge-state value and channel value are verified.
9. Confirm the external sine scroller changes within the polling interval.

## Test B — external app to bridge-mode Layer B popup

1. Open a Layer B multipatch popup configured with `TARGET_MODE = "bridge"` and leave it open.
2. In the external scroller select **Bridge-table popup state**.
3. Enter the shared table URL, Layer B logical key, selected feature `bridge_key`, key field, and display field.
4. Load the target. A missing row is valid if the table advertises Create.
5. Enter `EXTERNAL APP UPDATED MULTIPATCH POPUP — 001`.
6. Confirm and apply.
7. Confirm the external app verifies the table value.
8. Confirm the already-open target popup changes on the next poll.
9. Close and reopen ArcGIS Pro and confirm the displayed bridge value persists.

## Test C — mixed direct and bridge modes

- Use direct mode for an editable Layer A and bridge mode for a multipatch Layer B.
- Repeat with bridge mode for Layer A and direct mode for Layer B.
- Confirm each application reports the selected persistence mode in diagnostics.

## Failure checks

- Duplicate a `state_id` and confirm the app rejects the ambiguous record.
- Remove Create from the bridge table and test a new feature-state row.
- Remove Update and test an existing feature-state row.
- Blank a feature key and confirm the Arcade or hosted app blocks persistence.
- Allow a token to expire and confirm a new sign-in is requested.
