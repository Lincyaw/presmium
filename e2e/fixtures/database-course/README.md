# 从文件到 LSM：磁盘数据库实现课

八个单元，从磁盘 JSON 快照到带 WAL、排序 SSTable、稀疏索引、Bloom 和原子 manifest 的单写者 LSM。所有引擎与 benchmark 仅依赖 Python 3.9+ 标准库。此目录是用户课程的私有验证文稿；仓库的公开示例是 `examples/gallery`。

## 开始上课

在本聊天准备的独立课程目录 `.presmium/database-course-experience` 中运行下列命令。它有自己的 Git 根目录，代码引用指向课程中的 `code/`；旧内存教学文稿保留在 `.presmium/teacher-database-experience`。

```sh
python3 code/demos.py write --data lab-data/first-database
python3 code/demos.py read --data lab-data/first-database
python3 code/demos.py index --data lab-data/index
python3 code/demos.py compact --data lab-data/compaction
python3 code/demos.py recover --data lab-data/recovery
python3 code/demos.py lsm --data lab-data/lsm
```

write 与 read 是两个独立进程。`lab-data/` 文件会保留，可以关闭 Python 后重开、在编辑器检查文件；重做实验请选新目录，脚本不会自动删除已有课堂数据。

课程 Web 与 slides 从同一份 `lecture.md` 编排，长篇说明成为讲者备注，源码引用指向真实实现；notebook 在课程根目录运行，导入同一套引擎。浏览器参数面板使用虚拟文件系统，只演示文件字节工作量，不代表宿主 SSD 的性能。正式 benchmark 在本机 Python 中运行。

```sh
presmium check
presmium dev --to web
presmium build --to web,slides,notebook
```

复制课程到另一个位置时，保留 `code/`、`lessons/`、`results/`，在副本根目录初始化自己的 Git 仓库并安装 Presmium 依赖。不要直接在单仓的 fixture 子目录运行代码锚点检查，那里的 Git 根目录是整个 Presmium 仓库。

## 正确性与性能

```sh
python3 code/verify.py
python3 code/verify_lsm.py
python3 code/benchmark.py --smoke --output /private/tmp/database-benchmark-smoke
python3 code/benchmark.py --keys 1500 --read-sizes 256,1024,4096 --warmups 1 --repeats 5 --target-seconds 210
python3 code/prepare_course.py
```

正式测量保留原始事务采样、轮次、CSV、环境、代码 SHA-256 与相同轨迹的 checksum。`results/summary.md` 是投影摘要，`results/report.md` 是完整解释，`results/raw.json` 是原始证据。代码在校准或测量中改变会立即中止，避免混版本结果。

`prepare_course.py` 核对结果中的源码哈希和测量轮数，再生成讲义引用的摘要与完整报告；修改引擎后必须重新测量。教师逐课的推演、实验步骤、故障分析和验收要求在 `teacher-guide.md`。

采样包含 OS 页缓存，不叫冷盘；`sync=none` 与 `fsync` 分组，显式批次延迟不冒充单请求尾延迟；SQLite 对照列出 WAL/OFF/FULL 配置。课程不宣称完整 ACID、并发写安全或真实断电验证。

## 授课安排与作业

每单元 60–90 分钟，先预测机制，再逐步读源码，随后运行本机实验，最后用测量解释成本转移。八单元的目标和验收见讲义封面。结课交付包含一个正确的优化和一个没有变快的场景。

- `engine.py`：快照 / 追加日志 / 偏移索引，共同 API、CRC 帧、原子批次、fsync、恢复与压缩。
- `lsm.py`：有界工作集、WAL/SST/manifest、稀疏索引、过滤器、流式范围归并与全量压缩。
- `verify*.py`：真实文件、独立子进程、异常退出、损坏与发布边界。
- `demos.py`：教师现场的持久化、索引、压缩、恢复、LSM 演示。
- `benchmark*.py`：同轨迹多轮测量及自动报告。
