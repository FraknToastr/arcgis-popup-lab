/*
  ArcGIS Popup Live Bridge Prototype v1.1

  Public client-side configuration only. Never place a client secret,
  password, long-lived token, or API key in this file.
*/
window.POPUP_BRIDGE_CONFIG = {
  portalUrl: "https://www.arcgis.com",
  clientId: "YOUR_CLIENT_ID",
  oauthRedirectUri: "urn:ietf:wg:oauth:2.0:oob",

  // Shared editable hosted table. It stores both the live scroller channel and
  // bridge-state records for read-only layers such as multipatch scene layers.
  liveTableUrl: "https://YOUR-LIVE-BRIDGE-TABLE/FeatureServer/0",
  channelId: "DEMO_01",
  pollIntervalMs: 1000,

  // mode: "direct" updates a real editable FeatureServer attribute.
  // mode: "bridge" stores the popup value in the shared bridge table.
  source: {
    mode: "direct",
    serviceUrl: "https://YOUR-SOURCE-LAYER/FeatureServer/0",
    objectId: 1,
    objectIdField: "",
    messageField: "scroller_message",
    layerKey: "LAYER_A",
    featureKey: "",
    featureKeyField: "bridge_key",
    initialValue: ""
  },

  target: {
    mode: "direct",
    serviceUrl: "https://YOUR-TARGET-LAYER/FeatureServer/0",
    objectId: 1,
    objectIdField: "",
    displayField: "popup_message",
    layerKey: "LAYER_B",
    featureKey: "",
    featureKeyField: "bridge_key"
  },

  liveFields: {
    channelId: "channel_id",
    recordType: "record_type",
    stateId: "state_id",
    layerKey: "layer_key",
    featureKey: "feature_key",
    featureKeyField: "feature_key_field",
    displayField: "display_field",
    message: "message",
    version: "message_version",
    speed: "scroller_speed",
    amplitude: "sine_amplitude",
    frequency: "sine_frequency",
    palette: "palette",
    updatedAt: "updated_at",
    updatedBy: "updated_by"
  }
};
