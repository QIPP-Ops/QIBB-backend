# etl_ro_hrsg.py
# Reads: RO-HRSG-Report-*.xlsx
# Writes to Cosmos collection: ro_hrsg_chemistry
#
# CRITICAL rules:
#   - Blank row = unit not in service that day — store as absent, NEVER as zero
#   - "NO SAMPLE" rows = skip entirely, do not interpolate
#   - Sensor fault values = store with sensor_fault=True, never use for trending
#   - Only whichever DMF/CF/RO train has readings is in service that day
#
# Sections extracted:
#   Condensate, BFW, HP Drum, HP SH Steam,
#   LP Drum, LP SH Steam, CTP DIS Online DO

from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Optional
import re

import pandas as pd

from db_config import get_db
from helpers import upsert_many


# Known sensor fault NR numbers — values from these are flagged not trended
SENSOR_FAULT_NRS = {"NR#16228404"}

# Chemistry limits for auto-flagging out-of-spec readings
LIMITS = {
    "HP_SH_Steam": {
        "pH":      (9.4, 10.0),
        "SC_uS":   (7.0, 27.0),
        "CC_uS":   (None, 0.25),
        "SiO2_ppb":(None, 10.0),
        "Na_ppb":  (None, 6.0),
    },
    "Condensate": {
        "pH":      (9.4, 10.0),
        "SC_uS":   (7.0, 27.0),
        "CC_uS":   (None, 0.2),
        "DO_ppb":  (None, 50.0),
    },
    "HP_Drum": {
        "pH":      (9.3, 10.0),
        "SC_uS":   (5.5, 27.0),
        "DO_ppb":  (None, 1000.0),
    },
    "LP_Drum": {
        "pH":      (9.0, 10.0),
        "SC_uS":   (8.5, 47.0),
        "PO4_ppm": (None, 15.0),
    },
    "LP_SH_Steam": {
        "pH":      (9.4, 10.0),
        "SC_uS":   (7.0, 27.0),
        "CC_uS":   (None, 0.25),
        "Na_ppb":  (None, 6.0),
    },
}


def _safe_float(val) -> Optional[float]:
    """Return float or None — never coerce blank/error to 0."""
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def _check_limits(section: str, doc: Dict[str, Any]) -> None:
    """Add flag_out_of_spec=True if any value exceeds its limit."""
    limits = LIMITS.get(section, {})
    violations = []
    for param, (lo, hi) in limits.items():
        val = doc.get(param)
        if val is None:
            continue
        if lo is not None and val < lo:
            violations.append(f"{param}<{lo}")
        if hi is not None and val > hi:
            violations.append(f"{param}>{hi}")
    if violations:
        doc["flag_out_of_spec"] = True
        doc["spec_violations"] = violations


def _is_no_sample(flag_val) -> bool:
    if pd.isna(flag_val):
        return False
    return str(flag_val).strip().upper().startswith("NO SAMPLE")


def _is_sensor_fault(flag_val) -> bool:
    if pd.isna(flag_val):
        return False
    s = str(flag_val)
    return "fault" in s.lower() or any(nr in s for nr in SENSOR_FAULT_NRS)


def parse_date_from_filename(filename: str) -> datetime:
    """
    Handles formats:
      RO-HRSG-Report-FEB-02-2026-M.xlsx
      RO-HRSG-Report-APRIL-26-2026-M.xlsx
    """
    # Try DD-Mon-YYYY
    match = re.search(
        r"(JAN|FEB|MAR|APR|APRIL|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)-(\d{2})-(\d{4})",
        filename, re.IGNORECASE
    )
    if match:
        mon = match.group(1).upper()[:3]   # normalise APRIL → APR
        day = match.group(2)
        year = match.group(3)
        return datetime.strptime(f"{day}-{mon}-{year}", "%d-%b-%Y")
    raise ValueError(f"Cannot parse date from filename: {filename}")


# ── Section extractors ────────────────────────────────────────────────────────

def _extract_condensate(df: pd.DataFrame, report_date: datetime, source: str) -> List[Dict]:
    docs = []
    for _, row in df.iterrows():
        unit = row.get("Unit")
        if pd.isna(unit):
            continue
        flag_val = row.get("Flag")
        if _is_no_sample(flag_val):
            continue
        doc = {
            "date": report_date.date().isoformat(),
            "section": "Condensate",
            "unit": str(unit),
            "source_file": source,
            "pH":     _safe_float(row.get("pH")),
            "SC_uS":  _safe_float(row.get("SC_uS")),
            "CC_uS":  _safe_float(row.get("CC_uS")),
            "DO_ppb": _safe_float(row.get("DO_ppb")),
            "raw_flag": str(flag_val) if not pd.isna(flag_val) else None,
        }
        if _is_sensor_fault(flag_val):
            doc["sensor_fault"] = True
        else:
            _check_limits("Condensate", doc)
        docs.append(doc)
    return docs


def _extract_bfw(df: pd.DataFrame, report_date: datetime, source: str) -> List[Dict]:
    docs = []
    for _, row in df.iterrows():
        unit = row.get("Unit")
        if pd.isna(unit):
            continue
        flag_val = row.get("Flag")
        if _is_no_sample(flag_val):
            continue
        do_val = _safe_float(row.get("DO_ppb"))
        # negative DO = sensor error, discard the value
        if do_val is not None and do_val < 0:
            do_val = None
            sensor_fault = True
        else:
            sensor_fault = _is_sensor_fault(flag_val)
        doc = {
            "date": report_date.date().isoformat(),
            "section": "BFW",
            "unit": str(unit),
            "source_file": source,
            "pH":     _safe_float(row.get("pH")),
            "SC_uS":  _safe_float(row.get("SC_uS")),
            "CC_uS":  _safe_float(row.get("CC_uS")),
            "DO_ppb": do_val,
            "raw_flag": str(flag_val) if not pd.isna(flag_val) else None,
        }
        if sensor_fault:
            doc["sensor_fault"] = True
        docs.append(doc)
    return docs


def _extract_hp_drum(df: pd.DataFrame, report_date: datetime, source: str) -> List[Dict]:
    docs = []
    for _, row in df.iterrows():
        unit = row.get("Unit")
        if pd.isna(unit):
            continue
        flag_val = row.get("Flag")
        if _is_no_sample(flag_val):
            continue
        doc = {
            "date": report_date.date().isoformat(),
            "section": "HP_Drum",
            "unit": str(unit),
            "source_file": source,
            "pH":     _safe_float(row.get("pH")),
            "SC_uS":  _safe_float(row.get("SC_uS")),
            "PO4_ppm":_safe_float(row.get("PO4_ppm")),
            "DO_ppb": _safe_float(row.get("DO_ppb")),
            "raw_flag": str(flag_val) if not pd.isna(flag_val) else None,
        }
        if _is_sensor_fault(flag_val):
            doc["sensor_fault"] = True
        else:
            _check_limits("HP_Drum", doc)
        docs.append(doc)
    return docs


def _extract_hp_sh_steam(df: pd.DataFrame, report_date: datetime, source: str) -> List[Dict]:
    docs = []
    for _, row in df.iterrows():
        unit = row.get("Unit")
        if pd.isna(unit):
            continue
        flag_val = row.get("Flag")
        if _is_no_sample(flag_val):
            continue
        doc = {
            "date": report_date.date().isoformat(),
            "section": "HP_SH_Steam",
            "unit": str(unit),
            "source_file": source,
            "pH":      _safe_float(row.get("pH")),
            "SC_uS":   _safe_float(row.get("SC_uS")),
            "CC_uS":   _safe_float(row.get("CC_uS")),
            "SiO2_ppb":_safe_float(row.get("SiO2_ppb")),
            "Na_ppb":  _safe_float(row.get("Na_ppb")),
            "raw_flag": str(flag_val) if not pd.isna(flag_val) else None,
        }
        if _is_sensor_fault(flag_val):
            doc["sensor_fault"] = True
        else:
            _check_limits("HP_SH_Steam", doc)
        docs.append(doc)
    return docs


def _extract_lp_drum(df: pd.DataFrame, report_date: datetime, source: str) -> List[Dict]:
    docs = []
    for _, row in df.iterrows():
        unit = row.get("Unit")
        if pd.isna(unit):
            continue
        flag_val = row.get("Flag")
        if _is_no_sample(flag_val):
            continue
        doc = {
            "date": report_date.date().isoformat(),
            "section": "LP_Drum",
            "unit": str(unit),
            "source_file": source,
            "pH":      _safe_float(row.get("pH")),
            "SC_uS":   _safe_float(row.get("SC_uS")),
            "PO4_ppm": _safe_float(row.get("PO4_ppm")),
            "SiO2_ppb":_safe_float(row.get("SiO2_ppb")),
            "raw_flag": str(flag_val) if not pd.isna(flag_val) else None,
        }
        if _is_sensor_fault(flag_val):
            doc["sensor_fault"] = True
        else:
            _check_limits("LP_Drum", doc)
        docs.append(doc)
    return docs


def _extract_lp_sh_steam(df: pd.DataFrame, report_date: datetime, source: str) -> List[Dict]:
    docs = []
    for _, row in df.iterrows():
        unit = row.get("Unit")
        if pd.isna(unit):
            continue
        flag_val = row.get("Flag")
        if _is_no_sample(flag_val):
            continue
        doc = {
            "date": report_date.date().isoformat(),
            "section": "LP_SH_Steam",
            "unit": str(unit),
            "source_file": source,
            "pH":      _safe_float(row.get("pH")),
            "SC_uS":   _safe_float(row.get("SC_uS")),
            "CC_uS":   _safe_float(row.get("CC_uS")),
            "SiO2_ppb":_safe_float(row.get("SiO2_ppb")),
            "Na_ppb":  _safe_float(row.get("Na_ppb")),
            "raw_flag": str(flag_val) if not pd.isna(flag_val) else None,
        }
        if _is_sensor_fault(flag_val):
            doc["sensor_fault"] = True
        else:
            _check_limits("LP_SH_Steam", doc)
        docs.append(doc)
    return docs


def _extract_ctp_do(df: pd.DataFrame, report_date: datetime, source: str) -> List[Dict]:
    docs = []
    for _, row in df.iterrows():
        unit = row.get("Unit")
        if pd.isna(unit):
            continue
        flag_val = row.get("Flag")
        if _is_no_sample(flag_val):
            continue
        doc = {
            "date": report_date.date().isoformat(),
            "section": "CTP_DIS_DO",
            "unit": str(unit),
            "source_file": source,
            "DO_ppb": _safe_float(row.get("DO_ppb")),
            "raw_flag": str(flag_val) if not pd.isna(flag_val) else None,
        }
        if _is_sensor_fault(flag_val):
            doc["sensor_fault"] = True
        elif doc["DO_ppb"] is not None and doc["DO_ppb"] > 200:
            doc["flag_out_of_spec"] = True
            doc["spec_violations"] = [f"DO_ppb>{doc['DO_ppb']}"]
        docs.append(doc)
    return docs


# Sheet name -> extractor function mapping
SECTION_EXTRACTORS = {
    "Condensate":   _extract_condensate,
    "BFW":          _extract_bfw,
    "HP Drum":      _extract_hp_drum,
    "HP SH Steam":  _extract_hp_sh_steam,
    "LP Drum":      _extract_lp_drum,
    "LP SH Steam":  _extract_lp_sh_steam,
    "CTP DIS DO":   _extract_ctp_do,
}


def extract_ro_hrsg(path: Path) -> List[Dict[str, Any]]:
    report_date = parse_date_from_filename(path.name)
    source = path.name
    xl = pd.ExcelFile(path)
    docs: List[Dict[str, Any]] = []

    for sheet_name, extractor in SECTION_EXTRACTORS.items():
        if sheet_name in xl.sheet_names:
            df = xl.parse(sheet_name)
            section_docs = extractor(df, report_date, source)
            docs.extend(section_docs)
            print(f"  {sheet_name}: {len(section_docs)} rows extracted")
        else:
            print(f"  {sheet_name}: sheet not found, skipping")

    return docs


def run_ro_hrsg(path: Path) -> None:
    db = get_db()
    coll = db["ro_hrsg_chemistry"]
    docs = extract_ro_hrsg(path)
    upsert_many(coll, docs, key_fields=["date", "section", "unit", "source_file"])


if __name__ == "__main__":
    import os
    data_root = Path(os.environ.get("DATA_ROOT", "./data"))
    files = sorted(data_root.glob("RO-HRSG-Report-*.xlsx"))
    if not files:
        print("No RO-HRSG report found under DATA_ROOT")
    else:
        run_ro_hrsg(files[-1])