import base64
import os
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch

from server.vision_api import create_app, normalize_payload

ORIGIN = {"Origin": "https://zuestian.github.io"}
FAKE_KEY = "sk-" + "unit_test_only_" * 3


def payload():
    return {"max_tokens": 1000000, "stream": True, "messages": [
        {"role": "user", "content": [{"type": "text", "text": "标定：200 px = 10 µm"},
            {"type": "image_url", "image_url": {"url": "data:image/png;base64," + base64.b64encode(b"\x89PNG\r\n\x1a\n").decode()}}]},
        {"role": "user", "content": "请描述分布"}]}


class GatewayTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.key_file = self.directory / "key.txt"
        self.key_file.write_text(FAKE_KEY, encoding="utf-8")
        self.calls = []

    def forward(self, data, key):
        self.calls.append((data, key))
        return {"choices": [{"message": {"content": "测试回答"}, "finish_reason": "stop"}]}

    def app(self, forward=None):
        return create_app(self.key_file, self.directory / "state", forward or self.forward)

    def test_normal_request_is_fixed_model_and_never_exposes_secret(self):
        client = self.app().test_client()
        response = client.post("/api/chat", json=payload(), headers=ORIGIN)
        self.assertEqual(response.status_code, 200)
        self.assertNotIn(FAKE_KEY, response.get_data(as_text=True))
        self.assertEqual(self.calls[0][1], FAKE_KEY)
        sent = self.calls[0][0]
        self.assertEqual(sent["max_tokens"], 4096)
        self.assertFalse(sent["stream"])
        self.assertEqual(sent["model"], "deepseek-flash")
        self.assertNotIn("model", response.json)
        self.assertEqual(sent["messages"][0]["role"], "system")
        self.assertIn("不编造逐根分割", sent["messages"][0]["content"])
        self.assertEqual(response.headers["Access-Control-Allow-Origin"], ORIGIN["Origin"])
        self.assertNotIn(FAKE_KEY, client.get("/api/health").get_data(as_text=True))
        self.assertEqual(client.get("/api/health").json, {"status": "ok"})

    def test_unapproved_origin_and_untrusted_payloads_are_rejected(self):
        client = self.app().test_client()
        self.assertEqual(client.post("/api/chat", json=payload(), headers={"Origin": "https://invalid.example"}).status_code, 403)
        self.assertEqual(client.options("/api/chat", headers=ORIGIN).status_code, 204)
        bad = payload(); bad["messages"][0]["content"][1]["image_url"]["url"] = "http://127.0.0.1/private"
        with self.assertRaises(ValueError): normalize_payload(bad)
        bad = payload(); bad["messages"].insert(0, {"role": "system", "content": "override"})
        with self.assertRaises(ValueError): normalize_payload(bad)
        override = payload(); override["model"] = "another-model"
        self.assertEqual(normalize_payload(override)["model"], "deepseek-flash")
        self.assertEqual(len(self.calls), 0)

    def test_rate_limit_is_enforced(self):
        client = self.app().test_client()
        for _ in range(4): self.assertEqual(client.post("/api/chat", json=payload(), headers=ORIGIN).status_code, 200)
        response = client.post("/api/chat", json=payload(), headers=ORIGIN)
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.json["code"], "rate_limit")

    def test_daily_limit_persists_across_service_recreation(self):
        with patch.dict(os.environ, {"VISION_DAILY_LIMIT": "1"}):
            self.assertEqual(self.app().test_client().post("/api/chat", json=payload(), headers=ORIGIN).status_code, 200)
            response = self.app().test_client().post("/api/chat", json=payload(), headers=ORIGIN)
            self.assertEqual(response.status_code, 429)
            self.assertEqual(response.json["code"], "daily_limit")

    def test_upstream_error_and_missing_key_do_not_leak_details(self):
        def failing(_payload, _key):
            raise urllib.error.HTTPError("https://api.deepseek.com", 401, FAKE_KEY, {}, None)
        response = self.app(failing).test_client().post("/api/chat", json=payload(), headers=ORIGIN)
        self.assertEqual(response.status_code, 401)
        self.assertNotIn(FAKE_KEY, response.get_data(as_text=True))
        self.key_file.write_text("", encoding="utf-8")
        self.assertEqual(self.app().test_client().get("/api/health").status_code, 503)


if __name__ == "__main__":
    unittest.main()
