from flask import Blueprint, jsonify, request
from db import query_all, query_one
from auth import require_auth
import math

insights_bp = Blueprint("insights", __name__)


# ============================================================
# Helpers — statistics & forecasting
# ============================================================

def _linreg(ys):
    n = len(ys)
    if n < 2:
        return 0.0, (ys[0] if ys else 0.0)
    xs = list(range(n))
    mx = sum(xs) / n
    my = sum(ys) / n
    num = sum((xs[i] - mx) * (ys[i] - my) for i in range(n))
    den = sum((xs[i] - mx) ** 2 for i in range(n)) or 1e-9
    slope = num / den
    intercept = my - slope * mx
    # residual std
    resid = [ys[i] - (slope * xs[i] + intercept) for i in range(n)]
    rstd = math.sqrt(sum(r * r for r in resid) / max(n - 1, 1))
    return slope, intercept, rstd


def _ewma(ys, alpha=0.4):
    if not ys:
        return []
    out = [ys[0]]
    for v in ys[1:]:
        out.append(alpha * v + (1 - alpha) * out[-1])
    return out


def _forecast_block(series, steps=14, label="Series", good_when_down=False):
    """Returns history + smoothed (EWMA) + forecast with confidence band."""
    if len(series) < 2:
        return {
            "history": series, "smoothed": [], "forecast": [],
            "slope": 0, "outlook": "Not enough data yet — keep recording.",
            "confidence": 0,
        }
    ys = [float(s["value"] or 0) for s in series]
    slope, intercept, rstd = _linreg(ys)
    smoothed_vals = _ewma(ys, alpha=0.45)
    smoothed = [{"date": series[i]["date"], "value": smoothed_vals[i]} for i in range(len(series))]

    n = len(ys)
    forecast = []
    for k in range(1, steps + 1):
        x = n - 1 + k
        v = max(0.0, slope * x + intercept)
        band = 1.96 * rstd * math.sqrt(1 + k / max(n, 1))
        forecast.append({
            "date": f"+{k}d",
            "value": v,
            "upper": v + band,
            "lower": max(0.0, v - band),
            "predicted": True,
        })

    direction = "rising" if slope > 0.001 else ("falling" if slope < -0.001 else "stable")
    if good_when_down:
        verdict = "improving 🌱" if slope < 0 else ("worsening ⚠️" if slope > 0 else "steady")
    else:
        verdict = "growing 🌱" if slope > 0 else ("declining ⚠️" if slope < 0 else "steady")

    # confidence ≈ 1 - rstd/mean (clamped)
    mean_y = sum(ys) / n
    conf = 0 if mean_y == 0 else max(0, min(100, 100 * (1 - (rstd / abs(mean_y)))))

    return {
        "history": series,
        "smoothed": smoothed,
        "forecast": forecast,
        "slope": slope,
        "outlook": f"{label} is {direction} ({slope:+.2f}/day) — {verdict}. Model confidence ~{conf:.0f}%.",
        "confidence": conf,
    }


def _fetch_daily(table, value_col, date_col_alias_sql):
    """Fetch daily totals; supports either TimeRecord join or a direct date column.
    date_col_alias_sql: full SQL fragment that aliases the date as `d` and value as `v`.
    """
    try:
        return query_all(date_col_alias_sql)
    except Exception:
        return []


def _daily(series_kind):
    """Returns list of {date, value} for production / consumption / emissions
    using TimeRecord if available, falling back to direct date columns."""
    if series_kind == "production":
        sqls = [
            """SELECT t.date AS d, COALESCE(SUM(ep.units_generated),0) AS v
               FROM EnergyProduction ep JOIN TimeRecord t ON ep.time_id=t.time_id
               GROUP BY t.date ORDER BY t.date""",
            """SELECT DATE(production_date) AS d, COALESCE(SUM(units_generated),0) AS v
               FROM EnergyProduction GROUP BY DATE(production_date) ORDER BY d""",
        ]
    elif series_kind == "consumption":
        sqls = [
            """SELECT t.date AS d, COALESCE(SUM(ec.units_consumed),0) AS v
               FROM EnergyConsumption ec JOIN TimeRecord t ON ec.time_id=t.time_id
               GROUP BY t.date ORDER BY t.date""",
            """SELECT DATE(consumption_date) AS d, COALESCE(SUM(units_consumed),0) AS v
               FROM EnergyConsumption GROUP BY DATE(consumption_date) ORDER BY d""",
        ]
    else:  # emissions
        sqls = [
            """SELECT t.date AS d, COALESCE(SUM(er.emission_amount),0) AS v
               FROM EmissionRecord er JOIN TimeRecord t ON er.time_id=t.time_id
               GROUP BY t.date ORDER BY t.date""",
            """SELECT DATE(emission_date) AS d, COALESCE(SUM(emission_amount),0) AS v
               FROM EmissionRecord GROUP BY DATE(emission_date) ORDER BY d""",
        ]
    for sql in sqls:
        try:
            rows = query_all(sql)
            out = [{"date": str(r["d"]), "value": float(r["v"] or 0)} for r in rows if r["d"] is not None]
            if out:
                return out
        except Exception:
            continue
    return []


# ============================================================
# Summary / Trends / Top tables
# ============================================================

@insights_bp.route("/api/insights/summary", methods=["GET"])
@require_auth("admin", "analyst", "viewer")
def summary():
    total_prod = query_one("SELECT COALESCE(SUM(units_generated),0) AS v FROM EnergyProduction")["v"]
    total_cons = query_one("SELECT COALESCE(SUM(units_consumed),0) AS v FROM EnergyConsumption")["v"]
    total_emis = query_one("SELECT COALESCE(SUM(emission_amount),0) AS v FROM EmissionRecord")["v"]

    ratio = query_all("""
        SELECT COALESCE(es.source_type,'Unknown') AS source_type,
               COALESCE(SUM(ep.units_generated),0) AS units
        FROM EnergyProduction ep
        LEFT JOIN PowerPlant pp ON ep.plant_id = pp.plant_id
        LEFT JOIN EnergySource es ON pp.source_id = es.source_id
        GROUP BY es.source_type
    """)

    counts = {}
    for t in ("PowerPlant", "City", "Region", "Operator", "EnergySource"):
        try:
            counts[t] = query_one(f"SELECT COUNT(*) AS c FROM `{t}`")["c"]
        except Exception:
            counts[t] = 0

    renewable_kw = ("solar", "wind", "hydro", "geo", "bio", "renew")
    renew_units, total_units = 0.0, 0.0
    for r in ratio:
        u = float(r["units"] or 0)
        total_units += u
        if any(k in (r["source_type"] or "").lower() for k in renewable_kw):
            renew_units += u
    renewable_share = (renew_units / total_units * 100.0) if total_units else 0.0

    prod, cons, emis = float(total_prod or 0), float(total_cons or 0), float(total_emis or 0)
    return jsonify({
        "total_production": prod,
        "total_consumption": cons,
        "total_emissions": emis,
        "net_balance": prod - cons,
        "renewable_share": renewable_share,
        "carbon_intensity": (emis / prod) if prod else 0.0,
        "self_sufficiency": (prod / cons * 100.0) if cons else 0.0,
        "source_mix": [{"source_type": r["source_type"], "units": float(r["units"])} for r in ratio],
        "counts": counts,
    })


@insights_bp.route("/api/insights/trends", methods=["GET"])
@require_auth("admin", "analyst", "viewer")
def trends():
    return jsonify({
        "production":  _daily("production"),
        "consumption": _daily("consumption"),
        "emissions":   _daily("emissions"),
    })


@insights_bp.route("/api/insights/top-emission-cities", methods=["GET"])
@require_auth("admin", "analyst", "viewer")
def top_emission_cities():
    rows = query_all("""
        SELECT c.city_name, SUM(er.emission_amount) AS total_emission
        FROM EmissionRecord er JOIN City c ON er.city_id = c.city_id
        GROUP BY c.city_id, c.city_name
        ORDER BY total_emission DESC LIMIT 10
    """)
    return jsonify([{"city_name": r["city_name"], "total_emission": float(r["total_emission"] or 0)} for r in rows])


@insights_bp.route("/api/insights/top-plants", methods=["GET"])
@require_auth("admin", "analyst", "viewer")
def top_plants():
    rows = query_all("""
        SELECT pp.plant_name, SUM(ep.units_generated) AS units
        FROM EnergyProduction ep JOIN PowerPlant pp ON ep.plant_id = pp.plant_id
        GROUP BY pp.plant_id, pp.plant_name
        ORDER BY units DESC LIMIT 10
    """)
    return jsonify([{"plant_name": r["plant_name"], "units": float(r["units"] or 0)} for r in rows])


# ============================================================
# Predictive endpoints
# ============================================================

@insights_bp.route("/api/insights/forecast", methods=["GET"])
@require_auth("admin", "analyst", "viewer")
def forecast():
    """Historical + 14-day forecast with 95% confidence band."""
    days = int(request.args.get("days", 14))
    days = max(3, min(days, 60))
    prod = _daily("production")
    cons = _daily("consumption")
    emis = _daily("emissions")
    return jsonify({
        "production":  _forecast_block(prod, steps=days, label="Production"),
        "consumption": _forecast_block(cons, steps=days, label="Consumption"),
        "emissions":   _forecast_block(emis, steps=days, label="Emissions", good_when_down=True),
    })


@insights_bp.route("/api/insights/source-forecast", methods=["GET"])
@require_auth("admin", "analyst", "viewer")
def source_forecast():
    """Per-source forecast — predicts which energy sources will dominate."""
    rows = query_all("""
        SELECT COALESCE(es.source_type,'Unknown') AS s,
               t.date AS d,
               COALESCE(SUM(ep.units_generated),0) AS v
        FROM EnergyProduction ep
        LEFT JOIN PowerPlant pp ON ep.plant_id = pp.plant_id
        LEFT JOIN EnergySource es ON pp.source_id = es.source_id
        LEFT JOIN TimeRecord t ON ep.time_id = t.time_id
        WHERE t.date IS NOT NULL
        GROUP BY es.source_type, t.date ORDER BY t.date
    """)
    if not rows:
        rows = query_all("""
            SELECT COALESCE(es.source_type,'Unknown') AS s,
                   DATE(ep.production_date) AS d,
                   COALESCE(SUM(ep.units_generated),0) AS v
            FROM EnergyProduction ep
            LEFT JOIN PowerPlant pp ON ep.plant_id = pp.plant_id
            LEFT JOIN EnergySource es ON pp.source_id = es.source_id
            GROUP BY es.source_type, DATE(ep.production_date) ORDER BY d
        """) or []

    by_source = {}
    for r in rows:
        if r["d"] is None:
            continue
        by_source.setdefault(r["s"] or "Unknown", []).append(
            {"date": str(r["d"]), "value": float(r["v"] or 0)}
        )

    out = []
    for src, series in by_source.items():
        block = _forecast_block(series, steps=14, label=src)
        cur = sum(s["value"] for s in series[-7:]) if series else 0
        fut = sum(s["value"] for s in block["forecast"][:7]) if block["forecast"] else 0
        change_pct = ((fut - cur) / cur * 100.0) if cur else 0.0
        out.append({
            "source_type": src,
            "current_7d": cur,
            "forecast_7d": fut,
            "change_pct": change_pct,
            "slope": block["slope"],
            "outlook": block["outlook"],
        })
    out.sort(key=lambda x: x["forecast_7d"], reverse=True)
    return jsonify(out)


@insights_bp.route("/api/insights/region-breakdown", methods=["GET"])
@require_auth("admin", "analyst", "viewer")
def region_breakdown():
    rows = query_all("""
        SELECT r.region_name,
               COALESCE((SELECT SUM(ep.units_generated)
                         FROM EnergyProduction ep
                         JOIN PowerPlant pp ON ep.plant_id=pp.plant_id
                         JOIN City c ON pp.city_id=c.city_id
                         WHERE c.region_id=r.region_id),0) AS production,
               COALESCE((SELECT SUM(ec.units_consumed)
                         FROM EnergyConsumption ec
                         JOIN City c ON ec.city_id=c.city_id
                         WHERE c.region_id=r.region_id),0) AS consumption,
               COALESCE((SELECT SUM(er.emission_amount)
                         FROM EmissionRecord er
                         JOIN City c ON er.city_id=c.city_id
                         WHERE c.region_id=r.region_id),0) AS emissions
        FROM Region r
        ORDER BY production DESC LIMIT 15
    """)
    return jsonify([
        {"region": r["region_name"],
         "production":  float(r["production"]  or 0),
         "consumption": float(r["consumption"] or 0),
         "emissions":   float(r["emissions"]   or 0)}
        for r in rows
    ])


@insights_bp.route("/api/insights/efficiency", methods=["GET"])
@require_auth("admin", "analyst", "viewer")
def efficiency():
    rows = query_all("""
        SELECT pp.plant_name,
               COALESCE(pp.capacity_mw, 0) AS capacity,
               COALESCE(SUM(ep.units_generated),0) AS units,
               COALESCE(es.source_type,'Unknown') AS source_type
        FROM PowerPlant pp
        LEFT JOIN EnergyProduction ep ON ep.plant_id = pp.plant_id
        LEFT JOIN EnergySource es     ON pp.source_id = es.source_id
        GROUP BY pp.plant_id, pp.plant_name, pp.capacity_mw, es.source_type
        ORDER BY units DESC LIMIT 20
    """)
    out = []
    for r in rows:
        cap = float(r["capacity"] or 0)
        units = float(r["units"] or 0)
        # ensure scatter has non-zero x so points render
        eff_cap = cap if cap > 0 else max(units / 24.0, 1.0)
        eff = (units / eff_cap) if eff_cap else 0
        out.append({
            "plant_name": r["plant_name"],
            "capacity": eff_cap,
            "units": units,
            "efficiency": eff,
            "source_type": r["source_type"],
        })
    return jsonify(out)


@insights_bp.route("/api/insights/anomalies", methods=["GET"])
@require_auth("admin", "analyst", "viewer")
def anomalies():
    series = _daily("emissions")
    n = len(series)
    if n < 3:
        return jsonify({"mean": 0, "std": 0, "anomalies": [], "series": series})
    vals = [s["value"] for s in series]
    mean = sum(vals) / n
    std = math.sqrt(sum((v - mean) ** 2 for v in vals) / n)
    threshold = 2 * std
    anomalies = [s for s in series if abs(s["value"] - mean) > threshold]
    return jsonify({"mean": mean, "std": std, "anomalies": anomalies, "series": series})


# ============================================================
# NEW: correlation, scenario, neutrality ETA, weather, ranking
# ============================================================

@insights_bp.route("/api/insights/correlation", methods=["GET"])
@require_auth("admin", "analyst", "viewer")
def correlation():
    """Pearson correlation between production, consumption, emissions over shared dates."""
    p = {s["date"]: s["value"] for s in _daily("production")}
    c = {s["date"]: s["value"] for s in _daily("consumption")}
    e = {s["date"]: s["value"] for s in _daily("emissions")}
    common = sorted(set(p) & set(c) & set(e))

    def pearson(a, b):
        n = len(a)
        if n < 2:
            return 0
        ma, mb = sum(a)/n, sum(b)/n
        num = sum((a[i]-ma)*(b[i]-mb) for i in range(n))
        da = math.sqrt(sum((a[i]-ma)**2 for i in range(n)))
        db = math.sqrt(sum((b[i]-mb)**2 for i in range(n)))
        return (num/(da*db)) if (da and db) else 0

    P = [p[d] for d in common]; C = [c[d] for d in common]; E = [e[d] for d in common]
    matrix = [
        {"x": "Production",  "y": "Production",  "v": 1},
        {"x": "Production",  "y": "Consumption", "v": pearson(P, C)},
        {"x": "Production",  "y": "Emissions",   "v": pearson(P, E)},
        {"x": "Consumption", "y": "Production",  "v": pearson(C, P)},
        {"x": "Consumption", "y": "Consumption", "v": 1},
        {"x": "Consumption", "y": "Emissions",   "v": pearson(C, E)},
        {"x": "Emissions",   "y": "Production",  "v": pearson(E, P)},
        {"x": "Emissions",   "y": "Consumption", "v": pearson(E, C)},
        {"x": "Emissions",   "y": "Emissions",   "v": 1},
    ]
    return jsonify({"matrix": matrix, "samples": len(common)})


@insights_bp.route("/api/insights/scenario", methods=["GET"])
@require_auth("admin", "analyst", "viewer")
def scenario():
    """What-if simulator.
    Query params:
      renewable_boost: +% renewable capacity (e.g. 25 = +25%)
      efficiency_gain: +% efficiency on all plants
      consumption_reduction: -% consumption (e.g. 10 = -10%)
    Returns 30-day projected production, consumption, emissions vs baseline.
    """
    rb = float(request.args.get("renewable_boost", 0)) / 100.0
    eg = float(request.args.get("efficiency_gain", 0)) / 100.0
    cr = float(request.args.get("consumption_reduction", 0)) / 100.0

    prod = _daily("production"); cons = _daily("consumption"); emis = _daily("emissions")

    # baseline avg
    def avg(s, n=14):
        if not s: return 0
        tail = s[-n:]
        return sum(x["value"] for x in tail) / len(tail)

    base_p, base_c, base_e = avg(prod), avg(cons), avg(emis)

    # renewable share now
    ratio = query_all("""
        SELECT COALESCE(es.source_type,'Unknown') AS s,
               COALESCE(SUM(ep.units_generated),0) AS u
        FROM EnergyProduction ep
        LEFT JOIN PowerPlant pp ON ep.plant_id=pp.plant_id
        LEFT JOIN EnergySource es ON pp.source_id=es.source_id
        GROUP BY es.source_type
    """)
    renew_kw = ("solar","wind","hydro","geo","bio","renew")
    tot = sum(float(r["u"] or 0) for r in ratio) or 1
    renew = sum(float(r["u"] or 0) for r in ratio if any(k in (r["s"] or "").lower() for k in renew_kw))
    renew_share = renew / tot

    # simulate
    proj_p = base_p * (1 + rb * renew_share + eg)
    proj_c = base_c * (1 - cr)
    # emissions drop with renewable boost (less fossil) and efficiency
    fossil_factor = max(0.0, 1 - renew_share)
    proj_e = base_e * (1 - rb * fossil_factor * 0.6 - eg * 0.3)
    proj_e = max(0.0, proj_e)

    # 30-day projection arrays
    proj_series = []
    for d in range(1, 31):
        proj_series.append({
            "day": d,
            "baseline_production":  base_p,
            "scenario_production":  proj_p,
            "baseline_consumption": base_c,
            "scenario_consumption": proj_c,
            "baseline_emissions":   base_e,
            "scenario_emissions":   proj_e,
        })

    return jsonify({
        "baseline": {"production": base_p, "consumption": base_c, "emissions": base_e},
        "scenario": {"production": proj_p, "consumption": proj_c, "emissions": proj_e},
        "deltas": {
            "production":  ((proj_p - base_p) / base_p * 100) if base_p else 0,
            "consumption": ((proj_c - base_c) / base_c * 100) if base_c else 0,
            "emissions":   ((proj_e - base_e) / base_e * 100) if base_e else 0,
        },
        "renewable_share_now": renew_share * 100,
        "projection": proj_series,
    })


@insights_bp.route("/api/insights/neutrality-eta", methods=["GET"])
@require_auth("admin", "analyst", "viewer")
def neutrality_eta():
    """Estimate days until carbon-neutral, given current emissions trend."""
    emis = _daily("emissions")
    if len(emis) < 3:
        return jsonify({"eta_days": None, "message": "Need more emission history."})
    ys = [s["value"] for s in emis]
    slope, intercept, _ = _linreg(ys)
    last = ys[-1]
    if slope >= 0:
        return jsonify({
            "eta_days": None,
            "current": last, "slope": slope,
            "message": "Emissions are not declining — apply scenario boosts to find a path."
        })
    # solve slope*x + intercept = 0 from x=n-1
    n = len(ys)
    eta = -intercept / slope - (n - 1)
    eta = max(1, int(eta))
    # also build trajectory line
    traj = []
    for k in range(0, min(eta, 365) + 1, max(1, eta // 60 if eta > 60 else 1)):
        traj.append({"day": k, "value": max(0.0, last + slope * k)})
    return jsonify({
        "eta_days": eta,
        "eta_years": round(eta / 365.0, 2),
        "current": last,
        "slope": slope,
        "trajectory": traj,
        "message": f"At current rate, neutrality in ~{eta} days ({eta/365:.1f} years)."
    })


@insights_bp.route("/api/insights/weather-impact", methods=["GET"])
@require_auth("admin", "analyst", "viewer")
def weather_impact():
    """Group production by weather condition (if WeatherCondition table is joinable)."""
    candidates = [
        """SELECT wc.condition_type AS cond,
                  AVG(ep.units_generated) AS avg_units,
                  COUNT(*) AS n
           FROM EnergyProduction ep
           JOIN WeatherCondition wc ON ep.weather_id = wc.weather_id
           GROUP BY wc.condition_type ORDER BY avg_units DESC""",
        """SELECT wc.condition_type AS cond,
                  AVG(ep.units_generated) AS avg_units,
                  COUNT(*) AS n
           FROM EnergyProduction ep
           JOIN PowerPlant pp ON ep.plant_id=pp.plant_id
           JOIN WeatherCondition wc ON pp.city_id = wc.city_id
           GROUP BY wc.condition_type ORDER BY avg_units DESC""",
    ]
    for sql in candidates:
        try:
            rows = query_all(sql)
            if rows:
                return jsonify([
                    {"condition": r["cond"], "avg_units": float(r["avg_units"] or 0), "samples": int(r["n"])}
                    for r in rows
                ])
        except Exception:
            continue
    return jsonify([])


@insights_bp.route("/api/insights/region-rank", methods=["GET"])
@require_auth("admin", "analyst", "viewer")
def region_rank():
    """Composite green-score per region (higher = greener)."""
    data = query_all("""
        SELECT r.region_name,
               COALESCE((SELECT SUM(ep.units_generated)
                         FROM EnergyProduction ep
                         JOIN PowerPlant pp ON ep.plant_id=pp.plant_id
                         JOIN City c ON pp.city_id=c.city_id
                         WHERE c.region_id=r.region_id),0) AS production,
               COALESCE((SELECT SUM(er.emission_amount)
                         FROM EmissionRecord er
                         JOIN City c ON er.city_id=c.city_id
                         WHERE c.region_id=r.region_id),0) AS emissions
        FROM Region r
    """)
    out = []
    for r in data:
        p = float(r["production"] or 0); e = float(r["emissions"] or 0)
        intensity = (e / p) if p else (e if e else 0)
        # score: high prod, low intensity → high score (0-100)
        score = max(0, min(100, 100 - intensity * 50))
        if p == 0 and e == 0:
            score = 50
        out.append({"region": r["region_name"], "production": p, "emissions": e,
                    "intensity": intensity, "green_score": score})
    out.sort(key=lambda x: x["green_score"], reverse=True)
    return jsonify(out)


@insights_bp.route("/api/insights/recommendations", methods=["GET"])
@require_auth("admin", "analyst", "viewer")
def recommendations():
    s = float(query_one("SELECT COALESCE(SUM(units_generated),0) AS p FROM EnergyProduction")["p"] or 0)
    c = float(query_one("SELECT COALESCE(SUM(units_consumed),0) AS c FROM EnergyConsumption")["c"] or 0)
    e = float(query_one("SELECT COALESCE(SUM(emission_amount),0) AS e FROM EmissionRecord")["e"] or 0)

    tips = []
    if c > s and s > 0:
        tips.append({"level": "warning", "title": "Consumption exceeds production",
                     "detail": f"Net deficit of {c-s:,.1f} units. Expand renewable capacity or import."})
    elif s > c:
        tips.append({"level": "good", "title": "Surplus generation 🌿",
                     "detail": f"Producing {s-c:,.1f} more units than consumed."})

    intensity = (e / s) if s else 0
    if intensity > 0.5:
        tips.append({"level": "warning", "title": "High carbon intensity",
                     "detail": f"{intensity:.2f} kg CO₂ / unit — replace fossil sources."})
    else:
        tips.append({"level": "good", "title": "Low carbon intensity",
                     "detail": f"Only {intensity:.2f} kg CO₂ / unit. Healthy ecosystem."})

    top = query_all("""
        SELECT c.city_name, SUM(er.emission_amount) AS v
        FROM EmissionRecord er JOIN City c ON er.city_id=c.city_id
        GROUP BY c.city_id, c.city_name ORDER BY v DESC LIMIT 1
    """)
    if top:
        tips.append({"level": "info", "title": f"Focus city: {top[0]['city_name']}",
                     "detail": f"Highest emitter at {float(top[0]['v']):,.1f} kg CO₂. Target first."})

    # forward-looking tip from emissions slope
    emis = _daily("emissions")
    if len(emis) >= 3:
        slope, _, _ = _linreg([x["value"] for x in emis])
        if slope > 0:
            tips.append({"level": "warning", "title": "Emissions trending up",
                         "detail": f"Slope {slope:+.2f}/day. Without intervention, expect rising CO₂."})
        else:
            tips.append({"level": "good", "title": "Emissions trending down 🌱",
                         "detail": f"Slope {slope:+.2f}/day. Keep the momentum."})
    return jsonify(tips)
