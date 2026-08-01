(() => {
  "use strict";

  const config = BridgeCommon.resolveConfig();
  const startupParams = new URLSearchParams(window.location.search);
  const DEFAULT_TARGET_FEATURE_KEY = "F7423684-4AE6-4408-8D05-6F58AD7183C2";
  const DEFAULT_FONT_SIZE = 120;
  const FONT_SIZE_MIN = 28;
  const FONT_SIZE_MAX = 220;
  const FONT_SIZE_STORAGE_KEY = "popup-live-bridge-scroller-font-size";

  function clampFontSize(value, fallback = DEFAULT_FONT_SIZE) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, Math.round(numeric)));
  }

  function storedFontSize() {
    try {
      return window.localStorage.getItem(FONT_SIZE_STORAGE_KEY);
    } catch (_) {
      return null;
    }
  }

  function saveFontSize(value) {
    try {
      window.localStorage.setItem(FONT_SIZE_STORAGE_KEY, String(value));
    } catch (_) {
      // Storage can be unavailable in restricted embedded contexts.
    }
  }

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

  // Offscreen stages keep the text mask crisp while the plasma texture is
  // rendered at a lower resolution for smooth animation.
  const textCanvas = document.createElement("canvas");
  const textCtx = textCanvas.getContext("2d");
  const maskCanvas = document.createElement("canvas");
  const maskCtx = maskCanvas.getContext("2d");
  const colourCanvas = document.createElement("canvas");
  const colourCtx = colourCanvas.getContext("2d");
  const plasmaCanvas = document.createElement("canvas");
  const plasmaCtx = plasmaCanvas.getContext("2d", { alpha: false });
  let plasmaImage = null;
  let lastPlasmaTick = -1;
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
    fontSize: (() => {
      const requested = startupParams.get("fontSize") ?? storedFontSize() ?? config.scrollerFontSize;
      return clampFontSize(requested);
    })(),
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

    const stageWidth = Math.max(1, Math.ceil(render.width));
    const stageHeight = Math.max(1, Math.ceil(render.height));
    for (const offscreen of [textCanvas, maskCanvas, colourCanvas]) {
      offscreen.width = stageWidth;
      offscreen.height = stageHeight;
    }

    // The plasma is intentionally generated at reduced resolution, then
    // enlarged through the text mask. This gives it a classic demoscene look
    // without performing full-screen per-pixel work every frame.
    plasmaCanvas.width = Math.max(160, Math.min(280, Math.round(stageWidth / 5)));
    plasmaCanvas.height = Math.max(96, Math.min(160, Math.round(stageHeight / 5)));
    plasmaImage = plasmaCtx.createImageData(plasmaCanvas.width, plasmaCanvas.height);
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

  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s /= 100;
    l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hp = h / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let r = 0, g = 0, b = 0;
    if (hp < 1) [r, g, b] = [c, x, 0];
    else if (hp < 2) [r, g, b] = [x, c, 0];
    else if (hp < 3) [r, g, b] = [0, c, x];
    else if (hp < 4) [r, g, b] = [0, x, c];
    else if (hp < 5) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    const m = l - c / 2;
    return [
      Math.round((r + m) * 255),
      Math.round((g + m) * 255),
      Math.round((b + m) * 255)
    ];
  }

  function plasmaPalette(index, time) {
    const t = index / 255;
    let hue;
    let saturation = 100;
    let lightness = 58 + Math.sin(t * Math.PI * 4 + time * 1.4) * 10;

    switch (render.palette) {
      case "cyan":
        hue = 178 + t * 42 + Math.sin(time) * 8;
        lightness = 45 + t * 30;
        break;
      case "phosphor":
        hue = 92 + t * 52 + Math.sin(time * .8) * 6;
        lightness = 42 + t * 28;
        break;
      case "sunset":
        hue = 352 + t * 76 + Math.sin(time * .9) * 10;
        lightness = 48 + t * 22;
        break;
      case "magenta":
        hue = 268 + t * 86 + Math.sin(time) * 12;
        lightness = 48 + t * 24;
        break;
      case "rainbow":
        hue = t * 360 + time * 48;
        lightness = 55 + Math.sin(t * Math.PI * 6) * 10;
        break;
      default:
        hue = 172 + t * 190 + time * 34;
        lightness = 52 + Math.sin(t * Math.PI * 5 + time) * 12;
        break;
    }
    return hslToRgb(hue, saturation, Math.max(28, Math.min(78, lightness)));
  }

  function renderPlasma(time) {
    if (!plasmaImage) return;
    const plasmaTick = Math.floor(time * 30);
    if (plasmaTick === lastPlasmaTick) return;
    lastPlasmaTick = plasmaTick;
    const width = plasmaCanvas.width;
    const height = plasmaCanvas.height;
    const data = plasmaImage.data;
    const lut = new Uint8ClampedArray(256 * 3);
    for (let i = 0; i < 256; i++) {
      const [r, g, b] = plasmaPalette(i, time);
      const offset = i * 3;
      lut[offset] = r;
      lut[offset + 1] = g;
      lut[offset + 2] = b;
    }

    // Existing amplitude/frequency fields are retained for compatibility with
    // the bridge table. They now control plasma turbulence and cell density.
    const turbulence = Math.max(.15, Math.min(3.5, render.amplitude / 72));
    const density = Math.max(.3, Math.min(5.5, .45 + render.frequency * 88));
    const cx = width * (.5 + Math.sin(time * .31) * .18);
    const cy = height * (.5 + Math.cos(time * .27) * .18);
    let p = 0;

    for (let y = 0; y < height; y++) {
      const py = y * .072 * density;
      for (let x = 0; x < width; x++) {
        const px = x * .064 * density;
        const radial = Math.hypot(x - cx, y - cy) * .075 * density;
        const value =
          Math.sin(px + time * 1.45) +
          Math.sin(py - time * 1.18) +
          Math.sin((px + py) * .72 + time * .76) +
          Math.sin(radial - time * 1.9) * turbulence;
        const normal = Math.max(0, Math.min(255, Math.round((value + 4.5) * 28.333)));
        const colour = normal * 3;
        data[p++] = lut[colour];
        data[p++] = lut[colour + 1];
        data[p++] = lut[colour + 2];
        data[p++] = 255;
      }
    }
    plasmaCtx.putImageData(plasmaImage, 0, 0);
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
    // Font size is explicit rather than derived from the stage width. This keeps
    // the chosen scale stable when the sidebar opens or closes.
    const size = clampFontSize(render.fontSize);
    const font = `950 ${size}px "Segoe UI Black", "Arial Black", "Segoe UI", Arial, sans-serif`;
    textCtx.font = font;
    const text = `${render.message}     `;
    return {
      size,
      font,
      text,
      total: Math.max(1, textCtx.measureText(text).width)
    };
  }

  function drawPlasmaScroller(time) {
    const rightEdge = Math.max(1, Math.floor(scrollerRightEdge()));
    const metrics = textMetrics(rightEdge);
    const yBase = render.height * .49;
    const fadeIn = Math.min(1, (performance.now() - render.changedAt) / 420);
    const scrollOffset = render.scroll % metrics.total;

    textCtx.clearRect(0, 0, render.width, render.height);
    textCtx.save();
    textCtx.beginPath();
    textCtx.rect(0, 0, rightEdge, render.height);
    textCtx.clip();
    textCtx.font = metrics.font;
    textCtx.textAlign = "left";
    textCtx.textBaseline = "middle";
    textCtx.fillStyle = "#fff";
    textCtx.strokeStyle = "#fff";
    textCtx.lineJoin = "round";
    textCtx.lineWidth = Math.max(2, metrics.size * .045);

    let x = rightEdge - scrollOffset;
    const copies = Math.ceil((rightEdge + metrics.total * 2) / metrics.total) + 1;
    for (let copy = 0; copy < copies; copy++) {
      textCtx.strokeText(metrics.text, x, yBase);
      textCtx.fillText(metrics.text, x, yBase);
      x += metrics.total;
    }
    textCtx.restore();

    // Slice-warp the text mask. The message follows a straight horizontal
    // route; only its surface ripples like hot plasma.
    maskCtx.clearRect(0, 0, render.width, render.height);
    const stripHeight = 3;
    const top = Math.max(0, Math.floor(yBase - metrics.size * .78));
    const bottom = Math.min(render.height, Math.ceil(yBase + metrics.size * .78));
    const warp = Math.max(0, Math.min(34, render.amplitude * .18));
    for (let y = top; y < bottom; y += stripHeight) {
      const localY = y - yBase;
      const shiftX =
        Math.sin(localY * .075 + time * 2.2) * warp +
        Math.sin(localY * .028 - time * 1.35) * warp * .55;
      const shiftY = Math.sin(localY * .045 + time * 1.7) * warp * .12;
      maskCtx.drawImage(
        textCanvas,
        0, y, rightEdge, stripHeight,
        shiftX, y + shiftY, rightEdge, stripHeight + 1
      );
    }

    renderPlasma(time);

    colourCtx.clearRect(0, 0, render.width, render.height);
    colourCtx.save();
    colourCtx.drawImage(
      plasmaCanvas,
      0, 0, plasmaCanvas.width, plasmaCanvas.height,
      0, 0, rightEdge, render.height
    );
    colourCtx.globalCompositeOperation = "destination-in";
    colourCtx.drawImage(maskCanvas, 0, 0);
    colourCtx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, rightEdge, render.height);
    ctx.clip();

    // A dim plasma aura makes the moving colour field readable before each
    // glyph enters, while the high-resolution masked pass stays sharp.
    ctx.globalAlpha = .16 * fadeIn;
    ctx.filter = "blur(34px) saturate(1.45)";
    ctx.drawImage(
      plasmaCanvas,
      0, 0, plasmaCanvas.width, plasmaCanvas.height,
      0, yBase - metrics.size * 1.15, rightEdge, metrics.size * 2.3
    );

    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = .42 * fadeIn;
    ctx.filter = "blur(18px) saturate(1.8)";
    ctx.drawImage(colourCanvas, 0, 0);

    ctx.globalAlpha = .78 * fadeIn;
    ctx.filter = "blur(5px) saturate(1.45)";
    ctx.drawImage(colourCanvas, 0, 0);

    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = fadeIn;
    ctx.filter = "none";
    ctx.drawImage(colourCanvas, 0, 0);

    // White edge-lighting gives the plasma-filled text a crisp demoscene face.
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = .28 * fadeIn;
    ctx.drawImage(maskCanvas, 0, 0);
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
    drawPlasmaScroller(render.time);
    drawScanlines();
    requestAnimationFrame(frame);
  }

  function applyMessage(values, source = "live") {
    const nextMessage = String(values.message || " ").trim() || " ";
    const nextVersion = values.version == null ? null : String(values.version);

    // Keep the stored message unpadded. textMetrics() adds the visual gap when
    // measuring the loop. The previous build stored trailing spaces here, then
    // compared that padded value with the trimmed server value on every poll.
    // That made every poll look like a new message and reset the scroller before
    // more than a few characters could enter the stage.
    if (nextMessage !== render.message) {
      render.message = nextMessage;
      render.scroll = 0;
      render.changedAt = performance.now();
    }

    render.lastVersion = nextVersion ?? render.lastVersion;
    render.speed = Math.max(20, Number(values.speed) || render.speed);
    render.amplitude = Math.max(0, Number(values.amplitude) || 0);
    render.frequency = Math.max(.001, Number(values.frequency) || render.frequency);
    render.palette = values.palette || render.palette;
    const hasFontSize = values.fontSize !== undefined && values.fontSize !== null && values.fontSize !== "";
    if (hasFontSize) {
      render.fontSize = clampFontSize(values.fontSize, render.fontSize);
      saveFontSize(render.fontSize);
    }
    el("manualMessage").value = nextMessage;
    el("manualSpeed").value = render.speed;
    el("manualAmplitude").value = render.amplitude;
    el("manualFrequency").value = render.frequency;
    // Live channel polls do not carry a font-size field. Do not overwrite a
    // value that the user is currently changing with the number stepper.
    if (hasFontSize || document.activeElement !== el("manualFontSize")) {
      el("manualFontSize").value = render.fontSize;
    }
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

  function updateFontSizeFromControl(commit = false) {
    const input = el("manualFontSize");
    const raw = input.value;

    // Allow the field to be temporarily empty while the user types. The
    // previous rendered size remains active until a valid value is entered.
    if (raw === "") return;

    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) return;

    render.fontSize = clampFontSize(numeric, render.fontSize);
    saveFontSize(render.fontSize);

    // Number-input arrow clicks emit input events, so the canvas updates on
    // every step. Normalise the displayed value only after the edit commits.
    if (commit || render.fontSize !== numeric) input.value = render.fontSize;
  }

  function applyLocal() {
    updateFontSizeFromControl(true);
    applyMessage({
      message: el("manualMessage").value,
      version: "local",
      speed: Number(el("manualSpeed").value),
      amplitude: Number(el("manualAmplitude").value),
      frequency: Number(el("manualFrequency").value),
      fontSize: Number(el("manualFontSize").value),
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
    const requestedFeatureKey = startupParams.get("featureKey") || startupParams.get("targetFeatureKey");
    const configuredFeatureKey = String(config.target.featureKey || "").trim();
    const initialFeatureKey = requestedFeatureKey || configuredFeatureKey || DEFAULT_TARGET_FEATURE_KEY;
    el("targetFeatureKey").value = BridgeCommon.normalizeFeatureKey(initialFeatureKey);
    el("targetFeatureKeyField").value = config.target.featureKeyField;
    el("targetBridgeDisplayField").value = config.target.displayField;
    el("manualMessage").value = render.message;
    el("manualSpeed").value = render.speed;
    el("manualAmplitude").value = render.amplitude;
    el("manualFrequency").value = render.frequency;
    el("manualFontSize").value = render.fontSize;
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
  el("manualFontSize").addEventListener("input", () => updateFontSizeFromControl(false));
  el("manualFontSize").addEventListener("change", () => updateFontSizeFromControl(true));
  el("manualFontSize").addEventListener("blur", () => {
    updateFontSizeFromControl(true);
    el("manualFontSize").value = render.fontSize;
  });
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
