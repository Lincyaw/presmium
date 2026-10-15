---
title: 引用的代码
plugins:
  - ../addons/sample
presmium:
  sample:
    banner: banner.txt
---

## 问候

```{anchor} line:greet.py#def greet
```

上面引用的一行来自 greet.py；编辑或提交它，开发服务器随即重新编译。

```{motto} motto.txt
```

格言与横幅由插件自己读取并声明，编辑它们同样触发重新编译。
