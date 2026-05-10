# etl_water_balance.py
# Reads: *Daily_water_consumption_followup-master*.xlsx
# Writes to Cosmos collection: water_balance
#
# USE:  GR-1..GR-6 daily consumption, totals, SW/DM prod/cons/delta, tank levels
# SKIP: 12-hour raw meter readings, blank sheets (sheets 9–31)

from pathlib import Path
from typing import List, Dict, Any

import pandas as pd

from db_config import get_db
from helpers import upsert_many


COL_MAP = {
    "GR1":      "GR-1 CONSUMPT",
    "GR2":      "GR-2 CONSUMPT",
    "GR3":      "GR-3 CONSUMPT",
    "GR4":      "GR-4 CONSUMPT",
    "GR5":      "GR-5 CONSUMPT",
    "GR6":      "GR-6 CONSUMPT",
    "GR_TOTAL": "Total GR CONSUMPT",
    "SW_PROD":  "Total SW PROD",
    "SW_CONS":  "Total SW CONSUMPT",
    "SW_DELTA": "Detal SW production vs consumption",
    "DM_PROD":  "Total DM PROD",
    "DM_CONS":  "Total DM CONSUMPT",
    "DM_DELTA": "Detal DW production vs consumption",
    "ST1":      "ST-1 level",
    "ST2":      "ST-2  level",
    "DT1":      "DT-1  level",
    "DT2":      "DT-2  level",
}


def extract_water_balance(path: Path) -> List[Dict[str, Any]]:
    df = pd.read_excel(path, sheet_name=0)

    # Detect date column
    if "Day" in df.columns:
        df["_date"] = pd.to_datetime(df["Day"], errors="coerce")
    elif "Date" in df.columns:
        df["_date"] = pd.to_datetime(df["Date"], errors="coerce")
    else:
        raise ValueError(f"No Day/Date column found in {path.name}")

    docs: List[Dict[str, Any]] = []

    for _, row in df.iterrows():
        if pd.isna(row.get("_date")):
            continue

        doc: Dict[str, Any] = {
            "date":        row["_date"].date().isoformat(),
            "source_file": path.name,
        }

        for field, col in COL_MAP.items():
            if col in df.columns:
                val = row.get(col)
                # missing stays None — never coerce to 0
                doc[field] = None if pd.isna(val) else float(val)

        # Flag negative SW or DM balance days
        if doc.get("SW_DELTA") is not None and doc["SW_DELTA"] < 0:
            doc["flag_sw_deficit"] = True
        if doc.get("DM_DELTA") is not None and doc["DM_DELTA"] < 0:
            doc["flag_dm_deficit"] = True

        docs.append(doc)

    return docs


def run_water_balance(path: Path) -> None:
    db = get_db()
    coll = db["water_balance"]
    docs = extract_water_balance(path)
    upsert_many(coll, docs, key_fields=["date", "source_file"])


if __name__ == "__main__":
    import os
    data_root = Path(os.environ.get("DATA_ROOT", "./data"))
    f = sorted(data_root.glob("*Daily_water_consumption_followup-master*.xlsx"))
    if not f:
        print("No water master file found under DATA_ROOT")
    else:
        run_water_balance(f[-1])