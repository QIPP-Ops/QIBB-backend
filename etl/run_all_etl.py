# run_all_etl.py
import logging
import subprocess
import sys
import os
from pathlib import Path
 
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

ETL_DIR = Path(__file__).parent

ETLS = [
    ("Water Balance",          "etl_water_balance.py"),
    ("Daily Energy Hourly",    "etl_energy_hourly.py"),
    ("GT Air Intake Filters",  "etl_gt_air_filter.py"),
    ("GT Fuel Gas Filters",    "etl_gt_fg_filter.py"),
    ("RO / HRSG Chemistry",    "etl_ro_hrsg.py"),
    ("Daily Operation Report", "etl_daily_operation.py"),
]

def run_etl(name, filename):
    logger.info("=" * 50)
    logger.info(f"Starting ETL: {name}")
    script = ETL_DIR / filename
    env = os.environ.copy()
    result = subprocess.run(
        [sys.executable, str(script)],
        env=env,
        capture_output=False
    )
    if result.returncode != 0:
        logger.error(f"FAILED ETL: {name} (exit code {result.returncode})")
        return False
    logger.info(f"Completed ETL: {name}")
    return True

if __name__ == "__main__":
    failed = []
    for name, filename in ETLS:
        ok = run_etl(name, filename)
        if not ok:
            failed.append(name)

    if failed:
        logger.error(f"The following ETLs failed: {failed}")
        sys.exit(1)

    logger.info("All ETLs completed successfully.")