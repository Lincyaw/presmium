---
class: pm-publish
routeAlias: publish
---

# 发布

<div class="grid grid-cols-2 gap-x-10 gap-y-4 mt-4">
<div>

**导出**：`presmium-export` 封装 `slidev export`，导出后校验 PDF 中的超链接都还在，例如这段代码的永久链接：

[sample-repo/src/math.py#L1-L3 @ 3f2a9c1](https://github.com/presmium/presmium/blob/3f2a9c1/examples/sample-repo/src/math.py#L1-L3)

```py
# 两数相加
def add(a, b):
    return a + b
```

</div>
<div>

**离线**：构建产物带 Service Worker，预缓存文稿、媒体与 Pyodide 资源，远程资源与网页字体在构建时下载；打开过一次之后，断网也能放映。

**高对比度**：开关把幻灯片内容（含各插件的组件）换成两色配色，所有文字的对比度达到 WCAG AA。

<PmContrastToggle />

**可视化差异**：`presmium-diff <refA> <refB>` 逐页截图比较两个提交，列出有差异的页。

</div>
</div>

<!--
导出：`pnpm --filter presmium-demo exec presmium-export . --output demo.pdf`。代码引用插件生成的永久链接同样会被校验。

可视化差异：`pnpm --filter presmium-demo exec presmium-diff HEAD~1 HEAD`，报告写在 `.presmium/diff/report.md`。

高对比度开关也在导航栏中（◐）。
-->
