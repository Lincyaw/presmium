
这份报告由 `benchmark.py` 的原始样本生成；没有预写倍数。

### 环境和统计口径

- 时间：2026-10-21T08:24:41.726852+00:00；seed=3362026；总耗时 279.1 秒。
- Python：3.9.6 (default, Aug 25 2026, 21:26:21) ；SQLite：3.54.0。
- 系统：macOS-27.0.1-arm64-arm-64bit；硬件：Mac17,4 / arm64；CPU=Apple M5；内存=25769803776 bytes。
- 主数据集 1500 keys、96 字符 payload；读规模 256, 1024, 4096。每个 case 的数据、轨迹和 seed 相同。
- 1 次完整预热不计入结果；5 次测量。每轮随机排列 case/实现，独立真实临时目录；未清 OS 页缓存，不能称为冷盘。
- p50/p95 是合并所有测量轮的逐事务延迟样本；p95 用 nearest rank。吞吐是每轮实际计时总长计算，再取轮次中位数。
- batch=32 的一个延迟样本是一整批事务，不能当成每条操作的 p95。`summary.json` 另保留轮次总耗时中位数/p95，只有 5 轮时轮次 p95 即最大值。
- engine I/O 是系统调用传输字节、解码记录数和 fsync 调用数，不是物理磁盘读写。SQLite 未暴露相同底层计数，写为不可用。文件 bytes 为整个数据库目录，包括打开时的 SQLite WAL/SHM。
- timed 范围之外逐项消费并校验结果及 checksum，写入后重开再验证；开始前 12 组实现×耐久性正确性检查全部通过。

### 追加与整库重写：sync=none

预置同样数据后执行同一批单条覆盖操作。快照每次重写整个 JSON；追加型仅加新帧。以下不含 fsync，不能与后面的耐久事务比较绝对排名。

| 实现 | 操作/轮 | p50 µs/op | p95 µs/op | 吞吐 op/s | 写入 bytes/轮 | 文件 bytes |
| --- | --- | --- | --- | --- | --- | --- |
| append | 320 | 9.96 | 13.50 | 92,845.58 | 52,144 | 280,543 |
| indexed | 320 | 10.33 | 13.38 | 87,553.29 | 52,144 | 280,543 |
| snapshot | 320 | 1,479.44 | 1,676.96 | 655.28 | 69,314,710 | 216,878 |
| sqlite | 320 | 12.92 | 15.58 | 75,721.72 | 不可用 | 1,639,576 |

### 点查随 N 变化：sync=none

预置时每个 key 独占一帧，按固定随机顺序写入。没有把所有值塞进一个大 batch 来掩盖或夸大索引成本。查询期间索引只缓存 key→offset，值仍从文件读取。

| 查询 | N | 实现 | p50 µs/get | p95 µs/get | 吞吐 get/s | 解码记录/get |
| --- | --- | --- | --- | --- | --- | --- |
| read_hit | 256 | append | 1,786.40 | 3,240.12 | 544.30 | 256.00 |
| read_hit | 1024 | append | 6,943.21 | 8,412.50 | 140.10 | 1,024.00 |
| read_hit | 4096 | append | 27,902.67 | 31,031.75 | 35.78 | 4,096.00 |
| read_hit | 256 | indexed | 7.75 | 9.17 | 125,243.80 | 1.00 |
| read_hit | 1024 | indexed | 7.88 | 8.58 | 125,971.78 | 1.00 |
| read_hit | 4096 | indexed | 8.50 | 9.88 | 116,220.95 | 1.00 |
| read_hit | 256 | sqlite | 3.62 | 4.25 | 258,357.92 | 不可用 |
| read_hit | 1024 | sqlite | 3.88 | 4.83 | 257,165.48 | 不可用 |
| read_hit | 4096 | sqlite | 4.58 | 5.33 | 206,234.20 | 不可用 |
| read_miss | 256 | append | 1,719.88 | 2,088.21 | 574.93 | 256.00 |
| read_miss | 1024 | append | 7,064.00 | 10,667.12 | 138.41 | 1,024.00 |
| read_miss | 4096 | append | 27,481.71 | 29,523.25 | 36.36 | 4,096.00 |
| read_miss | 256 | indexed | 0.33 | 0.38 | 2,513,091.64 | 0.00 |
| read_miss | 1024 | indexed | 0.33 | 0.38 | 2,486,983.15 | 0.00 |
| read_miss | 4096 | indexed | 0.38 | 0.50 | 2,118,878.79 | 0.00 |
| read_miss | 256 | sqlite | 2.00 | 2.46 | 482,333.34 | 不可用 |
| read_miss | 1024 | sqlite | 2.29 | 2.83 | 418,077.71 | 不可用 |
| read_miss | 4096 | sqlite | 2.54 | 3.04 | 382,300.25 | 不可用 |

### 耐久事务：逐条 fsync 与批量提交

自制引擎使用 `sync=fsync`；SQLite 使用 WAL + `synchronous=FULL`。两者都按相同 batch 粒度提交相同操作，但不宣称其崩溃保证完全等价。批量提交要等整批成功；这里没有把该等待隐去或画成逐条尾延迟。

| 实现 | batch | p50 µs/事务 | p95 µs/事务 | 逻辑写吞吐 op/s | fsync/轮 |
| --- | --- | --- | --- | --- | --- |
| indexed | 1 | 36.75 | 52.33 | 25,702.24 | 192 |
| indexed | 32 | 121.33 | 164.96 | 255,772.87 | 6 |
| sqlite | 1 | 37.44 | 56.75 | 24,352.09 | 不可用 |
| sqlite | 32 | 290.67 | 339.92 | 112,461.56 | 不可用 |

### Compaction 的空间与重开成本

两实现均以 sync=fsync 打开，先写初代数据、覆盖三代并删除每五个 key 中的一个。比较同一目录 compact 前后；重开是正常 close/reopen、OS 缓存仍热，并非断电恢复。compact 本身包含 fsync 发布，其耗时单列。LSM 在测量前显式 flush，WAL 为空；因此此处 LSM 重开主要是加载 manifest/索引，不能推断长 WAL 的恢复。

| 实现 | 阶段 | 文件 bytes | 重开中位 ms | 重开轮次 p95 ms | 重开解码记录 |
| --- | --- | --- | --- | --- | --- |
| indexed | before | 977,160 | 44.56 | 45.82 | 6,300 |
| indexed | after | 193,512 | 8.35 | 8.87 | 1,200 |
| lsm | before | 1,237,566 | 2.80 | 2.98 | 0 |
| lsm | after | 250,219 | 0.32 | 0.41 | 0 |

| 实现 | compact中位 ms | compact轮次 p95 ms | 发布 fsync |
| --- | --- | --- | --- |
| indexed | 24.49 | 25.38 | 2 |
| lsm | 75.10 | 83.44 | 5 |

### LSM：Bloom 未命中与 range 对照

LSM memtable_limit=128、block_records=16；输入顺序随机，使多个 run 的 min/max 重叠。未命中使用现有 key 间的奇数 key，不能靠整体范围排除代替 Bloom。range 左闭右开，返回 8 个 live keys；Bloom 不用来过滤范围查询。

| 查询 | 实现 | p50 µs/查询 | p95 µs/查询 | 吞吐 查询/s | 块读取/查询 | Bloom拒绝/查询 |
| --- | --- | --- | --- | --- | --- | --- |
| read_hit | lsm | 124.56 | 223.79 | 8,345.35 | 1.09 | 5.59 |
| read_hit | lsm-no-bloom | 596.21 | 1,209.54 | 1,583.76 | 6.48 | 0.00 |
| read_miss | lsm | 16.67 | 157.29 | 29,278.06 | 0.15 | 11.85 |
| read_miss | lsm-no-bloom | 1,168.31 | 1,501.75 | 868.03 | 11.80 | 0.00 |
| range_8 | indexed | 200.27 | 258.46 | 4,828.33 | — | — |
| range_8 | lsm | 1,358.42 | 1,742.96 | 738.59 | 12.50 | 0.00 |
| range_8 | lsm-no-bloom | 1,336.44 | 1,732.58 | 755.55 | 12.50 | 0.00 |
| range_8 | sqlite | 14.54 | 49.62 | 65,525.25 | — | — |

### 观察、负收益与解释边界

- read_hit：Bloom on/off 吞吐比 5.269，本次吞吐提高。这是本次测量，并不保证其他数据分布也如此。
- read_miss：Bloom on/off 吞吐比 33.729，本次吞吐提高。这是本次测量，并不保证其他数据分布也如此。
- range_8：Bloom on/off 吞吐比 0.978，负收益。这是本次测量，并不保证其他数据分布也如此。
- N=4096 read_hit：indexed / SQLite 的吞吐比 0.564；小于 1 表示自制实现更慢，不能用与朴素扫描的比较宣称胜过成熟数据库。
- N=4096 read_miss：indexed / SQLite 的吞吐比 5.542；小于 1 表示自制实现更慢，不能用与朴素扫描的比较宣称胜过成熟数据库。
- 索引把点查扫描变成定位，但需要启动时重建，且占 RAM；此实验没有测 RAM 占用，不宣称无成本。
- compaction 把将来的读取/恢复成本移到当前维护过程，并会重写数据；空间收益必须与上表维护耗时一起读。
- none、fsync、SQLite OFF/FULL 只在各自明示组内比较。没有模拟突然断电、设备缓存失效、并发事务、后台负载、真实混合工作负载或大于内存的数据。
- 这是小型 Python 教学实现与固定 workload。查询吞吐含 Python JSON 编解码和文件系统缓存；不能外推生产数据库排名、冷盘延迟或分布式系统性能。
- `raw.json` 保存每次事务样本、每轮计数、执行顺序及轨迹 checksum；`latencies.csv`、`rounds.csv`、`summary.csv` 可重算。

### 复现

```sh
python3 code/benchmark.py --smoke --output /private/tmp/database-benchmark-smoke
python3 code/benchmark.py --keys 1500 --read-sizes 256,1024,4096 --read-counts 1600,609,153 --seed 3362026 --warmups 1 --repeats 5 --target-seconds 210.0
```

省略 --read-counts 时会按当前机器校准查询次数；上面的命令冻结本次采样长度。`raw.json` 的 metadata.plan 也保存精确长度；同一次运行各实现共享同一操作轨迹。

源码 SHA-256：

- `engine.py`：`efc55f031cfa5d03153456c9c3e6a5f48bf8b1a894ff7258ebec70e6259aa1ba`
- `lsm.py`：`84ad94d81588505739703ecb9e0a2aeaf057621b3b97ecac82c78e34836bf4ed`
- `benchmark.py`：`bf65753e7dfcdbe64c91834b99a921615caf484b77ded892b513e8aed8dfeff6`
- `benchmark_report.py`：`8b8d57db44bb680e4752b2f62e9757f1cb613f01113b50f2dd55a2178c379535`
