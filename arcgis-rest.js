(() => {
  "use strict";

  function authHeaders(token) {
    return token ? { "X-Esri-Authorization": `Bearer ${token}` } : {};
  }

  async function parseResponse(response) {
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error(`ArcGIS returned HTTP ${response.status} with a non-JSON response.`);
    }
    if (!response.ok || data.error) {
      const details = data.error?.details?.filter(Boolean).join(" ") || "";
      const message = data.error?.message || data.error?.description || `HTTP ${response.status}`;
      throw new Error(details ? `${message} ${details}` : message);
    }
    return data;
  }

  async function getJson(url, params = {}, token = "") {
    const query = new URLSearchParams({ f: "json", ...params });
    const response = await fetch(`${url}?${query}`, {
      method: "GET",
      headers: authHeaders(token),
      cache: "no-store"
    });
    return parseResponse(response);
  }

  async function postForm(url, params = {}, token = "") {
    const body = new URLSearchParams({ f: "json", ...params });
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        ...authHeaders(token)
      },
      body,
      cache: "no-store"
    });
    return parseResponse(response);
  }

  function hasCapability(metadata, capability) {
    return String(metadata?.capabilities || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .includes(String(capability).toLowerCase());
  }

  function field(metadata, name) {
    return (metadata?.fields || []).find((item) => item.name === name) || null;
  }

  function sqlString(value) {
    return `'${String(value).replaceAll("'", "''")}'`;
  }

  const metadataCache = new Map();

  async function metadata(layerUrl, token = "", force = false) {
    const tokenKey = token ? token.slice(-16) : "public";
    const key = `${layerUrl}|${tokenKey}`;
    const cached = metadataCache.get(key);
    if (!force && cached && Date.now() - cached.storedAt < 5 * 60 * 1000) return cached.value;
    const value = await getJson(layerUrl, {}, token);
    metadataCache.set(key, { storedAt: Date.now(), value });
    return value;
  }

  async function queryByOid(layerUrl, oid, token = "", suppliedOidField = "") {
    const info = await metadata(layerUrl, token);
    const oidField = suppliedOidField || info.objectIdField;
    if (!oidField) throw new Error("Layer metadata did not report an Object ID field.");
    if (!Number.isInteger(Number(oid))) throw new Error("A numeric Object ID is required.");
    const result = await postForm(`${layerUrl}/query`, {
      where: `${oidField} = ${Number(oid)}`,
      outFields: "*",
      returnGeometry: "false",
      resultRecordCount: "1"
    }, token);
    if (!result.features?.length) throw new Error(`No feature matched ${oidField} = ${oid}.`);
    return { metadata: info, oidField, feature: result.features[0] };
  }

  async function updateAttributes(layerUrl, oidField, oid, attributes, token = "") {
    const payload = { attributes: { [oidField]: Number(oid), ...attributes } };
    const result = await postForm(`${layerUrl}/updateFeatures`, {
      features: JSON.stringify([payload]),
      rollbackOnFailure: "true"
    }, token);
    const edit = result.updateResults?.[0];
    if (!edit?.success) {
      const message = edit?.error?.description || edit?.error?.message || "The service did not report a successful update.";
      throw new Error(message);
    }
    return result;
  }

  async function querySingleText(tableUrl, fieldName, value, token = "", duplicateLabel = "record") {
    const info = await metadata(tableUrl, token);
    const definition = field(info, fieldName);
    if (!definition) throw new Error(`Live table does not contain ${fieldName}.`);
    const result = await postForm(`${tableUrl}/query`, {
      where: `${fieldName} = ${sqlString(value)}`,
      outFields: "*",
      returnGeometry: "false",
      resultRecordCount: "2"
    }, token);
    if ((result.features || []).length > 1) throw new Error(`More than one ${duplicateLabel} uses ${fieldName} ${value}. The value must be unique.`);
    return { metadata: info, feature: result.features?.[0] || null };
  }

  async function queryChannel(tableUrl, channelField, channelId, token = "") {
    return querySingleText(tableUrl, channelField, channelId, token, "live-table record");
  }

  async function queryState(tableUrl, stateField, stateId, token = "") {
    return querySingleText(tableUrl, stateField, stateId, token, "bridge-state record");
  }

  function cleanAttributes(info, attributes) {
    const output = { ...attributes };
    for (const [key, value] of Object.entries(output)) {
      if (!field(info, key) || value === undefined) delete output[key];
    }
    return output;
  }

  async function upsertByTextKey(tableUrl, keyField, keyValue, attributes, token = "", recordLabel = "record") {
    const current = await querySingleText(tableUrl, keyField, keyValue, token, recordLabel);
    const info = current.metadata;
    const clean = cleanAttributes(info, { [keyField]: keyValue, ...attributes });

    if (current.feature) {
      if (!hasCapability(info, "Update")) throw new Error("Live table does not advertise Update.");
      const oidField = info.objectIdField;
      const oid = current.feature.attributes?.[oidField];
      if (oid === null || oid === undefined) throw new Error("Live-table record has no Object ID.");
      await updateAttributes(tableUrl, oidField, Number(oid), clean, token);
      return { mode: "update", oidField, oid: Number(oid), metadata: info };
    }

    if (!hasCapability(info, "Create")) throw new Error(`${recordLabel} ${keyValue} does not exist and the live table does not advertise Create.`);
    const result = await postForm(`${tableUrl}/addFeatures`, {
      features: JSON.stringify([{ attributes: clean }]),
      rollbackOnFailure: "true"
    }, token);
    const edit = result.addResults?.[0];
    if (!edit?.success) {
      const message = edit?.error?.description || edit?.error?.message || "The service did not report a successful add.";
      throw new Error(message);
    }
    return { mode: "add", oidField: info.objectIdField, oid: edit.objectId, metadata: info };
  }

  async function upsertChannel(tableUrl, fieldMap, channelId, values, token = "") {
    return upsertByTextKey(tableUrl, fieldMap.channelId, channelId, {
      [fieldMap.recordType]: "channel",
      [fieldMap.stateId]: `channel:${channelId}`,
      [fieldMap.message]: values.message,
      [fieldMap.version]: values.version,
      [fieldMap.speed]: values.speed,
      [fieldMap.amplitude]: values.amplitude,
      [fieldMap.frequency]: values.frequency,
      [fieldMap.palette]: values.palette,
      [fieldMap.updatedAt]: values.updatedAt,
      [fieldMap.updatedBy]: values.updatedBy
    }, token, "channel");
  }

  async function upsertState(tableUrl, fieldMap, state, values, token = "") {
    return upsertByTextKey(tableUrl, fieldMap.stateId, state.stateId, {
      [fieldMap.recordType]: "feature_state",
      [fieldMap.layerKey]: state.layerKey,
      [fieldMap.featureKey]: state.featureKey,
      [fieldMap.featureKeyField]: state.featureKeyField,
      [fieldMap.displayField]: state.displayField,
      [fieldMap.message]: values.message,
      [fieldMap.version]: values.version,
      [fieldMap.updatedAt]: values.updatedAt,
      [fieldMap.updatedBy]: values.updatedBy
    }, token, "bridge state");
  }

  window.ArcGISRest = {
    getJson,
    postForm,
    metadata,
    queryByOid,
    updateAttributes,
    queryChannel,
    queryState,
    upsertChannel,
    upsertState,
    hasCapability,
    field,
    sqlString,
    clearMetadataCache: () => metadataCache.clear()
  };
})();
