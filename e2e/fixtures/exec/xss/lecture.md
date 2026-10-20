---
title: 不可信的输出
lang: zh-CN
plugins:
  - '@lincyaw/slidev-addon-core'
  - '@lincyaw/slidev-addon-exec'
  - ./evil
renderers:
  slides:
    theme: default
---

# 不可信的输出

:::{slide}
e2e/exec.spec.ts 的测试文稿：测试插件的执行器替 Pyodide 运行 Python，返回的图片输出在数据中带引号与事件处理器（第 11 节“不可信的富输出”）。
:::

(evil-image)=
## 带引号的图片数据

```{code} python
:run: live
print("the fixture's executor answers instead")
```
