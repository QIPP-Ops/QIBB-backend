# QIPP Trends & Metrics Data Map

> Updated June 2026. Architecture: **Azure qipp-data container → six JSON blobs → `GET /api/plant-data/trends-bundle` → frontend reads backend ONLY.**

---

## Primary data flow (six-blob-only)

```mermaid
flowchart LR
  Azure[Azure qipp-data container]
  Sync[npm run sync:trends-blobs]
  Blobs[(data/trends-blobs/*.json)]
  Bundle[buildTrendsBundleFromSixBlobs]
  API[/api/plant-data/trends-bundle]
  Alias[/api/plant-data/trends-cache alias]
  FE[loadPlantTrendsCache]

  Azure --> Sync
  Sync --> Blobs
  Blobs --> Bundle
  Bundle --> API
  API --> Alias
  API --> FE
  Alias --> FE
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
| `GET /api/plant-data/trends-bundle` | Public | Six blobs merged | **Primary hot path** — unified payload |
| `GET /api/plant-data/trends-cache` | Public | Same as trends-bundle | Backward-compatible alias |
| `GET /api/plant-data/trends-blobs/:kind` | Public | Raw blob JSON | Admin/debug per-kind raw JSON |
| `GET /api/plant-data/trends-blobs/status` | Public | Filesystem | Which bundled blobs exist |
| `GET /api/plant-data/home-trends` | JWT | Bundle + trendEngine | Home dashboard KPI panels |
| `GET /api/plant-data/trend-panels?route=` | JWT | Bundle + TrendDefinition | Route-scoped chart panels |

**Removed / deprecated as primary sources:**

| Route | Status |
|-------|--------|
| `plant-trends-cache.json` / Cosmos rebuild on hot path | **Removed** — not used by trends-bundle |
| `GET /api/trends` | **410** — TrendsSnapshot chemistry merge removed |
| `GET /api/trends/history` | **410** — use trends-bundle |
| `GET /api/reports-v3/records?kind=energy\|timers_counters` | Routes through six-blob bundle (derived from daily_ops) or empty |
| `GET /api/plant-data/chemistry-water-overview` | Returns pointer to bundle (hrsg + water) |

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
    "metric_key_slug": [{ "date": "YYYY-MM-DD", "value": 123.4, "metric_key_slug": 123.4 }]
  },
  "blobSource": true,
  "blobKinds": ["daily_ops", "water", "hrsg", "fg_filter", "air_intake", "environment"]
}
```

- In-memory cache with blob mtime signature + `ETag` header.
- `Cache-Control: public, max-age=300`.
- Frontend client cache key: `six-blob-trends-bundle`, TTL 2h.

---

## Trend sources by page

| Frontend route | Kind | Data path |
|----------------|------|-----------|
| `/daily-operation` | `daily_ops` | Bundle → `recordsFromPlantCacheForKind` |
| `/water-balance` | `water` | Bundle |
| `/chemistry` | `hrsg` | Bundle |
| `/environment` | `environment` | Bundle |
| `/gt-filter` | `fg_filter` + `air_inlet_filter` | Bundle |
| `/energy` | `energy` (derived from daily_ops) | Bundle only — no reports-v3 |
| `/timers-counters` | `timers_counters` (derived from daily_ops MFEQH) | Bundle only |
| `/` home, `/trend-studio`, admin trends | Bundle via `loadPlantTrendsCache()` | Single request |

---

## Key modules

### Backend

| Module | Role |
|--------|------|
| `trendsBlobBundle.js` | Read raw blobs from disk with mtime memory cache |
| `trendBlobNormalize.js` | Nested/flat blob JSON → `{date, metric, value}[]` |
| `buildTrendsBundleFromSixBlobs.js` | Merge six blobs → unified payload + ETag cache |
| `metricCategory.js` | Canonical category inference |

### Frontend

| Module | Role |
|--------|------|
| `plantTrendsCache.ts` | `loadPlantTrendsCache()` → `GET /trends-bundle` |
| `trendRecordsFromCache.ts` | Bundle `seriesByKey` → flat records per kind |
| `trendsBlobClient.ts` | Kind constants + normalize helpers |
| `metricCategory.ts` | Canonical category inference |

---

## Legacy ingest (non-hot-path)

Cosmos ingest, `plant-trends-cache.json` rebuild scripts, and V3 jsonStore remain for admin/ingest tooling but are **not** on the public trends hot path. Do not wire new UI to them.
