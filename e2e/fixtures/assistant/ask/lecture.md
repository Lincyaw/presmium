---
title: 读者提问测试文稿
plugins:
  - '@lincyaw/slidev-addon-core'
  - '@lincyaw/slidev-addon-assistant'
renderers:
  web: {}
---

# 读者提问测试文稿

e2e/ask.spec.ts 的测试文稿：学生版站点中，读者用自己的模型服务提问。

(code)=
# 代码

(merge)=
## 合并规则

每一轮合并出现次数最多的一对。

```python
def merge(tokens, pair):
    return [pair if t == pair else t for t in tokens]
```

```{note}
:audience: teacher
教师提示 TEACHER-HINT-42：先请学生猜下一次合并哪一对。
```

(teacher)=
## 教学安排

:::{audience} teacher
:::

教师专用的一节 TEACHER-SECTION-77：讲完合并规则再讲词表。

(later)=
# 进阶

(later-section)=
## 进阶内容

合并次数决定词表的大小。
