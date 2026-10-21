---
title: 从文件到 LSM：用 Python 构建磁盘数据库
lang: zh-CN
plugins:
  - '@lincyaw/slidev-addon-core'
  - '@lincyaw/slidev-addon-code'
  - '@lincyaw/slidev-addon-exec'
  - '@lincyaw/slidev-addon-content'
  - '@lincyaw/slidev-addon-session'
  - '@lincyaw/slidev-addon-classroom'
  - '@lincyaw/slidev-addon-stage'
  - '@lincyaw/slidev-addon-guide'
  - '@lincyaw/slidev-addon-lecture'
  - '@lincyaw/slidev-addon-publish'
renderers:
  web: {}
  slides: {}
  notebook: {}
---

# 从文件到 LSM：用 Python 构建磁盘数据库

:::{hints}
slides: { wakeLock: false }
:::

从第一节开始，数据库就写入文件。我们保持 `put / get / delete / write_batch / scan` 接口，依次改变文件组织、查找方式和提交协议，最后得到一个有 WAL、SSTable、稀疏索引、Bloom filter 与压缩的教学存储引擎。每项优化先通过重启和故障验证，再用相同负载测出收益与代价。

:::{slide}
:reveal: items
- 数据必须跨进程存活，值真正从文件读取
- 每次改造都有不变量、故障案例和可运行源码
- 先验证正确，再比较时间、空间与恢复成本
:::

适合会写 Python、了解文件和复杂度的学习者。建议八次课，每次 60–90 分钟，配一次实验；也可以选取索引、恢复或 LSM 单元独立讲授。先修内容只有函数、类、字典、排序和文件读写，不要求数据库背景。

::::{only} web, notebook
教师使用 {ref}`teaching-handbook` 安排推演、逐步编码、故障注入和作业验收。每次课的时间包含学生实现与实验，不只是朗读讲义。阅读正文后应运行对应命令、检查数据文件，再完成该单元的提交。
::::

这是一门单机存储引擎实现课。单进程单写者是明确前提；原子批次不等于 SQL 事务隔离。SQL 解析、B+ 树、MVCC、多进程锁和复制是后续扩展，不把它们写成已经实现的能力。

::::{only} web, notebook
| 单元 | 实现后的能力 | 当堂要提交的证据 |
|---|---|---|
| 1 文件快照 | 用 JSON 文件保存键值，关闭后重开 | 两个独立 Python 进程读到同一值 |
| 2 追加日志 | CRC 帧、覆盖版本、删除记录 | 文件增长、重复键及损坏检测 |
| 3 偏移索引 | key → 文件位置，值按需读盘 | 相同查询轨迹的扫描量与耗时 |
| 4 提交与持久性 | `fsync`、原子批次与批量提交 | 同等提交语义下的吞吐及尾延迟 |
| 5 崩溃恢复 | 完整帧重放、半帧截断、损坏拒绝 | 子进程异常退出与逐截断恢复 |
| 6 LSM 与有序表 | WAL、memtable、SSTable、manifest | flush 后值离开 memtable 仍可读取 |
| 7 过滤与压缩 | Bloom、流式归并、墓碑回收 | 未命中读放大、空间与重启成本 |
| 8 性能实验 | 固定轨迹、重复测量、SQLite 对照 | 原始 JSON/CSV、实测表、反例与解释 |
::::

::::{only} web, notebook
在课程目录运行 `python3 code/verify.py` 和 `python3 code/verify_lsm.py`。性能测量使用 `python3 code/benchmark.py --help` 中的正式命令，结果保存在 `results/`。操作系统页缓存会影响结果；本课不会把浏览器虚拟文件系统的时间当成本机磁盘性能。
::::

::::{only} notebook
```python
from pathlib import Path
import sys

course_root = Path.cwd()
if not (course_root / "code" / "engine.py").is_file():
    raise RuntimeError("请在包含 code/ 的课程目录打开 notebook")
sys.path.insert(0, str(course_root / "code"))
from engine import JsonSnapshotStore, AppendLogStore, IndexedLogStore
from lsm import LSMStore
notebook_data = course_root / "lab-data" / "notebook"
notebook_data.mkdir(parents=True, exist_ok=True)
```
::::

```{include} lessons/01-files.md
```

```{include} lessons/02-log.md
```

```{include} lessons/03-index.md
```

```{include} lessons/04-durability.md
```

```{include} lessons/05-recovery.md
```

```{include} lessons/06-lsm.md
```

```{include} lessons/07-compaction.md
```

```{include} lessons/08-benchmark.md
```

(teaching-handbook)=
## 授课与实验手册

:::{slide}
逐单元完成推演、真实文件实验与证据提交；详细步骤在阅读版和 notebook 中。
:::

::::{only} web, notebook
```{include} teacher-guide.md
```
::::

(benchmark-full-report)=
## 完整实测报告与复现记录

:::{slide}
保留原始样本、执行顺序、代码哈希与环境，才能复查每一个性能比值。
:::

::::{only} web, notebook
```{include} results/report-for-lecture.md
```
::::
