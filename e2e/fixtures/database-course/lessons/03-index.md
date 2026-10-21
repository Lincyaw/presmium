# 单元 3：索引保存位置，值留在磁盘

(index-layout)=
## 从“读全部历史”到“找到最新位置”

`IndexedLogStore` 保留相同的日志格式，改变查询路径。重开时扫描一次日志，建立 `key → (frame offset, operation index)` 的映射。点查先找位置，再定位并验证相应帧，从文件里读取值。

:::{slide}
```text
keydir["Ada"] = (文件偏移, 批次内序号)
             ↓ seek
日志文件中的完整帧 → 校验 → 解析目标操作 → 返回 value
```
:::

索引字典不是整个数据库：它只保存每个存活键的位置信息，不保存所有值。内存随键数和键长度增加，仍然有容量上限。索引的空间、重建时间和日志文件的历史数据量是三个不同指标。

这种“追加文件 + 内存 keydir”的思路与 [Bitcask 原始设计](https://raw.githubusercontent.com/basho/bitcask/develop/doc/bitcask-intro.pdf) 对应。本课不实现它的全部分段、hint 文件与并发特性。

(index-tradeoff)=
## 查询变快，把什么代价留给了启动？

对同一文件执行同一串查询，比较 `AppendLogStore` 与 `IndexedLogStore`。计时区间里不要包括数据生成与建库；另设一个测试测打开与索引重建，才能看清成本转移。

:::{slide}
| 路径 | 扫描日志 | 偏移索引 |
|---|---|---|
| 命中 | 解析历史帧 | 索引查找 + 目标帧 |
| 未命中 | 解析历史帧 | 可直接判不存在 |
| 重新打开 | 验证日志 | 验证日志并重建索引 |
| 内存 | 少 | 保存全部存活键的位置 |
:::

“字典查找平均常数时间”只说明算法的一部分。真实查询还有文件定位、系统调用、JSON 解码和 CRC 成本。小数据、热页缓存下 Python 固定开销可能占主导，所以报告会同时给耗时与帧读取量，不用复杂度替代测量。

::::{only} notebook
```python
indexed_path = notebook_data / "indexed.log"
with IndexedLogStore(indexed_path, sync="none") as database:
    database.write_batch([("put", "Ada", 10), ("put", "Lin", 7)])
    database.put("Ada", 12)
with IndexedLogStore(indexed_path, sync="none") as reopened:
    reopened.reset_stats()
    assert reopened.get("Ada") == 12
    print("命中查询统计:", reopened.stats)
    reopened.reset_stats()
    assert reopened.get("missing", "absent") == "absent"
    print("未命中查询统计:", reopened.stats)
```
::::

(index-implementation)=
## 实现：索引定位后仍从文件读取值

:::{hints}
slides: { zoom: 0.9 }
:::

先在索引中查到偏移，再 `seek` 到对应帧；CRC 校验和批次解析仍然发生。未命中的键可以在索引层返回，命中的值不会由索引字典直接返回。

::::{only} web, slides
```{code-ref} region:code/engine.py#index-get
```
::::

(index-experiment)=
## 实验：把负载固定，再改变 N

数据集至少保留三个规模，查询序列使用固定随机种子。命中、未命中分开报告，不能把 100% 未命中索引测试与 100% 命中扫描测试直接相除。所有值均由 benchmark 消费并验证校验和，防止把“没读数据”测成性能提升。

:::{slide}
:reveal: items
- 改变记录数，观察扫描帧数是否随 N 增长
- 保持查询轨迹，比较扫描与索引的耗时比
- 独立测量重开，把索引重建成本还给设计
:::

作业：把值大小改大后重新测。若索引命中仍要读出一个包含很多操作的大批次，它可能为了一个值解码整批数据。解释“一帧一批”的恢复简化为什么可能带来读放大，并提出把事务边界与数据块边界分离的改造方案。

::::{only} web, notebook
再检查范围读取。此处的哈希 keydir 没有维护有序结构，`scan` 先排序所有索引键，然后逐个读取目标值；取 8 个值也可能付出全键排序成本。SSTable 的有序布局将在第 6 单元改变这条路径。点查很快不能直接推出范围扫描也快。
::::
