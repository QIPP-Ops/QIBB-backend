# etl_energy_hourly.py
# Reads: DAILY-ACTUAL-ENERGY-PRODUCED-REPORT-QIPP-*.xlsx
# Writes to Cosmos collection: energy_hourly
#
# USE:  Actual MWh/hr, availability declaration, LDC reduction,
#       cumulative LDC, unavailability MW, contracted capacity
# SKIP: Hourly remarks column

from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any
import re

import pandas as pd

from db_config import get_db
from helpers import upsert_many


# Map Mongo field names -> Excel column headers
# Adjust these if your column headers differ
COL_MAP = {
    "hour":                 "Hr",
    "actual_mwh":           "Actual Energy Produced (Eai) MWh",
    "avail_decl_mw":        "Availability Declaration MW",
    "ldc_reduction_mwh":    "LDC Reduction MWh",
    "ldc_cumulative_mwh":   "Cumulative LDC Reduction MWh",
    "unavailability_mw":    "Actual Unavailability MW",
    "contracted_capacity_mw": "Contracted Capacity MW",
}


def parse_date_from_filename(filename: str) -> datetime:
    """
    Parse date from filenames like:
      DAILY-ACTUAL-ENERGY-PRODUCED-REPORT-QIPP-05-May-2026.xlsx
    """
    match = re.search(r"(\d{2})-([A-Za-z]+)-(\d{4})", filename)
    if match:
        return datetime.strptime(
            f"{match.group(1)}-{match.group(2)}-{match.group(3)}",
            "%d-%b-%Y"
        )
    raise ValueError(f"Cannot parse date from filename: {filename}")


def extract_energy_hourly(path: Path) -> List[Dict[str, Any]]:
    report_date = parse_date_from_filename(path.name)
    df = pd.read_excel(path, sheet_name=0)

    docs: List[Dict[str, Any]] = []

    for _, row in df.iterrows():
        hour = row.get(COL_MAP["hour"])
        if pd.isna(hour):
            continue

        doc: Dict[str, Any] = {
            "date":        report_date.date().isoformat(),
            "hour":        int(hour),
            "source_file": path.name,
        }

        for field, col in COL_MAP.items():
            if field == "hour":
                continue
            if col in df.columns:
                val = row.get(col)
                doc[field] = None if pd.isna(val) else float(val)

        # Flag heavy LDC curtailment hours (> 700 MWh reduction)
        if doc.get("ldc_reduction_mwh") is not None and doc["ldc_reduction_mwh"] > 700:
            doc["flag_heavy_ldc"] = True

        docs.append(doc)

    return docs


def run_energy_hourly(path: Path) -> None:
    db = get_db()
    coll = db["energy_hourly"]
    docs = extract_energy_hourly(path)
    upsert_many(coll, docs, key_fields=["date", "hour"])


if __name__ == "__main__":
    import os
    data_root = Path(os.environ.get("DATA_ROOT", "./data"))
    files = sorted(data_root.glob("DAILY-ACTUAL-ENERGY-PRODUCED-REPORT-QIPP-*.xlsx"))
    if not files:
        print("No energy hourly file found under DATA_ROOT")
    else:
        run_energy_hourly(files[-1])