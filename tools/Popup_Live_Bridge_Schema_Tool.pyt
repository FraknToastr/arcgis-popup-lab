# -*- coding: utf-8 -*-
"""
Option A – Prepare direct-edit and bridge-table schemas for the ArcGIS Popup Live Bridge.

ArcGIS Pro target: 3.5.3

The toolbox modifies supplied datasets in place. It never deletes fields,
features, tables, workspaces, or geodatabases.

Multipatch support:
  Multipatch or other read-only web layers use bridge-table persistence.
  The selected feature is identified by a stable bridge_key value, while the
  editable hosted bridge table stores the popup value.
"""

import datetime
import re
import traceback
import uuid

import arcpy


class Toolbox:
    def __init__(self):
        self.label = "Popup Live Bridge Schema"
        self.alias = "popup_live_bridge_schema"
        self.tools = [PreparePopupLiveBridgeSchema]


class PreparePopupLiveBridgeSchema:
    def __init__(self):
        self.label = "Prepare Popup Live Bridge Schema"
        self.description = (
            "Adds direct-edit fields where requested, adds and populates stable "
            "bridge keys for read-only or multipatch layers, and prepares the "
            "shared live bridge table."
        )
        self.canRunInBackground = False

    def getParameterInfo(self):
        source_layer = _parameter("Layer A — Source feature layer", "source_layer", "GPFeatureLayer", "Required")
        source_layer.category = "Layer A — Source popup"

        source_mode = _parameter("Source persistence mode", "source_mode", "GPString", "Required")
        source_mode.filter.type = "ValueList"
        source_mode.filter.list = ["Direct attribute", "Bridge table", "Both"]
        source_mode.value = "Both"
        source_mode.category = "Layer A — Source popup"

        source_field = _parameter("Source direct message field", "source_message_field", "GPString", "Optional")
        source_field.value = "scroller_message"
        source_field.category = "Layer A — Source popup"

        source_key = _parameter("Source bridge key field", "source_bridge_key_field", "GPString", "Optional")
        source_key.value = "bridge_key"
        source_key.category = "Layer A — Source popup"

        target_layer = _parameter("Layer B — Target feature layer", "target_layer", "GPFeatureLayer", "Required")
        target_layer.category = "Layer B — Target popup"

        target_mode = _parameter("Target persistence mode", "target_mode", "GPString", "Required")
        target_mode.filter.type = "ValueList"
        target_mode.filter.list = ["Direct attribute", "Bridge table", "Both"]
        target_mode.value = "Both"
        target_mode.category = "Layer B — Target popup"

        target_field = _parameter("Target direct display field", "target_display_field", "GPString", "Optional")
        target_field.value = "popup_message"
        target_field.category = "Layer B — Target popup"

        target_key = _parameter("Target bridge key field", "target_bridge_key_field", "GPString", "Optional")
        target_key.value = "bridge_key"
        target_key.category = "Layer B — Target popup"

        live_table = _parameter("Shared live bridge table", "live_bridge_table", "GPTableView", "Required")
        live_table.category = "Shared live bridge table"

        populate_keys = _parameter("Populate blank bridge keys", "populate_bridge_keys", "GPBoolean", "Optional")
        populate_keys.value = True
        populate_keys.category = "Stable feature identity"

        seed_channel = _parameter("Create or complete the seed channel record", "seed_channel", "GPBoolean", "Optional")
        seed_channel.value = True
        seed_channel.category = "Shared live bridge table"

        channel_id = _parameter("Seed channel ID", "channel_id", "GPString", "Optional")
        channel_id.value = "DEMO_01"
        channel_id.category = "Shared live bridge table"

        add_indexes = _parameter("Add bridge lookup indexes", "add_indexes", "GPBoolean", "Optional")
        add_indexes.value = True
        add_indexes.category = "Performance"

        return [
            source_layer, source_mode, source_field, source_key,
            target_layer, target_mode, target_field, target_key,
            live_table, populate_keys, seed_channel, channel_id, add_indexes,
        ]

    def isLicensed(self):
        return True

    def updateParameters(self, parameters):
        source_mode = parameters[1].valueAsText or "Both"
        target_mode = parameters[5].valueAsText or "Both"
        parameters[2].enabled = source_mode in ("Direct attribute", "Both")
        parameters[3].enabled = source_mode in ("Bridge table", "Both")
        parameters[6].enabled = target_mode in ("Direct attribute", "Both")
        parameters[7].enabled = target_mode in ("Bridge table", "Both")
        parameters[11].enabled = bool(parameters[10].value)
        return

    def updateMessages(self, parameters):
        for index in (2, 3, 6, 7):
            if not parameters[index].enabled:
                continue
            value = (parameters[index].valueAsText or "").strip()
            if value and not _is_safe_field_name(value):
                parameters[index].setErrorMessage(
                    "Use a simple ArcGIS field name containing only letters, "
                    "numbers, and underscores, and do not begin with a number."
                )
        if bool(parameters[10].value) and not (parameters[11].valueAsText or "").strip():
            parameters[11].setErrorMessage("A channel ID is required when seed creation is enabled.")
        return

    def execute(self, parameters, messages):
        source_layer = parameters[0].valueAsText
        source_mode = parameters[1].valueAsText or "Both"
        source_field = (parameters[2].valueAsText or "").strip()
        source_key = (parameters[3].valueAsText or "").strip()
        target_layer = parameters[4].valueAsText
        target_mode = parameters[5].valueAsText or "Both"
        target_field = (parameters[6].valueAsText or "").strip()
        target_key = (parameters[7].valueAsText or "").strip()
        live_table = parameters[8].valueAsText
        populate_keys = bool(parameters[9].value)
        seed_channel = bool(parameters[10].value)
        channel_id = (parameters[11].valueAsText or "").strip()
        add_indexes = bool(parameters[12].value)

        try:
            _validate_mode_fields(source_mode, source_field, source_key, "Source")
            _validate_mode_fields(target_mode, target_field, target_key, "Target")
            if seed_channel:
                _validate_required_text(channel_id, "Seed channel ID")

            arcpy.SetProgressor("step", "Preparing Popup Live Bridge schema...", 0, 7, 1)

            _prepare_feature_layer(
                source_layer, "Layer A", source_mode, source_field,
                "Scroller Message", source_key, populate_keys, add_indexes,
            )
            arcpy.SetProgressorPosition(1)

            _prepare_feature_layer(
                target_layer, "Layer B", target_mode, target_field,
                "Popup Message", target_key, populate_keys, add_indexes,
            )
            arcpy.SetProgressorPosition(2)

            _announce_dataset("Live bridge table", live_table)
            _require_object_id(live_table, "Live bridge table")
            _reject_unsupported_legacy_format(live_table, "Live bridge table")
            live_work = _catalog_path(live_table)
            for spec in _live_table_specs():
                _ensure_field(live_work, spec, "Live bridge table")
            arcpy.SetProgressorPosition(3)

            if add_indexes:
                _ensure_index(live_work, "channel_id", "IX_PopupLive_Channel")
                _ensure_index(live_work, "state_id", "IX_PopupLive_State")
            arcpy.SetProgressorPosition(4)

            _validate_logical_uniqueness(live_work, "channel_id", allow_blank=True)
            _validate_logical_uniqueness(live_work, "state_id", allow_blank=True)
            arcpy.SetProgressorPosition(5)

            if seed_channel:
                _create_or_complete_seed_channel(live_work, channel_id)
            arcpy.SetProgressorPosition(6)
            _validate_logical_uniqueness(live_work, "channel_id", allow_blank=True)
            _validate_logical_uniqueness(live_work, "state_id", allow_blank=True)
            arcpy.SetProgressorPosition(7)

            arcpy.ResetProgressor()
            arcpy.AddMessage("")
            arcpy.AddMessage("Popup Live Bridge schema preparation completed.")
            arcpy.AddMessage(
                "For multipatch or other read-only layers, configure the Arcade "
                "popup expression with mode 'bridge' and use the populated "
                "bridge_key field. Publish only the shared bridge table as an "
                "editable hosted table with Query, Create, and Update."
            )

        except Exception as exc:
            arcpy.ResetProgressor()
            arcpy.AddError(str(exc))
            arcpy.AddError(traceback.format_exc())
            raise


def _parameter(display_name, name, datatype, parameter_type):
    return arcpy.Parameter(
        displayName=display_name,
        name=name,
        datatype=datatype,
        parameterType=parameter_type,
        direction="Input",
    )


class FieldSpec:
    def __init__(self, name, field_type, alias=None, length=None):
        self.name = name
        self.field_type = field_type
        self.alias = alias or name
        self.length = length


_FIELD_NAME_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def _is_safe_field_name(value):
    return bool(_FIELD_NAME_PATTERN.fullmatch(value or ""))


def _validate_required_text(value, label):
    if not value:
        raise ValueError(f"{label} is required.")


def _validate_field_name(value, label):
    if not _is_safe_field_name(value):
        raise ValueError(
            f"{label} '{value}' is not valid. Use only letters, numbers, "
            "and underscores, and do not begin with a number."
        )


def _validate_mode_fields(mode, direct_field, bridge_key, label):
    if mode in ("Direct attribute", "Both"):
        _validate_required_text(direct_field, f"{label} direct field")
        _validate_field_name(direct_field, f"{label} direct field")
    if mode in ("Bridge table", "Both"):
        _validate_required_text(bridge_key, f"{label} bridge key field")
        _validate_field_name(bridge_key, f"{label} bridge key field")


def _describe(dataset):
    try:
        return arcpy.Describe(dataset)
    except Exception as exc:
        raise ValueError(f"Could not describe input dataset '{dataset}': {exc}")


def _catalog_path(dataset):
    desc = _describe(dataset)
    return getattr(desc, "catalogPath", None) or str(dataset)


def _announce_dataset(label, dataset):
    desc = _describe(dataset)
    arcpy.AddMessage(f"{label}: {_catalog_path(dataset)}")
    shape_type = getattr(desc, "shapeType", None)
    if shape_type:
        arcpy.AddMessage(f"  Geometry: {shape_type}")
    if str(shape_type).lower() == "multipatch":
        arcpy.AddMessage("  Multipatch detected: bridge-table persistence is supported.")


def _require_object_id(dataset, label):
    desc = _describe(dataset)
    oid_name = getattr(desc, "OIDFieldName", None)
    has_oid = getattr(desc, "hasOID", bool(oid_name))
    if not has_oid or not oid_name:
        raise ValueError(f"{label} does not have an Object ID field.")
    arcpy.AddMessage(f"  Object ID field: {oid_name}")


def _reject_unsupported_legacy_format(dataset, label):
    path = _catalog_path(dataset).lower()
    if path.endswith(".shp") or path.endswith(".dbf"):
        raise ValueError(
            f"{label} uses a shapefile or dBASE format. Required long text "
            "fields are not supported. Use a geodatabase dataset."
        )


def _field_lookup(dataset):
    return {field.name.lower(): field for field in arcpy.ListFields(dataset)}


def _ensure_field(dataset, spec, dataset_label):
    existing = _field_lookup(dataset).get(spec.name.lower())
    if existing is not None:
        _validate_existing_field(existing, spec, dataset_label)
        arcpy.AddMessage(f"  Existing field accepted: {existing.name} ({_field_description(existing)})")
        return existing.name

    kwargs = {
        "in_table": dataset,
        "field_name": spec.name,
        "field_type": spec.field_type,
        "field_alias": spec.alias,
        "field_is_nullable": "NULLABLE",
    }
    if spec.length is not None:
        kwargs["field_length"] = spec.length
    try:
        arcpy.management.AddField(**kwargs)
    except Exception as exc:
        raise RuntimeError(
            f"Could not add field '{spec.name}' to {dataset_label}. Confirm the "
            f"dataset is schema-editable and not locked. ArcGIS message: {exc}"
        )
    created = _field_lookup(dataset).get(spec.name.lower())
    if created is None:
        raise RuntimeError(f"Field '{spec.name}' was not found after Add Field completed.")
    _validate_existing_field(created, spec, dataset_label)
    arcpy.AddMessage(f"  Added field: {created.name} ({_field_description(created)})")
    return created.name


def _validate_existing_field(field, spec, dataset_label):
    expected = {"TEXT": {"String"}, "LONG": {"Integer"}, "DOUBLE": {"Double"}, "DATE": {"Date"}}
    if field.type not in expected[spec.field_type]:
        raise ValueError(
            f"{dataset_label} field '{field.name}' is {field.type}; "
            f"the bridge requires {spec.field_type}. No existing field was altered."
        )
    if spec.field_type == "TEXT" and spec.length is not None and int(field.length or 0) < spec.length:
        raise ValueError(
            f"{dataset_label} field '{field.name}' has length {field.length}; "
            f"at least {spec.length} is required."
        )


def _field_description(field):
    return f"TEXT({field.length})" if field.type == "String" else field.type


def _actual_field_name(dataset, requested_name):
    field = _field_lookup(dataset).get(requested_name.lower())
    if field is None:
        raise RuntimeError(f"Required field '{requested_name}' was not found in {_catalog_path(dataset)}.")
    return field.name


def _prepare_feature_layer(dataset, label, mode, direct_field, direct_alias, bridge_key, populate_keys, add_indexes):
    _announce_dataset(label, dataset)
    _require_object_id(dataset, label)
    _reject_unsupported_legacy_format(dataset, label)
    work_dataset = _catalog_path(dataset)

    if mode in ("Direct attribute", "Both"):
        _ensure_field(work_dataset, FieldSpec(direct_field, "TEXT", direct_alias, 2000), label)

    if mode in ("Bridge table", "Both"):
        actual_key = _ensure_field(work_dataset, FieldSpec(bridge_key, "TEXT", "Popup Bridge Key", 64), label)
        if populate_keys:
            _populate_bridge_keys(work_dataset, actual_key, label)
        _validate_logical_uniqueness(work_dataset, actual_key, allow_blank=not populate_keys)
        if add_indexes:
            _ensure_index(work_dataset, actual_key, f"IX_{label.replace(' ', '')}_BridgeKey")


def _populate_bridge_keys(dataset, key_field, label):
    fields = _field_lookup(dataset)
    global_field = None
    for candidate in ("globalid", "global_id"):
        if candidate in fields:
            global_field = fields[candidate].name
            break

    cursor_fields = [key_field] + ([global_field] if global_field else [])
    updated = 0
    with arcpy.da.UpdateCursor(dataset, cursor_fields) as cursor:
        for row in cursor:
            current = "" if row[0] is None else str(row[0]).strip()
            if current:
                continue
            if global_field and row[1] is not None:
                value = str(row[1]).strip().strip("{}").upper()
            else:
                value = str(uuid.uuid4()).upper()
            mutable = list(row)
            mutable[0] = value
            cursor.updateRow(mutable)
            updated += 1
    arcpy.AddMessage(f"  Populated {updated} blank {key_field} value(s) in {label}.")


def _live_table_specs():
    return [
        FieldSpec("record_type", "TEXT", "Record Type", 20),
        FieldSpec("state_id", "TEXT", "State ID", 512),
        FieldSpec("channel_id", "TEXT", "Channel ID", 80),
        FieldSpec("layer_key", "TEXT", "Layer Key", 128),
        FieldSpec("feature_key", "TEXT", "Feature Key", 255),
        FieldSpec("feature_key_field", "TEXT", "Feature Key Field", 64),
        FieldSpec("display_field", "TEXT", "Display Field", 64),
        FieldSpec("message", "TEXT", "Message", 2000),
        FieldSpec("message_version", "LONG", "Message Version"),
        FieldSpec("scroller_speed", "DOUBLE", "Scroller Speed"),
        FieldSpec("sine_amplitude", "DOUBLE", "Sine Amplitude"),
        FieldSpec("sine_frequency", "DOUBLE", "Sine Frequency"),
        FieldSpec("palette", "TEXT", "Palette", 40),
        FieldSpec("updated_at", "DATE", "Updated At"),
        FieldSpec("updated_by", "TEXT", "Updated By", 128),
    ]


def _ensure_index(dataset, field_name, index_name):
    actual = _actual_field_name(dataset, field_name)
    try:
        for index in arcpy.ListIndexes(dataset) or []:
            indexed = {f.name.lower() for f in (getattr(index, "fields", None) or [])}
            if actual.lower() in indexed:
                arcpy.AddMessage(f"  Existing index accepted for {actual}: {index.name or '(unnamed)'}")
                return
        arcpy.management.AddIndex(dataset, actual, index_name, "NON_UNIQUE", "ASCENDING")
        arcpy.AddMessage(f"  Added index: {index_name}")
    except Exception as exc:
        arcpy.AddWarning(f"  Optional index on {actual} was not added: {exc}")


def _validate_logical_uniqueness(dataset, field_name, allow_blank=True):
    actual = _actual_field_name(dataset, field_name)
    seen = set()
    duplicates = set()
    blank_count = 0
    with arcpy.da.SearchCursor(dataset, [actual]) as cursor:
        for row in cursor:
            value = "" if row[0] is None else str(row[0]).strip()
            if not value:
                blank_count += 1
                continue
            if value in seen:
                duplicates.add(value)
            seen.add(value)
    if duplicates:
        sample = ", ".join(sorted(duplicates)[:10])
        raise ValueError(f"Field {actual} contains duplicate values: {sample}")
    if blank_count and not allow_blank:
        raise ValueError(f"Field {actual} contains {blank_count} blank value(s).")
    arcpy.AddMessage(f"  {actual} values are logically unique ({blank_count} blank).")


def _channel_defaults(channel_id):
    return {
        "record_type": "channel",
        "state_id": f"channel:{channel_id}",
        "channel_id": channel_id,
        "message": "POPUP LIVE BRIDGE READY",
        "message_version": 1,
        "scroller_speed": 145.0,
        "sine_amplitude": 72.0,
        "sine_frequency": 0.018,
        "palette": "neon",
        "updated_at": datetime.datetime.now(),
        "updated_by": "schema_tool",
    }


def _create_or_complete_seed_channel(live_work, channel_id):
    requested = [
        "record_type", "state_id", "channel_id", "message", "message_version",
        "scroller_speed", "sine_amplitude", "sine_frequency", "palette",
        "updated_at", "updated_by",
    ]
    actual = [_actual_field_name(live_table, name) for name in requested]
    defaults = _channel_defaults(channel_id)
    matches = 0
    with arcpy.da.SearchCursor(live_table, [actual[2]]) as cursor:
        for row in cursor:
            if ("" if row[0] is None else str(row[0]).strip()) == channel_id:
                matches += 1
    if matches > 1:
        raise ValueError(f"The bridge table contains {matches} records with channel_id '{channel_id}'.")
    if matches == 0:
        with arcpy.da.InsertCursor(live_table, actual) as cursor:
            cursor.insertRow([defaults[name] for name in requested])
        arcpy.AddMessage(f"  Added seed channel record: {channel_id}")
        return

    changed = False
    with arcpy.da.UpdateCursor(live_table, actual) as cursor:
        for row in cursor:
            if ("" if row[2] is None else str(row[2]).strip()) != channel_id:
                continue
            mutable = list(row)
            for index, name in enumerate(requested):
                value = mutable[index]
                if value is None or (isinstance(value, str) and not value.strip()):
                    mutable[index] = defaults[name]
                    changed = True
            if changed:
                cursor.updateRow(mutable)
            break
    arcpy.AddMessage(f"  Existing seed channel {'completed' if changed else 'retained'}: {channel_id}")
