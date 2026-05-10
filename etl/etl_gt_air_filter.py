# etl_gt_air_filter.py
# Reads: GTs-Air-Intake-Filter-DP-*.xlsx
# Writes to Cosmos collection: gt_air_filter
#
# USE:  Load (MW), DP DCS (mbar), DP Local (mbar), Aux Comp status
# SKIP: P1C static pressure, GT Inst Air Press (secondary readings)
#
# Notes:
#   - GT-12 at low MW on shutdown day is context, not a performance flag
#   - GT-31/32 low DCS DP (1.0–1.1 mbar) at 120 MW = likely sensor issue, flagged
#   - Only 3/12 aux compressors available = pulse cleaning mostly inactive

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
      GTs-Air-Intake-Filter-DP-08.05.2026.xlsx
    """
    match = re.search(r"(\d{2})\.(\d{2})\.(\d{4})", filename)
    if match:
        return datetime.strptime(
            f"{match.group(1)}.{match.group(2)}.{match.group(3)}",
            "%d.%m.%Y"
        )
    raise ValueError(f"Cannot parse date from filename: {filename}")


def extract_gt_air_filter(path: Path) -> List[Dict[str, Any]]:
    report_date = parse_date_from_filename(path.name)
    df = pd.read_excel(path, sheet_name=0)

    docs: List[Dict[str, Any]] = []

    for _, row in df.iterrows():
        gt = str(row.get("GT", "")).strip()
        if not gt or gt == "nan":
            continue

        load    = row.get("Load_MW")
        dp_dcs  = row.get("DP_DCS_mbar")
        dp_loc  = row.get("DP_Local_mbar")
        aux     = row.get("Aux_Comp_Status")

        doc: Dict[str, Any] = {
            "date":            report_date.date().isoformat(),
            "gt":              gt,
            "source_file":     path.name,
            "load_mw":         float(load)   if pd.notna(load)   else None,
            "dp_dcs_mbar":     float(dp_dcs) if pd.notna(dp_dcs) else None,
            "dp_local_mbar":   float(dp_loc) if pd.notna(dp_loc) else None,
            "aux_comp_status": str(aux)       if pd.notna(aux)    else None,
        }

        # Flag: high DP on DCS (above clean filter baseline of 5.5 mbar)
        if doc["dp_dcs_mbar"] is not None and doc["dp_dcs_mbar"] > 5.5:
            doc["flag"] = "HIGH_DP"

        # Flag: suspiciously low DCS DP under load — likely sensor issue
        if (
            doc["dp_dcs_mbar"] is not None
            and doc["load_mw"] is not None
            and doc["dp_dcs_mbar"] < 2.0
            and doc["load_mw"] > 100
        ):
            doc["flag"] = "LOW_DP_SENSOR_CHECK"

        # Flag: aux compressor not available = no pulse cleaning
        if doc["aux_comp_status"] and "not available" in doc["aux_comp_status"].lower():
            doc["flag_no_pulse_clean"] = True

        docs.append(doc)

    return docs


def run_gt_air_filter(path: Path) -> None:
    db = get_db()
    coll = db["gt_air_filter"]
    docs = extract_gt_air_filter(path)
    upsert_many(coll, docs, key_fields=["date", "gt"])


if __name__ == "__main__":
    import os
    data_root = Path(os.environ.get("DATA_ROOT", "./data"))
    files = sorted(data_root.glob("GTs-Air-Intake-Filter-DP-*.xlsx"))
    if not files:
        print("No GT air filter file found under DATA_ROOT")
    else:
        run_gt_air_filter(files[-1])