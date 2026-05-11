# sync_blob.py
import os
import logging
from pathlib import Path
from azure.storage.blob import BlobServiceClient

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

BLOB_SAS_URL   = os.environ["BLOB_SAS_URL"]
CONTAINER_NAME = "report"
LOCAL_DIR      = Path("./data")

def run():
    LOCAL_DIR.mkdir(exist_ok=True)
    client    = BlobServiceClient(account_url=BLOB_SAS_URL)
    container = client.get_container_client(CONTAINER_NAME)

    blobs = list(container.list_blobs())
    logger.info(f"Found {len(blobs)} blobs in '{CONTAINER_NAME}'.")

    for blob in blobs:
        dest = LOCAL_DIR / blob.name.replace("/", "_")
        if dest.exists():
            logger.info(f"  Skipping (already exists): {blob.name}")
            continue
        logger.info(f"  Downloading: {blob.name}")
        data = container.download_blob(blob.name).readall()
        dest.write_bytes(data)
        logger.info(f"  Saved: {dest}")

    logger.info("Sync complete.")

if __name__ == "__main__":
    run()