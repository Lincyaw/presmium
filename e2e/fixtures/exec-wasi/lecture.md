---
title: WebAssembly 测试文稿
lang: zh-CN
plugins:
  - '@presmium/slidev-addon-core'
  - '@presmium/slidev-addon-exec'
  - '@presmium/slidev-addon-exec-wasi'
renderers:
  web: {}
---

# WebAssembly 测试文稿

:::{slide}
e2e/exec-wasi.spec.ts 的测试文稿：C 程序在浏览器中运行于 WebAssembly（WASI），编译时用同一份二进制录制输出。
:::

(c-program)=
## C 程序

浏览器中的 clang 编译这段程序，再运行编译出的 WASI 程序；编译时在 Node 中用同一份二进制录制它的输出。

(sum)=
```{code} c
:run: both
#include <stdio.h>

int main(void) {
  int sum = 0;
  for (int i = 1; i <= 100; i++) sum += i;
  printf("1 + 2 + ... + 100 = %d\n", sum);
  return 0;
}
```
