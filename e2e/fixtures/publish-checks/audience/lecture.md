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

::::{tab-set}
:::{tab-item} 学生
学生的选项卡：先读冲突标记。
:::
:::{tab-item} 教师
:audience: teacher
教师的选项卡：按三条标准评分 TABKEY31，见脚注[^tab]。

[^tab]: 选项卡的脚注写着评分细则 TABFOOT36。
:::
::::

:::{note}
:audience: teacher
教师的提示：先演示一次失败的合并，见脚注[^note]。

[^note]: 提示的脚注写着失败的原因 NOTEFOOT47。
:::

:::{dropdown} 教师的折叠
:audience: teacher
折叠里是讲评的顺序，见脚注[^drop]。

[^drop]: 折叠的脚注写着讲评的顺序 DROPFOOT53。
:::

:::::{note}
合并之前先拉取最新的提交。

:::{tip}
:audience: teacher
提醒学生留意行尾空白的差异 TIPKEY58。
:::
:::::

::::{grid} 2
:::{card} 冲突标记
两组尖括号之间就是冲突的内容。
:::
:::{card} 讲评
:audience: teacher
讲评时展示三个常见的错误 CARDKEY64。
:::
::::

1. 运行 `git status` 找出冲突的文件
2. 打开冲突的文件

   ```{code} python
   :audience: teacher
   print('LISTKEY72: 答案在第十二行')
   ```

```{include} handbook.md
:audience: teacher
```

## 现场演示要点 DEMOTIPS

:::{audience} teacher
:::

教师指南：这一节整节只给教师，口令 GUIDEONLY17。

## 练习

学生自己动手解决一个冲突。
