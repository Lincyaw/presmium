---
title: 查询结果与重置
lang: zh-CN
plugins:
  - '@lincyaw/addon-core'
  - '@lincyaw/addon-exec'
renderers:
  web: {}
  slides: { theme: default }
---

(query-results)=
## 查询结果

```{run-panel} python
:params: {age: 37}
import sqlite3
from IPython.display import HTML
db = sqlite3.connect(':memory:')
db.execute('create table teachers (name text, age integer)')
db.execute('insert into teachers values (?, ?)', ('Ada', age))
display(HTML('<table><tr><th>教师</th></tr><tr><td>Ada</td></tr></table>'))
db.execute('select name, age from teachers').fetchall()
```

(reset-session)=
## 从头演示

```{run-panel} python
:session: database
count = globals().get('count', 0) + 1
count
```
