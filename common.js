(() => {
  "use strict";

  const params = new URLSearchParams(window.location.search);
  const base = window.POPUP_BRIDGE_CONFIG || {};

  function first(...values) {
    for (const value of values) {
      if (value !== null && value !== undefined && String(value).trim() !== "") return value;
    }
    return "";
  }

  function normalizeUrl(value) {
    return String(value || "").trim().replace(/\/+$/, "");
  }

  function numberValue(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function integerValue(value, fallback) {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : fallback;
  }

  function normalizeMode(value, fallback = "direct") {
    const mode = String(value || fallback).trim().toLowerCase();
    return mode === "bridge" ? "bridge" : "direct";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function setStatus(idOrNode, message, tone = "") {
    const node = typeof idOrNode === "string" ? document.getElementById(idOrNode) : idOrNode;
    if (!node) return;
    node.textContent = message;
    node.className = `status${tone ? ` ${tone}` : ""}`;
  }

  function formatValue(value) {
    if (value === null || value === undefined) return "NULL";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }

  function formatDate(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return "Not supplied";
    const date = new Date(numeric);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
  }

  function isPlaceholder(value) {
    return !value || /YOUR[-_ ]|YOUR-LIVE|YOUR-SOURCE|YOUR-TARGET|YOUR_CLIENT/i.test(String(value));
  }

  function stateId(layerKey, featureKey) {
    const layer = String(layerKey || "").trim();
    const feature = String(featureKey || "").trim();
    return `${layer}|${feature}`;
  }

  function resolveConfig() {
    const source = base.source || {};
    const target = base.target || {};
    return {
      portalUrl: normalizeUrl(first(params.get("portal"), base.portalUrl, "https://www.arcgis.com")),
      clientId: String(first(params.get("clientId"), base.clientId)).trim(),
      oauthRedirectUri: String(base.oauthRedirectUri || "urn:ietf:wg:oauth:2.0:oob"),
      liveTableUrl: normalizeUrl(first(params.get("liveTable"), base.liveTableUrl)),
      channelId: String(first(params.get("channel"), base.channelId, "DEMO_01")).trim(),
      pollIntervalMs: Math.max(500, integerValue(first(params.get("pollMs"), base.pollIntervalMs), 1000)),
      source: {
        mode: normalizeMode(first(params.get("sourceMode"), source.mode), "direct"),
        serviceUrl: normalizeUrl(first(params.get("service"), params.get("sourceService"), source.serviceUrl)),
        objectId: integerValue(first(params.get("oid"), source.objectId), null),
        objectIdField: String(first(params.get("oidField"), source.objectIdField, "")).trim(),
        messageField: String(first(params.get("field"), params.get("sourceField"), source.messageField)).trim(),
        layerKey: String(first(params.get("sourceLayerKey"), source.layerKey, "LAYER_A")).trim(),
        featureKey: String(first(params.get("sourceKey"), source.featureKey, "")).trim(),
        featureKeyField: String(first(params.get("sourceKeyField"), source.featureKeyField, "bridge_key")).trim(),
        initialValue: String(first(params.get("sourceInitialValue"), source.initialValue, ""))
      },
      target: {
        mode: normalizeMode(first(params.get("targetMode"), target.mode), "direct"),
        serviceUrl: normalizeUrl(first(params.get("targetService"), target.serviceUrl)),
        objectId: integerValue(first(params.get("targetOid"), target.objectId), null),
        objectIdField: String(first(params.get("targetOidField"), target.objectIdField, "")).trim(),
        displayField: String(first(params.get("targetField"), target.displayField)).trim(),
        layerKey: String(first(params.get("targetLayerKey"), target.layerKey, "LAYER_B")).trim(),
        featureKey: String(first(params.get("targetKey"), target.featureKey, "")).trim(),
        featureKeyField: String(first(params.get("targetKeyField"), target.featureKeyField, "bridge_key")).trim()
      },
      liveFields: { ...(base.liveFields || {}) },
      sourceName: String(first(params.get("source"), "Direct browser")),
      build: String(first(params.get("build"), "110"))
    };
  }

  function validateLayerUrl(value, label = "Layer URL") {
    const problems = [];
    if (!/^https:\/\//i.test(value || "")) problems.push(`${label} must use HTTPS.`);
    if (!/\/FeatureServer\/\d+$/i.test(value || "")) problems.push(`${label} must end with FeatureServer/<layer id>.`);
    return problems;
  }

  function validateCoreConfig(config, options = {}) {
    const problems = [];
    if (!/^https:\/\//i.test(config.portalUrl)) problems.push("Portal URL must use HTTPS.");
    if (isPlaceholder(config.clientId)) problems.push("Replace the OAuth Client ID placeholder.");
    if (options.liveTable !== false) problems.push(...validateLayerUrl(config.liveTableUrl, "Live table URL"));
    return problems;
  }

  function fieldTypeKind(field) {
    const type = field?.type || "";
    if (["esriFieldTypeSmallInteger", "esriFieldTypeInteger", "esriFieldTypeOID"].includes(type)) return "integer";
    if (["esriFieldTypeSingle", "esriFieldTypeDouble"].includes(type)) return "number";
    if (["esriFieldTypeDate", "esriFieldTypeDateOnly", "esriFieldTypeTimestampOffset"].includes(type)) return "date";
    return "string";
  }

  function castForField(raw, field) {
    const kind = fieldTypeKind(field);
    if (raw === null || raw === undefined) return null;
    if (kind === "integer") {
      const value = Number(raw);
      if (!Number.isInteger(value)) throw new Error(`${field.name} requires a whole number.`);
      return value;
    }
    if (kind === "number") {
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new Error(`${field.name} requires a numeric value.`);
      return value;
    }
    if (kind === "date") {
      const numeric = Number(raw);
      if (Number.isFinite(numeric)) return numeric;
      const parsed = new Date(raw).getTime();
      if (!Number.isFinite(parsed)) throw new Error(`${field.name} requires a valid date.`);
      return parsed;
    }
    const output = String(raw);
    if (field?.length && output.length > field.length) throw new Error(`${field.name} is limited to ${field.length} characters.`);
    return output;
  }

  function debounce(fn, delay = 250) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  window.BridgeCommon = {
    params,
    base,
    first,
    normalizeUrl,
    numberValue,
    integerValue,
    normalizeMode,
    escapeHtml,
    setStatus,
    formatValue,
    formatDate,
    isPlaceholder,
    stateId,
    resolveConfig,
    validateLayerUrl,
    validateCoreConfig,
    fieldTypeKind,
    castForField,
    debounce
  };
})();
