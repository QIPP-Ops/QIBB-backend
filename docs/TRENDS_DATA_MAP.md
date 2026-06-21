# QIPP Trends & Metrics Data Map

> Updated June 2026. Architecture: **bundled JSON in `data/trends-blobs/` → `GET /api/plant-data/trends-bundle` → frontend reads backend ONLY.**

---

## MongoDB usage (what still uses it)

**MongoDB is NOT used for trend metric values or time series on qipp.live.**

| Feature | Mongo? | Notes |
|---------|--------|-------|
| Auth / users / JWT | **Yes** | Login, roles, super admin |
| Roster / leave | **Yes** | Shift schedules, leave accrual |
| PTW | **Yes** | Permits, authorization seed |
| Quiz / training | **Yes** | Assignments, completions |
| Email / notifications | **Yes** | SMTP digests, chemistry alarms |
| Custom trend layouts | **Yes** | Trend Studio save/rename/delete only |
| Metric limits | **Yes** | Admin limit editor |
| Management trend access | **Yes** | Who can build trends |
| Trend display label overrides | **Optional** | `TrendDisplayConfig` merges onto bundle labels |
| **Trend values / charts** | **No** | Six-blob bundle only |

---

## Primary data flow (six-blob bundle)

```mermaid
flowchart LR
  Blobs[(data/trends-blobs/*.json)]
  Bundle[buildTrendsBundleFromSixBlobs]
  API[/api/plant-data/trends-bundle]
  FE[loadPlantTrendsCache]

  Blobs --> Bundle
  Bundle --> API
  API --> FE
```

**The six blob kinds (sole source of truth for trends/metrics):**

| Kind key | Blob file | Bundled path |
|----------|-----------|--------------|
| `daily_ops` | `daily_ops.json` | `data/trends-blobs/daily_ops.json` |
| `water` | `water.json` | `data/trends-blobs/water.json` |
| `hrsg` | `hrsg.json` | `data/trends-blobs/hrsg.json` |
| `fg_filter` | `fg_filter.json` | `data/trends-blobs/fg_filter.json` |
| `air_intake` | `air_intake.json` | `data/trends-blobs/air_intake.json` |
| `environment` | `environment.json` | `data/trends-blobs/environment.json` |

Trend JSON files are committed in the repo (or copied into `data/trends-blobs/` on the Render host via `TRENDS_BLOBS_DIR`).

---

## Backend endpoints (trends hot path)

| Route | Auth | Source | Purpose |
|-------|------|--------|---------|
| `GET /api/plant-data/trends-bundle` | Public | Six blobs merged | **Primary hot path** — unified payload + `bundleMeta` |
| `GET /api/plant-data/trends-cache` | Public | Same as trends-bundle | Backward-compatible alias |
| `GET /api/plant-data/trend-studio-metrics` | Public | Bundle metadata | Metric catalog for Trend Studio (no Mongo) |
| `GET /api/plant-data/trends-blobs/:kind` | Public | Single raw blob | Per-kind JSON |
| `GET /api/plant-data/trends-blobs/status` | Public | Bundle status | Kind list + readiness |
| `GET /api/admin/ingest-status` | Admin | Bundle status | Admin dashboard ingest panel |
| `POST /api/ingest/trigger`, `POST /api/plant-data/ingest` | **410** — legacy ingest removed |
| `POST /api/trends/sync-blob` | **410** — legacy ingest removed |

---

## Frontend consumption

1. `loadPlantTrendsCache()` → `GET /api/plant-data/trends-bundle`
2. Charts, Trend Studio, home dashboard, historical trends all read from the in-memory cache
3. No direct blob or Mongo access from the browser

---

## Updating trend data

1. Replace or update the six JSON files under `data/trends-blobs/`
2. Commit and deploy (or set `TRENDS_BLOBS_DIR` on Render to a writable path)
3. Restart is not required — bundle is rebuilt on next request (or `?rebuild=1`)

---

## Key backend files

| File | Role |
|------|------|
| `services/plantReports/trendsBlobBundle.js` | Read six JSON files from disk |
| `services/plantReports/buildTrendsBundleFromSixBlobs.js` | Merge into unified cache payload |
| `controllers/plantDataController.js` | `trends-bundle`, status endpoints |
| `controllers/ingestAdminController.js` | Admin ingest status (read-only) |
