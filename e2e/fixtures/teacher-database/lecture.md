---
title: 从零写一个 Python 数据库
lang: zh-CN
plugins:
  - '@lincyaw/slidev-addon-core'
  - '@lincyaw/slidev-addon-code'
  - '@lincyaw/slidev-addon-exec'
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

# 从零写一个 Python 数据库

这堂课从空字典开始，逐步做出可以更新、删除和重启恢复的键值数据库。只使用 Python 标准库。网页中可以修改代码运行，notebook 可以从上到下重新执行。

:::{slide}
:reveal: items
- 先实现 `put` 和 `get`
- 再用追加日志保留修改历史
- 最后写入文件，并从日志恢复
:::

(memory)=
## 第一步：内存里的键值表

先不讨论磁盘。请同学说出写入和查询的输入、输出，再依次讲状态、写入、读取。源文件与投影共用同一份代码，修改 Python 文件后，引用跟着更新。

```{code-ref} region:code/database.py#memory
:steps: state, write, read
:run: both
:session: teacher-db
```

第 0 步先画出一个空字典，强调数据库必须先有保存状态的地方。

第 1 步实现写入：同一个键再次赋值会覆盖旧值。

第 2 步实现查询：不存在的键返回 `None`。现场先运行这一块，后面的代码才能使用这些函数。

(evolution)=
## 第二步：覆盖写，还是追加写？

先回到刚才的实现，再推进一步替换成追加写。后退时应恢复原来的实现，便于比较两种思路。

::::{slide}
:at: 0
:until: 1
```{code} python
rows = {}

def put(key, value):
    rows[key] = value
```
::::

::::{slide}
:at: 1
```{code} python
log = []

def put(key, value):
    log.append((key, value))
```
::::

:::{slide}
:at: 1
覆盖写只保留当前值；追加写保留每次修改，需要从后往前查。
:::

(append-log)=
## 第三步：日志成为唯一的状态

我们保留相同的函数名，改用日志保存状态。按顺序运行到这里后，共享会话中的 `put` 和 `get` 就会被新定义替换。

```{code-ref} region:code/database.py#append-only
:steps: log-state, append, lookup
:run: both
:session: teacher-db
```

先创建空日志。这里刻意重置状态，重新运行本块可以回到这一节的起点。

写入只追加，不覆盖。追加的最后一条记录是最近一次写入。

查询倒序扫描，在遇到第一个相同的键时返回；都没找到才返回 `None`。

(shared-session)=
## 第四步：继续操作同一个数据库

这里没有复制上一节的定义。先运行“日志成为唯一的状态”，再运行本块；教师与每个学生的浏览器各有自己的会话。重置会话后需要重新运行初始化。

```{code} python
:run: both
:session: teacher-db
put("Lin", 7)
put("Ada", 12)
print("history:", log)
print("Ada:", get("Ada"))
print("missing:", get("Grace"))
```

(predict-update)=
## 第五步：先预测，再运行

先读代码，暂时不要按运行。`put` 在相同的会话中保留数据，推断最后一次写入会不会改变已经记录的历史。

::::{only} web, slides
```python
put("Ada", 15)
print(get("Ada"), len(log))
```
::::

:::{predict} 顺序运行到这里，输出会是什么？
:choices: 10 1, 12 3, 15 4
日志已经有 Ada=10、Lin=7、Ada=12 三条记录。
:::

::::{slide}
:reveal:
```{code} python
:run: both
:session: teacher-db
put("Ada", 15)
print(get("Ada"), len(log))
```
::::

答案是 `15 4`。查询返回最新值，但日志仍然保留前三条记录。再次运行会再追加一条，因此记录数会继续增长；要重做整堂演示，重置会话后按顺序运行。

(trace-lookup)=
## 第六步：逐行看查询为什么返回最新值

这是独立的小实验，不依赖前面的共享会话。前进到 `print` 才出现输出，后退则恢复到此前的行和输出。

```{step-run} python
:steps: 7
lookup_log = [("Ada", 10), ("Ada", 15)]
found = None
for key, value in reversed(lookup_log):
    if key == "Ada":
        found = value
        break
print(found)
```

(delete)=
## 第七步：删除也是一条记录

我们约定 `None` 是删除标记，暂不把它作为合法数据。解释这个限制后再加删除函数，不要让学生以为这个小数据库已经支持所有 Python 值。

```{code-ref} symbol:code/database.py#delete
:run: both
:session: teacher-db
```

```{code} python
:run: both
:session: teacher-db
delete("Lin")
print("Lin:", get("Lin"))
print("last record:", log[-1])
```

(disk)=
## 第八步：写入磁盘，再重启恢复

这个实验使用临时目录，文件确实被写入并重新打开。现场修改更新次数，再比较历史记录数与最终值。临时文件会清理，不会把教师机器的路径放进输出。

```{run-panel} python
:params: {updates: 3}
import json
from pathlib import Path
from tempfile import TemporaryDirectory

with TemporaryDirectory() as directory:
    path = Path(directory) / "database.jsonl"
    with path.open("w", encoding="utf-8") as file:
        for value in range(updates):
            file.write(json.dumps(["Ada", value]) + "\n")
    recovered = {}
    with path.open(encoding="utf-8") as file:
        records = [json.loads(line) for line in file]
    for key, value in records:
        recovered[key] = value
    print("records:", len(records))
    print("recovered Ada:", recovered.get("Ada"))
```

(exercise)=
## 动手：补上倒序查询

现在把查询函数交给学生。练习独立于教师会话，可以在网页中修改提交，也可以在 notebook 中完成后运行校验。

````{exercise} python
实现 `latest(records, wanted)`：返回最后一条匹配记录的值，没有匹配时返回 `None`。最新值为 `None` 时也要立即返回，不能越过删除标记读到旧值。

```python
def latest(records, wanted):
    return None
```

```python
assert latest([("Ada", 10), ("Ada", 15)], "Ada") == 15, "返回最新值"
assert latest([("Ada", 10)], "Lin") is None, "找不到时返回 None"
assert latest([("Ada", 10), ("Ada", None)], "Ada") is None, "删除标记不能被越过"
```
````

(classroom)=
## 课堂检查：它离真正的数据库还差什么？

```{quiz}
对于刚才的实现，哪些说法正确？

- [x] 追加记录后，日志可能有同一个键的多个版本。
- [ ] 用文件保存后，就自动支持多进程同时安全写入。
- [x] 不处理写到一半的日志行，重启恢复可能报错。
```

```{question-box}
你最想继续实现索引、事务，还是崩溃恢复？写下一个具体问题。
```

```{pulse} 你能独立实现 put、get 和日志恢复了吗？
:levels: 可以, 还要再跟着做一遍, 需要帮助
```

::::{only} web, slides, notebook
:audience: teacher
教师备课：演示代码没有并发控制、事务提交和损坏恢复；下一课可以让同学中途截断最后一行 JSON，观察恢复失败，再设计“仅忽略末尾不完整记录”的协议。
::::
