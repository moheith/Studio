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
import shutil
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
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "317604926106-n8ktfn1aplm9tkfuoe9fgdlgre18frab.apps.googleusercontent.com")
ALLOWED_EXTENSIONS = {
    ".html", ".htm", ".css", ".js", ".mjs", ".cjs", ".json",
    ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".ico",
    ".mp3", ".wav", ".ogg", ".m4a", ".mp4", ".webm",
    ".woff", ".woff2", ".ttf", ".otf",
    ".txt", ".csv", ".tsv", ".atlas", ".fnt", ".glb", ".gltf", ".obj", ".mtl"
}
RESERVED_NAMES = {"api", "auth", "studio", "profile", "settings", "assets", "static", "play", "admin", "health", "setup-profile"}
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
            for k, v in updates.items():
                if "." in k:
                    parts = k.split(".")
                    target = doc
                    for p in parts[:-1]:
                        if not isinstance(target.get(p), dict): target[p] = {}
                        target = target[p]
                    target[parts[-1]] = v
                else:
                    doc[k] = v
            for k, v in update.get("$inc", {}).items():
                if "." in k:
                    parts = k.split(".")
                    target = doc
                    for p in parts[:-1]:
                        if not isinstance(target.get(p), dict): target[p] = {}
                        target = target[p]
                    target[parts[-1]] = target.get(parts[-1], 0) + v
                else:
                    doc[k] = doc.get(k, 0) + v
            for k, v in update.get("$max", {}).items():
                if "." in k:
                    parts = k.split(".")
                    target = doc
                    for p in parts[:-1]:
                        if not isinstance(target.get(p), dict): target[p] = {}
                        target = target[p]
                    target[parts[-1]] = max(target.get(parts[-1], 0), v)
                else:
                    doc[k] = max(doc.get(k, 0), v)
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
        for file in files:
            try: self.delete(project, file["path"])
            except Exception: pass
        if not self.s3:
            for b in (self.private_bucket, self.public_bucket):
                try:
                    dir1 = (self.local_root / b / project["owner_id"] / project["id"]).resolve()
                    if dir1.exists() and dir1.is_dir(): shutil.rmtree(dir1, ignore_errors=True)
                    if project.get("username") and project.get("slug"):
                        dir2 = (self.local_root / b / project["username"] / project["slug"]).resolve()
                        if dir2.exists() and dir2.is_dir(): shutil.rmtree(dir2, ignore_errors=True)
                except Exception: pass

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
        "display_name": doc.get("display_name"),
        "bio": doc.get("bio", ""),
        "created_at": doc.get("created_at"),
        "email": doc.get("email"),
        "avatar": doc.get("avatar"),
        "has_api_key": bool(doc.get("api_key_ciphertext")),
        "waterfall": doc.get("waterfall") or ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"],
        "tokens": doc.get("tokens") or {
            "total_tokens": 0,
            "input_tokens": 0,
            "output_tokens": 0,
            "max_single_turn_tokens": 0,
            "turns_count": 0,
        },
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
class GoogleAuthBody(BaseModel): credential: str
class VerifyBody(BaseModel): email: str; code: str = Field(min_length=6, max_length=6)
class UsernameBody(BaseModel): username: str; display_name: str | None = None
class ProfileUpdateBody(BaseModel): display_name: str | None = None; bio: str | None = None
class KeyBody(BaseModel): api_key: str = Field(min_length=12, max_length=256)
class ProjectBody(BaseModel): title: str = Field(min_length=1, max_length=60); visibility: str = "private"
class VisibilityBody(BaseModel): visibility: str
class FileBody(BaseModel): content: str = Field(max_length=5 * 1024 * 1024)
class ChatBody(BaseModel): prompt: str = Field(min_length=1, max_length=12000); model: str | None = None; antigravity: bool | None = False; waterfall: bool | None = True
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
    existing_user = await store.collection("users").find_one({"email_norm": email})
    if existing_user:
        if existing_user.get("auth_provider") == "google" or (existing_user.get("google_id") and not existing_user.get("password_hash")):
            raise HTTPException(409, "This email is registered with Google. Please use Continue with Google.")
        raise HTTPException(409, "An account already exists for this email")
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
    if user and (user.get("auth_provider") == "google" or (user.get("google_id") and not user.get("password_hash"))):
        raise HTTPException(400, "This account was registered with Google. Please use Continue with Google.")
    if not user and await store.collection("email_codes").find_one({"email_norm": email}):
        raise HTTPException(400, "Please verify your email before logging in. Check your inbox for the verification code.")
    try:
        if not user or not user.get("password_hash"): raise VerifyMismatchError()
        PH.verify(user["password_hash"], body.password)
    except VerifyMismatchError: raise HTTPException(401, "Email or password is incorrect")
    csrf = await issue_session(user, response)
    return {"user": _public_user(user), "csrf_token": csrf, "needs_username": not bool(user.get("username"))}


@app.post("/api/auth/google")
async def google_auth(body: GoogleAuthBody, response: Response):
    credential = body.credential.strip()
    if not credential:
        raise HTTPException(400, "Google credential required")

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.get(f"https://oauth2.googleapis.com/tokeninfo?id_token={credential}")
        if res.status_code != 200:
            raise HTTPException(401, "Invalid or expired Google token")
        payload = res.json()
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Google token verification failed: %s", exc)
        raise HTTPException(401, "Could not verify Google account")

    token_aud = payload.get("aud")
    if token_aud != GOOGLE_CLIENT_ID:
        logger.warning("Google token audience mismatch: %s != %s", token_aud, GOOGLE_CLIENT_ID)
        raise HTTPException(401, "Google token audience mismatch")

    email = (payload.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(400, "Google account does not provide an email address")

    google_id = payload.get("sub")
    picture = payload.get("picture")
    display_name = payload.get("name")

    # 1. Look up existing Google user by google_id
    user = await store.collection("users").find_one({"google_id": google_id})

    if not user:
        # Check if an email-based account already exists with this email
        email_user = await store.collection("users").find_one({"email_norm": email})
        if email_user and (email_user.get("password_hash") or email_user.get("auth_provider") == "email"):
            raise HTTPException(409, "An account with this email was registered using email and password. Please log in with your password.")
        if await store.collection("email_codes").find_one({"email_norm": email}):
            raise HTTPException(409, "An account with this email was registered using email and password. Please log in with your password.")

        # Create new Google-authenticated user
        user = {
            "id": uuid.uuid4().hex,
            "email": email,
            "email_norm": email,
            "password_hash": None,
            "google_id": google_id,
            "avatar": picture,
            "display_name": display_name,
            "auth_provider": "google",
            "created_at": _now(),
            "username": None,
        }
        await store.collection("users").insert_one(user)
    else:
        # User already exists via Google, update avatar or display_name if missing
        updates = {}
        if picture and not user.get("avatar"):
            updates["avatar"] = picture
        if display_name and not user.get("display_name"):
            updates["display_name"] = display_name
        if updates:
            await store.collection("users").update_one({"id": user["id"]}, {"$set": updates})
            user.update(updates)

    csrf = await issue_session(user, response)
    return {
        "user": _public_user(user),
        "csrf_token": csrf,
        "needs_username": not bool(user.get("username")),
    }


@app.get("/api/auth/me")
async def me(request: Request, user: dict[str, Any] = Depends(current_user)):
    user_doc = await store.collection("users").find_one({"id": user["id"]}) or user
    tokens = user_doc.get("tokens")
    if not isinstance(tokens, dict) or tokens.get("total_tokens", 0) == 0:
        try:
            total_tokens = 0
            input_tokens = 0
            output_tokens = 0
            max_single = 0
            turns_count = 0
            conv_docs = await store.collection("conversations").find({"owner_id": user["id"]}).to_list(1000)
            for c in conv_docs:
                for t in c.get("turns", []):
                    telem = t.get("telemetry")
                    if telem and isinstance(telem, dict):
                        tot = telem.get("total_tokens", 0)
                        if tot > 0:
                            total_tokens += tot
                            turns_count += 1
                            max_single = max(max_single, tot)
                            for m in telem.get("models", []):
                                input_tokens += m.get("input_tokens", 0)
                                output_tokens += m.get("output_tokens", 0)
            if total_tokens > 0:
                tokens = {
                    "total_tokens": total_tokens,
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                    "max_single_turn_tokens": max_single,
                    "turns_count": turns_count,
                }
                await store.collection("users").update_one(
                    {"id": user["id"]},
                    {"$set": {"tokens": tokens}}
                )
                user_doc["tokens"] = tokens
        except Exception:
            pass
    return {"user": _public_user(user_doc), "csrf_token": request.state.csrf, "needs_username": not bool(user_doc.get("username"))}


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
    update_fields: dict[str, Any] = {"username": username}
    if body.display_name:
        disp = body.display_name.strip()[:60]
        if disp: update_fields["display_name"] = disp
    try: await store.collection("users").update_one({"id": user["id"]}, {"$set": update_fields})
    except DuplicateKeyError: raise HTTPException(409, "That username is already taken")
    return {"username": username, "display_name": update_fields.get("display_name", user.get("display_name"))}


@app.put("/api/profile")
async def update_profile(body: ProfileUpdateBody, user: dict[str, Any] = Depends(mutating_user)):
    updates: dict[str, Any] = {}
    if body.display_name is not None:
        updates["display_name"] = body.display_name.strip()[:60]
    if body.bio is not None:
        updates["bio"] = body.bio.strip()[:280]
    if updates:
        await store.collection("users").update_one({"id": user["id"]}, {"$set": updates})
        user.update(updates)
    return {"user": _public_user(user)}


@app.get("/api/profile/waterfall")
async def get_user_waterfall(user: dict[str, Any] = Depends(current_user)):
    user_doc = await store.collection("users").find_one({"id": user["id"]})
    wf = (user_doc or {}).get("waterfall") or ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"]
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
        {"id": "antigravity-preview-latest", "display_name": "Antigravity (Gemini 3.6 Flash)", "input_token_limit": 2000000},
        {"id": "antigravity-preview-09-2026", "display_name": "Antigravity (Gemini 3.8 Flash)", "input_token_limit": 2000000},
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
    return {
        "index.html": f'<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>{safe_title}</title>\n</head>\n<body>\n</body>\n</html>'
    }


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


@app.get("/api/projects/{project_id}/bundle")
async def project_bundle(project_id: str, user: dict[str, Any] = Depends(current_user)):
    project = await owned_project(user, project_id)
    rows = await store.collection("files").find({"project_id": project_id}).to_list(200)
    files_data = []
    for f in rows:
        path = f["path"]
        content_bytes = f.get("content")
        is_text = any(path.endswith(ext) for ext in (".html", ".htm", ".css", ".js", ".mjs", ".cjs", ".json", ".svg", ".txt"))
        content_str = None
        if is_text and isinstance(content_bytes, (bytes, bytearray)):
            try: content_str = content_bytes.decode("utf-8")
            except Exception: content_str = None
        files_data.append({
            "path": path,
            "size": f.get("size", len(content_bytes) if content_bytes else 0),
            "etag": f.get("etag", ""),
            "content": content_str,
        })
    preview_url = ""
    if project.get("visibility") == "public":
        preview_url = f"{API_ORIGIN}/api/games/{project['username']}/{project['slug']}/index.html"
    elif PREVIEW_TOKEN_SECRET:
        token = preview_token(project, ttl=86400)
        preview_url = f"{API_ORIGIN}/api/worker/private/{project['owner_id']}/{project['id']}/{token}/index.html"
    return {
        "project": {k: v for k, v in project.items() if k != "_id"},
        "files": files_data,
        "preview_url": preview_url,
    }


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
    try:
        files = await file_index(project_id)
        files_store.delete_project(project, files)
    except Exception as exc:
        logger.warning("Storage file deletion warning for %s: %s", project_id, exc)
    del_files = await store.collection("files").delete_many({"project_id": project_id})
    del_chats = await store.collection("conversations").delete_many({"project_id": project_id})
    await store.collection("projects").delete_one({"id": project_id})
    return {
        "deleted": True,
        "project_id": project_id,
        "files_purged": del_files.deleted_count,
        "conversations_purged": del_chats.deleted_count
    }


@app.get("/api/gallery")
async def gallery(limit: int = 24, skip: int = 0):
    limit = max(1, min(limit, 60)); rows = await store.collection("projects").find({"visibility": "public"}).sort("updated_at", -1).skip(max(0, skip)).limit(limit).to_list(limit)
    return {"projects": [{k: v for k, v in p.items() if k not in {"_id", "owner_id"}} for p in rows]}


@app.get("/api/profiles/{username}")
async def profile(username: str):
    user = await store.collection("users").find_one({"username": username.lower()})
    if not user: raise HTTPException(404, "Creator not found")
    rows = await store.collection("projects").find({"owner_id": user["id"], "visibility": "public"}).sort("updated_at", -1).limit(100).to_list(100)
    return {"profile": {"username": user["username"], "display_name": user.get("display_name"), "bio": user.get("bio", ""), "avatar": user.get("avatar"), "created_at": user.get("created_at")}, "projects": [{k: v for k, v in p.items() if k not in {"_id", "owner_id"}} for p in rows]}


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
    return [{"id": row.get("id", str(row.get("_id", ""))), "prompt": row.get("prompt", ""), "response": row.get("response", ""), "thought": row.get("thought", ""), "model": row.get("model", ""), "created_at": row.get("created_at", 0), "status": row.get("status", "complete"), "telemetry": row.get("telemetry"), "error": row.get("error"), "grounding": row.get("grounding")} for row in rows]


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


async def record_user_token_usage(user_id: str, total_tokens: int, input_tokens: int, output_tokens: int) -> None:
    if total_tokens <= 0:
        return
    try:
        user_doc = await store.collection("users").find_one({"id": user_id})
        if not user_doc:
            return
        curr = user_doc.get("tokens")
        if not isinstance(curr, dict):
            curr = {
                "total_tokens": 0,
                "input_tokens": 0,
                "output_tokens": 0,
                "max_single_turn_tokens": 0,
                "turns_count": 0,
            }
        new_total = int(curr.get("total_tokens") or 0) + int(total_tokens)
        new_input = int(curr.get("input_tokens") or 0) + int(input_tokens)
        new_output = int(curr.get("output_tokens") or 0) + int(output_tokens)
        new_turns = int(curr.get("turns_count") or 0) + 1
        new_max = max(int(curr.get("max_single_turn_tokens") or 0), int(total_tokens))

        new_tokens = {
            "total_tokens": new_total,
            "input_tokens": new_input,
            "output_tokens": new_output,
            "max_single_turn_tokens": new_max,
            "turns_count": new_turns,
        }
        await store.collection("users").update_one(
            {"id": user_id},
            {"$set": {"tokens": new_tokens}}
        )
    except Exception as exc:
        logger.error("Failed to update token stats: %s", exc)


async def record_conversation_turn_complete(
    owner_id: str, project_id: str, turn_id: str, response_text: str,
    thought_text: str = "", status: str = "complete",
    telemetry: dict[str, Any] | None = None,
    grounding: dict[str, Any] | None = None,
    error: str | None = None
) -> None:
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
    if grounding:
        update_data["turns.$.grounding"] = grounding
    if error:
        update_data["turns.$.error"] = error

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
                    if grounding:
                        t["grounding"] = grounding
                    if error:
                        t["error"] = error
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


async def perform_search_grounding(api_key: str, model: str, query: str) -> dict[str, Any]:
    """Perform Google Search Grounding to return real-time web knowledge and citations."""
    clean_query = query.strip()
    if not clean_query:
        return {"query": "", "grounded_information": "", "sources": []}

    search_models = [model, "gemini-3.8-flash", "gemini-2.5-flash"]
    tried_models = []
    for m in search_models:
        if m and m not in tried_models:
            tried_models.append(m)

    for m in tried_models:
        try:
            grounding_body = {
                "contents": [
                    {
                        "parts": [
                            {
                                "text": (
                                    f"Search the live web using Google Search and provide accurate, modern technical documentation, code recipes, or formulas for:\n\"{clean_query}\"\n\n"
                                    "Focus on browser Web APIs (Canvas 2D, Web Audio API, Gamepad API), HTML5 game mathematics, sound synthesis, or vanilla JavaScript. Keep it concise, complete, and directly usable."
                                )
                            }
                        ]
                    }
                ],
                "tools": [{"google_search": {}}],
                "generationConfig": {"temperature": 0.1, "maxOutputTokens": 1024}
            }
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    f"{GEMINI_API_BASE}/models/{m}:generateContent",
                    headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
                    json=grounding_body
                )
                if resp.status_code == 200:
                    data = resp.json()
                    cands = data.get("candidates", [])
                    if cands:
                        cand = cands[0]
                        text = "".join(p.get("text", "") for p in cand.get("content", {}).get("parts", []))
                        gm = cand.get("groundingMetadata", {})
                        sources = []
                        for chunk in gm.get("groundingChunks", []):
                            web = chunk.get("web")
                            if web and web.get("uri"):
                                sources.append({
                                    "title": web.get("title") or web.get("uri"),
                                    "url": web.get("uri")
                                })
                        if text:
                            return {
                                "query": clean_query,
                                "grounded_information": text[:3500],
                                "sources": sources[:6]
                            }
        except Exception as exc:
            logger.warning("Google search grounding API error on model %s: %s", m, exc)
            continue

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            ddg_resp = await client.get(
                "https://api.duckduckgo.com/",
                params={"q": clean_query, "format": "json", "no_html": "1", "skip_disambig": "1"}
            )
            if ddg_resp.status_code == 200:
                ddg_data = ddg_resp.json()
                abstract = ddg_data.get("AbstractText") or ddg_data.get("Heading") or ""
                sources = []
                if ddg_data.get("AbstractURL"):
                    sources.append({"title": ddg_data.get("Heading", "Documentation"), "url": ddg_data["AbstractURL"]})
                for rel in ddg_data.get("RelatedTopics", [])[:3]:
                    if isinstance(rel, dict) and rel.get("FirstURL"):
                        sources.append({"title": rel.get("Text", "Reference")[:60], "url": rel["FirstURL"]})
                if abstract:
                    return {
                        "query": clean_query,
                        "grounded_information": abstract[:2000],
                        "sources": sources
                    }
    except Exception:
        pass

    return {
        "query": clean_query,
        "grounded_information": f"Grounded technical knowledge applied for '{clean_query}'. Use standard browser specs and robust error handling.",
        "sources": []
    }


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
        saved_model_name = "Antigravity (Gemini 3.8 Flash)"
    elif "antigravity" in raw_model.lower():
        model = "gemini-3.6-flash"
        saved_model_name = "Antigravity (Gemini 3.6 Flash)"
    else:
        model = raw_model
        saved_model_name = f"Antigravity ({model})" if is_antigravity else model
    if not re.fullmatch(r"[a-zA-Z0-9._-]{3,100}", model): raise HTTPException(400, "Invalid model identifier")
    previous_turns = await get_project_conversation_turns(user["id"], project_id, limit=100 if is_antigravity else 20)
    messages = await file_index(project_id); file_context = {}; baseline_etags = {item["path"]: item.get("etag") for item in messages}
    # Full project file context: include all code and data files with no arbitrary file count limit
    for item in messages:
        if item["path"].lower().endswith((".html", ".css", ".js", ".mjs", ".json", ".txt", ".csv", ".tsv")):
            file_context[item["path"]] = (await project_file_content(project, item["path"])).decode("utf-8", "replace")[:60000]
    func_tools = [
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
        {
            "name": "inspect_game_screen",
            "description": "Capture a live, zero-overhead visual snapshot of the game preview along with runtime console logs and errors. If device_mode is provided, automatically adjusts the viewport resolution ('desktop' for 1280x720, 'tablet' for 768x1024, 'mobile' for 390x844) before capturing.",
            "parameters": {
                "type": "OBJECT",
                "properties": {
                    "device_mode": {
                        "type": "STRING",
                        "description": "Optional device resolution to inspect: 'desktop' (1280x720 16:9 HD), 'tablet' (768x1024), or 'mobile' (390x844)."
                    }
                }
            }
        },
        {
            "name": "send_game_input",
            "description": "Simulate interactive inputs into the game preview (WASD, arrows, space, mouse clicks, movement, and touch). For buttons and UI elements, always provide 'selector' or 'text' to automatically target their exact center without guessing coordinates.",
            "parameters": {
                "type": "OBJECT",
                "properties": {
                    "actions": {
                        "type": "ARRAY",
                        "description": "List of input actions to execute sequentially or simultaneously.",
                        "items": {
                            "type": "OBJECT",
                            "properties": {
                                "type": {"type": "STRING", "description": "'key' for keyboard, 'mouse' for mouse cursor, or 'touch' for touchscreen."},
                                "key": {"type": "STRING", "description": "Keyboard key to press (e.g. 'w', 'a', 's', 'd', 'Space', 'ArrowUp', 'Enter', 'Shift')."},
                                "action": {"type": "STRING", "description": "'press', 'down', 'up', 'click', 'move', 'drag', or 'tap'."},
                                "selector": {"type": "STRING", "description": "CSS selector of the button or element to click (e.g. '#btn-master', 'button.start', '.difficulty-btn'). Preferred for clicking UI buttons."},
                                "text": {"type": "STRING", "description": "Visible text on the button to click (e.g. 'Master', 'Play', 'Easy'). Automatically resolves the exact button center!"},
                                "x": {"type": "INTEGER", "description": "Canonical X coordinate (0–1280). Used if selector/text is not provided."},
                                "y": {"type": "INTEGER", "description": "Canonical Y coordinate (0–720). Used if selector/text is not provided."},
                                "duration_ms": {"type": "INTEGER", "description": "Milliseconds to hold down the key or drag the mouse (e.g. 1500 to walk for 1.5s)."},
                                "label": {"type": "STRING", "description": "Brief description of the action (e.g. 'Click Master difficulty', 'Walk right', 'Jump over spike')."}
                            }
                        }
                    }
                },
                "required": ["actions"]
            }
        },
        {
            "name": "set_game_device",
            "description": "Switch the game preview resolution to Desktop (1280x720 16:9 HD), Tablet (768x1024), or Mobile (390x844).",
            "parameters": {
                "type": "OBJECT",
                "properties": {
                    "device_mode": {
                        "type": "STRING",
                        "description": "The target device mode: 'desktop', 'tablet', or 'mobile'."
                    }
                },
                "required": ["device_mode"]
            }
        },
        {
            "name": "stop_game_playtest",
            "description": "Conclude the active AI playtest, safely releasing all held keys, dismissing the controlling border, and restoring the user's viewport.",
            "parameters": {"type": "OBJECT", "properties": {}}
        },
    ]

    # Search Grounding is an exclusive agentic capability for Antigravity only
    if is_antigravity:
        func_tools.append({
            "name": "search_grounding",
            "description": "Perform live Google web search grounding to search the internet for modern Web APIs (Canvas, Web Audio API, Gamepad, WebGL), game mathematics, collision formulas, audio synthesis recipes, retro algorithms, and technical documentation.",
            "parameters": {
                "type": "OBJECT",
                "properties": {
                    "query": {"type": "STRING", "description": "The search query to look up on Google."}
                },
                "required": ["query"]
            }
        })

    tool_declarations = [{"functionDeclarations": func_tools}]

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
            "You have 9 specialized tools to interact directly with project files and ground your work with live Google search. Always use them proactively:\n"
            "1. `list_files()`: Discover all files and folder hierarchy in the current project.\n"
            "2. `read_file(path)`: Inspect full code or data in a file before modifying it.\n"
            "3. `create_file(path, content)`: Create new code or data files (e.g. 'js/physics.js', 'assets/levels.json'). Parent folders are created automatically.\n"
            "4. `create_folder(folder_path)`: Create new folders (e.g. 'js', 'assets', 'levels', 'audio') to organize project code.\n"
            "5. `write_file(path, content)`: Overwrite or update files. CRITICAL: Always provide COMPLETE, PRODUCTION-READY, FULLY FUNCTIONAL code. NEVER omit lines, NEVER use lazy placeholders like '// ... existing code ...' or '/* add styles here */'. Write the full file content from start to finish.\n"
            "6. `delete_file(path)`: Delete unwanted or obsolete files. ('index.html' cannot be deleted).\n"
            "7. `search_files(query)`: Search across project files for variable names, function declarations, or strings.\n"
            "8. `search_grounding(query)`: Ground your work in real-time Google web search results. Use this tool whenever you need documentation on browser Web APIs (Web Audio API, Canvas 2D/WebGL, Gamepad API), mathematical physics equations (AABB, verlet integration, raycasting), sound synthesis recipes, retro algorithms, or modern vanilla JS practices.\n"
            "9. `request_reload()`: ALWAYS invoke this tool after modifying or creating files so the live game preview immediately reloads with your latest changes.\n"
            "10. `inspect_game_screen(device_mode)`: Request a live visual snapshot of the running game in the user's Studio preview at 'desktop' (1280x720), 'tablet' (768x1024), or 'mobile' (390x844). Use this to test your game visually.\n"
            "11. `send_game_input(actions)`: Dispatch interactive inputs into the game preview (WASD, Space, arrows, mouse clicks, movement, touch). The browser executes these with visible real-time cursor gliding and click animations. Always provide clear 'label' strings for each action.\n"
            "12. `set_game_device(device_mode)`: Switch the preview viewport between 'desktop', 'tablet', and 'mobile'.\n"
            "13. `stop_game_playtest()`: Conclude the active playtest session, releasing all inputs and restoring manual control.\n\n"
            "=== CRITICAL WORKFLOW RULES: PLAYTESTING VS CODING ===\n"
            "There are TWO distinct operating modes depending on what the user asks:\n\n"
            "MODE A: PLAYTESTING & INTERACTION (e.g. 'click master difficulty', 'test the game', 'press start', 'move right', 'check if jump works', 'look at the screen'):\n"
            "1. NEVER call `write_file`, `create_file`, or `delete_file` when asked to test, click, or interact!\n"
            "2. NEVER call `request_reload()`. Reloading the page wipes out running game state and resets all progress!\n"
            "3. Call `inspect_game_screen(device_mode='desktop')` to view the game screen.\n"
            "4. Call `send_game_input(actions=[...])` to interact with the game.\n"
            "   - To click buttons or UI elements: ALWAYS provide `selector` (e.g. '#btn-master') or `text` (e.g. 'Master', 'Start', 'Easy') so the system automatically snaps to the exact center of the button without guessing coordinates.\n"
            "   - For keyboard controls: provide `key` (e.g. 'w', 'a', 's', 'd', 'Space') and `duration_ms`.\n"
            "   - Always provide a descriptive `label` (e.g. 'Click Master difficulty').\n"
            "5. In your final text response, report honestly and precisely what actions were performed.\n\n"
            "MODE B: CODE DEVELOPMENT & BUG FIXING (e.g. 'add score counter', 'fix collision logic', 'make enemies faster'):\n"
            "1. Analyze existing project files.\n"
            "2. Proactively call `write_file` or `create_file` to write complete, working code.\n"
            "3. Call `request_reload()` so the preview updates with your latest code changes.\n"
            "4. In your final text response, provide a clean summary of what was changed and how to play."
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

    use_waterfall = body.waterfall is not False
    if use_waterfall:
        user_doc = await store.collection("users").find_one({"id": user["id"]})
        user_waterfall = (user_doc or {}).get("waterfall") or ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"]
        chain_models = [model]
        for wm in user_waterfall:
            clean_m = wm.strip().removeprefix("models/")
            if clean_m and clean_m not in chain_models:
                chain_models.append(clean_m)
    else:
        chain_models = [model]
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
        turn_grounding: dict[str, list[Any]] = {"queries": [], "sources": []}
        waterfall_transitions: list[dict[str, Any]] = []
        max_calls = 50 if is_antigravity else 20
        turn_start_time = time.time()
        current_chain_idx = 0

        model_stats: dict[str, dict[str, Any]] = {}
        for item in chain_info:
            model_stats[item["alias"]] = {
                "name": item["model"],
                "alias": item["alias"],
                "start_time": None,
                "duration_seconds": 0.0,
                "input_tokens": 0,
                "output_tokens": 0,
                "total_tokens": 0,
                "status": "pending",
                "error": None
            }

        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(3000.0, connect=30.0)) as client:
                while calls < max_calls:
                    active_info = chain_info[current_chain_idx]
                    active_model = active_info["model"]
                    active_alias = active_info["alias"]
                    current_stat = model_stats[active_alias]
                    if current_stat["start_time"] is None:
                        current_stat["start_time"] = time.time()
                        current_stat["status"] = "running"

                    call_input_tokens = 0
                    call_output_tokens = 0
                    call_total_tokens = 0
                    call_text_generated: list[str] = []

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
                                        call_input_tokens = u.get("promptTokenCount", call_input_tokens)
                                        call_output_tokens = u.get("candidatesTokenCount", call_output_tokens)
                                        call_total_tokens = u.get("totalTokenCount", call_total_tokens)

                                    for candidate in payload.get("candidates", []):
                                        if candidate.get("finishReason") == "MAX_TOKENS":
                                            turn_interrupted_by_tokens = True

                                        if candidate.get("groundingMetadata"):
                                            gm = candidate["groundingMetadata"]
                                            candidate_queries = gm.get("webSearchQueries", [])
                                            candidate_sources = []
                                            for chunk in gm.get("groundingChunks", []):
                                                web = chunk.get("web")
                                                if web and web.get("uri"):
                                                    candidate_sources.append({
                                                        "title": web.get("title") or web.get("uri"),
                                                        "url": web.get("uri")
                                                    })
                                            if candidate_queries or candidate_sources:
                                                for cq in candidate_queries:
                                                    if cq and cq not in turn_grounding["queries"]:
                                                        turn_grounding["queries"].append(cq)
                                                for cs in candidate_sources:
                                                    if cs.get("url") and not any(s.get("url") == cs["url"] for s in turn_grounding["sources"]):
                                                        turn_grounding["sources"].append(cs)
                                                yield "event: grounding\ndata: " + json.dumps({
                                                    "queries": candidate_queries,
                                                    "sources": candidate_sources
                                                }) + "\n\n"

                                        for part in candidate.get("content", {}).get("parts", []):
                                            if part.get("thought"):
                                                t = part.get("text", "")
                                                if t:
                                                    thought_text.append(t)
                                                    yield "event: thought\ndata: " + json.dumps({"text": t}) + "\n\n"
                                            elif part.get("text"):
                                                call_text_generated.append(part["text"])
                                                response_text.append(part["text"])
                                                yield "event: token\ndata: " + json.dumps({"text": part["text"]}) + "\n\n"
                                            if part.get("functionCall"):
                                                full_parts.append(part)
                    except httpx.TimeoutException:
                        failed_reason = "Request timed out after 3000 seconds with no response"
                    except Exception as exc:
                        failed_reason = f"Connection error: {str(exc)}"

                    # Accumulate tokens recorded from this API call
                    if call_total_tokens > 0:
                        current_stat["input_tokens"] += call_input_tokens
                        current_stat["output_tokens"] += call_output_tokens
                        current_stat["total_tokens"] += call_total_tokens
                    elif call_text_generated and not failed_reason:
                        fallback_out = len("".join(call_text_generated)) // 4
                        fallback_in = len(json.dumps(contents)) // 4
                        current_stat["input_tokens"] += fallback_in
                        current_stat["output_tokens"] += fallback_out
                        current_stat["total_tokens"] += (fallback_in + fallback_out)

                    if failed_reason or turn_interrupted_by_tokens:
                        effective_reason = failed_reason or "Output token limit reached (MAX_TOKENS)"
                        current_stat["duration_seconds"] = round(time.time() - (current_stat["start_time"] or time.time()), 2)
                        current_stat["error"] = effective_reason
                        if current_chain_idx + 1 < len(chain_info):
                            current_stat["status"] = "cascaded"
                            current_chain_idx += 1
                            next_info = chain_info[current_chain_idx]
                            trans_event = {
                                "from_model": active_model,
                                "from_alias": active_alias,
                                "to_model": next_info["model"],
                                "to_alias": next_info["alias"],
                                "reason": effective_reason
                            }
                            waterfall_transitions.append(trans_event)
                            yield "event: waterfall_transition\ndata: " + json.dumps(trans_event) + "\n\n"
                            trans_thought = f"\n⚡ [{active_alias}: {active_model} error: {effective_reason}] ➔ Cascaded to {next_info['alias']}: {next_info['model']}\n"
                            thought_text.append(trans_thought)
                            yield "event: thought\ndata: " + json.dumps({"text": trans_thought}) + "\n\n"
                            if turn_interrupted_by_tokens:
                                contents.append({"role": "user", "parts": [{"text": "Continue writing the remaining code or response starting directly from where it stopped. Do not repeat earlier lines."}]})
                            continue
                        else:
                            current_stat["status"] = "failed"
                            final_err = f"All waterfall models exhausted. Last model ({active_alias}: {active_model}) error: {effective_reason}" if use_waterfall else f"Model ({active_model}) error: {effective_reason}"
                            telemetry_models = [s for s in model_stats.values() if s["start_time"] is not None]
                            total_turn_tokens = sum(m.get("total_tokens", 0) for m in telemetry_models)
                            total_turn_duration = round(time.time() - turn_start_time, 2)
                            telemetry_payload = {
                                "models": telemetry_models,
                                "total_tokens": total_turn_tokens,
                                "total_duration": total_turn_duration,
                                "waterfallTransitions": waterfall_transitions
                            }
                            saved_resp = "".join(response_text) or f"Error: {final_err}"
                            await record_conversation_turn_complete(
                                user["id"], project_id, turn_id, saved_resp,
                                thought_text="".join(thought_text), status="error",
                                telemetry=telemetry_payload,
                                grounding=turn_grounding if (turn_grounding["queries"] or turn_grounding["sources"]) else None,
                                error=final_err
                            )
                            await record_user_token_usage(
                                user["id"],
                                total_turn_tokens,
                                sum(m.get("input_tokens", 0) for m in telemetry_models),
                                sum(m.get("output_tokens", 0) for m in telemetry_models)
                            )
                            yield "event: telemetry\ndata: " + json.dumps(telemetry_payload) + "\n\n"
                            yield "event: error\ndata: " + json.dumps({"message": final_err}) + "\n\n"
                            return

                    if not full_parts:
                        current_stat["duration_seconds"] = round(time.time() - (current_stat["start_time"] or time.time()), 2)
                        current_stat["status"] = "completed"
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
                        elif name == "search_grounding": tool_desc = f"Searching Google for: '{args.get('query', '')}'"
                        elif name == "list_files": tool_desc = "Scanning project files"
                        elif name == "request_reload": tool_desc = "Live preview reloaded"
                        elif name == "inspect_game_screen": tool_desc = f"Inspecting live game screen ({args.get('device_mode', 'desktop')})"
                        elif name == "send_game_input": tool_desc = f"Simulating AI inputs ({len(args.get('actions', []))} actions)"
                        elif name == "set_game_device": tool_desc = f"Switching game preview device to '{args.get('device_mode', 'desktop')}'"
                        elif name == "stop_game_playtest": tool_desc = "Concluded AI game playtest"
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
                            elif name == "search_grounding":
                                if not is_antigravity:
                                    result = {"error": "search_grounding tool is only available when Antigravity mode is active"}
                                else:
                                    sq = str(args.get("query", "")).strip()
                                    status_msg = f"🔍 Grounding with Google Search: '{sq}'…"
                                    yield "event: status\ndata: " + json.dumps({"message": status_msg}) + "\n\n"
                                    grounding_res = await perform_search_grounding(api_key, active_model, sq)
                                    result = grounding_res
                                    if sq and sq not in turn_grounding["queries"]:
                                        turn_grounding["queries"].append(sq)
                                    for s in grounding_res.get("sources", []):
                                        if s.get("url") and not any(x.get("url") == s["url"] for x in turn_grounding["sources"]):
                                            turn_grounding["sources"].append(s)
                                    yield "event: grounding\ndata: " + json.dumps({
                                        "queries": [sq] if sq else [],
                                        "sources": grounding_res.get("sources", [])
                                    }) + "\n\n"
                                    yield "event: tool\ndata: " + json.dumps({"name": "search_grounding", "path": sq, "query": sq}) + "\n\n"
                                    if grounding_res.get("sources"):
                                        top_srcs = ", ".join(f"[{s.get('title') or s.get('url')}]" for s in grounding_res["sources"][:3])
                                        g_thought = f"\n🌐 [Google Search Grounding] Sources discovered: {top_srcs}\n"
                                        thought_text.append(g_thought)
                                        yield "event: thought\ndata: " + json.dumps({"text": g_thought}) + "\n\n"
                            elif name == "request_reload":
                                result = {"requested": True}; yield "event: reload_preview\ndata: {}\n\n"
                            elif name == "inspect_game_screen":
                                dev_mode = str(args.get("device_mode") or "desktop").lower()
                                yield "event: inspect_game_screen\ndata: " + json.dumps({"device_mode": dev_mode}) + "\n\n"
                                result = {
                                    "status": "screen_captured",
                                    "device_mode": dev_mode,
                                    "resolution": "1280x720" if dev_mode == "desktop" else ("768x1024" if dev_mode == "tablet" else "390x844"),
                                    "rendered_to_ui": True,
                                    "note": "Screenshot captured and rendered directly in user's Studio UI. Analyze project files, button selectors, and runtime console errors for verification."
                                }
                            elif name == "send_game_input":
                                actions_list = args.get("actions") or []
                                yield "event: send_game_input\ndata: " + json.dumps({"actions": actions_list}) + "\n\n"
                                result = {"status": "dispatched", "actions_dispatched": len(actions_list)}
                            elif name == "set_game_device":
                                target_dev = str(args.get("device_mode") or "desktop").lower()
                                yield "event: set_game_device\ndata: " + json.dumps({"device_mode": target_dev}) + "\n\n"
                                result = {"status": "switched", "device_mode": target_dev}
                            elif name == "stop_game_playtest":
                                yield "event: stop_game_playtest\ndata: {}\n\n"
                                result = {"status": "stopped"}
                            else: result = {"error":"Unknown tool"}
                        except (HTTPException, KeyError) as exc: result = {"error":exc.detail if isinstance(exc, HTTPException) else "Required file path/content missing"}
                        function_results.append({"functionResponse":{"name":name,"response":result}})
                    contents.append({"role":"user","parts":function_results}); calls += 1

            for s in model_stats.values():
                if s["start_time"] is not None and s["status"] in ("running", "pending"):
                    s["duration_seconds"] = round(time.time() - s["start_time"], 2)
                    s["status"] = "completed"

            telemetry_models = [s for s in model_stats.values() if s["start_time"] is not None]
            total_turn_tokens = sum(m.get("total_tokens", 0) for m in telemetry_models)
            turn_input_tokens = sum(m.get("input_tokens", 0) for m in telemetry_models)
            turn_output_tokens = sum(m.get("output_tokens", 0) for m in telemetry_models)
            total_turn_duration = round(time.time() - turn_start_time, 2)
            telemetry_payload = {
                "models": telemetry_models,
                "total_tokens": total_turn_tokens,
                "total_duration": total_turn_duration,
                "waterfallTransitions": waterfall_transitions
            }
            await record_conversation_turn_complete(
                user["id"], project_id, turn_id, "".join(response_text),
                thought_text="".join(thought_text), status="complete",
                telemetry=telemetry_payload,
                grounding=turn_grounding if (turn_grounding["queries"] or turn_grounding["sources"]) else None
            )
            await record_user_token_usage(user["id"], total_turn_tokens, turn_input_tokens, turn_output_tokens)
            yield "event: telemetry\ndata: " + json.dumps(telemetry_payload) + "\n\n"
            yield "event: done\ndata: " + json.dumps({"message":"Ready"}) + "\n\n"
        except Exception as unhandled_err:
            logger.exception("Unexpected error in ai_stream: %s", unhandled_err)
            err_msg = f"Generation error: {str(unhandled_err)}"
            try:
                await record_conversation_turn_complete(
                    user["id"], project_id, turn_id, "".join(response_text) or f"Error: {err_msg}",
                    thought_text="".join(thought_text), status="error", error=err_msg
                )
            except Exception:
                pass
            yield "event: error\ndata: " + json.dumps({"message": err_msg}) + "\n\n"
    return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control":"no-cache, no-transform","X-Accel-Buffering":"no"})


@app.get("/api/public/{username}/{slug}/meta")
async def public_game_meta(username: str, slug: str):
    project = await store.collection("projects").find_one({"username":username.lower(),"slug":slug.lower(),"visibility":"public"})
    if not project: raise HTTPException(404,"Game not found")
    return {k:v for k,v in project.items() if k not in {"_id","owner_id"}}


async def prepare_game_html(project: dict[str, Any], raw_html: str, base_href: str) -> str:
    html = raw_html
    # Runtime bridge: reports runtime JS errors, unhandled rejections, console logs, and handles synthetic input / screen capture
    error_bridge = (
        "<script src=\"https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js\"></script>\n"
        "<script>\n"
        "(function() {\n"
        "  window.addEventListener('error', function(e) {\n"
        "    try {\n"
        "      var loc = e.filename ? ' (' + e.filename.split('/').pop() + ':' + e.lineno + ':' + e.colno + ')' : '';\n"
        "      window.parent.postMessage({ type: 'yulya:game-error', message: (e.message || 'Script error') + loc, filename: e.filename || '', lineno: e.lineno || 0, colno: e.colno || 0 }, '*');\n"
        "    } catch(err) {}\n"
        "  });\n"
        "  window.addEventListener('unhandledrejection', function(e) {\n"
        "    try {\n"
        "      var reason = e.reason && (e.reason.message || e.reason.stack || e.reason) || 'unknown error';\n"
        "      window.parent.postMessage({ type: 'yulya:game-error', message: 'Unhandled Promise Rejection: ' + reason, filename: '', lineno: 0 }, '*');\n"
        "    } catch(err) {}\n"
        "  });\n"
        "  try {\n"
        "    var _origWarn = console.warn;\n"
        "    console.warn = function() {\n"
        "      _origWarn.apply(console, arguments);\n"
        "      try {\n"
        "        var msg = Array.prototype.slice.call(arguments).map(function(a) { return typeof a === 'object' ? JSON.stringify(a) : String(a); }).join(' ');\n"
        "        window.parent.postMessage({ type: 'yulya:game-log', level: 'warn', message: msg }, '*');\n"
        "      } catch(e) {}\n"
        "    };\n"
        "    var _origErr = console.error;\n"
        "    console.error = function() {\n"
        "      _origErr.apply(console, arguments);\n"
        "      try {\n"
        "        var msg = Array.prototype.slice.call(arguments).map(function(a) { return typeof a === 'object' ? JSON.stringify(a) : String(a); }).join(' ');\n"
        "        window.parent.postMessage({ type: 'yulya:game-log', level: 'error', message: msg }, '*');\n"
        "      } catch(e) {}\n"
        "    };\n"
        "  } catch(e) {}\n"
        "  var activeKeys = {};\n"
        "  var activeTimers = [];\n"
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
        "  window.addEventListener('message', function(e) {\n"
        "    if (!e.data || typeof e.data !== 'object') return;\n"
        "    if (e.data.type === 'yulya:release-all-keys') {\n"
        "      releaseAllKeys(); return;\n"
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
        "              window.parent.postMessage({ type: 'yulya:input-held-released', key: mapped.key }, '*');\n"
        "            }, d.duration_ms);\n"
        "            activeTimers.push(tid);\n"
        "          }\n"
        "        } else if (kind === 'keyup') { delete activeKeys[mapped.key]; }\n"
        "      } else if (kind === 'mousemove' || kind === 'mousedown' || kind === 'mouseup' || kind === 'click' || kind === 'dblclick' || kind === 'contextmenu') {\n"
        "        var x = typeof d.x === 'number' ? d.x : (window.innerWidth / 2);\n"
        "        var y = typeof d.y === 'number' ? d.y : (window.innerHeight / 2);\n"
        "        var target = null;\n"
        "        if (d.selector) {\n"
        "          try { target = document.querySelector(d.selector); } catch(err) {}\n"
        "        }\n"
        "        if (!target && d.text) {\n"
        "          var needle = String(d.text).toLowerCase().trim();\n"
        "          var allCandidates = document.querySelectorAll('button, a, input, select, [role=\"button\"], h1, h2, h3, h4, span, div, p');\n"
        "          for (var ci = 0; ci < allCandidates.length; ci++) {\n"
        "            var elCandidate = allCandidates[ci];\n"
        "            var txt = (elCandidate.innerText || elCandidate.textContent || '').toLowerCase().trim();\n"
        "            if (txt === needle || (needle.length >= 2 && txt.indexOf(needle) !== -1)) {\n"
        "              target = elCandidate;\n"
        "              break;\n"
        "            }\n"
        "          }\n"
        "        }\n"
        "        if (target && typeof target.closest === 'function') {\n"
        "          var btnAncestor = target.closest('button, a, input, [role=\"button\"]');\n"
        "          if (btnAncestor) target = btnAncestor;\n"
        "        }\n"
        "        if (target) {\n"
        "          var rect = target.getBoundingClientRect();\n"
        "          x = rect.left + (rect.width / 2);\n"
        "          y = rect.top + (rect.height / 2);\n"
        "          try {\n"
        "            window.parent.postMessage({\n"
        "              type: 'yulya:target-located',\n"
        "              x: x,\n"
        "              y: y,\n"
        "              label: d.label || d.text || d.selector || 'Button'\n"
        "            }, '*');\n"
        "          } catch(postErr) {}\n"
        "        } else {\n"
        "          target = document.elementFromPoint(x, y) || document.body;\n"
        "        }\n"
        "        var button = d.button || 0;\n"
        "        try {\n"
        "          var pEvt = new PointerEvent(kind === 'mousedown' ? 'pointerdown' : (kind === 'mouseup' ? 'pointerup' : 'pointermove'), {\n"
        "            clientX: x, clientY: y, button: button, bubbles: true, cancelable: true, view: window\n"
        "          });\n"
        "          target.dispatchEvent(pEvt);\n"
        "        } catch(pe) {}\n"
        "        try {\n"
        "          var mEvt = new MouseEvent(kind, {\n"
        "            clientX: x, clientY: y, button: button, buttons: kind === 'mousedown' ? 1 : 0, bubbles: true, cancelable: true, view: window\n"
        "          });\n"
        "          target.dispatchEvent(mEvt);\n"
        "        } catch(me) {}\n"
        "        if (kind === 'click') {\n"
        "          if (typeof target.focus === 'function') {\n"
        "            try { target.focus(); } catch(fe) {}\n"
        "          }\n"
        "          if (typeof target.click === 'function') {\n"
        "            try { target.click(); } catch(ce) {}\n"
        "          }\n"
        "        }\n"
        "      } else if (kind === 'touchstart' || kind === 'touchmove' || kind === 'touchend') {\n"
        "        var tx = typeof d.x === 'number' ? d.x : (window.innerWidth / 2);\n"
        "        var ty = typeof d.y === 'number' ? d.y : (window.innerHeight / 2);\n"
        "        var tTarget = document.elementFromPoint(tx, ty) || document.body;\n"
        "        try {\n"
        "          var touch = new Touch({ identifier: Date.now(), target: tTarget, clientX: tx, clientY: ty, pageX: tx, pageY: ty, screenX: tx, screenY: ty });\n"
        "          var tEvt = new TouchEvent(kind, { touches: kind === 'touchend' ? [] : [touch], targetTouches: kind === 'touchend' ? [] : [touch], changedTouches: [touch], bubbles: true, cancelable: true });\n"
        "          tTarget.dispatchEvent(tEvt);\n"
        "        } catch(terr) {\n"
        "          var fallbackKind = kind === 'touchstart' ? 'mousedown' : (kind === 'touchend' ? 'mouseup' : 'mousemove');\n"
        "          var fbEvt = new MouseEvent(fallbackKind, { clientX: tx, clientY: ty, bubbles: true, cancelable: true });\n"
        "          tTarget.dispatchEvent(fbEvt);\n"
        "        }\n"
        "      }\n"
        "    } else if (e.data.type === 'yulya:capture-screen') {\n"
        "      var reqId = e.data.reqId;\n"
        "      function sendCapture(dUrl, hasC, w, h) {\n"
        "        try {\n"
        "          window.parent.postMessage({\n"
        "            type: 'yulya:screen-captured',\n"
        "            reqId: reqId,\n"
        "            dataUrl: dUrl || '',\n"
        "            hasCanvas: hasC,\n"
        "            width: w || window.innerWidth,\n"
        "            height: h || window.innerHeight\n"
        "          }, '*');\n"
        "        } catch(postErr) {}\n"
        "      }\n"
        "      var canvases = document.querySelectorAll('canvas');\n"
        "      var canvas = null;\n"
        "      for (var ci = 0; ci < canvases.length; ci++) {\n"
        "        if (canvases[ci].width > 50 && canvases[ci].height > 50) { canvas = canvases[ci]; break; }\n"
        "      }\n"
        "      if (!canvas && canvases.length > 0) canvas = canvases[0];\n"
        "      var dataUrl = '';\n"
        "      if (canvas) {\n"
        "        try { dataUrl = canvas.toDataURL('image/jpeg', 0.82); } catch(err) {}\n"
        "      }\n"
        "      if (dataUrl && dataUrl.length > 200) {\n"
        "        sendCapture(dataUrl, true, canvas.width, canvas.height);\n"
        "        return;\n"
        "      }\n"
        "      function captureDom() {\n"
        "        if (typeof window.html2canvas === 'function') {\n"
        "          window.html2canvas(document.body, {\n"
        "            logging: false,\n"
        "            useCORS: true,\n"
        "            allowTaint: true,\n"
        "            scale: 1,\n"
        "            backgroundColor: '#0a0a0f'\n"
        "          }).then(function(renderedCanvas) {\n"
        "            var domDataUrl = '';\n"
        "            try { domDataUrl = renderedCanvas.toDataURL('image/jpeg', 0.82); } catch(e) {}\n"
        "            sendCapture(domDataUrl, true, renderedCanvas.width, renderedCanvas.height);\n"
        "          }).catch(function() {\n"
        "            sendCapture('', false, window.innerWidth, window.innerHeight);\n"
        "          });\n"
        "        } else {\n"
        "          setTimeout(function() {\n"
        "            if (typeof window.html2canvas === 'function') {\n"
        "              captureDom();\n"
        "            } else {\n"
        "              sendCapture('', false, window.innerWidth, window.innerHeight);\n"
        "            }\n"
        "          }, 350);\n"
        "        }\n"
        "      }\n"
        "      captureDom();\n"
        "    }\n"
        "  });\n"
        "})();\n"
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
        "Content-Security-Policy": f"default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com https://cdn.skypack.dev https://esm.sh https://threejs.org; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://fonts.googleapis.com; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' data: blob: https:; worker-src 'self' blob:; frame-ancestors {ancestors};",
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
        "Content-Security-Policy": f"default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com https://cdn.skypack.dev https://esm.sh https://threejs.org; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://fonts.googleapis.com; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' data: blob: https:; worker-src 'self' blob:; frame-ancestors {ancestors};",
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


@app.get("/robots.txt", include_in_schema=False)
async def robots_txt():
    return frontend_file("robots.txt")


@app.get("/sitemap.xml", include_in_schema=False)
async def sitemap_xml():
    base_url = "https://studio.yulya.me"
    urls = [
        f"""  <url>
    <loc>{base_url}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>""",
        f"""  <url>
    <loc>{base_url}/arcade</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>""",
        f"""  <url>
    <loc>{base_url}/login</loc>
    <changefreq>monthly</changefreq>
    <priority>0.4</priority>
  </url>""",
        f"""  <url>
    <loc>{base_url}/register</loc>
    <changefreq>monthly</changefreq>
    <priority>0.4</priority>
  </url>"""
    ]
    try:
        public_projects = await store.collection("projects").find(
            {"visibility": "public"},
            {"username": 1, "slug": 1}
        ).to_list(500)
        for p in public_projects:
            uname = p.get("username")
            slug = p.get("slug")
            if uname and slug:
                urls.append(f"""  <url>
    <loc>{base_url}/{uname}/{slug}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>""")
    except Exception:
        pass

    joined_urls = "\n".join(urls)
    content = f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
{joined_urls}
</urlset>"""
    return Response(content=content, media_type="application/xml")


@app.get("/{username}/{slug}", include_in_schema=False)
async def named_public_game(username: str, slug: str):
    reserved = {"api", "assets", "static", "favicon.ico", "favicon.svg", "robots.txt", "sitemap.xml", "arcade", "profile", "login", "register", "verify-email", "setup-profile", "studio", "not-found"}
    if username.lower() == "api": raise HTTPException(404, "API route not found")
    if username.lower() in reserved: return frontend_file(f"{username}/{slug}")
    return await public_game_file(username, slug, "index.html")


@app.get("/{username}/{slug}/{file_path:path}", include_in_schema=False)
async def named_public_game_file(username: str, slug: str, file_path: str):
    reserved = {"api", "assets", "static", "favicon.ico", "favicon.svg", "robots.txt", "sitemap.xml", "arcade", "profile", "login", "register", "verify-email", "setup-profile", "studio", "not-found"}
    if username.lower() == "api": raise HTTPException(404, "API route not found")
    if username.lower() in reserved: return frontend_file(f"{username}/{slug}/{file_path}")
    return await public_game_file(username, slug, file_path)


@app.get("/{username}", include_in_schema=False)
async def named_profile(username: str):
    if username.lower() == "api": raise HTTPException(404, "API route not found")
    if username.lower() in {"favicon.ico", "favicon.svg", "robots.txt", "sitemap.xml"}: return frontend_file(username)
    return frontend_file()


@app.get("/{path:path}", include_in_schema=False)
async def frontend_routes(path: str):
    return frontend_file(path)

