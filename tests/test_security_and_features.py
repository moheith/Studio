"""Comprehensive security, bug-regression, Gemini 3.x compliance, and feature test suite."""
from __future__ import annotations

import asyncio
import base64
import copy
import json
import tempfile
from pathlib import Path
from unittest.mock import patch

import httpx
import pytest
import pytest_asyncio
from cryptography.fernet import Fernet

from backend import app as service
from backend.ai_tools import (
    analyze_project_diagnostics,
    apply_search_replace,
    build_thinking_config,
    normalize_model_id,
    normalize_waterfall,
    safe_url_fetch,
)
from backend.security import KeyCipher, safe_relative_path


class CapturingMockClient:
    """Mock httpx client capturing Gemini requests to verify dynamic model discovery, Antigravity & thinkingConfig."""
    last_requests: list[dict] = []
    call_index: int = 0
    mode: str = "simple"

    def __init__(self, *args, **kwargs): pass
    async def __aenter__(self): return self
    async def __aexit__(self, *args): return None

    async def get(self, url, **kwargs):
        params = kwargs.get("params") or {}
        if params.get("pageToken") == "page-2":
            return httpx.Response(200, json={
                "models": [
                    {"name": "models/gemini-9.9-ultra", "displayName": "Gemini 9.9 Ultra", "supportedGenerationMethods": ["generateContent"], "inputTokenLimit": 2000000, "thinking": True},
                    {"name": "models/gemma-4-31b-it", "displayName": "Gemma 4 31B", "supportedGenerationMethods": ["generateContent"]},
                    {"name": "models/imagen-4.0-generate", "displayName": "Imagen 4", "supportedGenerationMethods": ["generateContent"]},
                ]
            })
        return httpx.Response(200, json={
            "models": [
                {"name": "models/gemini-2.5-pro", "displayName": "Gemini 2.5 Pro", "supportedGenerationMethods": ["generateContent"], "inputTokenLimit": 1048576, "thinking": True},
                {"name": "models/gemini-2.5-flash", "displayName": "Gemini 2.5 Flash", "supportedGenerationMethods": ["generateContent"]},
                {"name": "models/gemini-3.8-flash", "displayName": "Gemini 3.8 Flash", "supportedGenerationMethods": ["generateContent"], "inputTokenLimit": 1048576, "thinking": True},
                {"name": "models/gemini-3.8-flash-tts", "displayName": "Gemini 3.8 Flash TTS", "supportedGenerationMethods": ["generateContent"]},
                {"name": "models/text-embedding-004", "displayName": "Text Embedding", "supportedGenerationMethods": ["embedContent"]},
            ],
            "nextPageToken": "page-2",
        })

    async def post(self, url, **kwargs):
        CapturingMockClient.last_requests.append({"url": url, "json": copy.deepcopy(kwargs.get("json"))})
        if url.endswith("/interactions"):
            model = (kwargs.get("json") or {}).get("model", "")
            if "tts" in model:
                wav_b64 = base64.b64encode(b"RIFF\x24\x00\x00\x00WAVEfmt ").decode()
                return httpx.Response(200, json={"steps": [{"type": "model_output", "content": [{"type": "audio", "data": wav_b64, "mime_type": "audio/wav"}]}]})
            png_b64 = base64.b64encode(b"\x89PNG\r\n\x1a\nfake-png").decode()
            return httpx.Response(200, json={"steps": [{"type": "model_output", "content": [{"type": "image", "data": png_b64, "mime_type": "image/png"}]}]})
        return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": "OK"}]}}]})

    def stream(self, method, url, **kwargs):
        CapturingMockClient.last_requests.append({"url": url, "json": copy.deepcopy(kwargs.get("json"))})
        idx = CapturingMockClient.call_index
        CapturingMockClient.call_index += 1
        return _MockStream(CapturingMockClient.mode, idx)


class _MockStream:
    status_code = 200
    def __init__(self, mode: str, idx: int):
        self.mode = mode
        self.idx = idx
    async def __aenter__(self): return self
    async def __aexit__(self, *args): return None
    async def aiter_lines(self):
        if self.mode == "edit_with_thought_sig" and self.idx == 0:
            payload = {
                "candidates": [{
                    "content": {
                        "parts": [
                            {"thought": True, "text": "Patching app.js cleanly", "thoughtSignature": "ENC_SIG_ABC123"},
                            {"functionCall": {"name": "edit_file", "args": {"path": "app.js", "search": "Yulya Studio project ready!", "replace": "Patched cleanly!"}}},
                        ]
                    }
                }]
            }
            yield "data: " + json.dumps(payload)
        elif self.mode == "inspect_vision" and self.idx == 0:
            payload = {"candidates": [{"content": {"parts": [{"functionCall": {"name": "inspect_game_screen", "args": {"device_mode": "desktop"}}}]}}]}
            yield "data: " + json.dumps(payload)
        elif self.mode == "antigravity_power_tools" and self.idx == 0:
            payload = {
                "candidates": [{
                    "content": {
                        "parts": [
                            {"thought": True, "text": "Batch patching + creating art & voice assets", "thoughtSignature": "AG_SIG_99"},
                            {"functionCall": {"name": "batch_edit_files", "args": {"edits": [{"path": "app.js", "search": "Patched cleanly!", "replace": "Antigravity upgraded!"}]}}},
                            {"functionCall": {"name": "generate_image_asset", "args": {"path": "assets/boss.png", "prompt": "neon dragon boss sprite", "aspect_ratio": "1:1"}}},
                            {"functionCall": {"name": "generate_audio_asset", "args": {"path": "assets/audio/go.wav", "text": "Ready, go!", "voice": "Kore"}}},
                            {"functionCall": {"name": "read_file_lines", "args": {"path": "index.html", "start_line": 1, "end_line": 10}}},
                            {"functionCall": {"name": "regex_search", "args": {"pattern": "Antigravity"}}},
                            {"functionCall": {"name": "list_assets", "args": {}}},
                            {"functionCall": {"name": "check_project_diagnostics", "args": {}}},
                            {"functionCall": {"name": "update_project_metadata", "args": {"description": "Upgraded by chat tools!", "genre": "ACTION"}}},
                        ]
                    }
                }]
            }
            yield "data: " + json.dumps(payload)
        else:
            yield 'data: {"candidates":[{"content":{"parts":[{"text":"All done!"}]}}]}'
        yield "data: [DONE]"


@pytest_asyncio.fixture
async def clients():
    temp = tempfile.TemporaryDirectory()
    service.store = service.Store()
    service.files_store.s3 = None
    service.files_store.local_root = Path(temp.name).resolve()
    CapturingMockClient.last_requests = []
    CapturingMockClient.call_index = 0
    CapturingMockClient.mode = "simple"

    transport = httpx.ASGITransport(app=service.app)
    app_client = httpx.AsyncClient(transport=transport, base_url="http://testserver")
    app_client2 = httpx.AsyncClient(transport=transport, base_url="http://testserver")
    play_client = httpx.AsyncClient(transport=transport, base_url="http://play.testserver")
    with patch.object(service.httpx, "AsyncClient", CapturingMockClient), patch("backend.ai_tools.httpx.AsyncClient", CapturingMockClient):
        yield app_client, app_client2, play_client
    await app_client.aclose()
    await app_client2.aclose()
    await play_client.aclose()
    temp.cleanup()


async def _signup_user(client: httpx.AsyncClient, email: str, username: str | None = None, connect_key: bool = False) -> dict:
    r1 = await client.post("/api/auth/register", json={"email": email, "password": "StrongPassword#2026"})
    assert r1.status_code == 200
    r2 = await client.post("/api/auth/verify-email", json={"email": email, "code": r1.json()["development_code"]})
    assert r2.status_code == 200
    csrf = r2.json()["csrf_token"]
    headers = {"X-CSRF-Token": csrf}
    if username:
        r3 = await client.put("/api/profile/username", headers=headers, json={"username": username})
        assert r3.status_code == 200
    if connect_key:
        r4 = await client.post("/api/keys/gemini", headers=headers, json={"api_key": f"AIzaFakeKey_{email}_123456"})
        assert r4.status_code == 200
    return {"csrf": csrf, "headers": headers, "user": r2.json()["user"]}


@pytest.mark.asyncio
async def test_origin_isolation_blocks_account_takeover(clients):
    app_client, _, play_client = clients
    auth = await _signup_user(app_client, "alice@test.dev", username="alice_dev", connect_key=True)
    proj = (await app_client.post("/api/projects", headers=auth["headers"], json={"title": 'Evil"><script>alert(1)</script>', "visibility": "public", "template_id": "canvas-arcade"})).json()["project"]
    pid = proj["id"]
    slug = proj["slug"]

    # 1. Play host MUST block /api/auth/me, /api/projects, and POST mutations
    assert (await play_client.get("/api/auth/me")).status_code == 404
    assert (await play_client.get("/api/projects")).status_code == 404
    assert (await play_client.post("/api/auth/logout")).status_code == 405
    assert "Disallow: /" in (await play_client.get("/robots.txt")).text

    # 2. Studio host MUST block raw user game execution on /api/games and /api/worker/private
    assert (await app_client.get(f"/api/games/alice_dev/{slug}/index.html")).status_code == 403
    assert (await app_client.get(f"/alice_dev/{slug}/app.js")).status_code == 404

    # 3. Studio host returns strict security headers + TrustedHost rejects unknown Host
    me_resp = await app_client.get("/api/auth/me")
    assert me_resp.headers["x-frame-options"] == "DENY"
    assert me_resp.headers["x-content-type-options"] == "nosniff"
    assert "frame-ancestors 'none'" in me_resp.headers["content-security-policy"]
    bad_host = await app_client.get("/api/health", headers={"Host": "evil-phish.example"})
    assert bad_host.status_code == 400

    # 4. Play host serves game HTML with escaped title (SEC-03), origin-locked postMessage, and strict CSP
    game_resp = await play_client.get(f"/alice_dev/{slug}")
    assert game_resp.status_code == 200
    assert "set-cookie" not in game_resp.headers
    assert "form-action 'none'" in game_resp.headers["content-security-policy"]
    assert "object-src 'none'" in game_resp.headers["content-security-policy"]
    assert game_resp.headers["referrer-policy"] == "no-referrer"
    assert 'content="Evil&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;' in game_resp.text
    assert 'TARGET_ORIGIN = "http://testserver"' in game_resp.text
    assert "postMessage(" in game_resp.text
    assert ", '*')" not in game_resp.text

    # 5. SVG uploaded to project is sandboxed on play origin
    await app_client.put(f"/api/projects/{pid}/files/icon.svg", headers=auth["headers"], json={"content": "<svg onload=alert(1)></svg>"})
    svg_resp = await play_client.get(f"/alice_dev/{slug}/icon.svg")
    assert svg_resp.status_code == 200
    assert "sandbox" in svg_resp.headers["content-security-policy"]

    # 6. /docs MUST NOT be hijacked by FastAPI Swagger UI
    docs_resp = await app_client.get("/docs")
    assert "Swagger UI" not in docs_resp.text


@pytest.mark.asyncio
async def test_concurrent_onboarding_and_key_disconnect_no_sparse_null_crash(clients):
    app_client, c2, _ = clients
    # Two users register WITHOUT choosing usernames yet (used to crash on sparse username=None!)
    u1 = await _signup_user(app_client, "u1@test.dev", username=None, connect_key=False)
    u2 = await _signup_user(c2, "u2@test.dev", username=None, connect_key=False)
    assert u1["user"]["id"] != u2["user"]["id"]
    # Both connect & disconnect keys (used to crash on 2nd disconnect setting api_key_fingerprint=None!)
    await app_client.put("/api/profile/username", headers=u1["headers"], json={"username": "user_one"})
    await c2.put("/api/profile/username", headers=u2["headers"], json={"username": "user_two"})
    await app_client.post("/api/keys/gemini", headers=u1["headers"], json={"api_key": "AIzaKeyOne1234567890"})
    await c2.post("/api/keys/gemini", headers=u2["headers"], json={"api_key": "AIzaKeyTwo1234567890"})
    d1 = await app_client.delete("/api/keys/gemini", headers=u1["headers"])
    d2 = await c2.delete("/api/keys/gemini", headers=u2["headers"])
    assert d1.status_code == 200 and d2.status_code == 200


def test_key_cipher_aes256gcm_rotation_and_legacy_fernet():
    old_secret = "old-secret-material-at-least-32-chars-long"
    new_secret = "new-secret-material-at-least-32-chars-long"
    cipher = KeyCipher(new_secret, previous_secret=old_secret)
    ct = cipher.encrypt("AIzaSuperSecretKey", user_id="user_abc")
    assert ct.startswith("v2:")
    assert cipher.decrypt(ct, user_id="user_abc") == "AIzaSuperSecretKey"
    # Wrong AAD (different user_id) must fail decryption
    with pytest.raises(Exception):
        cipher.decrypt(ct, user_id="user_other")
    # Legacy Fernet ciphertext encrypted with previous_secret decrypts cleanly
    legacy_key = base64.urlsafe_b64encode(__import__("hashlib").sha256(old_secret.encode()).digest())
    legacy_ct = Fernet(legacy_key).encrypt(b"AIzaLegacyKey").decode()
    assert cipher.decrypt(legacy_ct, user_id="user_abc") == "AIzaLegacyKey"


def test_safe_relative_path_rejects_injection_chars():
    assert safe_relative_path("src/App.tsx") == "src/App.tsx"
    for bad in ['bad"quote.js', "bad<tag>.js", "bad'tick.js", "../escape.js", ".env"]:
        with pytest.raises(service.HTTPException):
            safe_relative_path(bad)


@pytest.mark.asyncio
async def test_bug_regressions_llms_at_profile_thumbnail_plays_and_slug(clients):
    app_client, _, _ = clients
    # BUG-01: /llms.txt and /llms-full.txt must not throw NameError(STATIC_DIR)
    assert (await app_client.get("/llms.txt")).status_code == 200
    assert (await app_client.get("/llms-full.txt")).status_code == 200

    auth = await _signup_user(app_client, "bob@test.dev", username="bob_maker", connect_key=True)
    # BUG-02: /api/profiles/@bob_maker works identically to /api/profiles/bob_maker
    assert (await app_client.get("/api/profiles/@bob_maker")).status_code == 200
    assert (await app_client.get("/api/profiles/bob_maker")).status_code == 200

    proj = (await app_client.post("/api/projects", headers=auth["headers"], json={"title": "Neon Run", "visibility": "public", "template_id": "react-ts-tailwind"})).json()["project"]
    pid, slug = proj["id"], proj["slug"]

    # BUG-05: Querying by slug uses canonical project["id"]
    slug_files = await app_client.get(f"/api/projects/{slug}/files")
    assert slug_files.status_code == 200
    assert "App.tsx" in [f["path"] for f in slug_files.json()["files"]]

    # SEC-08: Thumbnail stored via data URI is returned as cached URL in /api/gallery, NOT raw base64
    tiny_png = "data:image/png;base64," + base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"0" * 32).decode()
    up_thumb = await app_client.post(f"/api/projects/{pid}/thumbnail", headers=auth["headers"], json={"thumbnail": tiny_png})
    assert up_thumb.status_code == 200
    gal = (await app_client.get("/api/gallery")).json()["projects"]
    assert gal[0]["thumbnail"].startswith(f"/api/projects/{pid}/thumbnail")
    assert not gal[0]["thumbnail"].startswith("data:image/")
    thumb_bin = await app_client.get(gal[0]["thumbnail"])
    assert thumb_bin.status_code == 200 and thumb_bin.headers["content-type"] == "image/png"
    etag = thumb_bin.headers["etag"]
    assert (await app_client.get(gal[0]["thumbnail"], headers={"If-None-Match": etag})).status_code == 304

    # BUG-03: Play count dedupes repeated rapid calls from same IP
    p1 = await app_client.post(f"/api/games/bob_maker/{slug}/play")
    p2 = await app_client.post(f"/api/games/bob_maker/{slug}/play")
    assert p1.json()["plays"] == 1 and p1.json()["deduped"] is False
    assert p2.json()["plays"] == 1 and p2.json()["deduped"] is True


@pytest.mark.asyncio
async def test_gemini_chat_tools_multimodal_media_and_no_checkpoints(clients):
    app_client, _, _ = clients
    # User-chosen paid/legacy model IDs MUST be preserved verbatim (never force-remapped!)
    assert normalize_model_id("models/gemini-2.5-pro") == "gemini-2.5-pro"
    assert normalize_waterfall(["gemini-2.5-pro", "gemini-3.7-flash", "gemini-3.5-flash-lite"]) == [
        "gemini-2.5-pro", "gemini-3.7-flash", "gemini-3.5-flash-lite"
    ]
    # Adaptive thinkingConfig per generation
    assert build_thinking_config("gemini-3.8-flash", True, False) == {"includeThoughts": True, "thinkingLevel": "high"}
    assert build_thinking_config("gemini-2.5-pro", True, False) == {"includeThoughts": True}
    assert build_thinking_config("gemini-2.0-flash", True, False) is None
    assert build_thinking_config("gemma-4-31b-it", True, False) is None

    # Static diagnostics catches missing assets & invalid JSON cleanly
    diag = analyze_project_diagnostics({"index.html": '<script src="missing.js"></script>', "data.json": "{bad"}, ["index.html", "data.json"])
    assert diag["ok"] is False and diag["error_count"] >= 1 and diag["warning_count"] >= 1

    # SSRF protection in safe_url_fetch blocks localhost & AWS/GCP metadata IPs
    for blocked in ("http://127.0.0.1/secret", "http://localhost:8000/api/health", "http://169.254.169.254/latest/meta-data/", "file:///etc/passwd"):
        with pytest.raises(service.HTTPException):
            await safe_url_fetch(blocked)

    patched, n = apply_search_replace("const x = 1;\nconst y = 2;\n", "const x = 1;", "const x = 42;")
    assert n == 1 and "const x = 42;" in patched

    auth = await _signup_user(app_client, "dev@test.dev", username="dev_pro", connect_key=True)
    proj = (await app_client.post("/api/projects", headers=auth["headers"], json={"title": "AI Test", "visibility": "private"})).json()["project"]
    pid = proj["id"]

    # Checkpoints endpoints MUST be removed (404)
    assert (await app_client.get(f"/api/projects/{pid}/checkpoints")).status_code == 404

    # 1. Build mode: paid/legacy model preserved verbatim + edit_file + user image attachment forwarded + NO checkpoints + NO temperature
    tiny_png = "data:image/png;base64," + base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"0" * 32).decode()
    CapturingMockClient.mode = "edit_with_thought_sig"
    CapturingMockClient.call_index = 0
    CapturingMockClient.last_requests = []
    res = await app_client.post(
        f"/api/projects/{pid}/ai/stream",
        headers=auth["headers"],
        json={"prompt": "Update log text based on this screenshot", "model": "gemini-2.5-pro", "antigravity": True, "mode": "build", "images": [tiny_png]},
    )
    assert res.status_code == 200
    assert "event: checkpoint" not in res.text
    assert len(CapturingMockClient.last_requests) >= 2
    first_req = CapturingMockClient.last_requests[0]
    assert "gemini-2.5-pro" in first_req["url"]  # user's chosen paid model preserved verbatim!
    assert "temperature" not in json.dumps(first_req["json"])
    assert first_req["json"]["generationConfig"]["thinkingConfig"] == {"includeThoughts": True}
    # User image attached as multimodal inlineData!
    assert "inlineData" in json.dumps(first_req["json"]["contents"][-1])
    second_req = CapturingMockClient.last_requests[1]
    assert "ENC_SIG_ABC123" in json.dumps(second_req["json"])  # thoughtSignature preserved!
    assert "Patched cleanly!" in (await app_client.get(f"/api/projects/{pid}/files/app.js")).text

    # 2. Standard Chat (antigravity=False!) ALSO has Nano Banana 2.1 + Gemini 3.8 TTS + batch_edit + diagnostics + inline event: media!
    CapturingMockClient.mode = "antigravity_power_tools"
    CapturingMockClient.call_index = 0
    CapturingMockClient.last_requests = []
    chat_res = await app_client.post(
        f"/api/projects/{pid}/ai/stream",
        headers=auth["headers"],
        json={"prompt": "Generate boss art, voice line, run diagnostics, and update description", "model": "gemini-3.8-flash", "antigravity": False, "mode": "build"},
    )
    assert chat_res.status_code == 200
    assert "event: media" in chat_res.text
    assert '"kind": "image"' in chat_res.text and '"kind": "audio"' in chat_res.text
    assert "Antigravity upgraded!" in (await app_client.get(f"/api/projects/{pid}/files/app.js")).text
    assert (await app_client.get(f"/api/projects/{pid}/files/assets/boss.png")).status_code == 200
    assert (await app_client.get(f"/api/projects/{pid}/files/assets/audio/go.wav")).status_code == 200
    # Persisted media metadata in AI history for inline replay!
    hist = (await app_client.get(f"/api/projects/{pid}/ai/history")).json()["conversations"]
    assert any(len(c.get("media") or []) == 2 for c in hist)

    # 3. Antigravity Auto dynamically resolves newest live model (gemini-9.9-ultra from page 2!) + high thinking + url_fetch
    CapturingMockClient.mode = "simple"
    CapturingMockClient.call_index = 0
    CapturingMockClient.last_requests = []
    ag_res = await app_client.post(f"/api/projects/{pid}/ai/stream", headers=auth["headers"], json={"prompt": "Review architecture", "model": "antigravity-auto", "antigravity": True, "mode": "build"})
    assert ag_res.status_code == 200
    assert "gemini-9.9-ultra" in CapturingMockClient.last_requests[0]["url"]
    assert CapturingMockClient.last_requests[0]["json"]["generationConfig"]["thinkingConfig"] == {"includeThoughts": True, "thinkingLevel": "high"}
    ag_tool_names = [t["name"] for t in CapturingMockClient.last_requests[0]["json"]["tools"][0]["functionDeclarations"]]
    for expected_tool in ("generate_image_asset", "generate_audio_asset", "read_file_lines", "regex_search", "list_assets", "check_project_diagnostics", "evaluate_in_preview", "capture_cover_snapshot", "update_project_metadata", "url_fetch", "search_grounding"):
        assert expected_tool in ag_tool_names

    # 4. Plan mode exposes read-only tools only
    CapturingMockClient.mode = "simple"
    CapturingMockClient.call_index = 0
    CapturingMockClient.last_requests = []
    await app_client.post(f"/api/projects/{pid}/ai/stream", headers=auth["headers"], json={"prompt": "Plan a level system", "model": "gemini-3.8-flash", "mode": "plan"})
    declared_names = [t["name"] for t in CapturingMockClient.last_requests[0]["json"]["tools"][0]["functionDeclarations"]]
    assert "read_file" in declared_names and "read_file_lines" in declared_names and "check_project_diagnostics" in declared_names
    assert "write_file" not in declared_names and "edit_file" not in declared_names and "generate_image_asset" not in declared_names


@pytest.mark.asyncio
async def test_dynamic_models_pagination_sitemap_and_robots(clients):
    app_client, _, play_client = clients
    auth = await _signup_user(app_client, "seo@test.dev", username="seo_dev", connect_key=True)

    # 1. /api/models fetches ALL pages (including newly launched models on page 2) & excludes non-chat models
    m_resp = await app_client.get("/api/models")
    assert m_resp.status_code == 200
    assert m_resp.headers.get("cache-control") == "no-store"
    ids = [m["id"] for m in m_resp.json()["models"]]
    assert ids[0] == "antigravity-auto"
    assert ids[1] == "gemini-9.9-ultra"  # brand-new model on page 2 automatically sorted to top!
    assert "gemini-2.5-pro" in ids and "gemini-2.5-flash" in ids and "gemma-4-31b-it" in ids
    assert "text-embedding-004" not in ids and "imagen-4.0-generate" not in ids and "gemini-3.8-flash-tts" not in ids

    # 2. Public project appears in dynamic /sitemap.xml alongside /@seo_dev profile & core routes
    proj = (await app_client.post("/api/projects", headers=auth["headers"], json={"title": "Galaxy Drift", "visibility": "public"})).json()["project"]
    sm = await app_client.get("/sitemap.xml")
    assert sm.status_code == 200
    assert "/templates</loc>" in sm.text
    assert "/llms.txt</loc>" in sm.text
    assert f"/seo_dev/{proj['slug']}</loc>" in sm.text
    assert "/@seo_dev</loc>" in sm.text
    assert "<lastmod>" in sm.text
    assert (await app_client.head("/sitemap.xml")).status_code == 200

    # 3. /robots.txt properly protects private routes on studio origin and blocks indexing on play origin
    rb = await app_client.get("/robots.txt")
    assert rb.status_code == 200
    assert "Disallow: /*/edit" in rb.text
    assert "Disallow: /__preview/" in rb.text
    assert "Disallow: /settings" in rb.text
    assert "User-agent: OAI-SearchBot" in rb.text
    assert "Sitemap:" in rb.text
    assert (await app_client.head("/robots.txt")).status_code == 200
    play_rb = await play_client.get("/robots.txt")
    assert play_rb.status_code == 200 and "Disallow: /" in play_rb.text


@pytest.mark.asyncio
async def test_community_arcade_and_account_security_lifecycle(clients):
    app_client, _, _ = clients
    creator = await _signup_user(app_client, "creator@test.dev", username="indie_dev", connect_key=True)
    proj = (await app_client.post("/api/projects", headers=creator["headers"], json={"title": "Sky Hopper", "visibility": "public"})).json()["project"]
    pid, slug = proj["id"], proj["slug"]

    # Like, Comment, Leaderboard Score, Abuse Report
    lk = await app_client.post(f"/api/games/indie_dev/{slug}/like", headers=creator["headers"])
    assert lk.status_code == 200 and lk.json()["liked"] is True
    cm = await app_client.post(f"/api/games/indie_dev/{slug}/comments", headers=creator["headers"], json={"body": "Super fun!"})
    assert cm.status_code == 200
    sc = await app_client.post(f"/api/games/indie_dev/{slug}/scores", json={"score": 950, "player_name": "Ace"})
    assert sc.status_code == 200
    lb = await app_client.get(f"/api/games/indie_dev/{slug}/scores")
    assert lb.json()["scores"][0]["score"] == 950
    rp = await app_client.post(f"/api/games/indie_dev/{slug}/report", json={"reason": "other", "details": "Test report"})
    assert rp.status_code == 200 and rp.json()["reported"] is True

    # Opt-in Remix: blocked by default (403), succeeds when creator enables allow_remix
    assert (await app_client.post(f"/api/games/indie_dev/{slug}/remix", headers=creator["headers"])).status_code == 403
    await app_client.patch(f"/api/projects/{pid}/details", headers=creator["headers"], json={"title": "Sky Hopper", "description": "Jump!", "genre": "ARCADE", "allow_remix": True})
    rmx = await app_client.post(f"/api/games/indie_dev/{slug}/remix", headers=creator["headers"])
    assert rmx.status_code == 200 and "(Remix)" in rmx.json()["project"]["title"]

    # Active sessions, Change password, Forgot/Reset password, GDPR Account Deletion
    sess = await app_client.get("/api/auth/sessions")
    assert sess.status_code == 200 and len(sess.json()["sessions"]) >= 1
    chg = await app_client.post("/api/auth/change-password", headers=creator["headers"], json={"current_password": "StrongPassword#2026", "new_password": "NewStrongPassword#2027"})
    assert chg.status_code == 200
    fp = await app_client.post("/api/auth/forgot-password", json={"email": "creator@test.dev"})
    assert fp.status_code == 200 and fp.json().get("development_code")
    rp_res = await app_client.post("/api/auth/reset-password", json={"email": "creator@test.dev", "code": fp.json()["development_code"], "new_password": "ResetPassword#2028"})
    assert rp_res.status_code == 200
    # Re-login with reset password and permanently delete account
    lg = await app_client.post("/api/auth/login", json={"email": "creator@test.dev", "password": "ResetPassword#2028"})
    assert lg.status_code == 200
    del_acc = await app_client.request("DELETE", "/api/account", headers={"X-CSRF-Token": lg.json()["csrf_token"]}, json={"password": "ResetPassword#2028"})
    assert del_acc.status_code == 200 and del_acc.json()["deleted"] is True
    assert (await app_client.get("/api/auth/me")).status_code == 401


@pytest.mark.asyncio
async def test_multimodal_inspect_game_screen_tool_broker_roundtrip(clients):
    app_client, _, _ = clients
    auth = await _signup_user(app_client, "vision@test.dev", username="vis_dev", connect_key=True)
    proj = (await app_client.post("/api/projects", headers=auth["headers"], json={"title": "Vision Game", "visibility": "private"})).json()["project"]
    pid = proj["id"]

    CapturingMockClient.mode = "inspect_vision"
    CapturingMockClient.call_index = 0
    CapturingMockClient.last_requests = []

    sample_png = "data:image/png;base64," + base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"X" * 64).decode()

    async def responder():
        # Wait until stream registers the vision call_id, then post screenshot back as browser would
        for _ in range(40):
            if service.vision_broker._pending:
                cid = next(iter(service.vision_broker._pending.keys()))
                r = await app_client.post(
                    f"/api/projects/{pid}/ai/tool-result/{cid}",
                    headers=auth["headers"],
                    json={"dataUrl": sample_png, "width": 1280, "height": 720, "consoleErrors": [{"level": "error", "message": "Test err"}], "domElements": [{"tag": "button", "text": "Play"}]},
                )
                assert r.status_code == 200 and r.json()["accepted"] is True
                return
            await asyncio.sleep(0.05)

    resp_task = asyncio.create_task(responder())
    stream_res = await app_client.post(f"/api/projects/{pid}/ai/stream", headers=auth["headers"], json={"prompt": "Inspect my game screen", "model": "gemini-3.8-flash"})
    await resp_task
    assert stream_res.status_code == 200
    assert len(CapturingMockClient.last_requests) >= 2
    second_payload = json.dumps(CapturingMockClient.last_requests[1]["json"])
    assert "inlineData" in second_payload
    assert "Test err" in second_payload
    assert '"visual_attached": true' in second_payload

