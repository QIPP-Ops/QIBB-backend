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

**PTW authorization list:** Regenerate from Excel with `node scripts/parse-ptw-excel.js "<path-to-xlsx>"` (writes `data/ptw-authorization-2026.json`). `npm run seed:ptw` **replaces** `AdminConfig.ptwPersonnel` entirely from that file — it does not merge with existing DB names.

**Production (Azure):** The API **auto-seeds** `ptwPersonnel` from `data/ptw-authorization-2026.json` on startup when the list is empty or has fewer than 63 entries. Super admins can also call `POST /api/admin/seed-ptw` with `{ "force": true }` to replace the list without SSH. Manual fallback: `npm run seed:ptw` in Kudu or against production `COSMOS_URI`.

**Plant ingest (Azure App Settings):** `PLANT_INGEST_MAX_AGE_DAYS=365` (default in code), `AZURE_STORAGE_CONNECTION_STRING` or `BLOB_SAS_URL`, optional `PLANT_INGEST_MAX_FILES=200`, `BLOB_DOWNLOAD_TIMEOUT_MS=120000`.

**Warning:** `npm run seed` clears existing `AdminUser`, `AdminConfig`, and `PlantPerformance` data.

Default seeded passwords are defined in `seed.js` only — they are not printed to the console. Change them immediately in non-local environments.

## Authentication flow

1. `POST /api/auth/register` — creates account with `accessRole: viewer` (role cannot be set by client)
2. `POST /api/auth/verify-otp` — verifies email via OTP
3. Admin approves user via `PUT /api/admin/users/:id/approve`
4. `POST /api/auth/login` — returns JWT (requires verified email + approval)
5. `GET /api/auth/verify` — validates token (send `Authorization: Bearer <token>`)

All operational routes require a valid JWT unless noted otherwise. `/health` is public.

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

Production runs on Azure App Service (`qipp-api`). Set secrets in **App Settings** (never commit `.env`). Configure CORS via `FRONTEND_URL` (defaults include `https://qippop.azurewebsites.net` and `http://localhost:3000`).

## Security notes

- Rotate any credentials that were ever committed to git
- Use strong `JWT_SECRET` in production
- Rate limits apply to `/api/auth/*` and `POST /api/admin/check-pin`

## Architecture notes

- Shared API response helper: `utils/apiResponse.js` (`{ success, data }` / `{ success: false, message }`)
- Long-term: split `AdminUser` auth from roster HR records; optional httpOnly cookies via Next.js BFF (see [docs/AUTH_CONTRACT.md](docs/AUTH_CONTRACT.md))
