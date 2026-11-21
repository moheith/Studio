"""Gemini dynamic model discovery, adaptive thinking config, surgical patching, multimodal vision broker, and AI asset generation."""
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

# Models that are specialized non-chat endpoints (embeddings, video/image-only, TTS-only, robotics)
NON_CHAT_MODEL_TOKENS = (
    "-tts",
    "embedding",
    "imagen-",
    "veo-",
    "aqa",
    "lyria-",
    "robotics-",
    "nano-banana",
    "-image-generation",
    "-image-preview",
    "-image",
)

API_REVISION_HEADER = "2026-05-20"


def normalize_model_id(model: str) -> str:
    """Clean a model identifier while strictly preserving the exact model the user selected (including paid/legacy models)."""
    return (model or "").strip().removeprefix("models/")


def normalize_waterfall(models: list[str] | None) -> list[str]:
    """Preserve the user's exact configured waterfall order without rewriting model IDs."""
    raw = models or DEFAULT_WATERFALL_MODELS
    out: list[str] = []
    for item in raw:
        if not isinstance(item, str) or not item.strip():
            continue
        norm = normalize_model_id(item)
        if norm and norm not in out:
            out.append(norm)
    return out or list(DEFAULT_WATERFALL_MODELS)


def is_chat_capable_model(model_obj: dict[str, Any]) -> bool:
    """Return True for any text/multimodal chat generation model (automatically accepts future Google models)."""
    methods = model_obj.get("supportedGenerationMethods") or []
    if "generateContent" not in methods:
        return False
    raw_id = normalize_model_id(str(model_obj.get("name") or "")).lower()
    if not raw_id:
        return False
    for token in NON_CHAT_MODEL_TOKENS:
        if token in raw_id:
            return False
    return True


def _version_tuple(model_id: str) -> tuple[int, int]:
    """Extract primary version numbers dynamically so newer model generations sort to the top automatically."""
    m = re.search(r"(?:gemini|gemma|learnlm)[-_](\d+)(?:\.(\d+))?", model_id.lower())
    if m:
        return int(m.group(1)), int(m.group(2) or 0)
    m2 = re.search(r"(\d+)(?:\.(\d+))?", model_id)
    if m2:
        return int(m2.group(1)), int(m2.group(2) or 0)
    return 0, 0


def rank_chat_model(model_row: dict[str, Any]) -> tuple[Any, ...]:
    """Sort key placing newest flagship Gemini chat models first while keeping every model visible."""
    mid = str(model_row.get("id") or "").lower()
    major, minor = _version_tuple(mid)

    if mid.startswith("gemini-"):
        family_rank = 0
    elif mid.startswith("learnlm-"):
        family_rank = 1
    elif mid.startswith("gemma-"):
        family_rank = 2
    else:
        family_rank = 3

    # Prefer core flagship / pro / argon / flash tiers ahead of lite and older dated snapshots
    if any(k in mid for k in ("argon", "ultra")):
        tier_rank = 0
    elif "pro" in mid and "lite" not in mid:
        tier_rank = 1
    elif "flash" in mid and "lite" not in mid:
        tier_rank = 2
    elif "lite" in mid:
        tier_rank = 3
    else:
        tier_rank = 4

    # Slight preference for canonical aliases over dated checkpoints (-001 / -09-2025)
    is_dated = 1 if re.search(r"-\d{2}-\d{2,4}$|-\d{3}$", mid) else 0
    return (family_rank, -major, -minor, tier_rank, is_dated, mid)


async def fetch_all_chat_models(
    api_key: str,
    gemini_api_base: str,
    client: httpx.AsyncClient | None = None,
) -> list[dict[str, Any]]:
    """Fetch ALL pages of chat-capable models from Google Gemini API automatically (no 50-model truncation)."""
    owns_client = client is None
    if owns_client:
        client = httpx.AsyncClient(timeout=15.0)
    assert client is not None

    seen_ids: set[str] = set()
    rows: list[dict[str, Any]] = []
    page_token: str | None = None

    try:
        for _ in range(5):
            params: dict[str, Any] = {"pageSize": 1000}
            if page_token:
                params["pageToken"] = page_token
            resp = await client.get(
                f"{gemini_api_base}/models",
                headers={"x-goog-api-key": api_key},
                params=params,
            )
            if resp.status_code == 429:
                raise HTTPException(429, "Gemini API rate limit reached")
            if resp.status_code != 200:
                err_msg = ""
                try:
                    err_msg = resp.json().get("error", {}).get("message", "")
                except Exception:
                    pass
                raise HTTPException(
                    502,
                    f"Could not load Gemini models ({resp.status_code}): {err_msg}"
                    if err_msg
                    else f"Could not load Gemini models (HTTP {resp.status_code})",
                )
            payload = resp.json()
            for m in payload.get("models", []):
                if not is_chat_capable_model(m):
                    continue
                mid = normalize_model_id(str(m.get("name") or ""))
                if not mid or mid in seen_ids:
                    continue
                seen_ids.add(mid)
                rows.append(
                    {
                        "id": mid,
                        "display_name": m.get("displayName") or mid,
                        "description": (m.get("description") or "")[:240],
                        "version": m.get("version") or "",
                        "input_token_limit": m.get("inputTokenLimit"),
                        "output_token_limit": m.get("outputTokenLimit"),
                        "thinking": bool(m.get("thinking")),
                    }
                )
            page_token = payload.get("nextPageToken")
            if not page_token:
                break
    finally:
        if owns_client:
            await client.aclose()

    rows.sort(key=rank_chat_model)
    return rows


def pick_best_chat_model(models: list[dict[str, Any]]) -> str | None:
    """Choose the strongest live Gemini chat model available on the user's API key."""
    if not models:
        return None
    ranked = sorted(models, key=rank_chat_model)
    # Prefer top non-lite Gemini model if present
    for row in ranked:
        mid = str(row.get("id") or "").lower()
        if mid.startswith("gemini-") and "lite" not in mid and "exp" not in mid:
            return str(row["id"])
    for row in ranked:
        mid = str(row.get("id") or "").lower()
        if mid.startswith("gemini-"):
            return str(row["id"])
    return str(ranked[0]["id"])


def build_thinking_config(model_id: str, is_antigravity: bool, is_plan_mode: bool) -> dict[str, Any] | None:
    """Build model-safe thinkingConfig so Antigravity streams deep thoughts without causing 400 errors on 2.0/2.5/Gemma."""
    mid = normalize_model_id(model_id).lower()
    if not mid.startswith("gemini-"):
        return None
    major, minor = _version_tuple(mid)
    # Gemini 3.x / 4.x / future generations support thinkingLevel + includeThoughts
    if major >= 3:
        if is_antigravity:
            return {"includeThoughts": True, "thinkingLevel": "high"}
        if is_plan_mode:
            return {"includeThoughts": True, "thinkingLevel": "medium"}
        return {"includeThoughts": True}
    # Gemini 2.5 thinking models support includeThoughts (do NOT pass thinkingLevel on 2.5!)
    if major == 2 and minor >= 5 and is_antigravity:
        return {"includeThoughts": True}
    return None


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
    clean_model = normalize_model_id(model) or "gemini-nano-banana-2.1"
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
    clean_model = normalize_model_id(model) or "gemini-3.8-flash-tts"
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
