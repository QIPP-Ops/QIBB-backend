# run_all_etl.py
# Main orchestrator — runs all ETL extractors in sequence.
#
# Schedule this every 3 hours AFTER your SharePoint sync completes.
#
# Required env vars:
#   COSMOS_MONGO_URI  — full Cosmos connection string
#   COSMOS_DB_NAME    — defaults to "qipp_ops"
#   DATA_ROOT         — path to folder where synced Excel files land
#                       e.g. /data/qipp_sharepoint or ./data
#
# Usage:
#   python run_all_etl.py
#
# Or from QIBB-backend root:
#   python -m etl.run_all_etl

import os
import sys
import traceback
from pathlib import Path
from datetime import datetime

from helpers import latest_file
from etl_water_balance import run_water_balance
from etl_energy_hourly import run_energy_hourly
from etl_gt_air_filter import run_gt_air_filter
from etl_gt_fg_filter import run_gt_fg_filter
from etl_ro_hrsg import run_ro_hrsg

DATA_ROOT = Path(os.environ.get("DATA_ROOT", "./data"))


def run(label: str, fn, *args):
    """Run one ETL step, catch and log errors so others still execute."""
    print(f"\n{'─'*50}")
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Starting: {label}")
    try:
        fn(*args)
        print(f"[{datetime.now().strftime('%H:%M:%S')}] Done: {label}")
    except Exception as e:
        print(f"[{datetime.now().strftime('%H:%M:%S')}] ERROR in {label}: {e}")
        traceback.print_exc()


def main():
    print(f"\n{'='*50}")
    print(f"QIPP ETL — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"DATA_ROOT: {DATA_ROOT.resolve()}")
    print(f"{'='*50}")

    if not DATA_ROOT.exists():
        print(f"ERROR: DATA_ROOT does not exist: {DATA_ROOT.resolve()}")
        sys.exit(1)

    # ── 1. Water balance ───────────────────────────────────────────────
    water = latest_file(DATA_ROOT, "*Daily_water_consumption_followup-master*.xlsx")
    if water:
        run("Water Balance", run_water_balance, water)
    else:
        print("WARN: No water master file found, skipping")

    # ── 2. Daily energy hourly ─────────────────────────────────────────
    energy = latest_file(DATA_ROOT, "DAILY-ACTUAL-ENERGY-PRODUCED-REPORT-QIPP-*.xlsx")
    if energy:
        run("Energy Hourly", run_energy_hourly, energy)
    else:
        print("WARN: No energy hourly file found, skipping")

    # ── 3. GT air intake filters ───────────────────────────────────────
    air = latest_file(DATA_ROOT, "GTs-Air-Intake-Filter-DP-*.xlsx")
    if air:
        run("GT Air Intake Filter", run_gt_air_filter, air)
    else:
        print("WARN: No GT air filter file found, skipping")

    # ── 4. GT fuel gas filters ─────────────────────────────────────────
    fg = latest_file(DATA_ROOT, "GTs-FG-filter-DP-*.xlsx")
    if fg:
        run("GT FG Filter", run_gt_fg_filter, fg)
    else:
        print("WARN: No GT FG filter file found, skipping")

    # ── 5. RO / HRSG chemistry ─────────────────────────────────────────
    ro = latest_file(DATA_ROOT, "RO-HRSG-Report-*.xlsx")
    if ro:
        run("RO/HRSG Chemistry", run_ro_hrsg, ro)
    else:
        print("WARN: No RO-HRSG report found, skipping")

    print(f"\n{'='*50}")
    print(f"ETL complete — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*50}\n")


if __name__ == "__main__":
    main()