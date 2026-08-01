(() => {
  "use strict";

  const config = BridgeCommon.resolveConfig();
  const liveFields = {
    channelId: "channel_id", recordType: "record_type", stateId: "state_id",
    layerKey: "layer_key", featureKey: "feature_key", featureKeyField: "feature_key_field",
    displayField: "display_field", message: "message", version: "message_version",
    speed: "scroller_speed", amplitude: "sine_amplitude", frequency: "sine_frequency",
    palette: "palette", updatedAt: "updated_at", updatedBy: "updated_by",
    ...(config.liveFields || {})
  };

  const state = {
    sourceMetadata: null, sourceFeature: null, sourceOidField: "", sourceFieldDefinition: null,
    bridgeFeature: null, bridgeMetadata: null, channelFeature: null, channelMetadata: null,
    canSaveSource: false, canPublishChannel: false
  };

  const el = (id) => document.getElementById(id);
  const auth = new ArcGISAuthPanel("authHost", {
    portalUrl: config.portalUrl,
    clientId: config.clientId,
    redirectUri: config.oauthRedirectUri,
    storagePrefix: "popup-live-bridge-source-v11"
  });

  function renderEnvironment() {
    const pairs = [
      ["Source", config.sourceName], ["Inside iframe", String(window.self !== window.top)],
      ["Mode", config.source.mode], ["Feature Object ID", config.source.objectId ?? "Not supplied"],
      ["Feature key", config.source.featureKey || "Not supplied"], ["Build", config.build],
      ["Hosted origin", window.location.origin]
    ];
    el("environment").innerHTML = pairs.map(([key, value]) => `<dt>${BridgeCommon.escapeHtml(key)}</dt><dd>${BridgeCommon.escapeHtml(value)}</dd>`).join("");
  }

  function fillInputs() {
    el("sourceMode").value = config.source.mode;
    el("sourceService").value = config.source.serviceUrl;
    el("sourceField").value = config.source.messageField;
    el("sourceOid").value = config.source.objectId ?? "";
    el("sourceOidField").value = config.source.objectIdField;
    el("sourceLayerKey").value = config.source.layerKey;
    el("sourceKey").value = config.source.featureKey;
    el("sourceKeyField").value = config.source.featureKeyField;
    el("bridgeDisplayField").value = config.source.messageField;
    el("liveTable").value = config.liveTableUrl;
    el("channelId").value = config.channelId;
    if (config.source.initialValue) el("message").value = config.source.initialValue;
    applyModeUi();
  }

  function settings() {
    return {
      mode: BridgeCommon.normalizeMode(el("sourceMode").value),
      sourceService: BridgeCommon.normalizeUrl(el("sourceService").value),
      sourceField: el("sourceField").value.trim(),
      sourceOid: Number(el("sourceOid").value),
      sourceOidField: el("sourceOidField").value.trim(),
      layerKey: el("sourceLayerKey").value.trim(),
      featureKey: el("sourceKey").value.trim(),
      featureKeyField: el("sourceKeyField").value.trim(),
      bridgeDisplayField: el("bridgeDisplayField").value.trim(),
      liveTable: BridgeCommon.normalizeUrl(el("liveTable").value),
      channelId: el("channelId").value.trim()
    };
  }

  function bridgeState(values) {
    return {
      stateId: BridgeCommon.stateId(values.layerKey, values.featureKey),
      layerKey: values.layerKey,
      featureKey: values.featureKey,
      featureKeyField: values.featureKeyField,
      displayField: values.bridgeDisplayField
    };
  }

  function validate(values) {
    const problems = [...BridgeCommon.validateLayerUrl(values.liveTable, "Live bridge table URL")];
    if (!values.channelId) problems.push("Channel ID is required.");
    if (values.mode === "direct") {
      problems.push(...BridgeCommon.validateLayerUrl(values.sourceService, "Source feature layer URL"));
      if (!values.sourceField) problems.push("Source message field is required.");
      if (!Number.isInteger(values.sourceOid)) problems.push("Source Object ID must be an integer.");
    } else {
      if (!values.layerKey) problems.push("Logical layer key is required in bridge mode.");
      if (!values.featureKey) problems.push("Selected feature key is required in bridge mode.");
      if (!values.featureKeyField) problems.push("Feature key field is required in bridge mode.");
      if (!values.bridgeDisplayField) problems.push("Popup display field name is required in bridge mode.");
    }
    return problems;
  }

  function token() { return auth.accessToken; }

  function applyModeUi() {
    const bridge = el("sourceMode").value === "bridge";
    el("directSourceFields").style.display = bridge ? "none" : "grid";
    el("bridgeSourceFields").style.display = bridge ? "grid" : "none";
    el("updateSourceLabel").textContent = bridge
      ? "Save the selected feature's persistent popup value in the shared bridge table."
      : "Update the configured attribute on the selected Layer A feature.";
    el("sourceCurrentLabel").textContent = bridge ? "Selected feature bridge state" : "Layer A current value";
    state.sourceMetadata = null;
    state.bridgeMetadata = null;
    state.canSaveSource = false;
    updateButton();
  }

  function renderValues(values) {
    let sourceValue;
    if (values.mode === "bridge") sourceValue = state.bridgeFeature?.attributes?.[liveFields.message];
    else sourceValue = state.sourceFeature?.attributes?.[values.sourceField];
    const channelValue = state.channelFeature?.attributes?.[liveFields.message];
    el("sourceCurrent").textContent = sourceValue === undefined ? "Not loaded" : BridgeCommon.formatValue(sourceValue);
    el("channelCurrent").textContent = channelValue === undefined ? "Not loaded" : BridgeCommon.formatValue(channelValue);
  }

  async function inspect() {
    const values = settings();
    const problems = validate(values);
    if (problems.length) {
      BridgeCommon.setStatus("inspectStatus", problems.join("\n"), "bad");
      return false;
    }

    BridgeCommon.setStatus("inspectStatus", "Loading persistent source state and live channel…", "info");
    try {
      if (values.mode === "direct") {
        const source = await ArcGISRest.queryByOid(values.sourceService, values.sourceOid, token(), values.sourceOidField);
        state.sourceMetadata = source.metadata;
        state.sourceFeature = source.feature;
        state.sourceOidField = source.oidField;
        state.sourceFieldDefinition = ArcGISRest.field(source.metadata, values.sourceField);
        if (!state.sourceFieldDefinition) throw new Error(`Source layer does not contain field ${values.sourceField}.`);
        state.canSaveSource = ArcGISRest.hasCapability(source.metadata, "Update") && state.sourceFieldDefinition.editable !== false;
        el("sourceOidField").value = state.sourceOidField;
        const sourceValue = source.feature.attributes?.[values.sourceField];
        if (!el("message").value.trim() && sourceValue !== null && sourceValue !== undefined) el("message").value = String(sourceValue);
      } else {
        const stateQuery = await ArcGISRest.queryState(values.liveTable, liveFields.stateId, bridgeState(values).stateId, token());
        state.bridgeFeature = stateQuery.feature;
        state.bridgeMetadata = stateQuery.metadata;
        state.canSaveSource = stateQuery.feature
          ? ArcGISRest.hasCapability(stateQuery.metadata, "Update")
          : ArcGISRest.hasCapability(stateQuery.metadata, "Create");
        const bridgeValue = stateQuery.feature?.attributes?.[liveFields.message];
        if (!el("message").value.trim()) {
          if (bridgeValue !== null && bridgeValue !== undefined) el("message").value = String(bridgeValue);
          else if (config.source.initialValue) el("message").value = config.source.initialValue;
        }
      }

      const channel = await ArcGISRest.queryChannel(values.liveTable, liveFields.channelId, values.channelId, token());
      state.channelFeature = channel.feature;
      state.channelMetadata = channel.metadata;
      state.canPublishChannel = channel.feature
        ? ArcGISRest.hasCapability(channel.metadata, "Update")
        : ArcGISRest.hasCapability(channel.metadata, "Create");

      if (channel.feature) {
        const attrs = channel.feature.attributes || {};
        if (!el("message").value.trim() && attrs[liveFields.message] !== undefined) el("message").value = String(attrs[liveFields.message] ?? "");
        if (attrs[liveFields.speed] != null) el("speed").value = attrs[liveFields.speed];
        if (attrs[liveFields.amplitude] != null) el("amplitude").value = attrs[liveFields.amplitude];
        if (attrs[liveFields.frequency] != null) el("frequency").value = attrs[liveFields.frequency];
        if (attrs[liveFields.palette]) el("palette").value = attrs[liveFields.palette];
      }

      renderValues(values);
      el("diagnostics").textContent = JSON.stringify({
        mode: values.mode,
        directLayer: values.mode === "direct" ? state.sourceMetadata?.name : "not used",
        directCapabilities: state.sourceMetadata?.capabilities || "not used",
        bridgeStateId: values.mode === "bridge" ? bridgeState(values).stateId : "not used",
        bridgeRecordExists: values.mode === "bridge" ? Boolean(state.bridgeFeature) : "not used",
        liveTable: channel.metadata.name,
        liveTableCapabilities: channel.metadata.capabilities,
        channelRecordExists: Boolean(channel.feature),
        canSaveSource: state.canSaveSource,
        canPublishChannel: state.canPublishChannel
      }, null, 2);
      BridgeCommon.setStatus("inspectStatus", `Loaded ${values.mode} source state and channel ${values.channelId}. Source persistence: ${state.canSaveSource ? "available" : "not available"}. Channel publication: ${state.canPublishChannel ? "available" : "not available"}.`, state.canSaveSource && state.canPublishChannel ? "good" : "warn");
      updateButton();
      return true;
    } catch (error) {
      BridgeCommon.setStatus("inspectStatus", `Inspection failed: ${error.message}`, "bad");
      updateButton();
      return false;
    }
  }

  function updateButton() {
    const confirmed = el("confirmPublish").checked;
    const oneAction = el("updateSource").checked || el("publishChannel").checked;
    el("publishButton").disabled = !(confirmed && oneAction);
  }

  async function publish() {
    const values = settings();
    const problems = validate(values);
    if (problems.length) return BridgeCommon.setStatus("publishStatus", problems.join("\n"), "bad");
    if (!auth.accessToken) return BridgeCommon.setStatus("publishStatus", "Sign in before performing edits.", "bad");
    if (!el("confirmPublish").checked) return BridgeCommon.setStatus("publishStatus", "Confirm the intended change before publishing.", "bad");

    const message = el("message").value;
    if (!message.trim()) return BridgeCommon.setStatus("publishStatus", "Message cannot be empty.", "bad");

    el("publishButton").disabled = true;
    BridgeCommon.setStatus("publishStatus", "Saving persistent source state and publishing live channel…", "info");
    const diagnostics = { startedAt: new Date().toISOString(), mode: values.mode, sourceSave: "skipped", channelPublish: "skipped" };

    try {
      if ((!state.sourceMetadata && values.mode === "direct") || (!state.bridgeMetadata && values.mode === "bridge") || !state.channelMetadata) {
        if (!(await inspect())) throw new Error("Inspection must succeed before publishing.");
      }

      if (el("updateSource").checked) {
        if (values.mode === "direct") {
          if (!state.canSaveSource) throw new Error("Source layer does not advertise an editable Update path.");
          const castMessage = BridgeCommon.castForField(message, state.sourceFieldDefinition);
          await ArcGISRest.updateAttributes(values.sourceService, state.sourceOidField, values.sourceOid, { [values.sourceField]: castMessage }, token());
          const verified = await ArcGISRest.queryByOid(values.sourceService, values.sourceOid, token(), state.sourceOidField);
          state.sourceFeature = verified.feature;
          const serverValue = verified.feature.attributes?.[values.sourceField];
          if (String(serverValue ?? "") !== String(castMessage ?? "")) throw new Error(`Source verification returned ${BridgeCommon.formatValue(serverValue)}.`);
          diagnostics.sourceSave = "direct attribute verified";
        } else {
          if (!state.canSaveSource) throw new Error("Live bridge table does not advertise the required Create or Update capability.");
          const currentVersion = Number(state.bridgeFeature?.attributes?.[liveFields.version] || 0);
          const result = await ArcGISRest.upsertState(values.liveTable, liveFields, bridgeState(values), {
            message,
            version: currentVersion + 1,
            updatedAt: Date.now(),
            updatedBy: auth.username || "ArcGIS user"
          }, token());
          const verified = await ArcGISRest.queryState(values.liveTable, liveFields.stateId, bridgeState(values).stateId, token());
          state.bridgeFeature = verified.feature;
          state.bridgeMetadata = verified.metadata;
          const serverValue = verified.feature?.attributes?.[liveFields.message];
          if (String(serverValue ?? "") !== message) throw new Error(`Bridge-state verification returned ${BridgeCommon.formatValue(serverValue)}.`);
          diagnostics.sourceSave = `${result.mode} bridge state verified`;
          diagnostics.bridgeStateId = bridgeState(values).stateId;
        }
      }

      if (el("publishChannel").checked) {
        const currentVersion = Number(state.channelFeature?.attributes?.[liveFields.version] || 0);
        const result = await ArcGISRest.upsertChannel(values.liveTable, liveFields, values.channelId, {
          message, version: currentVersion + 1, speed: Number(el("speed").value),
          amplitude: Number(el("amplitude").value), frequency: Number(el("frequency").value),
          palette: el("palette").value, updatedAt: Date.now(), updatedBy: auth.username || "ArcGIS user"
        }, token());
        const verified = await ArcGISRest.queryChannel(values.liveTable, liveFields.channelId, values.channelId, token());
        state.channelFeature = verified.feature;
        state.channelMetadata = verified.metadata;
        const channelMessage = verified.feature?.attributes?.[liveFields.message];
        if (String(channelMessage ?? "") !== message) throw new Error(`Channel verification returned ${BridgeCommon.formatValue(channelMessage)}.`);
        diagnostics.channelPublish = `${result.mode} verified`;
        diagnostics.messageVersion = verified.feature?.attributes?.[liveFields.version];
      }

      diagnostics.completedAt = new Date().toISOString();
      renderValues(values);
      el("diagnostics").textContent = JSON.stringify(diagnostics, null, 2);
      BridgeCommon.setStatus("publishStatus", "Persistent source value and live channel were saved and verified.", "good");
      el("confirmPublish").checked = false;
    } catch (error) {
      diagnostics.error = error.message;
      el("diagnostics").textContent = JSON.stringify(diagnostics, null, 2);
      BridgeCommon.setStatus("publishStatus", `Publication failed: ${error.message}`, "bad");
    } finally {
      updateButton();
    }
  }

  renderEnvironment();
  fillInputs();
  el("sourceMode").addEventListener("change", applyModeUi);
  el("inspectButton").addEventListener("click", inspect);
  el("publishButton").addEventListener("click", publish);
  ["confirmPublish", "updateSource", "publishChannel"].forEach((id) => el(id).addEventListener("change", updateButton));
  auth.addEventListener("tokenchange", () => inspect());
  updateButton();
})();
