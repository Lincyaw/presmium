---
routeAlias: exec-monaco
---

# 浏览器内运行 Python

Monaco Runner 的 `python` 由 Pyodide 执行，代码可以现场修改后重跑。

```python {monaco-run}
import sys

print(f"Python {sys.version_info.major}.{sys.version_info.minor} 在浏览器中运行")
print("1 + 2 + … + 100 =", sum(range(1, 101)))
```

<!--
`{monaco-run}` 代码块打开本页时自动运行。Python 运行在 Web Worker 中的 Pyodide 里，运行时文件随文稿一起发布，不依赖 CDN。
-->

---
routeAlias: exec-panel
---

# 执行面板

<PmRunPanel :params="{ n: 5 }">

```python
def fib(k):
    a, b = 0, 1
    for _ in range(k):
        a, b = b, a + b
    return a

for i in range(1, n + 1):
    print(i, fib(i))
```

</PmRunPanel>

<!--
参数 `n` 作为变量注入程序。修改 n 后点“重跑”，右侧对比最近两次运行：参数的变化与输出的逐行差异。勾选运行记录可以换成任意两次对比。

运行记录只保存在当前视图，不写回文稿。
-->

---
routeAlias: exec-steps
---

# 分步执行

<PmStepRun :steps="12">

```python
total = 0
for n in range(1, 4):
    total += n
    print(f"n={n} total={total}")
print("done")
```

</PmStepRun>

<!--
代码先在后台逐行追踪一遍，每执行一行就是一个步骤：按右键前进一行，高亮当前行，右侧显示到这一行为止的累计输出。后退时输出回到上一步。

`steps` 声明执行的行数（12），追踪完成前本页就有这些步骤，所以从链接、刷新或下一页后退直接打开某一步时，显示的就是那一步。
-->

---
routeAlias: exec-fallback
---

# 预录输出回退

<PmRunPanel :timeout="1500" recorded="x = 1.4142135623730951（√2，预先录制）">

```python
x = 1.0
while True:  # 故意不设终止条件，演示超时
    x = (x + 2 / x) / 2
print("x =", x)
```

</PmRunPanel>

<!--
这段代码永远不会结束。超过 1.5 秒后执行被停止，面板显示预先录制的输出，并标注“预录输出 · 执行超时”。现场网络或运行环境出问题时，演示也能继续。
-->
