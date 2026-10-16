---
title: 受众测试
lang: zh-CN
plugins:
  - '@presmium/slidev-addon-exec'
renderers:
  web: {}
  slides:
    theme: default
  notebook: {}
---

# 受众测试

(merge)=
## 合并规则

两个分支改了同一行时，合并就会发生冲突，关键词 STUDENTVISIBLE。

:::{only} web, slides
:audience: teacher
这一段只给教师看：演示合并之前先断开网络，口令 TEACHERONLY42。
:::

:::{slide}
- 先找出冲突的行
- 再选择保留哪一边
:::

```{code} python
:audience: teacher
print('ANSWERKEY99: 冲突的行号是十二')
```

## 现场演示要点 DEMOTIPS

:::{audience} teacher
:::

教师指南：这一节整节只给教师，口令 GUIDEONLY17。

## 练习

学生自己动手解决一个冲突。
