# sync_blob.py
# Downloads Excel files modified in the last 3 hours
# from Azure Blob Storage (container: report) into DATA_ROOT
#
# Required env vars:
#   BLOB_SAS_URL  — full Blob Service SAS URL
#   DATA_ROOT     — local folder to download files into

import os
from pathlib import Path
from datetime import datetime, timezone, timedelta

from azure.storage.blob import BlobServiceClient

BLOB_SAS_URL = os.environ["BLOB_SAS_URL"]
CONTAINER    = "report"
DATA_ROOT    = Path(os.environ.get("DATA_ROOT", "./data"))
LOOKBACK_HRS = 3

DATA_ROOT.mkdir(parents=True, exist_ok=True)


def sync():
    client    = BlobServiceClient(account_url=BLOB_SAS_URL)
    container = client.get_container_client(CONTAINER)
    cutoff    = datetime.now(timezone.utc) - timedelta(hours=LOOKBACK_HRS)

    downloaded = 0
    for blob in container.list_blobs():
        # Only xlsx files modified in the last 3 hours
        if not blob.name.endswith(".xlsx"):
            continue
        if blob.last_modified < cutoff:
            continue

        out_path = DATA_ROOT / blob.name
        blob_client = container.get_blob_client(blob.name)
        with open(out_path, "wb") as f:
            f.write(blob_client.download_blob().readall())
        print(f"Downloaded: {blob.name} (modified: {blob.last_modified})")
        downloaded += 1

    if downloaded == 0:
        print("No new files found in the last 3 hours")
    else:
        print(f"Sync complete — {downloaded} file(s) downloaded")


if __name__ == "__main__":
    sync()