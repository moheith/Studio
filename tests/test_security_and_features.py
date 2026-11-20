"""Comprehensive security, bug-regression, Gemini 3.x compliance, and feature test suite."""
from __future__ import annotations

import asyncio
import base64
import json
import tempfile
from pathlib import Path
from unittest.mock import patch

import httpx
import pytest
import pytest_asyncio
from cryptography.fernet import Fernet

from backend import app as service
from backend.ai_tools import apply_search_replace, normalize_waterfall
from backend.security import KeyCipher, safe_relative_path


class CapturingMockClient:
    """Mock httpx client capturing Gemini requests to verify Gemini 3.x spec compliance."""
    last_requests: list[dict] = []
    call_index: int = 0
    mode: str = "simple"

    def __init__(self, *args, **kwargs): pass
    async def __aenter__(self): return self
    async def __aexit__(self, *args): return None

    async def get(self, url, **kwargs):
        return httpx.Response(200, json={"models": [{"name": "models/gemini-3.8-flash", "displayName": "Gemini 3.8 Flash", "supportedGenerationMethods": ["generateContent"]}]})

    async def post(self, url, **kwargs):
        CapturingMockClient.last_requests.append({"url": url, "json": kwargs.get("json")})
        if url.endswith("/interactions"):
            model = (kwargs.get("json") or {}).get("model", "")
            if "tts" in model:
                wav_b64 = base64.b64encode(b"RIFF\x24\x00\x00\x00WAVEfmt ").decode()
                return httpx.Response(200, json={"steps": [{"type": "model_output", "content": [{"type": "audio", "data": wav_b64, "mime_type": "audio/wav"}]}]})
            png_b64 = base64.b64encode(b"\x89PNG\r\n\x1a\nfake-png").decode()
            return httpx.Response(200, json={"steps": [{"type": "model_output", "content": [{"type": "image", "data": png_b64, "mime_type": "image/png"}]}]})
        return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": "OK"}]}}]})

    def stream(self, method, url, **kwargs):
        CapturingMockClient.last_requests.append({"url": url, "json": kwargs.get("json")})
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
async def test_gemini_3_compliance_edit_file_checkpoints_plan_mode_and_multimodal_vision(clients):
    app_client, _, _ = clients
    assert normalize_waterfall(["gemini-3.7-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"]) == [
        "gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite"
    ]
    patched, n = apply_search_replace("const x = 1;\nconst y = 2;\n", "const x = 1;", "const x = 42;")
    assert n == 1 and "const x = 42;" in patched

    auth = await _signup_user(app_client, "dev@test.dev", username="dev_pro", connect_key=True)
    proj = (await app_client.post("/api/projects", headers=auth["headers"], json={"title": "AI Test", "visibility": "private"})).json()["project"]
    pid = proj["id"]

    # 1. Build mode: edit_file + auto-checkpoint + thoughtSignature preserved + NO temperature sent
    CapturingMockClient.mode = "edit_with_thought_sig"
    CapturingMockClient.call_index = 0
    CapturingMockClient.last_requests = []
    res = await app_client.post(f"/api/projects/{pid}/ai/stream", headers=auth["headers"], json={"prompt": "Update log text", "model": "gemini-3.7-flash", "mode": "build"})
    assert res.status_code == 200
    assert "event: checkpoint" in res.text
    assert len(CapturingMockClient.last_requests) >= 2
    first_req = CapturingMockClient.last_requests[0]
    assert "gemini-3.8-flash" in first_req["url"]  # deprecated 3.7 remapped!
    assert "temperature" not in json.dumps(first_req["json"])  # Gemini 3.x compliant!
    second_req = CapturingMockClient.last_requests[1]
    assert "ENC_SIG_ABC123" in json.dumps(second_req["json"])  # thoughtSignature preserved!

    # Verify patched file + 1-click checkpoint rollback restores original
    app_js = (await app_client.get(f"/api/projects/{pid}/files/app.js")).text
    assert "Patched cleanly!" in app_js
    cps = (await app_client.get(f"/api/projects/{pid}/checkpoints")).json()["checkpoints"]
    assert len(cps) == 1
    restored = await app_client.post(f"/api/projects/{pid}/checkpoints/{cps[0]['id']}/restore", headers=auth["headers"])
    assert restored.status_code == 200
    app_js_restored = (await app_client.get(f"/api/projects/{pid}/files/app.js")).text
    assert "Yulya Studio project ready!" in app_js_restored

    # 2. Plan mode exposes read-only tools only
    CapturingMockClient.mode = "simple"
    CapturingMockClient.call_index = 0
    CapturingMockClient.last_requests = []
    await app_client.post(f"/api/projects/{pid}/ai/stream", headers=auth["headers"], json={"prompt": "Plan a level system", "model": "gemini-3.8-flash", "mode": "plan"})
    declared_names = [t["name"] for t in CapturingMockClient.last_requests[0]["json"]["tools"][0]["functionDeclarations"]]
    assert "read_file" in declared_names and "write_file" not in declared_names and "edit_file" not in declared_names

    # 3. Nano Banana 2.1 image gen & Gemini 3.8 TTS audio gen save assets straight into project
    img_res = await app_client.post(f"/api/projects/{pid}/ai/generate-image", headers=auth["headers"], json={"prompt": "pixel spaceship sprite", "filename": "assets/ship.png"})
    assert img_res.status_code == 200 and img_res.json()["path"] == "assets/ship.png"
    tts_res = await app_client.post(f"/api/projects/{pid}/ai/generate-audio", headers=auth["headers"], json={"text": "Level up!", "voice": "Kore", "filename": "assets/audio/levelup.wav"})
    assert tts_res.status_code == 200 and tts_res.json()["path"] == "assets/audio/levelup.wav"


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

