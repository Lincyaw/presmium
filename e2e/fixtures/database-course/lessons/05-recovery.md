# 单元 5：故障是输入，不是偶然事件

(recovery-boundary)=
## 恢复器必须区分半帧与损坏帧

文件末尾只剩半个帧头或负载短于声明长度，说明最后一条记录未写完，可以截断到上一条有效边界。长度足够却 CRC 不匹配是完整帧损坏，必须拒绝打开。不能为了“自动恢复”跳过它，否则损坏可能被悄悄掩盖。

:::{slide}
| 观察到的文件状态 | 恢复动作 |
|---|---|
| 完整且校验通过 | 原子重放整批 |
| 文件末尾帧不完整 | 截断到最后有效边界 |
| 完整帧 CRC/结构无效 | 明确报损坏 |
:::

如果长度字段本身损坏并伪装成一个未完成尾帧，单个长度加 CRC 的格式仍有识别边界。这是后续增加 magic、头部校验、序号和冗余元数据的理由；本课不会把简单格式说成能修复任意磁盘损坏。

(recovery-lab)=
## 实验：让写入进程真的异常退出

`verify.py` 使用独立子进程写库，再以 `os._exit` 退出，恢复由全新的进程执行。还会在合法前缀后的帧头、负载等多个代表位置截断新批次，并检查整个新批次要么全部出现、要么全部不出现。

```bash
python3 code/verify.py
python3 code/verify_lsm.py
```

:::{slide}
:reveal: items
- 进程退出：没有执行正常 `close`
- 半帧：新批次不能只应用一半
- 完整损坏帧：报错，保留现场
- 删除后恢复与压缩：旧值不能复活
:::

进程崩溃不等于掉电：内核页缓存仍然存在。测试通过说明实现守住了这些故障点的不变量；并不证明所有文件系统、设备故障和真实掉电都安全。要测试断电语义，需要受控文件系统故障模拟或专门设备实验。

(recovery-implementation)=
## 实现：只截断不完整的尾帧

:::{hints}
slides: { zoom: 0.9 }
:::

对照读取器返回的有效结束偏移与实际文件长度。只有成功解析的前缀可以重放；完整损坏帧会在解析阶段抛出错误，不能进入截断分支。

::::{only} web, slides
```{code-ref} region:code/engine.py#recover-tail
```
::::

(recovery-exercise)=
## 动手判断：这个恢复器会丢数据吗？

下面的浏览器练习只判断边界，不执行真实损坏注入；完整磁盘实验在上述验证脚本中。将状态判定写对后，说明为什么不能把所有解码异常都当成 EOF。

````{exercise} python
实现 `recovery_action(header_bytes, expected_payload, actual_payload, crc_ok)`。帧头必须是 8 字节。帧头不足或负载短于声明长度时返回 `"truncate-tail"`；完整帧校验失败返回 `"corrupt"`；其余返回 `"apply-batch"`。输入已保证是文件最后一个候选帧。

```python
def recovery_action(header_bytes, expected_payload, actual_payload, crc_ok):
    return "apply-batch"
```

```python
assert recovery_action(3, 20, 0, False) == "truncate-tail", "半帧头"
assert recovery_action(8, 20, 9, False) == "truncate-tail", "半负载"
assert recovery_action(8, 20, 20, False) == "corrupt", "完整损坏帧不能跳过"
assert recovery_action(8, 20, 20, True) == "apply-batch", "完整批次"
```
````

作业：增加一条“中间帧 CRC 损坏、后面还有正常帧”的测试，要求恢复器拒绝打开，并验证原文件未被改写。再讨论为什么备份、校验和与恢复策略需要分开设计。
