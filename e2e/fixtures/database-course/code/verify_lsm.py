"""Real-file integration checks: python3 code/verify_lsm.py.

Each crash case exits a separate Python process with os._exit: it cannot rely on
close(), finally blocks, or resident dictionaries. These are process-crash tests,
not a simulation of power loss or faulty storage hardware.
"""

from __future__ import annotations

import json
import os
import random
import subprocess
import sys
import tempfile
from dataclasses import asdict
from pathlib import Path

from engine import CorruptRecord, StoreStats, read_frame
from lsm import LSMStore


def child(action, path):
    if action == "wal":
        store = LSMStore(path, sync="fsync", memtable_limit=1000)
        store.write_batch([("put", "stable", "on disk"), ("put", "gone", "old")])
        store.flush()
        store.write_batch([("put", "fresh", {"rows": [1, 2]}),
                           ("put", "null", None), ("delete", "gone")])
        os._exit(73)
    if action.startswith("flush.") or action.startswith("compact."):
        def crash(point):
            if point == action:
                os._exit(86)
        store = LSMStore(path, sync="fsync", memtable_limit=1000, _fault=crash)
        if action.startswith("flush."):
            store.write_batch([("put", "key", "new"), ("delete", "gone"),
                               ("put", "null", None)])
            store.flush()
        else:
            store.compact()
        raise AssertionError("crash boundary was not reached")
    if action == "reopen":
        with LSMStore(path, sync="fsync", memtable_limit=1000) as store:
            assert store.get("gone", "absent") == "absent"
            assert store.get("key") == "new"
            assert store.get("null", "absent") is None
            assert list(store.items()) == [("key", "new"), ("null", None), ("stable", 1)]
    else:
        raise ValueError("unknown child action")


def run_child(action, path, expected=0):
    completed = subprocess.run([sys.executable, str(Path(__file__).resolve()),
                                "--child", action, str(path)],
                               text=True, capture_output=True, timeout=30)
    assert completed.returncode == expected, (action, completed.returncode,
                                               completed.stdout, completed.stderr)


def read_sstables(path):
    """Inspect real disk records rather than trusting lookup results alone."""
    result = []
    for file in sorted(Path(path).glob("*.sst")):
        rows = []
        with file.open("rb") as source:
            while True:
                frame = read_frame(source, StoreStats())
                if frame is None:
                    break
                assert len(frame[1]) == 1
                rows.append((frame[1][0][1], frame[1][0][2]))
        assert [key for key, _ in rows] == sorted(set(key for key, _ in rows))
        result.extend(rows)
    return result


# #region verify-wal
def verify_wal(path):
    run_child("wal", path, expected=73)
    wal = path / "wal.log"
    valid_size = wal.stat().st_size
    with wal.open("ab") as output:
        output.write(b"\x2a\x00\x00")  # Real torn header at the end of the WAL.
    with LSMStore(path, sync="fsync") as store:
        assert store.stats.wal_records_replayed == 1
        assert store.get("fresh") == {"rows": [1, 2]}
        assert store.get("null", "missing") is None
        assert store.get("gone", "missing") == "missing"
        assert wal.stat().st_size == valid_size
        store.put("after-recovery", 3)
        store.flush()
    with LSMStore(path) as store:
        assert store.stats.wal_records_replayed == 0
        assert store.get("after-recovery") == 3
        assert store.get("gone", "missing") == "missing"

    # A complete bad frame must fail loudly, including at EOF.
    bad = path.parent / "bad-crc"
    with LSMStore(bad) as store:
        store.put("key", "value")
    original = (bad / "wal.log").read_bytes()
    damaged = bytearray(original)
    damaged[-1] ^= 1
    (bad / "wal.log").write_bytes(damaged)
    try:
        LSMStore(bad)
    except CorruptRecord:
        pass
    else:
        raise AssertionError("complete CRC corruption was silently discarded")
    assert (bad / "wal.log").read_bytes() == damaged
# #endregion verify-wal


def seed_runs(path):
    with LSMStore(path, sync="fsync", memtable_limit=1000, block_records=2) as store:
        store.write_batch([("put", "key", "old"), ("put", "gone", "old"),
                           ("put", "stable", 1)])
        store.flush()
        store.write_batch([("put", "key", "middle"), ("put", "extra", 4)])
        store.flush()
        store.write_batch([("put", "key", "new"), ("delete", "gone"),
                           ("delete", "extra"), ("put", "null", None)])
        store.flush()
        assert store.stats.run_count == 3


# #region verify-commit-boundaries
def verify_crash_boundaries(base):
    results = {}
    for point in ("flush.before_manifest", "flush.after_manifest",
                  "compact.before_manifest", "compact.after_manifest"):
        path = base / point
        if point.startswith("flush."):
            with LSMStore(path, sync="fsync", memtable_limit=1000) as store:
                store.write_batch([("put", "key", "old"), ("put", "gone", "old"),
                                   ("put", "stable", 1)])
                store.flush()
        else:
            seed_runs(path)
        run_child(point, path, expected=86)
        run_child("reopen", path)  # A second independent process validates recovery.
        with LSMStore(path, sync="fsync", memtable_limit=1000) as store:
            results[point] = {"runs": store.stats.run_count,
                              "replayed_batches": store.stats.wal_records_replayed}
            if point == "flush.before_manifest":
                assert store.stats.wal_records_replayed == 1
            if point == "flush.after_manifest":
                assert store.stats.wal_records_replayed == 0
            if point == "compact.before_manifest":
                assert store.stats.run_count == 3
            if point == "compact.after_manifest":
                assert store.stats.run_count == 1
            store.compact()
            assert store.stats.run_count == 1
        rows = read_sstables(path)
        assert len(rows) == 3 and all(not value["deleted"] for _, value in rows)
        assert not list(path.glob("*.tmp"))
        run_child("reopen", path)
    return results
# #endregion verify-commit-boundaries


def verify_operations(path):
    expected = {}
    randomizer = random.Random(336)
    with LSMStore(path, sync="fsync", memtable_limit=7, block_records=4) as store:
        store.reset_stats()
        original = {"nested": [1]}
        store.write_batch([("put", "copy", original), ("put", "null", None)])
        assert store.stats.syncs == 1  # One durable boundary for the complete batch.
        original["nested"].append(2)
        assert store.get("copy") == {"nested": [1]}
        returned = store.get("copy")
        returned["nested"].append(3)
        assert store.get("copy") == {"nested": [1]}
        expected.update(copy={"nested": [1]}, null=None)
        size = (path / "wal.log").stat().st_size
        try:
            store.write_batch([("put", "should-not-appear", 1), ("put", 42, 2)])
        except TypeError:
            pass
        else:
            raise AssertionError("invalid batch accepted")
        assert (path / "wal.log").stat().st_size == size
        assert store.get("should-not-appear") is None
        store.write_batch([("put", "same", 1), ("delete", "same"), ("put", "same", 2)])
        expected["same"] = 2
        for index in range(180):
            key = "k{:03d}".format(randomizer.randrange(50))
            if randomizer.randrange(4) == 0:
                store.delete(key)
                expected.pop(key, None)
            else:
                value = {"version": index, "payload": "x" * 25}
                store.put(key, value)
                expected[key] = value
        store.flush()
        assert store.stats.memtable_entries == 0
        assert store.stats.run_count > 1
        assert store.stats.index_entries < store.stats.disk_records
        for key, value in expected.items():
            assert store.get(key, "missing") == value
        assert list(store.items()) == sorted(expected.items())
        assert list(store.scan("k010", "k025")) == [(key, value) for key, value in sorted(expected.items())
                                                   if "k010" <= key < "k025"]
        assert list(store.scan("z", "a")) == []
        assert list(store.scan("same", "same")) == []
        store.compact()
        assert store.stats.run_count == 1
        assert store.stats.disk_records == len(expected)
    with LSMStore(path) as store:
        assert list(store.items()) == sorted(expected.items())
        assert store.stats.memtable_entries == 0
    disk = read_sstables(path)
    assert len(disk) == len(expected)
    for index in path.glob("*.index"):
        metadata = json.loads(index.read_text())["payload"]
        assert all(len(entry) == 2 and isinstance(entry[0], str) and isinstance(entry[1], int)
                   for entry in metadata["index"])


# #region verify-read-amplification
def verify_sparse_and_bloom(path):
    with LSMStore(path, memtable_limit=1000, block_records=8) as store:
        store.write_batch([("put", "k{:04d}".format(number), {"v": number})
                           for number in range(0, 512, 2)])
        store.flush()
        assert store.stats.disk_records == 256
        assert store.stats.index_entries == 32  # Exactly one key/offset per eight rows.
    measurements = {}
    for enabled in (False, True):
        with LSMStore(path, bloom=enabled) as store:
            store.reset_stats()
            for number in range(1, 511, 2):
                assert store.get("k{:04d}".format(number), "missing") == "missing"
            measurements["bloom" if enabled else "without_bloom"] = asdict(store.stats)
            if enabled:
                assert store.stats.bloom_negatives > 200
                assert store.stats.blocks_read < 30
            else:
                assert store.stats.blocks_read == 255
            store.reset_stats()
            for number in range(0, 512, 2):
                assert store.get("k{:04d}".format(number)) == {"v": number}
            assert store.stats.blocks_read == 256
            assert store.stats.records_read <= 256 * 8
            store.reset_stats()
            assert list(store.scan("k0100", "k0116")) == [
                ("k{:04d}".format(number), {"v": number}) for number in range(100, 116, 2)]
            assert store.stats.records_read <= 8 + 8 + 1
    assert measurements["bloom"]["bytes_read"] < measurements["without_bloom"]["bytes_read"] / 10
    return measurements
# #endregion verify-read-amplification


def verify_all_deleted(path):
    with LSMStore(path, sync="fsync", memtable_limit=1000) as store:
        store.put("removed", {"old": True})
        store.flush()
        store.delete("removed")
        store.flush()
        assert store.stats.disk_records == 2
        store.compact()
        assert store.stats.run_count == 0 and store.stats.disk_records == 0
    with LSMStore(path, sync="fsync") as store:
        assert list(store.items()) == []
        assert store.get("removed", "missing") == "missing"
        store.put("new", 7)
    with LSMStore(path) as store:
        assert list(store.items()) == [("new", 7)]
        assert store.get("removed", "missing") == "missing"


def verify_damaged_files(base):
    missing = base / "missing-manifest"
    with LSMStore(missing) as store:
        store.put("persisted", 1)
        store.flush()
    (missing / "manifest.json").unlink()
    before = {file.name: file.read_bytes() for file in missing.iterdir()}
    try:
        LSMStore(missing)
    except CorruptRecord:
        pass
    else:
        raise AssertionError("missing manifest was silently replaced with an empty database")
    assert {file.name: file.read_bytes() for file in missing.iterdir()} == before

    missing_wal = base / "missing-wal"
    with LSMStore(missing_wal, sync="fsync", memtable_limit=1000) as store:
        store.put("acknowledged", 42)
    (missing_wal / "wal.log").unlink()
    before = {file.name: file.read_bytes() for file in missing_wal.iterdir()}
    try:
        LSMStore(missing_wal)
    except CorruptRecord:
        pass
    else:
        raise AssertionError("missing WAL silently lost an acknowledged write")
    assert {file.name: file.read_bytes() for file in missing_wal.iterdir()} == before

    truncated = base / "truncated-sst"
    with LSMStore(truncated) as store:
        store.write_batch([("put", "a", 1), ("put", "b", 2)])
        store.flush()
        file = next(truncated.glob("*.sst"))
        with file.open("rb") as source:
            read_frame(source, StoreStats())
            first_frame_end = source.tell()
        # Truncation at a frame boundary is still damage, not an absent key.
        with file.open("r+b") as output:
            output.truncate(first_frame_end)
        try:
            store.get("b")
        except CorruptRecord:
            pass
        else:
            raise AssertionError("truncated SSTable returned a false absence")
    try:
        LSMStore(truncated)
    except CorruptRecord:
        pass
    else:
        raise AssertionError("truncated SSTable accepted on reopen")

    durable = base / "durable-compaction"
    with LSMStore(durable, sync="none", memtable_limit=1000) as store:
        store.put("a", 1)
        store.flush()
        store.put("a", 2)  # Include a pending, previously unsynced WAL entry.
        store.reset_stats()
        store.compact()
        assert store.stats.syncs > 0 and store.sync == "none"
        assert store.get("a") == 2
        store.reset_stats()
        store.put("b", 3)
        assert store.stats.syncs == 0  # The caller's ordinary-write mode is restored.
    with LSMStore(durable) as store:
        assert list(store.items()) == [("a", 2), ("b", 3)]


def main():
    with tempfile.TemporaryDirectory(prefix="presmium-lsm-") as directory:
        base = Path(directory)
        verify_operations(base / "operations")
        verify_wal(base / "wal")
        boundaries = verify_crash_boundaries(base / "boundaries")
        reads = verify_sparse_and_bloom(base / "reads")
        verify_all_deleted(base / "all-deleted")
        verify_damaged_files(base / "damage")
        print(json.dumps({"ok": True, "checks": ["batch atomicity", "sorted disk SSTables",
                         "sparse offsets", "Bloom misses and hits", "range merge",
                         "WAL recovery", "torn-tail repair", "CRC rejection",
                         "four crash commit boundaries", "tombstone safety",
                         "missing manifest/WAL refusal", "SSTable truncation refusal",
                         "durable compaction"],
                          "commit_boundaries": boundaries,
                          "miss_reads": {name: {key: values[key] for key in
                            ("bytes_read", "records_read", "blocks_read", "bloom_negatives")}
                            for name, values in reads.items()}}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    if len(sys.argv) == 4 and sys.argv[1] == "--child":
        child(sys.argv[2], Path(sys.argv[3]))
    else:
        main()
