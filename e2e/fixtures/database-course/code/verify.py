"""Run real-file, separate-process correctness and crash-recovery checks.

Usage: python code/verify.py [--directory /path/to/disposable/test-directory]
All data is isolated below a newly created temporary directory. This is not a
power-cut test: os._exit kills a process, while the operating system stays alive.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from engine import (HEADER, STORES, AppendLogStore, CorruptRecord,
                    IndexedLogStore, encode_frame)


def worker(args):
    path = Path(args.path)
    store_type = STORES[args.store]
    if args.worker == "write-exit":
        # Deliberately skip close/finalizers: acknowledged writes are already on disk.
        store = store_type(path, sync="fsync")
        store.put("Ada", {"score": 10})
        store.put("中文", [1, True, None])
        store.write_batch([("put", "left", 1), ("put", "right", 2)])
        os._exit(77)
    if args.worker == "read":
        with store_type(path) as store:
            print(json.dumps(dict(store.items()), ensure_ascii=False, sort_keys=True))
        return
    if args.worker == "seed":
        with store_type(path, sync="fsync") as store:
            store.write_batch([("put", "left", 0), ("put", "right", 0)])
        return
    if args.worker == "torn-batch":
        # Failure injection: a process dies after only part of its physical append.
        frame = encode_frame([["put", "left", 1], ["put", "right", 1]])
        with open(path, "ab", buffering=0) as file:
            file.write(frame[:args.cut])
            os.fsync(file.fileno())
            os._exit(78)
    if args.worker == "complete-batch-exit":
        store = store_type(path, sync="fsync")
        store.write_batch([("put", "left", 1), ("put", "right", 1)])
        os._exit(79)
    if args.worker == "compact":
        with store_type(path, sync="fsync") as store:
            for version in range(15):
                store.put("survivor", {"version": version, "padding": "x" * 80})
                store.put("deleted", version)
            store.delete("deleted")
            before = path.stat().st_size
            store.reset_stats()
            store.compact()
            after = path.stat().st_size
            assert store.stats.syncs >= 2, "compaction syncs the file and directory"
            assert store.get("deleted") is None
            assert store.get("survivor")["version"] == 14
            if args.store != "snapshot":
                assert after < before, (before, after)
            print(json.dumps({"before": before, "after": after}))
        return
    if args.worker == "corrupt-open":
        try:
            store_type(path).close()
        except CorruptRecord:
            print("corruption reported")
            return
        raise AssertionError("a complete corrupt frame was silently accepted")
    raise ValueError(args.worker)


def process(action, store, path, *, exit_code=0, cut=0):
    result = subprocess.run([sys.executable, str(Path(__file__).resolve()),
                             "--worker", action, "--store", store,
                             "--path", str(path), "--cut", str(cut)],
                            text=True, capture_output=True, check=False)
    assert result.returncode == exit_code, (
        action, store, result.returncode, result.stdout, result.stderr)
    return result.stdout.strip()


def verify(directory):
    cases = []
    expected = {"Ada": {"score": 10}, "中文": [1, True, None], "left": 1, "right": 2}

    # #region restart-proof
    for name in STORES:
        path = directory / (name + "-restart.db")
        process("write-exit", name, path, exit_code=77)
        actual = json.loads(process("read", name, path))
        assert actual == expected, (name, actual)
        cases.append(name + ": independent writer exits; independent reader recovers")
    # #endregion restart-proof

    # #region atomic-batch-proof
    frame = encode_frame([["put", "left", 1], ["put", "right", 1]])
    for name in ("append", "indexed"):
        # Incomplete header, complete header, partial payload, final missing byte.
        for cut in (1, HEADER.size - 1, HEADER.size + 5, len(frame) - 1):
            path = directory / (name + "-torn-{}.db".format(cut))
            process("seed", name, path)
            before = path.stat().st_size
            process("torn-batch", name, path, cut=cut, exit_code=78)
            assert json.loads(process("read", name, path)) == {"left": 0, "right": 0}
            assert path.stat().st_size == before, "only incomplete tail is truncated"
        path = directory / (name + "-complete-batch.db")
        process("seed", name, path)
        process("complete-batch-exit", name, path, exit_code=79)
        assert json.loads(process("read", name, path)) == {"left": 1, "right": 1}
        cases.append(name + ": 4 torn batch cuts expose neither key; complete batch exposes both")
    # #endregion atomic-batch-proof

    # #region compaction-proof
    for name in STORES:
        path = directory / (name + "-compact.db")
        sizes = json.loads(process("compact", name, path))
        actual = json.loads(process("read", name, path))
        assert "deleted" not in actual
        assert actual["survivor"]["version"] == 14
        cases.append("{}: delete survives compaction/reopen ({} -> {} bytes)".format(
            name, sizes["before"], sizes["after"]))
    # #endregion compaction-proof

    # #region corruption-proof
    for name in ("append", "indexed"):
        for location in ("middle", "last"):
            path = directory / (name + "-corrupt-" + location + ".db")
            with STORES[name](path) as store:
                for key in ("first", "middle", "last"):
                    store.put(key, "intact")
            data = bytearray(path.read_bytes())
            first_size = HEADER.size + HEADER.unpack_from(data)[0]
            offset = first_size
            if location == "last":
                offset += HEADER.size + HEADER.unpack_from(data, offset)[0]
            data[offset + HEADER.size + 4] ^= 1
            path.write_bytes(data)
            process("corrupt-open", name, path)
            assert path.read_bytes() == data, "corruption must never be silently truncated"
        cases.append(name + ": complete middle/final CRC corruption is reported, file preserved")
    # #endregion corruption-proof

    for name, store_type in STORES.items():
        path = directory / (name + "-semantics.db")
        with store_type(path) as store:
            store.write_batch([("put", "c", None), ("put", "a", 1),
                               ("put", "b", 2), ("put", "a", 3),
                               ("delete", "b")])
            assert list(store.scan("a", "d")) == [("a", 3), ("c", None)]
            assert store.get("c", "missing") is None
            assert store.get("b", "missing") == "missing"
            before = path.read_bytes()
            try:
                store.write_batch([("put", "must-not-appear", 1), ("put", "bad", float("nan"))])
            except ValueError:
                pass
            else:
                raise AssertionError("non-JSON values accepted")
            assert path.read_bytes() == before, "validate before writing any batch bytes"
            store.reset_stats()
            store.put("d", 4)
            assert store.stats.syncs == 0, "none means no durability sync on write"
        with store_type(path, sync="fsync") as store:
            store.reset_stats()
            store.put("d", 5)
            assert store.stats.syncs >= 1
        cases.append(name + ": range, JSON null, duplicate key, validation and sync contract")

    with IndexedLogStore(directory / "index-offsets.db") as store:
        store.put("blob", "a" * 8192)
        assert store._index == {"blob": (0, 0)}, "index stores offsets, not values"
        store.reset_stats()
        assert len(store.get("blob")) == 8192
        assert store.stats.bytes_read > 8192, "indexed read really reads the file"
    cases.append("indexed: resident map contains offsets only; get reads actual file bytes")
    return {"passed": len(cases), "cases": cases,
            "scope": "single writer, process crashes; no physical power-cut simulation"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path)
    parser.add_argument("--worker", choices=["write-exit", "read", "seed", "torn-batch",
                                            "complete-batch-exit", "compact", "corrupt-open"])
    parser.add_argument("--store", choices=list(STORES))
    parser.add_argument("--path")
    parser.add_argument("--cut", type=int, default=0)
    args = parser.parse_args()
    if args.worker:
        worker(args)
        return
    if args.directory:
        args.directory.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="correctness-", dir=args.directory) as directory:
            result = verify(Path(directory))
    else:
        with tempfile.TemporaryDirectory(prefix="database-course-") as directory:
            result = verify(Path(directory))
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
