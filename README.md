# QIPP Backend API

Express 5 API for QIPP operational data (roster, KPIs, PTW, ETL-backed plant metrics). Data is stored in Azure Cosmos DB (MongoDB API).

## Prerequisites

- Node.js 18+
- Azure Cosmos DB connection string
- SMTP credentials (for OTP and password reset emails)

## Setup

1. Clone the repository and install dependencies:

```bash
npm install
```

2. Copy environment template and configure:

```bash
cp .env.example .env
```

Required variables:

| Variable | Description |
|----------|-------------|
| `COSMOS_URI` | MongoDB connection string (Cosmos DB) |
| `JWT_SECRET` | Secret for signing JWTs (32+ chars recommended) |
| `PORT` | HTTP port (default `5000`) |
| `FRONTEND_URL` | Frontend origin for reset links and CORS |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Outbound email |
| `BLOB_SAS_URL` | Azure Blob SAS URL for storage account (container `report`) |
| `BLOB_CONTAINER_NAME` | Blob container name (default `report`) |
| `BLOB_STORAGE_ACCOUNT` | Storage account name (default `acwaopsqipp`) |

3. Start the server:

```bash
npm run dev    # development (nodemon)
npm start      # production
```

4. Health checks: `GET /health`, `GET /ready` (DB connectivity)

5. Legacy auth field migration (if upgrading an old database):

```bash
npm run migrate:auth
```

API contract with frontend: [docs/AUTH_CONTRACT.md](docs/AUTH_CONTRACT.md)

## Seeding

```bash
npm run seed       # roster + KPI sample data + admin user
npm run seed:ptw   # PTW personnel into AdminConfig
```

**Super administrator (`admin@acwaops.com`):** upsert without wiping other users:

```bash
SUPER_ADMIN_PASSWORD='your-password' npm run seed:super-admin
```

Or set `SUPER_ADMIN_PASSWORD` in Azure App Settings and run the same command in Kudu. Optional override: `SUPER_ADMIN_EMAIL`. Reset password only: `npm run set-password -- admin@acwaops.com "NewPassword"`.

**PTW authorization list:** Regenerate from Excel with `node scripts/parse-ptw-excel.js "<path-to-xlsx>"` (writes `data/ptw-authorization-2026.json`). `npm run seed:ptw` **replaces** `AdminConfig.ptwPersonnel` entirely from that file — it does not merge with existing DB names.

**Production (Azure):** The API **auto-seeds** `ptwPersonnel` from `data/ptw-authorization-2026.json` on startup when the list is empty or has fewer than 63 entries. Super admins can also call `POST /api/admin/seed-ptw` with `{ "force": true }` to replace the list without SSH. Manual fallback: `npm run seed:ptw` in Kudu or against production `COSMOS_URI`.

**Plant ingest (Azure App Settings):** `PLANT_INGEST_MAX_AGE_DAYS=365`, `PLANT_INGEST_INTERVAL_MS=900000` (15 min), `PLANT_INGEST_ON_STARTUP=1`, `AZURE_STORAGE_CONNECTION_STRING` or `BLOB_SAS_URL`, `PLANT_INGEST_MAX_FILES=800`, `TREND_BACKFILL_MAX_DAYS=365`, `BLOB_DOWNLOAD_TIMEOUT_MS=120000`. Parsed trends are stored in **`data/plant-trends-cache.json`** (git-tracked; included in deploy zip) and served via `GET /api/plant-data/trends-cache`. After deploy, startup **skips** blob re-parse when that file already has metrics/series (`index.js`); set `PLANT_INGEST_STARTUP_FORCE=1` to force a full re-parse, or `PLANT_INGEST_ON_STARTUP=0` to disable startup ingest entirely (15‑min scheduler + bi-hourly ingest cron still run). RO-HRSG / water filenames are matched case-insensitively; day-column Excel sheets merge into continuous series from January 1.

**Refresh cache when new Excel lands in blob (no redeploy wipe):** run locally `npm run ingest:local` (or `npm run ingest:local -- --cache-only` if Cosmos already has points), commit the updated `data/plant-trends-cache.json`, and push. On the server, bi-hourly ingest cron updates Cosmos from new blobs and rebuilds the cache file in place.

**Local ingest / cache rebuild:** `cp .env.example .env`, set `MONGODB_URI` (or `COSMOS_URI`), then `npm run ingest:local` (blob ingest if `BLOB_SAS_URL` is set; otherwise set `PLANT_REPORTS_DIR` to a folder of Excel files — blob settings take precedence). `npm run ingest:local -- --force` re-parses all files. `npm run ingest:local -- --cache-only` rebuilds `data/plant-trends-cache.json` from Cosmos without re-parsing Excel. Parse-only smoke test (no DB): `node scripts/test-ingest-sample.js "C:\path\to\reports"`.

**Azure deploy (GitHub Actions):** `.github/workflows/main_qipp-api.yml` builds with `npm ci`, runs tests, reinstalls prod-only deps, zips a lean package (includes `data/plant-trends-cache.json`; excludes tests/docs/dev deps), stops the app, deploys via `az webapp deploy` with retries, sets `WEBSITE_RUN_FROM_PACKAGE=1` and `SCM_DO_BUILD_DURING_DEPLOYMENT=false`, then waits on `/health`.

**Warning:** `npm run seed` clears existing `AdminUser`, `AdminConfig`, and `PlantPerformance` data.

Default seeded passwords are defined in `seed.js` only — they are not printed to the console. Change them immediately in non-local environments.

## Authentication flow

1. `POST /api/auth/register` — creates account with `accessRole: viewer` (role cannot be set by client)
2. `POST /api/auth/verify-otp` — verifies email via OTP
3. Admin approves user via `PUT /api/admin/users/:id/approve`
4. `POST /api/auth/login` — returns JWT (requires verified email + approval)
5. `GET /api/auth/verify` — validates token (send `Authorization: Bearer <token>`)

Most operational routes require a valid JWT. **Public (no auth):** `/health`, `GET /api/plant-data/metrics/date-range`, `GET /api/plant-data/operational-overview` (home dashboard).

## Python ETL

```bash
cd etl
pip install -r requirements.txt
export COSMOS_MONGO_URI="<same as COSMOS_URI>"
python run_all_etl.py
```

Collection field names and API mapping: see [docs/ETL_SCHEMAS.md](docs/ETL_SCHEMAS.md).

## Tests

```bash
npm test
```

## Deploy

Production runs on Azure App Service (`qipp-api`). GitHub Actions workflow: `.github/workflows/main_qipp-api.yml` (push to `main` or manual dispatch).

**GitHub Actions secrets** (Settings → Secrets and variables → Actions):

| Secret | Purpose |
|--------|---------|
| `AZUREAPPSERVICE_CLIENTID_*` | Service principal client ID (from Azure → Deployment Center → GitHub) |
| `AZUREAPPSERVICE_TENANTID_*` | Azure AD tenant ID |
| `AZUREAPPSERVICE_SUBSCRIPTIONID_*` | Azure subscription ID |
| `AZURE_RESOURCE_GROUP` | *(optional)* Resource group name if auto-resolve fails |

OIDC federated login is used (`azure/login@v2`); a legacy `AZURE_CREDENTIALS` JSON secret is **not** required when the three `AZUREAPPSERVICE_*` secrets above exist.

The workflow builds a lean zip (production `node_modules` only, no tests/docs/etl/scripts), sets `WEBSITE_RUN_FROM_PACKAGE=1`, stops the app during deploy, uses `az webapp deploy --async true` with Kudu polling (30 min timeout), then restarts the app. Target zip size: **&lt;30 MB**; hard fail if **&gt;100 MB**.

Set runtime secrets in Azure **App Settings** (never commit `.env`). Configure CORS via `FRONTEND_URL` (defaults include `https://qippop.azurewebsites.net` and `http://localhost:3000`).

If deploys fail with 504: restart `qipp-api` in Azure Portal, disable any duplicate Azure DevOps deployment pipeline, verify App Service Plan tier / Kudu disk quota, then re-run the workflow.

## Security notes

- Rotate any credentials that were ever committed to git
- Use strong `JWT_SECRET` in production
- Rate limits apply to `/api/auth/*` and `POST /api/admin/check-pin`

## Architecture notes

- Shared API response helper: `utils/apiResponse.js` (`{ success, data }` / `{ success: false, message }`)
- Long-term: split `AdminUser` auth from roster HR records; optional httpOnly cookies via Next.js BFF (see [docs/AUTH_CONTRACT.md](docs/AUTH_CONTRACT.md))
