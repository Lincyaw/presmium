#!/usr/bin/env python3
"""Reproducible, real-filesystem KV experiments; Python 3.9+, standard library only.

Run --smoke before the default 1 warmup + 5 measured rounds. Nothing here drops
the OS page cache or claims to measure a cold device. See results/report.md for
the actual machine, source hashes, transaction boundaries and limitations.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import platform
import random
import sqlite3
import subprocess
import sys
import tempfile
import time
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path

from engine import AppendLogStore, IndexedLogStore, JsonSnapshotStore

HERE = Path(__file__).resolve().parent
SEED = 3362026


class SQLiteStore:
    """A stdlib reference using the same JSON values and transaction boundaries.

    OFF and FULL are separate experiments, not equivalent durability promises to
    our own implementation. SQLite's physical IO/fsync counts are not exposed by
    Python's sqlite3 API and are reported as unavailable, never as zero.
    """
    def __init__(self, path, sync="none"):
        self.connection = sqlite3.connect(str(path))
        self.connection.execute("PRAGMA journal_mode=WAL")
        self.connection.execute("PRAGMA synchronous=" + ("FULL" if sync == "fsync" else "OFF"))
        self.connection.execute("CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
        self.connection.commit()
        self.reset_stats()

    def reset_stats(self):
        self.stats = None

    def write_batch(self, operations):
        with self.connection:
            for operation in operations:
                if operation[0] == "put":
                    self.connection.execute("INSERT INTO kv VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                                            (operation[1], json.dumps(operation[2], separators=(",", ":"))))
                else:
                    self.connection.execute("DELETE FROM kv WHERE key=?", (operation[1],))

    def put(self, key, value):
        self.write_batch([("put", key, value)])

    def delete(self, key):
        self.write_batch([("delete", key)])

    def get(self, key, default=None):
        row = self.connection.execute("SELECT value FROM kv WHERE key=?", (key,)).fetchone()
        return default if row is None else json.loads(row[0])

    def scan(self, start=None, end=None):
        clauses, values = [], []
        if start is not None:
            clauses.append("key>=?")
            values.append(start)
        if end is not None:
            clauses.append("key<?")
            values.append(end)
        where = " WHERE " + " AND ".join(clauses) if clauses else ""
        for key, value in self.connection.execute("SELECT key,value FROM kv" + where + " ORDER BY key", values):
            yield key, json.loads(value)

    def items(self):
        return self.scan()

    def close(self):
        self.connection.close()


def key(index):
    return "k{:08d}".format(index * 2)


def dataset(size, seed):
    rng = random.Random(seed)
    alphabet = "abcdefghijklmnopqrstuvwxyz0123456789"
    return {key(i): {"id": i, "version": 0, "payload": "".join(rng.choices(alphabet, k=96))} for i in range(size)}


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()


def source_hashes():
    return {name: hashlib.sha256((HERE / name).read_bytes()).hexdigest()
            for name in ("engine.py", "lsm.py", "benchmark.py", "benchmark_report.py") if (HERE / name).exists()}


def stats(store):
    return asdict(store.stats) if store.stats is not None else {
        "bytes_written": None, "bytes_read": None, "records_read": None, "syncs": None}


def file_bytes(root):
    return sum(path.stat().st_size for path in root.rglob("*") if path.is_file())


def factory(name, root, sync="none"):
    if name.startswith("lsm"):
        from lsm import LSMStore
        return LSMStore(root / "store", sync=sync, memtable_limit=128,
                        block_records=16, bloom=name != "lsm-no-bloom")
    classes = {"snapshot": JsonSnapshotStore, "append": AppendLogStore,
               "indexed": IndexedLogStore, "sqlite": SQLiteStore}
    return classes[name](root / "store.db", sync=sync)


def seed_store(store, rows, individual=False, seed=SEED):
    entries = list(rows.items())
    random.Random(seed).shuffle(entries)
    if individual:
        for k, value in entries:
            store.put(k, value)
    else:
        store.write_batch([("put", k, value) for k, value in entries])
    # LSM reads must consult immutable disk tables, not just the memtable.
    if hasattr(store, "flush"):
        store.flush()


def check_equal(actual, expected, label):
    if actual != expected:
        raise AssertionError("correctness failed: " + label)
    return digest(actual)


def verify(seed):
    """Integration gate on real files: mutation, batch, ordering, reopen, compact.

    The dedicated engine/LSM verification programs also exercise torn writes and
    corruption. This gate checks every implementation and durability mode before
    any benchmark samples are recorded.
    """
    checks = []
    for name in ("snapshot", "append", "indexed", "sqlite", "lsm", "lsm-no-bloom"):
        for sync in ("none", "fsync"):
            with tempfile.TemporaryDirectory(prefix="database-verify-") as folder:
                root = Path(folder)
                store = factory(name, root, sync)
                rows = dataset(24, seed)
                seed_store(store, rows, individual=True)
                replacement = {"id": 4, "version": 1, "payload": "updated"}
                store.write_batch([("put", key(4), replacement), ("delete", key(7)), ("put", "z", [1, None, False])])
                rows[key(4)] = replacement
                rows.pop(key(7))
                rows["z"] = [1, None, False]
                for k, value in rows.items():
                    check_equal(store.get(k), value, name + " get")
                check_equal(store.get(key(7), "absent"), "absent", name + " delete")
                check_equal(list(store.scan(key(2), key(9))), [(k, rows[k]) for k in sorted(rows) if key(2) <= k < key(9)], name + " range")
                store.close()
                store = factory(name, root, sync)
                expected = sorted(rows.items())
                checksum = check_equal(list(store.items()), expected, name + " reopen")
                if hasattr(store, "compact"):
                    store.compact()
                    check_equal(list(store.items()), expected, name + " compact")
                store.close()
                store = factory(name, root, sync)
                check_equal(list(store.items()), expected, name + " reopen after compact")
                store.close()
                checks.append({"implementation": name, "sync": sync, "checksum": checksum})
    return checks


def timed_calls(calls):
    samples, answers = [], []
    begin = time.perf_counter_ns()
    for function, arguments in calls:
        before = time.perf_counter_ns()
        answers.append(function(*arguments))
        samples.append(time.perf_counter_ns() - before)
    return time.perf_counter_ns() - begin, samples, answers


def row(case, name, sync, repeat, warmup, size, operations, elapsed, samples, checksum, root, counters, **extra):
    return {"case": case, "implementation": name, "sync": sync, "repeat": repeat, "warmup": warmup,
            "keys": size, "logical_operations": operations,
            "logical_reads": operations if case.startswith("read_") or case == "range_8" else 0,
            "logical_writes": operations if case in ("write_updates", "durable_updates") else 0,
            "transactions": len(samples),
            "elapsed_ns": elapsed, "latency_ns": samples, "checksum": checksum,
            "file_bytes": file_bytes(root), "stats": counters, **extra}


def measure_queries(name, size, count, case, repeat, warmup, seed):
    with tempfile.TemporaryDirectory(prefix="database-read-") as folder:
        root, rows = Path(folder), dataset(size, seed)
        store = factory(name, root)
        seed_store(store, rows, individual=True, seed=seed)
        rng = random.Random(seed + size)
        indices = [rng.randrange(size - 1) for _ in range(count)]
        if case == "read_hit":
            queries = [key(i) for i in indices]
            expected = [rows[k] for k in queries]
        elif case == "read_miss":
            # Odd keys lie *inside* the existing key range: min/max checks alone
            # cannot masquerade as a Bloom improvement.
            queries = ["k{:08d}".format(i * 2 + 1) for i in indices]
            expected = [None] * count
        else:
            raise ValueError(case)
        for k in queries[:min(8, count)]:
            store.get(k)  # explicit warm OS/page/interpreter path, not cold disk
        store.reset_stats()
        elapsed, samples, actual = timed_calls([(store.get, (k,)) for k in queries])
        counters = stats(store)
        checksum = check_equal(actual, expected, name + " " + case)
        result = row(case, name, "none", repeat, warmup, size, count, elapsed, samples, checksum, root, counters,
                     sample_unit="one_get", trace_sha256=digest(queries), setup="individual_puts_random_order")
        store.close()
        return result


def update_trace(rows, count, seed):
    rng, keys = random.Random(seed + 19), list(rows)
    trace = []
    for version in range(1, count + 1):
        k = rng.choice(keys)
        trace.append(("put", k, {**rows[k], "version": version}))
    return trace


def measure_writes(name, size, count, sync, batch, repeat, warmup, seed):
    with tempfile.TemporaryDirectory(prefix="database-write-") as folder:
        root, rows = Path(folder), dataset(size, seed)
        store = factory(name, root, sync)
        seed_store(store, rows, seed=seed)
        operations = update_trace(rows, count, seed)
        groups = [operations[i:i + batch] for i in range(0, len(operations), batch)]
        store.reset_stats()
        elapsed, samples, _ = timed_calls([(store.write_batch, (group,)) for group in groups])
        counters = stats(store)
        for _, k, value in operations:
            rows[k] = value
        checksum = check_equal(list(store.items()), sorted(rows.items()), name + " writes")
        result = row("write_updates" if sync == "none" else "durable_updates", name, sync, repeat, warmup,
                     size, count, elapsed, samples, checksum, root, counters, batch_size=batch,
                     sample_unit="one_transaction", trace_sha256=digest(operations), setup="one_initial_batch")
        store.close()
        reopened = factory(name, root, sync)
        check_equal(list(reopened.items()), sorted(rows.items()), name + " saved writes")
        reopened.close()
        return result


def measure_range(name, size, count, repeat, warmup, seed):
    with tempfile.TemporaryDirectory(prefix="database-range-") as folder:
        root, rows = Path(folder), dataset(size, seed)
        store = factory(name, root)
        seed_store(store, rows, individual=True, seed=seed)
        rng = random.Random(seed + 40)
        bounds = [(key(i), key(i + 8)) for i in (rng.randrange(size - 8) for _ in range(count))]
        expected = [[(k, rows[k]) for k in sorted(rows) if start <= k < end] for start, end in bounds]
        def scan(start, end):
            return list(store.scan(start, end))
        store.reset_stats()
        elapsed, samples, actual = timed_calls([(scan, bound) for bound in bounds])
        counters = stats(store)
        checksum = check_equal(actual, expected, name + " range benchmark")
        result = row("range_8", name, "none", repeat, warmup, size, count, elapsed, samples, checksum, root, counters,
                     sample_unit="one_8_key_range", trace_sha256=digest(bounds), setup="individual_puts_random_order")
        store.close()
        return result


def measure_compaction(name, size, repeat, warmup, seed):
    with tempfile.TemporaryDirectory(prefix="database-compact-") as folder:
        root, rows = Path(folder), dataset(size, seed)
        store = factory(name, root, "fsync")
        seed_store(store, rows, individual=True, seed=seed)
        # Three complete generations + tombstones create measurable obsolete data.
        for version in range(1, 4):
            for k in list(rows):
                rows[k] = {**rows[k], "version": version}
                store.put(k, rows[k])
        for k in list(rows)[::5]:
            store.delete(k)
            del rows[k]
        if hasattr(store, "flush"):
            store.flush()
        store.close()
        results = []
        expected = sorted(rows.items())
        for phase in ("before", "after"):
            before = time.perf_counter_ns()
            store = factory(name, root, "fsync")
            elapsed = time.perf_counter_ns() - before
            counters = stats(store)
            checksum = check_equal(list(store.items()), expected, name + " compact " + phase)
            results.append(row("recovery_" + phase, name, "fsync", repeat, warmup, size, 1, elapsed, [elapsed],
                               checksum, root, counters, sample_unit="one_reopen", live_keys=len(rows),
                               note="normal close/reopen with warm OS cache; not a crash/power-loss test"))
            if phase == "before":
                store.reset_stats()
                start = time.perf_counter_ns()
                store.compact()
                elapsed = time.perf_counter_ns() - start
                counters = stats(store)
                check_equal(list(store.items()), expected, name + " compact output")
                results.append(row("compaction", name, "fsync", repeat, warmup, size, 1, elapsed, [elapsed],
                                   checksum, root, counters, sample_unit="one_compaction", live_keys=len(rows),
                                   note="both implementations opened with sync=fsync; durable compaction publication"))
            store.close()
        return results


def calibrate(args):
    read_counts = {}
    # The slow unindexed implementation sets the shared trace length at each N.
    budget = args.target_seconds * 0.65 / ((args.repeats + args.warmups) * 2 * len(args.read_sizes))
    for size in args.read_sizes:
        result = measure_queries("append", size, 8, "read_miss", -1, True, args.seed)
        ns = result["elapsed_ns"] / 8
        read_counts[size] = max(32, min(1600, round(budget * 1e9 / ns)))
    return {"read_counts": read_counts, "write_count": 320, "durable_count": 192, "range_count": 48}


def machine_metadata(args, plan):
    def system_value(name):
        try:
            return subprocess.check_output(["sysctl", "-n", name], text=True, stderr=subprocess.DEVNULL).strip()
        except (OSError, subprocess.CalledProcessError):
            return None
    return {"timestamp_utc": datetime.now(timezone.utc).isoformat(), "seed": args.seed,
            "python": sys.version, "python_implementation": platform.python_implementation(),
            "os": platform.platform(), "machine": platform.machine(), "cpu_count": os.cpu_count(),
            "hardware_model": system_value("hw.model"), "memory_bytes": system_value("hw.memsize"),
            "cpu": system_value("machdep.cpu.brand_string") or platform.processor(),
            "sqlite_version": sqlite3.sqlite_version, "source_sha256": source_hashes(),
            "keys": args.keys, "read_sizes": args.read_sizes, "payload_characters": 96,
            "repeats": args.repeats, "warmups": args.warmups, "smoke": args.smoke, "plan": plan,
            "cache": "OS page cache is not evicted; each round uses a fresh temporary directory; setup precedes measurement",
            "durability": {"none": "unbuffered engine writes without fsync; SQLite WAL synchronous=OFF",
                           "fsync": "engine os.fsync per transaction; SQLite WAL synchronous=FULL; no power-loss experiment",
                           "compaction": "both stores opened with sync=fsync for durable publication"},
            "io_counters": "engine transfer bytes/decoded records, not device IO; SQLite low-level counters unavailable",
            "statistics": "latency p50/p95: pooled individual transaction samples, nearest-rank p95; round elapsed/throughput: median and p95 of independent measured rounds",
            "temp_parent": tempfile.gettempdir(), "filesystem_statvfs": {
                field: getattr(os.statvfs(tempfile.gettempdir()), field, None)
                for field in ("f_fsid", "f_bsize", "f_frsize", "f_blocks", "f_flag")},
            "target_seconds": args.target_seconds,
            "execution": "single process, randomized case/implementation order within each round; one full warmup round excluded"}


def write_output(output, metadata, checks, records):
    from benchmark_report import write_report
    output.mkdir(parents=True, exist_ok=True)
    document = {"metadata": metadata, "correctness": checks, "rounds": records}
    (output / "raw.json").write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n")
    columns = ["case", "implementation", "sync", "repeat", "warmup", "keys", "batch_size", "logical_operations", "logical_reads", "logical_writes", "transactions", "elapsed_ns", "file_bytes", "checksum", "stats", "execution_index"]
    with (output / "rounds.csv").open("w", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        for result in records:
            writer.writerow({**result, "stats": json.dumps(result["stats"], sort_keys=True)})
    with (output / "latencies.csv").open("w", newline="") as file:
        writer = csv.writer(file)
        writer.writerow(["case", "implementation", "sync", "repeat", "warmup", "keys", "batch_size", "sample_unit", "transaction", "latency_ns"])
        for result in records:
            for index, ns in enumerate(result["latency_ns"]):
                writer.writerow([result["case"], result["implementation"], result["sync"], result["repeat"], result["warmup"], result["keys"], result.get("batch_size", 1), result["sample_unit"], index, ns])
    write_report(document, output)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--smoke", action="store_true")
    parser.add_argument("--keys", type=int, default=1500)
    parser.add_argument("--read-sizes", default="256,1024,4096")
    parser.add_argument("--read-counts", help="freeze exact query counts, one integer per --read-sizes; bypass calibration")
    parser.add_argument("--repeats", type=int, default=5)
    parser.add_argument("--warmups", type=int, default=1)
    parser.add_argument("--seed", type=int, default=SEED)
    parser.add_argument("--target-seconds", type=float, default=210)
    parser.add_argument("--output", type=Path, default=HERE.parent / "results")
    args = parser.parse_args()
    args.read_sizes = [int(value) for value in args.read_sizes.split(",")]
    if args.smoke:
        args.keys, args.read_sizes, args.repeats, args.warmups = 80, [32, 64, 128], 1, 0
    elif args.repeats < 5 or args.warmups < 1:
        parser.error("formal runs require at least 5 measured rounds and 1 warmup")
    if args.keys < 16 or any(size < 16 for size in args.read_sizes):
        parser.error("all dataset sizes must be at least 16")
    started = time.perf_counter()
    initial_hashes = source_hashes()
    print("Correctness gate on real files (6 implementations x 2 durability modes)", flush=True)
    checks = verify(args.seed)
    if args.smoke:
        plan = {"read_counts": {size: 8 for size in args.read_sizes}, "write_count": 16, "durable_count": 16, "range_count": 6}
    elif args.read_counts:
        counts = [int(value) for value in args.read_counts.split(",")]
        if len(counts) != len(args.read_sizes) or min(counts) < 1:
            parser.error("--read-counts must give one positive count per --read-sizes")
        plan = {"read_counts": dict(zip(args.read_sizes, counts)), "write_count": 320, "durable_count": 192, "range_count": 48}
    else:
        plan = calibrate(args)
    metadata = machine_metadata(args, plan)
    if metadata["source_sha256"] != initial_hashes:
        raise RuntimeError("source changed during verification/calibration; rerun with stable sources")
    print("Plan: " + json.dumps(plan, sort_keys=True), flush=True)
    records = []
    for number in range(args.warmups + args.repeats):
        warmup, repeat = number < args.warmups, number - args.warmups
        jobs = []
        for size in args.read_sizes:
            for case in ("read_hit", "read_miss"):
                for name in ("append", "indexed", "sqlite"):
                    jobs.append((measure_queries, (name, size, plan["read_counts"][size], case, repeat, warmup, args.seed)))
        for name in ("snapshot", "append", "indexed", "sqlite"):
            jobs.append((measure_writes, (name, args.keys, plan["write_count"], "none", 1, repeat, warmup, args.seed)))
        for name in ("indexed", "sqlite"):
            for batch in (1, 32):
                jobs.append((measure_writes, (name, args.keys, plan["durable_count"], "fsync", batch, repeat, warmup, args.seed)))
        for name in ("lsm", "lsm-no-bloom"):
            for case in ("read_hit", "read_miss"):
                jobs.append((measure_queries, (name, args.keys, 24 if args.smoke else 128, case, repeat, warmup, args.seed)))
        for name in ("indexed", "sqlite", "lsm", "lsm-no-bloom"):
            jobs.append((measure_range, (name, args.keys, plan["range_count"], repeat, warmup, args.seed)))
        for name in ("indexed", "lsm"):
            jobs.append((measure_compaction, (name, args.keys, repeat, warmup, args.seed)))
        random.Random(args.seed + number).shuffle(jobs)
        print("Round {}/{} ({})".format(number + 1, args.warmups + args.repeats, "warmup" if warmup else "measured"), flush=True)
        for function, arguments in jobs:
            if source_hashes() != initial_hashes:
                raise RuntimeError("source changed while measuring; do not publish mixed-version samples")
            result = function(*arguments)
            for item in result if isinstance(result, list) else [result]:
                item["execution_index"] = len(records)
                records.append(item)
        print("  elapsed {:.1f}s; {} raw rounds".format(time.perf_counter() - started, len(records)), flush=True)
    metadata["finished_utc"] = datetime.now(timezone.utc).isoformat()
    metadata["elapsed_seconds"] = time.perf_counter() - started
    metadata["source_unchanged"] = source_hashes() == initial_hashes
    if not metadata["source_unchanged"]:
        raise RuntimeError("source changed at end of run")
    write_output(args.output, metadata, checks, records)
    print("Saved raw JSON, round/latency CSV, summaries and report: " + str(args.output.resolve()), flush=True)


if __name__ == "__main__":
    main()
