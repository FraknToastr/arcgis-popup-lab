(() => {
  "use strict";

  const TX_KEY = "arcgis-popup-lab7-oauth-transaction";
  const RESULT_KEY = "arcgis-popup-lab7-oauth-result";
  const TOKEN_KEY = "arcgis-popup-lab7-session-token";
  const CONFIG_KEY = "arcgis-popup-lab7-config";
  const CHANNEL_NAME = "arcgis-popup-lab7-oauth";

  const params = new URLSearchParams(window.location.search);
  const defaults = window.LAB7_DEFAULTS || {};

  const state = {
    token: null,
    metadata: null,
    feature: null,
    originalFeature: null,
    editableFields: [],
    editor: null,
    config: null,
    flags: {
      externalAuth: false,
      token: false,
      metadata: false,
      query: false,
      update: false,
      verify: false,
      revert: false,
      parentMessage: false
    }
  };

  const el = (id) => document.getElementById(id);

  function setStatus(id, message, tone = "") {
    const node = el(id);
    node.textContent = message;
    node.className = "status" + (tone ? ` ${tone}` : "");
  }

  function normalizePortal(value) {
    let output = String(value || "").trim().replace(/\/+$/, "");
    output = output.replace(/\/sharing\/rest$/i, "");
    return output;
  }

  function normalizeService(value) {
    return String(value || "").trim().replace(/\/+$/, "");
  }

  function isPlaceholder(value) {
    return !value || /YOUR[-_ ]|YOUR-FEATURE|YOUR_CLIENT/i.test(value);
  }

  function readSavedConfig() {
    try {
      return JSON.parse(localStorage.getItem(CONFIG_KEY) || "null") || {};
    } catch {
      return {};
    }
  }

  function resolveConfig() {
    const saved = readSavedConfig();
    return {
      portalUrl: normalizePortal(params.get("portal") || saved.portalUrl || defaults.portalUrl || "https://www.arcgis.com"),
      clientId: String(params.get("clientId") || saved.clientId || defaults.clientId || "").trim(),
      serviceUrl: normalizeService(params.get("service") || saved.serviceUrl || defaults.serviceUrl || "")
    };
  }

  function currentConfigFromInputs() {
    return {
      portalUrl: normalizePortal(el("portalUrl").value),
      clientId: el("clientId").value.trim(),
      serviceUrl: normalizeService(el("serviceUrl").value)
    };
  }

  function validateConfig(config = currentConfigFromInputs()) {
    const problems = [];
    if (!/^https:\/\//i.test(config.portalUrl)) problems.push("Portal URL must use HTTPS.");
    if (isPlaceholder(config.clientId)) problems.push("Replace the OAuth Client ID placeholder.");
    if (!/^https:\/\//i.test(config.serviceUrl)) problems.push("Feature layer URL must use HTTPS.");
    if (!/\/FeatureServer\/\d+$/i.test(config.serviceUrl)) problems.push("Feature layer URL must end with FeatureServer/<layer id>.");
    return problems;
  }

  function renderEnvironment() {
    const pairs = [
      ["Hosted origin", window.location.origin],
      ["ArcGIS Pro Object ID", params.get("oid") || "Not supplied"],
      ["ArcGIS Pro Object ID field", params.get("oidField") || "Not supplied"],
      ["Source", params.get("source") || "Direct browser"],
      ["Build parameter", params.get("build") || "Not supplied"],
      ["Secure context", String(window.isSecureContext)],
      ["Inside iframe", String(window.self !== window.top)]
    ];
    el("environment").innerHTML = pairs.map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd>`).join("");
    el("oidValue").value = params.get("oid") || "";

    if (!params.get("oid")) {
      setStatus(
        "queryStatus",
        "No Object ID arrived in the URL. Open Lab 7 through the ArcGIS Pro Arcade popup, or enter an Object ID above for direct-browser testing.",
        "warn"
      );
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function setConfigInputs(config) {
    el("portalUrl").value = config.portalUrl;
    el("clientId").value = config.clientId;
    el("serviceUrl").value = config.serviceUrl;
    el("redirectUri").textContent = "urn:ietf:wg:oauth:2.0:oob";
  }

  function saveConfig() {
    const config = currentConfigFromInputs();
    const problems = validateConfig(config);
    if (problems.length) {
      setStatus("configStatus", problems.join("\n"), "bad");
      return;
    }
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    state.config = config;
    setStatus("configStatus", "Configuration saved in this hosted app's localStorage.", "good");
  }

  function clearConfig() {
    localStorage.removeItem(CONFIG_KEY);
    state.config = resolveConfig();
    setConfigInputs(state.config);
    setStatus("configStatus", "Saved configuration cleared. Query-string or config.js defaults are now active.", "warn");
  }

  function randomString(length = 64) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  }

  async function pkceChallenge(verifier) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replace(/=+$/, "");
  }

  async function prepareExternalOAuth() {
    const config = currentConfigFromInputs();
    const problems = validateConfig(config);
    if (problems.length) {
      setStatus("authStatus", problems.join("\n"), "bad");
      return;
    }

    state.config = config;
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));

    const verifier = randomString(72);
    const challenge = await pkceChallenge(verifier);
    const oauthState = randomString(48);
    const redirectUri = "urn:ietf:wg:oauth:2.0:oob";

    const transaction = {
      mode: "external-oob",
      state: oauthState,
      verifier,
      clientId: config.clientId,
      portalUrl: config.portalUrl,
      redirectUri,
      createdAt: Date.now()
    };
    localStorage.setItem(TX_KEY, JSON.stringify(transaction));

    const authParams = new URLSearchParams({
      client_id: config.clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      state: oauthState,
      code_challenge: challenge,
      code_challenge_method: "S256"
    });
    const authorizeUrl = `${config.portalUrl}/sharing/rest/oauth2/authorize?${authParams}`;
    const link = el("externalAuthLink");
    link.href = authorizeUrl;
    link.classList.remove("hidden");
    el("authCodeInput").value = "";
    setStatus(
      "authStatus",
      "External sign-in is prepared. Click the green browser link, sign in, then copy the full approval-page URL from the browser address bar and paste it below.",
      "info"
    );
  }

  function extractAuthorizationResult(rawValue) {
    const raw = String(rawValue || "").trim();
    if (!raw) throw new Error("Paste the ArcGIS approval-page URL or authorization code.");

    let code = "";
    let returnedState = "";

    try {
      const url = new URL(raw);
      code = url.searchParams.get("code") || "";
      returnedState = url.searchParams.get("state") || "";
    } catch {
      const codeMatch = raw.match(/(?:^|[?&#\s])code=([^&#\s]+)/i);
      const stateMatch = raw.match(/(?:^|[?&#\s])state=([^&#\s]+)/i);
      code = codeMatch ? decodeURIComponent(codeMatch[1]) : raw;
      returnedState = stateMatch ? decodeURIComponent(stateMatch[1]) : "";
    }

    code = String(code || "").trim();
    if (!code) throw new Error("No authorization code could be extracted from the pasted value.");
    return { code, returnedState };
  }

  async function exchangeExternalCode(transaction, code) {
    const tokenUrl = `${transaction.portalUrl}/sharing/rest/oauth2/token`;
    const body = new URLSearchParams({
      client_id: transaction.clientId,
      grant_type: "authorization_code",
      code,
      redirect_uri: transaction.redirectUri,
      code_verifier: transaction.verifier,
      f: "json"
    });

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body,
      cache: "no-store"
    });
    const data = await response.json();
    if (!response.ok || data.error) {
      const message = data.error?.error_description || data.error?.message || `HTTP ${response.status}`;
      throw new Error(message);
    }
    if (!data.access_token) throw new Error("The token response did not contain an access_token.");

    return {
      accessToken: data.access_token,
      username: data.username || "",
      expiresAt: Date.now() + (Number(data.expires_in || 0) * 1000),
      receivedAt: Date.now(),
      portalUrl: transaction.portalUrl,
      clientId: transaction.clientId,
      mode: "external-oob"
    };
  }

  async function completeExternalOAuth() {
    let transaction;
    try {
      transaction = JSON.parse(localStorage.getItem(TX_KEY) || "null");
    } catch {
      transaction = null;
    }
    if (!transaction || transaction.mode !== "external-oob") {
      setStatus("authStatus", "No prepared external PKCE transaction exists. Start with step 1.", "bad");
      return;
    }
    if (Date.now() - Number(transaction.createdAt || 0) > 15 * 60 * 1000) {
      localStorage.removeItem(TX_KEY);
      setStatus("authStatus", "The prepared sign-in is more than 15 minutes old. Prepare a new external sign-in.", "bad");
      return;
    }

    try {
      const { code, returnedState } = extractAuthorizationResult(el("authCodeInput").value);
      if (returnedState && returnedState !== transaction.state) {
        throw new Error("OAuth state validation failed. Prepare a new sign-in and try again.");
      }
      setStatus("authStatus", "Authorization code received. Exchanging it for an access token…", "info");
      const packet = await exchangeExternalCode(transaction, code);
      localStorage.removeItem(TX_KEY);
      state.flags.externalAuth = true;
      handleOAuthPacket(packet);
      setStatus(
        "authStatus",
        `Authenticated as ${packet.username || "ArcGIS user"}. The external-browser PKCE flow completed successfully.`,
        "good"
      );
    } catch (error) {
      setStatus("authStatus", `External sign-in failed: ${error.message}`, "bad");
    }
  }

  function loadSessionToken() {
    try {
      const packet = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || "null");
      if (packet && packet.accessToken && packet.expiresAt > Date.now() + 30000) {
        state.token = packet;
        state.flags.token = true;
        return true;
      }
    } catch {
      sessionStorage.removeItem(TOKEN_KEY);
    }
    return false;
  }

  function consumeOAuthResult() {
    try {
      const packet = JSON.parse(localStorage.getItem(RESULT_KEY) || "null");
      if (!packet || !packet.accessToken) return false;
      localStorage.removeItem(RESULT_KEY);
      handleOAuthPacket(packet);
      return true;
    } catch (error) {
      setStatus("authStatus", `Could not consume OAuth result: ${error.message}`, "bad");
      return false;
    }
  }

  function handleOAuthPacket(packet) {
    state.token = packet;
    sessionStorage.setItem(TOKEN_KEY, JSON.stringify(packet));
    state.flags.token = true;
    if (packet.mode === "external-oob") state.flags.externalAuth = true;
    renderAuthState();
    renderSummary();
  }

  function renderAuthState() {
    if (!state.token || state.token.expiresAt <= Date.now()) {
      state.token = null;
      state.flags.token = false;
      el("identityPanel").classList.add("hidden");
      setStatus("authStatus", "Not signed in.");
      renderSummary();
      return;
    }

    const remainingMinutes = Math.max(0, Math.floor((state.token.expiresAt - Date.now()) / 60000));
    setStatus(
      "authStatus",
      `Authenticated as ${state.token.username || "ArcGIS user"}. Access token retained only in sessionStorage. Approximately ${remainingMinutes} minutes remain.`,
      "good"
    );
    el("identityPanel").classList.remove("hidden");
    const pairs = [
      ["Username", state.token.username || "Not returned"],
      ["Portal", state.token.portalUrl],
      ["Flow", `Authorization code + PKCE (${state.token.mode})`],
      ["Received", new Date(state.token.receivedAt).toLocaleString()],
      ["Expires", new Date(state.token.expiresAt).toLocaleString()]
    ];
    el("identityDetails").innerHTML = pairs.map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd>`).join("");
  }

  function signOut() {
    state.token = null;
    state.metadata = null;
    state.feature = null;
    state.originalFeature = null;
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(RESULT_KEY);
    state.flags.token = false;
    renderAuthState();
    setStatus("metadataStatus", "Metadata cleared with the current token.", "warn");
    setStatus("queryStatus", "Feature state cleared with the current token.", "warn");
  }

  function requireToken() {
    if (!state.token || state.token.expiresAt <= Date.now() + 15000) {
      throw new Error("No current OAuth access token. Sign in again.");
    }
    return state.token.accessToken;
  }

  async function parseArcgisResponse(response) {
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`ArcGIS response was not JSON (HTTP ${response.status}): ${text.slice(0, 300)}`);
    }
    if (!response.ok || data.error) {
      const detail = data.error?.message || data.error?.error_description || `HTTP ${response.status}`;
      const extra = data.error?.details?.join("; ") || "";
      throw new Error(extra ? `${detail}: ${extra}` : detail);
    }
    return data;
  }

  async function arcgisGet(url) {
    const token = requireToken();
    const target = `${url}${url.includes("?") ? "&" : "?"}f=json`;
    const response = await fetch(target, {
      method: "GET",
      headers: { "X-Esri-Authorization": `Bearer ${token}` },
      cache: "no-store"
    });
    return parseArcgisResponse(response);
  }

  async function arcgisPost(url, values) {
    const token = requireToken();
    const body = new URLSearchParams({ f: "json", ...values });
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "X-Esri-Authorization": `Bearer ${token}`
      },
      body,
      cache: "no-store"
    });
    return parseArcgisResponse(response);
  }

  function systemFieldNames(metadata) {
    const names = new Set([
      metadata.objectIdField,
      metadata.globalIdField,
      metadata.typeIdField,
      metadata.displayField,
      metadata.shapeFieldName
    ].filter(Boolean));
    const edit = metadata.editFieldsInfo || {};
    [edit.creationDateField, edit.creatorField, edit.editDateField, edit.editorField].filter(Boolean).forEach((name) => names.add(name));
    return names;
  }

  function allowedEditableFields(metadata) {
    const supportedTypes = new Set([
      "esriFieldTypeString",
      "esriFieldTypeSmallInteger",
      "esriFieldTypeInteger",
      "esriFieldTypeSingle",
      "esriFieldTypeDouble",
      "esriFieldTypeDate"
    ]);
    const excluded = systemFieldNames(metadata);
    return (metadata.fields || []).filter((field) =>
      supportedTypes.has(field.type) &&
      field.editable !== false &&
      !excluded.has(field.name)
    );
  }

  async function loadMetadata() {
    const config = currentConfigFromInputs();
    const problems = validateConfig(config);
    if (problems.length) {
      setStatus("metadataStatus", problems.join("\n"), "bad");
      return;
    }
    state.config = config;
    setStatus("metadataStatus", "Loading secured layer metadata…", "info");
    try {
      const metadata = await arcgisGet(config.serviceUrl);
      state.metadata = metadata;
      state.editableFields = allowedEditableFields(metadata);
      state.flags.metadata = true;

      const capabilities = String(metadata.capabilities || "");
      const canUpdate = /(^|,)\s*Update\s*(,|$)/i.test(capabilities);
      const pairs = [
        ["Layer name", metadata.name || "Unnamed layer"],
        ["Capabilities", capabilities || "Not advertised"],
        ["Update capability", canUpdate ? "Advertised" : "Not advertised"],
        ["Object ID field", metadata.objectIdField || "Not reported"],
        ["Global ID field", metadata.globalIdField || "Not reported"],
        ["Supported editable fields", String(state.editableFields.length)]
      ];
      el("metadataDetails").innerHTML = pairs.map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd>`).join("");
      el("metadataDetails").classList.remove("hidden");
      el("oidField").textContent = metadata.objectIdField || "Not reported";
      setStatus(
        "metadataStatus",
        canUpdate
          ? `Metadata loaded. The service advertises Update and ${state.editableFields.length} supported editable fields were found.`
          : "Metadata loaded, but the service does not advertise the Update capability.",
        canUpdate ? "good" : "warn"
      );
      renderSummary();
    } catch (error) {
      state.flags.metadata = false;
      setStatus("metadataStatus", `Metadata request failed: ${error.message}`, "bad");
      renderSummary();
    }
  }

  function getObjectId() {
    const raw = String(params.get("oid") || el("oidValue").value || "").trim();
    const oid = Number(raw);
    if (!raw || !Number.isFinite(oid) || !Number.isInteger(oid)) {
      throw new Error("No valid integer Object ID is available. Open the app through the ArcGIS Pro popup or enter an Object ID manually.");
    }
    return oid;
  }

  async function queryCurrentFeature(options = {}) {
    if (!state.metadata) await loadMetadata();
    if (!state.metadata) throw new Error("Layer metadata is unavailable.");

    const oid = getObjectId();
    const oidField = state.metadata.objectIdField;
    if (!oidField) throw new Error("Layer metadata did not report an Object ID field.");

    const result = await arcgisPost(`${state.config.serviceUrl}/query`, {
      where: `${oidField} = ${oid}`,
      outFields: "*",
      returnGeometry: "false",
      resultRecordCount: "1"
    });
    if (!result.features?.length) throw new Error(`No feature matched ${oidField} = ${oid}.`);

    state.feature = result.features[0];
    if (!state.originalFeature && options.captureOriginal !== false) {
      state.originalFeature = structuredClone(state.feature);
    }
    state.flags.query = true;
    populateFieldSelector();
    renderFeatureJson();
    renderSelectedField();
    renderSummary();
    return state.feature;
  }

  async function queryFeatureButton() {
    setStatus("queryStatus", "Querying the selected feature…", "info");
    try {
      const feature = await queryCurrentFeature();
      setStatus("queryStatus", `Feature queried successfully. ${Object.keys(feature.attributes || {}).length} attributes were returned.`, "good");
    } catch (error) {
      state.flags.query = false;
      setStatus("queryStatus", `Feature query failed: ${error.message}`, "bad");
      renderSummary();
    }
  }

  function renderFeatureJson() {
    el("featureJson").textContent = JSON.stringify(state.feature?.attributes || {}, null, 2);
    el("featureJson").classList.remove("hidden");
  }

  function populateFieldSelector() {
    const select = el("editField");
    const current = select.value;
    select.innerHTML = `<option value="">Select an editable field</option>` + state.editableFields.map((field) => {
      const label = field.alias && field.alias !== field.name ? `${field.alias} (${field.name})` : field.name;
      return `<option value="${escapeHtml(field.name)}">${escapeHtml(label)}</option>`;
    }).join("");
    select.disabled = state.editableFields.length === 0;
    if (state.editableFields.some((field) => field.name === current)) select.value = current;
    updateEditControls();
  }

  function fieldByName(name) {
    return state.editableFields.find((field) => field.name === name) || null;
  }

  function displayValue(value, field) {
    if (value === null || value === undefined) return "NULL";
    if (field?.type === "esriFieldTypeDate") {
      const date = new Date(Number(value));
      return Number.isNaN(date.getTime()) ? String(value) : `${date.toLocaleString()} (${value})`;
    }
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }

  function inputDateTimeValue(value) {
    if (value === null || value === undefined || value === "") return "";
    const date = new Date(Number(value));
    if (Number.isNaN(date.getTime())) return "";
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  function renderValueEditor(field, currentValue) {
    const host = el("valueEditorHost");
    host.innerHTML = `<div class="label">Proposed value</div>`;

    let editor;
    const codedValues = field?.domain?.codedValues;
    if (Array.isArray(codedValues) && codedValues.length) {
      editor = document.createElement("select");
      for (const item of codedValues) {
        const option = document.createElement("option");
        option.value = String(item.code);
        option.textContent = `${item.name} (${item.code})`;
        if (String(item.code) === String(currentValue)) option.selected = true;
        editor.appendChild(option);
      }
    } else {
      editor = document.createElement("input");
      if (field?.type === "esriFieldTypeDate") {
        editor.type = "datetime-local";
        editor.value = inputDateTimeValue(currentValue);
      } else if (["esriFieldTypeSmallInteger", "esriFieldTypeInteger", "esriFieldTypeSingle", "esriFieldTypeDouble"].includes(field?.type)) {
        editor.type = "number";
        editor.step = ["esriFieldTypeSingle", "esriFieldTypeDouble"].includes(field.type) ? "any" : "1";
        editor.value = currentValue ?? "";
      } else {
        editor.type = "text";
        editor.value = currentValue ?? "";
        if (field?.length) editor.maxLength = field.length;
      }
    }
    editor.id = "editValue";
    editor.disabled = !field;
    host.appendChild(editor);

    const nullRow = document.createElement("label");
    nullRow.className = "confirm-row";
    nullRow.innerHTML = `<input id="setNull" type="checkbox" ${field?.nullable === false ? "disabled" : ""}><span>Set this field to NULL${field?.nullable === false ? " — field is not nullable" : ""}</span>`;
    host.appendChild(nullRow);
    state.editor = editor;
  }

  function renderSelectedField() {
    const field = fieldByName(el("editField").value);
    if (!field || !state.feature) {
      el("originalValue").textContent = "Not loaded";
      el("verifiedValue").textContent = "Not loaded";
      renderValueEditor(null, null);
      updateEditControls();
      return;
    }
    const original = state.originalFeature?.attributes?.[field.name];
    const current = state.feature.attributes?.[field.name];
    el("originalValue").textContent = displayValue(original, field);
    el("verifiedValue").textContent = displayValue(current, field);
    renderValueEditor(field, current);
    updateEditControls();
  }

  function updateEditControls() {
    const field = fieldByName(el("editField").value);
    const capabilities = String(state.metadata?.capabilities || "");
    const canUpdate = /(^|,)\s*Update\s*(,|$)/i.test(capabilities);
    const ready = Boolean(state.token && state.feature && field && canUpdate && el("confirmEdit").checked);
    el("applyUpdate").disabled = !ready;
    el("revertUpdate").disabled = !(state.token && state.feature && state.originalFeature && field && canUpdate && state.flags.update);
  }

  function parseEditorValue(field) {
    const setNull = el("setNull")?.checked;
    if (setNull) {
      if (field.nullable === false) throw new Error(`${field.name} is not nullable.`);
      return null;
    }
    const raw = state.editor?.value ?? "";
    if (field.type === "esriFieldTypeDate") {
      if (!raw) return null;
      const millis = new Date(raw).getTime();
      if (!Number.isFinite(millis)) throw new Error("Enter a valid date and time.");
      return millis;
    }
    if (["esriFieldTypeSmallInteger", "esriFieldTypeInteger"].includes(field.type)) {
      if (raw === "") return null;
      const value = Number(raw);
      if (!Number.isInteger(value)) throw new Error("Enter a whole number.");
      return value;
    }
    if (["esriFieldTypeSingle", "esriFieldTypeDouble"].includes(field.type)) {
      if (raw === "") return null;
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new Error("Enter a valid number.");
      return value;
    }
    return raw;
  }

  function valuesEqual(a, b, field) {
    if (a === null || a === undefined) return b === null || b === undefined;
    if (field.type === "esriFieldTypeDate") return Number(a) === Number(b);
    if (["esriFieldTypeSmallInteger", "esriFieldTypeInteger", "esriFieldTypeSingle", "esriFieldTypeDouble"].includes(field.type)) {
      return Number(a) === Number(b);
    }
    return String(a) === String(b);
  }

  async function updateAttribute(field, value, isRevert = false) {
    const oid = getObjectId();
    const oidField = state.metadata.objectIdField;
    const featurePayload = {
      attributes: {
        [oidField]: oid,
        [field.name]: value
      }
    };

    const result = await arcgisPost(`${state.config.serviceUrl}/updateFeatures`, {
      features: JSON.stringify([featurePayload]),
      rollbackOnFailure: "true"
    });
    el("editJson").textContent = JSON.stringify(result, null, 2);
    el("editJson").classList.remove("hidden");

    const editResult = result.updateResults?.[0];
    if (!editResult?.success) {
      const message = editResult?.error?.description || editResult?.error?.message || "The service did not report a successful update.";
      throw new Error(message);
    }

    await queryCurrentFeature({ captureOriginal: false });
    const verified = state.feature.attributes?.[field.name];
    if (!valuesEqual(verified, value, field)) {
      throw new Error(`Update returned success, but verification returned ${displayValue(verified, field)}.`);
    }

    if (isRevert) {
      state.flags.revert = true;
      setStatus("editStatus", `Original value restored and verified for ${field.name}.`, "good");
    } else {
      state.flags.update = true;
      state.flags.verify = true;
      setStatus("editStatus", `Update succeeded and the server value was re-queried and verified for ${field.name}.`, "good");
    }
    renderSelectedField();
    renderSummary();
  }

  async function applyUpdate() {
    const field = fieldByName(el("editField").value);
    if (!field) return;
    setStatus("editStatus", "Submitting one controlled attribute update…", "info");
    try {
      const value = parseEditorValue(field);
      await updateAttribute(field, value, false);
    } catch (error) {
      state.flags.verify = false;
      setStatus("editStatus", `Update failed: ${error.message}`, "bad");
      renderSummary();
    }
  }

  async function revertUpdate() {
    const field = fieldByName(el("editField").value);
    if (!field || !state.originalFeature) return;
    const originalValue = state.originalFeature.attributes?.[field.name];
    setStatus("editStatus", `Restoring the original value for ${field.name}…`, "info");
    try {
      await updateAttribute(field, originalValue, true);
    } catch (error) {
      setStatus("editStatus", `Revert failed: ${error.message}`, "bad");
    }
  }

  function notifyParent() {
    const message = {
      type: "arcgis-popup-lab7-refresh-request",
      serviceUrl: state.config?.serviceUrl || currentConfigFromInputs().serviceUrl,
      objectId: params.get("oid"),
      sentAt: new Date().toISOString()
    };
    window.parent.postMessage(message, "*");
    state.flags.parentMessage = true;
    setStatus("refreshStatus", "postMessage sent to the parent document. Native ArcGIS Pro popups are not expected to respond without a custom listener.", "info");
    renderSummary();
  }

  function summaryCard(label, value, detail) {
    const tone = value === "PASS" ? "good" : value === "FAIL" ? "bad" : "warn";
    return `<div class="panel"><span class="badge ${tone}">${value}</span><div style="margin-top:.55rem;font-weight:700">${escapeHtml(label)}</div><div class="small" style="margin-top:.35rem">${escapeHtml(detail)}</div></div>`;
  }

  function renderSummary() {
    const items = [
      ["External-browser OAuth", state.flags.externalAuth ? "PASS" : "PENDING", state.flags.externalAuth ? "Authorization code + PKCE completed through the ArcGIS out-of-band approval page." : "Prepare external sign-in, authenticate in the browser and paste the approval result."],
      ["Session token", state.flags.token ? "PASS" : "PENDING", state.flags.token ? "A PKCE access token is active in sessionStorage." : "No active session token."],
      ["Secured metadata", state.flags.metadata ? "PASS" : "PENDING", state.flags.metadata ? "Layer metadata was read with the OAuth token." : "Load the layer metadata."],
      ["Feature query", state.flags.query ? "PASS" : "PENDING", state.flags.query ? "The selected feature was read from the service." : "Query the selected feature."],
      ["Attribute update", state.flags.update ? "PASS" : "PENDING", state.flags.update ? "A real attribute edit was accepted by the feature service." : "No update has been made."],
      ["Server verification", state.flags.verify ? "PASS" : "PENDING", state.flags.verify ? "The edited value was re-queried and matched." : "No verified edit yet."],
      ["Rollback", state.flags.revert ? "PASS" : "PENDING", state.flags.revert ? "The original value was restored and verified." : "Revert after the update test."],
      ["Parent refresh message", state.flags.parentMessage ? "PASS" : "PENDING", state.flags.parentMessage ? "The iframe sent a refresh-request message." : "Optional integration boundary test."]
    ];
    el("resultSummary").innerHTML = items.map(([label, value, detail]) => summaryCard(label, value, detail)).join("");
  }

  function installOAuthListeners() {
    window.addEventListener("message", (event) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "arcgis-popup-lab7-oauth-result" && event.data.packet) {
        handleOAuthPacket(event.data.packet);
      }
    });

    window.addEventListener("storage", (event) => {
      if (event.key === RESULT_KEY && event.newValue) consumeOAuthResult();
    });

    if ("BroadcastChannel" in window) {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.addEventListener("message", (event) => {
        if (event.data?.type === "arcgis-popup-lab7-oauth-result" && event.data.packet) {
          handleOAuthPacket(event.data.packet);
        }
      });
    }
  }

  function wireEvents() {
    el("saveConfig").addEventListener("click", saveConfig);
    el("clearConfig").addEventListener("click", clearConfig);
    el("prepareExternal").addEventListener("click", prepareExternalOAuth);
    el("completeExternal").addEventListener("click", completeExternalOAuth);
    el("signOut").addEventListener("click", signOut);
    el("loadMetadata").addEventListener("click", loadMetadata);
    el("queryFeature").addEventListener("click", queryFeatureButton);
    el("editField").addEventListener("change", renderSelectedField);
    el("confirmEdit").addEventListener("change", updateEditControls);
    el("applyUpdate").addEventListener("click", applyUpdate);
    el("revertUpdate").addEventListener("click", revertUpdate);
    el("notifyParent").addEventListener("click", notifyParent);
  }

  function init() {
    state.config = resolveConfig();
    setConfigInputs(state.config);
    renderEnvironment();
    wireEvents();
    installOAuthListeners();
    renderSummary();

    const problems = validateConfig(state.config);
    setStatus(
      "configStatus",
      problems.length ? problems.join("\n") : "Configuration appears structurally valid.",
      problems.length ? "warn" : "good"
    );

    if (!consumeOAuthResult()) loadSessionToken();
    renderAuthState();
  }

  init();
})();
