# 代码引用与执行

先问清读者需要看什么：真实仓库中的某段代码、构建时的固定结果，还是可以修改后运行的示例。沿用文稿已有的环境配置，不为简单例子引入额外后端。

## 引用真实代码

列出 `@lincyaw/slidev-addon-code`，用 `{code-ref}`。锚点路径从文稿所在 git 仓库的根目录写起；不在 git 中时才从文稿目录写起。

- 有人工标记的区域用 `region:src/bpe.py#merge`。
- 引用声明用 `symbol:src/bpe.py#Tokenizer.encode`。
- 需要固定讲解版本时用 `:pin: <提交>`，否则读取工作区代码。

完整写法、分步高亮与多版本比较见 [指令参考](directives.md) 的 `{code-ref}`。引用的提交也必须在这个仓库中。

锚点“丢失”时先查文件与区域；“模糊”时检查候选是否正确。确认后用 `presmium check --update-lock` 更新锁文件。锁定版本与工作区发生漂移时，先读差异，再决定更新 `:pin:` 还是保留旧版。

## 选择执行时机

列出 `@lincyaw/slidev-addon-exec`。代码块加 `:run: compile` 在编译时运行，`:run: live` 由读者点击运行，`:run: both` 两者都要；单独写 `:run:` 是编译时运行。

````md
```{code} python
:run: both
print(sum([1, 2, 3]))
```
````

网页给现场代码显示运行按钮；幻灯片中的 Python、JavaScript、TypeScript 使用 Monaco Runner。执行面板适合带参数的例子，分步执行适合解释运行过程，写法查 [指令参考](directives.md)。

浏览器 Python 使用 Pyodide，现有内置运行环境只有标准库；依赖 numpy、matplotlib 等的例子优先用编译时输出，或选择合适的远端环境。C、C++、Ruby、SQL 可用 `@lincyaw/slidev-addon-exec-wasi`，其运行时会增加发布体积。GPU 和远端内核只在任务需要时配置。

## 让前后代码共享变量

需要“先训练、再编码”时，为相关块写相同的 `:session:`。这些块必须使用同一执行环境；前面的块改动会使后续会话录制重新生成。浏览器中需按顺序运行，“重置会话”清空解释器状态。

不共享状态的例子不加会话。一次运行写的文件不应被当作下一次独立运行的前提。

## 使用具名环境

头部 `execute.environments` 声明环境，代码用 `:env: <名字>` 选择；`execute.env` 可指定默认环境。选择了环境却不可用时不自动换执行器，有录制就显示录制。

环境的配置、提供插件与示例见 [指令参考](directives.md) 的 `{local-env}`、`{terminal}` 与代码指令。凭据放环境变量，例如 `PRESMIUM_ENV_<名>_TOKEN`，不写进文稿。用 `presmium check --env` 验证实际连接。

## 输出不对时检查什么

编译会发生在 `check`、`ir`、`build`、`dev` 中，可能执行代码并更新 `.presmium/freeze/`。代码没变时沿用录制；没有运行环境时也能用已有录制。默认沿用其他环境的录制并警告，确实需要重跑时才设 `execute: { rerun: environment }`。

先区分“旧录制”“执行失败”“环境不可用”。检查代码、参数、会话顺序和诊断；不要先删除缓存。超时优先改例子，必要时用 `:timeout:` 调整。

富输出可显示图、表等内容；`:echo: false` 只显示输出。组件拥有的代码由组件运行，不再附加一套运行控件。执行面板失败时可显示 `:recorded:` 的预录输出。

交付前检查目标媒介里的结果，确认未把本机路径、环境变量或教师内容写进输出。复现所需的录制文件见 [发布与复现](publishing.md)。
