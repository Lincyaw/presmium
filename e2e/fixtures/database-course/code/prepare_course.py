#!/usr/bin/env python3
"""Derive lecture-sized exhibits from the unchanged formal benchmark evidence."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


def main():
    results = ROOT / "results"
    document = json.loads((results / "raw.json").read_text())
    metadata = document["metadata"]
    if metadata["smoke"] or metadata["repeats"] < 5 or metadata["warmups"] < 1:
        raise ValueError("lecture performance exhibits require a formal benchmark")
    for name, expected in metadata["source_sha256"].items():
        actual = hashlib.sha256((ROOT / "code" / name).read_bytes()).hexdigest()
        if actual != expected:
            raise ValueError("measured source changed: " + name)
    rows = json.loads((results / "summary.json").read_text())

    def result(case, implementation, keys=None, batch=1):
        candidates = [row for row in rows if row["case"] == case
                      and row["implementation"] == implementation
                      and row["batch_size"] == batch
                      and (keys is None or row["keys"] == keys)]
        if len(candidates) != 1:
            raise ValueError("ambiguous exhibit: " + str((case, implementation, keys, batch)))
        return candidates[0]

    def throughput(case, baseline, candidate, keys=None, old_batch=1, new_batch=1):
        before = result(case, baseline, keys, old_batch)
        after = result(case, candidate, keys, new_batch)
        return before["throughput_median_ops_s"], after["throughput_median_ops_s"]

    largest = max(metadata["read_sizes"])
    comparisons = [
        ("快照 → 追加写", "N={}，none".format(metadata["keys"]),
         throughput("write_updates", "snapshot", "append")),
        ("扫描 → 偏移索引", "N={}，命中，none".format(largest),
         throughput("read_hit", "append", "indexed", largest)),
        ("逐条 → 32条批次", "fsync，op/s", throughput("durable_updates", "indexed", "indexed", old_batch=1, new_batch=32)),
        ("Bloom off → on", "N={}，未命中，none".format(metadata["keys"]),
         throughput("read_miss", "lsm-no-bloom", "lsm", metadata["keys"])),
    ]
    lines = ["| 变化 | 相同负载与策略 | 前 → 后 op/s | 比值 |",
             "| --- | --- | --- | --- |"]
    for name, scope, (before, after) in comparisons:
        lines.append("| {} | {} | {:,.0f} → {:,.0f} | {:.2f}× |".format(name, scope, before, after, after / before))
    lines += ["", ":::{slide}",
              "本机 {}；{} 次预热 + {} 次测量；OS 页缓存未清。".format(metadata["cpu"], metadata["warmups"], metadata["repeats"]),
              "批次延迟以整批事务为单位，不能据吞吐推断每个请求等待减少相同比例。", ":::"]
    (results / "slide-speed.md").write_text("\n".join(lines) + "\n")

    sqlite, indexed = throughput("read_hit", "sqlite", "indexed", largest)
    rows2 = [["SQLite → 教学索引", "N={}，命中，none".format(largest), "{:.2f}× 吞吐（更慢）".format(indexed / sqlite)]]
    for name in ("indexed", "lsm"):
        before = result("recovery_before", name)
        after = result("recovery_after", name)
        maintenance = result("compaction", name)
        rows2.append([name + " 压缩", "{:,.0f} → {:,.0f} bytes".format(before["file_bytes_median"], after["file_bytes_median"]),
                      "重开 {:.2f} → {:.2f} ms；维护 {:.2f} ms".format(before["round_elapsed_median_ms"], after["round_elapsed_median_ms"], maintenance["round_elapsed_median_ms"])])
    table = ["| 对照 | 条件或空间 | 结果与成本 |", "| --- | --- | --- |"]
    table += ["| " + " | ".join(row) + " |" for row in rows2]
    (results / "slide-tradeoffs.md").write_text("\n".join(table) + "\n")

    # Keep the benchmark generator and raw outputs byte-for-byte unchanged.
    summary = (results / "summary.md").read_text().replace("[完整实测报告](report.md)", "{ref}`benchmark-full-report`")
    (results / "summary-for-lecture.md").write_text(summary)
    report = (results / "report.md").read_text().splitlines()[1:]
    report = ["#" + line if line.startswith("## ") else line for line in report]
    (results / "report-for-lecture.md").write_text("\n".join(report) + "\n")
    print("Formal source hashes verified; generated lecture exhibits from {} measured rounds.".format(metadata["repeats"]))


if __name__ == "__main__":
    main()
