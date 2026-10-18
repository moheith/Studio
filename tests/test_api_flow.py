"""Mocked account-to-private-game flow; no Google, Gemini, MongoDB, or R2 calls."""
import tempfile
import asyncio
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx

from backend import app as service

if hasattr(asyncio, "WindowsSelectorEventLoopPolicy"):
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


class MockProviderClient:
    def __init__(self, *args, **kwargs): pass
    async def __aenter__(self): return self
    async def __aexit__(self, *args): return None
    async def get(self, url, **kwargs):
        return httpx.Response(200, json={"models": [{"name": "models/mock-game-model", "displayName": "Mock Game Model", "supportedGenerationMethods": ["generateContent"]}]})
    async def post(self, url, **kwargs): return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": "OK"}]}}]})
    def stream(self, *args, **kwargs): return MockGenerateStream()


class MockGenerateStream:
    status_code = 200
    async def __aenter__(self): return self
    async def __aexit__(self, *args): return None
    async def aiter_lines(self):
        yield 'data: {"candidates":[{"content":{"parts":[{"text":"I updated your game."}]}}]}'
        yield "data: [DONE]"


class AccountProjectFlow(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = service.Store()
        service.store = self.store
        service.files_store.s3 = None
        service.files_store.local_root = Path(self.temp.name).resolve()
        self.transport = httpx.ASGITransport(app=service.app)
        self.client = httpx.AsyncClient(transport=self.transport, base_url="http://testserver")
        self.provider_patch = patch.object(service.httpx, "AsyncClient", MockProviderClient)
        self.provider_patch.start()

    async def asyncTearDown(self):
        self.provider_patch.stop()
        await self.client.aclose()
        self.temp.cleanup()

    async def test_signup_key_project_preview_and_path_boundary(self):
        signup = await self.client.post("/api/auth/register", json={"email": "maker@example.com", "password": "correct-horse-battery"})
        self.assertEqual(signup.status_code, 200)
        code = signup.json()["development_code"]
        verified = await self.client.post("/api/auth/verify-email", json={"email": "maker@example.com", "code": code})
        self.assertEqual(verified.status_code, 200)
        csrf = verified.json()["csrf_token"]
        headers = {"X-CSRF-Token": csrf}
        username = await self.client.put("/api/profile/username", headers=headers, json={"username": "maker_one"})
        self.assertEqual(username.status_code, 200)

        with patch.object(service.httpx, "AsyncClient", MockProviderClient):
            key = await self.client.post("/api/keys/gemini", headers=headers, json={"api_key": "mock-gemini-api-key"})
        self.assertEqual(key.status_code, 200)
        models = await self.client.get("/api/models")
        self.assertEqual(models.json()["models"][0]["id"], "mock-game-model")

        created = await self.client.post("/api/projects", headers=headers, json={"title": "My First Game", "visibility": "private"})
        self.assertEqual(created.status_code, 200)
        project_id = created.json()["project"]["id"]
        files = await self.client.get(f"/api/projects/{project_id}/files")
        self.assertEqual(files.status_code, 200)
        self.assertIn("index.html", [item["path"] for item in files.json()["files"]])

        ai = await self.client.post(f"/api/projects/{project_id}/ai/stream", headers=headers, json={"prompt": "Add a score counter", "model": "mock-game-model"})
        self.assertEqual(ai.status_code, 200)
        self.assertIn("I updated your game.", ai.text)

        source = await self.client.get(f"/api/projects/{project_id}/files/index.html")
        self.assertEqual(source.status_code, 200)
        self.assertTrue(source.headers.get("etag"))
        app_source = await self.client.get(f"/api/projects/{project_id}/files/app.js")
        saved = await self.client.put(f"/api/projects/{project_id}/files/app.js", headers={**headers, "If-Match": app_source.headers["etag"]}, json={"content": "document.body.textContent = 'Saved';"})
        self.assertEqual(saved.status_code, 200)
        asset = await self.client.put(f"/api/projects/{project_id}/assets/images/pixel.png", headers={**headers, "Content-Type": "image/png"}, content=b"fake image bytes")
        self.assertEqual(asset.status_code, 200)
        traversal = await self.client.put(f"/api/projects/{project_id}/files/%2E%2E%2Foutside.js", headers=headers, json={"content": "bad"})
        self.assertEqual(traversal.status_code, 400)

        preview = await self.client.post(f"/api/projects/{project_id}/preview-token", headers=headers, json={})
        self.assertEqual(preview.status_code, 200)
        self.assertIn("/api/worker/private/", preview.json()["url"])
        self.assertEqual((await self.client.get(preview.json()["url"].replace("http://localhost:8000", ""))).status_code, 200)
        published = await self.client.patch(f"/api/projects/{project_id}/visibility", headers=headers, json={"visibility": "public"})
        self.assertEqual(published.status_code, 200)
        self.assertIn("/maker_one/my-first-game/", published.json()["url"])
        gallery = await self.client.get("/api/gallery")
        self.assertEqual(gallery.json()["projects"][0]["id"], project_id)

    async def test_memory_rate_limit_counts_requests(self):
        await service.rate_limit("smoke", "tester", 1)
        with self.assertRaises(service.HTTPException) as error:
            await service.rate_limit("smoke", "tester", 1)
        self.assertEqual(error.exception.status_code, 429)


if __name__ == "__main__":
    unittest.main()
