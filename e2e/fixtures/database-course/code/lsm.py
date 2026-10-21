"""A small, real, single-writer LSM tree, using only the Python standard library.

Keys are strings; values are JSON values (including None). The public API matches
engine.py. ``path`` is a directory. close() keeps the memtable in its WAL rather
than implicitly flushing it. scan(start, end) uses [start, end) key ordering.

There is no locking, transaction isolation, concurrent writer, or background
compaction. Do not change the store while consuming a scan. Each WAL frame is
one atomic batch for recovery. An incomplete final frame is truncated; a full
frame with a bad checksum is an error, never silently ignored.

sync='none' flushes Python buffers and survives process exit, but promises no
power-loss durability. sync='fsync' requests file and directory fsync in commit
order, on a filesystem supporting those operations. This is not a guarantee
against faulty disks/filesystems. After an I/O error, close and reopen: a batch
whose call failed may already be committed. compact() always publishes durably,
including when ordinary writes use sync='none'. A WAL is not a backup.
"""

from __future__ import annotations

import base64
import bisect
import hashlib
import heapq
import json
import math
import os
import re
import uuid
import zlib
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterator

from engine import (CorruptRecord, StoreStats, _json_bytes, _key, _operations,
                    _sync, _sync_directory, _write_all, encode_frame, read_frame)


@dataclass
class LSMStats(StoreStats):
    runs_considered: int = 0
    blocks_read: int = 0
    bloom_checks: int = 0
    bloom_negatives: int = 0
    bloom_positives: int = 0
    memtable_hits: int = 0
    wal_records_replayed: int = 0
    flushes: int = 0
    compactions: int = 0
    # Gauges, refreshed after writes/flush/compact/reset_stats; not I/O counters.
    run_count: int = 0
    disk_records: int = 0
    memtable_entries: int = 0
    index_entries: int = 0
    bloom_bytes: int = 0


# #region bloom
class BloomFilter:
    """A negative answer is exact; a positive answer still needs a disk lookup."""

    def __init__(self, expected_keys, bits_per_key=10, bits=None, hashes=None):
        size = max(8, math.ceil(max(1, expected_keys) * bits_per_key / 8))
        self.bits = bytearray(size) if bits is None else bytearray(bits)
        self.hashes = max(1, min(16, round(bits_per_key * math.log(2)))) if hashes is None else hashes
        if not self.bits or not isinstance(self.hashes, int) or not 1 <= self.hashes <= 16:
            raise CorruptRecord("invalid Bloom filter")

    def _positions(self, key):
        # Python's hash() is salted per process; persisted filters need stable hashes.
        digest = hashlib.blake2b(key.encode("utf-8"), digest_size=16).digest()
        first = int.from_bytes(digest[:8], "little")
        stride = int.from_bytes(digest[8:], "little") | 1
        for index in range(self.hashes):
            yield (first + index * stride) % (len(self.bits) * 8)

    def add(self, key):
        for position in self._positions(key):
            self.bits[position // 8] |= 1 << (position % 8)

    def may_contain(self, key):
        return all(self.bits[position // 8] & (1 << (position % 8))
                   for position in self._positions(key))
# #endregion bloom


@dataclass
class _Run:
    name: str
    keys: list
    offsets: list
    bloom: BloomFilter
    count: int
    first: str
    last: str
    block_records: int
    data_bytes: int


def _entry(operation):
    """CRC frames reuse engine.py's batches; the value carries LSM version data."""
    if len(operation) != 3 or operation[0] != "put":
        raise CorruptRecord("invalid LSM entry")
    value = operation[2]
    if (not isinstance(value, dict) or set(value) != {"seq", "deleted", "value"}
            or type(value["seq"]) is not int or value["seq"] < 1
            or type(value["deleted"]) is not bool):
        raise CorruptRecord("invalid LSM version")
    return operation[1], value


def _copy(value):
    return json.loads(_json_bytes(value))


class LSMStore:
    def __init__(self, path, sync="none", memtable_limit=64, block_records=16,
                 bloom_bits_per_key=10, bloom=True, _fault=None):
        if sync not in ("none", "fsync"):
            raise ValueError("sync must be 'none' or 'fsync'")
        if type(memtable_limit) is not int or memtable_limit < 1:
            raise ValueError("memtable_limit must be a positive integer")
        if type(block_records) is not int or block_records < 1:
            raise ValueError("block_records must be a positive integer")
        if not isinstance(bloom_bits_per_key, (int, float)) or not 1 <= bloom_bits_per_key <= 64:
            raise ValueError("bloom_bits_per_key must be between 1 and 64")
        self.path = Path(path)
        created = not self.path.exists()
        self.path.mkdir(parents=True, exist_ok=True)
        self.sync = sync
        self.memtable_limit = memtable_limit
        self.block_records = block_records
        self.bloom_bits_per_key = bloom_bits_per_key
        self.bloom_enabled = bloom
        self.stats = LSMStats()
        self._closed = False
        self._failed = False
        self._fault = _fault  # Integration tests exit a real process at commit boundaries.
        self._memtable = {}
        self._runs = []
        self._flushed_seq = 0
        self._seq = 0
        self._wal = None
        try:
            manifest = self.path / "manifest.json"
            if manifest.exists():
                if not (self.path / "wal.log").is_file():
                    raise CorruptRecord("WAL is missing from an existing LSM directory")
                data = self._read_metadata(manifest)
                if (not isinstance(data, dict) or data.get("format") != 1
                        or type(data.get("flushed_seq")) is not int or data["flushed_seq"] < 0
                        or not isinstance(data.get("runs"), list)
                        or not all(isinstance(name, str) for name in data["runs"])
                        or len(set(data["runs"])) != len(data["runs"])):
                    raise CorruptRecord("invalid LSM manifest")
                self._flushed_seq = data["flushed_seq"]
                self._seq = self._flushed_seq
                self._runs = [self._load_run(name) for name in data["runs"]]
            else:
                # A lost manifest must not silently orphan previously flushed values.
                if ((self.path / "wal.log").exists()
                        or any(self.path.glob("run-*"))):
                    raise CorruptRecord("manifest is missing from an existing LSM directory")
                self._replace_manifest([], 0)
            wal_created = not (self.path / "wal.log").exists()
            self._wal = open(self.path / "wal.log", "a+b", buffering=0)
            self._recover_wal()
            if sync == "fsync" and (created or wal_created):
                _sync(self._wal, self.stats)
                _sync_directory(self.path, self.stats)
                if created:
                    _sync_directory(self.path.parent, self.stats)
            self._remove_orphans()
            self._gauges()
        except BaseException:
            self.close()
            raise

    def _check_open(self):
        if self._closed:
            raise ValueError("store is closed; reopen it before using it")
        if self._failed:
            raise OSError("previous write failed; close and reopen the store")

    def _gauges(self):
        self.stats.run_count = len(self._runs)
        self.stats.disk_records = sum(run.count for run in self._runs)
        self.stats.memtable_entries = len(self._memtable)
        self.stats.index_entries = sum(len(run.keys) for run in self._runs)
        self.stats.bloom_bytes = sum(len(run.bloom.bits) for run in self._runs)

    def reset_stats(self):
        self.stats = LSMStats()
        self._gauges()

    def _checkpoint(self, name):
        if self._fault is not None:
            self._fault(name)

    def _read_metadata(self, path):
        try:
            raw = path.read_bytes()
            self.stats.bytes_read += len(raw)
            wrapper = json.loads(raw)
            payload = wrapper["payload"]
            if zlib.crc32(_json_bytes(payload)) != wrapper["crc32"]:
                raise ValueError("metadata checksum mismatch")
            return payload
        except (OSError, ValueError, TypeError, KeyError, UnicodeError) as error:
            raise CorruptRecord("invalid metadata: {}".format(path.name)) from error

    def _write_metadata(self, path, payload):
        data = _json_bytes({"payload": payload, "crc32": zlib.crc32(_json_bytes(payload))})
        with open(path, "wb", buffering=0) as output:
            _write_all(output, data, self.stats)
            if self.sync == "fsync":
                _sync(output, self.stats)

    def _load_run(self, name):
        if not isinstance(name, str) or not re.fullmatch(r"run-[0-9a-f]{32}", name):
            raise CorruptRecord("invalid run name")
        data = self._read_metadata(self.path / (name + ".index"))
        try:
            keys = [entry[0] for entry in data["index"]]
            offsets = [entry[1] for entry in data["index"]]
            count = data["count"]
            block_records = data["block_records"]
            if (type(count) is not int or count < 1 or type(block_records) is not int
                    or block_records < 1 or len(keys) != math.ceil(count / block_records)
                    or not all(isinstance(key, str) for key in keys)
                    or keys != sorted(set(keys)) or offsets[0] != 0
                    or any(type(offset) is not int or offset < 0 for offset in offsets)
                    or offsets != sorted(set(offsets)) or data["first"] != keys[0]
                    or not isinstance(data["last"], str) or keys[-1] > data["last"]
                    or type(data.get("data_bytes")) is not int or data["data_bytes"] < 1
                    or not (self.path / (name + ".sst")).is_file()
                    or (self.path / (name + ".sst")).stat().st_size != data["data_bytes"]):
                raise ValueError("invalid sparse index")
            bloom = BloomFilter(1, bits=base64.b64decode(data["bloom"], validate=True),
                                hashes=data["bloom_hashes"])
            return _Run(name, keys, offsets, bloom, count, data["first"], data["last"],
                        block_records, data["data_bytes"])
        except (OSError, ValueError, TypeError, KeyError, IndexError) as error:
            raise CorruptRecord("invalid SSTable index: {}".format(name)) from error

    # #region wal-batch
    def _recover_wal(self):
        self._wal.seek(0)
        previous = 0
        while True:
            try:
                frame = read_frame(self._wal, self.stats)
            except EOFError as error:
                # Only an incomplete suffix is discarded. CRC failures still raise.
                self._wal.truncate(error.args[0])
                if self.sync == "fsync":
                    _sync(self._wal, self.stats)
                break
            if frame is None:
                break
            entries = [_entry(operation) for operation in frame[1]]
            if not entries:
                raise CorruptRecord("empty LSM WAL batch")
            sequence = entries[0][1]["seq"]
            if sequence <= previous or any(value["seq"] != sequence for _, value in entries):
                raise CorruptRecord("non-monotonic LSM WAL batch")
            previous = sequence
            self._seq = max(self._seq, sequence)
            if sequence > self._flushed_seq:
                for key, value in entries:
                    self._memtable[key] = value
                self.stats.wal_records_replayed += 1
        self._wal.seek(0, os.SEEK_END)

    def write_batch(self, operations):
        self._check_open()
        operations = _operations(operations)  # Validate/copy before appending anything.
        if not operations:
            return
        sequence = self._seq + 1
        entries = [["put", operation[1], {"seq": sequence,
                    "deleted": operation[0] == "delete",
                    "value": operation[2] if operation[0] == "put" else None}]
                   for operation in operations]
        frame = encode_frame(entries)
        try:
            _write_all(self._wal, frame, self.stats)
            if self.sync == "fsync":
                _sync(self._wal, self.stats)  # One fsync per whole batch, not per key.
            self._seq = sequence
            for operation in entries:
                self._memtable[operation[1]] = operation[2]
            self._gauges()
            if len(self._memtable) >= self.memtable_limit:
                self.flush()
        except BaseException:
            self._failed = True
            raise

    def put(self, key, value):
        self.write_batch([("put", key, value)])

    def delete(self, key):
        self.write_batch([("delete", key)])
    # #endregion wal-batch

    # #region flush-manifest
    def _write_run(self, rows, count_hint):
        name = "run-" + uuid.uuid4().hex
        data_path = self.path / (name + ".sst")
        index_path = self.path / (name + ".index")
        data_tmp = self.path / (name + ".sst.tmp")
        index_tmp = self.path / (name + ".index.tmp")
        keys, offsets = [], []
        bloom = BloomFilter(count_hint, self.bloom_bits_per_key)
        count, first, last = 0, None, None
        try:
            with open(data_tmp, "wb", buffering=0) as output:
                for key, value in rows:
                    if last is not None and key <= last:
                        raise ValueError("SSTable rows must have unique, sorted keys")
                    if count % self.block_records == 0:
                        keys.append(key)
                        offsets.append(output.tell())
                    _write_all(output, encode_frame([["put", key, value]]), self.stats)
                    bloom.add(key)
                    first = key if first is None else first
                    last = key
                    count += 1
                if self.sync == "fsync":
                    _sync(output, self.stats)
                data_bytes = output.tell()
            if not count:
                return None
            self._write_metadata(index_tmp, {
                "index": list(zip(keys, offsets)), "count": count, "first": first,
                "last": last, "block_records": self.block_records, "data_bytes": data_bytes,
                "bloom": base64.b64encode(bloom.bits).decode("ascii"),
                "bloom_hashes": bloom.hashes,
            })
            os.replace(data_tmp, data_path)
            os.replace(index_tmp, index_path)
            if self.sync == "fsync":
                _sync_directory(self.path, self.stats)
            return _Run(name, keys, offsets, bloom, count, first, last, self.block_records, data_bytes)
        finally:
            data_tmp.unlink(missing_ok=True)
            index_tmp.unlink(missing_ok=True)

    def _replace_manifest(self, runs, sequence):
        temporary = self.path / "manifest.json.tmp"
        try:
            self._write_metadata(temporary, {"format": 1, "flushed_seq": sequence,
                                            "runs": [run.name for run in runs]})
            os.replace(temporary, self.path / "manifest.json")
            if self.sync == "fsync":
                _sync_directory(self.path, self.stats)
            self._runs = runs
            self._flushed_seq = sequence
        finally:
            temporary.unlink(missing_ok=True)

    def flush(self):
        self._check_open()
        if not self._memtable:
            return
        try:
            run = self._write_run(sorted(self._memtable.items()), len(self._memtable))
            self._checkpoint("flush.before_manifest")
            self._replace_manifest(self._runs + [run], self._seq)
            self._checkpoint("flush.after_manifest")
            # A crash here leaves duplicate WAL entries, skipped using flushed_seq.
            self._memtable.clear()
            self._wal.truncate(0)
            self._wal.seek(0)
            if self.sync == "fsync":
                _sync(self._wal, self.stats)
            self.stats.flushes += 1
            self._gauges()
        except BaseException:
            self._failed = True
            raise
    # #endregion flush-manifest

    def _read_row(self, file):
        try:
            frame = read_frame(file, self.stats)
        except EOFError as error:
            raise CorruptRecord("incomplete SSTable record") from error
        if frame is None:
            return None
        if len(frame[1]) != 1:
            raise CorruptRecord("SSTable frame must contain exactly one key")
        return _entry(frame[1][0])

    def _open_run(self, run):
        try:
            source = open(self.path / (run.name + ".sst"), "rb", buffering=0)
        except OSError as error:
            raise CorruptRecord("missing SSTable: {}".format(run.name)) from error
        if os.fstat(source.fileno()).st_size != run.data_bytes:
            source.close()
            raise CorruptRecord("SSTable length changed: {}".format(run.name))
        return source

    # #region sparse-find
    def _find(self, run, key):
        self.stats.runs_considered += 1
        if self.bloom_enabled:
            self.stats.bloom_checks += 1
            if not run.bloom.may_contain(key):
                self.stats.bloom_negatives += 1
                return None
            self.stats.bloom_positives += 1
        if key < run.first or key > run.last:
            return None
        block = max(0, bisect.bisect_right(run.keys, key) - 1)
        with self._open_run(run) as source:
            source.seek(run.offsets[block])
            self.stats.blocks_read += 1
            for _ in range(run.block_records):
                row = self._read_row(source)
                if row is None or row[0] > key:
                    return None
                if row[0] == key:
                    return row[1]
        return None

    def get(self, key, default=None):
        self._check_open()
        _key(key)
        if key in self._memtable:
            self.stats.memtable_hits += 1
            value = self._memtable[key]
        else:
            value = None
            # Runs are immutable; the manifest lists oldest first, newest last.
            for run in reversed(self._runs):
                value = self._find(run, key)
                if value is not None:
                    break
        return default if value is None or value["deleted"] else _copy(value["value"])
    # #endregion sparse-find

    # #region merge-scan
    def _iter_run(self, run, start=None, end=None):
        if (start is not None and start > run.last) or (end is not None and end <= run.first):
            return
        block = max(0, bisect.bisect_right(run.keys, start) - 1) if start is not None else 0
        index_offsets = set(run.offsets)
        previous = None
        with self._open_run(run) as source:
            source.seek(run.offsets[block])
            while True:
                if source.tell() in index_offsets:
                    self.stats.blocks_read += 1
                row = self._read_row(source)
                if row is None:
                    break
                key, value = row
                if previous is not None and key <= previous:
                    raise CorruptRecord("unordered SSTable keys")
                previous = key
                if end is not None and key >= end:
                    break
                if start is None or key >= start:
                    yield key, value

    def _merged(self, sources):
        heap = []
        try:
            for index, source in enumerate(sources):
                row = next(source, None)
                if row is not None:
                    heapq.heappush(heap, (row[0], index, row[1]))
            while heap:
                key, newest = heap[0][0], None
                while heap and heap[0][0] == key:
                    _, index, value = heapq.heappop(heap)
                    if newest is None or value["seq"] >= newest["seq"]:
                        newest = value
                    row = next(sources[index], None)
                    if row is not None:
                        heapq.heappush(heap, (row[0], index, row[1]))
                yield key, newest
        finally:
            # Early consumer exit must release every SSTable descriptor.
            for source in sources:
                close = getattr(source, "close", None)
                if close is not None:
                    close()

    def scan(self, start=None, end=None):
        self._check_open()
        if start is not None:
            _key(start)
        if end is not None:
            _key(end)
        if start is not None and end is not None and start >= end:
            return
        memory = iter([(key, value) for key, value in sorted(self._memtable.items())
                       if (start is None or key >= start) and (end is None or key < end)])
        sources = [self._iter_run(run, start, end) for run in self._runs] + [memory]
        merged = self._merged(sources)
        try:
            for key, value in merged:
                if not value["deleted"]:
                    yield key, _copy(value["value"])
        finally:
            merged.close()

    def items(self):
        return self.scan()
    # #endregion merge-scan

    # #region compact
    def compact(self):
        self._check_open()
        previous_sync = self.sync
        self.sync = "fsync"  # Reclaiming old files always follows durable publication.
        try:
            self.flush()
            if not self._runs:
                return
            merged = self._merged([self._iter_run(run) for run in self._runs])
            # We compact ALL runs. No older value remains behind a dropped tombstone.
            live = ((key, value) for key, value in merged if not value["deleted"])
            try:
                run = self._write_run(live, sum(run.count for run in self._runs))
            finally:
                live.close()
                merged.close()
            self._checkpoint("compact.before_manifest")
            self._replace_manifest([run] if run is not None else [], self._flushed_seq)
            self._checkpoint("compact.after_manifest")
            # Until the manifest replacement succeeds, all old runs stay intact.
            self._remove_orphans()
            self.stats.compactions += 1
            self._gauges()
        except BaseException:
            self._failed = True
            raise
        finally:
            self.sync = previous_sync
    # #endregion compact

    def _remove_orphans(self):
        live = {run.name for run in self._runs}
        for file in self.path.iterdir():
            match = re.fullmatch(r"(run-[0-9a-f]{32})\.(sst|index)(\.tmp)?", file.name)
            if match and (match[1] not in live or match[3]):
                file.unlink(missing_ok=True)

    def close(self):
        if self._wal is not None:
            self._wal.close()
        self._closed = True

    def __enter__(self):
        self._check_open()
        return self

    def __exit__(self, *_):
        self.close()
