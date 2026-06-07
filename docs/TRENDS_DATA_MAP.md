# QIPP Trends & Metrics Data Map

> Updated June 2026. Architecture: **Azure `qipp-data` container → six JSON blobs → `GET /api/plant-data/trends-bundle` → frontend reads backend ONLY.**

---

## MongoDB usage (what still uses it)

**Mongo/Cosmos is NOT used for trend metric values or time series on qipp.live.**

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

## FAQ: Why is data not loading / blobs empty?

### `data/trends-blobs/` only has `.gitkeep` on GitHub?

**This is normal until sync runs.** The ❌ on GitHub does **not** mean sync failed — it means the folder is a **placeholder** until `npm run sync:trends-blobs` runs with `AZURE_STORAGE_CONNECTION_STRING`.

**Fix options:**
1. **CI/deploy (recommended):** `.github/workflows/main_qipp-api.yml` runs `npm run sync:trends-blobs` when the `AZURE_STORAGE_CONNECTION_STRING` secret is set.
2. **Manual:** Copy blob files into `data/trends-blobs/` with exact names, then commit (if total size is reasonable, ~3–4 MB for full production set).
3. **Local dev:** Copy from `Downloads` (`water.json`, `daily_ops.json`, etc.) into `data/trends-blobs/`.

Without synced blobs, `GET /api/plant-data/trends-bundle` returns **503** and charts show empty.

---

## Primary data flow (six-blob-only)

```mermaid
flowchart LR
  Azure[Azure qipp-data container]
  Sync[npm run sync:trends-blobs]
  Blobs[(data/trends-blobs/*.json)]
  Bundle[buildTrendsBundleFromSixBlobs]
  API[/api/plant-data/trends-bundle]
  FE[loadPlantTrendsCache]

  Azure --> Sync
  Sync --> Blobs
  Blobs --> Bundle
  Bundle --> API
  API --> FE
```

**The six blob kinds (sole source of truth for trends/metrics on qipp.live):**

| Kind key | Blob file | Bundled path |
|----------|-----------|--------------|
| `daily_ops` | `daily_ops.json` | `data/trends-blobs/daily_ops.json` |
| `water` | `water.json` | `data/trends-blobs/water.json` |
| `hrsg` | `hrsg.json` | `data/trends-blobs/hrsg.json` |
| `fg_filter` | `fg_filter.json` | `data/trends-blobs/fg_filter.json` |
| `air_intake` | `air_intake.json` | `data/trends-blobs/air_intake.json` |
| `environment` | `environment.json` | `data/trends-blobs/environment.json` |

Sync: `npm run sync:trends-blobs` (requires `AZURE_STORAGE_CONNECTION_STRING`).

---

## Backend endpoints (trends hot path)

| Route | Auth | Source | Purpose |
|-------|------|--------|---------|
| `GET /api/plant-data/trends-bundle` | Public | Six blobs merged | **Primary hot path** — unified payload + `bundleMeta` |
| `GET /api/plant-data/trends-cache` | Public | Same as trends-bundle | Backward-compatible alias |
| `GET /api/plant-data/trend-studio-metrics` | Public | Bundle metadata | Metric catalog for Trend Studio (no Mongo) |
| `GET /api/plant-data/metric-display-names` | Public | Bundle + optional overrides | Display names + date ranges |
| `GET /api/plant-data/trends-blobs/:kind` | Public | Raw blob JSON | Debug / Trend Studio JSON preview |
| `GET /api/plant-data/trends-blobs/status` | Public | Filesystem | Which bundled blobs exist |
| `GET /api/plant-data/custom-trends` | JWT | Mongo | Saved trend layouts only |
| `POST /api/plant-data/custom-trends` | Super admin | Mongo | Save custom layout |

**Removed / deprecated:**

| Route / module | Status |
|----------------|--------|
| `POST /api/ingest/trigger`, `POST /api/plant-data/ingest` | **410** — legacy Cosmos ingest removed |
| `POST /api/trends/sync-blob` | **410** — use `sync:trends-blobs` |
| `/api/water-balance`, `/api/energy`, `/api/gt-filter`, `/api/daily-operation` | **Deleted** — use bundle |
| `/api/environmental-reports` | **Deleted** — use `environment` blob |
| `ingestScheduler`, `ingestCron`, `runIngestion` | **Deleted** |
| `data/plant-trends-cache.json` | **Removed** — not on hot path |
| `GET /api/trends`, `GET /api/trends/history` | **410** |

---

## Trend Studio (`/trend-studio`, super admin)

- **Metric list:** `loadPlantTrendsCache()` → bundle `metrics[]` + `seriesByKey` (no `PlantMetric` catalog)
- **Display names:** bundle labels + `metricCategory`; `GET /metric-display-names` from bundle
- **Charts / preview:** client-side from cache (`metricSeriesFromCache`, `metricPreviewFromCache`)
- **Raw blob preview:** `GET /trends-blobs/:kind` (kept)
- **Mongo (optional, non-blocking):** `listCustomTrends`, `adminApi.getUsers`, save/rename/delete layouts, metric limits, management access — failures show a warning banner, not a blocking toast

---

## Trend sources by page

| Frontend route | Kind | Data path |
|----------------|------|-----------|
| `/daily-operation` | `daily_ops` | Bundle via `reportsV3Api` → `loadPlantTrendsCache` |
| `/water-balance` | `water` | Bundle |
| `/chemistry` | `hrsg` | Bundle |
| `/environment` | `environment` | Bundle |
| `/gt-filter` | `fg_filter` + `air_inlet_filter` | Bundle |
| `/energy` | `energy` (derived) | Bundle |
| `/timers-counters` | `timers_counters` (derived) | Bundle |
| `/` home | Bundle via `loadPlantTrendsCache()` | Single request |
| `/trend-studio` | Bundle | Super admin — metric builder |

**Route consolidation:**
- `/admin-portal/trends` → redirects to `/trend-studio` (next.config)
- `/reports/environmental` → redirects to `/environment`

---

## Key modules (keep)

### Backend

| Module | Role |
|--------|------|
| `sync-trends-blobs-from-azure.js` | Download from Azure `qipp-data` |
| `trendBlobNormalize.js` | Nested/flat blob JSON → `{date, metric, value}[]` |
| `buildTrendsBundleFromSixBlobs.js` | Merge six blobs → unified payload |
| `metricCategory.js` | Canonical category inference |
| `metricDisplayNames.js` | Bundle-based display name map |

### Frontend

| Module | Role |
|--------|------|
| `plantTrendsCache.ts` | `loadPlantTrendsCache()` → `GET /trends-bundle` |
| `trendRecordsFromCache.ts` | Bundle → flat records per kind |
| `reportsV3Api` (client) | Bundle-only wrapper (no API records fetch for six kinds) |

---

## `data/` JSON files

| File | Keep? | Purpose |
|------|-------|---------|
| `data/trends-blobs/*.json` | **Yes** | Six-blob trends source |
| `data/roster.json` | **Yes** | Roster seed |
| `data/ptw-authorization-2026.json` | **Yes** | PTW seed |
| `data/training-catalog.json` | **Yes** | Training seed |
| Other seed files | **Yes** | Auth/admin features |
