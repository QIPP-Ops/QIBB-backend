# QIPP migration: MongoDB Atlas + Render + GitHub Pages

This guide replaces **Azure App Service** (`qipp-api`, `qippop`) with:

| Component | New host | URL |
|-----------|----------|-----|
| **Frontend** | GitHub Pages | `https://acwaops.com/qipp` |
| **Backend API** | Render (Frankfurt) | `https://qibb-backend.onrender.com` |
| **Database** | MongoDB Atlas | Database `QIPP` |
| **SMTP** | GoDaddy / existing mailbox | Configured on Render |
| **Trend blobs** | Deferred | Azure Blob sync optional later |

## What you can decommission on Azure

After verifying production on Render + GitHub Pages:

- **Azure App Service `qipp-api`** — backend API (replaced by Render)
- **Azure App Service `qippop`** — frontend (replaced by GitHub Pages)
- **Azure Cosmos DB (MongoDB API)** — if fully migrated to Atlas (seed fresh data)
- **GitHub Actions `main_qipp-api.yml`** — Azure backend deploy workflow (disable or delete)
- **GitHub Actions `master_qippop.yml`** — Azure frontend deploy workflow (disable or delete)

Keep until trend blob migration is done:

- **Azure Blob Storage** (`acwaopsqipp` / `report` container) — six trend JSON blobs
- `AZURE_STORAGE_CONNECTION_STRING` on Render (optional, when ready)

## 1. MongoDB Atlas

1. Create cluster (already: `qipp.6ukofbn.mongodb.net`).
2. Database name: **`QIPP`** (set via `MONGODB_DB_NAME` or include in URI path).
3. Network access: allow Render egress (`0.0.0.0/0` for free tier) or Render static IPs if upgraded.
4. Create DB user with read/write on `QIPP`.

Connection string (set in Render dashboard only — **never commit**):

```env
# Preferred — database in URI (no trailing slash before ?)
MONGODB_URI=mongodb+srv://<user>:<password>@qipp.6ukofbn.mongodb.net/QIPP?retryWrites=true&w=majority

# Also OK — host + separate db name (backend appends /QIPP)
MONGODB_URI=mongodb+srv://<user>:<password>@qipp.6ukofbn.mongodb.net
MONGODB_DB_NAME=QIPP
```

**Avoid** Atlas strings that end with `/?appName=...` only — the backend now fixes these automatically, but the cleanest form is `/QIPP?` not `/?`.

## 2. Render backend

**Service:** `qibb-backend` — https://qibb-backend.onrender.com  
**Repo:** `QIPP-Ops/QIBB-backend` (branch `main`)  
**Blueprint:** `render.yaml` in repo root

### Render dashboard settings

| Variable | Required | Example / notes |
|----------|----------|-----------------|
| `NODE_ENV` | Yes | `production` |
| `PORT` | Yes | `5000` (Render sets `PORT` automatically; default in code is 5000) |
| `MONGODB_URI` | Yes | Atlas connection string (secret) |
| `MONGODB_DB_NAME` | Yes | `QIPP` |
| `JWT_SECRET` | Yes | 48+ char random hex (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`) |
| `FRONTEND_URL` | Yes | `https://acwaops.com/qipp` (password-reset links; CORS origin is `https://acwaops.com`) |
| `CORS_ORIGINS` | Recommended | `https://qipp-ops.github.io` (preview); `acwaops.com` is in default allowlist |
| `SMTP_HOST` | Yes | GoDaddy: `smtpout.secureserver.net` |
| `SMTP_PORT` | Yes | `465` (recommended) or `587` |
| `SMTP_SECURE` | Yes | `true` for port 465; `false` for port 587 STARTTLS |
| `SMTP_USER` | Yes | Mailbox user — **also used as super-admin login email** when seeding |
| `SMTP_PASS` | Yes | Mailbox password (secret) — **also used as super-admin password** when seeding |
| `SMTP_FROM` | Recommended | `QIPP Operations <admin@acwaops.com>` (fallback email if `SMTP_USER` unset) |
| `PLANT_INGEST_ON_STARTUP` | Optional | `0` (disable Azure blob ingest until migrated) |
| `TRENDS_BLOBS_DIR` | Optional | `data/trends-blobs` (bundled stubs until blob sync) |
| `AZURE_STORAGE_CONNECTION_STRING` | Deferred | For `npm run sync:trends-blobs` later |

### SMTP on Render (GoDaddy + free tier limitation)

**Connection timeout on email broadcast?** Render **free** web services block outbound SMTP to ports **25, 465, and 587** (policy since Sept 2025). Symptom: `Connection timeout` / 502 from `/api/admin/email-broadcast` even when recipients resolve correctly.

**Fix options (pick one):**

1. **Upgrade Render** — Dashboard → `qibb-backend` → Settings → Instance Type → **Starter** ($7/mo) or higher. Paid instances can use SMTP on 465/587.
2. **Switch to HTTP email API** — SendGrid, Resend, Mailgun, or Postmark (uses HTTPS port 443, works on free tier). Requires code change to use provider SDK instead of Nodemailer SMTP.

**GoDaddy Workspace (`admin@acwaops.com`) — use after upgrading to paid Render:**

```env
SMTP_HOST=smtpout.secureserver.net
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=admin@acwaops.com
SMTP_PASS=<mailbox-password>
SMTP_FROM=QIPP Operations <admin@acwaops.com>
```

Alternative (STARTTLS):

```env
SMTP_PORT=587
SMTP_SECURE=false
```

**Verify SMTP from browser or curl:**

```text
GET https://qibb-backend.onrender.com/health/email?verify=1
```

- `smtpVerify: ok` — SMTP reachable from Render
- `smtpVerify: failed` + `likelyRenderSmtpBlock: true` — upgrade Render or use email API
- `smtpHint` — actionable message from backend

Optional tuning env vars: `SMTP_CONNECTION_TIMEOUT_MS=60000`, `SMTP_SEND_RETRIES=2`

**Build command:** `npm ci`  
**Start command:** `npm start`  
**Health check:** `GET /health`  
**Readiness:** `GET /ready` (checks MongoDB connection)

### One-time database seed

Run from your machine, **Render Shell**, or **GitHub Actions** (see below) after env vars are set:

```bash
cd QIBB-backend
# Set env vars locally (or use Render Shell → Environment)
export MONGODB_URI='mongodb+srv://...'
export MONGODB_DB_NAME=QIPP
export SMTP_HOST=smtpout.secureserver.net
export SMTP_USER='admin@acwaops.com'
export SMTP_PASS='your-mailbox-password'
# Optional: shared temp password so roster accounts can sign in
export SEED_DEFAULT_USER_PASSWORD='change-after-first-login'

npm run seed:mongodb
```

Super admin login is created from **SMTP_USER + SMTP_PASS** (same mailbox used for outbound email). Optional overrides: `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`.

**Roster data:** `npm run seed:mongodb` always upserts ~52 personnel rows from `data/roster.json` into MongoDB. Without `SEED_DEFAULT_USER_PASSWORD`, those accounts exist for org chart / leave but cannot sign in until an admin resets their password. Set the env var above if you want roster logins immediately.

**Do not** put `npm run seed:mongodb` in the Render **start command** unless you accept a seed on every cold start — prefer **Render Shell** once, or a one-off job.

### Seed via GitHub Actions (no Render Shell)

1. **Settings** → **Secrets** → add `MONGODB_URI`, `SMTP_USER`, `SMTP_PASS` (optional: `SEED_DEFAULT_USER_PASSWORD`)
2. **Actions** → **Seed MongoDB Atlas** → **Run workflow**
3. Verify `GET https://qibb-backend.onrender.com/ready` shows `rosterVisible` ≥ 50

See `docs/MIGRATE_AZURE_MONGO_TO_ATLAS.md` (Option E).

Destructive reset (wipes users/config/KPI first):

```bash
SEED_FORCE_RESET=1 npm run seed:mongodb
```

### Restore from Azure Cosmos (full production data)

If the old Azure MongoDB/Cosmos database still exists, copy all collections to Atlas:

See **[docs/MIGRATE_AZURE_MONGO_TO_ATLAS.md](./MIGRATE_AZURE_MONGO_TO_ATLAS.md)** — `npm run migrate:azure-to-atlas` with `SOURCE_MONGODB_URI` (Azure) and `TARGET_MONGODB_URI` (Atlas).

Optional KPI sample data:

```bash
SEED_KPI_DATA=1 npm run seed:mongodb
```

Follow-up (leave balances):

```bash
npm run seed:employees
```

## 3. GitHub Pages frontend

**Repo:** `QIPP-Ops/QIBB-frontend` (branch `master`)  
**Workflow:** `.github/workflows/github-pages.yml`

### GitHub repository variables

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_API_URL` | `https://qibb-backend.onrender.com/api` |

If using API subdomain later: `https://api.qipp.live/api`

### Local static build test

```bash
cd QIBB-frontend
set GITHUB_PAGES=true
set NEXT_PUBLIC_API_URL=https://qibb-backend.onrender.com/api
npm run build
npx serve out
```

## 4. Super admin login

1. Run `npm run seed:mongodb` with `MONGODB_URI` and SMTP vars set (`SMTP_USER` + `SMTP_PASS`).
2. Open `https://acwaops.com/qipp/login` (or GitHub Pages URL).
3. Sign in with **SMTP_USER** and **SMTP_PASS** (your mailbox credentials).
4. Change password in-app if you prefer a different login than the mailbox password.

Super admin only (without full roster seed):

```bash
npm run seed:super-admin
```

## 5. Verification

```bash
# Backend health
curl https://qibb-backend.onrender.com/health

# DB readiness (200 when Mongo connected)
curl https://qibb-backend.onrender.com/ready

# SMTP config + live connection test (503 if verify fails)
curl "https://qibb-backend.onrender.com/health/email?verify=1"

# Login
curl -X POST https://qibb-backend.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@acwaops.com","password":"YOUR_PASSWORD"}'
```

Frontend: open Personnel, Calendar, Login — confirm API calls hit Render (browser DevTools → Network).

## 6. Security notes

- **Never commit** `.env`, MongoDB passwords, or SMTP passwords.
- Rotate Atlas and SMTP credentials if they were shared in chat or tickets.
- Render free tier sleeps after inactivity — first request may take ~30s (cold start).
- JWT secret must be unique per environment.

## Related files

- `render.yaml` — Render blueprint
- `scripts/seed-mongodb.js` — idempotent Atlas seed
- `.env.example` — local template
- `QIBB-frontend/docs/MIGRATION_GITHUB_PAGES.md` — Pages + domain setup
- `QIBB-frontend/.github/workflows/github-pages.yml` — frontend deploy
