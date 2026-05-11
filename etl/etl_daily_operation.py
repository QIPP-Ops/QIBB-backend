# etl_daily_operation.py
"""
ETL for Daily Operation Report
Extracts: Plant Summary, Unit Generation, Weather, RO Plant, Chillers
Source: Azure Blob Storage (container: report)
Target: Azure Cosmos DB (MongoDB API)
"""

import os
import re
import logging
from datetime import datetime, timezone
from io import BytesIO

import pandas as pd
from azure.storage.blob import BlobServiceClient
from pymongo import MongoClient, UpdateOne

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# ── Config from environment ──────────────────────────────────────────────────
BLOB_SAS_URL   = os.environ["BLOB_SAS_URL"]        # full SAS URL to storage account
CONTAINER_NAME = "report"
COSMOS_URI     = os.environ["COSMOS_MONGO_URI"]
DB_NAME        = os.environ["COSMOS_DB_NAME"]

# Collection names
COL_SUMMARY    = "daily_operation_summary"
COL_UNITS      = "daily_operation_units"
COL_WEATHER    = "daily_operation_weather"
COL_RO         = "daily_operation_ro"
COL_CHILLERS   = "daily_operation_chillers"

FILE_PATTERN   = re.compile(r"daily.?oper", re.IGNORECASE)


# ── Helpers ──────────────────────────────────────────────────────────────────

def get_blob_client():
    return BlobServiceClient(account_url=BLOB_SAS_URL)

def list_daily_operation_blobs(container_client):
    blobs = []
    for b in container_client.list_blobs():
        if FILE_PATTERN.search(b.name):
            blobs.append(b.name)
    logger.info(f"Found {len(blobs)} Daily Operation Report files.")
    return blobs

def download_blob_to_df(container_client, blob_name) -> dict[str, pd.DataFrame]:
    """Download an Excel blob and return all sheets as a dict."""
    data = container_client.download_blob(blob_name).readall()
    xl = pd.ExcelFile(BytesIO(data))
    sheets = {sheet: xl.parse(sheet) for sheet in xl.sheet_names}
    logger.info(f"  Sheets in {blob_name}: {list(sheets.keys())}")
    return sheets

def infer_date_from_filename(blob_name: str) -> str | None:
    """Try to extract a date string from the filename."""
    patterns = [
        r"(\d{4}[-_]\d{2}[-_]\d{2})",   # 2024-03-15
        r"(\d{2}[-_]\d{2}[-_]\d{4})",   # 15-03-2024
        r"(\d{8})",                       # 20240315
    ]
    for p in patterns:
        m = re.search(p, blob_name)
        if m:
            raw = m.group(1).replace("_", "-")
            for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%Y%m%d"):
                try:
                    return datetime.strptime(raw, fmt).strftime("%Y-%m-%d")
                except ValueError:
                    pass
    return None

def clean_df(df: pd.DataFrame) -> pd.DataFrame:
    """Drop fully empty rows/cols and reset index."""
    df = df.dropna(how="all").dropna(axis=1, how="all")
    df.columns = [str(c).strip() for c in df.columns]
    df = df.reset_index(drop=True)
    return df

def df_to_docs(df: pd.DataFrame, report_date: str, blob_name: str, section: str) -> list[dict]:
    """Convert a DataFrame to a list of Cosmos-ready documents."""
    docs = []
    for _, row in df.iterrows():
        doc = {k: (None if pd.isna(v) else v) for k, v in row.items()}
        doc["report_date"] = report_date
        doc["source_file"] = blob_name
        doc["section"]     = section
        doc["ingested_at"] = datetime.now(timezone.utc).isoformat()
        docs.append(doc)
    return docs

def upsert_docs(collection, docs: list[dict], key_fields: list[str]):
    if not docs:
        return
    ops = []
    for doc in docs:
        filter_q = {k: doc[k] for k in key_fields if k in doc}
        ops.append(UpdateOne(filter_q, {"$set": doc}, upsert=True))
    result = collection.bulk_write(ops)
    logger.info(f"    Upserted {result.upserted_count} | Modified {result.modified_count}")


# ── Sheet parsers ─────────────────────────────────────────────────────────────

def parse_plant_summary(sheets: dict, report_date: str, blob_name: str) -> list[dict]:
    """Plant-level KPIs: net output, availability, heat rate, fuel, etc."""
    candidates = [s for s in sheets if re.search(r"summ|plant|overview|daily", s, re.I)]
    docs = []
    for name in candidates:
        df = clean_df(sheets[name])
        if df.empty:
            continue
        docs += df_to_docs(df, report_date, blob_name, "plant_summary")
    return docs

def parse_units(sheets: dict, report_date: str, blob_name: str) -> list[dict]:
    """Per-unit generation data: GT1, GT2, ST, HRSG, etc."""
    candidates = [s for s in sheets if re.search(r"unit|gen|gt|st|block|turbine", s, re.I)]
    docs = []
    for name in candidates:
        df = clean_df(sheets[name])
        if df.empty:
            continue
        docs += df_to_docs(df, report_date, blob_name, "unit_generation")
    return docs

def parse_weather(sheets: dict, report_date: str, blob_name: str) -> list[dict]:
    """Ambient conditions: temperature, humidity, pressure, wind."""
    candidates = [s for s in sheets if re.search(r"weather|ambient|climate|meteo|temp", s, re.I)]
    docs = []
    for name in candidates:
        df = clean_df(sheets[name])
        if df.empty:
            continue
        docs += df_to_docs(df, report_date, blob_name, "weather")
    return docs

def parse_ro(sheets: dict, report_date: str, blob_name: str) -> list[dict]:
    """Reverse Osmosis / Water desalination data."""
    candidates = [s for s in sheets if re.search(r"\bro\b|desal|water|brine|permeate", s, re.I)]
    docs = []
    for name in candidates:
        df = clean_df(sheets[name])
        if df.empty:
            continue
        docs += df_to_docs(df, report_date, blob_name, "ro_plant")
    return docs

def parse_chillers(sheets: dict, report_date: str, blob_name: str) -> list[dict]:
    """Chiller system data: inlet cooling, COP, loads."""
    candidates = [s for s in sheets if re.search(r"chill|cool|hvac|inlet|iac", s, re.I)]
    docs = []
    for name in candidates:
        df = clean_df(sheets[name])
        if df.empty:
            continue
        docs += df_to_docs(df, report_date, blob_name, "chillers")
    return docs


# ── Main ──────────────────────────────────────────────────────────────────────

def run():
    blob_service  = get_blob_client()
    container     = blob_service.get_container_client(CONTAINER_NAME)
    mongo         = MongoClient(COSMOS_URI)
    db            = mongo[DB_NAME]

    col_summary   = db[COL_SUMMARY]
    col_units     = db[COL_UNITS]
    col_weather   = db[COL_WEATHER]
    col_ro        = db[COL_RO]
    col_chillers  = db[COL_CHILLERS]

    blobs = list_daily_operation_blobs(container)
    if not blobs:
        logger.warning("No Daily Operation Report files found. Exiting.")
        return

    for blob_name in blobs:
        logger.info(f"Processing: {blob_name}")
        report_date = infer_date_from_filename(blob_name) or "unknown"

        try:
            sheets = download_blob_to_df(container, blob_name)
        except Exception as e:
            logger.error(f"  Failed to read {blob_name}: {e}")
            continue

        # ── Plant Summary ────────────────────────────────────────────────────
        docs = parse_plant_summary(sheets, report_date, blob_name)
        logger.info(f"  Plant summary docs: {len(docs)}")
        upsert_docs(col_summary, docs,
                    key_fields=["report_date", "source_file", "section"])

        # ── Unit Generation ──────────────────────────────────────────────────
        docs = parse_units(sheets, report_date, blob_name)
        logger.info(f"  Unit generation docs: {len(docs)}")
        upsert_docs(col_units, docs,
                    key_fields=["report_date", "source_file", "section"])

        # ── Weather ──────────────────────────────────────────────────────────
        docs = parse_weather(sheets, report_date, blob_name)
        logger.info(f"  Weather docs: {len(docs)}")
        upsert_docs(col_weather, docs,
                    key_fields=["report_date", "source_file", "section"])

        # ── RO Plant ─────────────────────────────────────────────────────────
        docs = parse_ro(sheets, report_date, blob_name)
        logger.info(f"  RO plant docs: {len(docs)}")
        upsert_docs(col_ro, docs,
                    key_fields=["report_date", "source_file", "section"])

        # ── Chillers ─────────────────────────────────────────────────────────
        docs = parse_chillers(sheets, report_date, blob_name)
        logger.info(f"  Chiller docs: {len(docs)}")
        upsert_docs(col_chillers, docs,
                    key_fields=["report_date", "source_file", "section"])

    logger.info("Daily Operation ETL complete.")
    mongo.close()


if __name__ == "__main__":
    run()