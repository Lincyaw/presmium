#!/usr/bin/env python3
"""Native course demonstrations. Data stays under --data; no browser filesystem."""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

from engine import AppendLogStore, IndexedLogStore, JsonSnapshotStore
from lsm import LSMStore


def write(root):
    path = root / "snapshot.json"
    with JsonSnapshotStore(path, sync="fsync") as database:
        database.write_batch([("put", "Ada", {"balance": 100}),
                              ("put", "nullable", None)])
    return {"action": "writer-exits", "file": path.name,
            "bytes": path.stat().st_size, "stored": {"Ada": {"balance": 100}}}


def read(root):
    path = root / "snapshot.json"
    if not path.is_file():
        raise FileNotFoundError("run the write demonstration with the same --data first")
    with JsonSnapshotStore(path, sync="fsync") as database:
        value = database.get("Ada")
        assert value == {"balance": 100}
        assert database.get("nullable", "absent") is None
        assert database.get("unknown", "absent") == "absent"
    return {"action": "new-process-reads", "Ada": value,
            "nullable_is_value": True, "unknown": "absent"}


def index(root):
    path = root / "positions.log"
    with IndexedLogStore(path, sync="none") as database:
        for number in range(80):
            database.put("key-{:06d}".format(number), {"value": number})
    output = {}
    for kind in (AppendLogStore, IndexedLogStore):
        with kind(path, sync="none") as database:
            database.reset_stats()
            assert database.get("key-000040") == {"value": 40}
            output[kind.__name__] = {"records_read": database.stats.records_read,
                                     "bytes_read": database.stats.bytes_read}
    return {"action": "same-file-same-query", "counters": output}


def compact(root):
    path = root / "history.log"
    with IndexedLogStore(path, sync="none") as database:
        for version in range(5):
            for number in range(80):
                database.put("key-{:06d}".format(number), {"version": version})
        for number in range(0, 80, 5):
            database.delete("key-{:06d}".format(number))
        before = path.stat().st_size
        expected = list(database.items())
    started = time.perf_counter_ns()
    with IndexedLogStore(path, sync="none") as database:
        reopen_before_ns = time.perf_counter_ns() - started
        reopen_before_records = database.stats.records_read
        database.reset_stats()
        started = time.perf_counter_ns()
        database.compact()
        compact_ns = time.perf_counter_ns() - started
        syncs = database.stats.syncs
        after = path.stat().st_size
    started = time.perf_counter_ns()
    with IndexedLogStore(path, sync="none") as reopened:
        reopen_after_ns = time.perf_counter_ns() - started
        reopen_after_records = reopened.stats.records_read
        assert list(reopened.items()) == expected
        assert reopened.get("key-000000", "deleted") == "deleted"
    return {"action": "compact-and-reopen", "bytes_before": before,
            "bytes_after": after, "live_keys": len(expected),
            "compact_ms": round(compact_ns / 1e6, 4),
            "reopen_before_ms": round(reopen_before_ns / 1e6, 4),
            "reopen_after_ms": round(reopen_after_ns / 1e6, 4),
            "reopen_records_before": reopen_before_records,
            "reopen_records_after": reopen_after_records,
            "timing_scope": "one classroom observation with warm OS cache, not a repeated benchmark",
            "publication_syncs": syncs, "deleted_key_stays_deleted": True}


def recover(root):
    path = root / "torn-tail.log"
    with IndexedLogStore(path, sync="fsync") as database:
        database.write_batch([("put", "Ada", 90), ("put", "Lin", 110)])
    valid_bytes = path.stat().st_size
    with path.open("ab", buffering=0) as output:
        output.write(b"\x20\x00\x00")  # A demonstrably incomplete frame header.
        os.fsync(output.fileno())
    with IndexedLogStore(path, sync="fsync") as database:
        assert database.get("Ada") + database.get("Lin") == 200
    assert path.stat().st_size == valid_bytes
    return {"action": "repair-only-incomplete-tail", "discarded_bytes": 3,
            "whole_prior_batch_preserved": True}


def lsm(root):
    directory = root / "lsm"
    with LSMStore(directory, sync="fsync", memtable_limit=4, block_records=2) as database:
        for number in range(12):
            database.put("key-{:06d}".format(number), {"version": 0})
        database.write_batch([("put", "key-000003", {"version": 1}),
                              ("delete", "key-000004")])
        database.flush()
    with LSMStore(directory, sync="fsync", memtable_limit=4, block_records=2) as reopened:
        expected = list(reopened.scan("key-000002", "key-000006"))
        assert expected == [("key-000002", {"version": 0}),
                            ("key-000003", {"version": 1}),
                            ("key-000005", {"version": 0})]
        tables_before = len(list(directory.glob("*.sst")))
        reopened.compact()
    with LSMStore(directory, sync="fsync") as reopened:
        assert list(reopened.scan("key-000002", "key-000006")) == expected
    return {"action": "flush-range-compact-reopen", "range": expected,
            "sstables_before": tables_before,
            "sstables_after": len(list(directory.glob("*.sst"))),
            "manifest_exists": (directory / "manifest.json").is_file()}


ACTIONS = {"write": write, "read": read, "index": index, "compact": compact,
           "recover": recover, "lsm": lsm}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=[*ACTIONS, "all"])
    parser.add_argument("--data", type=Path, required=True,
                        help="A persistent classroom directory. Existing data is not deleted.")
    parser.add_argument("--output", type=Path, help="Save JSON evidence (all only).")
    options = parser.parse_args()
    options.data.mkdir(parents=True, exist_ok=True)
    if options.action == "all":
        evidence = []
        for name in ACTIONS:
            # Independent interpreter invocations: write/read cannot share Python state.
            result = subprocess.run([sys.executable, str(Path(__file__).resolve()), name,
                                     "--data", str(options.data.resolve())],
                                    check=True, text=True, capture_output=True)
            evidence.append(json.loads(result.stdout))
        answer = {"runtime": "native Python, real filesystem, independent processes",
                  "evidence": evidence}
        if options.output:
            options.output.parent.mkdir(parents=True, exist_ok=True)
            options.output.write_text(json.dumps(answer, ensure_ascii=False, indent=2) + "\n")
    else:
        answer = ACTIONS[options.action](options.data)
    print(json.dumps(answer, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
