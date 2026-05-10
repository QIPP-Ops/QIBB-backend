# helpers.py
# Shared utilities: find latest file, bulk upsert to Cosmos

from pathlib import Path
from typing import Iterable, Dict, Any, List
from pymongo import UpdateOne


def latest_file(data_root: Path, pattern: str) -> Path | None:
    """Return the most recently modified file matching pattern under data_root."""
    matches = sorted(
        data_root.glob(pattern),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    return matches[0] if matches else None


def upsert_many(coll, docs: Iterable[Dict[str, Any]], key_fields: List[str]) -> None:
    """
    Bulk upsert documents into a Cosmos collection.
    key_fields define the natural key (e.g. ["date", "gt"]).
    Existing docs with the same key are updated, new ones inserted.
    """
    docs = list(docs)
    if not docs:
        print(f"{coll.name}: no documents to upsert, skipping")
        return

    ops = []
    for d in docs:
        filt = {k: d[k] for k in key_fields}
        ops.append(UpdateOne(filt, {"$set": d}, upsert=True))

    result = coll.bulk_write(ops, ordered=False)
    print(
        f"{coll.name}: "
        f"upserted={result.upserted_count} "
        f"modified={result.modified_count} "
        f"total={len(docs)}"
    )