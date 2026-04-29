"""
Generic CRUD route factory.
Each table is registered with its primary key, columns, and optional search columns.
SQL is built using only whitelisted identifiers (no user input in identifiers),
and all values are bound via parameterized queries (SQL injection safe).
"""
from flask import Blueprint, request, jsonify, g
from db import query_all, query_one, execute
from auth import require_auth

# ---- Table registry ----------------------------------------------------------
# Each entry:
#   pk: primary key column
#   cols: insert/update columns (excluding pk if auto, but our PKs are manual int -> include)
#   search: text columns used for ?q= search
#   pk_auto: if True we let DB autoincrement; PowerPlant etc. use manual ids in dump,
#            so we keep pk_auto False and require client to provide id.

TABLES = {
    "Region": {
        "pk": "region_id",
        "cols": ["region_id", "region_name", "region_code", "region_full_name"],
        "search": ["region_name", "region_code", "region_full_name"],
    },
    "City": {
        "pk": "city_id",
        "cols": ["city_id", "city_name", "population", "region_id"],
        "search": ["city_name"],
    },
    "Operator": {
        "pk": "operator_id",
        "cols": ["operator_id", "operator_name"],
        "search": ["operator_name"],
    },
    "EnergySource": {
        "pk": "source_id",
        "cols": ["source_id", "source_name", "source_type"],
        "search": ["source_name", "source_type"],
    },
    "FuelType": {
        "pk": "fuel_id",
        "cols": ["fuel_id", "fuel_name", "emission_factor"],
        "search": ["fuel_name"],
    },
    "Sector": {
        "pk": "sector_id",
        "cols": ["sector_id", "sector_name"],
        "search": ["sector_name"],
    },
    "PowerPlant": {
        "pk": "plant_id",
        "cols": ["plant_id", "plant_name", "city_id", "operator_id", "source_id"],
        "search": ["plant_name"],
    },
    "ConsumerCategory": {
        "pk": "category_id",
        "cols": ["category_id", "category_name", "consumed", "sector_id"],
        "search": ["category_name"],
    },
    "TimeRecord": {
        "pk": "time_id",
        "cols": ["time_id", "date", "hour"],
        "search": [],
    },
    "EnergyProduction": {
        "pk": "production_id",
        "cols": ["production_id", "units_generated", "plant_id", "time_id"],
        "search": [],
    },
    "EnergyConsumption": {
        "pk": "consumption_id",
        "cols": ["consumption_id", "units_consumed", "city_id", "sector_id", "fuel_id", "time_id"],
        "search": [],
    },
    "EmissionRecord": {
        "pk": "emission_id",
        "cols": ["emission_id", "city_id", "fuel_id", "time_id", "emission_amount"],
        "search": [],
    },
    "WeatherRecord": {  # alias to existing WeatherCondition table
        "pk": "weather_id",
        "cols": ["weather_id", "temperature", "wind_speed", "solar_intensity", "city_id", "time_id"],
        "search": [],
        "table_name": "WeatherCondition",
    },
    "GridConnection": {
        "pk": "connection_id",
        "cols": ["connection_id", "plant_id", "grid_id", "connected_on"],
        "search": [],
    },
    "TransmissionGrid": {
        "pk": "grid_id",
        "cols": ["grid_id", "grid_name", "region_id"],
        "search": ["grid_name"],
    },
    "Installation": {
        "pk": "installation_id",
        "cols": ["installation_id", "installed_capacity", "installation_date", "plant_id"],
        "search": [],
    },
    "ActivityIndicator": {
        "pk": "activity_id",
        "cols": ["activity_id", "indicator_type", "indicator_value", "city_id"],
        "search": ["indicator_type"],
    },
}


def _real_table(name):
    return TABLES[name].get("table_name", name)


crud_bp = Blueprint("crud", __name__)


def _filter_payload(name, data):
    cfg = TABLES[name]
    return {k: v for k, v in (data or {}).items() if k in cfg["cols"]}


@crud_bp.route("/api/tables/<name>", methods=["GET"])
@require_auth("admin", "analyst", "viewer")
def list_rows(name):
    if name not in TABLES:
        return jsonify({"error": "Unknown table"}), 404
    cfg = TABLES[name]
    table = _real_table(name)
    q = (request.args.get("q") or "").strip()
    try:
        page = max(int(request.args.get("page", 1)), 1)
        page_size = min(max(int(request.args.get("page_size", 25)), 1), 200)
    except ValueError:
        return jsonify({"error": "Bad pagination"}), 400

    where = ""
    params = []
    if q and cfg["search"]:
        where = " WHERE " + " OR ".join([f"`{c}` LIKE %s" for c in cfg["search"]])
        params = [f"%{q}%"] * len(cfg["search"])

    # filter by foreign key, e.g. ?city_id=1
    fk_clauses = []
    for col in cfg["cols"]:
        if col == cfg["pk"]:
            continue
        val = request.args.get(col)
        if val is not None and val != "":
            fk_clauses.append(f"`{col}` = %s")
            params.append(val)
    if fk_clauses:
        where = (where + (" AND " if where else " WHERE ")) + " AND ".join(fk_clauses)

    count_sql = f"SELECT COUNT(*) AS c FROM `{table}`{where}"
    total = query_one(count_sql, params)["c"]

    offset = (page - 1) * page_size
    sql = f"SELECT * FROM `{table}`{where} ORDER BY `{cfg['pk']}` DESC LIMIT %s OFFSET %s"
    rows = query_all(sql, params + [page_size, offset])
    return jsonify({"rows": rows, "total": total, "page": page, "page_size": page_size})


@crud_bp.route("/api/tables/<name>/<int:row_id>", methods=["GET"])
@require_auth("admin", "analyst", "viewer")
def get_row(name, row_id):
    if name not in TABLES:
        return jsonify({"error": "Unknown table"}), 404
    cfg = TABLES[name]
    row = query_one(f"SELECT * FROM `{_real_table(name)}` WHERE `{cfg['pk']}`=%s", (row_id,))
    if not row:
        return jsonify({"error": "Not found"}), 404
    return jsonify(row)


@crud_bp.route("/api/tables/<name>", methods=["POST"])
@require_auth("admin", "analyst")
def create_row(name):
    if name not in TABLES:
        return jsonify({"error": "Unknown table"}), 404
    cfg = TABLES[name]
    data = _filter_payload(name, request.get_json(silent=True))
    if not data:
        return jsonify({"error": "No valid fields"}), 400
    cols = list(data.keys())
    placeholders = ", ".join(["%s"] * len(cols))
    col_sql = ", ".join([f"`{c}`" for c in cols])
    sql = f"INSERT INTO `{_real_table(name)}` ({col_sql}) VALUES ({placeholders})"
    try:
        execute(sql, list(data.values()))
    except Exception as e:
        return jsonify({"error": "Insert failed", "detail": str(e)[:200]}), 400
    pk_val = data.get(cfg["pk"])
    return jsonify({"ok": True, cfg["pk"]: pk_val}), 201


@crud_bp.route("/api/tables/<name>/<int:row_id>", methods=["PUT"])
@require_auth("admin", "analyst")
def update_row(name, row_id):
    if name not in TABLES:
        return jsonify({"error": "Unknown table"}), 404
    cfg = TABLES[name]
    data = _filter_payload(name, request.get_json(silent=True))
    data.pop(cfg["pk"], None)
    if not data:
        return jsonify({"error": "No valid fields"}), 400
    set_sql = ", ".join([f"`{c}`=%s" for c in data.keys()])
    sql = f"UPDATE `{_real_table(name)}` SET {set_sql} WHERE `{cfg['pk']}`=%s"
    try:
        res = execute(sql, list(data.values()) + [row_id])
    except Exception as e:
        return jsonify({"error": "Update failed", "detail": str(e)[:200]}), 400
    if res["rowcount"] == 0:
        return jsonify({"error": "Not found"}), 404
    return jsonify({"ok": True})


@crud_bp.route("/api/tables/<name>/<int:row_id>", methods=["DELETE"])
@require_auth("admin")
def delete_row(name, row_id):
    if name not in TABLES:
        return jsonify({"error": "Unknown table"}), 404
    cfg = TABLES[name]
    try:
        res = execute(f"DELETE FROM `{_real_table(name)}` WHERE `{cfg['pk']}`=%s", (row_id,))
    except Exception as e:
        return jsonify({"error": "Delete failed", "detail": str(e)[:200]}), 400
    if res["rowcount"] == 0:
        return jsonify({"error": "Not found"}), 404
    return jsonify({"ok": True})


@crud_bp.route("/api/schema", methods=["GET"])
@require_auth("admin", "analyst", "viewer")
def schema():
    return jsonify({
        name: {"pk": cfg["pk"], "cols": cfg["cols"], "search": cfg["search"]}
        for name, cfg in TABLES.items()
    })
