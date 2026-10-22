---
title: 浏览器执行生命周期
lang: zh-CN
plugins:
  - '@lincyaw/slidev-addon-core'
  - '@lincyaw/slidev-addon-exec'
renderers:
  web: {}
---

(python-session)=
## Python 会话

```{run-panel} python
:run: live
:session: lifecycle
:params: {wait: false}
:timeout: 30000
import time
if wait:
    from js import console
    console.info("exec-python-wait-started")
    time.sleep(30)
count = globals().get('count', 0) + 1
print(count)
```

(queued-python)=
## 排队的 Python

```{run-panel} python
:run: live
print("queued-42")
```

(javascript)=
## JavaScript

```{run-panel} javascript
:run: live
:params: {value: 21}
console.log(value * 2)
```

(typescript)=
## TypeScript

```{run-panel} typescript
:run: live
:params: {value: 21, wait: false}
:timeout: 30000
if (wait) await new Promise(resolve => setTimeout(resolve, 30000))
const answer: number = value * 2
console.log(answer)
```
