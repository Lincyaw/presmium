# 单元 2：用追加日志替换全文件重写

(log-format)=
## 先设计能恢复的文件格式

不再覆盖旧记录。每次写入把一组操作编码成一个完整帧，追加到文件尾部。帧头包含长度与 CRC32，负载为 UTF-8 JSON 批次；读取时先验证边界与校验，再解释操作。

:::{slide}
```text
| payload长度：4字节 | CRC32：4字节 | JSON批次：length字节 |
|                  frame 0                           |
|                  frame 1                           |
```
:::

长度让读取器知道下一帧在哪里；CRC 让读取器发现完整帧中的意外损坏。CRC 不是加密校验，也不证明硬盘已经持久化。长度必须设上限，不能让损坏的长度字段诱导程序分配巨大内存。

读取器还要验证负载结构，例如操作名是否有效、`put` 是否包含值、键是否为字符串。完整但无效的记录必须报错，不能当成“文件到头了”。

::::{only} web, slides
```{code-ref} region:code/engine.py#frame-header
```
::::

(log-versions)=
## 相同的键会在文件中出现多次

依次写 `Ada=10`、`Lin=7`、`Ada=12`，再删除 `Lin`。文件保留历史版本，查询要选最后一次生效的操作；删除使用显式 tombstone。正常 JSON 的 `null` 仍然可以作为值保存。

:::{slide}
:reveal: items
- `put Ada 10` → 最新值 10
- `put Ada 12` → 最新值 12，旧记录还在
- `delete Ada` → 不存在，不能继续返回旧的 10
:::

`AppendLogStore.get` 每次顺序读取日志、验证帧并找出目标键的最后一个版本。这样写入成本与新记录大小有关，查询却随历史长度增加。下一单元才解决查询代价，不能在这里偷偷加入值缓存后宣布追加日志全面更快。

::::{only} notebook
```python
log_path = notebook_data / "versions.log"
with AppendLogStore(log_path, sync="none") as database:
    database.put("Ada", 10)
    database.put("Ada", 12)
    database.put("nullable", None)
    database.delete("Ada")
with AppendLogStore(log_path, sync="none") as reopened:
    assert reopened.get("Ada", "missing") == "missing"
    assert reopened.get("nullable", "missing") is None
    print("追加文件字节:", log_path.stat().st_size)
```
::::

(append-protocol)=
## 日志发布顺序：先写文件，再改变可见状态

:::{hints}
slides: { zoom: 0.9 }
:::

若先改变索引，再写文件失败，后续读就会相信一个根本不存在的版本。`write_batch` 先完整验证输入并编码，成功追加之后，才发布内存索引或 memtable 的变化。写入失败后不能继续假装成功。

::::{only} web, slides
```{code-ref} region:code/engine.py#append-batch
```
::::

::::{only} web, notebook
```text
验证整批操作 → 编码一个帧 → 完整追加 → 按策略同步 → 发布状态
```
::::

教学实现使用单写者。不能据此推断两个进程同时追加是安全的；多个 `write()`、重开、截断恢复和文件替换都需要更完整的锁与协议。标准库单次写入也可能短写，循环写完或明确失败才是实现责任。

课堂讨论：追加日志与快照分别把成本转移到了什么操作？预测点查未命中会读取多少帧，然后到 benchmark 中用 `records_read` 核对。它记录应用解析的帧数，不是设备执行的物理 I/O 次数。
