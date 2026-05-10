# db_config.py
# Cosmos DB (MongoDB API) connection
# Set COSMOS_MONGO_URI in your environment before running

import os
from pymongo import MongoClient

COSMOS_URI = os.environ.get("COSMOS_MONGO_URI")
if not COSMOS_URI:
    raise RuntimeError("COSMOS_MONGO_URI environment variable is not set")

MONGO_DB_NAME = os.environ.get("COSMOS_DB_NAME", "qipp_ops")

_client = MongoClient(COSMOS_URI)
_db = _client[MONGO_DB_NAME]


def get_db():
    return _db