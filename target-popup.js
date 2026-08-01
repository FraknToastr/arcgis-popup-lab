(() => {
  "use strict";

  const config = BridgeCommon.resolveConfig();
  const liveFields = {
    stateId: "state_id", message: "message", version: "message_version",
    updatedAt: "updated_at", updatedBy: "updated_by", ...(config.liveFields || {})
  };
  const el = (id) => document.getElementById(id);
  const auth = new ArcGISAuthPanel("authHost", {
    portalUrl: config.portalUrl,
    clientId: config.clientId,
    redirectUri: config.oauthRedirectUri,
    storagePrefix: "popup-live-bridge-target-v11"
  });

  const state = { running:false,busy:false,timer:null,currentValue:Symbol("not-loaded"),checks:0,changes:0,metadata:null,oidField:"" };

  function values() {
    const mode = BridgeCommon.normalizeMode(el("targetMode").value);
    return {
      mode,
      service: BridgeCommon.normalizeUrl(el("targetService").value),
      field: el("targetField").value.trim(),
      oid: Number(el("targetOid").value),
      oidField: el("targetOidField").value.trim(),
      liveTable: BridgeCommon.normalizeUrl(el("liveTable").value),
      layerKey: mode === "bridge" ? BridgeCommon.normalizeLayerKey(el("targetLayerKey").value) : el("targetLayerKey").value.trim(),
      featureKey: mode === "bridge" ? BridgeCommon.normalizeFeatureKey(el("targetKey").value) : el("targetKey").value.trim(),
      featureKeyField: el("targetKeyField").value.trim(),
      bridgeDisplayField: el("bridgeDisplayField").value.trim(),
      pollMs: Math.max(500, Number(el("pollMs").value) || 1000)
    };
  }

  function stateId(v) { return BridgeCommon.stateId(v.layerKey, v.featureKey); }

  function validate(v) {
    const problems = [];
    if (v.mode === "direct") {
      problems.push(...BridgeCommon.validateLayerUrl(v.service, "Target feature layer URL"));
      if (!v.field) problems.push("Display field is required.");
      if (!Number.isInteger(v.oid)) problems.push("Object ID must be an integer.");
    } else {
      problems.push(...BridgeCommon.validateLayerUrl(v.liveTable, "Live bridge table URL"));
      if (!v.layerKey) problems.push("Logical layer key is required.");
      if (!v.featureKey) problems.push("Selected feature key is required.");
      if (!v.featureKeyField) problems.push("Feature key field is required.");
      if (!v.bridgeDisplayField) problems.push("Popup display field name is required.");
    }
    return problems;
  }

  function applyModeUi() {
    const bridge = el("targetMode").value === "bridge";
    el("directTargetFields").style.display = bridge ? "none" : "grid";
    el("bridgeTargetFields").style.display = bridge ? "grid" : "none";
    renderDetails(values());
  }

  function renderDetails(v, lastChecked = "Not checked") {
    const identity = v.mode === "bridge" ? `${v.layerKey}|${v.featureKey}` : `${v.oidField || state.oidField || "OID"}=${v.oid}`;
    const pairs = [
      ["Source", config.sourceName], ["Inside iframe", String(window.self !== window.top)],
      ["Mode", v.mode], ["Identity", identity],
      ["Display field", v.mode === "bridge" ? v.bridgeDisplayField : v.field],
      ["Last checked", lastChecked], ["Checks", state.checks], ["Detected changes", state.changes]
    ];
    el("receiverDetails").innerHTML = pairs.map(([key,value]) => `<dt>${BridgeCommon.escapeHtml(key)}</dt><dd>${BridgeCommon.escapeHtml(value)}</dd>`).join("");
  }

  function setValue(value) {
    const node = el("receiverValue");
    if (typeof state.currentValue !== "symbol" && String(state.currentValue ?? "") !== String(value ?? "")) {
      state.changes += 1;
      node.classList.add("changed");
      setTimeout(() => node.classList.remove("changed"), 360);
    }
    state.currentValue = value;
    node.textContent = value === undefined ? "No bridge state exists yet" : BridgeCommon.formatValue(value);
  }

  async function refresh() {
    if (state.busy) return;
    const v = values();
    const problems = validate(v);
    if (problems.length) return BridgeCommon.setStatus("receiverStatus", problems.join("\n"), "bad");
    state.busy = true;
    try {
      let value;
      if (v.mode === "direct") {
        const result = await ArcGISRest.queryByOid(v.service, v.oid, auth.accessToken, v.oidField);
        state.metadata = result.metadata;
        state.oidField = result.oidField;
        el("targetOidField").value = result.oidField;
        const field = ArcGISRest.field(result.metadata, v.field);
        if (!field) throw new Error(`Target layer does not contain field ${v.field}.`);
        value = result.feature.attributes?.[v.field];
      } else {
        const result = await ArcGISRest.queryState(v.liveTable, liveFields.stateId, stateId(v), auth.accessToken);
        state.metadata = result.metadata;
        value = result.feature?.attributes?.[liveFields.message];
      }
      state.checks += 1;
      setValue(value);
      const checked = new Date().toLocaleTimeString();
      renderDetails(v, checked);
      BridgeCommon.setStatus("receiverStatus", `${v.mode === "bridge" ? "Bridge state" : "Feature value"} refreshed at ${checked}.`, "good");
    } catch (error) {
      BridgeCommon.setStatus("receiverStatus", `Receiver query failed: ${error.message}`, "bad");
    } finally { state.busy = false; }
  }

  function schedule() {
    clearTimeout(state.timer);
    if (!state.running) return;
    state.timer = setTimeout(async () => { await refresh(); schedule(); }, values().pollMs);
  }

  async function toggle() {
    state.running = !state.running;
    el("receiverToggle").textContent = state.running ? "Stop receiver" : "Start receiver";
    el("receiverToggle").className = state.running ? "danger" : "good";
    if (state.running) { await refresh(); schedule(); }
    else { clearTimeout(state.timer); BridgeCommon.setStatus("receiverStatus", "Receiver is stopped.", "info"); }
  }

  function init() {
    el("targetMode").value = config.target.mode;
    el("targetService").value = config.target.serviceUrl;
    el("targetField").value = config.target.displayField;
    el("targetOid").value = config.target.objectId ?? "";
    el("targetOidField").value = config.target.objectIdField;
    el("liveTable").value = config.liveTableUrl;
    el("targetLayerKey").value = config.target.layerKey;
    el("targetKey").value = config.target.featureKey;
    el("targetKeyField").value = config.target.featureKeyField;
    el("bridgeDisplayField").value = config.target.displayField;
    el("pollMs").value = config.pollIntervalMs;
    applyModeUi();
    el("targetMode").addEventListener("change", applyModeUi);
    el("receiverToggle").addEventListener("click", toggle);
    el("receiverNow").addEventListener("click", refresh);
    auth.addEventListener("tokenchange", () => state.running && refresh());
    toggle();
  }

  init();
})();
