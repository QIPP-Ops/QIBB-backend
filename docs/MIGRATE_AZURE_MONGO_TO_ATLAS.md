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
3. Run Option A or B.
4. Verify `GET /api/roster` (with auth) returns employees on Render.

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
