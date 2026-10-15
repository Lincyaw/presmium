---
layout: two-cols
presmium:
  # 两种形态的地址（端到端测试使用的端口），供形态互跳的链接使用
  presmium.web:
    slidesUrl: http://localhost:4173
    webUrl: http://localhost:4174
---

# 网页形态

《{{ $slidev.configs.title }}》也是一份网页：每页幻灯片成为一个章节，备注成为正文。

- 侧边目录、页内大纲、前后翻页
- 全文搜索覆盖标题、正文、备注与代码
- 幻灯片与网页一键互跳：本页是第 {{ $page }} 页

::right::

```ts {2}
// 文稿转换：每页幻灯片生成一个网页章节
const webDocument = toWebDocument(deck)
for (const page of webDocument.pages) writePage(page)
```

<div doc-only>网页中才有的补充说明：转换在构建时完成，网页与幻灯片来自同一份源码。</div>

<div slide-only>幻灯片中才有的提示：按导航栏的文档按钮在网页中阅读本页。</div>

<!--
网页形态的正文来自讲稿：讲稿即正文，读者不看幻灯片也能读懂这一节。在本地生成网页形态：

```sh
pnpm demo:web
```

搜索框支持中文分词，断网后也能检索。
-->

---
presmium:
  web:
    layout: scrolly
---

# 滚动叙事

<v-clicks>

- 解析：用 Slidev 解析器读取文稿
- 转换：每页生成一个网页章节
- 构建：VitePress 生成静态站点

</v-clicks>

<PmDemoStepper />

<!--
滚动叙事式的页面：幻灯片固定在一侧，正文在另一侧滚动，步骤随滚动推进。

[click] 第一步，解析文稿。网页形态与幻灯片形态读取同一份 Markdown。

[click] 第二步，转换章节。每页幻灯片对应一个网页章节，章节锚点保持稳定。

[click] 第三步，构建站点。搜索索引在构建时生成，随网页一起发布。
-->
