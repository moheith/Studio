"""Yulya Studio API. User projects are stored as inert browser assets; this server never runs them."""
from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import json
import logging
import os
import re
import secrets
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import boto3
import httpx
from dotenv import load_dotenv
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from cryptography.fernet import Fernet, InvalidToken
from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel, Field
from pymongo import AsyncMongoClient, ReturnDocument
from pymongo.errors import DuplicateKeyError
from starlette.middleware.trustedhost import TrustedHostMiddleware

load_dotenv()

APP_ENV = os.getenv("APP_ENV", "development").lower()
APP_ORIGIN = os.getenv("APP_ORIGIN", "http://localhost:5173").rstrip("/")
API_ORIGIN = os.getenv("API_ORIGIN", "http://localhost:8000").rstrip("/")
PLAY_ORIGIN = os.getenv("PLAY_ORIGIN", "http://localhost:8788").rstrip("/")
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "true" if APP_ENV == "production" else "false").lower() == "true"
COOKIE_NAME = "yulya_session"
SESSION_SECRET = os.getenv("SESSION_SECRET", "")
KEY_ENCRYPTION_SECRET = os.getenv("API_KEY_ENCRYPTION_SECRET", "")
KEY_HMAC_SECRET = os.getenv("API_KEY_HMAC_SECRET", "")
PREVIEW_TOKEN_SECRET = os.getenv("PREVIEW_TOKEN_SECRET", "")
if APP_ENV != "production":
    # Convenient local-only keys; production startup rejects missing secrets below.
    SESSION_SECRET = SESSION_SECRET or secrets.token_urlsafe(48)
    KEY_ENCRYPTION_SECRET = KEY_ENCRYPTION_SECRET or base64.urlsafe_b64encode(hashlib.sha256(b"yulya-local-development-key").digest()).decode()
    KEY_HMAC_SECRET = KEY_HMAC_SECRET or "yulya-local-development-hmac"
    PREVIEW_TOKEN_SECRET = PREVIEW_TOKEN_SECRET or "yulya-local-development-preview"
MONGODB_URI = os.getenv("MONGODB_URI", "")
DATABASE_NAME = os.getenv("MONGODB_DATABASE", "yulya_studio")
GEMINI_API_BASE = os.getenv("GEMINI_API_BASE", "https://generativelanguage.googleapis.com/v1beta").rstrip("/")
ALLOWED_EXTENSIONS = {
    ".html", ".htm", ".css", ".js", ".mjs", ".cjs", ".json",
    ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".ico",
    ".mp3", ".wav", ".ogg", ".m4a", ".mp4", ".webm",
    ".woff", ".woff2", ".ttf", ".otf",
    ".txt", ".csv", ".tsv", ".atlas", ".fnt", ".glb", ".gltf", ".obj", ".mtl"
}
RESERVED_NAMES = {"api", "auth", "studio", "profile", "settings", "assets", "static", "play", "admin", "health"}
USERNAME_RE = re.compile(r"^[a-z0-9_]{3,24}$")
SLUG_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$")
PH = PasswordHasher()
logger = logging.getLogger("yulya.storage")

if APP_ENV == "production":
    for env_name, value in (("SESSION_SECRET", SESSION_SECRET), ("API_KEY_ENCRYPTION_SECRET", KEY_ENCRYPTION_SECRET), ("API_KEY_HMAC_SECRET", KEY_HMAC_SECRET), ("PREVIEW_TOKEN_SECRET", PREVIEW_TOKEN_SECRET), ("MONGODB_URI", MONGODB_URI)):
        if not value or "replace-with" in value.lower() or "placeholder" in value.lower() or (env_name.endswith("SECRET") and len(value) < 32):
            raise RuntimeError(f"{env_name} must be configured with a production secret/value")
    for env_name in ("APP_ORIGIN", "API_ORIGIN"):
        if not os.getenv(env_name): raise RuntimeError(f"{env_name} must be configured for production")
    for env_name in ("APP_ORIGIN", "API_ORIGIN"):
        if "localhost" in os.getenv(env_name, "").lower() or "example.com" in os.getenv(env_name, "").lower(): raise RuntimeError(f"{env_name} must use the configured production origin")


class Store:
    def __init__(self) -> None:
        self.mongo: AsyncMongoClient | None = None
        self.db: Any = None
        self.memory: dict[str, dict[str, dict[str, Any]]] = {n: {} for n in ("users", "sessions", "projects", "files", "email_codes", "conversations", "rate_limits")}

    async def start(self) -> None:
        if MONGODB_URI:
            self.mongo = AsyncMongoClient(MONGODB_URI, serverSelectionTimeoutMS=6000)
            await self.mongo.admin.command("ping")
            self.db = self.mongo[DATABASE_NAME]
            await self.db.users.create_index("email_norm", unique=True, sparse=True)
            await self.db.users.create_index("username", unique=True, sparse=True)
            await self.db.users.create_index("api_key_fingerprint", unique=True, sparse=True)
            await self.db.sessions.create_index("expires_at", expireAfterSeconds=0)
            await self.db.projects.create_index([("username", 1), ("slug", 1)], unique=True)
            await self.db.projects.create_index([("visibility", 1), ("updated_at", -1)])
            await self.db.files.create_index([("project_id", 1), ("path", 1)], unique=True)
            await self.db.files.create_index([("owner_id", 1), ("project_id", 1)])
            await self.db.email_codes.create_index("expires_at", expireAfterSeconds=0)
            await self.db.conversations.create_index([("project_id", 1), ("created_at", -1)])
            await self.db.conversations.create_index([("owner_id", 1), ("project_id", 1)])
            await self.db.rate_limits.create_index("expires_at", expireAfterSeconds=0)

    async def close(self) -> None:
        if self.mongo:
            await self.mongo.close()

    def collection(self, name: str):
        return self.db[name] if self.db is not None else MemoryCollection(self.memory[name])


class MemoryCollection:
    """Small async adapter for local development when MongoDB is not configured."""
    def __init__(self, data: dict[str, dict[str, Any]]) -> None: self.data = data
    async def find_one(self, query: dict[str, Any]) -> dict[str, Any] | None:
        return next((dict(v) for v in self.data.values() if _matches(v, query)), None)
    async def insert_one(self, doc: dict[str, Any]) -> None:
        key = str(doc.get("_id") or uuid.uuid4()); doc["_id"] = key
        unique = {k: doc[k] for k in ("email_norm", "username", "api_key_fingerprint") if doc.get(k) is not None}
        if unique and await self.find_one(unique): raise DuplicateKeyError("duplicate value")
        self.data[key] = dict(doc)
    async def update_one(self, query: dict[str, Any], update: dict[str, Any], upsert: bool = False) -> None:
        doc = next((v for v in self.data.values() if _matches(v, query)), None)
        if doc is None and upsert:
            doc = dict(query); doc["_id"] = query.get("_id", str(uuid.uuid4())); self.data[str(doc["_id"])] = doc
        if doc is not None:
            updates = update.get("$set", {})
            for field in ("email_norm", "username", "api_key_fingerprint"):
                value = updates.get(field)
                if value is not None and any(other is not doc and other.get(field) == value for other in self.data.values()): raise DuplicateKeyError("duplicate value")
            doc.update(updates); doc.update({k: doc.get(k, 0) + v for k, v in update.get("$inc", {}).items()})
    async def find_one_and_update(self, query: dict[str, Any], update: dict[str, Any], upsert: bool = False, return_document: Any = None):
        await self.update_one(query, update, upsert=upsert); return await self.find_one(query)
    async def delete_one(self, query: dict[str, Any]) -> None:
        key = next((k for k, v in self.data.items() if _matches(v, query)), None)
        if key is not None: self.data.pop(key, None)
    async def delete_many(self, query: dict[str, Any]) -> None:
        for key in [k for k, v in self.data.items() if _matches(v, query)]: self.data.pop(key, None)
    def find(self, query: dict[str, Any], projection: dict[str, int] | None = None):
        rows = [dict(v) for v in self.data.values() if _matches(v, query)]
        if projection and projection.get("content") == 0:
            for row in rows: row.pop("content", None)
        return MemoryCursor(rows)
    async def count_documents(self, query: dict[str, Any]) -> int: return len([1 for v in self.data.values() if _matches(v, query)])


class MemoryCursor:
    def __init__(self, rows: list[dict[str, Any]]): self.rows = rows
    def sort(self, key: str, direction: int): self.rows.sort(key=lambda x: x.get(key, ""), reverse=direction < 0); return self
    def skip(self, n: int): self.rows = self.rows[n:]; return self
    def limit(self, n: int): self.rows = self.rows[:n]; return self
    async def to_list(self, length: int): return self.rows[:length]


def _matches(doc: dict[str, Any], query: dict[str, Any]) -> bool:
    for key, value in query.items():
        if isinstance(value, dict) and "$gt" in value:
            if doc.get(key, 0) <= value["$gt"]: return False
        elif doc.get(key) != value: return False
    return True


store = Store()


class ProjectStorage:
    def __init__(self) -> None:
        self.endpoint = os.getenv("R2_ENDPOINT_URL", "")
        self.private_bucket = os.getenv("R2_PRIVATE_BUCKET", "yulya-private")
        self.public_bucket = os.getenv("R2_PUBLIC_BUCKET", "yulya-public")
        self.local_root = Path(os.getenv("LOCAL_STORAGE_DIR", ".local-data")).resolve()
        self.s3 = None
        if self.endpoint:
            self.s3 = boto3.client("s3", endpoint_url=self.endpoint, aws_access_key_id=os.getenv("R2_ACCESS_KEY_ID"), aws_secret_access_key=os.getenv("R2_SECRET_ACCESS_KEY"), region_name="auto")

    @staticmethod
    def _relative(path: str) -> str:
        if not path or len(path) > 240 or "\0" in path:
            raise HTTPException(400, "Invalid file path")
        raw = path.replace("\\", "/").strip("/")
        if not raw:
            raw = "index.html"
        segments = []
        for p in raw.split("/"):
            if not p or p == ".":
                continue
            if p == "..":
                if segments:
                    segments.pop()
                else:
                    raise HTTPException(400, "Invalid project-relative path")
            else:
                segments.append(p)
        if not segments:
            segments = ["index.html"]
        for p in segments:
            if p.startswith(".") and p != ".keep.json":
                raise HTTPException(400, "Invalid project-relative path")
        ext = Path(segments[-1]).suffix.lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(415, f"Unsupported browser asset type: '{ext}'")
        return "/".join(segments)

    def _key(self, project: dict[str, Any], path: str) -> str:
        if project["visibility"] == "public": return f"{project['username']}/{project['slug']}/{path}"
        return f"{project['owner_id']}/{project['id']}/{path}"

    def _bucket(self, project: dict[str, Any]) -> str:
        return self.public_bucket if project["visibility"] == "public" else self.private_bucket

    def put(self, project: dict[str, Any], path: str, content: bytes) -> None:
        rel = self._relative(path)
        if len(content) > 5 * 1024 * 1024: raise HTTPException(413, "Maximum file size is 5 MiB")
        bucket, key = self._bucket(project), self._key(project, rel)
        if self.s3:
            self.s3.put_object(Bucket=bucket, Key=key, Body=content, ContentType=_mime(rel), CacheControl="no-store")
        else:
            target = (self.local_root / bucket / key).resolve()
            target.relative_to(self.local_root)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)

    def get(self, project: dict[str, Any], path: str) -> bytes:
        rel = self._relative(path); bucket, key = self._bucket(project), self._key(project, rel)
        if self.s3:
            try: return self.s3.get_object(Bucket=bucket, Key=key)["Body"].read()
            except self.s3.exceptions.NoSuchKey: raise HTTPException(404, "File not found")
        target = (self.local_root / bucket / key).resolve(); target.relative_to(self.local_root)
        if not target.is_file(): raise HTTPException(404, "File not found")
        return target.read_bytes()

    def delete(self, project: dict[str, Any], path: str) -> None:
        rel = self._relative(path); bucket, key = self._bucket(project), self._key(project, rel)
        if self.s3: self.s3.delete_object(Bucket=bucket, Key=key)
        else:
            target = (self.local_root / bucket / key).resolve(); target.relative_to(self.local_root)
            if target.is_file(): target.unlink()

    def migrate(self, project: dict[str, Any], files: list[dict[str, Any]], new_visibility: str) -> None:
        old_bucket = self._bucket(project); target_project = {**project, "visibility": new_visibility}; new_bucket = self._bucket(target_project)
        for file in files:
            path = file["path"]
            if self.s3:
                old_key, new_key = self._key(project, path), self._key(target_project, path)
                self.s3.copy_object(Bucket=new_bucket, Key=new_key, CopySource={"Bucket": old_bucket, "Key": old_key}, CacheControl="no-store")
                self.s3.delete_object(Bucket=old_bucket, Key=old_key)
            else:
                old_path = (self.local_root / old_bucket / self._key(project, path)).resolve(); new_path = (self.local_root / new_bucket / self._key(target_project, path)).resolve()
                old_path.relative_to(self.local_root); new_path.relative_to(self.local_root)
                if old_path.exists(): new_path.parent.mkdir(parents=True, exist_ok=True); old_path.replace(new_path)

    def delete_project(self, project: dict[str, Any], files: list[dict[str, Any]]) -> None:
        for file in files: self.delete(project, file["path"])

    def read_for_worker(self, bucket: str, key: str) -> bytes | None:
        if not self.s3: return None
        try: return self.s3.get_object(Bucket=bucket, Key=key)["Body"].read()
        except Exception: return None


files_store = ProjectStorage()
_project_file_locks: dict[str, asyncio.Lock] = {}


def _project_file_lock(project_id: str) -> asyncio.Lock:
    if project_id not in _project_file_locks: _project_file_locks[project_id] = asyncio.Lock()
    return _project_file_locks[project_id]


async def persist_project_file(project: dict[str, Any], path: str, content: bytes, expected_etag: str | None = None, enforce_etag: bool = False) -> str:
    project_id = project["id"]
    async with _project_file_lock(project_id):
        existing = await store.collection("files").find_one({"project_id": project_id, "path": path})
        if enforce_etag and (existing or {}).get("etag") != expected_etag:
            raise HTTPException(409, "This file changed while the edit was in progress. Reload before saving.")
        rows = await file_index(project_id); total = sum(row.get("size", 0) for row in rows)
        if not existing and len(rows) >= 200: raise HTTPException(413, "Project file limit reached")
        if total - (existing or {}).get("size", 0) + len(content) > 50 * 1024 * 1024: raise HTTPException(413, "Project storage limit is 50 MiB")
        etag = hashlib.sha256(content).hexdigest()
        await store.collection("files").update_one(
            {"project_id": project_id, "path": path},
            {"$set": {"owner_id": project["owner_id"], "content": content, "size": len(content), "etag": etag, "updated_at": _now()}},
            upsert=True,
        )
        await store.collection("projects").update_one({"id": project_id}, {"$set": {"updated_at": _now()}})
        return etag


async def remove_project_file(project: dict[str, Any], path: str, expected_etag: str | None = None, enforce_etag: bool = False) -> None:
    project_id = project["id"]
    async with _project_file_lock(project_id):
        existing = await store.collection("files").find_one({"project_id": project_id, "path": path})
        if enforce_etag and (existing or {}).get("etag") != expected_etag:
            raise HTTPException(409, "This file changed while the edit was in progress. Reload before saving.")
        await store.collection("files").delete_one({"project_id": project_id, "path": path})
        await store.collection("projects").update_one({"id": project_id}, {"$set": {"updated_at": _now()}})


def _mime(path: str) -> str:
    ext = Path(path).suffix.lower()
    return {
        ".html": "text/html; charset=utf-8",
        ".htm": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".mjs": "text/javascript; charset=utf-8",
        ".cjs": "text/javascript; charset=utf-8",
        ".json": "application/json",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
        ".ico": "image/x-icon",
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".ogg": "audio/ogg",
        ".m4a": "audio/mp4",
        ".mp4": "video/mp4",
        ".webm": "video/webm",
        ".woff": "font/woff",
        ".woff2": "font/woff2",
        ".ttf": "font/ttf",
        ".otf": "font/otf",
        ".txt": "text/plain; charset=utf-8",
        ".csv": "text/csv; charset=utf-8",
        ".tsv": "text/tab-separated-values; charset=utf-8",
        ".atlas": "text/plain; charset=utf-8",
        ".fnt": "text/plain; charset=utf-8",
        ".glb": "model/gltf-binary",
        ".gltf": "model/gltf+json",
        ".obj": "text/plain; charset=utf-8",
        ".mtl": "text/plain; charset=utf-8",
    }.get(ext, "application/octet-stream")


def _encryptor() -> Fernet:
    if not KEY_ENCRYPTION_SECRET: raise HTTPException(503, "API key encryption is not configured")
    try:
        key = KEY_ENCRYPTION_SECRET.encode() if len(KEY_ENCRYPTION_SECRET) == 44 else base64.urlsafe_b64encode(hashlib.sha256(KEY_ENCRYPTION_SECRET.encode()).digest())
        return Fernet(key)
    except Exception: raise HTTPException(503, "API key encryption configuration is invalid")


def _fingerprint(value: str) -> str:
    if not KEY_HMAC_SECRET: raise HTTPException(503, "API key fingerprinting is not configured")
    return hmac.new(KEY_HMAC_SECRET.encode(), value.encode(), hashlib.sha256).hexdigest()


def _token_hash(token: str) -> str: return hashlib.sha256(token.encode()).hexdigest()
def _now() -> int: return int(time.time())
def _expires(seconds: int) -> datetime: return datetime.now(timezone.utc) + timedelta(seconds=seconds)
def _public_user(doc: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": doc["id"],
        "username": doc.get("username"),
        "email": doc.get("email"),
        "avatar": doc.get("avatar"),
        "has_api_key": bool(doc.get("api_key_ciphertext")),
        "waterfall": doc.get("waterfall") or ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-2.5-pro"],
    }


async def current_user(request: Request) -> dict[str, Any]:
    token = request.cookies.get(COOKIE_NAME)
    if not token: raise HTTPException(401, "Sign in required")
    session = await store.collection("sessions").find_one({"token_hash": _token_hash(token), "expires_at": {"$gt": datetime.now(timezone.utc)}})
    if not session: raise HTTPException(401, "Session expired")
    user = await store.collection("users").find_one({"id": session["user_id"]})
    if not user: raise HTTPException(401, "Account not found")
    request.state.csrf = session["csrf"]
    return user


async def mutating_user(request: Request, user: dict[str, Any] = Depends(current_user), x_csrf_token: str | None = Header(None)) -> dict[str, Any]:
    origin = request.headers.get("origin", "")
    if origin and origin.rstrip("/") != APP_ORIGIN: raise HTTPException(403, "Untrusted request origin")
    if not x_csrf_token or not hmac.compare_digest(x_csrf_token, request.state.csrf): raise HTTPException(403, "CSRF token missing or invalid")
    return user


async def issue_session(user: dict[str, Any], response: Response) -> str:
    token = secrets.token_urlsafe(40); csrf = secrets.token_urlsafe(28)
    await store.collection("sessions").insert_one({"token_hash": _token_hash(token), "user_id": user["id"], "csrf": csrf, "expires_at": _expires(60 * 60 * 24 * 14)})
    response.set_cookie(COOKIE_NAME, token, httponly=True, secure=COOKIE_SECURE, samesite="lax", max_age=60 * 60 * 24 * 14, path="/")
    return csrf


async def rate_limit(scope: str, identity: str, max_requests: int, window: int = 60) -> None:
    col = store.collection("rate_limits"); bucket = f"{scope}:{identity}:{_now() // window}"
    row = await col.find_one_and_update({"_id": bucket}, {"$inc": {"count": 1}, "$set": {"expires_at": _expires(window * 2)}}, upsert=True, return_document=ReturnDocument.AFTER)
    if row and row.get("count", 0) > max_requests: raise HTTPException(429, "Rate limit reached. Try again shortly.")


class RegisterBody(BaseModel): email: str = Field(min_length=5, max_length=254); password: str = Field(min_length=10, max_length=128)
class LoginBody(BaseModel): email: str; password: str
class VerifyBody(BaseModel): email: str; code: str = Field(min_length=6, max_length=6)
class UsernameBody(BaseModel): username: str
class KeyBody(BaseModel): api_key: str = Field(min_length=12, max_length=256)
class ProjectBody(BaseModel): title: str = Field(min_length=1, max_length=60); visibility: str = "private"
class VisibilityBody(BaseModel): visibility: str
class FileBody(BaseModel): content: str = Field(max_length=5 * 1024 * 1024)
class ChatBody(BaseModel): prompt: str = Field(min_length=1, max_length=12000); model: str | None = None; antigravity: bool | None = False
class WaterfallBody(BaseModel): models: list[str]


@asynccontextmanager
async def lifespan(_: FastAPI):
    await store.start()
    # Bring forward files from the previous local/R2 implementation. MongoDB
    # becomes authoritative after migration; new saves never depend on a disk.
    if store.db is not None:
        legacy_files = await store.collection("files").find({"content": {"$exists": False}}).to_list(10000)
        for row in legacy_files:
            project = await store.collection("projects").find_one({"id": row.get("project_id")})
            if not project:
                continue
            try:
                content = files_store.get(project, row["path"])
                await store.collection("files").update_one(
                    {"project_id": row["project_id"], "path": row["path"], "content": {"$exists": False}},
                    {"$set": {"owner_id": project["owner_id"], "content": content, "size": len(content), "etag": hashlib.sha256(content).hexdigest(), "updated_at": _now()}},
                )
            except Exception:
                logger.warning("Legacy project file could not be migrated (project_id=%s, path=%s)", row.get("project_id"), row.get("path"))
    try:
        yield
    finally:
        await store.close()


app = FastAPI(title="Yulya Studio API", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=[APP_ORIGIN], allow_credentials=True, allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"], allow_headers=["Content-Type", "X-CSRF-Token", "If-Match"])


@app.exception_handler(HTTPException)
async def api_error(_: Request, exc: HTTPException): return JSONResponse(status_code=exc.status_code, content={"error": {"message": exc.detail}})


@app.get("/api/health")
async def health(): return {"ok": True, "storage": "mongodb-files" if store.db is not None else "memory-development", "database": "mongodb" if store.db is not None else "memory-development"}


@app.post("/api/auth/register")
async def register(body: RegisterBody, request: Request):
    email = body.email.strip().lower(); await rate_limit("register", email, 5)
    if await store.collection("users").find_one({"email_norm": email}): raise HTTPException(409, "An account already exists for this email")
    code = f"{secrets.randbelow(1_000_000):06d}"; salt = secrets.token_hex(12)
    await store.collection("email_codes").delete_many({"email_norm": email})
    await store.collection("email_codes").insert_one({"email_norm": email, "password_hash": PH.hash(body.password), "code_hash": hashlib.sha256((salt + code).encode()).hexdigest(), "salt": salt, "expires_at": _expires(600), "attempts": 0})
    resend_api_key = os.getenv("RESEND_API_KEY", "")
    if resend_api_key:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                delivery = await client.post(
                    "https://api.resend.com/emails",
                    headers={"Authorization": f"Bearer {resend_api_key}"},
                    json={
                        "from": os.getenv("EMAIL_FROM", ""),
                        "to": [email],
                        "subject": "Your Yulya Studio verification code",
                        "text": f"Your verification code is {code}. It expires in 10 minutes.",
                    },
                )
            if delivery.status_code >= 400:
                raise HTTPException(502, "Email delivery failed; try again later")
        except httpx.HTTPError:
            raise HTTPException(502, "Email delivery failed; try again later") from None
    elif APP_ENV == "development": return {"verification_required": True, "development_code": code, "message": "Configure the email API for delivery; the development code is shown for local testing."}
    else: raise HTTPException(503, "Email verification is not configured")
    return {"verification_required": True, "message": "Check your email for a verification code."}


@app.post("/api/auth/verify-email")
async def verify_email(body: VerifyBody, response: Response):
    email = body.email.strip().lower(); pending = await store.collection("email_codes").find_one({"email_norm": email, "expires_at": {"$gt": datetime.now(timezone.utc)}})
    if not pending or pending.get("attempts", 0) >= 5 or not hmac.compare_digest(pending["code_hash"], hashlib.sha256((pending["salt"] + body.code).encode()).hexdigest()):
        if pending: await store.collection("email_codes").update_one({"_id": pending["_id"]}, {"$inc": {"attempts": 1}})
        raise HTTPException(400, "Verification code is invalid or expired")
    user = {"id": uuid.uuid4().hex, "email": email, "email_norm": email, "password_hash": pending["password_hash"], "created_at": _now(), "username": None}
    try: await store.collection("users").insert_one(user)
    except DuplicateKeyError: raise HTTPException(409, "An account already exists for this email")
    await store.collection("email_codes").delete_many({"email_norm": email})
    csrf = await issue_session(user, response)
    return {"user": _public_user(user), "csrf_token": csrf, "needs_username": True}


@app.post("/api/auth/login")
async def login(body: LoginBody, response: Response, request: Request):
    email = body.email.strip().lower(); await rate_limit("login", email, 10)
    user = await store.collection("users").find_one({"email_norm": email})
    try:
        if not user or not user.get("password_hash"): raise VerifyMismatchError()
        PH.verify(user["password_hash"], body.password)
    except VerifyMismatchError: raise HTTPException(401, "Email or password is incorrect")
    csrf = await issue_session(user, response)
    return {"user": _public_user(user), "csrf_token": csrf, "needs_username": not bool(user.get("username"))}


@app.get("/api/auth/me")
async def me(request: Request, user: dict[str, Any] = Depends(current_user)):
    return {"user": _public_user(user), "csrf_token": request.state.csrf, "needs_username": not bool(user.get("username"))}


@app.post("/api/auth/logout")
async def logout(response: Response, request: Request, user: dict[str, Any] = Depends(mutating_user)):
    token = request.cookies.get(COOKIE_NAME)
    if token: await store.collection("sessions").delete_one({"token_hash": _token_hash(token)})
    response.delete_cookie(COOKIE_NAME, path="/"); return {"ok": True}


@app.post("/api/auth/dev-login")
async def dev_login(response: Response):
    if APP_ENV != "development" or os.getenv("DEV_AUTH_ENABLED", "false").lower() != "true": raise HTTPException(404, "Not found")
    user = await store.collection("users").find_one({"email_norm": "creator@example.test"})
    if not user:
        user = {"id": "local-creator", "email": "creator@example.test", "email_norm": "creator@example.test", "username": "creator", "created_at": _now()}; await store.collection("users").insert_one(user)
    csrf = await issue_session(user, response); response.set_cookie("yulya_csrf", csrf, secure=COOKIE_SECURE, samesite="lax", max_age=60 * 60 * 24 * 14, path="/"); return {"user": _public_user(user), "csrf_token": csrf, "needs_username": False}


@app.put("/api/profile/username")
async def set_username(body: UsernameBody, user: dict[str, Any] = Depends(mutating_user)):
    username = body.username.strip().lower()
    if not USERNAME_RE.fullmatch(username) or username in RESERVED_NAMES: raise HTTPException(400, "Use 3–24 lowercase letters, numbers, or underscores")
    if user.get("username") and user["username"] != username: raise HTTPException(409, "Usernames are immutable once chosen")
    try: await store.collection("users").update_one({"id": user["id"]}, {"$set": {"username": username}})
    except DuplicateKeyError: raise HTTPException(409, "That username is already taken")
    return {"username": username}


@app.get("/api/profile/waterfall")
async def get_user_waterfall(user: dict[str, Any] = Depends(current_user)):
    user_doc = await store.collection("users").find_one({"id": user["id"]})
    wf = (user_doc or {}).get("waterfall") or ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-2.5-pro"]
    return {"waterfall": wf}


@app.put("/api/profile/waterfall")
async def update_user_waterfall(body: WaterfallBody, user: dict[str, Any] = Depends(mutating_user)):
    cleaned = [m.strip().removeprefix("models/") for m in body.models if isinstance(m, str) and m.strip()]
    if not cleaned:
        raise HTTPException(400, "Waterfall must contain at least one model")
    if len(cleaned) > 15:
        raise HTTPException(400, "Waterfall cannot exceed 15 models")
    for m in cleaned:
        if not re.fullmatch(r"[a-zA-Z0-9._-]{3,100}", m):
            raise HTTPException(400, f"Invalid model identifier in waterfall: {m}")
    await store.collection("users").update_one(
        {"id": user["id"]},
        {"$set": {"waterfall": cleaned, "updated_at": _now()}}
    )
    return {"waterfall": cleaned}


@app.post("/api/keys/gemini")
async def set_gemini_key(body: KeyBody, user: dict[str, Any] = Depends(mutating_user)):
    await rate_limit("key-check", user["id"], 5)
    key = body.api_key.strip()
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(f"{GEMINI_API_BASE}/models", headers={"x-goog-api-key": key})
        if resp.status_code == 429:
            raise HTTPException(429, "Gemini rate limit reached while checking this key")
        if resp.status_code != 200:
            err_msg = ""
            try: err_msg = resp.json().get("error", {}).get("message", "")
            except Exception: pass
            raise HTTPException(400, f"Google Gemini API error ({resp.status_code}): {err_msg}" if err_msg else f"Google could not verify this Gemini API key (HTTP {resp.status_code})")
        available = [m for m in resp.json().get("models", []) if "generateContent" in m.get("supportedGenerationMethods", []) and "-tts" not in m.get("name", "")]
        # The API can still list retired models; verify with a current stable
        # Gemini text model first, then use one Gemma text model as requested.
        preferred = ("gemini-3.8-flash", "gemini-3.6-flash", "gemini-3-flash")
        gemini = next((m for wanted in preferred for m in available if m.get("name", "").removeprefix("models/") == wanted), None)
        if gemini is None:
            gemini = next((m for m in available if m.get("name", "").startswith("models/gemini-")), None)
        gemma = next((m for m in available if m.get("name", "").startswith("models/gemma-")), None)
        if not gemini and not gemma: raise HTTPException(400, "This key has no text generation model available for a test request")
        test_model = gemini or gemma
        test = await client.post(f"{GEMINI_API_BASE}/{test_model['name']}:generateContent", headers={"x-goog-api-key": key}, json={"contents": [{"parts": [{"text": "Reply with OK"}]}], "generationConfig": {"maxOutputTokens": 1}})
        fallback_used = bool(gemma and test_model["name"] == gemma["name"])
        if test.status_code != 200 and gemma and gemini and gemma["name"] != test_model["name"]:
            fallback_test = await client.post(f"{GEMINI_API_BASE}/{gemma['name']}:generateContent", headers={"x-goog-api-key": key}, json={"contents": [{"parts": [{"text": "Reply with OK"}]}], "generationConfig": {"maxOutputTokens": 1}})
            if fallback_test.status_code == 200:
                test = fallback_test; test_model = gemma; fallback_used = True
            else:
                test = fallback_test
    if test.status_code != 200:
        err_msg = ""
        try: err_msg = test.json().get("error", {}).get("message", "")
        except Exception: pass
        if test.status_code == 429:
            raise HTTPException(429, f"Google accepted the key, but rate limit / quota exceeded (429): {err_msg}" if err_msg else "Google accepted the key, but the verification model is out of quota. Try again later or check AI Studio quota.")
        raise HTTPException(400, f"Google accepted the key, but {test_model['name'].removeprefix('models/')} verification failed (HTTP {test.status_code}): {err_msg}" if err_msg else f"Google accepted the key, but the {test_model['name'].removeprefix('models/')} verification request failed (HTTP {test.status_code}). Check model availability and quota.")
    fingerprint = _fingerprint(key); existing = await store.collection("users").find_one({"api_key_fingerprint": fingerprint})
    if existing and existing["id"] != user["id"]: raise HTTPException(409, "This API key is already connected to another account")
    ciphertext = _encryptor().encrypt(key.encode()).decode()
    try: await store.collection("users").update_one({"id": user["id"]}, {"$set": {"api_key_fingerprint": fingerprint, "api_key_ciphertext": ciphertext}})
    except DuplicateKeyError: raise HTTPException(409, "This API key is already connected to another account")
    return {"connected": True, "verified_model": test_model["name"].removeprefix("models/"), "fallback_used": fallback_used}


@app.delete("/api/keys/gemini")
async def delete_gemini_key(user: dict[str, Any] = Depends(mutating_user)):
    await store.collection("users").update_one({"id": user["id"]}, {"$set": {"api_key_ciphertext": None, "api_key_fingerprint": None}}); return {"connected": False}


@app.get("/api/models")
async def models(user: dict[str, Any] = Depends(current_user)):
    encrypted = user.get("api_key_ciphertext")
    if not encrypted: return {"models": [], "connected": False}
    try: key = _encryptor().decrypt(encrypted.encode()).decode()
    except InvalidToken: raise HTTPException(503, "Stored key could not be decrypted")
    async with httpx.AsyncClient(timeout=10) as client: resp = await client.get(f"{GEMINI_API_BASE}/models", headers={"x-goog-api-key": key})
    if resp.status_code == 429: raise HTTPException(429, "Gemini API rate limit reached")
    if resp.status_code != 200:
        err_msg = ""
        try: err_msg = resp.json().get("error", {}).get("message", "")
        except Exception: pass
        raise HTTPException(502, f"Could not load Gemini models ({resp.status_code}): {err_msg}" if err_msg else f"Could not load available Gemini models (HTTP {resp.status_code})")
    rows = [{"id": m["name"].removeprefix("models/"), "display_name": m.get("displayName", m["name"]), "input_token_limit": m.get("inputTokenLimit")} for m in resp.json().get("models", []) if "generateContent" in m.get("supportedGenerationMethods", []) and "-tts" not in m["name"]]
    preferred = {"gemini-2.5-pro": 0, "gemini-2.5-flash": 1, "gemini-3.8-flash": 2, "gemini-3.6-flash": 3, "gemini-3-flash": 4}
    rows.sort(key=lambda model: (preferred.get(model["id"], 100), model["display_name"].lower()))
    antigravity_preview_models = [
        {"id": "antigravity-preview-latest", "display_name": "✦ Antigravity (Gemini 3.6 Flash)", "input_token_limit": 2000000},
        {"id": "antigravity-preview-09-2026", "display_name": "✦ Antigravity (Gemini 3.8 Flash)", "input_token_limit": 2000000},
    ]
    existing_ids = {m["id"] for m in rows}
    prepend = [m for m in antigravity_preview_models if m["id"] not in existing_ids]
    rows = prepend + rows
    return {"models": rows, "connected": True}


async def owned_project(user: dict[str, Any], project_id: str) -> dict[str, Any]:
    project = await store.collection("projects").find_one({"id": project_id, "owner_id": user["id"]})
    if not project: raise HTTPException(404, "Project not found")
    return project


async def file_index(project_id: str): return await store.collection("files").find({"project_id": project_id}, {"content": 0}).to_list(500)


async def project_file_content(project: dict[str, Any], path: str) -> bytes:
    row = await store.collection("files").find_one({"owner_id": project["owner_id"], "project_id": project["id"], "path": path})
    if not row or not isinstance(row.get("content"), (bytes, bytearray)):
        raise HTTPException(404, "File not found")
    return bytes(row["content"])


def starter_files(title: str) -> dict[str, str]:
    safe_title = title.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return {"index.html": f'<!doctype html>\n<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{safe_title}</title><link rel="stylesheet" href="style.css"></head><body><main class="game"><span class="spark">✦</span><p>A LITTLE GAME BY YOU</p><h1>{safe_title}</h1><button id="play">Start playing →</button></main><script src="app.js"></script></body></html>', "style.css": "*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#111214;color:#f4f1eb;font:16px system-ui}.game{text-align:center;padding:50px;border:1px solid #38343e;border-radius:20px;background:radial-gradient(ellipse at top,#292137,#151518 70%)}.spark{color:#cbb3ff;font-size:32px}p{font:10px monospace;letter-spacing:.17em;color:#bba6d8}h1{font-size:48px;letter-spacing:-.06em}button{border:0;border-radius:9px;padding:12px 18px;background:#cbb3ff;color:#21182e;font-weight:700;cursor:pointer}", "app.js": "document.querySelector('#play').addEventListener('click',()=>{document.querySelector('h1').textContent='Let’s go!';document.querySelector('#play').textContent='You are the star ✦'})"}


@app.get("/api/projects")
async def list_projects(user: dict[str, Any] = Depends(current_user)):
    rows = await store.collection("projects").find({"owner_id": user["id"]}).sort("updated_at", -1).to_list(100)
    return {"projects": [{k: v for k, v in p.items() if k != "_id"} for p in rows]}


@app.post("/api/projects")
async def create_project(body: ProjectBody, user: dict[str, Any] = Depends(mutating_user)):
    if not user.get("username"): raise HTTPException(409, "Choose a username first")
    if not user.get("api_key_ciphertext"): raise HTTPException(428, "Connect and verify a Gemini API key first")
    slug = re.sub(r"[^a-z0-9-]+", "-", body.title.lower()).strip("-")[:48]
    if not SLUG_RE.fullmatch(slug) or slug in RESERVED_NAMES: raise HTTPException(400, "Project name must form a valid URL slug")
    if body.visibility not in {"private", "public"}: raise HTTPException(400, "Visibility must be private or public")
    await rate_limit("create-project", user["id"], 5)
    if await store.collection("projects").find_one({"username": user["username"], "slug": slug}): raise HTTPException(409, "A project with that URL already exists")
    project = {"id": uuid.uuid4().hex, "owner_id": user["id"], "username": user["username"], "slug": slug, "title": body.title.strip(), "visibility": body.visibility, "created_at": _now(), "updated_at": _now(), "description": "", "plays": 0}
    await store.collection("projects").insert_one(project)
    for path, content in starter_files(project["title"]).items():
        encoded = content.encode()
        await store.collection("files").insert_one({"owner_id": project["owner_id"], "project_id": project["id"], "path": path, "content": encoded, "size": len(encoded), "etag": hashlib.sha256(encoded).hexdigest(), "updated_at": _now()})
    return {"project": {k: v for k, v in project.items() if k != "_id"}}


@app.get("/api/projects/{project_id}/files")
async def list_project_files(project_id: str, user: dict[str, Any] = Depends(current_user)):
    project = await owned_project(user, project_id); rows = await file_index(project_id)
    return {"project": {k: v for k, v in project.items() if k != "_id"}, "files": [{"path": f["path"], "size": f["size"]} for f in rows]}


@app.get("/api/projects/{project_id}/files/{file_path:path}")
async def read_project_file(project_id: str, file_path: str, user: dict[str, Any] = Depends(current_user)):
    project = await owned_project(user, project_id); rel = files_store._relative(file_path)
    row = await store.collection("files").find_one({"project_id": project_id, "path": rel})
    if not row: raise HTTPException(404, "File not found")
    return Response(await project_file_content(project, rel), media_type=_mime(rel), headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "ETag": row.get("etag", "")})


@app.put("/api/projects/{project_id}/files/{file_path:path}")
async def write_project_file(project_id: str, file_path: str, body: FileBody, user: dict[str, Any] = Depends(mutating_user), if_match: str | None = Header(None)):
    project = await owned_project(user, project_id); rel = files_store._relative(file_path); encoded = body.content.encode()
    if len(encoded) > 5 * 1024 * 1024: raise HTTPException(413, "Maximum file size is 5 MiB")
    await rate_limit("write-file", f"{user['id']}:{project_id}", 240)
    etag = await persist_project_file(project, rel, encoded, if_match or None, enforce_etag=bool(if_match))
    return {"path": rel, "etag": etag, "saved_at": _now()}


@app.put("/api/projects/{project_id}/assets/{asset_path:path}")
async def upload_project_asset(project_id: str, asset_path: str, request: Request, user: dict[str, Any] = Depends(mutating_user), if_match: str | None = Header(None)):
    project = await owned_project(user, project_id); rel = files_store._relative(asset_path)
    if Path(rel).suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp", ".gif", ".mp3", ".wav", ".ogg", ".mp4", ".webm", ".woff", ".woff2"}:
        raise HTTPException(415, "Upload only raster image, audio/video, or web font assets")
    try: declared_size = int(request.headers.get("content-length", "0") or 0)
    except ValueError: raise HTTPException(400, "Invalid content length")
    if declared_size > 5 * 1024 * 1024: raise HTTPException(413, "Maximum asset size is 5 MiB")
    content = await request.body()
    if len(content) > 5 * 1024 * 1024: raise HTTPException(413, "Maximum asset size is 5 MiB")
    await rate_limit("write-file", f"{user['id']}:{project_id}", 240)
    etag = await persist_project_file(project, rel, content, if_match or None, enforce_etag=bool(if_match))
    return {"path": rel, "etag": etag, "size": len(content)}


@app.delete("/api/projects/{project_id}/files/{file_path:path}")
async def delete_project_file(project_id: str, file_path: str, user: dict[str, Any] = Depends(mutating_user)):
    project = await owned_project(user, project_id); rel = files_store._relative(file_path)
    if rel == "index.html": raise HTTPException(400, "A project must keep its index.html entrypoint")
    await remove_project_file(project, rel)
    return {"deleted": rel}


@app.patch("/api/projects/{project_id}/visibility")
async def set_visibility(project_id: str, body: VisibilityBody, user: dict[str, Any] = Depends(mutating_user)):
    if body.visibility not in {"private", "public"}: raise HTTPException(400, "Visibility must be private or public")
    project = await owned_project(user, project_id)
    if body.visibility == project["visibility"]: return {"visibility": project["visibility"]}
    rows = await file_index(project_id)
    if body.visibility == "public" and not any(x["path"] == "index.html" for x in rows): raise HTTPException(400, "Add index.html before making this game public")
    await store.collection("projects").update_one({"id": project_id}, {"$set": {"visibility": body.visibility, "updated_at": _now()}})
    return {"visibility": body.visibility, "url": f"{API_ORIGIN}/api/games/{project['username']}/{project['slug']}/index.html" if body.visibility == "public" else None}


@app.delete("/api/projects/{project_id}")
async def delete_project(project_id: str, user: dict[str, Any] = Depends(mutating_user)):
    project = await owned_project(user, project_id)
    await store.collection("files").delete_many({"project_id": project_id}); await store.collection("projects").delete_one({"id": project_id}); return {"deleted": True}


@app.get("/api/gallery")
async def gallery(limit: int = 24, skip: int = 0):
    limit = max(1, min(limit, 60)); rows = await store.collection("projects").find({"visibility": "public"}).sort("updated_at", -1).skip(max(0, skip)).limit(limit).to_list(limit)
    return {"projects": [{k: v for k, v in p.items() if k not in {"_id", "owner_id"}} for p in rows]}


@app.get("/api/profiles/{username}")
async def profile(username: str):
    user = await store.collection("users").find_one({"username": username.lower()})
    if not user: raise HTTPException(404, "Creator not found")
    rows = await store.collection("projects").find({"owner_id": user["id"], "visibility": "public"}).sort("updated_at", -1).limit(100).to_list(100)
    return {"profile": {"username": user["username"], "avatar": user.get("avatar")}, "projects": [{k: v for k, v in p.items() if k not in {"_id", "owner_id"}} for p in rows]}


@app.post("/api/projects/{project_id}/remix")
async def remix_project(project_id: str, user: dict[str, Any] = Depends(mutating_user)):
    source = await store.collection("projects").find_one({"id": project_id, "visibility": "public"})
    if not source: raise HTTPException(404, "Public game not found")
    if not user.get("username"): raise HTTPException(409, "Choose a username first")
    if not user.get("api_key_ciphertext"): raise HTTPException(428, "Connect a Gemini key before creating projects")
    title = (source["title"] + " remix")[:60]; slug_base = re.sub(r"[^a-z0-9-]+", "-", title.lower()).strip("-")[:44]; slug = slug_base
    suffix = 2
    while await store.collection("projects").find_one({"username": user["username"], "slug": slug}): slug = f"{slug_base[:44]}-{suffix}"; suffix += 1
    clone = {"id": uuid.uuid4().hex, "owner_id": user["id"], "username": user["username"], "slug": slug, "title": title, "description": f"Remix of @{source['username']}/{source['slug']}", "visibility": "private", "created_at": _now(), "updated_at": _now(), "forked_from": source["id"], "plays": 0}
    await store.collection("projects").insert_one(clone)
    for f in await file_index(project_id):
        data = await project_file_content(source, f["path"])
        await store.collection("files").insert_one({"owner_id": clone["owner_id"], "project_id": clone["id"], "path": f["path"], "content": data, "size": len(data), "etag": hashlib.sha256(data).hexdigest(), "updated_at": _now()})
    return {"project": {k: v for k, v in clone.items() if k != "_id"}}


def preview_token(project: dict[str, Any], ttl: int = 86400) -> str:
    if not PREVIEW_TOKEN_SECRET: raise HTTPException(503, "Preview token signing is not configured")
    payload = base64.urlsafe_b64encode(json.dumps({"uid": project["owner_id"], "pid": project["id"], "exp": _now() + ttl}, separators=(",", ":")).encode()).decode().rstrip("=")
    signature = hmac.new(PREVIEW_TOKEN_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return payload + "." + signature


@app.post("/api/projects/{project_id}/preview-token")
async def issue_preview_token(project_id: str, user: dict[str, Any] = Depends(mutating_user)):
    project = await owned_project(user, project_id)
    token = preview_token(project, ttl=86400)
    url = f"{API_ORIGIN}/api/worker/private/{project['owner_id']}/{project['id']}/{token}/index.html"
    return {"url": url, "expires_in": 86400}


async def get_project_conversation_turns(owner_id: str, project_id: str, limit: int = 100) -> list[dict[str, Any]]:
    # 1. Check if unified single-document thread exists
    doc = await store.collection("conversations").find_one({"owner_id": owner_id, "project_id": project_id, "turns": {"$exists": True}})
    if doc and isinstance(doc.get("turns"), list):
        turns = doc["turns"]
        return turns[-limit:] if limit else turns
    # 2. Check legacy per-turn documents
    rows = await store.collection("conversations").find({"owner_id": owner_id, "project_id": project_id, "turns": {"$exists": False}}).sort("created_at", -1).limit(limit).to_list(limit)
    rows.reverse()
    return [{"id": row.get("id", str(row.get("_id", ""))), "prompt": row.get("prompt", ""), "response": row.get("response", ""), "thought": row.get("thought", ""), "model": row.get("model", ""), "created_at": row.get("created_at", 0), "status": row.get("status", "complete"), "telemetry": row.get("telemetry")} for row in rows]


async def record_conversation_turn_start(owner_id: str, project_id: str, turn: dict[str, Any]) -> None:
    col = store.collection("conversations")
    if store.db is not None:
        doc = await col.find_one({"owner_id": owner_id, "project_id": project_id, "turns": {"$exists": True}})
        if doc:
            await col.update_one(
                {"owner_id": owner_id, "project_id": project_id, "turns": {"$exists": True}},
                {
                    "$set": {"updated_at": _now()},
                    "$push": {"turns": {"$each": [turn], "$slice": -100}}
                }
            )
        else:
            legacy_rows = await col.find({"owner_id": owner_id, "project_id": project_id, "turns": {"$exists": False}}).sort("created_at", 1).to_list(100)
            existing_turns = [{"id": r.get("id", str(r.get("_id", ""))), "prompt": r.get("prompt", ""), "response": r.get("response", ""), "thought": r.get("thought", ""), "model": r.get("model", ""), "created_at": r.get("created_at", 0), "status": r.get("status", "complete"), "telemetry": r.get("telemetry")} for r in legacy_rows]
            all_turns = (existing_turns + [turn])[-100:]
            await col.delete_many({"owner_id": owner_id, "project_id": project_id, "turns": {"$exists": False}})
            await col.update_one(
                {"owner_id": owner_id, "project_id": project_id},
                {"$set": {"owner_id": owner_id, "project_id": project_id, "turns": all_turns, "updated_at": _now()}},
                upsert=True
            )
    else:
        doc = await col.find_one({"owner_id": owner_id, "project_id": project_id})
        if not doc or "turns" not in doc:
            await col.update_one({"owner_id": owner_id, "project_id": project_id}, {"$set": {"owner_id": owner_id, "project_id": project_id, "turns": [turn], "updated_at": _now()}}, upsert=True)
        else:
            turns = (doc.get("turns", []) + [turn])[-100:]
            await col.update_one({"owner_id": owner_id, "project_id": project_id}, {"$set": {"turns": turns, "updated_at": _now()}})


async def record_conversation_turn_complete(owner_id: str, project_id: str, turn_id: str, response_text: str, thought_text: str = "", status: str = "complete", telemetry: dict[str, Any] | None = None) -> None:
    col = store.collection("conversations")
    update_data: dict[str, Any] = {
        "turns.$.response": response_text[:64000],
        "turns.$.thought": thought_text[:64000],
        "turns.$.status": status,
        "turns.$.completed_at": _now(),
        "updated_at": _now()
    }
    if telemetry:
        update_data["turns.$.telemetry"] = telemetry

    if store.db is not None:
        await col.update_one(
            {"owner_id": owner_id, "project_id": project_id, "turns.id": turn_id},
            {"$set": update_data}
        )
    else:
        doc = await col.find_one({"owner_id": owner_id, "project_id": project_id})
        if doc and "turns" in doc:
            for t in doc["turns"]:
                if t.get("id") == turn_id:
                    t["response"] = response_text[:64000]
                    t["thought"] = thought_text[:64000]
                    t["status"] = status
                    t["completed_at"] = _now()
                    if telemetry:
                        t["telemetry"] = telemetry
                    break
            await col.update_one({"owner_id": owner_id, "project_id": project_id}, {"$set": {"turns": doc["turns"], "updated_at": _now()}})


@app.get("/api/projects/{project_id}/ai/history")
async def ai_history(project_id: str, user: dict[str, Any] = Depends(current_user)):
    await owned_project(user, project_id)
    turns = await get_project_conversation_turns(user["id"], project_id, limit=100)
    return {"conversations": turns}


@app.delete("/api/projects/{project_id}/ai/history")
async def clear_ai_history(project_id: str, user: dict[str, Any] = Depends(mutating_user)):
    await owned_project(user, project_id)
    await store.collection("conversations").delete_many({"owner_id": user["id"], "project_id": project_id})
    return {"cleared": True}


async def gemini_key(user: dict[str, Any]) -> str:
    try: return _encryptor().decrypt(user["api_key_ciphertext"].encode()).decode()
    except (KeyError, InvalidToken): raise HTTPException(428, "Connect a valid Gemini API key first")


@app.post("/api/projects/{project_id}/ai/stream")
async def ai_stream(project_id: str, body: ChatBody, user: dict[str, Any] = Depends(mutating_user)):
    project = await owned_project(user, project_id); await rate_limit("ai-request", user["id"], 20)
    api_key = await gemini_key(user)
    if not body.model: raise HTTPException(400, "Choose an available model first")
    raw_model = body.model.removeprefix("models/")
    if raw_model.startswith("antigravity:"):
        raw_model = raw_model.split(":", 1)[1]
    is_antigravity = bool(body.antigravity) or "antigravity" in raw_model.lower()
    if "09-2026" in raw_model:
        model = "gemini-3.8-flash"
        saved_model_name = "✦ Antigravity (Gemini 3.8 Flash)"
    elif "antigravity" in raw_model.lower():
        model = "gemini-3.6-flash"
        saved_model_name = "✦ Antigravity (Gemini 3.6 Flash)"
    else:
        model = raw_model
        saved_model_name = f"✦ Antigravity ({model})" if is_antigravity else model
    if not re.fullmatch(r"[a-zA-Z0-9._-]{3,100}", model): raise HTTPException(400, "Invalid model identifier")
    previous_turns = await get_project_conversation_turns(user["id"], project_id, limit=100 if is_antigravity else 20)
    messages = await file_index(project_id); file_context = {}; baseline_etags = {item["path"]: item.get("etag") for item in messages}
    # Full project file context: include all code and data files with no arbitrary file count limit
    for item in messages:
        if item["path"].lower().endswith((".html", ".css", ".js", ".mjs", ".json", ".txt", ".csv", ".tsv")):
            file_context[item["path"]] = (await project_file_content(project, item["path"])).decode("utf-8", "replace")[:60000]
    tool_declarations = [{"functionDeclarations": [
        {
            "name": "list_files",
            "description": "List all file paths present in the current browser game project.",
            "parameters": {"type": "OBJECT", "properties": {}}
        },
        {
            "name": "read_file",
            "description": "Read the complete UTF-8 text content of a file in the project. Use this to inspect code before modifying it.",
            "parameters": {
                "type": "OBJECT",
                "properties": {
                    "path": {"type": "STRING", "description": "The relative path of the file to read (e.g. 'app.js', 'style.css')."}
                },
                "required": ["path"]
            }
        },
        {
            "name": "create_file",
            "description": "Create a new file in the project with specified relative path and initial content. If the file is in a subdirectory (e.g. 'js/player.js' or 'assets/map.json'), any parent folders are automatically created.",
            "parameters": {
                "type": "OBJECT",
                "properties": {
                    "path": {"type": "STRING", "description": "The relative path of the file to create (e.g. 'js/utils.js', 'assets/enemies.json')."},
                    "content": {"type": "STRING", "description": "The complete initial text content for the new file."}
                },
                "required": ["path"]
            }
        },
        {
            "name": "create_folder",
            "description": "Create a new folder or directory in the project to organize code and assets (e.g. 'assets', 'audio', 'src/levels', 'components').",
            "parameters": {
                "type": "OBJECT",
                "properties": {
                    "folder_path": {"type": "STRING", "description": "The relative directory path to create (e.g. 'assets/sprites', 'audio', 'components')."}
                },
                "required": ["folder_path"]
            }
        },
        {
            "name": "write_file",
            "description": "Create a new file or completely overwrite an existing file with new content. Parameter 'path': relative path (e.g., 'app.js', 'style.css', 'index.html'). Parameter 'content': complete, fully working source code without any placeholders or truncation.",
            "parameters": {
                "type": "OBJECT",
                "properties": {
                    "path": {"type": "STRING", "description": "The relative path of the file to write (e.g. 'index.html', 'style.css', 'app.js')."},
                    "content": {"type": "STRING", "description": "The complete, entire text content of the file. Must not contain truncation or 'rest of code' placeholders."}
                },
                "required": ["path", "content"]
            }
        },
        {
            "name": "delete_file",
            "description": "Delete an unwanted or obsolete file from the project. Parameter 'path': relative path to delete (cannot delete 'index.html').",
            "parameters": {
                "type": "OBJECT",
                "properties": {
                    "path": {"type": "STRING", "description": "The relative path of the file to delete."}
                },
                "required": ["path"]
            }
        },
        {
            "name": "search_files",
            "description": "Search text across all code files in the project for a case-insensitive literal string. Parameter 'query': string to search for.",
            "parameters": {
                "type": "OBJECT",
                "properties": {
                    "query": {"type": "STRING", "description": "The literal text string to search for across project files."}
                },
                "required": ["query"]
            }
        },
        {
            "name": "request_reload",
            "description": "Notify the editor to reload the live game preview iframe immediately so that recent file changes take effect.",
            "parameters": {"type": "OBJECT", "properties": {}}
        },
    ]}]

    if is_antigravity:
        system = (
            "You are Antigravity, an elite autonomous AI game developer, engine architect, and pair programmer built directly inside Yulya Studio (https://studio.yulya.me).\n"
            "Your mission is to autonomously design, code, debug, expand, and polish production-ready web games using HTML5 Canvas, modern CSS, vanilla JavaScript (or ES modules), and the Web Audio API.\n\n"
            "=== PLATFORM & ENVIRONMENT ARCHITECTURE ===\n"
            "1. Host Platform: Yulya Studio — an in-browser game studio and IDE with Monaco Editor, Live Preview Iframe, and Sandboxed Runtime.\n"
            "2. Isolated Client-Side Iframe: Every game runs directly inside the creator's browser in an isolated <iframe>. The server automatically injects a dynamic `<base href=\"...\">` tag and a runtime error-reporting bridge into `<head>`.\n"
            "3. Entrypoint: Every project MUST have an 'index.html' file at its root. It serves as the primary canvas, UI container, and script loader. 'index.html' cannot be deleted.\n"
            "4. File System & Folders:\n"
            "   - Supported code & data formats: '.html', '.css', '.js', '.mjs', '.json', '.csv', '.tsv', '.txt'.\n"
            "   - Static media: Raster images (.png, .jpg, .webp, .gif), sound effects/music (.mp3, .wav, .ogg), and fonts (.woff2) uploaded by the user. Always reference them using relative paths (e.g. 'assets/player.png').\n"
            "   - Directory Structure & '.keep.json': Empty directories in Yulya Studio are preserved in MongoDB with a marker file named '.keep.json' (e.g. 'assets/.keep.json', 'audio/.keep.json').\n"
            "     * The Yulya Studio UI automatically hides '.keep.json' from the visual explorer tree so creators see clean folder structures.\n"
            "     * NEVER delete '.keep.json' files unless the user explicitly requests the deletion of that entire folder.\n"
            "     * When structuring code or assets, call `create_folder(folder_path)` to organize modular directories (e.g. 'js', 'assets', 'levels').\n\n"
            "=== CRITICAL CODING STANDARDS & PITFALL PREVENTION ===\n"
            "1. MULTI-FILE SCRIPT LOADING (STRICT REQUIREMENT):\n"
            "   - When splitting code across multiple JavaScript files (e.g. 'graphics.js', 'player.js', 'audio.js', 'enemies.js'):\n"
            "     * Classic Script Model (Recommended): Attach classes/objects to `window` (e.g. `window.SpriteManager = { ... };`). In 'index.html', load them in proper dependency order BEFORE 'app.js' (e.g. `<script src=\"graphics.js\"></script><script src=\"app.js\"></script>`).\n"
            "     * CRITICAL BROWSER RULE: In classic `<script>` tags, NEVER write raw `export` or `import` statements! Modern browsers immediately throw fatal `Uncaught SyntaxError: Unexpected token 'export'`, halting script execution completely.\n"
            "     * ES Module Model: If you choose to use `import`/`export`, you MUST explicitly declare `<script type=\"module\" src=\"app.js\"></script>` in 'index.html'.\n"
            "     * Always use defensive checks before calling module methods (e.g. `if (typeof SpriteManager !== 'undefined' && typeof SpriteManager.generateAll === 'function')`).\n\n"
            "2. START SCREEN & EVENT BINDING:\n"
            "   - Start/Play buttons (e.g. '#btn-start', '#play') MUST attach 'click', 'touchend', and 'pointerdown' event listeners to ensure immediate responsiveness across desktop mice and mobile touchscreens.\n"
            "   - When gameplay starts, add the '.hidden' class to the start screen (`startScreen.classList.add('hidden')`) and remove '.hidden' from the HUD.\n"
            "   - In 'style.css', verify `.ui-screen.hidden { display: none !important; }` so the menu disappears completely.\n"
            "   - Initialize or resume the Web Audio context (`audioCtx.resume()`) inside the user interaction handler to satisfy browser autoplay security policies.\n\n"
            "3. PROCEDURAL AUDIO (WEB AUDIO API):\n"
            "   - NEVER reference non-existent local .mp3 or .wav audio files unless they already exist in the project.\n"
            "   - Synthesize all sound effects (laser fire, explosions, jumps, coin chimes, engine rumble, powerups, game-over tunes) procedurally using the browser's native Web Audio API (AudioContext, OscillatorNode, GainNode, BiquadFilterNode).\n\n"
            "4. CANVAS RENDERING & RESPONSIVE CONTROLS:\n"
            "   - High-DPI Display Awareness: Scale the canvas buffer according to `window.devicePixelRatio || 1` so graphics remain crisp on Retina and mobile screens.\n"
            "   - Dual Controls: Support BOTH keyboard (Arrow keys, WASD, Space, Enter) AND touch/pointer controls (onscreen buttons, virtual joystick, or pointer drag) so every game is instantly playable on phones and desktops.\n"
            "   - Game Loop: Run smooth 60fps loops via `requestAnimationFrame(loop)` and calculate delta time (`dt`) for consistent gameplay across variable monitor refresh rates (60Hz, 120Hz, 144Hz).\n\n"
            "=== YOUR AGENTIC TOOLKIT (HOW & WHEN TO USE) ===\n"
            "You have 8 specialized tools to interact directly with project files. Always use them proactively:\n"
            "1. `list_files()`: Discover all files and folder hierarchy in the current project.\n"
            "2. `read_file(path)`: Inspect full code or data in a file before modifying it.\n"
            "3. `create_file(path, content)`: Create new code or data files (e.g. 'js/physics.js', 'assets/levels.json'). Parent folders are created automatically.\n"
            "4. `create_folder(folder_path)`: Create new folders (e.g. 'js', 'assets', 'levels', 'audio') to organize project code.\n"
            "5. `write_file(path, content)`: Overwrite or update files. CRITICAL: Always provide COMPLETE, PRODUCTION-READY, FULLY FUNCTIONAL code. NEVER omit lines, NEVER use lazy placeholders like '// ... existing code ...' or '/* add styles here */'. Write the full file content from start to finish.\n"
            "6. `delete_file(path)`: Delete unwanted or obsolete files. ('index.html' cannot be deleted).\n"
            "7. `search_files(query)`: Search across project files for variable names, function declarations, or strings.\n"
            "8. `request_reload()`: ALWAYS invoke this tool after modifying or creating files so the live game preview immediately reloads with your latest changes.\n\n"
            "=== AUTONOMOUS EXECUTION WORKFLOW ===\n"
            "1. Analyze the user request thoroughly against the existing project code.\n"
            "2. Proactively invoke `write_file` or `create_file` to apply all necessary updates to HTML, CSS, and JS.\n"
            "3. Call `request_reload()` so the preview iframe refreshes immediately.\n"
            "4. In your final text response, provide a clean, helpful summary of what was added or fixed, along with controls/instructions on how to play."
        )
    else:
        system = (
            "You are Yulya Studio's AI coding assistant (https://studio.yulya.me). "
            "You help creators design, code, and polish browser games using HTML5 Canvas, CSS, JavaScript, and Web Audio API. "
            "Games run inside an isolated client-side iframe sandbox with 'index.html' as the root entrypoint. "
            "When creating multiple JS files, expose classes/functions on window and link them in 'index.html' before 'app.js'. Never use raw export/import in classic script tags. "
            "Empty folders are tracked with '.keep.json' and hidden in the UI; do not delete them. "
            "Use the provided project tools (`write_file`, `create_file`, `create_folder`, `read_file`, `list_files`, `request_reload`) to perform edits. Always write complete, working code and call `request_reload` when done."
        )

    turn_id = uuid.uuid4().hex
    turn = {"id": turn_id, "prompt": body.prompt, "response": "", "model": saved_model_name, "status": "running", "created_at": _now()}
    await record_conversation_turn_start(user["id"], project_id, turn)

    user_doc = await store.collection("users").find_one({"id": user["id"]})
    user_waterfall = (user_doc or {}).get("waterfall") or ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-2.5-pro"]
    chain_models = [model]
    for wm in user_waterfall:
        clean_m = wm.strip().removeprefix("models/")
        if clean_m and clean_m not in chain_models:
            chain_models.append(clean_m)
    chain_info = [{"model": cm, "alias": f"M{i+1}"} for i, cm in enumerate(chain_models)]

    async def stream():
        status_msg = "Antigravity Agent analyzing project context…" if is_antigravity else "Reading project context…"
        yield "event: status\ndata: " + json.dumps({"message": status_msg}) + "\n\n"
        contents = []
        for prior in previous_turns:
            if prior.get("prompt"):
                contents.append({"role": "user", "parts": [{"text": prior["prompt"][:25000]}]})
            if prior.get("response"):
                contents.append({"role": "model", "parts": [{"text": prior["response"][:25000]}]})
        contents.append({"role": "user", "parts": [{"text": f"Project files (current state):\n{json.dumps(file_context, indent=1)}\n\nUser Request: {body.prompt}"}]})
        calls = 0
        response_text: list[str] = []
        thought_text: list[str] = []
        max_calls = 50 if is_antigravity else 20
        telemetry_models: list[dict[str, Any]] = []
        turn_start_time = time.time()
        current_chain_idx = 0

        async with httpx.AsyncClient(timeout=httpx.Timeout(3000.0, connect=30.0)) as client:
            while calls < max_calls:
                active_info = chain_info[current_chain_idx]
                active_model = active_info["model"]
                active_alias = active_info["alias"]

                model_start_time = time.time()
                input_tokens = 0
                output_tokens = 0
                total_tokens = 0

                request_body = {
                    "systemInstruction": {"parts": [{"text": system}]},
                    "contents": contents,
                    "tools": tool_declarations,
                    "generationConfig": {"temperature": 0.2}
                }

                failed_reason: str | None = None
                full_parts: list[dict[str, Any]] = []
                turn_interrupted_by_tokens = False

                try:
                    async with client.stream(
                        "POST",
                        f"{GEMINI_API_BASE}/models/{active_model}:streamGenerateContent?alt=sse",
                        headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
                        json=request_body
                    ) as resp:
                        if resp.status_code == 429:
                            raw_body = await resp.aread()
                            err_text = ""
                            try:
                                err_data = json.loads(raw_body.decode())
                                err_text = err_data.get("error", {}).get("message") or err_data.get("message") or ""
                            except Exception: pass
                            failed_reason = f"Rate limit reached (429): {err_text}" if err_text else "Rate limit reached (429)"
                        elif resp.status_code != 200:
                            raw_body = await resp.aread()
                            err_text = ""
                            try:
                                err_data = json.loads(raw_body.decode())
                                err_text = err_data.get("error", {}).get("message") or err_data.get("message") or ""
                            except Exception:
                                err_text = raw_body.decode("utf-8", "replace")[:500]
                            failed_reason = f"API error ({resp.status_code}): {err_text}" if err_text else f"API error ({resp.status_code})"
                        else:
                            async for line in resp.aiter_lines():
                                if not line.startswith("data: "): continue
                                try: payload = json.loads(line[6:])
                                except json.JSONDecodeError: continue

                                if payload.get("error"):
                                    err_msg = payload["error"].get("message") or json.dumps(payload["error"])
                                    failed_reason = f"Stream error: {err_msg}"
                                    break

                                if payload.get("promptFeedback", {}).get("blockReason"):
                                    reason = payload["promptFeedback"]["blockReason"]
                                    failed_reason = f"Safety block: {reason}"
                                    break

                                if "usageMetadata" in payload:
                                    u = payload["usageMetadata"]
                                    input_tokens = u.get("promptTokenCount", input_tokens)
                                    output_tokens = u.get("candidatesTokenCount", output_tokens)
                                    total_tokens = u.get("totalTokenCount", total_tokens)

                                for candidate in payload.get("candidates", []):
                                    if candidate.get("finishReason") == "MAX_TOKENS":
                                        turn_interrupted_by_tokens = True

                                    for part in candidate.get("content", {}).get("parts", []):
                                        if part.get("thought"):
                                            t = part.get("text", "")
                                            if t:
                                                thought_text.append(t)
                                                yield "event: thought\ndata: " + json.dumps({"text": t}) + "\n\n"
                                        elif part.get("text"):
                                            response_text.append(part["text"])
                                            yield "event: token\ndata: " + json.dumps({"text": part["text"]}) + "\n\n"
                                        if part.get("functionCall"):
                                            full_parts.append(part)
                except httpx.TimeoutException:
                    failed_reason = "Request timed out after 3000 seconds with no response"
                except Exception as exc:
                    failed_reason = f"Connection error: {str(exc)}"

                model_duration = round(time.time() - model_start_time, 2)
                if total_tokens == 0:
                    output_tokens = len("".join(response_text)) // 4
                    input_tokens = len(json.dumps(contents)) // 4
                    total_tokens = input_tokens + output_tokens

                if failed_reason or turn_interrupted_by_tokens:
                    effective_reason = failed_reason or "Output token limit reached (MAX_TOKENS)"
                    if current_chain_idx + 1 < len(chain_info):
                        telemetry_models.append({
                            "name": active_model,
                            "alias": active_alias,
                            "input_tokens": input_tokens,
                            "output_tokens": output_tokens,
                            "total_tokens": total_tokens,
                            "duration_seconds": model_duration,
                            "status": "cascaded",
                            "error": effective_reason
                        })
                        current_chain_idx += 1
                        next_info = chain_info[current_chain_idx]
                        trans_event = {
                            "from_model": active_model,
                            "from_alias": active_alias,
                            "to_model": next_info["model"],
                            "to_alias": next_info["alias"],
                            "reason": effective_reason
                        }
                        yield "event: waterfall_transition\ndata: " + json.dumps(trans_event) + "\n\n"
                        trans_thought = f"\n⚡ [{active_alias}: {active_model} error: {effective_reason}] ➔ Cascaded to {next_info['alias']}: {next_info['model']}\n"
                        thought_text.append(trans_thought)
                        yield "event: thought\ndata: " + json.dumps({"text": trans_thought}) + "\n\n"
                        if turn_interrupted_by_tokens:
                            contents.append({"role": "user", "parts": [{"text": "Continue writing the remaining code or response starting directly from where it stopped. Do not repeat earlier lines."}]})
                        continue
                    else:
                        final_err = f"All waterfall models exhausted. Last model ({active_alias}: {active_model}) error: {effective_reason}"
                        telemetry_models.append({
                            "name": active_model,
                            "alias": active_alias,
                            "input_tokens": input_tokens,
                            "output_tokens": output_tokens,
                            "total_tokens": total_tokens,
                            "duration_seconds": model_duration,
                            "status": "failed",
                            "error": effective_reason
                        })
                        total_turn_tokens = sum(m.get("total_tokens", 0) for m in telemetry_models)
                        total_turn_duration = round(time.time() - turn_start_time, 2)
                        telemetry_payload = {
                            "models": telemetry_models,
                            "total_tokens": total_turn_tokens,
                            "total_duration": total_turn_duration
                        }
                        await record_conversation_turn_complete(
                            user["id"], project_id, turn_id, "".join(response_text),
                            thought_text="".join(thought_text), status="error",
                            telemetry=telemetry_payload
                        )
                        yield "event: telemetry\ndata: " + json.dumps(telemetry_payload) + "\n\n"
                        yield "event: error\ndata: " + json.dumps({"message": final_err}) + "\n\n"
                        return

                if not full_parts:
                    telemetry_models.append({
                        "name": active_model,
                        "alias": active_alias,
                        "input_tokens": input_tokens,
                        "output_tokens": output_tokens,
                        "total_tokens": total_tokens,
                        "duration_seconds": model_duration,
                        "status": "completed"
                    })
                    break

                contents.append({"role":"model","parts":full_parts}); function_results = []
                for part in full_parts:
                    call = part["functionCall"]; name = call.get("name"); args = call.get("args", {}); result: dict[str, Any]
                    tool_desc = ""
                    if name == "create_file": tool_desc = f"Creating file: {args.get('path', '')}"
                    elif name == "create_folder": tool_desc = f"Creating folder: {args.get('folder_path', '')}"
                    elif name == "write_file": tool_desc = f"Writing file: {args.get('path', '')}"
                    elif name == "read_file": tool_desc = f"Reading file: {args.get('path', '')}"
                    elif name == "delete_file": tool_desc = f"Deleting file: {args.get('path', '')}"
                    elif name == "search_files": tool_desc = f"Searching files for '{args.get('query', '')}'"
                    elif name == "list_files": tool_desc = "Scanning project files"
                    elif name == "request_reload": tool_desc = "Live preview reloaded"
                    if tool_desc:
                        action_msg = f"\n→ [Action] {tool_desc}\n"
                        thought_text.append(action_msg)
                        yield "event: thought\ndata: " + json.dumps({"text": action_msg}) + "\n\n"
                    try:
                        if name == "list_files": result = {"files": [f["path"] for f in await file_index(project_id)]}
                        elif name == "read_file": result = {"content": (await project_file_content(project, files_store._relative(args["path"]))).decode("utf-8", "replace")[:50000]}
                        elif name == "create_file":
                            if not isinstance(args.get("path"), str): raise HTTPException(400, "File path must be text")
                            rel = files_store._relative(args["path"])
                            content = str(args.get("content") or "").encode()
                            etag = await persist_project_file(project, rel, content, None, enforce_etag=False)
                            baseline_etags[rel] = etag
                            result = {"created": rel, "size": len(content)}
                            yield "event: tool\ndata: " + json.dumps({"name": "create_file", "path": rel}) + "\n\n"
                        elif name == "create_folder":
                            if not isinstance(args.get("folder_path"), str): raise HTTPException(400, "Folder path must be text")
                            clean_folder = args["folder_path"].replace("\\", "/").strip("/")
                            if not clean_folder or any(p in {".", ".."} or p.startswith(".") for p in clean_folder.split("/")):
                                raise HTTPException(400, "Invalid folder path")
                            marker_path = files_store._relative(f"{clean_folder}/.keep.json")
                            marker_content = b'{"folder": true}'
                            etag = await persist_project_file(project, marker_path, marker_content, None, enforce_etag=False)
                            baseline_etags[marker_path] = etag
                            result = {"created_folder": clean_folder}
                            yield "event: tool\ndata: " + json.dumps({"name": "create_folder", "path": clean_folder}) + "\n\n"
                        elif name == "write_file":
                            if not isinstance(args.get("path"), str) or not isinstance(args.get("content"), str): raise HTTPException(400, "File path and content must be text")
                            rel = files_store._relative(args["path"]); content = args["content"].encode()
                            etag = await persist_project_file(project, rel, content, baseline_etags.get(rel), enforce_etag=False)
                            baseline_etags[rel] = etag
                            result = {"saved": rel}; yield "event: tool\ndata: " + json.dumps({"name":"write_file","path":rel}) + "\n\n"
                        elif name == "delete_file":
                            rel = files_store._relative(args["path"])
                            if rel == "index.html": raise HTTPException(400,"Cannot delete index.html")
                            await remove_project_file(project, rel, baseline_etags.get(rel), enforce_etag=True)
                            baseline_etags.pop(rel, None); result = {"deleted":rel}; yield "event: tool\ndata: " + json.dumps({"name":"delete_file","path":rel}) + "\n\n"
                        elif name == "search_files":
                            query = str(args.get("query", "")).strip().lower()
                            if not query or len(query) > 200: raise HTTPException(400, "Search query must be 1–200 characters")
                            matches = []
                            for item in await file_index(project_id):
                                if item["path"].lower().endswith((".html", ".css", ".js", ".mjs", ".json")):
                                    text = (await project_file_content(project, item["path"])).decode("utf-8", "replace")
                                    for line_number, line in enumerate(text.splitlines(), 1):
                                        if query in line.lower(): matches.append({"path": item["path"], "line": line_number, "text": line[:500]})
                                        if len(matches) >= 100: break
                            result = {"matches": matches[:100]}
                        elif name == "request_reload":
                            result = {"requested": True}; yield "event: reload_preview\ndata: {}\n\n"
                        else: result = {"error":"Unknown tool"}
                    except (HTTPException, KeyError) as exc: result = {"error":exc.detail if isinstance(exc, HTTPException) else "Required file path/content missing"}
                    function_results.append({"functionResponse":{"name":name,"response":result}})
                contents.append({"role":"user","parts":function_results}); calls += 1

        if not any(m.get("alias") == active_alias and m.get("status") == "completed" for m in telemetry_models):
            telemetry_models.append({
                "name": active_model,
                "alias": active_alias,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "total_tokens": total_tokens,
                "duration_seconds": round(time.time() - model_start_time, 2),
                "status": "completed"
            })
        total_turn_tokens = sum(m.get("total_tokens", 0) for m in telemetry_models)
        total_turn_duration = round(time.time() - turn_start_time, 2)
        telemetry_payload = {
            "models": telemetry_models,
            "total_tokens": total_turn_tokens,
            "total_duration": total_turn_duration
        }
        await record_conversation_turn_complete(
            user["id"], project_id, turn_id, "".join(response_text),
            thought_text="".join(thought_text), status="complete",
            telemetry=telemetry_payload
        )
        yield "event: telemetry\ndata: " + json.dumps(telemetry_payload) + "\n\n"
        yield "event: done\ndata: " + json.dumps({"message":"Ready"}) + "\n\n"
    return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control":"no-cache, no-transform","X-Accel-Buffering":"no"})


@app.get("/api/public/{username}/{slug}/meta")
async def public_game_meta(username: str, slug: str):
    project = await store.collection("projects").find_one({"username":username.lower(),"slug":slug.lower(),"visibility":"public"})
    if not project: raise HTTPException(404,"Game not found")
    return {k:v for k,v in project.items() if k not in {"_id","owner_id"}}


async def prepare_game_html(project: dict[str, Any], raw_html: str, base_href: str) -> str:
    html = raw_html
    # Error bridge: reports runtime JS errors and unhandled rejections to the parent Studio window
    error_bridge = (
        "<script>\n"
        "window.addEventListener('error', function(e) {\n"
        "  try {\n"
        "    var loc = e.filename ? ' (' + e.filename.split('/').pop() + ':' + e.lineno + ':' + e.colno + ')' : '';\n"
        "    window.parent.postMessage({ type: 'yulya:game-error', message: (e.message || 'Script error') + loc, filename: e.filename || '', lineno: e.lineno || 0, colno: e.colno || 0 }, '*');\n"
        "  } catch(err) {}\n"
        "});\n"
        "window.addEventListener('unhandledrejection', function(e) {\n"
        "  try {\n"
        "    var reason = e.reason && (e.reason.message || e.reason.stack || e.reason) || 'unknown error';\n"
        "    window.parent.postMessage({ type: 'yulya:game-error', message: 'Unhandled Promise Rejection: ' + reason, filename: '', lineno: 0 }, '*');\n"
        "  } catch(err) {}\n"
        "});\n"
        "</script>\n"
    )

    # Auto-link any top-level JavaScript files in the project that were omitted from index.html
    try:
        project_files = await file_index(project["id"])
        js_injections = []
        for pf in project_files:
            p_name = pf.get("path", "")
            if p_name.endswith(".js") and p_name != "app.js" and "/" not in p_name:
                if p_name not in html:
                    js_injections.append(f'<script src="{p_name}"></script>')
        if js_injections:
            error_bridge += "\n".join(js_injections) + "\n"
    except Exception:
        pass

    base_tag = f'<base href="{base_href}">\n{error_bridge}'
    existing_base = re.search(r"<base\b[^>]*>", html, flags=re.IGNORECASE)
    if existing_base:
        html = html[:existing_base.start()] + base_tag + html[existing_base.end():]
    else:
        head = re.search(r"<head(?:\s[^>]*)?>", html, flags=re.IGNORECASE)
        html = html[:head.end()] + "\n" + base_tag + html[head.end():] if head else base_tag + html
    return html


@app.get("/api/games/{username}/{slug}/{file_path:path}")
@app.get("/api/games/{username}/{slug}")
@app.get("/api/games/{username}/{slug}/")
async def public_game_file(username: str, slug: str, file_path: str = "index.html"):
    project = await store.collection("projects").find_one({"username": username.lower(), "slug": slug.lower(), "visibility": "public"})
    if not project: raise HTTPException(404, "Game not found")
    rel = files_store._relative(file_path or "index.html")
    content = await project_file_content(project, rel)
    if rel == "index.html":
        base_href = f"/{project['username']}/{project['slug']}/"
        html = await prepare_game_html(project, content.decode("utf-8", "replace"), base_href)
        content = html.encode("utf-8")
    ancestors = f"'self' {APP_ORIGIN}".strip() if APP_ORIGIN else "'self' *"
    return Response(content, media_type=_mime(rel), headers={
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": f"default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' data: blob:; worker-src 'self' blob:; frame-ancestors {ancestors};",
    })


@app.get("/api/worker/private/{user_id}/{project_id}/{token}/{file_path:path}")
@app.get("/api/worker/private/{user_id}/{project_id}/{token}")
@app.get("/api/worker/private/{user_id}/{project_id}/{token}/")
async def private_preview_file(user_id: str, project_id: str, token: str, file_path: str = "index.html"):
    try:
        payload, signature = token.split(".", 1)
        expected = hmac.new(PREVIEW_TOKEN_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected): raise ValueError
        data = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        if data["uid"] != user_id or data["pid"] != project_id or data["exp"] < _now(): raise ValueError
    except Exception: raise HTTPException(403, "Preview token invalid or expired")
    project = await store.collection("projects").find_one({"id": project_id, "owner_id": user_id})
    if not project: raise HTTPException(404, "Preview not found")
    rel = files_store._relative(file_path or "index.html")
    content = await project_file_content(project, rel)
    if rel == "index.html":
        base_href = f"/api/worker/private/{user_id}/{project_id}/{token}/"
        html = await prepare_game_html(project, content.decode("utf-8", "replace"), base_href)
        content = html.encode("utf-8")
    ancestors = f"'self' {APP_ORIGIN}".strip() if APP_ORIGIN else "'self' *"
    return Response(content, media_type=_mime(rel), headers={
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": f"default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' data: blob:; worker-src 'self' blob:; frame-ancestors {ancestors};",
    })


FRONTEND_DIST = (Path(__file__).resolve().parent.parent / "dist").resolve()


def frontend_file(path: str = "") -> FileResponse:
    """Serve only built studio assets; user projects are never part of this tree."""
    if path == "api" or path.startswith("api/"):
        raise HTTPException(404, "API route not found")
    target = (FRONTEND_DIST / path).resolve()
    try:
        target.relative_to(FRONTEND_DIST)
    except ValueError:
        raise HTTPException(404, "File not found")
    if target.is_file():
        return FileResponse(target, headers={"Cache-Control": "no-cache"} if target.name == "index.html" else None)
    if not Path(path).suffix:
        index = FRONTEND_DIST / "index.html"
        if index.is_file():
            return FileResponse(index, headers={"Cache-Control": "no-cache"})
    raise HTTPException(404, "File not found")


@app.get("/", include_in_schema=False)
async def frontend_root():
    return frontend_file()


@app.get("/{username}/{slug}/edit", include_in_schema=False)
async def editor_route(username: str, slug: str):
    if username.lower() == "api": raise HTTPException(404, "API route not found")
    return frontend_file()


@app.get("/{username}/{slug}", include_in_schema=False)
async def named_public_game(username: str, slug: str):
    reserved = {"api", "assets", "static", "favicon.ico", "robots.txt", "profile", "login", "register", "verify-email", "studio", "not-found"}
    if username.lower() == "api": raise HTTPException(404, "API route not found")
    if username.lower() in reserved: return frontend_file(f"{username}/{slug}")
    return await public_game_file(username, slug, "index.html")


@app.get("/{username}/{slug}/{file_path:path}", include_in_schema=False)
async def named_public_game_file(username: str, slug: str, file_path: str):
    reserved = {"api", "assets", "static", "favicon.ico", "robots.txt", "profile", "login", "register", "verify-email", "studio", "not-found"}
    if username.lower() == "api": raise HTTPException(404, "API route not found")
    if username.lower() in reserved: return frontend_file(f"{username}/{slug}/{file_path}")
    return await public_game_file(username, slug, file_path)


@app.get("/{username}", include_in_schema=False)
async def named_profile(username: str):
    if username.lower() == "api": raise HTTPException(404, "API route not found")
    if username.lower() in {"favicon.ico", "robots.txt"}: return frontend_file(username)
    return frontend_file()


@app.get("/{path:path}", include_in_schema=False)
async def frontend_routes(path: str):
    return frontend_file(path)

