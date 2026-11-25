import os
import re
import sqlite3
from datetime import datetime, date, timedelta
from flask import Flask, g, jsonify, request, render_template

app = Flask(__name__)
DB_PATH = os.environ.get("DB_PATH", "app.db")


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        # Enforce foreign keys / pragmas
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    with app.app_context():
        schema_path = os.path.join(os.path.dirname(__file__), "schema.sql")
        if os.path.exists(schema_path):
            with open(schema_path, "r", encoding="utf-8") as f:
                get_db().executescript(f.read())
            get_db().commit()


init_db()


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/favicon.ico")
def favicon():
    # Return 204 No Content or SVG favicon
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
        '<circle cx="50" cy="50" r="45" fill="#e4572e"/>'
        '<circle cx="50" cy="50" r="28" fill="#fff7f3"/>'
        '<polyline points="50,30 50,50 65,50" stroke="#e4572e" stroke-width="8" stroke-linecap="round" fill="none"/>'
        '</svg>'
    )
    return svg, 200, {"Content-Type": "image/svg+xml"}


@app.route("/api/health", methods=["GET"])
def health():
    try:
        db = get_db()
        db.execute("SELECT 1").fetchone()
        return jsonify({"status": "ok", "database": "connected"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/settings", methods=["GET", "POST"])
def settings_route():
    db = get_db()
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        valid_keys = {"focus_min", "short_break_min", "long_break_min"}
        updated = {}

        for k, v in data.items():
            if k in valid_keys:
                try:
                    val_int = int(v)
                    if not (1 <= val_int <= 180):
                        return jsonify({"error": f"{k} must be between 1 and 180"}), 400
                    db.execute(
                        "INSERT INTO settings (key, value) VALUES (?, ?) "
                        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                        (k, str(val_int)),
                    )
                    updated[k] = val_int
                except (ValueError, TypeError):
                    return jsonify({"error": f"Invalid integer for {k}"}), 400

        db.commit()
        return jsonify({"ok": True, "updated": updated}), 200

    # GET request
    rows = db.execute("SELECT key, value FROM settings").fetchall()
    settings_dict = {
        "focus_min": 25,
        "short_break_min": 5,
        "long_break_min": 15,
    }
    for r in rows:
        try:
            settings_dict[r["key"]] = int(r["value"])
        except (ValueError, TypeError):
            pass

    return jsonify(settings_dict), 200


@app.route("/api/sessions", methods=["GET", "POST"])
def sessions_route():
    db = get_db()

    if request.method == "POST":
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "Missing JSON request body"}), 400

        mode = data.get("mode")
        minutes_raw = data.get("minutes")
        task_raw = data.get("task")
        local_date_raw = data.get("local_date")

        # Validate mode
        if mode not in ("focus", "break"):
            return jsonify({"error": "Mode must be 'focus' or 'break'"}), 400

        # Validate minutes
        try:
            minutes = int(minutes_raw)
            if not (1 <= minutes <= 180):
                return jsonify({"error": "Minutes must be between 1 and 180"}), 400
        except (ValueError, TypeError):
            return jsonify({"error": "Minutes must be a valid integer between 1 and 180"}), 400

        # Validate task (optional, max 80 chars)
        task = None
        if task_raw is not None:
            task_str = str(task_raw).strip()
            if len(task_str) > 80:
                return jsonify({"error": "Task label must be at most 80 characters"}), 400
            task = task_str if task_str else None

        # Validate local_date (YYYY-MM-DD)
        if local_date_raw and re.match(r"^\d{4}-\d{2}-\d{2}$", str(local_date_raw)):
            local_date = str(local_date_raw)
        else:
            local_date = date.today().strftime("%Y-%m-%d")

        finished_at = datetime.now().isoformat(timespec="seconds")

        cursor = db.execute(
            "INSERT INTO sessions (mode, minutes, task, finished_at, local_date) "
            "VALUES (?, ?, ?, ?, ?)",
            (mode, minutes, task, finished_at, local_date),
        )
        db.commit()

        return jsonify({
            "ok": True,
            "id": cursor.lastrowid,
            "session": {
                "id": cursor.lastrowid,
                "mode": mode,
                "minutes": minutes,
                "task": task,
                "finished_at": finished_at,
                "local_date": local_date,
            }
        }), 201

    # GET request
    days_arg = request.args.get("days", 7)
    try:
        days = int(days_arg)
        if days < 1:
            days = 7
        days = min(days, 60)
    except (ValueError, TypeError):
        days = 7

    client_date_str = request.args.get("local_date")
    if client_date_str and re.match(r"^\d{4}-\d{2}-\d{2}$", client_date_str):
        ref_date = datetime.strptime(client_date_str, "%Y-%m-%d").date()
    else:
        ref_date = date.today()

    ref_date_str = ref_date.strftime("%Y-%m-%d")

    # Fetch individual recent focus sessions for the history display
    recent_rows = db.execute(
        "SELECT id, mode, minutes, task, finished_at, local_date "
        "FROM sessions "
        "WHERE mode = 'focus' "
        "ORDER BY id DESC LIMIT 100"
    ).fetchall()
    sessions_list = [dict(r) for r in recent_rows]

    # Group totals by local_date
    daily_rows = db.execute(
        "SELECT local_date, COUNT(*) AS n, SUM(minutes) AS minutes "
        "FROM sessions "
        "WHERE mode = 'focus' "
        "GROUP BY local_date "
        "ORDER BY local_date DESC"
    ).fetchall()

    daily_map = {r["local_date"]: {"n": r["n"], "minutes": r["minutes"]} for r in daily_rows}

    # Generate 7-day calendar window for the weekly bar chart
    chart_days = []
    for i in range(days - 1, -1, -1):
        d = ref_date - timedelta(days=i)
        d_str = d.strftime("%Y-%m-%d")
        weekday = d.strftime("%a")
        day_stat = daily_map.get(d_str, {"n": 0, "minutes": 0})
        chart_days.append({
            "local_date": d_str,
            "day": d_str,
            "weekday": weekday,
            "n": day_stat["n"],
            "minutes": day_stat["minutes"],
            "is_today": (d_str == ref_date_str)
        })

    # Group history by date with child sessions
    history_grouped = []
    # Distinct dates present in sessions_list
    seen_dates = []
    for s in sessions_list:
        if s["local_date"] not in seen_dates:
            seen_dates.append(s["local_date"])

    for d_str in seen_dates:
        items = [s for s in sessions_list if s["local_date"] == d_str]
        stat = daily_map.get(d_str, {"n": len(items), "minutes": sum(x["minutes"] for x in items)})
        history_grouped.append({
            "date": d_str,
            "day": d_str,
            "n": stat["n"],
            "minutes": stat["minutes"],
            "sessions": items
        })

    # Today stats
    today_stat = daily_map.get(ref_date_str, {"n": 0, "minutes": 0})

    # Consecutive day streak calculation
    active_dates = sorted(daily_map.keys(), reverse=True)
    active_set = set(active_dates)
    streak = 0
    check_date = ref_date

    # If completed sessions exist for today, start count from today
    if ref_date_str in active_set:
        while check_date.strftime("%Y-%m-%d") in active_set:
            streak += 1
            check_date -= timedelta(days=1)
    else:
        # Check if yesterday had completed sessions
        yesterday = ref_date - timedelta(days=1)
        check_date = yesterday
        while check_date.strftime("%Y-%m-%d") in active_set:
            streak += 1
            check_date -= timedelta(days=1)

    return jsonify({
        "days": chart_days,
        "history": history_grouped,
        "sessions": sessions_list,
        "today": today_stat,
        "streak": streak
    }), 200


if __name__ == "__main__":
    app.run(debug=True, host="127.0.0.1", port=5000)
