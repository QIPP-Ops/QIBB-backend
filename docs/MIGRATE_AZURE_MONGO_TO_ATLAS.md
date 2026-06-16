# Restore QIPP data from Azure Cosmos DB → MongoDB Atlas

Production data (employees, leave, PTW permits, training quizzes, admin config, audit logs) lived in **Azure Cosmos DB (MongoDB API)** on App Service `qipp-api`. A fresh Atlas database only has what `npm run seed:mongodb` inserts (~52 roster rows from `data/roster.json`, super admin, PTW authorization list from JSON).

**If Azure Cosmos is still online**, you can copy everything to Atlas.

## What seed does *not* restore

| Data | In seed? | In Azure Mongo? |
|------|----------|-----------------|
| Roster names / empIds / embedded leaves | `seed:mongodb` (from `roster.json`) | Full `adminusers` with edits |
| Leave balances / SAP leave history | `seed:qipp-leave-data` (partial) | `adminusers` |
| PTW authorization matrix | Startup JSON seed (63 rows) | `adminconfigs.ptwPersonnel` + edits |
| PTW permits / dashboard | No | `ptws` |
| Training quizzes / assignments / attempts | Builtin quiz auto-seed only | `quizzes`, `quizassignments`, … |
| Admin users / roles / approvals | Super admin only | `adminusers` |
| Trend display / home layout config | No | `trenddisplayconfigs` |
| Shift reports, notifications, audit | No | various collections |

## Prerequisites

1. **Old Azure Cosmos connection string** — Azure Portal → Cosmos account → **Connection string** (Mongo API), or App Service `qipp-api` → Configuration → `MONGODB_URI` / `COSMOS_URI`.
2. **Atlas connection string** — same as Render `MONGODB_URI`.
3. Confirm **database name** (usually `QIPP`). Azure ETL scripts used `qipp_ops` for plant ETL only; the Node app uses `QIPP`.

## Option A — Node migration script (recommended)

From `QIBB-backend` (local or Render Shell):

```bash
# Dry run — list collection counts on Azure
SOURCE_MONGODB_URI='mongodb+srv://...@OLD-COSMOS.../QIPP?...' \
TARGET_MONGODB_URI='mongodb+srv://...@atlas.../QIPP?...' \
node scripts/migrate-azure-mongo-to-atlas.js --dry-run

# Full copy (drops nothing on target; upserts duplicate _id errors if re-run)
SOURCE_MONGODB_URI='...' TARGET_MONGODB_URI='...' \
node scripts/migrate-azure-mongo-to-atlas.js

# Replace target collections entirely
SOURCE_MONGODB_URI='...' TARGET_MONGODB_URI='...' \
node scripts/migrate-azure-mongo-to-atlas.js --drop-target
```

Env aliases: `AZURE_MONGODB_URI`, `COSMOS_URI` (source); `MONGODB_URI` (target).

After migration:

1. Restart Render service (or wait for auto-deploy).
2. Set `FRONTEND_URL=https://acwaops.com/qipp` on Render.
3. Hard-refresh `https://acwaops.com/qipp` and sign in again.

## Option B — mongodump / mongorestore

If you have MongoDB Database Tools installed:

```bash
mongodump --uri="$SOURCE_MONGODB_URI" --out=./azure-dump
mongorestore --uri="$TARGET_MONGODB_URI" --drop ./azure-dump/QIPP
```

## Option C — Azure still running, no dump yet

1. **Do not delete** Cosmos or `qipp-api` until Atlas is verified.
2. Export connection string from Azure.
3. Run Option A, B, or D.
4. Verify `GET /api/roster` (with auth) returns employees on Render.

## Option D — GitHub Actions (no Render Shell)

Use this when you have connection strings but no shell access on Render.

### 1. Add repository secrets

In **GitHub** → **QIPP-Ops/QIBB-backend** → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Secret name | Value |
|-------------|--------|
| `SOURCE_MONGODB_URI` | Old Azure Cosmos / `qipp-api` `MONGODB_URI` or `COSMOS_URI` |
| `TARGET_MONGODB_URI` | MongoDB Atlas URI (same as Render `MONGODB_URI`) |

Aliases also accepted by the workflow: `AZURE_MONGODB_URI` (source), `MONGODB_URI` (target).

**Never** commit these strings or paste them in workflow logs.

### 2. Run the workflow (dry run first)

1. **Actions** → **Migrate Azure to Atlas** → **Run workflow**
2. Branch: `main`
3. **dry_run:** `true` (default) — lists each collection and document count on Azure; **no writes**
4. Review the job log for expected collections (`adminusers`, `adminconfigs`, `ptws`, `quizzes`, …)

### 3. Run the full migration

1. **Actions** → **Migrate Azure to Atlas** → **Run workflow** again
2. **dry_run:** `false`
3. **drop_target:** `true` (recommended for a clean Atlas restore; drops each target collection before copy)
4. Wait for the job to finish (may take several minutes for large databases)

### 4. After the workflow succeeds

1. Restart the Render backend (Dashboard → **Manual Deploy** → **Clear build cache & deploy**, or change env and save).
2. Hard-refresh `https://acwaops.com/qipp` and sign in.
3. Verify personnel, leave, PTW, and training pages show data.

Workflow file: `.github/workflows/migrate-azure-to-atlas.yml` (manual `workflow_dispatch` only — never runs on push).

### 5. Check whether data exists (no shell)

After deploy, open:

```text
https://qibb-backend.onrender.com/ready
```

Look for:

| Field | Meaning |
|-------|---------|
| `databaseName` | MongoDB database Render is using (should be `QIPP`) |
| `adminUsersTotal` | All users in MongoDB |
| `rosterVisible` | Employees shown in UI (excludes super-admin service account) |

- **`rosterVisible: 0`** with `adminUsersTotal: 1` — only super admin in `QIPP.adminusers`. **Fix now:** run **Seed MongoDB Atlas** (see Option E below). Azure migration cannot help if source `adminusers` is empty.
- **`rosterVisible: 0`** with `adminUsersTotal: 0` — empty database; run migration or seed.
- **`rosterVisible: 50+`** — roster should appear on acwaops.com/qipp after hard refresh.

If `rosterHint` is present in `/ready`, follow that message.

**Common pitfall:** Atlas connection strings like `...@host.net/?appName=QIPP` have no database in the path. Render appends `/QIPP` via `MONGODB_DB_NAME`; the migrate script does the same. Older migrate runs without this fix copied data into MongoDB's default `test` database while Render reads `QIPP`.

### Azure subscription disabled

If Azure shows `ReadOnlyDisabledSubscription`, App Service deploys fail — that is expected. Cosmos may still be **readable** for migration, but if `SOURCE_MONGODB_URI` points at the wrong account/database, dry-run will show `Source adminusers: 0` or `1` and the workflow **fails** (need ≥ 10). When source is empty or unreachable, use **Seed MongoDB Atlas** — it loads ~52 employees from `data/roster.json` and does not need Azure.

## Option E — Seed roster from GitHub Actions (fallback — use when employees missing)

Use when Azure is gone, subscription disabled, or migration dry-run shows `Source adminusers < 10`. Loads ~52 employees from `data/roster.json` into Atlas **immediately** — no Azure required.

### Secrets (Actions → QIBB-backend → Settings → Secrets)

| Secret | Required | Notes |
|--------|----------|-------|
| `MONGODB_URI` | **Yes** | Same Atlas URI as Render (`MONGODB_URI` env var) |
| `SMTP_USER` | **Yes** | Super admin email (e.g. `admin@acwaops.com`) |
| `SMTP_PASS` | **Yes** | Super admin mailbox password |
| `SEED_DEFAULT_USER_PASSWORD` | Optional | Temp password for all roster logins |
| `MONGODB_DB_NAME` | Optional | Set `QIPP` if URI has no `/QIPP` path |

### Run now

1. **Actions** → **Seed MongoDB Atlas** → **Run workflow**
2. Branch: `main`
3. Leave **force_reset** off (upserts roster; does not wipe existing super admin)
4. Wait for job log: `rosterVisible (excludes super admin): 50+`
5. Check `https://qibb-backend.onrender.com/ready` → `rosterVisible` ≥ 50
6. Hard-refresh `https://acwaops.com/qipp` → Personnel page

Workflow: `.github/workflows/seed-mongodb-atlas.yml`

## If Azure is already deleted

You cannot recover production Mongo data. Use bundled seeds:

```bash
npm run seed:mongodb
SEED_DEFAULT_USER_PASSWORD='TempPass2026!' npm run seed:mongodb   # roster logins
npm run seed:qipp-leave-data
npm run seed:curriculum
PTW_FORCE_RESEED=1 npm start   # or restart Render after setting env
```

Trend **charts** come from `data/trends-blobs/*.json` on the API host (not Mongo) — sync with `npm run sync:trends-blobs` if blobs are empty.

## Verify after restore

```bash
curl -s https://qibb-backend.onrender.com/ready
# With JWT from login:
curl -s -H "Authorization: Bearer $TOKEN" https://qibb-backend.onrender.com/api/roster | head -c 500
curl -s -H "Authorization: Bearer $TOKEN" https://qibb-backend.onrender.com/api/admin/ptw | head -c 500
```
