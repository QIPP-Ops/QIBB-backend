# etl_gt_fg_filter.py
# Reads: GTs-FG-filter-DP-*.xlsx
# Writes to Cosmos collection: gt_fg_filter
#
# USE:  Load (MW), DP DCS (bar), Stage Gas Pressure (bar),
#       In-service filter (A/B), Last filter change date
# SKIP: FG Separator before/after pressures, minute-level timestamps

from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any
import re

import pandas as pd

from db_config import get_db
from helpers import upsert_many


def parse_date_from_filename(filename: str) -> datetime:
    """
    Parse date from filenames like:
      GTs-FG-filter-DP-08.05.2026.xlsx
    """
    match = re.search(r"(\d{2})\.(\d{2})\.(\d{4})", filename)
    if match:
        return datetime.strptime(
            f"{match.group(1)}.{match.group(2)}.{match.group(3)}",
            "%d.%m.%Y"
        )
    raise ValueError(f"Cannot parse date from filename: {filename}")


def extract_gt_fg_filter(path: Path) -> List[Dict[str, Any]]:
    report_date = parse_date_from_filename(path.name)
    df = pd.read_excel(path, sheet_name=0)

    docs: List[Dict[str, Any]] = []

    for _, row in df.iterrows():
        gt = str(row.get("GT", "")).strip()
        if not gt or gt == "nan":
            continue

        load             = row.get("Load_MW")
        dp_dcs           = row.get("DP_DCS_bar")
        stage_gas_press  = row.get("Stage_Gas_Pressure_bar")
        in_service       = row.get("In_Service_Filter")
        last_change      = row.get("Last_Filter_Date")

        doc: Dict[str, Any] = {
            "date":                   report_date.date().isoformat(),
            "gt":                     gt,
            "source_file":            path.name,
            "load_mw":                float(load)            if pd.notna(load)            else None,
            "dp_dcs_bar":             float(dp_dcs)          if pd.notna(dp_dcs)          else None,
            "stage_gas_pressure_bar": float(stage_gas_press) if pd.notna(stage_gas_press) else None,
            "in_service_filter":      str(in_service)        if pd.notna(in_service)      else None,
            "last_filter_date":       str(last_change)       if pd.notna(last_change)     else None,
        }

        # Flag: action recommended above 0.5 bar, plan swap at 0.7 bar
        if doc["dp_dcs_bar"] is not None:
            if doc["dp_dcs_bar"] >= 0.7:
                doc["flag"] = "PLAN_FILTER_SWAP"
            elif doc["dp_dcs_bar"] >= 0.5:
                doc["flag"] = "MONITOR_DP_RISING"

        docs.append(doc)

    return docs


def run_gt_fg_filter(path: Path) -> None:
    db = get_db()
    coll = db["gt_fg_filter"]
    docs = extract_gt_fg_filter(path)
    upsert_many(coll, docs, key_fields=["date", "gt"])


if __name__ == "__main__":
    import os
    data_root = Path(os.environ.get("DATA_ROOT", "./data"))
    files = sorted(data_root.glob("GTs-FG-filter-DP-*.xlsx"))
    if not files:
        print("No GT FG filter file found under DATA_ROOT")
    else:
        run_gt_fg_filter(files[-1])