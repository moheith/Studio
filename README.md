# Yulya Studio

Browser-native VS Code-style coding & game studio, isolated live game host, and community Arcade powered by Google Gemini 3.x AI. The frontend is React 18 / TypeScript / Vite with Monaco Editor and in-browser `esbuild-wasm`; the backend is FastAPI with MongoDB Atlas storage. Public games and private previews run strictly on a dedicated sandbox origin (`play.yulya.me`) with zero studio cookies and restrictive CSP headers.

## Local development

1. Use Node.js 20+ (`pnpm@10.14.0`) and Python 3.11+.
2. Copy `.env.example` to `.env`. For persistent local development, configure `MONGODB_URI`; without it, the API runs an in-memory development store that resets on restart. Production refuses missing secrets.
3. Install dependencies and run the API and Vite in separate terminals:

   ```powershell
   pnpm install
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   uvicorn backend.app:app --reload --port 8000 --proxy-headers --forwarded-allow-ips="*"
   pnpm dev
   ```

4. Open `http://localhost:5173`. Vite proxies `/api` to FastAPI (`http://localhost:8000`). In local development, `PLAY_ORIGIN` defaults to `http://127.0.0.1:8000` so preview iframes remain strictly cross-origin from `http://localhost:5173` / `http://localhost:8000`.

## Production setup (Render + MongoDB Atlas)

- **Dual Custom Domains on Render**: Attach both `studio.yulya.me` (`APP_ORIGIN=https://studio.yulya.me`, `API_ORIGIN=https://studio.yulya.me`) and `play.yulya.me` (`PLAY_ORIGIN=https://play.yulya.me`) to the Render web service. FastAPI enforces Host-Split origin isolation automatically:
  - `studio.yulya.me` serves the SPA, authenticated APIs, and the safe React Play Wrapper (`/{username}/{slug}`) while refusing raw user HTML/JS/SVG execution.
  - `play.yulya.me` serves sandboxed public games and HMAC-signed private previews only, stripping `Set-Cookie`, disallowing crawlers via `/robots.txt`, and rejecting `/api/auth/*`, `/api/projects/*`, and all non-GET/HEAD requests with `403`.
- **MongoDB Atlas**: Set `MONGODB_URI` and `MONGODB_DATABASE` using a least-privilege application user (`readWrite` scoped only to your app database, never `dropDatabase`). On boot, FastAPI automatically migrates legacy `sparse=True` unique indexes to `partialFilterExpression` (`{$type: "string"}`) and stores AI conversation history in a dedicated `conversation_turns` collection.
- **Secrets**: Generate distinct high-entropy values for `API_KEY_ENCRYPTION_SECRET` (optional `API_KEY_ENCRYPTION_SECRET_PREVIOUS` for seamless rotation), `API_KEY_HMAC_SECRET`, `PREVIEW_TOKEN_SECRET`, and `SESSION_SECRET`. Never commit `.env`.

## Security model & architecture

- **Host-Locked Sessions**: Production sets `__Host-yulya_session` (`HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, 14-day expiry) plus `TrustedHostMiddleware`, HSTS, strict CSP, and CSRF origin checks.
- **Authenticated BYOK Encryption**: User Gemini API keys are encrypted server-side using versioned **AES-256-GCM with `user_id` AAD** (with automatic fallback decryption of legacy Fernet ciphertexts) and deduplicated via keyed HMAC-SHA256 fingerprints.
- **Local Google ID Token Verification**: Google Sign-In tokens are verified locally via `google-auth` JWKS signature verification requiring `email_verified=True`.
- **Sandboxed Runtime & Safe REPL**: Project files are validated against traversal/HTML-injection characters and served from `play.yulya.me` with strict CSP (`form-action 'none'`, `object-src 'none'`, SVG `sandbox`). The Studio Terminal evaluates expressions strictly inside the sandboxed iframe via origin-pinned `postMessage` (`yulya:eval-code`) — never via parent `window.eval()`.
- **Dynamic Gemini Models & Antigravity Engine**: Automatically discovers all live chat models from Google's `/v1beta/models` endpoint (with full `nextPageToken` pagination) and preserves every user-selected model ID verbatim (including paid/legacy models). Antigravity Mode unlocks deep reasoning (`thinkingConfig` with automatic compatibility fallback), `batch_edit_files`, `rename_file`, autonomous Nano Banana 2.1 image & Gemini 3.8 TTS audio generation, Google Search grounding, automatic pre-edit Checkpoints with Monaco diff rollback, Plan vs Build mode, and true Multimodal Vision (`inspect_game_screen`). SSE streams emit 15-second keepalive heartbeats to survive reverse-proxy idle timeouts.

## API highlights

- **Auth & Account Security**: `POST /api/auth/register`, `/verify-email`, `/login`, `/google`, `/forgot-password`, `/reset-password`, `/change-password`, `/logout`, `/logout-all`, `GET /api/auth/sessions`, `DELETE /api/account`
- **Projects, Bundling & Checkpoints**: `GET /api/templates`, `GET|POST /api/projects`, `GET|PUT|DELETE /api/projects/{id}/files/...`, `GET /api/projects/{id}/thumbnail` (`ETag`/`304`), `GET /api/projects/{id}/checkpoints`, `POST /api/projects/{id}/checkpoints/{cp_id}/restore`, `POST /api/projects/{id}/preview-token` (24h HMAC TTL), `GET /api/projects/{id}/export` (streaming ZIP)
- **AI & Assets**: `POST|DELETE /api/keys/gemini`, `GET /api/models`, `POST /api/projects/{id}/ai/stream`, `POST /api/projects/{id}/ai/tool-result/{call_id}`, `POST /api/projects/{id}/ai/generate-image`, `POST /api/projects/{id}/ai/generate-audio`
- **Community Arcade**: `GET /api/gallery`, `GET /api/profiles/{username}`, `POST /api/games/{username}/{slug}/play` (IP-deduped), `POST /api/games/{username}/{slug}/like`, `GET|POST /api/games/{username}/{slug}/comments`, `GET|POST /api/games/{username}/{slug}/scores`, `POST /api/games/{username}/{slug}/report`, `POST /api/projects/{id}/remix` (creator opt-in only)

## Verification

```powershell
.\.venv\Scripts\pytest.exe -v
pnpm build
```
