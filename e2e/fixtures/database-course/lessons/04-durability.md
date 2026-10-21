# 单元 4：提交、同步与原子批次

(sync-contract)=
## 写入返回时，数据到底到了哪里？

`write` 返回通常只说明操作系统接收了数据；它与存储设备经断电后还能保留数据不是同一层保证。本课把 `sync="none"` 和 `sync="fsync"` 分成两组测量，绝不把关闭同步的吞吐提升当成同等持久性下的优化。

:::{slide}
```text
Python → 内核页缓存 → 文件系统/设备队列 → 持久介质
                     fsync 请求同步边界
```
:::

`fsync` 的实际断电语义依赖操作系统、文件系统与设备正确实现；macOS 的普通 `fsync` 也不能自动等同于最强硬件缓存刷新。本课测试真实调用、进程异常退出和文件损坏，不能声称做了物理断电测试。SQLite 的 [原子提交说明](https://www.sqlite.org/atomiccommit.html) 解释了文件同步、目录操作和硬件假设为何都是协议的一部分。

(atomic-batch)=
## 转账需要一条提交边界

把 `Ada -= 10` 与 `Lin += 10` 分别调用两次 `put`，崩溃可以只留下第一笔。`write_batch` 将两项更新放进同一个校验帧；恢复时只有整帧验证成功，才应用其中所有操作。

::::{only} web, slides
:::{slide}
```python
database.write_batch([
    ("put", "Ada", 90),
    ("put", "Lin", 110),
])
```
:::
::::

这里只承诺批次的原子应用，调用者必须自己取得旧值并计算新值。它没有解决并发读写、丢失更新或快照隔离，因此还不是完整的 ACID 事务系统。一个进程中也不能在失败后继续使用不确定的状态而不处理异常。

::::{only} notebook
```python
batch_path = notebook_data / "batch.log"
with IndexedLogStore(batch_path, sync="fsync") as database:
    database.write_batch([("put", "Ada", 100), ("put", "Lin", 100)])
    database.write_batch([("put", "Ada", 90), ("put", "Lin", 110)])
with IndexedLogStore(batch_path, sync="fsync") as reopened:
    assert reopened.get("Ada") + reopened.get("Lin") == 200
    print("重开后的余额:", list(reopened.scan()))
```
::::

(group-commit)=
## 一次同步提交 1 个操作，还是 32 个操作？

在相同的 `fsync` 策略下比较逐条提交与每批 32 条。两者最终数据相同，同步调用数不同；吞吐可能提高，但整批要等到提交结束才能确认，应用延迟、失败重试范围与最大批大小都变化了。

:::{predict} 把 320 次逐条提交改为 10 批，哪些结论成立？
:choices: 同步调用从320次变成10次, 每个请求延迟一定减少32倍, 可以安全省掉所有同步
先看提交确认的边界，再看 benchmark 的结果。
:::

:::{slide}
:reveal:
同步次数可以摊薄；耗时不保证按相同比例下降，等待组批的排队时间也不能从吞吐测试中凭空消失。
:::

本课实现的是显式原子批次，不是有定时器和多个并发客户的后台 group commit。实验表把这一点写清楚：它测批次执行成本，不包含真实服务的请求排队分布。

::::{only} web, slides
```{code-ref} symbol:code/engine.py#_sync
```
::::
