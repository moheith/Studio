"""Security, origin isolation, cryptography, proxy-IP rate limiting, and HTML sandboxing helpers."""
from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import html as html_lib
import json
import logging
import os
import re
import secrets
from pathlib import Path
from typing import Any
from urllib.parse import quote, urlparse

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import HTTPException, Request
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token

logger = logging.getLogger("yulya.security")

SAFE_SEGMENT_RE = re.compile(r"^[A-Za-z0-9._\- ()+\[\]]+$")

ALLOWED_EXTENSIONS = {
    ".html", ".htm", ".css", ".js", ".mjs", ".cjs", ".json",
    ".ts", ".tsx", ".jsx", ".md", ".glsl", ".vert", ".frag",
    ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".ico",
    ".mp3", ".wav", ".ogg", ".m4a", ".mp4", ".webm",
    ".woff", ".woff2", ".ttf", ".otf",
    ".txt", ".csv", ".tsv", ".atlas", ".fnt", ".glb", ".gltf", ".obj", ".mtl",
}

TEXT_EXTENSIONS = (
    ".html", ".htm", ".css", ".js", ".mjs", ".cjs", ".json",
    ".ts", ".tsx", ".jsx", ".md", ".glsl", ".vert", ".frag",
    ".svg", ".txt", ".csv", ".tsv", ".atlas", ".fnt", ".obj", ".mtl",
)

BINARY_ASSET_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".ico",
    ".mp3", ".wav", ".ogg", ".m4a", ".mp4", ".webm",
    ".woff", ".woff2", ".ttf", ".otf", ".glb", ".gltf",
}


def resolve_play_origin(app_env: str, app_origin: str, raw_play_origin: str) -> str:
    """Resolve isolated sandbox origin for untrusted user games and previews."""
    cleaned = raw_play_origin.strip().rstrip("/")
    if cleaned:
        return cleaned
    parsed_app = urlparse(app_origin)
    host = (parsed_app.hostname or "").lower()
    if app_env == "production":
        if host == "studio.yulya.me":
            return "https://play.yulya.me"
        if host.startswith("studio."):
            return f"{parsed_app.scheme or 'https'}://play.{host[len('studio.'):]}"
        return app_origin
    # Local development uses 127.0.0.1:8000 (distinct browser origin from localhost:5173/8000)
    return "http://127.0.0.1:8000"


def extract_hostname(url_or_host: str) -> str:
    raw = (url_or_host or "").strip().lower()
    if not raw:
        return ""
    if "://" in raw:
        return (urlparse(raw).hostname or "").lower()
    # Strip optional port from Host header (handles IPv4/hostnames; basic bracket strip for IPv6)
    if raw.startswith("["):
        return raw.split("]", 1)[0].lstrip("[")
    return raw.split(":", 1)[0]


def request_host(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-host") or request.headers.get("host") or ""
    first = forwarded.split(",", 1)[0].strip()
    return extract_hostname(first)


def client_ip(request: Request) -> str:
    """Extract client IP behind Cloudflare/Render reverse proxies safely."""
    cf_ip = (request.headers.get("cf-connecting-ip") or "").strip()
    if cf_ip and len(cf_ip) <= 64:
        return cf_ip
    xff = (request.headers.get("x-forwarded-for") or "").strip()
    if xff:
        first = xff.split(",", 1)[0].strip()
        if first and len(first) <= 64:
            return first
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def allowed_trusted_hosts(app_origin: str, api_origin: str, play_origin: str) -> list[str]:
    hosts = {"localhost", "127.0.0.1", "testserver", "*.onrender.com"}
    for origin in (app_origin, api_origin, play_origin):
        h = extract_hostname(origin)
        if h:
            hosts.add(h)
    extra = os.getenv("ALLOWED_HOSTS", "")
    for item in extra.split(","):
        h = extract_hostname(item)
        if h:
            hosts.add(h)
    return sorted(hosts)


def safe_relative_path(path: str) -> str:
    """Strictly validate and normalize a project-relative file path."""
    if not path or len(path) > 240 or "\0" in path:
        raise HTTPException(400, "Invalid file path")
    raw = path.replace("\\", "/").strip("/")
    if not raw:
        raw = "index.html"
    segments: list[str] = []
    for seg in raw.split("/"):
        if not seg or seg == ".":
            continue
        if seg == "..":
            if segments:
                segments.pop()
            else:
                raise HTTPException(400, "Invalid project-relative path")
        else:
            segments.append(seg)
    if not segments:
        segments = ["index.html"]
    for seg in segments:
        if len(seg) > 120:
            raise HTTPException(400, "Path segment is too long")
        if seg.startswith(".") and seg != ".keep.json":
            raise HTTPException(400, "Hidden dotfiles are not allowed")
        if not SAFE_SEGMENT_RE.fullmatch(seg):
            raise HTTPException(400, "File path contains unsupported characters")
    ext = Path(segments[-1]).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(415, f"Unsupported browser asset type: '{ext}'")
    return "/".join(segments)


def app_security_headers(app_origin: str, play_origin: str, is_https: bool) -> dict[str, str]:
    """Defense-in-depth security headers for the main Studio origin (never hosts untrusted user HTML)."""
    frame_sources = ["'self'", "https://accounts.google.com"]
    if play_origin and play_origin not in frame_sources:
        frame_sources.append(play_origin)
    connect_sources = [
        "'self'",
        "https://accounts.google.com",
        "https://cdn.jsdelivr.net",
        "https://esm.sh",
        "https://unpkg.com",
        "https://cdn.tailwindcss.com",
    ]
    if play_origin and play_origin not in connect_sources:
        connect_sources.append(play_origin)
    csp = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob: https://accounts.google.com https://cdn.jsdelivr.net https://unpkg.com https://esm.sh https://cdn.tailwindcss.com https://cdnjs.cloudflare.com; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com https://cdn.jsdelivr.net; "
        "img-src 'self' data: blob: https:; "
        "media-src 'self' data: blob: https:; "
        "font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net; "
        f"connect-src {' '.join(connect_sources)}; "
        "worker-src 'self' blob: https://cdn.jsdelivr.net; "
        f"frame-src {' '.join(frame_sources)}; "
        "object-src 'none'; "
        "base-uri 'self'; "
        "form-action 'self'; "
        "frame-ancestors 'none';"
    )
    headers = {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
        "Content-Security-Policy": csp,
    }
    if is_https:
        headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return headers


def game_security_headers(app_origin: str, rel_path: str, is_https: bool, embeddable: bool = False) -> dict[str, str]:
    """Hardened headers for untrusted user HTML/JS/SVG served from the isolated play origin."""
    ancestors = "*" if embeddable else (f"'self' {app_origin}".strip() if app_origin else "'self'")
    is_svg = rel_path.lower().endswith(".svg")
    if is_svg:
        # Neutralize inline scripts when an SVG asset is opened directly in a browser tab
        csp = (
            "default-src 'none'; "
            "style-src 'unsafe-inline'; "
            "img-src 'self' data:; "
            "sandbox; "
            f"frame-ancestors {ancestors};"
        )
    else:
        csp = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob: "
            "https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com "
            "https://cdn.skypack.dev https://esm.sh https://threejs.org https://cdn.tailwindcss.com; "
            "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://fonts.googleapis.com; "
            "img-src 'self' data: blob: https:; "
            "media-src 'self' data: blob: https:; "
            "font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net; "
            "connect-src 'self' data: blob: https:; "
            "worker-src 'self' blob:; "
            "object-src 'none'; "
            "form-action 'none'; "
            "base-uri 'self'; "
            f"frame-ancestors {ancestors};"
        )
    headers = {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
        "Content-Security-Policy": csp,
    }
    if is_https:
        headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return headers


class KeyCipher:
    """Versioned AES-256-GCM key cipher with AAD binding + seamless legacy Fernet fallback & key rotation."""

    def __init__(self, primary_secret: str, previous_secret: str = "") -> None:
        self.primary_secret = primary_secret
        self.previous_secret = previous_secret

    @staticmethod
    def _aes_key(secret: str) -> bytes:
        return hashlib.sha256(secret.encode("utf-8")).digest()

    @staticmethod
    def _fernet(secret: str) -> Fernet:
        raw = secret.encode("utf-8") if len(secret) == 44 else base64.urlsafe_b64encode(hashlib.sha256(secret.encode("utf-8")).digest())
        return Fernet(raw)

    def encrypt(self, plaintext: str, user_id: str) -> str:
        if not self.primary_secret:
            raise HTTPException(503, "API key encryption is not configured")
        try:
            aesgcm = AESGCM(self._aes_key(self.primary_secret))
            nonce = secrets.token_bytes(12)
            aad = f"yulya-key-v2:{user_id}".encode("utf-8")
            ct = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), aad)
            token = base64.urlsafe_b64encode(nonce + ct).decode("ascii")
            return f"v2:{token}"
        except Exception:
            raise HTTPException(503, "API key encryption configuration is invalid")

    def decrypt(self, ciphertext: str, user_id: str) -> str:
        if not self.primary_secret:
            raise HTTPException(503, "API key encryption is not configured")
        secrets_to_try = [s for s in (self.primary_secret, self.previous_secret) if s]
        if ciphertext.startswith("v2:"):
            encoded = ciphertext[3:]
            try:
                blob = base64.urlsafe_b64decode(encoded.encode("ascii"))
                nonce, ct = blob[:12], blob[12:]
                aad = f"yulya-key-v2:{user_id}".encode("utf-8")
            except Exception as exc:
                raise InvalidToken("Malformed v2 ciphertext") from exc
            for secret in secrets_to_try:
                try:
                    return AESGCM(self._aes_key(secret)).decrypt(nonce, ct, aad).decode("utf-8")
                except Exception:
                    continue
            raise InvalidToken("Could not decrypt v2 key")
        # Legacy Fernet ciphertext support (zero-downtime migration for existing users)
        for secret in secrets_to_try:
            try:
                return self._fernet(secret).decrypt(ciphertext.encode("utf-8")).decode("utf-8")
            except Exception:
                continue
        raise InvalidToken("Could not decrypt stored API key")


async def verify_google_credential_local(credential: str, client_id: str) -> dict[str, Any]:
    """Verify Google Sign-In ID token locally using Google's official JWKS keys (google-auth)."""
    def _verify() -> dict[str, Any]:
        req = google_requests.Request()
        return google_id_token.verify_oauth2_token(credential, req, audience=client_id)

    try:
        payload = await asyncio.to_thread(_verify)
    except ValueError as exc:
        logger.warning("Google JWT verification rejected: %s", exc)
        raise HTTPException(401, "Invalid or expired Google token") from None
    except Exception as exc:
        logger.warning("Google JWT verification error: %s", exc)
        raise HTTPException(401, "Could not verify Google account") from None

    if payload.get("iss") not in {"accounts.google.com", "https://accounts.google.com"}:
        raise HTTPException(401, "Invalid Google token issuer")
    if payload.get("aud") != client_id:
        raise HTTPException(401, "Google token audience mismatch")
    if payload.get("email_verified") is not True:
        raise HTTPException(401, "Google account email is not verified")
    return payload


def build_sandbox_bridge_html(
    project: dict[str, Any],
    raw_html: str,
    base_href: str,
    app_origin: str,
    project_files: list[dict[str, Any]],
) -> str:
    """Inject strictly origin-bound runtime bridge, escaped SEO metadata, and deferred auto-scripts."""
    target_origin_js = json.dumps(app_origin or "")
    # Modern screenshot library + strictly origin-verified postMessage bridge
    bridge = (
        '<script src="https://cdn.jsdelivr.net/npm/modern-screenshot@4.7.0/dist/index.js" defer></script>\n'
        "<script>\n"
        "(function() {\n"
        f"  var TARGET_ORIGIN = {target_origin_js};\n"
        "  function postToHost(payload) {\n"
        "    if (!TARGET_ORIGIN || window.parent === window) return;\n"
        "    try { window.parent.postMessage(payload, TARGET_ORIGIN); } catch (e) {}\n"
        "  }\n"
        "  window.YulyaSDK = {\n"
        "    submitScore: function(score, meta) {\n"
        "      var n = Number(score);\n"
        "      if (!isFinite(n)) return;\n"
        "      postToHost({ type: 'yulya:submit-score', score: n, meta: meta || {} });\n"
        "    }\n"
        "  };\n"
        "  try {\n"
        "    var _origGetContext = HTMLCanvasElement.prototype.getContext;\n"
        "    HTMLCanvasElement.prototype.getContext = function(type, attribs) {\n"
        "      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {\n"
        "        attribs = Object.assign({}, attribs, { preserveDrawingBuffer: true });\n"
        "      }\n"
        "      return _origGetContext.call(this, type, attribs);\n"
        "    };\n"
        "  } catch(glErr) {}\n"
        "  var recentLogs = [];\n"
        "  function pushLog(level, msg) {\n"
        "    recentLogs.push({ level: level, message: String(msg).slice(0, 600), ts: Date.now() });\n"
        "    if (recentLogs.length > 40) recentLogs.shift();\n"
        "  }\n"
        "  window.addEventListener('error', function(e) {\n"
        "    var loc = e.filename ? ' (' + e.filename.split('/').pop() + ':' + e.lineno + ':' + e.colno + ')' : '';\n"
        "    var msg = (e.message || 'Script error') + loc;\n"
        "    pushLog('error', msg);\n"
        "    postToHost({ type: 'yulya:game-error', message: msg, filename: e.filename || '', lineno: e.lineno || 0, colno: e.colno || 0 });\n"
        "  });\n"
        "  window.addEventListener('unhandledrejection', function(e) {\n"
        "    var reason = e.reason && (e.reason.message || e.reason.stack || e.reason) || 'unknown error';\n"
        "    var msg = 'Unhandled Promise Rejection: ' + reason;\n"
        "    pushLog('error', msg);\n"
        "    postToHost({ type: 'yulya:game-error', message: msg, filename: '', lineno: 0 });\n"
        "  });\n"
        "  try {\n"
        "    var _fmt = function(args) {\n"
        "      return Array.prototype.slice.call(args).map(function(a) {\n"
        "        if (typeof a === 'object' && a !== null) { try { return JSON.stringify(a); } catch(_) { return String(a); } }\n"
        "        return String(a);\n"
        "      }).join(' ');\n"
        "    };\n"
        "    var _origLog = console.log;\n"
        "    console.log = function() { _origLog.apply(console, arguments); var m = _fmt(arguments); pushLog('log', m); postToHost({ type: 'yulya:game-log', level: 'log', message: m }); };\n"
        "    var _origWarn = console.warn;\n"
        "    console.warn = function() { _origWarn.apply(console, arguments); var m = _fmt(arguments); pushLog('warn', m); postToHost({ type: 'yulya:game-log', level: 'warn', message: m }); };\n"
        "    var _origErr = console.error;\n"
        "    console.error = function() { _origErr.apply(console, arguments); var m = _fmt(arguments); pushLog('error', m); postToHost({ type: 'yulya:game-log', level: 'error', message: m }); };\n"
        "  } catch(e) {}\n"
        "  var activeKeys = {}; var activeTimers = [];\n"
        "  function releaseAllKeys() {\n"
        "    for (var k in activeKeys) {\n"
        "      if (activeKeys[k]) {\n"
        "        try {\n"
        "          var evt = new KeyboardEvent('keyup', { key: k, code: activeKeys[k], bubbles: true, cancelable: true });\n"
        "          window.dispatchEvent(evt); document.dispatchEvent(evt);\n"
        "        } catch(e) {}\n"
        "      }\n"
        "    }\n"
        "    activeKeys = {}; activeTimers.forEach(clearTimeout); activeTimers = [];\n"
        "  }\n"
        "  window.addEventListener('blur', releaseAllKeys);\n"
        "  document.addEventListener('visibilitychange', function() { if (document.hidden) releaseAllKeys(); });\n"
        "  function resolveKeyCode(key) {\n"
        "    if (!key) return { key: ' ', code: 'Space', keyCode: 32 };\n"
        "    var k = String(key); var lk = k.toLowerCase();\n"
        "    if (lk === ' ' || lk === 'space') return { key: ' ', code: 'Space', keyCode: 32 };\n"
        "    if (lk === 'enter') return { key: 'Enter', code: 'Enter', keyCode: 13 };\n"
        "    if (lk === 'escape' || lk === 'esc') return { key: 'Escape', code: 'Escape', keyCode: 27 };\n"
        "    if (lk === 'shift') return { key: 'Shift', code: 'ShiftLeft', keyCode: 16 };\n"
        "    if (lk === 'control' || lk === 'ctrl') return { key: 'Control', code: 'ControlLeft', keyCode: 17 };\n"
        "    if (lk === 'arrowup' || lk === 'up') return { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 };\n"
        "    if (lk === 'arrowdown' || lk === 'down') return { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 };\n"
        "    if (lk === 'arrowleft' || lk === 'left') return { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 };\n"
        "    if (lk === 'arrowright' || lk === 'right') return { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 };\n"
        "    if (k.length === 1 && /[a-zA-Z]/.test(k)) return { key: k, code: 'Key' + k.toUpperCase(), keyCode: k.toUpperCase().charCodeAt(0) };\n"
        "    if (k.length === 1 && /[0-9]/.test(k)) return { key: k, code: 'Digit' + k, keyCode: k.charCodeAt(0) };\n"
        "    return { key: k, code: k, keyCode: 0 };\n"
        "  }\n"
        "  function collectInteractiveDom() {\n"
        "    var items = [];\n"
        "    try {\n"
        "      var nodes = document.querySelectorAll('button, a, input, select, canvas, [role=\"button\"]');\n"
        "      for (var i = 0; i < nodes.length && items.length < 30; i++) {\n"
        "        var el = nodes[i]; var r = el.getBoundingClientRect();\n"
        "        if (r.width < 4 || r.height < 4) continue;\n"
        "        var sel = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0,2).join('.') : '');\n"
        "        items.push({ tag: el.tagName.toLowerCase(), selector: sel, text: (el.innerText || el.value || '').trim().slice(0, 60), x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2), w: Math.round(r.width), h: Math.round(r.height) });\n"
        "      }\n"
        "    } catch(e) {}\n"
        "    return items;\n"
        "  }\n"
        "  var pickerActive = false; var pickerBox = null;\n"
        "  function ensurePickerBox() {\n"
        "    if (pickerBox) return pickerBox;\n"
        "    pickerBox = document.createElement('div');\n"
        "    pickerBox.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #8b5cf6;background:rgba(139,92,246,0.16);border-radius:4px;display:none;transition:all 60ms ease;';\n"
        "    document.documentElement.appendChild(pickerBox);\n"
        "    return pickerBox;\n"
        "  }\n"
        "  function describeEl(el) {\n"
        "    var cs = window.getComputedStyle(el);\n"
        "    var sel = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/).slice(0,3).join('.') : '');\n"
        "    return { selector: sel, tag: el.tagName.toLowerCase(), text: (el.innerText || '').trim().slice(0, 120), styles: { color: cs.color, background: cs.backgroundColor, fontSize: cs.fontSize, display: cs.display, padding: cs.padding } };\n"
        "  }\n"
        "  document.addEventListener('mousemove', function(ev) {\n"
        "    if (!pickerActive) return;\n"
        "    var el = document.elementFromPoint(ev.clientX, ev.clientY);\n"
        "    if (!el || el === pickerBox) return;\n"
        "    var r = el.getBoundingClientRect(); var box = ensurePickerBox();\n"
        "    box.style.display = 'block'; box.style.left = r.left + 'px'; box.style.top = r.top + 'px'; box.style.width = r.width + 'px'; box.style.height = r.height + 'px';\n"
        "  }, true);\n"
        "  document.addEventListener('click', function(ev) {\n"
        "    if (!pickerActive) return;\n"
        "    ev.preventDefault(); ev.stopPropagation();\n"
        "    var el = document.elementFromPoint(ev.clientX, ev.clientY);\n"
        "    pickerActive = false;\n"
        "    if (pickerBox) pickerBox.style.display = 'none';\n"
        "    if (el) postToHost({ type: 'yulya:element-picked', element: describeEl(el) });\n"
        "  }, true);\n"
        "  var perfRunning = false; var perfFrames = 0; var perfLast = performance.now();\n"
        "  function perfTick(now) {\n"
        "    if (!perfRunning) return;\n"
        "    perfFrames++;\n"
        "    if (now - perfLast >= 1000) {\n"
        "      var fps = Math.round((perfFrames * 1000) / (now - perfLast));\n"
        "      var memMb = (performance.memory && performance.memory.usedJSHeapSize) ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;\n"
        "      postToHost({ type: 'yulya:perf-stats', fps: fps, memMb: memMb, domNodes: document.getElementsByTagName('*').length });\n"
        "      perfFrames = 0; perfLast = now;\n"
        "    }\n"
        "    requestAnimationFrame(perfTick);\n"
        "  }\n"
        "  window.addEventListener('message', function(e) {\n"
        "    if (!TARGET_ORIGIN || e.origin !== TARGET_ORIGIN) return;\n"
        "    if (!e.data || typeof e.data !== 'object') return;\n"
        "    if (e.data.type === 'yulya:release-all-keys') { releaseAllKeys(); return; }\n"
        "    if (e.data.type === 'yulya:set-picker') {\n"
        "      pickerActive = !!e.data.active;\n"
        "      if (!pickerActive && pickerBox) pickerBox.style.display = 'none';\n"
        "      return;\n"
        "    }\n"
        "    if (e.data.type === 'yulya:set-perf') {\n"
        "      var want = !!e.data.active;\n"
        "      if (want && !perfRunning) { perfRunning = true; perfFrames = 0; perfLast = performance.now(); requestAnimationFrame(perfTick); }\n"
        "      else if (!want) { perfRunning = false; }\n"
        "      return;\n"
        "    }\n"
        "    if (e.data.type === 'yulya:eval-code') {\n"
        "      var evalId = e.data.evalId;\n"
        "      try {\n"
        "        var res = (0, eval)(String(e.data.code || ''));\n"
        "        var out = typeof res === 'object' ? JSON.stringify(res, null, 2) : String(res);\n"
        "        postToHost({ type: 'yulya:eval-result', evalId: evalId, ok: true, output: out });\n"
        "      } catch (evalErr) {\n"
        "        postToHost({ type: 'yulya:eval-result', evalId: evalId, ok: false, output: String(evalErr && evalErr.message || evalErr) });\n"
        "      }\n"
        "      return;\n"
        "    }\n"
        "    if (e.data.type === 'yulya:simulate-input') {\n"
        "      var d = e.data; var kind = d.inputKind || 'keydown';\n"
        "      if (kind === 'keydown' || kind === 'keyup' || kind === 'keypress') {\n"
        "        var mapped = resolveKeyCode(d.key);\n"
        "        var evt = new KeyboardEvent(kind, { key: mapped.key, code: mapped.code, keyCode: mapped.keyCode, which: mapped.keyCode, bubbles: true, cancelable: true });\n"
        "        window.dispatchEvent(evt); document.dispatchEvent(evt);\n"
        "        if (kind === 'keydown') {\n"
        "          activeKeys[mapped.key] = mapped.code;\n"
        "          if (d.duration_ms && d.duration_ms > 0) {\n"
        "            var tid = setTimeout(function() {\n"
        "              delete activeKeys[mapped.key];\n"
        "              var upEvt = new KeyboardEvent('keyup', { key: mapped.key, code: mapped.code, keyCode: mapped.keyCode, which: mapped.keyCode, bubbles: true, cancelable: true });\n"
        "              window.dispatchEvent(upEvt); document.dispatchEvent(upEvt);\n"
        "              postToHost({ type: 'yulya:input-held-released', key: mapped.key });\n"
        "            }, d.duration_ms);\n"
        "            activeTimers.push(tid);\n"
        "          }\n"
        "        } else if (kind === 'keyup') { delete activeKeys[mapped.key]; }\n"
        "      } else if (kind === 'mousemove' || kind === 'mousedown' || kind === 'mouseup' || kind === 'click' || kind === 'dblclick' || kind === 'contextmenu') {\n"
        "        var x = typeof d.x === 'number' ? d.x : (window.innerWidth / 2);\n"
        "        var y = typeof d.y === 'number' ? d.y : (window.innerHeight / 2);\n"
        "        var target = null;\n"
        "        if (d.selector) { try { target = document.querySelector(d.selector); } catch(err) {} }\n"
        "        if (!target && d.text) {\n"
        "          var needle = String(d.text).toLowerCase().trim();\n"
        "          var allCandidates = document.querySelectorAll('button, a, input, select, [role=\"button\"], h1, h2, h3, h4, span, div, p');\n"
        "          for (var ci = 0; ci < allCandidates.length; ci++) {\n"
        "            var elCandidate = allCandidates[ci];\n"
        "            var txt = (elCandidate.innerText || elCandidate.textContent || '').toLowerCase().trim();\n"
        "            if (txt === needle || (needle.length >= 2 && txt.indexOf(needle) !== -1)) { target = elCandidate; break; }\n"
        "          }\n"
        "        }\n"
        "        if (target && typeof target.closest === 'function') {\n"
        "          var btnAncestor = target.closest('button, a, input, [role=\"button\"]');\n"
        "          if (btnAncestor) target = btnAncestor;\n"
        "        }\n"
        "        if (target) {\n"
        "          var rect = target.getBoundingClientRect();\n"
        "          x = rect.left + (rect.width / 2); y = rect.top + (rect.height / 2);\n"
        "          postToHost({ type: 'yulya:target-located', x: x, y: y, label: d.label || d.text || d.selector || 'Button' });\n"
        "        } else { target = document.elementFromPoint(x, y) || document.body; }\n"
        "        var button = d.button || 0;\n"
        "        try { target.dispatchEvent(new PointerEvent(kind === 'mousedown' ? 'pointerdown' : (kind === 'mouseup' ? 'pointerup' : 'pointermove'), { clientX: x, clientY: y, button: button, bubbles: true, cancelable: true, view: window })); } catch(pe) {}\n"
        "        try { target.dispatchEvent(new MouseEvent(kind, { clientX: x, clientY: y, button: button, buttons: kind === 'mousedown' ? 1 : 0, bubbles: true, cancelable: true, view: window })); } catch(me) {}\n"
        "        if (kind === 'click') {\n"
        "          if (typeof target.focus === 'function') { try { target.focus(); } catch(fe) {} }\n"
        "          if (typeof target.click === 'function') { try { target.click(); } catch(ce) {} }\n"
        "        }\n"
        "      } else if (kind === 'touchstart' || kind === 'touchmove' || kind === 'touchend') {\n"
        "        var tx = typeof d.x === 'number' ? d.x : (window.innerWidth / 2);\n"
        "        var ty = typeof d.y === 'number' ? d.y : (window.innerHeight / 2);\n"
        "        var tTarget = document.elementFromPoint(tx, ty) || document.body;\n"
        "        try {\n"
        "          var touch = new Touch({ identifier: Date.now(), target: tTarget, clientX: tx, clientY: ty, pageX: tx, pageY: ty, screenX: tx, screenY: ty });\n"
        "          tTarget.dispatchEvent(new TouchEvent(kind, { touches: kind === 'touchend' ? [] : [touch], targetTouches: kind === 'touchend' ? [] : [touch], changedTouches: [touch], bubbles: true, cancelable: true }));\n"
        "        } catch(terr) {\n"
        "          var fallbackKind = kind === 'touchstart' ? 'mousedown' : (kind === 'touchend' ? 'mouseup' : 'mousemove');\n"
        "          tTarget.dispatchEvent(new MouseEvent(fallbackKind, { clientX: tx, clientY: ty, bubbles: true, cancelable: true }));\n"
        "        }\n"
        "      }\n"
        "    } else if (e.data.type === 'yulya:capture-screen') {\n"
        "      var reqId = e.data.reqId;\n"
        "      var domItems = collectInteractiveDom();\n"
        "      var errors = recentLogs.filter(function(l) { return l.level === 'error' || l.level === 'warn'; }).slice(-15);\n"
        "      function sendCapture(dUrl, hasC, w, h) {\n"
        "        postToHost({ type: 'yulya:screen-captured', reqId: reqId, dataUrl: dUrl || '', hasCanvas: hasC, width: w || window.innerWidth, height: h || window.innerHeight, domElements: domItems, consoleErrors: errors });\n"
        "      }\n"
        "      function getSafeBg() {\n"
        "        var bg = '#101114';\n"
        "        try {\n"
        "          var comp = window.getComputedStyle(document.body).backgroundColor;\n"
        "          if (comp && comp !== 'transparent' && comp !== 'rgba(0, 0, 0, 0)') bg = comp;\n"
        "        } catch(err) {}\n"
        "        return bg;\n"
        "      }\n"
        "      function tryCanvas() {\n"
        "        var canvases = document.querySelectorAll('canvas');\n"
        "        for (var ci = 0; ci < canvases.length; ci++) {\n"
        "          var c = canvases[ci];\n"
        "          if ((c.width > 20 || c.clientWidth > 20) && (c.height > 20 || c.clientHeight > 20)) {\n"
        "            try {\n"
        "              var off = document.createElement('canvas'); off.width = 640; off.height = 360;\n"
        "              var octx = off.getContext('2d');\n"
        "              if (octx) {\n"
        "                octx.fillStyle = getSafeBg(); octx.fillRect(0, 0, 640, 360);\n"
        "                var srcW = c.width || c.clientWidth || 640; var srcH = c.height || c.clientHeight || 360;\n"
        "                var scale = Math.max(640 / srcW, 360 / srcH);\n"
        "                var dw = srcW * scale, dh = srcH * scale;\n"
        "                octx.drawImage(c, (640 - dw) / 2, (360 - dh) / 2, dw, dh);\n"
        "                var dUrl = off.toDataURL('image/jpeg', 0.82);\n"
        "                if (dUrl && dUrl.length > 500) return dUrl;\n"
        "              }\n"
        "            } catch(ce) {}\n"
        "          }\n"
        "        }\n"
        "        return '';\n"
        "      }\n"
        "      requestAnimationFrame(function() {\n"
        "        var cUrl = tryCanvas();\n"
        "        if (cUrl) { sendCapture(cUrl, true, 640, 360); }\n"
        "        else if (window.modernScreenshot && typeof window.modernScreenshot.domToJpeg === 'function') {\n"
        "          window.modernScreenshot.domToJpeg(document.body, { quality: 0.82, scale: 0.75, backgroundColor: getSafeBg() })\n"
        "            .then(function(du) { sendCapture(du && du.length > 500 ? du : '', !!(du && du.length > 500), window.innerWidth, window.innerHeight); })\n"
        "            .catch(function() { sendCapture('', false, window.innerWidth, window.innerHeight); });\n"
        "        } else { sendCapture('', false, window.innerWidth, window.innerHeight); }\n"
        "      });\n"
        "    }\n"
        "  });\n"
        "})();\n"
        "</script>\n"
    )

    # Auto-link omitted top-level .js files with defer AND strictly URL-quoted src (fixes BUG-10 & SEC-03)
    js_injections: list[str] = []
    for pf in project_files:
        p_name = str(pf.get("path") or "")
        if p_name.endswith(".js") and p_name != "app.js" and "/" not in p_name:
            if p_name not in raw_html:
                safe_src = html_lib.escape(quote(p_name, safe=""), quote=True)
                js_injections.append(f'<script src="{safe_src}" defer></script>')
    if js_injections:
        bridge += "\n".join(js_injections) + "\n"

    # Strictly HTML-escape all user metadata (fixes SEC-03)
    game_title = html_lib.escape(str(project.get("title") or "Game"), quote=True)
    game_desc = html_lib.escape(str(project.get("description") or "Play this game on Yulya Studio Arcade."), quote=True)
    game_creator = html_lib.escape(str(project.get("username") or "creator"), quote=True)
    safe_base = html_lib.escape(base_href, quote=True)

    seo_tags = (
        f'<meta name="description" content="{game_desc}">\n'
        f'<meta property="og:title" content="{game_title} by @{game_creator} — Yulya Studio">\n'
        f'<meta property="og:description" content="{game_desc}">\n'
        f'<meta property="og:type" content="game">\n'
    )
    base_tag = f'<base href="{safe_base}">\n{seo_tags}{bridge}'
    existing_base = re.search(r"<base\b[^>]*>", raw_html, flags=re.IGNORECASE)
    if existing_base:
        return raw_html[:existing_base.start()] + base_tag + raw_html[existing_base.end():]
    head = re.search(r"<head(?:\s[^>]*)?>", raw_html, flags=re.IGNORECASE)
    return raw_html[:head.end()] + "\n" + base_tag + raw_html[head.end():] if head else base_tag + raw_html
