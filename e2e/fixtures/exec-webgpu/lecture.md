---
title: 浏览器 GPU 测试文稿
lang: zh-CN
plugins:
  - '@lincyaw/addon-core'
  - '@lincyaw/addon-exec'
  - '@lincyaw/addon-exec-webgpu'
renderers:
  web: {}
  slides:
    theme: default
---

# 浏览器 GPU 测试文稿

:::{slide}
e2e/exec-webgpu.spec.ts 的测试文稿：WGSL 计算着色器、Python 中的 `presmium_gpu` 与 jax-js。
:::

(shader)=
## 向量加法

计算着色器把 `a` 与 `b` 逐项相加，写进 `out`；构建时在 Chromium 中录制输出。

(add)=
```{run-panel} wgsl
---
params:
  buffers:
    a: [1, 2, 3, 4]
    b: [10, 20, 30, 40]
    out: { size: 4 }
  dispatch: 1
  repeat: 5
---
@group(0) @binding(0) var<storage, read> a: array<f32>;
@group(0) @binding(1) var<storage, read> b: array<f32>;
@group(0) @binding(2) var<storage, read_write> out: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x < arrayLength(&out)) {
    out[id.x] = a[id.x] + b[id.x];
  }
}
```

(python)=
## Python 中的 GPU

同一个着色器经 `presmium_gpu` 运行：先用 `await`，再用同步写法（需要 JSPI）；超过规模限制的缓冲区与重复次数在请求 GPU 之前就被拒绝。

(py-async)=
```{code} python
:run: live
import presmium_gpu as gpu

SHADER = """
@group(0) @binding(0) var<storage, read> a: array<f32>;
@group(0) @binding(1) var<storage, read> b: array<f32>;
@group(0) @binding(2) var<storage, read_write> out: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x < arrayLength(&out)) {
    out[id.x] = a[id.x] + b[id.x];
  }
}
"""
result = await gpu.run(SHADER, buffers={'a': [1, 2, 3, 4], 'b': [10, 20, 30, 40], 'out': {'size': 4}})
print(result)
```

(py-sync)=
```{code} python
:run: live
import presmium_gpu as gpu

SHADER = """
@group(0) @binding(0) var<storage, read> a: array<f32>;
@group(0) @binding(1) var<storage, read> b: array<f32>;
@group(0) @binding(2) var<storage, read_write> out: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x < arrayLength(&out)) {
    out[id.x] = a[id.x] + b[id.x];
  }
}
"""
print('JSPI:', gpu.can_run_sync())
print(gpu.run_sync(SHADER, buffers={'a': [1, 2, 3, 4], 'b': [10, 20, 30, 40], 'out': {'size': 4}})['out'])
```

(py-limits)=
```{code} python
:run: live
import presmium_gpu as gpu

SHADER = "@group(0) @binding(0) var<storage, read_write> out: array<f32>; @compute @workgroup_size(1) fn main() {}"
for options in ({'buffers': {'out': {'size': 40_000_000}}}, {'buffers': {'out': {'size': 4}}, 'repeat': 1001}):
    try:
        await gpu.run(SHADER, **options)
    except ValueError as error:
        print(error)
```

(tensor)=
## jax-js 张量

2×2 矩阵乘法，有 WebGPU 时在 GPU 上计算。

(matmul)=
```{code} javascript
:run: live
import { defaultDevice, init, numpy as np } from '@jax-js/jax'

const devices = await init()
if (devices.includes('webgpu')) defaultDevice('webgpu')
const product = np.matmul(np.array([[1, 2], [3, 4]]), np.array([[5, 6], [7, 8]]))
console.log(defaultDevice(), JSON.stringify(await product.jsAsync()))
```
