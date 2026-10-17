---
title: 跟随与受众
lang: zh-CN
plugins:
  - '@presmium/slidev-addon-core'
  - '@presmium/slidev-addon-session'
  - '@presmium/slidev-addon-classroom'
renderers:
  web: {}
  slides:
    theme: default
---

(follow-cover)=
# 跟随与受众

:::{slide}
e2e/session.spec.ts 的测试文稿（D-4，F-85）：主讲用完整构建，学习者用学生构建，网页与幻灯片两种形态。
:::

教师专用的一节在前，所以两种构建给章节的序号不同；学习者按章节 ID 跟随主讲。

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

合并规则的讲解。

(follow-ask)=
## 提问

```{question-box}
哪里还不清楚？
```

有问题就在这里提。
