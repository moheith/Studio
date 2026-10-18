Attempting to perform the InitializeDefaultDrives operation on the 'FileSystem' provider failed.
# Yulya Studio

A browser game studio prototype. Game projects are static browser assets and are never executed by the API. The frontend is React/TypeScript/Vite with Monaco; the API is FastAPI; MongoDB stores account/project metadata and project file bytes. Public and private game assets are served as inert files with restrictive browser sandbox headers.

## Local development

1. Use Node.js 20+ and Python 3.11+.
2. Copy `.env.example` to `.env`. For persistent local development, configure `MONGODB_URI`; without it, the API uses in-memory development storage, which resets on restart. Development-only cryptographic defaults are provided by the API; production refuses missing secrets.
3. Install frontend dependencies and run the API and Vite in separate terminals:

   ```powershell
   pnpm install
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   uvicorn backend.app:app --reload --port 8000
   pnpm dev
   ```

4. Open `http://localhost:5173`. Vite proxies `/api` to FastAPI. Configure Resend with a verified sender to receive verification codes; in local development without an email API key, the API returns a one-time code in its response for testing. Google login needs OAuth credentials and the callback URI shown in `.env.example`.
5. Private previews and public game links are served by the API from MongoDB. Game code is never executed by the API; browser responses use a restrictive CSP and sandbox policy.

## Production setup

- **MongoDB Atlas:** create a database and an application-scoped database user. Set `MONGODB_URI` and `MONGODB_DATABASE`.
- **Render and MongoDB Atlas:** use the configured single Render web service and set `MONGODB_URI` plus `MONGODB_DATABASE`. Project files are stored as MongoDB binary fields, with a 5 MiB file limit and a 50 MiB per-project quota. The Render filesystem is not used for new project files.
- **Optional older R2 setup:** R2 and the Worker are no longer required for project file persistence or game delivery. Existing legacy files are imported from the previous local/R2 storage on API startup when reachable.
- Set the required origins and secret values in the Render dashboard. Add Google OAuth callback and allowed application origins to provider configuration. Configure Resend with a verified sender for production email verification; its HTTPS API works with Render's free-service outbound network restrictions.
- Generate separate high-entropy values for `API_KEY_ENCRYPTION_SECRET`, `API_KEY_HMAC_SECRET`, `PREVIEW_TOKEN_SECRET`, and `SESSION_SECRET`. Do not commit `.env` or credentials. Rotate encryption keys only with a migration plan for stored Gemini keys.

## Security model and current scope

- Project file paths are validated as project-relative paths. MongoDB file records are keyed by immutable project ID and relative path, and every read/write also checks the project owner. Public game routes expose files only for projects marked public; private preview URLs expire after ten minutes.
- The game iframe is hosted on a separate origin, has `sandbox="allow-scripts"` without same-origin/top-navigation privileges, and receives restrictive CSP headers that block network connections by default. This is a defense-in-depth browser boundary; filename or source-text filtering is not treated as a sandbox.
- The AI receives only project-scoped file tools. It has no shell, process, general filesystem, or network tool. Project files and model responses remain untrusted. Human edits made during an AI response are detected using file ETags and per-project write serialization. The write lock is per API process; keep one API instance until a shared distributed lock is configured before horizontal scaling.
- V1 intentionally supports static HTML, CSS, JavaScript, JSON, raster images, audio/video, and web fonts. There is no package installation, server runtime, server build, voice, screenshare, or collaborative editing.
- API-key validation and AI model discovery call Gemini through FastAPI. Keys are encrypted at rest and compared for duplication using a keyed HMAC fingerprint. Provider failures are reported; no silent model fallback is implemented.
- Production rate-limit counters use MongoDB atomic updates with expiry; the in-memory development adapter is process-local. Per-project file locks are process-local, so keep one API instance until a shared distributed lock is configured before horizontal scaling. Before a public launch, verify email delivery and OAuth setup end-to-end, configure MongoDB backups, and add operational monitoring and abuse reporting.

## API outline

- `POST /api/auth/register`, `POST /api/auth/verify-email`, `POST /api/auth/login`, `GET /api/auth/google`, `GET /api/auth/me`, `POST /api/auth/logout`
- `PUT /api/profile/username`, `POST|DELETE /api/keys/gemini`, `GET /api/models`
- `GET|POST /api/projects`, `GET|PUT|DELETE /api/projects/{id}/files/...`, `PATCH /api/projects/{id}/visibility`, `POST /api/projects/{id}/preview-token`, `POST /api/projects/{id}/ai/stream`
- `GET /api/gallery`, `GET /api/profiles/{username}`, `POST /api/projects/{id}/remix`
- Public game bytes are served from MongoDB through static API routes with restrictive CSP sandbox headers, never executed on Render.

## Backup and restore

Back up the MongoDB database, including the `files` collection that contains project bytes. Restore MongoDB before directing users to the service, then check a private preview and public game URL. Configure MongoDB Atlas backup retention in the provider dashboard.

