# run_all_etl.py
import logging
import sys

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

def run_etl(name, module):
    logger.info(f"{'='*50}")
    logger.info(f"Starting ETL: {name}")
    try:
        module.run()
        logger.info(f"Completed ETL: {name}")
    except Exception as e:
        logger.error(f"FAILED ETL: {name} — {e}")
        raise

if __name__ == "__main__":
    import etl_water_balance
    import etl_daily_energy_hourly
    import etl_gt_air_intake_filters
    import etl_gt_fuel_gas_filters
    import etl_ro_hrsg_chemistry
    import etl_daily_operation

    etls = [
        ("Water Balance",           etl_water_balance),
        ("Daily Energy Hourly",     etl_daily_energy_hourly),
        ("GT Air Intake Filters",   etl_gt_air_intake_filters),
        ("GT Fuel Gas Filters",     etl_gt_fuel_gas_filters),
        ("RO / HRSG Chemistry",     etl_ro_hrsg_chemistry),
        ("Daily Operation Report",  etl_daily_operation),
    ]

    failed = []
    for name, module in etls:
        try:
            run_etl(name, module)
        except Exception:
            failed.append(name)

    if failed:
        logger.error(f"The following ETLs failed: {failed}")
        sys.exit(1)

    logger.info("All ETLs completed successfully.")