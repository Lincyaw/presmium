"""Render only measured samples; no hard-coded performance claims."""
from __future__ import annotations

import csv
import json
import math
import statistics
from pathlib import Path


def p95(values):
    ordered = sorted(values)
    return ordered[max(0, math.ceil(len(ordered) * 0.95) - 1)]


def median(values):
    return statistics.median(values)


def summarize(records):
    grouped = {}
    for result in records:
        if not result["warmup"]:
            identity = (result["case"], result["implementation"], result["sync"], result["keys"], result.get("batch_size", 1))
            grouped.setdefault(identity, []).append(result)
    summary = []
    for identity, rounds in sorted(grouped.items()):
        samples = [ns for result in rounds for ns in result["latency_ns"]]
        throughput = [result["logical_operations"] * 1e9 / result["elapsed_ns"] for result in rounds]
        counters = {name: median([result["stats"][name] for result in rounds])
                    for name in rounds[0]["stats"] if all(result["stats"].get(name) is not None for result in rounds)}
        summary.append({"case": identity[0], "implementation": identity[1], "sync": identity[2], "keys": identity[3],
                        "batch_size": identity[4], "rounds": len(rounds), "samples": len(samples),
                        "latency_p50_us": median(samples) / 1000, "latency_p95_us": p95(samples) / 1000,
                        "round_elapsed_median_ms": median([result["elapsed_ns"] for result in rounds]) / 1e6,
                        "round_elapsed_p95_ms": p95([result["elapsed_ns"] for result in rounds]) / 1e6,
                        "throughput_median_ops_s": median(throughput), "throughput_p95_ops_s": p95(throughput),
                        "file_bytes_median": median([result["file_bytes"] for result in rounds]),
                        "stats_median": counters, "sample_unit": rounds[0]["sample_unit"],
                        "logical_operations_per_round": rounds[0]["logical_operations"]})
    return summary


def write_report(document, output):
    meta = document["metadata"]
    summaries = summarize(document["rounds"])
    (output / "summary.json").write_text(json.dumps(summaries, ensure_ascii=False, indent=2) + "\n")
    columns = ["case", "implementation", "sync", "keys", "batch_size", "rounds", "samples", "sample_unit",
               "latency_p50_us", "latency_p95_us", "round_elapsed_median_ms", "round_elapsed_p95_ms",
               "throughput_median_ops_s", "throughput_p95_ops_s", "file_bytes_median", "stats_median"]
    with (output / "summary.csv").open("w", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        for result in summaries:
            writer.writerow({**result, "stats_median": json.dumps(result["stats_median"], sort_keys=True)})
    def selected(case, names=None):
        return [result for result in summaries if result["case"] == case and (names is None or result["implementation"] in names)]
    def number(value, digits=2):
        return "不可用" if value is None else format(value, ",.{}f".format(digits))
    def table(headers, rows):
        return "\n".join(["| " + " | ".join(headers) + " |", "| " + " | ".join(["---"] * len(headers)) + " |"]
                         + ["| " + " | ".join(map(str, values)) + " |" for values in rows])
    title = "冒烟结果（不用于性能结论）" if meta["smoke"] else "真实磁盘 KV 基准实测"
    lines = ["# " + title, "", "这份报告由 `benchmark.py` 的原始样本生成；没有预写倍数。",
             "", "## 环境和统计口径", "",
             "- 时间：{}；seed={}；总耗时 {:.1f} 秒。".format(meta["timestamp_utc"], meta["seed"], meta["elapsed_seconds"]),
             "- Python：{}；SQLite：{}。".format(meta["python"].splitlines()[0], meta["sqlite_version"]),
             "- 系统：{}；硬件：{} / {}；CPU={}；内存={} bytes。".format(meta["os"], meta["hardware_model"], meta["machine"], meta["cpu"], meta["memory_bytes"]),
             "- 主数据集 {} keys、96 字符 payload；读规模 {}。每个 case 的数据、轨迹和 seed 相同。".format(meta["keys"], ", ".join(map(str, meta["read_sizes"]))),
             "- {} 次完整预热不计入结果；{} 次测量。每轮随机排列 case/实现，独立真实临时目录；未清 OS 页缓存，不能称为冷盘。".format(meta["warmups"], meta["repeats"]),
             "- p50/p95 是合并所有测量轮的逐事务延迟样本；p95 用 nearest rank。吞吐是每轮实际计时总长计算，再取轮次中位数。",
             "- batch=32 的一个延迟样本是一整批事务，不能当成每条操作的 p95。`summary.json` 另保留轮次总耗时中位数/p95，只有 5 轮时轮次 p95 即最大值。",
             "- engine I/O 是系统调用传输字节、解码记录数和 fsync 调用数，不是物理磁盘读写。SQLite 未暴露相同底层计数，写为不可用。文件 bytes 为整个数据库目录，包括打开时的 SQLite WAL/SHM。",
             "- timed 范围之外逐项消费并校验结果及 checksum，写入后重开再验证；开始前 {} 组实现×耐久性正确性检查全部通过。".format(len(document["correctness"])),
             "", "## 追加与整库重写：sync=none", "",
             "预置同样数据后执行同一批单条覆盖操作。快照每次重写整个 JSON；追加型仅加新帧。以下不含 fsync，不能与后面的耐久事务比较绝对排名。", ""]
    lines.append(table(["实现", "操作/轮", "p50 µs/op", "p95 µs/op", "吞吐 op/s", "写入 bytes/轮", "文件 bytes"],
                       [[r["implementation"], r["logical_operations_per_round"], number(r["latency_p50_us"]), number(r["latency_p95_us"]),
                         number(r["throughput_median_ops_s"]), number(r["stats_median"].get("bytes_written"), 0), number(r["file_bytes_median"], 0)]
                        for r in selected("write_updates")]))
    lines += ["", "## 点查随 N 变化：sync=none", "",
              "预置时每个 key 独占一帧，按固定随机顺序写入。没有把所有值塞进一个大 batch 来掩盖或夸大索引成本。查询期间索引只缓存 key→offset，值仍从文件读取。", ""]
    lines.append(table(["查询", "N", "实现", "p50 µs/get", "p95 µs/get", "吞吐 get/s", "解码记录/get"],
                       [[case, r["keys"], r["implementation"], number(r["latency_p50_us"]), number(r["latency_p95_us"]), number(r["throughput_median_ops_s"]),
                         number(r["stats_median"].get("records_read") / r["logical_operations_per_round"]) if "records_read" in r["stats_median"] else "不可用"]
                        for case in ("read_hit", "read_miss") for r in selected(case, ("append", "indexed", "sqlite"))]))
    lines += ["", "## 耐久事务：逐条 fsync 与批量提交", "",
              "自制引擎使用 `sync=fsync`；SQLite 使用 WAL + `synchronous=FULL`。两者都按相同 batch 粒度提交相同操作，但不宣称其崩溃保证完全等价。批量提交要等整批成功；这里没有把该等待隐去或画成逐条尾延迟。", ""]
    lines.append(table(["实现", "batch", "p50 µs/事务", "p95 µs/事务", "逻辑写吞吐 op/s", "fsync/轮"],
                       [[r["implementation"], r["batch_size"], number(r["latency_p50_us"]), number(r["latency_p95_us"]),
                         number(r["throughput_median_ops_s"]), number(r["stats_median"].get("syncs"), 0)] for r in selected("durable_updates")]))
    lines += ["", "## Compaction 的空间与重开成本", "",
              "两实现均以 sync=fsync 打开，先写初代数据、覆盖三代并删除每五个 key 中的一个。比较同一目录 compact 前后；重开是正常 close/reopen、OS 缓存仍热，并非断电恢复。compact 本身包含 fsync 发布，其耗时单列。LSM 在测量前显式 flush，WAL 为空；因此此处 LSM 重开主要是加载 manifest/索引，不能推断长 WAL 的恢复。", ""]
    compact_rows = []
    for name in ("indexed", "lsm"):
        for phase in ("before", "after"):
            r = next(r for r in selected("recovery_" + phase) if r["implementation"] == name)
            compact_rows.append([name, phase, number(r["file_bytes_median"], 0), number(r["round_elapsed_median_ms"]), number(r["round_elapsed_p95_ms"]), number(r["stats_median"].get("records_read"), 0)])
    lines.append(table(["实现", "阶段", "文件 bytes", "重开中位 ms", "重开轮次 p95 ms", "重开解码记录"], compact_rows))
    lines.append("")
    lines.append(table(["实现", "compact中位 ms", "compact轮次 p95 ms", "发布 fsync"],
                       [[r["implementation"], number(r["round_elapsed_median_ms"]), number(r["round_elapsed_p95_ms"]), number(r["stats_median"].get("syncs"), 0)] for r in selected("compaction")]))
    lines += ["", "## LSM：Bloom 未命中与 range 对照", "",
              "LSM memtable_limit=128、block_records=16；输入顺序随机，使多个 run 的 min/max 重叠。未命中使用现有 key 间的奇数 key，不能靠整体范围排除代替 Bloom。range 左闭右开，返回 8 个 live keys；Bloom 不用来过滤范围查询。", ""]
    lines.append(table(["查询", "实现", "p50 µs/查询", "p95 µs/查询", "吞吐 查询/s", "块读取/查询", "Bloom拒绝/查询"],
                       [[case, r["implementation"], number(r["latency_p50_us"]), number(r["latency_p95_us"]), number(r["throughput_median_ops_s"]),
                         number(r["stats_median"].get("blocks_read", 0) / r["logical_operations_per_round"]) if r["implementation"].startswith("lsm") else "—",
                         number(r["stats_median"].get("bloom_negatives", 0) / r["logical_operations_per_round"]) if r["implementation"].startswith("lsm") else "—"]
                        for case in ("read_hit", "read_miss", "range_8") for r in selected(case, ("lsm", "lsm-no-bloom", "indexed", "sqlite"))
                        if case == "range_8" or r["implementation"].startswith("lsm")]))
    lines += ["", "## 观察、负收益与解释边界", ""]
    for case in ("read_hit", "read_miss", "range_8"):
        bloom = next(r for r in selected(case) if r["implementation"] == "lsm")
        plain = next(r for r in selected(case) if r["implementation"] == "lsm-no-bloom")
        ratio = bloom["throughput_median_ops_s"] / plain["throughput_median_ops_s"]
        label = "负收益" if ratio < 1 else "本次吞吐提高"
        lines.append("- {}：Bloom on/off 吞吐比 {:.3f}，{}。这是本次测量，并不保证其他数据分布也如此。".format(case, ratio, label))
    largest = max(meta["read_sizes"])
    for case in ("read_hit", "read_miss"):
        index = next(r for r in selected(case) if r["implementation"] == "indexed" and r["keys"] == largest)
        sqlite = next(r for r in selected(case) if r["implementation"] == "sqlite" and r["keys"] == largest)
        lines.append("- N={} {}：indexed / SQLite 的吞吐比 {:.3f}；小于 1 表示自制实现更慢，不能用与朴素扫描的比较宣称胜过成熟数据库。".format(largest, case, index["throughput_median_ops_s"] / sqlite["throughput_median_ops_s"]))
    lines += ["- 索引把点查扫描变成定位，但需要启动时重建，且占 RAM；此实验没有测 RAM 占用，不宣称无成本。",
              "- compaction 把将来的读取/恢复成本移到当前维护过程，并会重写数据；空间收益必须与上表维护耗时一起读。",
              "- none、fsync、SQLite OFF/FULL 只在各自明示组内比较。没有模拟突然断电、设备缓存失效、并发事务、后台负载、真实混合工作负载或大于内存的数据。",
              "- 这是小型 Python 教学实现与固定 workload。查询吞吐含 Python JSON 编解码和文件系统缓存；不能外推生产数据库排名、冷盘延迟或分布式系统性能。",
              "- `raw.json` 保存每次事务样本、每轮计数、执行顺序及轨迹 checksum；`latencies.csv`、`rounds.csv`、`summary.csv` 可重算。", "", "## 复现", "", "```sh",
              "python3 code/benchmark.py --smoke --output /private/tmp/database-benchmark-smoke",
              "python3 code/benchmark.py " + ("--smoke" if meta["smoke"] else "--keys {} --read-sizes {} --read-counts {} --seed {} --warmups {} --repeats {} --target-seconds {}".format(meta["keys"], ",".join(map(str, meta["read_sizes"])), ",".join(str(meta["plan"]["read_counts"].get(size, meta["plan"]["read_counts"].get(str(size)))) for size in meta["read_sizes"]), meta["seed"], meta["warmups"], meta["repeats"], meta["target_seconds"])),
              "```", "", "省略 --read-counts 时会按当前机器校准查询次数；上面的命令冻结本次采样长度。`raw.json` 的 metadata.plan 也保存精确长度；同一次运行各实现共享同一操作轨迹。", "", "源码 SHA-256：", ""]
    lines += ["- `{}`：`{}`".format(name, sha) for name, sha in meta["source_sha256"].items()]
    (output / "report.md").write_text("\n".join(lines) + "\n")

    # A projection-sized excerpt for the lecture, generated from the same data.
    def find(case, name, size=None, batch=1):
        return next(r for r in summaries if r["case"] == case and r["implementation"] == name
                    and r["batch_size"] == batch and (size is None or r["keys"] == size))
    overview = []
    def comparison(label, conditions, before, after):
        ratio = after["throughput_median_ops_s"] / before["throughput_median_ops_s"]
        overview.append([label, conditions,
                         "{} → {}".format(number(before["throughput_median_ops_s"], 0), number(after["throughput_median_ops_s"], 0)),
                         "{:.2f}×{}".format(ratio, " ↓" if ratio < 1 else "")])
    comparison("整库重写 → 追加", "N={}，none，单条写".format(meta["keys"]), find("write_updates", "snapshot"), find("write_updates", "append"))
    for size in meta["read_sizes"]:
        comparison("扫描 → offset 索引", "N={}，none，命中 get".format(size), find("read_hit", "append", size), find("read_hit", "indexed", size))
    comparison("逐条 → 批量提交", "N={}，fsync，1→32条/事务".format(meta["keys"]), find("durable_updates", "indexed", batch=1), find("durable_updates", "indexed", batch=32))
    for case, label in (("read_miss", "未命中"), ("read_hit", "命中")):
        comparison("LSM Bloom off → on", "N={}，none，{} get".format(meta["keys"], label), find(case, "lsm-no-bloom"), find(case, "lsm"))
    comparison("SQLite → 教学 offset 索引", "N={}，none，命中 get".format(largest), find("read_hit", "sqlite", largest), find("read_hit", "indexed", largest))
    excerpt = ["实测：{}；{}；{} 次预热 + {} 次测量，seed={}。真实临时文件，OS 页缓存未清；吞吐取轮次中位数，↓ 表示负收益。".format(meta["timestamp_utc"].split("T")[0], meta["cpu"], meta["warmups"], meta["repeats"], meta["seed"]), "",
               table(["变化", "数据与保证", "前 → 后吞吐 op/s", "后/前"], overview), "",
               "批量一条延迟样本是一整批事务，不能用其 p95 代表单条等待。SQLite 使用 WAL，none组为OFF、耐久组为FULL；不宣称与教学引擎的崩溃保证完全相等。", ""]
    maintenance = []
    for name in ("indexed", "lsm"):
        before, after, compact = find("recovery_before", name), find("recovery_after", name), find("compaction", name)
        maintenance.append([name, "{} → {}".format(number(before["file_bytes_median"], 0), number(after["file_bytes_median"], 0)),
                            "{} → {}".format(number(before["round_elapsed_median_ms"]), number(after["round_elapsed_median_ms"])),
                            number(compact["round_elapsed_median_ms"])])
    excerpt += ["Compaction：N={}，删除后 live keys={}；两实现均 fsync，正常关闭重开且 OS 缓存热。LSM 已 flush、WAL 为空。".format(meta["keys"], meta["keys"] - len(range(0, meta["keys"], 5))), "",
                table(["实现", "前 → 后文件 bytes", "前 → 后重开 ms", "compact ms"], maintenance), "",
                "小型 Python 教学实现、固定 workload；不能外推冷盘、断电恢复、并发事务或生产数据库排名。p50/p95、I/O 计数、原始样本和源码 hash 见[完整实测报告](report.md)与 `raw.json`。"]
    (output / "summary.md").write_text("\n".join(excerpt) + "\n")


if __name__ == "__main__":
    import sys
    source = Path(sys.argv[1])
    write_report(json.loads(source.read_text()), source.parent)
