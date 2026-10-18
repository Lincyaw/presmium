---
title: BPE 分词
lang: zh-CN
plugins:
  - '@presmium/slidev-addon-core'
  - '@presmium/slidev-addon-stage'
  - '@presmium/slidev-addon-code'
  - '@presmium/slidev-addon-exec'
  - '@presmium/slidev-addon-exec-wasi'
  - '@presmium/slidev-addon-exec-webgpu'
  - '@presmium/slidev-addon-guide'
  - '@presmium/slidev-addon-content'
  - '@presmium/slidev-addon-publish'
  - '@presmium/slidev-addon-session'
  - '@presmium/slidev-addon-classroom'
  - '@presmium/slidev-addon-lecture'
  - '@presmium/slidev-addon-speech'
  - '@presmium/slidev-addon-assistant'   # 读者问答：“提问”
presmium:
  presmium.code:
    repo: https://github.com/Lincyaw/presmium
renderers:
  web: {}
  slides: {}
  notebook: {}
  # 讲授：把讲解合成为语音讲授。默认不构建（`pnpm demo:build` 只构建上面三种）；配置火山引擎后
  # 写上音色，例如 { voice: { engine: volcengine, voice: zh_female_xiaohe_uranus_bigtts } }，
  # 见 examples/demo/README.md。
  lecture: {}
---

(cover)=
# BPE 分词：从字节到词元

:::{slide}
**面向初学者**：BPE 的思路、手算过程与 Python 实现
:::

语言模型读到的不是文字，而是一串整数。把文字切成小块、再给每一块编号，这一步叫作**分词**（tokenization），切出来的小块叫作**词元**（token）。{say alias="B P E"}`BPE`（Byte Pair Encoding，字节对编码）是今天最常用的分词方法之一，GPT 系列和许多开源模型都用它。

这一课从零讲起：先说明为什么需要分词，再在一个小例子上手算 BPE，然后用几十行 Python 实现训练、编码与解码，最后把同样的统计交给 C 程序和 GPU 来做。你只需要能读懂简单的 Python。讲义里的示例可以直接在浏览器中运行，不用安装任何软件。

```{include} pages/tokens.md
```

```{include} pages/idea.md
```

```{include} pages/implement.md
```

```{include} pages/encode.md
```

```{include} pages/extend.md
```

```{include} pages/wrapup.md
```
