---
title: 发布检查
lang: zh-CN
checks:
  forbid: ['T-\d{3}', 'instructor/']
renderers:
  web: {}
  slides: {}
  notebook: {}
---

# 发布检查

## 链接

正文链接到 [起始代码](starter.py)，这个文件存在。

数据在 [数据表](data/missing.csv) 中，这个文件不存在。

回到 [不存在的章节](#nowhere)。

下一节是 [表格](#tables)，之后读 [另一份讲义](other/lecture.md#later)，外部资料在 [MyST 的文档](https://mystmd.org/guide)。

(tables)=
## 表格

```{csv-table} 成绩
:file: grades.csv
```

## 只在一种媒介中

:::{only} web
(web-note)=
网页中才有的补充说明。
:::

:::{only} slides
幻灯片中指向 [网页的补充说明](#web-note)。
:::

## 内部编号

这个修改来自任务 T-123，发布前要删掉。
