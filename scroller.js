(() => {
  "use strict";

  const config = BridgeCommon.resolveConfig();
  const liveFields = {
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
    updatedBy: "updated_by",
    ...(config.liveFields || {})
  };

  const el = (id) => document.getElementById(id);
  const auth = new ArcGISAuthPanel("authHost", {
    portalUrl: config.portalUrl,
    clientId: config.clientId,
    redirectUri: config.oauthRedirectUri,
    storagePrefix: "popup-live-bridge-scroller"
  });

  const canvas = el("scrollerCanvas");
  const ctx = canvas.getContext("2d", { alpha: false });
  const render = {
    width: 0,
    height: 0,
    dpr: 1,
    time: 0,
    lastTime: performance.now(),
    scroll: 0,
    message: "POPUP LIVE BRIDGE READY — PUBLISH A MESSAGE FROM LAYER A — ",
    speed: 145,
    amplitude: 72,
    frequency: 0.018,
    palette: "neon",
    stars: [],
    lastVersion: null,
    changedAt: performance.now()
  };

  const targetState = { metadata: null, feature: null, oidField: "", fields: [], mode: "direct", loaded: false, stateFeature: null };
  let polling = false;
  let pollTimer = null;
  let pollBusy = false;

  function token() { return auth.accessToken; }

  function resize() {
    render.dpr = Math.min(2, window.devicePixelRatio || 1);
    render.width = window.innerWidth;
    render.height = window.innerHeight;
    canvas.width = Math.round(render.width * render.dpr);
    canvas.height = Math.round(render.height * render.dpr);
    ctx.setTransform(render.dpr, 0, 0, render.dpr, 0, 0);
    createStars();
  }

  function createStars() {
    const count = Math.max(90, Math.floor((render.width * render.height) / 7000));
    render.stars = Array.from({ length: count }, () => ({
      x: Math.random() * render.width,
      y: Math.random() * render.height * .72,
      z: .2 + Math.random() * .8,
      phase: Math.random() * Math.PI * 2
    }));
  }

  function paletteColor(index, x, time, alpha = 1) {
    const palette = render.palette;
    if (palette === "cyan") return `rgba(${40 + (index % 3) * 20},${200 + (index % 2) * 35},255,${alpha})`;
    if (palette === "phosphor") return `rgba(${80 + (index % 3) * 25},255,${90 + (index % 2) * 35},${alpha})`;
    if (palette === "sunset") {
      const hue = 8 + ((index * 11 + x * .04 + time * 18) % 55);
      return `hsla(${hue},100%,62%,${alpha})`;
    }
    if (palette === "magenta") return `hsla(${290 + ((index * 8) % 55)},100%,68%,${alpha})`;
    if (palette === "rainbow") return `hsla(${(index * 17 + x * .1 + time * 60) % 360},100%,68%,${alpha})`;
    return `hsla(${(185 + index * 13 + time * 28) % 360},100%,68%,${alpha})`;
  }

  function drawBackground(time) {
    const gradient = ctx.createLinearGradient(0, 0, 0, render.height);
    gradient.addColorStop(0, "#020713");
    gradient.addColorStop(.56, "#07152a");
    gradient.addColorStop(1, "#190525");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, render.width, render.height);

    for (const star of render.stars) {
      const twinkle = .35 + .65 * Math.abs(Math.sin(time * (1 + star.z * 2) + star.phase));
      ctx.fillStyle = `rgba(170,220,255,${twinkle * star.z})`;
      const size = .6 + star.z * 1.8;
      ctx.fillRect(star.x, star.y, size, size);
      star.x -= render.speed * .008 * star.z;
      if (star.x < -3) star.x = render.width + 3;
    }

    const horizon = render.height * .69;
    ctx.save();
    ctx.strokeStyle = "rgba(100,80,255,.18)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 18; i++) {
      const t = i / 17;
      const y = horizon + (render.height - horizon) * Math.pow(t, 2.2);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(render.width, y);
      ctx.stroke();
    }
    const gridOffset = (time * 45) % 70;
    for (let x = -render.width; x < render.width * 2; x += 70) {
      ctx.beginPath();
      ctx.moveTo(render.width / 2 + (x + gridOffset) * .08, horizon);
      ctx.lineTo(render.width / 2 + (x + gridOffset) * 1.9, render.height);
      ctx.stroke();
    }
    ctx.restore();

    const glow = ctx.createRadialGradient(render.width * .5, horizon, 0, render.width * .5, horizon, render.width * .5);
    glow.addColorStop(0, `hsla(${(time * 18) % 360},100%,60%,.18)`);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, horizon - 100, render.width, 230);
  }

  function scrollerRightEdge() {
    const panel = el("controlPanel");
    if (!panel || panel.classList.contains("collapsed")) return render.width;
    const bounds = panel.getBoundingClientRect();
    if (bounds.left <= 0 || bounds.left >= render.width) return render.width;
    return Math.max(180, bounds.left - 18);
  }

  function textMetrics(availableWidth = render.width) {
    const size = Math.max(38, Math.min(88, availableWidth / 12));
    ctx.font = `900 ${size}px "Segoe UI", Arial, sans-serif`;
    const spacing = size * .08;
    const chars = [...`${render.message}     `];
    const widths = chars.map((char) => ctx.measureText(char).width + spacing);
    return { size, spacing, chars, widths, total: widths.reduce((a, b) => a + b, 0) };
  }

  function drawScroller(time) {
    const rightEdge = scrollerRightEdge();
    const metrics = textMetrics(rightEdge);
    const yBase = render.height * .47;
    let cursor = rightEdge - (render.scroll % Math.max(metrics.total, 1));
    const copies = Math.ceil((rightEdge + metrics.total) / Math.max(metrics.total, 1)) + 1;
    const fadeIn = Math.min(1, (performance.now() - render.changedAt) / 350);

    // Keep the animated message in the visible stage. When the control panel is
    // open, the scroller stops at its left edge instead of disappearing behind it.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, rightEdge, render.height);
    ctx.clip();
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    for (let copy = 0; copy < copies; copy++) {
      for (let i = 0; i < metrics.chars.length; i++) {
        const char = metrics.chars[i];
        const width = metrics.widths[i];
        const x = cursor;
        if (x > -metrics.size * 2 && x < rightEdge + metrics.size * 2) {
          const phase = x * render.frequency + time * 2.15;
          const y = yBase + Math.sin(phase) * render.amplitude;
          const slope = render.amplitude * render.frequency * Math.cos(phase);
          const angle = Math.atan(slope) * .72;
          const pulse = 1 + Math.sin(time * 3.1 + i * .35) * .045;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(angle);
          ctx.scale(pulse * fadeIn, pulse * fadeIn);
          ctx.shadowBlur = 28;
          ctx.shadowColor = paletteColor(i, x, time, .9);
          ctx.fillStyle = paletteColor(i, x, time, 1);
          ctx.fillText(char, 0, 0);
          ctx.shadowBlur = 4;
          ctx.strokeStyle = "rgba(255,255,255,.7)";
          ctx.lineWidth = Math.max(1, metrics.size * .018);
          ctx.strokeText(char, 0, 0);
          ctx.restore();
        }
        cursor += width;
      }
    }
    ctx.restore();
  }

  function drawScanlines() {
    ctx.save();
    ctx.globalAlpha = .16;
    ctx.fillStyle = "#000";
    for (let y = 0; y < render.height; y += 4) ctx.fillRect(0, y, render.width, 1);
    ctx.restore();
    const vignette = ctx.createRadialGradient(render.width / 2, render.height / 2, Math.min(render.width, render.height) * .2, render.width / 2, render.height / 2, Math.max(render.width, render.height) * .72);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,.65)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, render.width, render.height);
  }

  function frame(now) {
    const delta = Math.min(.05, (now - render.lastTime) / 1000);
    render.lastTime = now;
    render.time += delta;
    render.scroll += render.speed * delta;
    drawBackground(render.time);
    drawScroller(render.time);
    drawScanlines();
    requestAnimationFrame(frame);
  }

  function applyMessage(values, source = "live") {
    const nextMessage = String(values.message || " ").trim() || " ";
    if (nextMessage !== render.message || values.version !== render.lastVersion) {
      render.message = `${nextMessage}     `;
      render.scroll = 0;
      render.changedAt = performance.now();
    }
    render.lastVersion = values.version ?? render.lastVersion;
    render.speed = Math.max(20, Number(values.speed) || render.speed);
    render.amplitude = Math.max(0, Number(values.amplitude) || 0);
    render.frequency = Math.max(.001, Number(values.frequency) || render.frequency);
    render.palette = values.palette || render.palette;
    el("manualMessage").value = nextMessage;
    el("manualSpeed").value = render.speed;
    el("manualAmplitude").value = render.amplitude;
    el("manualFrequency").value = render.frequency;
    el("manualPalette").value = render.palette;
    el("currentMessage").textContent = nextMessage;
    el("hudStatus").textContent = `${source.toUpperCase()} • version ${values.version ?? "local"} • ${values.updatedBy || "unknown user"} • ${BridgeCommon.formatDate(values.updatedAt)}`;
  }

  function liveSettings() {
    return {
      liveTable: BridgeCommon.normalizeUrl(el("liveTable").value),
      channelId: el("channelId").value.trim(),
      pollMs: Math.max(500, Number(el("pollMs").value) || 1000)
    };
  }

  async function pollOnce() {
    if (pollBusy) return;
    const settings = liveSettings();
    const problems = BridgeCommon.validateLayerUrl(settings.liveTable, "Live table URL");
    if (!settings.channelId) problems.push("Channel ID is required.");
    if (problems.length) {
      BridgeCommon.setStatus("pollStatus", problems.join("\n"), "bad");
      return;
    }
    pollBusy = true;
    try {
      const result = await ArcGISRest.queryChannel(settings.liveTable, liveFields.channelId, settings.channelId, token());
      if (!result.feature) throw new Error(`Channel ${settings.channelId} does not exist.`);
      const attrs = result.feature.attributes || {};
      applyMessage({
        message: attrs[liveFields.message],
        version: attrs[liveFields.version],
        speed: attrs[liveFields.speed],
        amplitude: attrs[liveFields.amplitude],
        frequency: attrs[liveFields.frequency],
        palette: attrs[liveFields.palette],
        updatedAt: attrs[liveFields.updatedAt],
        updatedBy: attrs[liveFields.updatedBy]
      }, "live");
      el("liveDot").classList.add("on");
      el("liveText").textContent = `Live — ${settings.channelId}`;
      el("hudChannel").textContent = `CHANNEL ${settings.channelId}`;
      BridgeCommon.setStatus("pollStatus", `Channel ${settings.channelId} checked successfully.`, "good");
    } catch (error) {
      el("liveDot").classList.remove("on");
      el("liveText").textContent = "Polling error";
      BridgeCommon.setStatus("pollStatus", `Live poll failed: ${error.message}`, "bad");
    } finally {
      pollBusy = false;
    }
  }

  function schedulePoll() {
    clearTimeout(pollTimer);
    if (!polling) return;
    pollTimer = setTimeout(async () => {
      await pollOnce();
      schedulePoll();
    }, liveSettings().pollMs);
  }

  async function togglePolling() {
    polling = !polling;
    el("pollToggle").textContent = polling ? "Stop live polling" : "Start live polling";
    el("pollToggle").className = polling ? "danger" : "good";
    if (polling) {
      el("liveText").textContent = "Starting…";
      await pollOnce();
      schedulePoll();
    } else {
      clearTimeout(pollTimer);
      el("liveDot").classList.remove("on");
      el("liveText").textContent = "Stopped";
      BridgeCommon.setStatus("pollStatus", "Polling is stopped.", "info");
    }
  }

  function applyLocal() {
    applyMessage({
      message: el("manualMessage").value,
      version: "local",
      speed: Number(el("manualSpeed").value),
      amplitude: Number(el("manualAmplitude").value),
      frequency: Number(el("manualFrequency").value),
      palette: el("manualPalette").value,
      updatedAt: Date.now(),
      updatedBy: "local preview"
    }, "local");
  }

  function editableFields(metadata) {
    const excluded = new Set([
      metadata.objectIdField, metadata.globalIdField, metadata.shapeFieldName, metadata.typeIdField,
      metadata.editFieldsInfo?.creationDateField, metadata.editFieldsInfo?.creatorField,
      metadata.editFieldsInfo?.editDateField, metadata.editFieldsInfo?.editorField
    ].filter(Boolean));
    const supported = new Set(["esriFieldTypeString", "esriFieldTypeSmallInteger", "esriFieldTypeInteger", "esriFieldTypeSingle", "esriFieldTypeDouble", "esriFieldTypeDate"]);
    return (metadata.fields || []).filter((field) => field.editable !== false && !excluded.has(field.name) && supported.has(field.type));
  }

  function targetSettings() {
    const rawFeatureKey = el("targetFeatureKey").value;
    const mode = BridgeCommon.normalizeMode(el("targetMode").value);
    return {
      mode,
      service: BridgeCommon.normalizeUrl(el("targetService").value),
      oid: Number(el("targetOid").value),
      oidField: el("targetOidField").value.trim(),
      bridgeTable: BridgeCommon.normalizeUrl(el("targetBridgeTable").value),
      layerKey: mode === "bridge" ? BridgeCommon.normalizeLayerKey(el("targetLayerKey").value) : el("targetLayerKey").value.trim(),
      featureKey: mode === "bridge" ? BridgeCommon.normalizeFeatureKey(rawFeatureKey) : rawFeatureKey.trim(),
      rawFeatureKey,
      featureKeyField: el("targetFeatureKeyField").value.trim(),
      displayField: el("targetBridgeDisplayField").value.trim()
    };
  }

  function targetStateIdentity(settings) {
    return {
      stateId: BridgeCommon.stateId(settings.layerKey, settings.featureKey),
      layerKey: settings.layerKey,
      featureKey: settings.featureKey,
      featureKeyField: settings.featureKeyField,
      displayField: settings.displayField
    };
  }

  function applyTargetModeUi() {
    const bridge = el("targetMode").value === "bridge";
    el("directTargetControls").style.display = bridge ? "none" : "block";
    el("bridgeTargetControls").style.display = bridge ? "block" : "none";
    el("confirmTargetLabel").textContent = bridge
      ? "I confirm that this is an intended bridge-state change for the selected Layer B feature."
      : "I confirm that this is an intended Layer B attribute edit.";
    targetState.mode = bridge ? "bridge" : "direct";
    targetState.loaded = false;
    targetState.metadata = null;
    targetState.feature = null;
    targetState.stateFeature = null;
    el("targetValue").disabled = true;
    el("targetStatus").textContent = "Target has not been loaded.";
    el("targetDiagnostics").textContent = "No target diagnostics.";
    updateTargetButton();
  }

  async function loadTarget() {
    const settings = targetSettings();
    const problems = [];
    if (settings.mode === "direct") {
      problems.push(...BridgeCommon.validateLayerUrl(settings.service, "Target feature layer URL"));
      if (!Number.isInteger(settings.oid)) problems.push("Target Object ID must be an integer.");
    } else {
      problems.push(...BridgeCommon.validateLayerUrl(settings.bridgeTable, "Bridge table URL"));
      if (!settings.layerKey) problems.push("Logical layer key is required.");
      if (!settings.featureKey) problems.push("Feature key is required.");
      if (!settings.featureKeyField) problems.push("Feature key field is required.");
      if (!settings.displayField) problems.push("Popup display field name is required.");
    }
    if (problems.length) return BridgeCommon.setStatus("targetStatus", problems.join("\n"), "bad");

    BridgeCommon.setStatus("targetStatus", `Loading ${settings.mode} target…`, "info");
    try {
      if (settings.mode === "bridge" && settings.featureKey !== String(settings.rawFeatureKey || "").trim()) {
        el("targetFeatureKey").value = settings.featureKey;
        BridgeCommon.setStatus("targetStatus", "A copied attribute-table row was detected. The GUID bridge key was extracted automatically.", "warn");
      }
      targetState.mode = settings.mode;
      if (settings.mode === "direct") {
        const result = await ArcGISRest.queryByOid(settings.service, settings.oid, token(), settings.oidField);
        targetState.metadata = result.metadata;
        targetState.feature = result.feature;
        targetState.oidField = result.oidField;
        targetState.fields = editableFields(result.metadata);
        targetState.loaded = true;
        el("targetOidField").value = result.oidField;
        const select = el("targetField");
        select.innerHTML = `<option value="">Select an editable field</option>` + targetState.fields.map((field) => {
          const label = field.alias && field.alias !== field.name ? `${field.alias} (${field.name})` : field.name;
          return `<option value="${BridgeCommon.escapeHtml(field.name)}">${BridgeCommon.escapeHtml(label)}</option>`;
        }).join("");
        select.disabled = targetState.fields.length === 0;
        if (targetState.fields.some((field) => field.name === config.target.displayField)) select.value = config.target.displayField;
        renderTargetField();
        const canUpdate = ArcGISRest.hasCapability(result.metadata, "Update");
        el("targetDiagnostics").textContent = JSON.stringify({ mode: "direct", layer: result.metadata.name, capabilities: result.metadata.capabilities, objectIdField: result.oidField, editableFieldCount: targetState.fields.length, updateAdvertised: canUpdate }, null, 2);
        BridgeCommon.setStatus("targetStatus", canUpdate ? "Direct target loaded and Update is advertised." : "Direct target loaded, but Update is not advertised. Use bridge mode for read-only or multipatch layers.", canUpdate ? "good" : "warn");
      } else {
        const identity = targetStateIdentity(settings);
        const result = await ArcGISRest.queryState(settings.bridgeTable, liveFields.stateId, identity.stateId, token());
        targetState.metadata = result.metadata;
        targetState.stateFeature = result.feature;
        targetState.loaded = true;
        el("targetValue").disabled = false;
        el("targetValue").value = result.feature?.attributes?.[liveFields.message] ?? "";
        const canWrite = result.feature ? ArcGISRest.hasCapability(result.metadata, "Update") : ArcGISRest.hasCapability(result.metadata, "Create");
        el("targetDiagnostics").textContent = JSON.stringify({ mode: "bridge", stateId: identity.stateId, recordExists: Boolean(result.feature), liveTable: result.metadata.name, capabilities: result.metadata.capabilities, canWrite }, null, 2);
        BridgeCommon.setStatus("targetStatus", canWrite ? "Bridge target loaded and persistent state can be written." : "Bridge target loaded, but the table does not advertise the required Create or Update capability.", canWrite ? "good" : "warn");
      }
      updateTargetButton();
    } catch (error) {
      targetState.loaded = false;
      BridgeCommon.setStatus("targetStatus", `Target load failed: ${error.message}`, "bad");
      updateTargetButton();
    }
  }

  function selectedTargetField() {
    return targetState.fields.find((field) => field.name === el("targetField").value) || null;
  }

  function renderTargetField() {
    if (targetState.mode === "bridge") return;
    const field = selectedTargetField();
    const value = field ? targetState.feature?.attributes?.[field.name] : "";
    el("targetValue").disabled = !field;
    el("targetValue").value = value ?? "";
    updateTargetButton();
  }

  function updateTargetButton() {
    const confirmed = el("confirmTarget").checked;
    let writable = false;
    if (targetState.mode === "direct") writable = targetState.loaded && selectedTargetField() && ArcGISRest.hasCapability(targetState.metadata, "Update");
    else writable = targetState.loaded && (targetState.stateFeature ? ArcGISRest.hasCapability(targetState.metadata, "Update") : ArcGISRest.hasCapability(targetState.metadata, "Create"));
    el("applyTarget").disabled = !(auth.accessToken && writable && confirmed);
  }

  async function applyTarget() {
    const settings = targetSettings();
    el("applyTarget").disabled = true;
    BridgeCommon.setStatus("targetStatus", `Applying ${settings.mode} target update…`, "info");
    try {
      if (settings.mode === "direct") {
        const field = selectedTargetField();
        if (!field) throw new Error("Select an editable target field.");
        const value = BridgeCommon.castForField(el("targetValue").value, field);
        await ArcGISRest.updateAttributes(settings.service, targetState.oidField, settings.oid, { [field.name]: value }, token());
        const verified = await ArcGISRest.queryByOid(settings.service, settings.oid, token(), targetState.oidField);
        targetState.feature = verified.feature;
        const serverValue = verified.feature.attributes?.[field.name];
        if (String(serverValue ?? "") !== String(value ?? "")) throw new Error(`Update verification returned ${BridgeCommon.formatValue(serverValue)}.`);
        el("targetDiagnostics").textContent = JSON.stringify({ mode: "direct", field: field.name, submitted: value, verified: serverValue, verifiedAt: new Date().toISOString() }, null, 2);
        BridgeCommon.setStatus("targetStatus", `Layer B field ${field.name} was updated and verified.`, "good");
      } else {
        const identity = targetStateIdentity(settings);
        const message = el("targetValue").value;
        const currentVersion = Number(targetState.stateFeature?.attributes?.[liveFields.version] || 0);
        const result = await ArcGISRest.upsertState(settings.bridgeTable, liveFields, identity, { message, version: currentVersion + 1, updatedAt: Date.now(), updatedBy: auth.username || "ArcGIS user" }, token());
        const verified = await ArcGISRest.queryState(settings.bridgeTable, liveFields.stateId, identity.stateId, token());
        targetState.stateFeature = verified.feature;
        const serverValue = verified.feature?.attributes?.[liveFields.message];
        if (String(serverValue ?? "") !== String(message ?? "")) throw new Error(`Bridge verification returned ${BridgeCommon.formatValue(serverValue)}.`);
        el("targetDiagnostics").textContent = JSON.stringify({ mode: "bridge", stateId: identity.stateId, operation: result.mode, submitted: message, verified: serverValue, version: verified.feature?.attributes?.[liveFields.version], verifiedAt: new Date().toISOString() }, null, 2);
        BridgeCommon.setStatus("targetStatus", "Layer B bridge state was updated and verified. The open bridge-mode popup will detect it on the next poll.", "good");
      }
      el("confirmTarget").checked = false;
    } catch (error) {
      BridgeCommon.setStatus("targetStatus", `Layer B update failed: ${error.message}`, "bad");
    } finally { updateTargetButton(); }
  }

  function initialiseControls() {
    el("liveTable").value = config.liveTableUrl;
    el("channelId").value = config.channelId;
    el("pollMs").value = config.pollIntervalMs;
    el("targetMode").value = config.target.mode;
    el("targetService").value = config.target.serviceUrl;
    el("targetOid").value = config.target.objectId ?? "";
    el("targetOidField").value = config.target.objectIdField;
    el("targetBridgeTable").value = config.liveTableUrl;
    el("targetLayerKey").value = config.target.layerKey;
    el("targetFeatureKey").value = config.target.featureKey;
    el("targetFeatureKeyField").value = config.target.featureKeyField;
    el("targetBridgeDisplayField").value = config.target.displayField;
    el("manualMessage").value = render.message;
    el("manualSpeed").value = render.speed;
    el("manualAmplitude").value = render.amplitude;
    el("manualFrequency").value = render.frequency;
    el("manualPalette").value = render.palette;
    el("hudChannel").textContent = `CHANNEL ${config.channelId}`;
    applyTargetModeUi();
  }

  el("controlToggle").addEventListener("click", () => {
    el("controlPanel").classList.toggle("collapsed");
    render.scroll = 0;
    render.changedAt = performance.now();
  });
  el("pollToggle").addEventListener("click", togglePolling);
  el("pollNow").addEventListener("click", pollOnce);
  el("applyVisual").addEventListener("click", applyLocal);
  el("loadTarget").addEventListener("click", loadTarget);
  el("targetMode").addEventListener("change", applyTargetModeUi);
  el("targetField").addEventListener("change", renderTargetField);
  el("confirmTarget").addEventListener("change", updateTargetButton);
  el("applyTarget").addEventListener("click", applyTarget);
  auth.addEventListener("tokenchange", () => {
    updateTargetButton();
    if (polling) pollOnce();
  });
  window.addEventListener("resize", resize);

  initialiseControls();
  resize();
  requestAnimationFrame(frame);
  togglePolling();
})();
