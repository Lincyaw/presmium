# 单元 1：数据先落在文件里

(disk-contract)=
## 数据库的第一条验收：换一个进程还能读到

先写下契约：键是字符串，值是 JSON 可表示的数据；不存在的键返回默认值，`None` 可以作为正常值。删除通过单独的操作表达，不拿 `None` 兼任删除标记。后面所有版本使用相同接口，才有资格比较性能。

:::{slide}
:reveal: items
- 进程 A：`put("Ada", {"balance": 100})`，结束进程
- 进程 B：重新打开相同路径，`get("Ada")`
- 通过条件：值正确，而且数据文件确实存在
:::

在课程目录运行下面两条命令。它们是两个独立进程，不依赖 Python 变量、共享 notebook 内核或浏览器会话。数据放在 `lab-data/`，目录会保留，教师可以打开文件查看；使用新的路径可重新开始实验。

```bash
python3 code/demos.py write --data lab-data/first-database
python3 code/demos.py read --data lab-data/first-database
```

把进程 A 的窗口关掉再运行 B。若把数据库改成一个全局字典，这项验收会失败；因此它比“在同一单元格写完再读”更能检验持久化。

::::{only} notebook
```python
snapshot_path = notebook_data / "snapshot.json"
with JsonSnapshotStore(snapshot_path, sync="none") as database:
    database.put("Ada", {"balance": 100})
with JsonSnapshotStore(snapshot_path, sync="none") as reopened:
    assert reopened.get("Ada") == {"balance": 100}
    assert reopened.get("unknown", "missing") == "missing"
print("关闭再打开：", snapshot_path.is_file(), "，数据已恢复")
```
::::

(snapshot-cost)=
## 最简单的磁盘版本：每写一次，重写整份快照

`JsonSnapshotStore` 是有意保留的基线。每次修改读取已有 JSON，应用变更，再把完整快照写到临时文件并替换旧文件。它易于推理，但一次很小的更新也要序列化、写入大量没有变化的数据。

:::{slide}
| 一次操作 | 快照实现做什么 |
|---|---|
| `get(k)` | 打开并解析整份快照 |
| `put(k,v)` | 读取、修改、重写整份快照 |
| `write_batch(ops)` | 在一次重写中应用整个批次 |
:::

设最终文件大小为 $D$，每次更新的有效载荷为 $u$。单次重写的应用层写放大近似为 $D/u$，还没有计入文件系统与设备内部的写放大。从空库逐条插入 $N$ 个等长值，总序列化量随 $1+2+\cdots+N$ 增长。这里推导的是工作量，不是“磁盘一定慢多少倍”。

(snapshot-implementation)=
## 实现：一次快照提交的边界

在源码编辑器中打开 `code/engine.py` 的 `JsonSnapshotStore.write_batch`。观察临时文件与目标文件为何必须在同一目录。第 4 单元再区分“原子替换”和“确认落盘”这两项不同的保证。

::::{only} web, slides
```{code-ref} region:code/engine.py#snapshot-commit
```
::::

(file-work)=
## 现场实验：固定值大小，只改变记录数

下面真的创建、写入并重新打开文件；在网页里它使用浏览器虚拟文件系统，只用来观察字节工作量，不测物理磁盘速度。正式耗时来自第 8 单元的本机 benchmark。

```{run-panel} python
:params: {records: 100, value_bytes: 64}
import json
from pathlib import Path
from tempfile import TemporaryDirectory

with TemporaryDirectory() as directory:
    path = Path(directory) / "snapshot.json"
    rows, written = {}, 0
    for number in range(int(records)):
        rows[f"key-{number:06d}"] = "x" * int(value_bytes)
        encoded = json.dumps(rows, separators=(",", ":")).encode()
        path.write_bytes(encoded)
        written += len(encoded)
    recovered = json.loads(path.read_bytes())
    print("实际恢复的键数:", len(recovered))
    print("最终文件字节:", path.stat().st_size)
    print("累计提交给文件的字节:", written)
    print("写放大（应用字节/最终文件）:", round(written / path.stat().st_size, 2))
```

先预测 100 改为 200 后哪个量约翻倍、哪个量接近四倍，再运行。不要把本实验的 `rows` 字典误认为最终索引设计：这里只是在解释快照基线的代价；后续索引只保存位置，读取值仍需访问文件。

实验作业：写入中文键、空字符串、`None` 和嵌套 JSON，重开后逐一核对。另写一个不存在键的默认值断言，避免把“值为 `None`”与“键不存在”混为一谈。
