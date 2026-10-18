# Yulya Studio

A browser game studio prototype. Game projects are static browser assets and are never executed by the API. The frontend is React/TypeScript/Vite with Monaco; the API is FastAPI; MongoDB stores account/project metadata; R2 stores files; a Cloudflare Worker serves public games from a separate play origin.

## Local development

1. Use Node.js 20+ and Python 3.11+.
2. Copy `.env.example` to `.env`. The local API uses in-memory metadata and `.local-data/` file storage when MongoDB and R2 are not configured. Development-only cryptographic defaults are generated/provided by the API; production refuses missing secrets.
3. Install frontend dependencies and run the API and Vite in separate terminals:

   ```powershell
   pnpm install
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   uvicorn backend.app:app --reload --port 8000
   pnpm dev
   ```

4. Open `http://localhost:5173`. Vite proxies `/api` to FastAPI. Configure SMTP to receive verification codes; in local development without SMTP, the API returns a one-time code in its response for testing. Google login needs OAuth credentials and the callback URI shown in `.env.example`.
5. To preview private games locally, run the Worker with R2 bindings for private storage, or configure R2 and `wrangler dev`. The API's local file fallback can also issue a short-lived preview URL from its own API origin.

## Production setup

- **MongoDB Atlas:** create a database and an application-scoped database user. Set `MONGODB_URI` and `MONGODB_DATABASE`.
- **Cloudflare R2:** create private and public buckets. Keep public-bucket public access disabled; bind both buckets to the Worker. Set `R2_ENDPOINT_URL`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PRIVATE_BUCKET`, and `R2_PUBLIC_BUCKET` on the API. R2 credentials must have only the required bucket access.
- **Worker:** configure `APP_ORIGIN` and the same `PREVIEW_TOKEN_SECRET` as the API with `wrangler secret put`; deploy `worker/` to the dedicated `play.<domain>` origin. Bind the two R2 buckets as `PRIVATE_GAMES` and `PUBLIC_GAMES`. Never point the studio application origin at this Worker.
- **Render:** use `render.yaml` for the API and static frontend. Set the required origins and all secret values in the Render dashboard. Add Google OAuth callback and allowed application origins to provider configuration. Configure SMTP for production email verification.
- Generate separate high-entropy values for `API_KEY_ENCRYPTION_SECRET`, `API_KEY_HMAC_SECRET`, `PREVIEW_TOKEN_SECRET`, and `SESSION_SECRET`. Do not commit `.env` or credentials. Rotate encryption keys only with a migration plan for stored Gemini keys.

## Security model and current scope

- Project file paths are validated as project-relative paths and object keys are namespaced by immutable owner/project IDs while private. Owners can publish static browser assets into a separate public namespace. The gallery and Worker expose only public projects; private preview URLs expire after ten minutes.
- The game iframe is hosted on a separate origin, has `sandbox="allow-scripts"` without same-origin/top-navigation privileges, and receives restrictive CSP headers that block network connections by default. This is a defense-in-depth browser boundary; filename or source-text filtering is not treated as a sandbox.
- The AI receives only project-scoped file tools. It has no shell, process, general filesystem, or network tool. Project files and model responses remain untrusted. Human edits made during an AI response are detected using file ETags and per-project write serialization. The write lock is per API process; keep one API instance until a shared distributed lock is configured before horizontal scaling.
- V1 intentionally supports static HTML, CSS, JavaScript, JSON, raster images, audio/video, and web fonts. There is no package installation, server runtime, server build, voice, screenshare, or collaborative editing.
- API-key validation and AI model discovery call Gemini through FastAPI. Keys are encrypted at rest and compared for duplication using a keyed HMAC fingerprint. Provider failures are reported; no silent model fallback is implemented.
- Production rate-limit counters use MongoDB atomic updates with expiry; the in-memory development adapter is process-local. Per-project file locks are process-local, so keep one API instance until a shared distributed lock is configured before horizontal scaling. Before a public launch, verify email delivery and OAuth setup end-to-end, configure backups for MongoDB and R2, and add operational monitoring and abuse reporting.

## API outline

- `POST /api/auth/register`, `POST /api/auth/verify-email`, `POST /api/auth/login`, `GET /api/auth/google`, `GET /api/auth/me`, `POST /api/auth/logout`
- `PUT /api/profile/username`, `POST|DELETE /api/keys/gemini`, `GET /api/models`
- `GET|POST /api/projects`, `GET|PUT|DELETE /api/projects/{id}/files/...`, `PATCH /api/projects/{id}/visibility`, `POST /api/projects/{id}/preview-token`, `POST /api/projects/{id}/ai/stream`
- `GET /api/gallery`, `GET /api/profiles/{username}`, `POST /api/projects/{id}/remix`
- Public game bytes are served from the play-origin Worker, never executed on Render.

## Backup and restore

Back up MongoDB metadata and both R2 buckets independently. To restore, restore MongoDB first, then restore the matching R2 object keys. Private object keys include immutable owner and project IDs; public keys use current username and slug for URL mapping. Test restoration with a private preview and a public game URL before directing users to the restored service. MongoDB and R2 lifecycle/backup retention policies must be configured in their respective provider dashboards.
