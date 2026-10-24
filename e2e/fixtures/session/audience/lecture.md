---
title: 跟随与受众
lang: zh-CN
plugins:
  - '@lincyaw/addon-core'
  - '@lincyaw/addon-session'
  - '@lincyaw/addon-classroom'
renderers:
  web: {}
  slides:
    theme: default
---

(follow-cover)=
# 跟随与受众

:::{slide}
e2e/session.spec.ts 的测试文稿：主讲用完整构建，学习者用学生构建，网页与幻灯片两种形态。
:::

教师专用的一节在前，所以两种构建给章节的序号不同；学习者按章节 ID 跟随主讲，按块 ID 求得步骤。

(follow-plan)=
## 教学安排

:::{audience} teacher
:::

教师专用：先讲合并规则，再请学生说出下一次合并哪一对。

(follow-rules)=
## 合并规则

:::{slide}
每一轮合并出现次数最多的相邻一对。
:::

合并规则的讲解。教师专用的一步在前，所以两种构建给这一节之后的步骤的步号也不同。

:::{slide}
:reveal:
:audience: teacher
教师提示：翻到下一步之前，先请学生猜。
:::

:::{slide}
:reveal:
第一步：数出每一对相邻符号。
:::

:::{slide}
:reveal:
第二步：合并出现最多的一对。
:::

(follow-ask)=
## 提问

:::{audience} student
:::

```{question-box}
哪里还不清楚？
```

有问题就在这里提。这一节只给学生，两种构建中都有。

(follow-answers)=
## 答疑记录

:::{audience} teacher
:::

教师专用：课后整理学生的提问。学生版没有这一节，学习者停在它之前、学生版也有的一节，即只给学生的提问。
