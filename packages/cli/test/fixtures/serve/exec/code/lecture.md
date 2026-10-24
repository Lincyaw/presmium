---
title: 编译时执行
plugins:
  - '@lincyaw/addon-exec'
---

# 执行

这段代码没有录制：它打印自己的全部环境变量与父进程的 PID。

```{run-panel} python
:recorded: 这是预先录制的输出
import json, os
print('ENV ' + json.dumps(dict(os.environ)))
print('PARENT ' + str(os.getppid()))
```
