# etl_daily_operation.py
"""
ETL for Daily Operation Report
Extracts: Plant Summary, Unit Generation, Weather, RO Plant, Chillers
Source: Local data/ folder (synced from Blob by sync_blob.py)
Target: Azure Cosmos DB (MongoDB API)
"""

import os
import re
import logging
from pathlib import Path
from datetime import datetime, timezone

import pandas as pd
from db_config import get_db
from helpers import latest_file, upsert_many

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

DATA_ROOT = Path(os.environ.get("DATA_ROOT", "./data"))
FILE_PATTERN = "*daily*oper*.xlsx"

COL_SUMMARY  = "daily_operation_summary"
COL_UNITS    = "daily_operation_units"
COL_WEATHER  = "daily_operation_weather"
COL_RO       = "daily_operation_ro"
COL_CHILLERS = "daily_operation_chillers"


def infer_date(path: Path) -> str:
    patterns = [
        r"(\d{4}[-_]\d{2}[-_]\d{2})",
        r"(\d{2}[-_]\d{2}[-_]\d{4})",
        r"(\d{8})",
    ]
    for p in patterns:
        m = re.search(p, path.name)
        if m:
            raw = m.group(1).replace("_", "-")
            for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%Y%m%d"):
                try:
                    return datetime.strptime(raw, fmt).strftime("%Y-%m-%d")
                except ValueError:
                    pass
    return "unknown"


def clean(df: pd.DataFrame) -> pd.DataFrame:
    df = df.dropna(how="all").dropna(axis=1, how="all")
    df.columns = [str(c).strip() for c in df.columns]
    return df.reset_index(drop=True)


def df_to_docs(df, report_date, source, section):
    docs = []
    for _, row in df.iterrows():
        doc = {k: (None if pd.isna(v) else v) for k, v in row.items()}
        doc["report_date"] = report_date
        doc["source_file"] = source
        doc["section"]     = section
        doc["ingested_at"] = datetime.now(timezone.utc).isoformat()
        docs.append(doc)
    return docs


def parse_section(sheets, keywords, report_date, source, section):
    docs = []
    for name, df in sheets.items():
        if any(re.search(k, name, re.I) for k in keywords):
            df = clean(df)
            if not df.empty:
                docs += df_to_docs(df, report_date, source, section)
    return docs


def run():
    db = get_db()
    files = sorted(DATA_ROOT.glob(FILE_PATTERN))
    if not files:
        logger.warning(f"No Daily Operation files found in {DATA_ROOT} matching {FILE_PATTERN}")
        return

    logger.info(f"Found {len(files)} Daily Operation file(s).")
    for path in files:
        logger.info(f"Processing: {path.name}")
        report_date = infer_date(path)
        try:
            xl = pd.ExcelFile(path)
            sheets = {s: xl.parse(s) for s in xl.sheet_names}
        except Exception as e:
            logger.error(f"  Failed to read {path.name}: {e}")
            continue

        source = path.name

        docs = parse_section(sheets, [r"summ", r"plant", r"overview", r"daily"], report_date, source, "plant_summary")
        logger.info(f"  Summary docs: {len(docs)}")
        upsert_many(db[COL_SUMMARY], docs, ["report_date", "source_file", "section"])

        docs = parse_section(sheets, [r"unit", r"gen", r"\bgt\b", r"\bst\b", r"block", r"turbine"], report_date, source, "unit_generation")
        logger.info(f"  Units docs: {len(docs)}")
        upsert_many(db[COL_UNITS], docs, ["report_date", "source_file", "section"])

        docs = parse_section(sheets, [r"weather", r"ambient", r"climate", r"meteo", r"temp"], report_date, source, "weather")
        logger.info(f"  Weather docs: {len(docs)}")
        upsert_many(db[COL_WEATHER], docs, ["report_date", "source_file", "section"])

        docs = parse_section(sheets, [r"\bro\b", r"desal", r"water", r"brine", r"permeate"], report_date, source, "ro_plant")
        logger.info(f"  RO docs: {len(docs)}")
        upsert_many(db[COL_RO], docs, ["report_date", "source_file", "section"])

        docs = parse_section(sheets, [r"chill", r"cool", r"hvac", r"inlet", r"iac"], report_date, source, "chillers")
        logger.info(f"  Chiller docs: {len(docs)}")
        upsert_many(db[COL_CHILLERS], docs, ["report_date", "source_file", "section"])

    logger.info("Daily Operation ETL complete.")


if __name__ == "__main__":
    run()