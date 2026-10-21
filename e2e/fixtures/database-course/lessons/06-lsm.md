# 单元 6：从全键索引走向有序磁盘表

(lsm-path)=
## WAL、memtable 与 SSTable 各负责什么？

全键 keydir 的内存消耗随数据库规模增加。LSM 路线将最近写入放在有限 memtable 中，写入先进入 WAL；memtable 达到阈值后排序并写成不可变的 SSTable。旧数据留在文件中，内存保留稀疏索引和过滤器。

:::{slide}
```text
write_batch → WAL帧 → 有限memtable
                         ↓ flush
              排序SSTable + 稀疏索引 + Bloom
                         ↓
                    manifest发布
```
:::

LSM 的 memtable 确实在内存中，但不是整个数据库只存内存：WAL 已保存近期写入，flush 后的值来自 SSTable，重启从 manifest 与 WAL 恢复。课程的子进程验证会在 flush 前后分别重开。

memtable 的条数限制是触发 flush 的阈值，不是严格 RAM 上限。一个原子批次及其编码负载可以短暂超过阈值；索引、过滤器和 Python 对象也占内存。

本实现是单线程、同步 flush、一个层次的多个不可变 run。它借鉴 [LevelDB 的文件组织](https://github.com/google/leveldb/blob/main/doc/impl.md)，没有实现后台压缩调度、分层大小策略和 snapshot/MVCC。

(wal-implementation)=
## 实现：WAL 成功后才发布 memtable

:::{hints}
slides: { zoom: 0.72 }
:::

先标出 `_write_all`、`_sync`、`_seq` 和 `_memtable` 四个位置。一个批次共用序号，整个帧成功后才改变可见状态；自动 flush 是后续维护动作，不会把半个批次单独确认。

::::{only} web, slides
```{code-ref} symbol:code/lsm.py#LSMStore.write_batch
```
::::

推演写入失败：若异常发生在追加或同步阶段，实例标记为失败，要求关闭并重开恢复，不能继续在未知状态上接受新操作。若追加成功但 flush 失败，调用者仍要按失败处理并重开；重新读取才能知道提交边界上的结果，不能通过盲目重试制造重复业务操作。

(sparse-index)=
## 稀疏索引先找块，再在块内找键

SSTable 按字符串键排序，每隔若干条记录保存一个边界键与文件偏移。点查先二分边界，再从目标块扫描；内存不保存全部值。键比较采用 Python 字符串顺序，课程示例把数字补零，避免 `key-10` 排在 `key-2` 前带来的误解。

:::{slide}
```text
稀疏索引：key-000000→0, key-000016→offset16, ...
查询 key-000021：二分定位offset16 → 只读对应范围
```
:::

块越大，索引越小，但一次点查可能扫描更多记录。块越小，索引更大，定位更细。这是可测的空间与读放大权衡，不存在对所有设备和负载最优的固定块大小。生产 LevelDB 使用更复杂的块布局；参考它的 [table format](https://github.com/google/leveldb/blob/main/doc/table_format.md) 对照本课简化格式。

(sparse-implementation)=
## 实现：二分索引后从文件读块

:::{hints}
slides: { zoom: 0.78 }
:::

`bisect_right` 找到不大于目标键的最后一个块边界。Bloom 与键范围检查先排除无需读取的表，再定位文件块；读到等于目标的键就返回，超过目标或读完该块即可判这张表未命中。选择最新表的顺序在外层 `get`；返回值仍来自文件。

::::{only} web, slides
```{code-ref} symbol:code/lsm.py#LSMStore._find
```
::::

把 `block_records` 从 16 改为 4，预测索引条目数、单次块内扫描量与文件元数据大小怎样变化。修改参数后的结果要作为新实验保留，不能覆盖本课已经固定源码哈希的正式结果。

(manifest-commit)=
## flush 的提交点在 manifest

不能先清 WAL 再写 SSTable：崩溃会让数据从两处同时消失。`sync="fsync"` 时先写完并同步新表，再原子发布包含新表及恢复水位的 manifest；只有发布成功后，旧 WAL 前缀才可以回收。`none` 沿用文件发布顺序，但不承诺断电后的持久性。

:::{slide}
:reveal: items
- 新 SSTable 完整落盘
- manifest 原子发布文件集合与 flushed sequence
- 后续恢复跳过已被表覆盖的 WAL 序号
- 最后清理旧日志与未引用文件
:::

manifest 是逻辑上“哪些表属于数据库”的事实来源。目录里多出来的临时文件或尚未发布的新表不能自动被当成有效数据；反过来，manifest 引用的表缺失必须报错。故障测试分别停在发布前后，验证重启只看到完整状态。

::::{only} web
```{code-ref} symbol:code/lsm.py#LSMStore._replace_manifest
```
::::

::::{only} notebook
```python
lsm_path = notebook_data / "lsm"
with LSMStore(lsm_path, sync="none") as database:
    database.write_batch([("put", "key-000001", 10), ("put", "key-000002", 20)])
    database.flush()
with LSMStore(lsm_path, sync="none") as reopened:
    assert reopened.get("key-000001") == 10
    print("LSM重开查询:", list(reopened.scan("key-000001", "key-000003")))
```
::::

(flush-implementation)=
## 实现：清 WAL 必须晚于 manifest 提交

:::{hints}
slides: { zoom: 0.78 }
:::

先停在 `before_manifest`，再停在 `after_manifest`。两种退出位置的恢复结果应相同，但恢复证据不同：前者靠旧表加 WAL，后者靠已发布的新表并跳过重复日志。

::::{only} web, slides
```{code-ref} symbol:code/lsm.py#LSMStore.flush
```
::::

没有把 `truncate(0)` 提前，是为了避免持久化证据形成空窗。课堂可以让学生提出错误的重排，再用 `verify_lsm.py` 中的真实子进程故障点验证；不要在正式 benchmark 使用的冻结实现里直接实验。
