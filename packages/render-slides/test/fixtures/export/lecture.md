---
title: 静态导出
plugins:
  - ../../../../addon-core
  - ../../../../addon-exec
  - ../../../../addon-exec-local
  - ../../../../addon-classroom
renderers:
  slides:
    package: ../../..
    transition: none
---

# 静态导出

:::{slide}
交互组件在导出的 PDF 中显示它们的静态形式。
:::

## 执行面板

```{run-panel} python
:run: live
print("panel fallback")
```

## 本地环境

```{local-env} python
:file: hello.py
:workspace: .
print("local fallback")
```

## 课堂测验

```{quiz}
导出的测验显示什么？

- [ ] 一个按钮
- [x] 题目与选项
```
