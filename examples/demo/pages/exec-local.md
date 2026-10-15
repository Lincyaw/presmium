---
class: pm-exec-local
routeAlias: exec-local
presmium:
  presmium.execLocal:
    workspace: ../sample-repo
---

# 本地环境

<div class="grid grid-cols-[3fr_2fr] gap-8 mt-4">
<div>

<PmLocalEnv file="src/greet.py" lang="python">

```python
def greet(name):
    return f"你好，{name}"


print(greet("Presmium"))
```

</PmLocalEnv>

</div>
<div class="text-sm opacity-80">

用 `slidev dev` 放映时可用：

- **容器执行**：在 `examples/sample-repo/.devcontainer` 定义的镜像中运行，作为第二个 `executor` 实现注册
- **编辑回写**：把修改提交到新分支，当前分支与工作区不变
- **环境复刻**：片段与 devcontainer 定义打包下载

构建产物与网页形态中只显示代码。

</div>
</div>

<!--
本页的工作区由页 frontmatter 的 `presmium.execLocal.workspace` 指定为 `../sample-repo`（相对文稿目录），其中的 `.devcontainer/devcontainer.json` 决定运行镜像。

在开发服务器中先点“编辑”修改代码，再点“在容器中运行”，输出来自容器内的 Python。

“提交到新分支”生成 `presmium/edit-<时间>` 分支；“导出环境”下载包含片段、devcontainer 定义与运行说明的压缩包。
-->
