(exec-panel)=
## 执行面板

代码在浏览器中运行：Python 由 Web Worker 中的 Pyodide 执行，运行时文件随文稿一起发布，不依赖 CDN。

```{run-panel} python
:params: {n: 5}
def fib(k):
    a, b = 0, 1
    for _ in range(k):
        a, b = b, a + b
    return a

for i in range(1, n + 1):
    print(i, fib(i))
```

参数 `n` 作为变量注入程序。修改 n 后点“重跑”，右侧对比最近两次运行：参数的变化与输出的逐行差异。勾选运行记录可以换成任意两次对比。运行记录只保存在当前视图，不写回文稿。

(exec-isolation)=
## 互不影响的运行

::::{only} web, slides
```{code} python
:run: both
import sys
open("data.txt", "w").write("x")
sys.setrecursionlimit(60)
print("写好了 data.txt")
```

浏览器中的 Python 解释器在整个页面中只有一个。上面的代码写了一个文件，还把递归深度的上限降到 60；每次运行都在自己的工作目录中进行，结束后这些改动都会撤销。

```{code} python
:run: both
import os

def depth(n):
    return 0 if n == 0 else 1 + depth(n - 1)

print(os.path.exists("data.txt"), depth(100))
```

所以下面的代码在浏览器中运行，结果与编译时录制的一样：看不到 data.txt，递归 100 层也没有问题。

notebook 的单元格本来就共用一个解释器，所以这一节只在网页与幻灯片中出现。
::::

(exec-steps)=
## 分步执行

```{step-run} python
:steps: 12
total = 0
for n in range(1, 4):
    total += n
    print(f"n={n} total={total}")
print("done")
```

代码先在后台逐行追踪一遍，每执行一行就是一个步骤：前进一步高亮下一行，右侧显示到这一行为止的累计输出；后退时输出回到上一步。`:steps:` 声明执行的行数（12），所以从链接或刷新直接打开某一步时，显示的就是那一步。

(exec-fallback)=
## 预录输出回退

```{run-panel} python
:timeout: 1500
:run: live
:recorded: x = 1.4142135623730951（√2，预先录制）
x = 1.0
while True:  # 故意不设终止条件，演示超时
    x = (x + 2 / x) / 2
print("x =", x)
```

这段代码永远不会结束。超过 1.5 秒后执行被停止，面板显示预先录制的输出，并标注“预录输出 · 执行超时”。现场网络或运行环境出问题时，演示也能继续。

(exec-compile)=
## 编译时执行

```{code} python
:run: both
squares = [n * n for n in range(1, 6)]
print("平方：", squares)
print("合计：", sum(squares))
```

带 `:run:` 的代码在编译时由本机的 Python 执行，输出写入中间表示，随代码出现在网页、幻灯片与 notebook 中。结果按内容缓存在 `.presmium/freeze/`，代码不变就不再执行；缓存随文稿提交后，没有 Python 的机器也能构建出相同的输出。

`:run: both` 还让网页中的代码块带上“运行”按钮：读者在浏览器中用 Pyodide 重新运行它，输出替换录制的结果。
