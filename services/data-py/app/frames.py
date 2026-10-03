"""Typed dataset frames for queries: the cached Parquet file, read into a small
in-process LRU. Keys are Parquet object keys, which change on every rewrite,
so a cached frame is never stale.
"""

import asyncio
from collections import OrderedDict

import polars as pl

from app.db.models import Dataset
from app.errors import Problem
from app.storage import Storage

MAX_FRAMES = 4

_frames: OrderedDict[str, pl.DataFrame] = OrderedDict()
_lock = asyncio.Lock()


async def load_frame(dataset: Dataset, storage: Storage) -> pl.DataFrame:
    key = dataset.parquet_object_key
    if not key:
        raise Problem(409, "Dataset not ready", "This dataset is still processing.")
    frame = _frames.get(key)
    if frame is not None:
        _frames.move_to_end(key)
        return frame
    async with _lock:
        frame = _frames.get(key)
        if frame is None:
            path = await storage.parquet_path(key)
            frame = await asyncio.to_thread(pl.read_parquet, path)
            _frames[key] = frame
            while len(_frames) > MAX_FRAMES:
                _frames.popitem(last=False)
    return frame
