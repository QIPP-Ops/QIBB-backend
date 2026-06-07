# QIPP Trends & Metrics Data Map

> Updated June 2026. Architecture: **Azure `qipp-data` container → six JSON blobs → `GET /api/plant-data/trends-bundle` → frontend reads backend ONLY.**

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

## Azure blob JSON shapes (examples)

Blobs are **pre-parsed** JSON from the Azure Function pipeline — not raw Excel.

### `daily_ops.json` — nested units (Plant KPIs / Generation & Load)

```json
[
  {
    "date": "2026-05-01",
    "total_plant_load_mw": 450,
    "units": {
      "11": { "type": "GT", "avg_load_mw": 120, "total_gen_mwh": 2880, "mfeqh_hours": 22 },
      "20": { "type": "ST", "avg_load_mw": 80, "total_gen_mwh": 1920, "mfeqh_hours": 24 }
    }
  }
]
```

### `water.json` — flat daily water balance fields

```json
[
  {
    "date": "2026-05-01",
    "gr1_consumption_m3": 1200,
    "gr2_consumption_m3": 980,
    "total_production_m3": 5000
  }
]
```

### `hrsg.json` — nested units (chemistry per HRSG)

```json
[
  {
    "date": "2026-05-01",
    "units": {
      "20": { "condensate_ph": 8.2, "bfw_conductivity": 0.15 }
    }
  }
]
```

### `environment.json` — stack emissions + ambient

```json
[
  {
    "date": "2026-05-01",
    "stack_emissions": {
      "GT#11": { "nox": { "avg": 45.2, "max": 50.1, "min": 40.0 } }
    },
    "ambient": { "ambient_temp_max_c": 42.5 }
  }
]
```

### `fg_filter.json` — nested GT fuel-gas filter DP

```json
[
  {
    "date": "2026-05-01",
    "gts": {
      "11": { "fg_filter_dp": 12.5 }
    }
  }
]
```

### `air_intake.json` — readings array format

```json
[
  {
    "date": "2026-05-01",
    "readings": [
      { "gt": "11", "air_inlet_dp": 8.2 }
    ]
  }
]
```

Normalization: `trendBlobNormalize.js` converts all shapes → `{date, metric, value}[]` → unified `seriesByKey`.

---

## Backend endpoints (trends hot path)

| Route | Auth | Source | Purpose |
|-------|------|--------|---------|
| `GET /api/plant-data/trends-bundle` | Public | Six blobs merged | **Primary hot path** — unified payload + `bundleMeta` |
| `GET /api/plant-data/trends-cache` | Public | Same as trends-bundle | Backward-compatible alias |
| `GET /api/plant-data/trends-blobs/:kind` | Public | Raw blob JSON | Debug / Trend Studio JSON preview |
| `GET /api/plant-data/trends-blobs/status` | Public | Filesystem | Which bundled blobs exist |
| `GET /api/plant-data/home-trends` | JWT | Bundle + trendEngine | Home dashboard KPI panels |
| `GET /api/plant-data/trend-panels?route=` | JWT | Bundle + TrendDefinition | Route-scoped chart panels |

**Removed / deprecated as primary sources:**

| Route / file | Status |
|--------------|--------|
| `data/plant-trends-cache.json` | **Removed** — not on hot path |
| Cosmos rebuild scripts (`rebuild-trends-cache*`) | **Removed** — legacy ingest only |
| `GET /api/trends` | **410** |
| `GET /api/trends/history` | **410** |
| `services/plantReportsV3/output/*.json` stubs | **Removed** — orphaned placeholders |

---

## Bundle JSON format

API wraps payload as `{ success: true, data: { ... } }`. Inner shape:

```json
{
  "generatedAt": "ISO-8601",
  "dateRange": { "from", "to", "minDate", "maxDate", "pointCount" },
  "metrics": [
    { "metricKey": "slug_key", "label": "Display Name", "category": "daily_ops|hrsg_chemistry|...", "unit": "" }
  ],
  "seriesByKey": {
    "metric_key_slug": [{ "date": "YYYY-MM-DD", "value": 123.4 }]
  },
  "blobSource": true,
  "blobKinds": ["daily_ops", "water", "hrsg", "fg_filter", "air_intake", "environment"],
  "bundleMeta": {
    "kindsLoaded": ["daily_ops", "water", "..."],
    "totalMetrics": 142,
    "totalPoints": 18500,
    "formats": { "daily_ops": "nested", "water": "flat", "air_intake": "readings_array" }
  }
}
```

- In-memory cache with blob mtime signature + `ETag` header.
- `Cache-Control: public, max-age=300`.
- Frontend client cache key: `six-blob-trends-bundle`, TTL 2h.
- Frontend `loadPlantTrendsCache({ onProgress })` reports per-blob loading UX.

---

## Trend sources by page

| Frontend route | Kind | Data path |
|----------------|------|-----------|
| `/daily-operation` | `daily_ops` | Bundle (UI: **Generation & Load**) |
| `/water-balance` | `water` | Bundle |
| `/chemistry` | `hrsg` | Bundle |
| `/environment` | `environment` | Bundle (merged from `/reports/environmental` redirect) |
| `/gt-filter` | `fg_filter` + `air_inlet_filter` | Bundle |
| `/energy` | `energy` (derived from daily_ops) | Bundle only |
| `/timers-counters` | `timers_counters` (derived from daily_ops) | Bundle only |
| `/` home | Bundle via `loadPlantTrendsCache()` | Single request |
| `/trend-studio` | Bundle | **Super admin only** (Trend Studio — metric builder) |

**Route consolidation:**
- `/admin-portal/trends` → redirects to `/trend-studio` (canonical)
- `/reports/trends` → redirects to `/historical-trends`
- `/reports/environmental` → redirects to `/environment`
- Reports hub (`/reports`) = shift highlights, PTW, trainings — **no trend charts**

---

## `data/` JSON files — what remains and why

| File | Keep? | Purpose |
|------|-------|---------|
| `data/trends-blobs/*.json` | **Yes** | Six-blob trends source (synced from Azure) |
| `data/roster.json` | **Yes** | Seed roster / leave timeline for dev |
| `data/ptw-authorization-2026.json` | **Yes** | PTW authorization seed |
| `data/training-catalog.json` | **Yes** | Training catalog seed |
| `data/completed-courses-seed.json` | **Yes** | Training progress seed |
| `data/data.json` | **Yes** | General seed data |
| `data/plant_data.json` | **Yes** | Plant performance KPI seed (`seed.js`) |
| `data/qipp-safety-dashboard.json` | **Yes** | Safety dashboard seed |
| ~~`data/plant-trends-cache.json`~~ | **Deleted** | Legacy cache stub — superseded by six-blob bundle |
| ~~`data/plant_data_dash.json`~~ | **Deleted** | Unused duplicate dashboard seed |

---

## Key modules

### Backend

| Module | Role |
|--------|------|
| `trendsBlobBundle.js` | Read raw blobs from disk with mtime memory cache |
| `trendBlobNormalize.js` | Nested/flat blob JSON → `{date, metric, value}[]` |
| `buildTrendsBundleFromSixBlobs.js` | Merge six blobs → unified payload + `bundleMeta` + ETag |
| `metricCategory.js` | Canonical category inference |
| `sync-trends-blobs-from-azure.js` | Download from Azure `qipp-data` container |

### Frontend

| Module | Role |
|--------|------|
| `plantTrendsCache.ts` | `loadPlantTrendsCache()` → `GET /trends-bundle` + progress callback |
| `trends-load-progress.tsx` | Loading UX: "Loading blob 2/6 — Water Balance…" (home, historical hub, Trend Studio) |
| `trendRecordsFromCache.ts` | Bundle `seriesByKey` → flat records per kind |
| `portal-access.ts` | Historical trends = portal admin; Trend Studio = super admin |

---

## Legacy ingest (non-hot-path)

Cosmos ingest and V3 jsonStore remain for admin tooling but are **not** on the public trends hot path. Do not wire new UI to them.

Removed obsolete scripts: `rebuild-trends-cache*`, `verify-trends-cache`, `run-plant-ingest-local`, `probe-sample-reports`, `test-ingest-sample`, `reingest-daily-water`, `cleanup-*`.
