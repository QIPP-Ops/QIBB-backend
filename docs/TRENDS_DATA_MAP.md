# QIPP Trends & Metrics Data Map

> Generated after pipeline cleanup (June 2026). Architecture: **Azure blobs → backend ingest/sync → `plant-trends-cache.json` (+ optional `trends-blobs/`) → frontend reads backend API only.**

---

## Primary data flow

```mermaid
flowchart LR
  Azure[Azure qipp-data container]
  LegacyIngest[Legacy plantReports ingest]
  V3Sync[plantReportsV3 azureSync]
  Cosmos[(Cosmos PlantMetricPoint)]
  Cache[(plant-trends-cache.json)]
  Blobs[(data/trends-blobs/*.json)]
  V3Store[(data-v3/*.json)]
  API[/api/plant-data/trends-cache]
  V3API[/api/reports-v3/records]
  FE[Frontend loadPlantTrendsCache + reportsV3Api]

  Azure --> LegacyIngest
  Azure --> V3Sync
  LegacyIngest --> Cosmos
  Cosmos --> Cache
  Azure --> Blobs
  V3Sync --> V3Store
  Cache --> API
  Blobs --> API
  V3Store --> V3API
  API --> FE
  V3API --> FE
```

---

## Backend endpoints (trends / metrics / plant-data)

| Route | Auth | Source | Purpose |
|-------|------|--------|---------|
| `GET /api/plant-data/trends-cache` | Public | Disk `plant-trends-cache.json` | **Primary hot path** — full cache payload |
| `GET /api/plant-data/trends-cache?rebuild=1` | Admin | Cosmos → rebuild | Force cache rebuild |
| `GET /api/plant-data/trends-blobs/:kind` | Public | `data/trends-blobs/{kind}.json` | Raw bundled blob JSON (admin/debug; frontend no longer proxies) |
| `GET /api/plant-data/trends-blobs/status` | Public | Filesystem | Which bundled blobs exist |
| `GET /api/plant-data/home-trends` | JWT | Cache + trendEngine | Home dashboard KPI panels |
| `GET /api/plant-data/management-trends` | JWT | Cache + trendEngine | Management operational dashboard |
| `GET /api/plant-data/trend-panels?route=` | JWT | Cache + TrendDefinition | Route-scoped chart panels |
| `GET /api/plant-data/trend-panels/:panelId` | JWT | Cache + TrendDefinition | Single panel series |
| `GET /api/plant-data/metrics/series?keys=` | JWT | Cosmos / cache | Multi-metric time series |
| `GET /api/plant-data/metrics/:key/preview` | JWT | Cache `seriesByKey` | Admin metric preview |
| `GET /api/plant-data/trend-preview` | JWT | Cache | Admin trend preview |
| `GET /api/plant-data/metric-display-names` | Public | DB + cache metadata | Display name map |
| `GET /api/plant-data/metrics/date-range` | Public | Cosmos bounds | Global min/max dates |
| `GET /api/plant-data/historical-dashboard` | JWT | Cosmos | Legacy historical dashboard |
| `GET /api/reports-v3/records?kind=` | JWT | V3 jsonStore | Flat `{date, metric, value}[]` for **energy**, **timers_counters** |
| `GET /api/reports-v3/metrics?kind=` | JWT | V3 jsonStore | Metric name list per kind |
| `GET /api/reports-v3/latest-date?kind=` | JWT | V3 jsonStore | Latest date per kind |
| `GET /api/trends` | JWT | TrendsSnapshot (Cosmos) | Chemistry merge snapshots |
| `GET /api/trends/history` | JWT | TrendsSnapshot | Historical chemistry snapshots |
| `GET /api/trends/saved` | JWT | SavedTrend model | Trend Studio saved charts |

**Legacy routes (still mounted, no frontend consumers):** `/api/energy`, `/api/water-balance`, `/api/gt-filter`, `/api/daily-operation` — candidates for future removal once external clients confirmed absent.

---

## Cache JSON format (`plant-trends-cache.json`)

API wraps payload as `{ success: true, data: { ... } }`. Inner shape:

```json
{
  "generatedAt": "ISO-8601",
  "dateRange": { "from", "to", "minDate", "maxDate", "pointCount", "snapshotCount" },
  "metrics": [
    { "metricKey": "slug_key", "label": "Display Name", "category": "chemistry|energy|...", "unit": "" }
  ],
  "seriesByKey": {
    "metric_key_slug": [
      { "date": "YYYY-MM-DD", "value": 123.4, "metric_key_slug": 123.4 }
    ]
  },
  "chemistryWater": { "latest": {...}, "snapshots": [...] }
}
```

- **Not flat rows on the wire** — time series are **nested by metric key** in `seriesByKey`.
- Frontend converts back to flat `{date, metric, value}` via `trendRecordsFromCache.ts` / `recordsFromPlantCacheForKind()` for historical pages.
- Categories in cache today mix legacy values (`chemistry`, `energy`, `water`) with inferred kinds; see **Recommended taxonomy** below.

---

## Azure blob → file mapping (`qipp-data` container)

| Kind key | Blob file | Sync script | Bundled path |
|----------|-----------|-------------|--------------|
| `daily_ops` | `daily_ops.json` | `npm run sync:trends-blobs` | `data/trends-blobs/daily_ops.json` |
| `water` | `water.json` | same | `data/trends-blobs/water.json` |
| `hrsg` | `hrsg.json` | same | `data/trends-blobs/hrsg.json` |
| `fg_filter` | `fg_filter.json` | same | `data/trends-blobs/fg_filter.json` |
| `air_intake` | `air_intake.json` | same | `data/trends-blobs/air_intake.json` |
| `environment` | `environment.json` | same | `data/trends-blobs/environment.json` |

V3 jsonStore kinds (separate from bundled six): `water`, `energy`, `environment`, `daily_ops`, `fg_filter`, `air_inlet_filter`, `timers_counters`, `hrsg` — stored under `data-v3/` (or `/home/data-v3` on Azure).

---

## Trend sources by page

### Historical trend pages (flat records from cache)

| Frontend route | reportsV3Api kind | Backend data path | Record format | Notes |
|----------------|-------------------|-------------------|---------------|-------|
| `/daily-operation` | `daily_ops` | `GET /plant-data/trends-cache` → `recordsFromPlantCacheForKind` | Flat `{date, metric, value}` derived from `seriesByKey` | Load, MWh, MFEQH per GT/ST |
| `/water-balance` | `water` | Same cache path | Flat rows | Consumption, production, tank levels |
| `/chemistry` | `hrsg` | Same cache path | Flat rows | HRSG / RO / ST chemistry parameters |
| `/environment` | `environment` | Same cache path | Flat rows | NOx, SOx, stack, ambient |
| `/gt-filter` | `fg_filter` + `air_inlet_filter` | Same cache path | Flat rows | FG filter DP + air intake P1C/DP |
| `/energy` | `energy` | `GET /reports-v3/records?kind=energy` | Native flat V3 `{date, metric, value}[]` | **Not yet in plant-trends-cache** |
| `/timers-counters` | `timers_counters` | `GET /reports-v3/records?kind=timers_counters` | Native flat V3 | **Not yet in plant-trends-cache** |

Implementation: `QIBB-frontend/src/lib/api.ts` — `reportsV3Api.getRecords()` uses cache for `isTrendBlobKind()` kinds, else hits `/reports-v3/records`.

### Home & management dashboards

| Frontend | Backend endpoint | Metrics source |
|----------|------------------|----------------|
| `/` home KPI sections | `loadPlantTrendsCache()` + `GET /plant-data/home-trends` | `seriesByKey` + TrendDefinition panels |
| `/` chemistry water section | Cache `chemistryWater` + cache series | HRSG/water KPI tiles |
| Management dashboard | `GET /plant-data/management-trends` | Cache + trendEngine |
| `/reports/trends` Smart Trends | `loadPlantTrendsCache()` | Full cache, user-selected metrics |
| `/trend-studio` | Cache + `/reports-v3/records` + SavedTrend API | Mixed kinds |
| `/admin-portal/trends` | Cache + metric preview | Admin metric catalog |

### Chemistry deep-dive

| Frontend | Data |
|----------|------|
| `/chemistry/trends/[parameterKey]` | Cache via `chemistryHistory.ts` / `loadPlantTrendsCache` |
| Chemistry merge (RO/ST) | `GET /api/trends` TrendsSnapshot + cache fallback (`use-chemistry-merge-trends.ts`) |

---

## Ingest pipelines (active — do not delete)

| Pipeline | Schedule | Output | Role |
|----------|----------|--------|------|
| `ingestScheduler.js` | 15 min | Cosmos + cache rebuild | Legacy Excel blob parsers |
| `jobs/ingestCron.js` | 2 h | Cosmos + cache rebuild | Deduped legacy ingest |
| `plantReportsV3/azureSync.js` | 2 h | `data-v3/*.json` | V3 parsers for energy/timers + upload path |
| `sync-trends-blobs-from-azure.js` | Manual / CI | `data/trends-blobs/` | Bundle raw JSON for backend fallback route |
| Startup ingest (`index.js`) | Once | Cache if missing | Cold-start seed |

Legacy parsers under `services/plantReports/parsers/` remain **required** until cache build migrates fully off Cosmos aggregation.

---

## Removed in cleanup (June 2026)

| Item | Reason |
|------|--------|
| `QIBB-backend-main/`, `QIBB-frontend-master/` | Stale duplicate checkouts (10 commits behind) |
| `services/plantReportsV3/trendSync.js` | Never wired to production |
| `scripts/discover-plant-reports.js` | Standalone CLI, unused |
| `npm run ingest:parse-json` | Referenced missing script |
| Frontend `src/app/api/trends/**` (6 routes) | Replaced by backend cache |
| `trendBlobRecords.ts`, `trendBlobAuth.ts`, `azure-blob.ts` | Dead blob proxy stack |
| `loadMergedTrendBlobCache`, `fetchTrendBlobRecords*` | Zero callers after cache-only routing |
| Frontend `dailyOperationApi`, `energyApi`, `gtFilterApi`, `waterBalanceApi` | No component imports |

---

## Recommended taxonomy

### Problem

`inferMetricCategory` previously inferred categories from **metric name substrings**, producing unstable types and listing metric **values** as separate “types” in admin UIs.

### Canonical kinds (implemented)

Shared module: `services/trends/metricCategory.js` (backend) and `src/lib/metricCategory.ts` (frontend).

| Kind | Use for |
|------|---------|
| `hrsg_chemistry` | HRSG, RO, ST chemistry, condensate, BFW, pH, conductivity |
| `environment` | Emissions, stack, ambient |
| `fg_filter` | Fuel-gas filter DP |
| `air_intake` | Air inlet / P1C / intake DP |
| `chillers` | Chiller / cooling water (when present) |
| `water_consumption` | GR consumption, usage, delta |
| `water_production` | SW/DM production, makeup |
| `tanks` | Tank levels |
| `daily_ops` | Shift/daily operation, plant load from ops reports |
| `energy` | MWh, load, heat rate, efficiency |
| `timers_counters` | MFEQH, starts, trips, counters |
| `other` | Fallback |

### Usage

```js
const { inferMetricCategory } = require('./services/trends/metricCategory');
inferMetricCategory('gr1_consumpt_m3', 'GR-1 Consumption', 'water'); // → water_consumption
```

Pass **`sourceKind`** (blob/V3 kind) whenever available — avoids misclassification from metric labels alone.

### Next steps (not yet implemented)

1. Migrate `plant-trends-cache.json` `metrics[].category` to canonical kinds on rebuild.
2. Route `energy` and `timers_counters` through cache like the other six kinds (eliminate dual V3 path).
3. Retire legacy `/api/energy` etc. after confirming no external consumers.
4. Consolidate `ingestScheduler` + `ingestCron` to single schedule once Cosmos dependency removed.

---

## Key frontend modules

| Module | Role |
|--------|------|
| `plantTrendsCache.ts` | `loadPlantTrendsCache()` → `GET /plant-data/trends-cache` |
| `trendRecordsFromCache.ts` | Cache `seriesByKey` → flat records per kind |
| `trendsFromCache.ts` | Chart helpers from cache |
| `trendPanelsLoad.ts` | Home/management panel hydration |
| `trendsBlobClient.ts` | Kind constants + normalize helpers (fetch removed) |
| `metricCategory.ts` | Canonical category inference |

---

## Key backend modules

| Module | Role |
|--------|------|
| `plantTrendsCache.js` | Build/write/read cache file |
| `trendsBlobBundle.js` | Serve bundled blob JSON |
| `trendEngine.js` | Panel/KPI assembly for home/management routes |
| `plantReportsV3/azureSync.js` | V3 blob → jsonStore |
| `metricCategory.js` | Canonical category inference |
