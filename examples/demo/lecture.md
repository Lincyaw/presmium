---
title: BPE 分词
lang: zh-CN
plugins:
  - '@presmium/slidev-addon-core'
  - '@presmium/slidev-addon-stage'
  - '@presmium/slidev-addon-code'
  - '@presmium/slidev-addon-exec'
  - '@presmium/slidev-addon-guide'
  - '@presmium/slidev-addon-content'
  - '@presmium/slidev-addon-publish'
  - '@presmium/slidev-addon-session'
  - '@presmium/slidev-addon-classroom'
presmium:
  presmium.code:
    repo: https://github.com/presmium/presmium
renderers:
  web: {}
  slides:
    theme: default
  notebook: {}
---

(cover)=
# BPE 分词：从字节到词元

:::{slide}
**面向初学者**：BPE 的思路、手算过程与 Python 实现
:::

语言模型读到的不是文字，而是一串整数。把文字切成小块、再给每一块编号，这一步叫作**分词**（tokenization），切出来的小块叫作**词元**（token）。BPE（Byte Pair Encoding，字节对编码）是今天最常用的分词方法之一，GPT 系列和许多开源模型都用它。

这一课从零讲起：先说明为什么需要分词，再在一个小例子上手算 BPE，最后用几十行 Python 实现训练、编码与解码。你只需要能读懂简单的 Python。讲义里的示例可以直接在浏览器中运行，不用安装任何软件。

```{include} pages/tokens.md
```

```{include} pages/idea.md
```

```{include} pages/implement.md
```

```{include} pages/encode.md
```

```{include} pages/wrapup.md
```
