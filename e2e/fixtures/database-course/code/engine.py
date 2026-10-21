"""A disk-backed storage engine built in three teachable steps.

Only JSON values and string keys are supported. One process owns each database;
there is no concurrent writer, isolation, filesystem locking, or SQL layer.
``sync='none'`` survives process exit after a successful write, but does not
promise power-loss durability. ``sync='fsync'`` requests the filesystem's durable
write boundary. Neither mode makes claims about faulty hardware or filesystems.
"""

from __future__ import annotations

import json
import os
import struct
import tempfile
import zlib
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Iterator


class CorruptRecord(ValueError):
    """A complete on-disk record is invalid; never silently discard it."""


@dataclass
class StoreStats:
    """Bytes transferred by this engine, not physical-device IO counters."""

    bytes_written: int = 0
    bytes_read: int = 0
    records_read: int = 0
    syncs: int = 0


def _json_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, allow_nan=False,
                      separators=(",", ":")).encode("utf-8")


def _operations(operations: Iterable[tuple]) -> list[list]:
    """Validate the entire batch before changing any file."""
    result = []
    for operation in operations:
        if not isinstance(operation, (tuple, list)) or not operation:
            raise ValueError("operation must be ('put', key, value) or ('delete', key)")
        kind = operation[0]
        if kind not in ("put", "delete") or len(operation) != (3 if kind == "put" else 2):
            raise ValueError("invalid operation: {!r}".format(operation))
        if not isinstance(operation[1], str):
            raise TypeError("keys must be strings")
        result.append(list(operation))
    # Round-trip prevents caller mutation and gives all stores the same JSON types.
    return json.loads(_json_bytes(result))


def _key(key: str) -> None:
    if not isinstance(key, str):
        raise TypeError("keys must be strings")


def _sync_directory(path: Path, stats: StoreStats) -> None:
    descriptor = os.open(str(path), os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
    try:
        os.fsync(descriptor)
        stats.syncs += 1
    finally:
        os.close(descriptor)


def _write_all(file, data: bytes, stats: StoreStats) -> None:
    remaining = memoryview(data)
    while remaining:
        written = file.write(remaining)
        if not written:
            raise OSError("short write")
        stats.bytes_written += written
        remaining = remaining[written:]


def _sync(file, stats: StoreStats) -> None:
    file.flush()
    os.fsync(file.fileno())
    stats.syncs += 1


class _Store:
    def __init__(self, path, sync="none"):
        if sync not in ("none", "fsync"):
            raise ValueError("sync must be 'none' or 'fsync'")
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.sync = sync
        self.stats = StoreStats()
        self._closed = False

    def _check_open(self):
        if self._closed:
            raise ValueError("store is closed; reopen it before using it")

    def put(self, key, value):
        self.write_batch([("put", key, value)])

    def delete(self, key):
        self.write_batch([("delete", key)])

    def items(self):
        return self.scan()

    def reset_stats(self):
        self.stats = StoreStats()

    def __enter__(self):
        self._check_open()
        return self

    def __exit__(self, *_):
        self.close()


# #region snapshot
class JsonSnapshotStore(_Store):
    """Baseline: read and atomically rewrite the entire JSON object per batch."""

    def __init__(self, path, sync="none"):
        super().__init__(path, sync)
        if not self.path.exists():
            self._replace({}, durable=sync == "fsync")
        else:
            self._read()

    def _read(self):
        self._check_open()
        data = self.path.read_bytes()
        self.stats.bytes_read += len(data)
        self.stats.records_read += 1
        try:
            value = json.loads(data)
            if not isinstance(value, dict):
                raise ValueError("snapshot must be an object")
            return value
        except (ValueError, UnicodeError) as error:
            raise CorruptRecord("invalid snapshot: {}".format(self.path)) from error

    def _replace(self, rows, durable):
        descriptor, name = tempfile.mkstemp(prefix=self.path.name + ".", suffix=".tmp",
                                            dir=self.path.parent)
        try:
            with os.fdopen(descriptor, "wb", buffering=0) as output:
                _write_all(output, _json_bytes(rows), self.stats)
                if durable:
                    _sync(output, self.stats)
            os.replace(name, self.path)
            if durable:
                _sync_directory(self.path.parent, self.stats)
        finally:
            Path(name).unlink(missing_ok=True)

    # #region snapshot-commit
    def write_batch(self, operations):
        self._check_open()
        operations = _operations(operations)
        if not operations:
            return
        rows = self._read()
        for operation in operations:
            if operation[0] == "put":
                rows[operation[1]] = operation[2]
            else:
                rows.pop(operation[1], None)
        self._replace(rows, durable=self.sync == "fsync")
    # #endregion snapshot-commit

    def get(self, key, default=None):
        _key(key)
        return self._read().get(key, default)

    def scan(self, start=None, end=None):
        rows = self._read()
        for key in sorted(rows):
            if (start is None or key >= start) and (end is None or key < end):
                yield key, rows[key]

    def compact(self):
        self._replace(self._read(), durable=True)

    def close(self):
        self._closed = True
# #endregion snapshot


# #region framing
# #region frame-header
HEADER = struct.Struct("<II")  # payload byte length, CRC32(payload)
MAX_RECORD_BYTES = 64 * 1024 * 1024


def encode_frame(operations: list[list]) -> bytes:
    payload = _json_bytes(operations)
    if len(payload) > MAX_RECORD_BYTES:
        raise ValueError("batch exceeds 64 MiB; split it into smaller batches")
    return HEADER.pack(len(payload), zlib.crc32(payload)) + payload
# #endregion frame-header


def _decode_payload(payload: bytes, offset: int) -> list[list]:
    try:
        value = json.loads(payload)
        if not isinstance(value, list):
            raise ValueError("batch must be an array")
        return _operations(value)
    except (ValueError, TypeError, UnicodeError) as error:
        raise CorruptRecord("invalid batch at byte {}".format(offset)) from error


def read_frame(file, stats: StoreStats):
    """Return (offset, batch), EOF=None, or a distinguishable incomplete tail.

    No record is applied until its complete payload and checksum are validated.
    A checksum mismatch, including at EOF, is corruption rather than a torn tail.
    """
    offset = file.tell()
    header = file.read(HEADER.size)
    stats.bytes_read += len(header)
    if not header:
        return None
    if len(header) != HEADER.size:
        raise EOFError(offset)
    length, checksum = HEADER.unpack(header)
    if not 0 < length <= MAX_RECORD_BYTES:
        raise CorruptRecord("invalid record length at byte {}".format(offset))
    payload = file.read(length)
    stats.bytes_read += len(payload)
    if len(payload) != length:
        raise EOFError(offset)
    if zlib.crc32(payload) != checksum:
        raise CorruptRecord("CRC mismatch at byte {}".format(offset))
    operations = _decode_payload(payload, offset)
    stats.records_read += 1
    return offset, operations
# #endregion framing


# #region append-log
class AppendLogStore(_Store):
    """Append batches to disk; lookup scans the file without a resident index."""

    def __init__(self, path, sync="none"):
        super().__init__(path, sync)
        created = not self.path.exists()
        self._file = open(self.path, "a+b", buffering=0)
        self._failed = False
        try:
            # Validate/index in one pass; discard only an incomplete final frame.
            self._rebuild(recover=True)
            if created and sync == "fsync":
                _sync(self._file, self.stats)
                _sync_directory(self.path.parent, self.stats)
        except BaseException:
            self._file.close()
            self._closed = True
            raise

    def _check_open(self):
        super()._check_open()
        if getattr(self, "_failed", False):
            raise OSError("previous write failed; close and reopen for recovery")

    # #region recover-tail
    def _frames(self, recover=False):
        self._check_open()
        self._file.seek(0)
        while True:
            try:
                frame = read_frame(self._file, self.stats)
            except EOFError as error:
                if not recover:
                    raise CorruptRecord("incomplete tail; reopen for recovery") from error
                self._file.truncate(error.args[0])
                if self.sync == "fsync":
                    _sync(self._file, self.stats)
                return
            if frame is None:
                return
            yield frame
    # #endregion recover-tail

    # #region append-batch
    def write_batch(self, operations):
        self._check_open()
        operations = _operations(operations)
        if not operations:
            return
        frame = encode_frame(operations)
        self._file.seek(0, os.SEEK_END)
        offset = self._file.tell()
        try:
            _write_all(self._file, frame, self.stats)
            if self.sync == "fsync":
                _sync(self._file, self.stats)
        except BaseException:
            self._failed = True
            raise
        self._committed(offset, operations)
    # #endregion append-batch

    def _committed(self, offset, operations):
        pass

    def get(self, key, default=None):
        _key(key)
        value = default
        for _, operations in self._frames():
            for operation in operations:
                if operation[1] == key:
                    value = operation[2] if operation[0] == "put" else default
        return value

    def scan(self, start=None, end=None):
        # A scan's transient result is not a persistent value cache.
        rows = {}
        for _, operations in self._frames():
            for operation in operations:
                if operation[0] == "put":
                    rows[operation[1]] = operation[2]
                else:
                    rows.pop(operation[1], None)
        for key in sorted(rows):
            if (start is None or key >= start) and (end is None or key < end):
                yield key, rows[key]

    def close(self):
        if not self._closed:
            self._file.close()
            self._closed = True
# #endregion append-log

    # #region compaction
    def compact(self):
        """Publish latest live values with atomic rename; never resurrect deletes."""
        self._check_open()
        descriptor, name = tempfile.mkstemp(prefix=self.path.name + ".", suffix=".tmp",
                                            dir=self.path.parent)
        replaced = False
        try:
            # #region compact-publish
            with os.fdopen(descriptor, "wb", buffering=0) as output:
                for key, value in self.scan():
                    _write_all(output, encode_frame([["put", key, value]]), self.stats)
                _sync(output, self.stats)
            os.replace(name, self.path)
            replaced = True
            _sync_directory(self.path.parent, self.stats)
            # #endregion compact-publish
        finally:
            Path(name).unlink(missing_ok=True)
            if replaced:
                self._file.close()
                self._file = open(self.path, "a+b", buffering=0)
                self._rebuild()

    def _rebuild(self, recover=False):
        for _ in self._frames(recover=recover):
            pass
    # #endregion compaction


# #region index
class IndexedLogStore(AppendLogStore):
    """Cache only key -> (frame offset, operation position), never user values."""

    def __init__(self, path, sync="none"):
        super().__init__(path, sync)

    def _committed(self, offset, operations):
        for position, operation in enumerate(operations):
            if operation[0] == "delete":
                self._index.pop(operation[1], None)
            else:
                self._index[operation[1]] = (offset, position)

    def _rebuild(self, recover=False):
        self._index = {}
        for offset, operations in self._frames(recover=recover):
            self._committed(offset, operations)

    # #region index-get
    def get(self, key, default=None):
        self._check_open()
        _key(key)
        location = self._index.get(key)
        if location is None:
            return default
        offset, position = location
        self._file.seek(offset)
        frame = read_frame(self._file, self.stats)
        if frame is None or frame[0] != offset:
            raise CorruptRecord("indexed record disappeared at byte {}".format(offset))
        operations = frame[1]
        if position >= len(operations) or operations[position][:2] != ["put", key]:
            raise CorruptRecord("index points to a different record")
        return operations[position][2]
    # #endregion index-get

    def scan(self, start=None, end=None):
        self._check_open()
        for key in sorted(self._index):
            if (start is None or key >= start) and (end is None or key < end):
                yield key, self.get(key)
# #endregion index


STORES = {"snapshot": JsonSnapshotStore, "append": AppendLogStore,
          "indexed": IndexedLogStore}
