(exec-local)=
## 本地环境

本页的代码片段属于旁边的 `workspace` 目录，那里的 `.devcontainer/devcontainer.json` 决定运行镜像。工作区由指令的 `:workspace:` 指定，相对于本文件。

```{local-env} python
:file: src/greet.py
:workspace: workspace
def greet(name):
    return f"你好，{name}"


print(greet("Presmium"))
```

“导出环境”在任何构建中都可用：编译时把片段、devcontainer 定义与运行说明打包成压缩包，随页面发布。用 Slidev 开发服务器放映生成的幻灯片（`.presmium/slides`）时，还可以在容器中运行修改后的代码，或把修改提交到新分支。

代码块同时写上 `:run:` 与 `:executor: presmium.container` 时，编译时在同一个镜像中执行，输出写入中间表示，与本机执行的输出一样出现在各种媒介中。
