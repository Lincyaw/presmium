(publish)=
## 发布

:::{hints}
slides: { class: pm-publish, routeAlias: publish }
:::

:::{slide}
**导出**：`presmium-export` 把幻灯片渲染端生成的 Slidev 文稿导出为 PDF，并校验 PDF 中的超链接都还在，例如这段代码的永久链接：[sample-repo/src/math.py#L1-L3 @ 3f2a9c1](https://github.com/presmium/presmium/blob/3f2a9c1/examples/sample-repo/src/math.py#L1-L3)
:::

```py
# 两数相加
def add(a, b):
    return a + b
```

导出：`pnpm --filter presmium-demo exec presmium-export . --output demo.pdf`。代码引用插件生成的永久链接同样会被校验。

:::{slide}
**离线**：两种形态的构建产物都带 Service Worker，打开过一次之后断网也能放映；远程图片（例如 PlantUML 图）在编译时下载到文稿的 `.presmium/assets`。

**高对比度**：开关把内容（含各插件的组件）换成两色配色，所有文字的对比度达到 WCAG AA，步骤状态保持不变。
:::

:::{component} PmContrastToggle
:::

高对比度开关也在幻灯片的导航栏中（◐）。

:::{slide}
**可视化差异**：`presmium-diff <refA> <refB>` 逐页截图比较两个提交的幻灯片，列出有差异的页。
:::

可视化差异：`pnpm --filter presmium-demo exec presmium-diff HEAD~1 HEAD`，报告写在 `.presmium/diff/report.md`。
