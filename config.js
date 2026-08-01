/*
  ArcGIS Popup Live Bridge Prototype v1.2

  Public client-side configuration only. Never place a client secret,
  password, long-lived token, or API key in this file.
*/
window.POPUP_BRIDGE_CONFIG = {
  portalUrl: "https://www.arcgis.com",
  clientId: "2i8ErWnjyQES93El",
  oauthRedirectUri: "urn:ietf:wg:oauth:2.0:oob",

  liveTableUrl: "https://services.arcgis.com/BzylpWnjWP0tW4nL/arcgis/rest/services/Popup_Live_Bridge/FeatureServer/0",
  channelId: "DEMO_01",
  pollIntervalMs: 1000,

  source: {
    mode: "direct",
    serviceUrl: "https://services.arcgis.com/BzylpWnjWP0tW4nL/arcgis/rest/services/City_Plan_Shape_Private/FeatureServer/0",
    objectId: 1,
    objectIdField: "",
    messageField: "scroller_message",
    layerKey: "CITY_PLAN_SHAPE_PRIVATE",
    featureKey: "",
    featureKeyField: "bridge_key",
    initialValue: ""
  },

  target: {
    mode: "bridge",
    serviceUrl: "",
    objectId: 1,
    objectIdField: "",
    displayField: "popup_message",
    layerKey: "SID_2026_ANCHOR_MULTIPATCH",
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
