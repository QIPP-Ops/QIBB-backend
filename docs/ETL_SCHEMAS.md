# ETL collection schemas

Python ETL scripts under `etl/` write to Cosmos DB (MongoDB API). Node controllers query the same collections. Date fields may appear as `report_date` (string `YYYY-MM-DD`) or `date` depending on the pipeline — controllers generally accept both.

Environment: set `COSMOS_MONGO_URI` (same value as `COSMOS_URI` in the Node app). Database name defaults to `qipp_ops` (`COSMOS_DB_NAME`).

| Collection | ETL script | Primary date field | Notes |
|------------|------------|-------------------|--------|
| `water_balance` | `etl_water_balance.py` | `report_date` | GR consumption, SW/DM prod/cons/delta, tank levels |
| `energy_hourly` | `etl_energy_hourly.py` | `report_date` | Hourly energy metrics |
| `gt_filter` | `etl_gt_air_filter.py`, `etl_gt_fg_filter.py` | `report_date` | GT filter differential pressure |
| `daily_operation` | `etl_daily_operation.py` | `report_date` | Daily ops summary |
| `plant_performance` | (KPI seed / trends) | `date` (Date) | Dashboard KPIs from `plant_data.json` |
| `trends_snapshots` | SharePoint sync / upload | `report_date` | Environmental trend snapshots |

## water_balance

Typical document fields (from ETL `COL_MAP`):

- `report_date`, `source_file`, `ingested_at`
- `GR1`–`GR6`, `GR_TOTAL`, `SW_PROD`, `SW_CONS`, `SW_DELTA`, `DM_PROD`, `DM_CONS`, `DM_DELTA`, `ST1`, `ST2`, `DT1`, `DT2`

API: `GET /api/water-balance?days=30`, `GET /api/water-balance/bydate?date=YYYY-MM-DD`

## energy_hourly

Hourly plant energy rows keyed by `report_date`. API mirrors water balance (`/api/energy`, `/api/energy/bydate`).

## gt_filter

Filter performance by unit; `report_date` indexed. API: `/api/gt-filter`.

## daily_operation

Daily operational metrics. API: `/api/daily-operation` (+ `/bydate`, `/summary`, `/kpis`).

## environmental_reports

Managed by Node (not Python ETL): manual import/export via `/api/environmental-reports`.

## Operational notes

- Upserts use `report_date` + `source_file` where applicable (`helpers.upsert_many`).
- After schema changes, re-run `python etl/run_all_etl.py` or individual ETL scripts.
- Controllers use `$or` on `report_date` and `date` when collection history mixes field names.
