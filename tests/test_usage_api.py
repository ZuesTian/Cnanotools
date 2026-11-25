import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from pathlib import Path
from uuid import uuid4

from server.usage_api import BEIJING, TOOL_HOSTS, create_app


class UsageTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.directory = Path(directory.name)
        self.time = datetime(2026, 11, 25, 23, 59, tzinfo=BEIJING)
        self.app = create_app(self.directory, clock=lambda: self.time)
        self.visitor = str(uuid4())

    def use(self, tool="uv", visitor=None, origin=None, day=None):
        return self.app.test_client().post("/api/usage/record", headers={"Origin": origin or TOOL_HOSTS[tool]},
            data={"tool": tool, "day": day or self.time.date().isoformat(), "visitor": visitor or self.visitor})

    def summary(self, day=None):
        return self.app.test_client().get("/api/usage/daily", query_string={"date": day} if day else {}).get_json()

    def test_daily_public_counts_and_concurrent_retries(self):
        self.assertEqual(self.summary()["counts"], dict.fromkeys(TOOL_HOSTS, 0))
        with ThreadPoolExecutor(8) as pool:
            statuses = list(pool.map(lambda _: self.use().status_code, range(16)))
        self.assertEqual(statuses, [204]*16)
        self.assertEqual(self.use(visitor=str(uuid4())).status_code, 204)
        self.assertEqual(self.use(tool="grain").status_code, 204)
        counts = self.summary()["counts"]
        self.assertEqual({**dict.fromkeys(TOOL_HOSTS, 0), "uv": 2, "grain": 1}, counts)
        self.assertNotIn(self.visitor, str(self.summary()))

    def test_new_beijing_day_and_service_restart(self):
        self.use()
        self.time += timedelta(minutes=2)
        self.assertEqual(self.summary()["counts"]["uv"], 0)
        self.assertEqual(self.use(day="2026-11-25").status_code, 409)
        self.use()
        self.app = create_app(self.directory, clock=lambda: self.time)
        self.use()
        self.assertEqual(self.summary()["counts"]["uv"], 1)
        self.assertEqual(self.summary("2026-11-25")["counts"]["uv"], 1)
        self.assertIsNone(self.summary("2026-11-24")["counts"])
        self.assertIsNone(self.summary("2026-11-27")["counts"])
        self.assertEqual(self.summary()["started_at"], "2026-11-25T23:59:00+08:00")

    def test_only_allowed_origins_and_valid_inputs(self):
        self.assertEqual(self.use(origin=TOOL_HOSTS["sem"]).status_code, 403)
        self.assertEqual(self.use(visitor="bad").status_code, 400)
        client = self.app.test_client()
        self.assertEqual(client.post("/api/usage/record", json={}).status_code, 415)
        self.assertEqual(client.get("/api/usage/daily?date=2026-02-30").status_code, 400)
        self.assertEqual(client.get("/api/usage/daily").headers["Access-Control-Allow-Origin"], "*")
        self.assertEqual(sum(self.summary()["counts"].values()), 0)
