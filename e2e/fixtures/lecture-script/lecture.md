---
title: 脚本化讲授测试文稿
lang: zh-CN
plugins:
  - '@lincyaw/addon-guide'
  - '@lincyaw/addon-lecture'
  - '@lincyaw/addon-speech'
renderers:
  web:
    port: 5324
  lecture:
    voice: { engine: fake, voice: alpha }
---

(intro)=
# 脚本化讲授测试文稿

e2e/lecture-script.spec.ts 的测试文稿：讲解由假引擎合成为讲授，也可以录制讲授并转写。

(merge)=
## 合并

(code-1)=
```python
def merge(ids, pair, idx):
    out = []
    i = 0
    return out
```

我们先看 {cue to=code-1 lines=2-3}`spot` 这两行代码，{say alias="B P E"}`BPE` 的词表就这样长出来。

(end)=
## 结尾

最后一节。
