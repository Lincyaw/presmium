---
title: 助手端到端测试文稿
plugins:
  - '@lincyaw/slidev-addon-session'
  - '@lincyaw/slidev-addon-classroom'
  - '@lincyaw/slidev-addon-assistant'
renderers:
  web:
    port: 5363
---

# 助手端到端测试文稿

封面。

(code)=
# 代码

(merge)=
## 合并规则

每一轮合并出现次数最多的一对。

```python
def merge(tokens, pair):
    return [pair if t == pair else t for t in tokens]
```

(questions)=
## 课堂提问

合并之前先统计每一对出现的次数。

```{question-box}
有疑问就在这里提出。
```

(later)=
# 进阶

(later-section)=
## 进阶内容

合并次数决定词表的大小。
