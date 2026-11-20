"""Gemini 3.x compliance, surgical file patching, multimodal vision tool broker, and AI asset generation."""
from __future__ import annotations

import asyncio
import base64
import logging
import re
import time
import uuid
from typing import Any

import httpx
from fastapi import HTTPException

logger = logging.getLogger("yulya.ai")

DEFAULT_WATERFALL_MODELS = [
    "gemini-3.8-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash-lite",
]

# Oct 2026 Gemini API deprecations: auto-remap saved legacy waterfall entries transparently
DEPRECATED_MODEL_REMAP = {
    "gemini-3.7-flash": "gemini-3.8-flash",
    "gemini-3.5-flash": "gemini-3.6-flash",
    "gemini-2.5-flash": "gemini-3.8-flash",
    "gemini-2.5-pro": "gemini-4-argon",
    "gemini-2.0-flash": "gemini-3.8-flash",
    "gemini-2.0-flash-lite": "gemini-3.5-flash-lite",
    "gemini-1.5-flash": "gemini-3.8-flash",
    "gemini-1.5-pro": "gemini-3.8-flash",
}

API_REVISION_HEADER = "2026-05-20"


def normalize_model_id(model: str) -> str:
    clean = (model or "").strip().removeprefix("models/")
    return DEPRECATED_MODEL_REMAP.get(clean, clean)


def normalize_waterfall(models: list[str] | None) -> list[str]:
    raw = models or DEFAULT_WATERFALL_MODELS
    out: list[str] = []
    for item in raw:
        if not isinstance(item, str) or not item.strip():
            continue
        norm = normalize_model_id(item)
        if norm and norm not in out:
            out.append(norm)
    return out or list(DEFAULT_WATERFALL_MODELS)


def apply_search_replace(content: str, search: str, replace: str) -> tuple[str, int]:
    """Apply a surgical literal search-and-replace patch safely."""
    if not search:
        raise HTTPException(400, "edit_file requires a non-empty 'search' block")
    count = content.count(search)
    if count == 1:
        return content.replace(search, replace, 1), 1
    if count > 1:
        raise HTTPException(
            409,
            f"The search block matched {count} locations. Include 2-3 more surrounding lines so the patch target is unique.",
        )
    # Fallback for CRLF/LF mismatch
    norm_content = content.replace("\r\n", "\n")
    norm_search = search.replace("\r\n", "\n")
    norm_replace = replace.replace("\r\n", "\n")
    norm_count = norm_content.count(norm_search)
    if norm_count == 1:
        return norm_content.replace(norm_search, norm_replace, 1), 1
    if norm_count > 1:
        raise HTTPException(
            409,
            f"The search block matched {norm_count} locations after newline normalization. Include more surrounding lines.",
        )
    raise HTTPException(
        400,
        "Could not find the exact 'search' block in the file. Call read_file first to inspect current contents.",
    )


class VisionToolBroker:
    """Bounded async rendezvous for browser-to-server Multimodal Function Responses (inspect_game_screen)."""

    def __init__(self, max_pending: int = 200) -> None:
        self._pending: dict[str, tuple[str, str, asyncio.Future[dict[str, Any]], float]] = {}
        self._max_pending = max_pending

    def _prune(self) -> None:
        now = time.time()
        expired = [cid for cid, (_, _, fut, ts) in self._pending.items() if fut.done() or now - ts > 60]
        for cid in expired:
            self._pending.pop(cid, None)

    def register(self, user_id: str, project_id: str) -> tuple[str, asyncio.Future[dict[str, Any]]]:
        self._prune()
        if len(self._pending) >= self._max_pending:
            oldest = min(self._pending.items(), key=lambda kv: kv[1][3])[0]
            _, _, old_fut, _ = self._pending.pop(oldest)
            if not old_fut.done():
                old_fut.cancel()
        call_id = uuid.uuid4().hex
        loop = asyncio.get_running_loop()
        fut: asyncio.Future[dict[str, Any]] = loop.create_future()
        self._pending[call_id] = (user_id, project_id, fut, time.time())
        return call_id, fut

    def resolve(self, call_id: str, user_id: str, project_id: str, payload: dict[str, Any]) -> bool:
        entry = self._pending.get(call_id)
        if not entry:
            return False
        owner_uid, owner_pid, fut, _ = entry
        if owner_uid != user_id or owner_pid != project_id:
            return False
        self._pending.pop(call_id, None)
        if not fut.done():
            fut.set_result(payload)
            return True
        return False

    def release(self, call_id: str) -> None:
        entry = self._pending.pop(call_id, None)
        if entry and not entry[2].done():
            entry[2].cancel()


vision_broker = VisionToolBroker()


def parse_data_url_image(data_url: str, max_bytes: int = 1_500_000) -> tuple[str, str] | None:
    """Validate and extract (mime_type, base64_data) from a browser image data URL."""
    if not data_url or not isinstance(data_url, str):
        return None
    m = re.match(r"^data:(image/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$", data_url.strip())
    if not m:
        return None
    mime_type = m.group(1)
    b64 = re.sub(r"\s+", "", m.group(2))
    # Rough decoded byte size check
    approx_bytes = (len(b64) * 3) // 4
    if approx_bytes == 0 or approx_bytes > max_bytes:
        return None
    try:
        base64.b64decode(b64, validate=True)
    except Exception:
        return None
    return mime_type, b64


async def generate_image_nano_banana(
    api_key: str,
    gemini_api_base: str,
    prompt: str,
    model: str = "gemini-nano-banana-2.1",
) -> tuple[bytes, str]:
    """Generate a PNG/JPEG sprite, texture, or cover using Nano Banana 2.1 Interactions REST API."""
    clean_model = normalize_model_id(model)
    if clean_model not in {"gemini-nano-banana-2.1", "gemini-3.1-flash-lite-image", "gemini-3-pro-image"}:
        clean_model = "gemini-nano-banana-2.1"
    body = {
        "model": clean_model,
        "input": [{"type": "text", "text": prompt.strip()}],
    }
    async with httpx.AsyncClient(timeout=httpx.Timeout(90.0, connect=20.0)) as client:
        resp = await client.post(
            f"{gemini_api_base}/interactions",
            headers={
                "x-goog-api-key": api_key,
                "Content-Type": "application/json",
                "Api-Revision": API_REVISION_HEADER,
            },
            json=body,
        )
    if resp.status_code == 429:
        raise HTTPException(429, "Gemini API rate limit reached while generating image")
    if resp.status_code >= 400:
        err_msg = ""
        try:
            err_msg = resp.json().get("error", {}).get("message", "")
        except Exception:
            pass
        raise HTTPException(502, f"Image generation failed ({resp.status_code}): {err_msg or 'Try again later'}")

    data = resp.json()
    for step in reversed(data.get("steps", [])):
        if step.get("type") != "model_output":
            continue
        for block in reversed(step.get("content", [])):
            if block.get("type") == "image" and block.get("data"):
                raw = base64.b64decode(block["data"])
                mime = block.get("mime_type") or "image/png"
                return raw, mime
    raise HTTPException(502, "Nano Banana did not return an image for this prompt")


async def generate_tts_gemini(
    api_key: str,
    gemini_api_base: str,
    text: str,
    voice: str = "Kore",
    style: str = "clear and expressive",
    model: str = "gemini-3.8-flash-tts",
) -> tuple[bytes, str]:
    """Generate WAV voice audio using Gemini 3.8 Flash TTS Interactions REST API."""
    clean_model = model if model in {"gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts"} else "gemini-3.8-flash-tts"
    safe_voice = re.sub(r"[^A-Za-z0-9_-]", "", voice or "Kore") or "Kore"
    body = {
        "model": clean_model,
        "input": [
            {
                "type": "user_input",
                "content": [
                    {
                        "type": "text",
                        "text": text.strip(),
                        "annotations": [
                            {
                                "type": "speech_metadata",
                                "style": (style or "clear and expressive").strip()[:120],
                            }
                        ],
                    }
                ],
            }
        ],
        "response_format": {"type": "audio"},
        "generation_config": {
            "speech_config": [{"voice": safe_voice}],
        },
    }
    async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=20.0)) as client:
        resp = await client.post(
            f"{gemini_api_base}/interactions",
            headers={
                "x-goog-api-key": api_key,
                "Content-Type": "application/json",
                "Api-Revision": API_REVISION_HEADER,
            },
            json=body,
        )
    if resp.status_code == 429:
        raise HTTPException(429, "Gemini API rate limit reached while generating speech")
    if resp.status_code >= 400:
        err_msg = ""
        try:
            err_msg = resp.json().get("error", {}).get("message", "")
        except Exception:
            pass
        raise HTTPException(502, f"Speech generation failed ({resp.status_code}): {err_msg or 'Try again later'}")

    data = resp.json()
    for step in reversed(data.get("steps", [])):
        if step.get("type") != "model_output":
            continue
        for block in reversed(step.get("content", [])):
            if block.get("type") == "audio" and block.get("data"):
                raw = base64.b64decode(block["data"])
                mime = block.get("mime_type") or "audio/wav"
                return raw, mime
    raise HTTPException(502, "Gemini TTS did not return audio for this prompt")
