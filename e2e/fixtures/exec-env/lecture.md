---
title: 执行环境测试文稿
lang: zh-CN
plugins:
  - '@presmium/slidev-addon-core'
  - '@presmium/slidev-addon-exec'
  - ./lab
execute:
  environments:
    lab: { kind: fixture-lab }
renderers:
  web: {}
  slides:
    theme: default
---

# 执行环境测试文稿

:::{slide}
e2e/exec-env.spec.ts 的测试文稿：具名环境、执行会话与富输出。
:::

(env-missing)=
## 未登记的环境

浏览器中没有插件登记环境 `lab` 的执行器：运行失败，显示编译时录制的输出与原因。

(in-lab)=
```{code} python
:run: both
:env: lab
print("这一行在浏览器中运行不了")
```

(session)=
## 执行会话

同一会话的两个代码块共享解释器：先运行定义 `x` 的一块，再运行使用它的一块。

(define)=
```{code} python
:run: live
:session: counter
x = 41
print("定义了 x")
```

(use)=
```{code} python
:run: live
:session: counter
print(x + 1)
```

(image)=
## 图片输出

(png)=
```{code} python
:run:
import struct, zlib
from IPython.display import Image, display

def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))

rows = b''.join(b'\x00' + b'\xd0\x40\x20' * 8 for _ in range(8))
png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 8, 8, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b'')
display(Image(data=png))
```

(table)=
## 生成的表格

下面的表格由代码生成，代码本身不显示。

(counts)=
```{code} python
:run:
:echo: false
from IPython.display import Markdown, display
counts = {"低": 3, "你好": 5}
rows = "\n".join(f"| {word} | {n} |" for word, n in counts.items())
display(Markdown("| 词 | 次数 |\n|---|---|\n" + rows))
```

(slides-live)=
## 幻灯片中的现场代码

(live-sum)=
```{code} python
:run: live
print(sum(range(10)))
```
