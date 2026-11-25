"""Public daily counts for the CNT workbenches. Run with usage_api:create_app()."""
import hashlib
import os
import re
import sqlite3
from contextlib import closing
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from uuid import UUID

from flask import Flask, jsonify, request

BEIJING = timezone(timedelta(hours=8))
PORTAL = "https://zuestian.github.io"
DOMAIN = "47.236.76.214.nip.io"
TOOL_HOSTS = {
    "vision": PORTAL,
    "opt": f"https://opt-cnt.{DOMAIN}",
    "tem": f"https://tem-cnt.{DOMAIN}",
    "sem": f"https://sem.{DOMAIN}",
    "grain": f"https://grain-peak.{DOMAIN}",
    "uv": f"https://uv-spectrum.{DOMAIN}",
    "raman": f"https://raman.{DOMAIN}",
    "xrd": f"https://cnt-xrd.{DOMAIN}",
    "bet": f"https://{DOMAIN}",
    "production": f"https://cnt-analysis.{DOMAIN}",
    "furnace": f"https://sim-db.{DOMAIN}",
}


def create_app(state_dir=None, clock=None):
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = 512
    now = clock or (lambda: datetime.now(BEIJING))
    directory = Path(state_dir or os.environ.get("STATE_DIRECTORY", "/var/lib/cnt-usage"))
    directory.mkdir(parents=True, exist_ok=True)
    db = directory / "daily.sqlite3"

    with closing(sqlite3.connect(db)) as conn, conn:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS coverage (id INTEGER PRIMARY KEY CHECK(id=1), started TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS seen (
                day TEXT NOT NULL, tool TEXT NOT NULL, digest BLOB NOT NULL,
                PRIMARY KEY(day, tool, digest)
            ) WITHOUT ROWID;
            CREATE TABLE IF NOT EXISTS daily (
                day TEXT NOT NULL, tool TEXT NOT NULL, users INTEGER NOT NULL,
                PRIMARY KEY(day, tool)
            ) WITHOUT ROWID;
        """)
        conn.execute("INSERT OR IGNORE INTO coverage VALUES (1, ?)", (now().isoformat(timespec="seconds"),))

    @app.after_request
    def response_headers(response):
        response.headers["Cache-Control"] = "no-store"
        if request.path == "/api/usage/daily":
            response.headers["Access-Control-Allow-Origin"] = "*"
        elif request.headers.get("Origin") in TOOL_HOSTS.values():
            response.headers["Access-Control-Allow-Origin"] = request.headers["Origin"]
            response.headers["Vary"] = "Origin"
        return response

    @app.post("/api/usage/record")
    def record():
        if request.mimetype != "application/x-www-form-urlencoded":
            return "", 415
        tool = request.form.get("tool")
        origin = request.headers.get("Origin")
        if tool not in TOOL_HOSTS or (origin != TOOL_HOSTS[tool] and (tool, origin) != ("production", PORTAL)):
            return "", 403
        try:
            visitor = UUID(request.form.get("visitor", ""))
            if visitor.version != 4:
                return "", 400
        except ValueError:
            return "", 400
        day = now().date().isoformat()
        if request.form.get("day") != day:
            return "", 409
        key = hashlib.sha256(f"{day}/{tool}/{visitor}".encode("ascii")).digest()
        with closing(sqlite3.connect(db, timeout=5)) as conn, conn:
            conn.execute("DELETE FROM seen WHERE day < ?", (day,))
            inserted = conn.execute("INSERT OR IGNORE INTO seen VALUES (?,?,?)", (day, tool, key)).rowcount
            if inserted:
                conn.execute("""
                    INSERT INTO daily VALUES (?, ?, 1)
                    ON CONFLICT(day,tool) DO UPDATE SET users=users+1
                """, (day, tool))
        return "", 204

    @app.get("/api/usage/daily")
    def daily():
        current = now()
        today = current.date().isoformat()
        requested = request.args.get("date", today)
        try:
            if not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", requested):
                raise ValueError
            date.fromisoformat(requested)
        except ValueError:
            return jsonify(error="invalid_date"), 400
        with closing(sqlite3.connect(db)) as conn:
            start = conn.execute("SELECT started FROM coverage WHERE id=1").fetchone()[0]
            covered = start[:10] <= requested <= today
            counts = None
            if covered:
                counts = dict.fromkeys(TOOL_HOSTS, 0)
                counts.update(conn.execute("SELECT tool, users FROM daily WHERE day=?", (requested,)))
        return jsonify(date=requested, today=today, started_at=start, updated_at=current.isoformat(timespec="seconds"), counts=counts)

    return app
