---
title: "CS336 Lecture 06: GPU programming"
lang: en
plugins:
  - '@presmium/slidev-addon-core'
  - '@presmium/slidev-addon-content'
renderers:
  slides: {}
---

(cs336-06-cover)=
# Lecture 06: GPU programming

Stanford CS336 · Language Modeling from Scratch · Spring 2026.


(cs336-06-section-001)=
## GPU programming

:::{slide}
:label: cs336-06-001-output-001
:at: 0
Last lecture: high-level overview of GPUs and performance
:::

:::{slide}
:label: cs336-06-001-output-002
:at: 1
This lecture: benchmarking/profiling + writing kernels
:::


(cs336-06-section-002)=
## Hardware

:::{slide}
:label: cs336-06-002-output-001
:at: 0
![gpu-hardware.png](../source/images/gpu-hardware.png)
:::

:::{slide}
:label: cs336-06-002-output-002
:at: 1
```text
| Accelerator                        | A100      | H100      | B200      |
```
:::

:::{slide}
:label: cs336-06-002-output-003
:at: 2
```text
+------------------------------------+-----------+-----------+-----------+
```
:::

:::{slide}
:label: cs336-06-002-output-004
:at: 3
```text
| # SMs                              |       108 |       132 |       148 |
```
:::


(cs336-06-section-003)=
## Hardware

:::{slide}
:label: cs336-06-003-output-001
:at: 0
```text
+------------------------------------+-----------+-----------+-----------+
```
:::

:::{slide}
:label: cs336-06-003-output-002
:at: 1
```text
| Register size (per SM)             |    256 KB |    256 KB |    256 KB |
```
:::

:::{slide}
:label: cs336-06-003-output-003
:at: 2
```text
| L1 cache + shared memory (per SM)  |    192 KB |    256 KB |    256 KB |
```
:::

:::{slide}
:label: cs336-06-003-output-004
:at: 3
```text
| L2 cache size                      |     40 MB |     50 MB | 96-126 MB |
```
:::

:::{slide}
:label: cs336-06-003-output-005
:at: 4
```text
| HBM size                           |     80 GB |     80 GB |    192 GB |
```
:::


(cs336-06-section-004)=
## Hardware

:::{slide}
:label: cs336-06-004-output-001
:at: 0
```text
+------------------------------------+-----------+-----------+-----------+
```
:::

:::{slide}
:label: cs336-06-004-output-002
:at: 1
```text
| Register bandwidth                 | ~116 TB/s | ~401 TB/s | ~447 TB/s |
```
:::

:::{slide}
:label: cs336-06-004-output-003
:at: 2
```text
| L1 cache + shared memory bandwidth |  ~19 TB/s |  ~33 TB/s |  ~40 TB/s |
```
:::

:::{slide}
:label: cs336-06-004-output-004
:at: 3
```text
| L2 cache bandwidth                 | ~5-8 TB/s |  ~12 TB/s |  ~17 TB/s |
```
:::

:::{slide}
:label: cs336-06-004-output-005
:at: 4
```text
| HBM bandwidth                      |    2 TB/s | 3.35 TB/s |    8 TB/s |
```
:::


(cs336-06-section-005)=
## Hardware

:::{slide}
:label: cs336-06-005-output-001
:at: 0
Note: the L1/L2 bandwidth numbers are rough estimates (online sources differ).
:::

:::{slide}
:label: cs336-06-005-output-002
:at: 1
(B200s also have tensor memory (TMEM) for tensor cores (between registers and shared memory) that are invisible to programmer.)
:::


(cs336-06-section-006)=
## Programming model

:::{slide}
:label: cs336-06-006-output-001
:at: 0
![image-1390e250b108c0d04b315ac7995eccd0-https_docs_nvidia_com_cuda_parallel-thread-execution__images_grid-with-CTAs_png](../assets/3aebbb52b47d4cef0c67785f.png)
:::

:::{slide}
:label: cs336-06-006-output-002
:at: 1
- *Thread*: executes code on a small part of the data
:::

:::{slide}
:label: cs336-06-006-output-003
:at: 2
- *Thread block* or concurrent thread array (CTA): a group of threads
:::

:::{slide}
:label: cs336-06-006-output-004
:at: 3
- *Grid*: collection of thread blocks
:::


(cs336-06-section-007)=
## Programming model

:::{slide}
:label: cs336-06-007-output-001
:at: 0
(H100s and B200s also have thread block clusters that enable distributed shared memory.)
:::

:::{slide}
:label: cs336-06-007-output-002
:at: 1
Why thread blocks?
:::

:::{slide}
:label: cs336-06-007-output-003
:at: 2
For elementwise operations (e.g., GeLU), threads are most natural: each thread processes one element.
:::

:::{slide}
:label: cs336-06-007-output-004
:at: 3
- f(i) for i = 0, ..., N-1
:::

:::{slide}
:label: cs336-06-007-output-005
:at: 4
However, for non-elementwise operations like softmax or matrix multiplication, threads need to communicate.
:::


(cs336-06-section-008)=
## Programming model

:::{slide}
:label: cs336-06-008-output-001
:at: 0
Reading/writing from HBM is slow, so use shared memory (local to SM).
:::

:::{slide}
:label: cs336-06-008-output-002
:at: 1
Thread block: a collection of threads that access the same shared memory.
:::

:::{slide}
:label: cs336-06-008-output-003
:at: 2
Consequently, a thread block is scheduled on one SM.
:::

:::{slide}
:label: cs336-06-008-output-004
:at: 3
In Triton, think natively in terms of thread blocks (later).
:::


(cs336-06-section-009)=
## Interaction between programming model and hardware

:::{slide}
:label: cs336-06-009-output-001
:at: 0
Programming model provides an abstraction of the hardware.
:::

:::{slide}
:label: cs336-06-009-output-002
:at: 1
In principle, don't need to think about anything else (for correctness).
:::

:::{slide}
:label: cs336-06-009-output-003
:at: 2
In practice, performance is very sensitive to the hardware, so need to understand it to obtain high performance.
:::

:::{slide}
:label: cs336-06-009-output-004
:at: 3
Let's go over some considerations.
:::


(cs336-06-section-010)=
## Interaction between programming model and hardware

:::{slide}
:label: cs336-06-010-output-001
:at: 0
**Warps**:
:::

:::{slide}
:label: cs336-06-010-output-002
:at: 1
- Within a thread block, threads are grouped into warps (32 threads per warp).
:::

:::{slide}
:label: cs336-06-010-output-003
:at: 2
- Example: thread block has 64 threads => it has 2 warps.
:::

:::{slide}
:label: cs336-06-010-output-004
:at: 3
```text
| TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT | TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT |
```
:::

:::{slide}
:label: cs336-06-010-output-005
:at: 4
- All threads within a warp must execute same instructions in lockstep on an SM.
:::


(cs336-06-section-011)=
## Interaction between programming model and hardware

:::{slide}
:label: cs336-06-011-output-001
:at: 0
- Control divergence: if different threads in a warp need to execute different instructions (if A, else B), must be done sequentially (bad)
:::

:::{slide}
:label: cs336-06-011-output-002
:at: 1
```text
| AAAAAAAAA....................... |
```
:::

:::{slide}
:label: cs336-06-011-output-003
:at: 2
```text
| .........BBBBBBBBBBBBBBBBBBBBBBB |
```
:::

:::{slide}
:label: cs336-06-011-output-004
:at: 3
- SM runs multiple warps and switches between them (e.g., when one warp is blocked on HBM reads/writes) with zero cost.
:::

:::{slide}
:label: cs336-06-011-output-005
:at: 4
**(Warp) occupancy**:
:::


(cs336-06-section-012)=
## Interaction between programming model and hardware

:::{slide}
:label: cs336-06-012-output-001
:at: 0
- Each thread can use between 0 and 255 registers.
:::

:::{slide}
:label: cs336-06-012-output-002
:at: 1
- The more registers threads use, the fewer threads can be scheduled on an SM (low occupancy).
:::

:::{slide}
:label: cs336-06-012-output-003
:at: 2
- Low occupancy isn't necessarily bad if each thread is doing more work.
:::

:::{slide}
:label: cs336-06-012-output-004
:at: 3
- Example: thread coarsening (each thread processes multiple elements).
:::

:::{slide}
:label: cs336-06-012-output-005
:at: 4
- Example: thread block has 64 threads, each using 160 registers, SM has 65536 registers
:::


(cs336-06-section-013)=
## Interaction between programming model and hardware

:::{slide}
:label: cs336-06-013-values-001
:at: 0
:until: 1
| Variable | Value |
| --- | --- |
| `num_registers_per_block` | 20480 |
:::

:::{slide}
:label: cs336-06-013-values-002
:at: 1
:until: 2
| Variable | Value |
| --- | --- |
| `num_registers_per_block` | 20480 |
| `num_blocks` | 3 |
:::

:::{slide}
:label: cs336-06-013-values-003
:at: 2
:until: 3
| Variable | Value |
| --- | --- |
| `num_registers_per_block` | 20480 |
| `num_blocks` | 3 |
| `num_warps` | 12.0 |
:::

:::{slide}
:label: cs336-06-013-values-004
:at: 3
| Variable | Value |
| --- | --- |
| `num_registers_per_block` | 20480 |
| `num_blocks` | 3 |
| `num_warps` | 12.0 |
| `occupancy` | 0.1875 |
:::

:::{slide}
:label: cs336-06-013-output-005
:at: 4
**Bank conflicts** (shared memory):
:::


(cs336-06-section-014)=
## Interaction between programming model and hardware

:::{slide}
:label: cs336-06-014-output-001
:at: 0
- Shared memory is divided into 32 banks, each 4 bytes wide.
:::

:::{slide}
:label: cs336-06-014-values-002
:at: 0
| Variable | Value |
| --- | --- |
| `num_registers_per_block` | 20480 |
| `num_blocks` | 3 |
| `num_warps` | 12.0 |
| `occupancy` | 0.1875 |
:::

:::{slide}
:label: cs336-06-014-output-003
:at: 1
```text
B00 B01 B02 B03 B04 B05 B06 B07 B08 B09 B10 B11 B12 B13 B14 B15 B16 B17 B18 B19 B20 B21 B22 B23 B24 B25 B26 B27 B28 B29 B30 B31
```
:::

:::{slide}
:label: cs336-06-014-output-004
:at: 2
```text
... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ...
```
:::

:::{slide}
:label: cs336-06-014-output-005
:at: 3
```text
... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ...
```
:::

:::{slide}
:label: cs336-06-014-output-006
:at: 4
```text
... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ...
```
:::


(cs336-06-section-015)=
## Interaction between programming model and hardware

:::{slide}
:label: cs336-06-015-output-001
:at: 0
- Each cycle, each bank can only be accessed by one thread (if not the same exact location).
:::

:::{slide}
:label: cs336-06-015-values-002
:at: 0
| Variable | Value |
| --- | --- |
| `num_registers_per_block` | 20480 |
| `num_blocks` | 3 |
| `num_warps` | 12.0 |
| `occupancy` | 0.1875 |
:::

:::{slide}
:label: cs336-06-015-output-003
:at: 1
- If multiple threads access the same bank, accesses serialized (bank conflict).
:::

:::{slide}
:label: cs336-06-015-output-004
:at: 2
- Worst case example: matrix where each row spans all banks; 32 threads accessing first column results in 32-way bank conflict!
:::

:::{slide}
:label: cs336-06-015-output-005
:at: 3
- Unavoidable: when doing matmul A @ B, access rows of A and columns of B
:::

:::{slide}
:label: cs336-06-015-output-006
:at: 4
- Solution: swizzling rearranges shared memory (e.g., row xor col) to avoid bank conflicts
:::


(cs336-06-section-016)=
## Interaction between programming model and hardware

:::{slide}
:label: cs336-06-016-output-001
:at: 0
**Memory coalescing** (HBM):
:::

:::{slide}
:label: cs336-06-016-values-002
:at: 0
| Variable | Value |
| --- | --- |
| `num_registers_per_block` | 20480 |
| `num_blocks` | 3 |
| `num_warps` | 12.0 |
| `occupancy` | 0.1875 |
:::

:::{slide}
:label: cs336-06-016-output-003
:at: 1
- When the 32 threads in a warp access HBM, memory accesses combined into transactions of 128 bytes (cache lines).
:::

:::{slide}
:label: cs336-06-016-output-004
:at: 2
```text
M00 M01 M02 M03 M04 M05 M06 M07 M08 M09 M10 M11 M12 M13 M14 M15 M16 M17 M18 M19 M20 M21 M22 M23 M24 M25 M26 M27 M28 M29 M30 M31
```
:::

:::{slide}
:label: cs336-06-016-output-005
:at: 3
```text
M32 M33 M34 M35 M36 M37 M38 M39 M40 M41 M42 M43 M44 M45 M46 M47 M48 M49 M50 M51 M52 M53 M54 M55 M56 M57 M58 M59 M60 M61 M62 M63
```
:::

:::{slide}
:label: cs336-06-016-output-006
:at: 4
- Best case: full coalescing, all threads access the same cache line (32 threads x 4 bytes = 128 bytes).
:::


(cs336-06-section-017)=
## Interaction between programming model and hardware

:::{slide}
:label: cs336-06-017-output-001
:at: 0
**Block occupancy**:
:::

:::{slide}
:label: cs336-06-017-values-002
:at: 0
| Variable | Value |
| --- | --- |
| `num_registers_per_block` | 20480 |
| `num_blocks` | 3 |
| `num_warps` | 12.0 |
| `occupancy` | 0.1875 |
:::

:::{slide}
:label: cs336-06-017-output-003
:at: 1
![image-f256f44a88048865b9ad6afcedde912b-https_developer-blogs_nvidia_com_wp-content_uploads_2019_06_pasted-image-0_png](../assets/6041d229eeb83102708e4b2b.png)
:::

:::{slide}
:label: cs336-06-017-output-004
:at: 2
- Thread blocks scheduled onto SMs in waves.
:::

:::{slide}
:label: cs336-06-017-output-005
:at: 3
- B200 has 148 SMs, if we launch 160 thread blocks, first wave has 148 blocks, second wave has 12 blocks.
:::

:::{slide}
:label: cs336-06-017-output-006
:at: 4
- Wave quantization problem: last wave has fewer thread blocks, leaving some SMs idle (low block occupancy).
:::


(cs336-06-section-018)=
## Interaction between programming model and hardware

:::{slide}
:label: cs336-06-018-output-001
:at: 0
- Solution: make number of thread blocks divide # SMs.
:::

:::{slide}
:label: cs336-06-018-values-002
:at: 0
:until: 4
| Variable | Value |
| --- | --- |
| `num_registers_per_block` | 20480 |
| `num_blocks` | 3 |
| `num_warps` | 12.0 |
| `occupancy` | 0.1875 |
:::

:::{slide}
:label: cs336-06-018-output-003
:at: 1
Summary:
:::

:::{slide}
:label: cs336-06-018-output-004
:at: 2
- Programming model: grid (HBM) -> thread block (shared memory) -> thread (registers)
:::

:::{slide}
:label: cs336-06-018-output-005
:at: 3
- Details of hardware (warps, bank conflicts, memory coalescing, occupancy) determine performance
:::

:::{slide}
:label: cs336-06-018-output-006
:at: 5
Recipe for success:
:::


(cs336-06-section-019)=
## Interaction between programming model and hardware

:::{slide}
:label: cs336-06-019-output-001
:at: 0
1. Benchmark and profile your code
:::

:::{slide}
:label: cs336-06-019-output-002
:at: 1
2. Make changes
:::

:::{slide}
:label: cs336-06-019-output-003
:at: 2
3. Benchmark and profile your code again
:::

:::{slide}
:label: cs336-06-019-output-004
:at: 3
Benchmarking measures the wall-clock time of performing some operation.
:::

:::{slide}
:label: cs336-06-019-output-005
:at: 4
It only gives you end-to-end time, not where time is spent (profiling).
:::


(cs336-06-section-020)=
## Interaction between programming model and hardware

:::{slide}
:label: cs336-06-020-output-001
:at: 0
It is still useful for:
:::

:::{slide}
:label: cs336-06-020-output-002
:at: 1
- comparing different implementations (which is faster?), and
:::

:::{slide}
:label: cs336-06-020-output-003
:at: 2
- understanding how performance scales (e.g., with dimension).
:::

:::{slide}
:label: cs336-06-020-output-004
:at: 3
You can use [`torch.utils.benchmark`](https://pytorch.org/tutorials/recipes/recipes/benchmark.html).
:::

:::{slide}
:label: cs336-06-020-output-005
:at: 4
We will roll our own to make benchmarking more transparent.
:::


(cs336-06-section-021)=
## Interaction between programming model and hardware

:::{slide}
:label: cs336-06-021-values-001
:at: 0
:until: 1
**`times`**

```python
[]
```

:::

:::{slide}
:label: cs336-06-021-values-002
:at: 1
:until: 2
**`times`**

```python
[0.9670079946517944]
```

:::

:::{slide}
:label: cs336-06-021-values-003
:at: 2
:until: 3
**`times`**

```python
[0.9670079946517944, 0.8406400084495544]
```

:::

:::{slide}
:label: cs336-06-021-values-004
:at: 3
:until: 4
**`times`**

```python
[0.9670079946517944, 0.8406400084495544, 0.910368025302887]
```

:::

:::{slide}
:label: cs336-06-021-values-005
:at: 4
| Variable | Value |
| --- | --- |
| `mean_time` | 0.906005342801412 |

**`times`**

```python
[0.9670079946517944, 0.8406400084495544, 0.910368025302887]
```

:::


(cs336-06-section-022)=
## Interaction between programming model and hardware

:::{slide}
:label: cs336-06-022-values-001
:at: 0
:until: 1
| Variable | Value |
| --- | --- |
| `result` | 0.906005342801412 |
:::

:::{slide}
:label: cs336-06-022-values-002
:at: 1
:until: 2
| Variable | Value |
| --- | --- |
| `result` | 0.906005342801412 |

**`results`**

```python
{'256': 0.7438933253288269}
```

:::

:::{slide}
:label: cs336-06-022-values-003
:at: 2
:until: 3
| Variable | Value |
| --- | --- |
| `result` | 0.906005342801412 |

**`results`**

```python
{'256': 0.7438933253288269, '512': 0.6991466681162516}
```

:::

:::{slide}
:label: cs336-06-022-values-004
:at: 3
:until: 4
| Variable | Value |
| --- | --- |
| `result` | 0.906005342801412 |

**`results`**

```python
{'256': 0.7438933253288269, '512': 0.6991466681162516, '1024': 0.7078079978624979}
```

:::

:::{slide}
:label: cs336-06-022-values-005
:at: 4
| Variable | Value |
| --- | --- |
| `result` | 0.906005342801412 |

**`results`**

```python
{'256': 0.7438933253288269,
 '512': 0.6991466681162516,
 '1024': 0.7078079978624979,
 '2048': 0.7564266721407572}
```

:::


(cs336-06-section-023)=
## Interaction between programming model and hardware

:::{slide}
:label: cs336-06-023-values-001
:at: 0
:until: 1
| Variable | Value |
| --- | --- |
| `result` | 0.906005342801412 |

**`results`**

```python
{'256': 0.7438933253288269,
 '512': 0.6991466681162516,
 '1024': 0.7078079978624979,
 '2048': 0.7564266721407572,
 '4096': 2.6289066473642984}
```

:::

:::{slide}
:label: cs336-06-023-values-002
:at: 1
:until: 3
| Variable | Value |
| --- | --- |
| `result` | 0.906005342801412 |

**`results`**

```python
{'256': 0.7438933253288269,
 '512': 0.6991466681162516,
 '1024': 0.7078079978624979,
 '2048': 0.7564266721407572,
 '4096': 2.6289066473642984,
 '8192': 17.650890986124676}
```

:::

:::{slide}
:label: cs336-06-023-output-003
:at: 2
Note: time is roughly constant when dimension is small, then cubic scaling.
:::

:::{slide}
:label: cs336-06-023-output-004
:at: 4
While benchmarking looks at end-to-end time, profiling looks at where time is spent.
:::

:::{slide}
:label: cs336-06-023-output-005
:at: 5
Independent of time, profiling also helps you understand what's going under the hood.
:::


(cs336-06-section-024)=
## Interaction between programming model and hardware

:::{slide}
:label: cs336-06-024-output-001
:at: 0
PyTorch has a built-in [profiler](https://pytorch.org/tutorials/recipes/recipes/profiler_recipe.html).
:::

:::{slide}
:label: cs336-06-024-output-002
:at: 1
In your assignment, you will use nsight to get more details.
:::


(cs336-06-section-025)=
## add(dim=2048)

:::{slide}
:label: cs336-06-025-output-001
:at: 0
```text
----------------------------------------------------------------------------------------------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  
                                                                                                Name    Self CPU %      Self CPU   CPU total %     CPU total  CPU time avg     Self CUDA   Self CUDA %    CUDA total  CUDA time avg    # of Calls  
----------------------------------------------------------------------------------------------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  
void at::native::vectorized_elementwise_kernel<4, at::native::CUDAFunctor_add<float>, std::array<...         0.00%       0.000us         0.00%       0.000us       0.000us       4.833us       100.00%       4.833us       4.833us             1  
                                                                             Activity Buffer Request        97.09%       1.961ms        97.09%       1.961ms       1.961ms       0.000us         0.00%       0.000us       0.000us             1  
                                                                                    cudaLaunchKernel         2.19%      44.216us         2.19%      44.216us      44.216us       0.000us         0.00%       0.000us       0.000us             1  
                                                                               cudaDeviceSynchronize         0.72%      14.478us         0.72%      14.478us       7.239us       0.000us         0.00%       0.000us       0.000us             2  
----------------------------------------------------------------------------------------------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  
Self CPU time total: 2.019ms
Self CUDA time total: 4.833us
```
:::


(cs336-06-section-026)=
## matmul(dim=2048)

:::{slide}
:label: cs336-06-026-output-001
:at: 0
```text
--------------------------------------------------------------------------------------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  
                                                                                        Name    Self CPU %      Self CPU   CPU total %     CPU total  CPU time avg     Self CUDA   Self CUDA %    CUDA total  CUDA time avg    # of Calls  
--------------------------------------------------------------------------------------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  
    cutlass3x_sm100_simt_sgemm_f32_f32_f32_f32_f32_64x64x16_1x1x1_3_nnn_align1_bias_f32_relu         0.00%       0.000us         0.00%       0.000us       0.000us     330.366us       100.00%     330.366us     330.366us             1  
                                                                            cuLaunchKernelEx         1.30%      24.828us        99.23%       1.896ms       1.896ms       0.000us         0.00%       0.000us       0.000us             1  
                                                                     Activity Buffer Request        97.93%       1.871ms        97.93%       1.871ms       1.871ms       0.000us         0.00%       0.000us       0.000us             1  
                                                                       cudaDeviceSynchronize         0.77%      14.746us         0.77%      14.746us       7.373us       0.000us         0.00%       0.000us       0.000us             2  
--------------------------------------------------------------------------------------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  
Self CPU time total: 1.910ms
Self CUDA time total: 330.366us
```
:::


(cs336-06-section-027)=
## matmul(dim=128)

:::{slide}
:label: cs336-06-027-output-001
:at: 0
```text
--------------------------------------------------------------------------------------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  
                                                                                        Name    Self CPU %      Self CPU   CPU total %     CPU total  CPU time avg     Self CUDA   Self CUDA %    CUDA total  CUDA time avg    # of Calls  
--------------------------------------------------------------------------------------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  
    cutlass3x_sm100_simt_sgemm_f32_f32_f32_f32_f32_32x32x16_1x1x1_3_nnn_align1_bias_f32_relu         0.00%       0.000us         0.00%       0.000us       0.000us       4.544us       100.00%       4.544us       4.544us             1  
                                                                            cuLaunchKernelEx         1.48%      27.125us        99.19%       1.822ms       1.822ms       0.000us         0.00%       0.000us       0.000us             1  
                                                                     Activity Buffer Request        97.72%       1.795ms        97.72%       1.795ms       1.795ms       0.000us         0.00%       0.000us       0.000us             1  
                                                                       cudaDeviceSynchronize         0.81%      14.796us         0.81%      14.796us       7.398us       0.000us         0.00%       0.000us       0.000us             2  
--------------------------------------------------------------------------------------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  
Self CPU time total: 1.837ms
Self CUDA time total: 4.544us
```
:::

:::{slide}
:label: cs336-06-027-output-002
:at: 1
Observations:
:::

:::{slide}
:label: cs336-06-027-output-003
:at: 2
- You can see which CUDA kernels are actually being called (the long names).
:::

:::{slide}
:label: cs336-06-027-output-004
:at: 3
- Different CUDA kernels are invoked depending on the tensor dimensions.
:::


(cs336-06-section-028)=
## matmul(dim=128)

:::{slide}
:label: cs336-06-028-output-001
:at: 0
Name of CUDA kernel tells us something about the implementation.
:::

:::{slide}
:label: cs336-06-028-output-002
:at: 1
Example: cutlass3x_sm100_simt_sgemm_f32_f32_f32_f32_f32_64x64x16_1x1x1_3_nnn_align1_bi...
:::

:::{slide}
:label: cs336-06-028-output-003
:at: 2
- cutlass: NVIDIA's CUDA library for linear algebra
:::

:::{slide}
:label: cs336-06-028-output-004
:at: 3
- sm100: corresponds to the NVIDIA Blackwell architecture (B200)
:::

:::{slide}
:label: cs336-06-028-output-005
:at: 4
- f32: float32
:::


(cs336-06-section-029)=
## matmul(dim=128)

:::{slide}
:label: cs336-06-029-output-001
:at: 0
- 64x64x16: tile shape (more on this later)
:::

:::{slide}
:label: cs336-06-029-output-002
:at: 1
Benchmark and profile your code!
:::

:::{slide}
:label: cs336-06-029-output-003
:at: 2
Let's benchmark and profile the [GeLU activation function](https://pytorch.org/docs/stable/generated/torch.nn.GELU.html).
:::

:::{slide}
:label: cs336-06-029-values-004
:at: 3
:until: 4
**`x`** (torch.float32 · 1)

```python
[1.0]
```

:::

:::{slide}
:label: cs336-06-029-values-005
:at: 5
:until: 6
**`x`** (torch.float32 · 1)

```python
[1.0]
```


**`y1`** (torch.float32 · 1)

```python
[0.8411920070648193]
```

:::


(cs336-06-section-030)=
## matmul(dim=128)

:::{slide}
:label: cs336-06-030-values-001
:at: 0
:until: 1
**`x`** (torch.float32 · 1)

```python
[1.0]
```


**`y1`** (torch.float32 · 1)

```python
[0.8411920070648193]
```


**`y2`** (torch.float32 · 1)

```python
[0.8411920070648193]
```

:::

:::{slide}
:label: cs336-06-030-values-002
:at: 2
:until: 3
**`x`** (torch.float32 · 1)

```python
[1.0]
```


**`y1`** (torch.float32 · 1)

```python
[0.8411920070648193]
```


**`y2`** (torch.float32 · 1)

```python
[0.8411920070648193]
```

:::

:::{slide}
:label: cs336-06-030-values-003
:at: 3
:until: 4
**`x`** (torch.float32 · 1)

```python
[1.0]
```


**`y1`** (torch.float32 · 1)

```python
[0.8411920070648193]
```


**`y2`** (torch.float32 · 1)

```python
[0.8411920070648193]
```


**`y3`** (torch.float32 · 1)

```python
[0.8411920070648193]
```

:::

:::{slide}
:label: cs336-06-030-values-004
:at: 4
:until: 5
| Variable | Value |
| --- | --- |
| `naive_time` | 3.8332692782084146 |

**`x`** (torch.float32 · 1)

```python
[1.0]
```


**`y1`** (torch.float32 · 1)

```python
[0.8411920070648193]
```


**`y2`** (torch.float32 · 1)

```python
[0.8411920070648193]
```


**`y3`** (torch.float32 · 1)

```python
[0.8411920070648193]
```

:::

:::{slide}
:label: cs336-06-030-values-005
:at: 5
:until: 6
| Variable | Value |
| --- | --- |
| `naive_time` | 3.8332692782084146 |
| `builtin_time` | 0.7309120098749796 |

**`x`** (torch.float32 · 1)

```python
[1.0]
```


**`y1`** (torch.float32 · 1)

```python
[0.8411920070648193]
```


**`y2`** (torch.float32 · 1)

```python
[0.8411920070648193]
```


**`y3`** (torch.float32 · 1)

```python
[0.8411920070648193]
```

:::

:::{slide}
:label: cs336-06-030-values-006
:at: 6
| Variable | Value |
| --- | --- |
| `naive_time` | 3.8332692782084146 |
| `builtin_time` | 0.7309120098749796 |
| `compiled_time` | 1.0826133092244465 |

**`x`** (torch.float32 · 1)

```python
[1.0]
```


**`y1`** (torch.float32 · 1)

```python
[0.8411920070648193]
```


**`y2`** (torch.float32 · 1)

```python
[0.8411920070648193]
```


**`y3`** (torch.float32 · 1)

```python
[0.8411920070648193]
```

:::


(cs336-06-section-031)=
## matmul(dim=128)

:::{slide}
:label: cs336-06-031-output-001
:at: 0
The builtin and compiled versions are significantly faster!
:::

:::{slide}
:label: cs336-06-031-values-002
:at: 0
| Variable | Value |
| --- | --- |
| `naive_time` | 3.8332692782084146 |
| `builtin_time` | 0.7309120098749796 |
| `compiled_time` | 1.0826133092244465 |

**`x`** (torch.float32 · 1)

```python
[1.0]
```


**`y1`** (torch.float32 · 1)

```python
[0.8411920070648193]
```


**`y2`** (torch.float32 · 1)

```python
[0.8411920070648193]
```


**`y3`** (torch.float32 · 1)

```python
[0.8411920070648193]
```

:::

:::{slide}
:label: cs336-06-031-output-003
:at: 1
To understand why, let's look at the profiler to see where time is being spent.
:::


(cs336-06-section-032)=
## naive_gelu

:::{slide}
:label: cs336-06-032-values-001
:at: 0
| Variable | Value |
| --- | --- |
| `naive_time` | 3.8332692782084146 |
| `builtin_time` | 0.7309120098749796 |
| `compiled_time` | 1.0826133092244465 |

**`x`** (torch.float32 · 1)

```python
[1.0]
```


**`y1`** (torch.float32 · 1)

```python
[0.8411920070648193]
```


**`y2`** (torch.float32 · 1)

```python
[0.8411920070648193]
```


**`y3`** (torch.float32 · 1)

```python
[0.8411920070648193]
```

:::

:::{slide}
:label: cs336-06-032-output-002
:at: 1
```text
----------------------------------------------------------------------------------------------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  
                                                                                                Name    Self CPU %      Self CPU   CPU total %     CPU total  CPU time avg     Self CUDA   Self CUDA %    CUDA total  CUDA time avg    # of Calls  
----------------------------------------------------------------------------------------------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  
void at::native::vectorized_elementwise_kernel<4, at::native::BinaryFunctor<float, float, float, ...         0.00%       0.000us         0.00%       0.000us       0.000us       1.378ms        40.71%       1.378ms     459.243us             3  
void at::native::vectorized_elementwise_kernel<4, at::native::AUnaryFunctor<float, float, float, ...         0.00%       0.000us         0.00%       0.000us       0.000us     926.785us        27.39%     926.785us     308.928us             3  
void at::native::vectorized_elementwise_kernel<4, at::native::CUDAFunctor_add<float>, std::array<...         0.00%       0.000us         0.00%       0.000us       0.000us     460.800us        13.62%     460.800us     460.800us             1  
void at::native::vectorized_elementwise_kernel<4, at::native::tanh_kernel_cuda(at::TensorIterator...         0.00%       0.000us         0.00%       0.000us       0.000us     309.632us         9.15%     309.632us     309.632us             1  
void at::native::vectorized_elementwise_kernel<4, at::native::CUDAFunctorOnSelf_add<float>, std::...         0.00%       0.000us         0.00%       0.000us       0.000us     309.280us         9.14%     309.280us     309.280us             1  
                                                                             Activity Buffer Request        24.65%       1.372ms        24.65%       1.372ms       1.372ms       0.000us         0.00%       0.000us       0.000us             1  
                                                                                    cudaLaunchKernel        23.63%       1.315ms        23.63%       1.315ms     146.136us       0.000us         0.00%       0.000us       0.000us             9  
                                                                               cudaDeviceSynchronize        51.72%       2.879ms        51.72%       2.879ms       1.439ms       0.000us         0.00%       0.000us       0.000us             2  
----------------------------------------------------------------------------------------------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  
Self CPU time total: 5.566ms
Self CUDA time total: 3.384ms
```
:::


(cs336-06-section-033)=
## builtin_gelu

:::{slide}
:label: cs336-06-033-values-001
:at: 0
| Variable | Value |
| --- | --- |
| `naive_time` | 3.8332692782084146 |
| `builtin_time` | 0.7309120098749796 |
| `compiled_time` | 1.0826133092244465 |

**`x`** (torch.float32 · 1)

```python
[1.0]
```


**`y1`** (torch.float32 · 1)

```python
[0.8411920070648193]
```


**`y2`** (torch.float32 · 1)

```python
[0.8411920070648193]
```


**`y3`** (torch.float32 · 1)

```python
[0.8411920070648193]
```

:::

:::{slide}
:label: cs336-06-033-output-002
:at: 1
```text
----------------------------------------------------------------------------------------------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  
                                                                                                Name    Self CPU %      Self CPU   CPU total %     CPU total  CPU time avg     Self CUDA   Self CUDA %    CUDA total  CUDA time avg    # of Calls  
----------------------------------------------------------------------------------------------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  
void at::native::vectorized_elementwise_kernel<4, at::native::GeluCUDAKernelImpl(at::TensorIterat...         0.00%       0.000us         0.00%       0.000us       0.000us     304.640us       100.00%     304.640us     304.640us             1  
                                                                             Activity Buffer Request        84.27%       1.618ms        84.27%       1.618ms       1.618ms       0.000us         0.00%       0.000us       0.000us             1  
                                                                                    cudaLaunchKernel        15.15%     291.008us        15.15%     291.008us     291.008us       0.000us         0.00%       0.000us       0.000us             1  
                                                                               cudaDeviceSynchronize         0.57%      10.983us         0.57%      10.983us       5.492us       0.000us         0.00%       0.000us       0.000us             2  
----------------------------------------------------------------------------------------------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  
Self CPU time total: 1.920ms
Self CUDA time total: 304.640us
```
:::


(cs336-06-section-034)=
## compiled_gelu

:::{slide}
:label: cs336-06-034-values-001
:at: 0
| Variable | Value |
| --- | --- |
| `naive_time` | 3.8332692782084146 |
| `builtin_time` | 0.7309120098749796 |
| `compiled_time` | 1.0826133092244465 |

**`x`** (torch.float32 · 1)

```python
[1.0]
```


**`y1`** (torch.float32 · 1)

```python
[0.8411920070648193]
```


**`y2`** (torch.float32 · 1)

```python
[0.8411920070648193]
```


**`y3`** (torch.float32 · 1)

```python
[0.8411920070648193]
```

:::

:::{slide}
:label: cs336-06-034-output-002
:at: 1
```text
-----------------------------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  
                               Name    Self CPU %      Self CPU   CPU total %     CPU total  CPU time avg     Self CUDA   Self CUDA %    CUDA total  CUDA time avg    # of Calls  
-----------------------------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  
    triton_poi_fused_add_mul_tanh_0         0.00%       0.000us         0.00%       0.000us       0.000us     342.178us       100.00%     342.178us     342.178us             1  
            Activity Buffer Request        87.65%       1.652ms        87.65%       1.652ms       1.652ms       0.000us         0.00%       0.000us       0.000us             1  
                     cuLaunchKernel        11.77%     221.966us        11.77%     221.966us     221.966us       0.000us         0.00%       0.000us       0.000us             1  
              cudaDeviceSynchronize         0.58%      10.907us         0.58%      10.907us       5.454us       0.000us         0.00%       0.000us       0.000us             2  
-----------------------------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  ------------  
Self CPU time total: 1.885ms
Self CUDA time total: 342.178us
```
:::

:::{slide}
:label: cs336-06-034-output-003
:at: 2
Notes:
:::

:::{slide}
:label: cs336-06-034-output-004
:at: 3
- Naive implementation: multiple kernels, requires many reads/writes from/to HBM (**no fusion**).
:::

:::{slide}
:label: cs336-06-034-output-005
:at: 4
- Builtin and compiled versions: one kernel (**kernel fusion**), one read from HBM, one write to HBM.
:::


(cs336-06-section-035)=
## compiled_gelu

:::{slide}
:label: cs336-06-035-output-001
:at: 0
- The compiled kernel is a Triton kernel.
:::

:::{slide}
:label: cs336-06-035-values-002
:at: 0
:until: 1
| Variable | Value |
| --- | --- |
| `naive_time` | 3.8332692782084146 |
| `builtin_time` | 0.7309120098749796 |
| `compiled_time` | 1.0826133092244465 |

**`x`** (torch.float32 · 1)

```python
[1.0]
```


**`y1`** (torch.float32 · 1)

```python
[0.8411920070648193]
```


**`y2`** (torch.float32 · 1)

```python
[0.8411920070648193]
```


**`y3`** (torch.float32 · 1)

```python
[0.8411920070648193]
```

:::

:::{slide}
:label: cs336-06-035-output-003
:at: 2
![image-1390e250b108c0d04b315ac7995eccd0-https_docs_nvidia_com_cuda_parallel-thread-execution__images_grid-with-CTAs_png](../assets/3aebbb52b47d4cef0c67785f.png)
:::

:::{slide}
:label: cs336-06-035-output-004
:at: 3
In CUDA (developed by NVIDIA), specify what each thread does.
:::

:::{slide}
:label: cs336-06-035-output-005
:at: 4
- Pros: fine-grained control
:::

:::{slide}
:label: cs336-06-035-output-006
:at: 5
- Cons: need to manage more things (e.g., shared memory)
:::


(cs336-06-section-036)=
## compiled_gelu

:::{slide}
:label: cs336-06-036-output-001
:at: 0
In Triton (developed by OpenAI), specify what each thread block does.
:::

:::{slide}
:label: cs336-06-036-output-002
:at: 1
- Generally powerful enough (especially when getting started)
:::

:::{slide}
:label: cs336-06-036-output-003
:at: 2
- Conceptual framework: load data into shared memory, operate on it, write back to global memory
:::

:::{slide}
:label: cs336-06-036-output-004
:at: 3
Let's write the Triton kernel for GeLU.
:::

:::{slide}
:label: cs336-06-036-values-005
:at: 4
| Variable | Value |
| --- | --- |
| `num_elements` | 8192 |
:::


(cs336-06-section-037)=
## compiled_gelu

:::{slide}
:label: cs336-06-037-values-001
:at: 0
:until: 1
| Variable | Value |
| --- | --- |
| `num_elements` | 8192 |
| `num_blocks` | 8 |
:::

:::{slide}
:label: cs336-06-037-output-002
:at: 2
Triton compiles down to PTX (parallel thread execution), an assembly language for GPUs.
:::

:::{slide}
:label: cs336-06-037-output-003
:at: 3
We can see the PTX code generated by Triton.
:::

:::{slide}
:label: cs336-06-037-output-004
:at: 4
[https://github.com/stanford-cs336/lectures/blob/main/var/triton_gelu-ptx.txt](https://github.com/stanford-cs336/lectures/blob/main/var/triton_gelu-ptx.txt)
:::

:::{slide}
:label: cs336-06-037-output-005
:at: 5
Observations:
:::


(cs336-06-section-038)=
## compiled_gelu

:::{slide}
:label: cs336-06-038-output-001
:at: 0
- ld.global.* and st.global.* reads and writes from global memory
:::

:::{slide}
:label: cs336-06-038-output-002
:at: 1
- %ctaid.x is block index, %tid.x is thread index
:::

:::{slide}
:label: cs336-06-038-output-003
:at: 2
- %f* are floating point registers, %r* are integer registers
:::

:::{slide}
:label: cs336-06-038-output-004
:at: 3
- One thread processes 8 elements at the same time (thread coarsening)
:::

:::{slide}
:label: cs336-06-038-output-005
:at: 4
So far, we've looked at elementwise operations in Triton (e.g., GeLU).
:::


(cs336-06-section-039)=
## compiled_gelu

:::{slide}
:label: cs336-06-039-output-001
:at: 0
Now let us look at operations that aggregate over multiple values.
:::

:::{slide}
:label: cs336-06-039-output-002
:at: 1
We will roughly follow the Triton fused softmax tutorial: 

[https://triton-lang.org/main/getting-started/tutorials/02-fused-softmax.html](https://triton-lang.org/main/getting-started/tutorials/02-fused-softmax.html)
:::

:::{slide}
:label: cs336-06-039-output-003
:at: 2
Recall the softmax operation is used in attention and generating probabilities.
:::

:::{slide}
:label: cs336-06-039-output-004
:at: 3
Exponentiate and normalize each row of a matrix:
:::

:::{slide}
:label: cs336-06-039-output-005
:at: 4
```text
[0 0 0]      =>   [1/3 1/3 1/3]
```
:::


(cs336-06-section-040)=
## compiled_gelu

:::{slide}
:label: cs336-06-040-output-001
:at: 0
```text
[1 1 -inf]        [1/2 1/2 0  ]
```
:::

:::{slide}
:label: cs336-06-040-output-002
:at: 1
Let's first start with the naive implementation and keep track of reads/writes.
:::

:::{slide}
:label: cs336-06-040-values-003
:at: 2
:until: 5
**`y1`** (torch.float32 · 2 × 3)

```python
[[0.3333333432674408, 0.3333333432674408, 0.3333333432674408],
 [3.783505853677006e-44, 3.783505853677006e-44, 1.0]]
```

:::

:::{slide}
:label: cs336-06-040-output-004
:at: 3
Now let us write the Triton kernel.
:::

:::{slide}
:label: cs336-06-040-output-005
:at: 4
![triton-softmax.png](../source/images/triton-softmax.png)
:::


(cs336-06-section-041)=
## compiled_gelu

:::{slide}
:label: cs336-06-041-values-001
:at: 0
:until: 1
**`y1`** (torch.float32 · 2 × 3)

```python
[[0.3333333432674408, 0.3333333432674408, 0.3333333432674408],
 [3.783505853677006e-44, 3.783505853677006e-44, 1.0]]
```


**`y2`** (torch.float32 · 2 × 3)

```python
[[0.3333333432674408, 0.3333333432674408, 0.3333333432674408],
 [3.783505853677006e-44, 3.783505853677006e-44, 1.0]]
```

:::

:::{slide}
:label: cs336-06-041-output-002
:at: 2
In the softmax example, an entire row fits in a block, so the reduction happens within a block (handled by Triton).
:::

:::{slide}
:label: cs336-06-041-output-003
:at: 3
What if the row doesn't fit in a block?
:::

:::{slide}
:label: cs336-06-041-output-004
:at: 4
Example: 4096 columns, but block size is 1024...
:::

:::{slide}
:label: cs336-06-041-output-005
:at: 5
Strategy:
:::


(cs336-06-section-042)=
## compiled_gelu

:::{slide}
:label: cs336-06-042-output-001
:at: 0
- Break up row into tiles (4 in the example above)
:::

:::{slide}
:label: cs336-06-042-output-002
:at: 1
- Each thread iterates over tiles and accumulates a sum
:::

:::{slide}
:label: cs336-06-042-output-003
:at: 2
- Do final reduction (sum) over accumulators of each thread (shared memory or warp shuffles)
:::

:::{slide}
:label: cs336-06-042-output-004
:at: 3
Consider the simpler example (row sum instead of softmax):
:::

:::{slide}
:label: cs336-06-042-values-005
:at: 4
:until: 5
**`x`** (torch.float32 · 2 × 4)

```python
[[1.0, 2.0, 3.0, 4.0], [5.0, 6.0, 7.0, 8.0]]
```

:::


(cs336-06-section-043)=
## compiled_gelu

:::{slide}
:label: cs336-06-043-values-001
:at: 0
:until: 2
**`x`** (torch.float32 · 2 × 4)

```python
[[1.0, 2.0, 3.0, 4.0], [5.0, 6.0, 7.0, 8.0]]
```


**`y1`** (torch.float32 · 2)

```python
[10.0, 26.0]
```

:::

:::{slide}
:label: cs336-06-043-output-002
:at: 1
![triton-row-sum.png](../source/images/triton-row-sum.png)
:::

:::{slide}
:label: cs336-06-043-values-003
:at: 3
:until: 4
**`x`** (torch.float32 · 2 × 4)

```python
[[1.0, 2.0, 3.0, 4.0], [5.0, 6.0, 7.0, 8.0]]
```


**`y1`** (torch.float32 · 2)

```python
[10.0, 26.0]
```


**`y2`** (torch.float32 · 2)

```python
[10.0, 26.0]
```

:::

:::{slide}
:label: cs336-06-043-output-004
:at: 5
Matrix multiplication is the bread and butter of deep learning.
:::

:::{slide}
:label: cs336-06-043-output-005
:at: 6
How should we build a matmul kernel?
:::


(cs336-06-section-044)=
## compiled_gelu

:::{slide}
:label: cs336-06-044-output-001
:at: 0
```text
|        k                  n
```
:::

:::{slide}
:label: cs336-06-044-output-002
:at: 1
```text
|   [ A1 A2 A3 ]       [ B1 B2 B3 ]   [ C1 C2 C3 ]
```
:::

:::{slide}
:label: cs336-06-044-output-003
:at: 2
```text
| m [ A4 A5 A6 ]  *  k [ B4 B5 B6 ] = [ C4 C5 C6 ]
```
:::

:::{slide}
:label: cs336-06-044-output-004
:at: 3
```text
|   [ A7 A8 A9 ]       [ B7 B8 B9 ]   [ C7 C8 C9 ]
```
:::

:::{slide}
:label: cs336-06-044-output-005
:at: 4
**Naive approach:**
:::


(cs336-06-section-045)=
## compiled_gelu

:::{slide}
:label: cs336-06-045-output-001
:at: 0
Fix any (m, n).
:::

:::{slide}
:label: cs336-06-045-output-002
:at: 1
For each k:
:::

:::{slide}
:label: cs336-06-045-output-003
:at: 2
- Read A[m, k] and B[k, n] from HBM.
:::

:::{slide}
:label: cs336-06-045-output-004
:at: 3
- Multiply and accumulate.
:::

:::{slide}
:label: cs336-06-045-output-005
:at: 4
Write result to C[m, n] in HBM.
:::


(cs336-06-section-046)=
## compiled_gelu

:::{slide}
:label: cs336-06-046-output-001
:at: 0
Bottleneck: M K N reads, M N writes
:::

:::{slide}
:label: cs336-06-046-output-002
:at: 1
Arithmetic intensity: O(1)
:::

:::{slide}
:label: cs336-06-046-output-003
:at: 2
Computing C4 and C5 both need A4, A5, A6.
:::

:::{slide}
:label: cs336-06-046-output-004
:at: 3
Can we read A4, A5, A6 from HBM once to compute both?
:::

:::{slide}
:label: cs336-06-046-output-005
:at: 4
Answer: yes, using shared memory!
:::


(cs336-06-section-047)=
## compiled_gelu

:::{slide}
:label: cs336-06-047-output-001
:at: 0
**Idealized approach:**
:::

:::{slide}
:label: cs336-06-047-output-002
:at: 1
- Load all of A and B into shared memory, then compute C.
:::

:::{slide}
:label: cs336-06-047-output-003
:at: 2
- Now we get M K + K N reads and M N writes.
:::

:::{slide}
:label: cs336-06-047-output-004
:at: 3
- This yields the idealized O(N) arithmetic intensity from before.
:::

:::{slide}
:label: cs336-06-047-output-005
:at: 4
- However, A and B are usually too large to fit in shared memory.
:::


(cs336-06-section-048)=
## compiled_gelu

:::{slide}
:label: cs336-06-048-output-001
:at: 0
**Tiling:**
:::

:::{slide}
:label: cs336-06-048-output-002
:at: 1
![gemm_tiled.png](../source/images/gemm_tiled.png)
:::

:::{slide}
:label: cs336-06-048-output-003
:at: 2
Key idea: divide the matrix C into output tiles (thread blocks).
:::

:::{slide}
:label: cs336-06-048-output-004
:at: 3
Fix an output tile in C.
:::

:::{slide}
:label: cs336-06-048-output-005
:at: 4
For each pair of (row tile of A, column tile of B):
:::


(cs336-06-section-049)=
## compiled_gelu

:::{slide}
:label: cs336-06-049-output-001
:at: 0
- Load the corresponding A tile and B tile from HBM into shared memory.
:::

:::{slide}
:label: cs336-06-049-output-002
:at: 1
- Perform matrix multiplication on the tiles.
:::

:::{slide}
:label: cs336-06-049-output-003
:at: 2
- Accumulate into the partial sum (in shared memory).
:::

:::{slide}
:label: cs336-06-049-output-004
:at: 3
Write output tile to HBM.
:::

:::{slide}
:label: cs336-06-049-output-005
:at: 4
Arithmetic intensity: O(tile_size).
:::


(cs336-06-section-050)=
## compiled_gelu

:::{slide}
:label: cs336-06-050-output-001
:at: 0
Bonus:
:::

:::{slide}
:label: cs336-06-050-output-002
:at: 1
- Often, you want to apply an elementwise activation function.
:::

:::{slide}
:label: cs336-06-050-output-003
:at: 2
- Example: GeLU(A @ B)
:::

:::{slide}
:label: cs336-06-050-output-004
:at: 3
- Solution: kernel fusion!
:::

:::{slide}
:label: cs336-06-050-output-005
:at: 4
**Implementation.**
:::


(cs336-06-section-051)=
## compiled_gelu

:::{slide}
:label: cs336-06-051-output-001
:at: 0
Review: each matrix is linearized in memory
:::

:::{slide}
:label: cs336-06-051-values-002
:at: 1
:until: 2
**`x`** (torch.float32 · 2 × 4)

```python
[[0.0, 1.0, 2.0, 3.0], [4.0, 5.0, 6.0, 7.0]]
```

:::

:::{slide}
:label: cs336-06-051-values-003
:at: 2
:until: 3
| Variable | Value |
| --- | --- |
| `stride_row` | 4 |
| `stride_col` | 1 |

**`x`** (torch.float32 · 2 × 4)

```python
[[0.0, 1.0, 2.0, 3.0], [4.0, 5.0, 6.0, 7.0]]
```

:::

:::{slide}
:label: cs336-06-051-values-004
:at: 3
:until: 4
| Variable | Value |
| --- | --- |
| `stride_row` | 4 |
| `stride_col` | 1 |
| `index` | 6 |

**`x`** (torch.float32 · 2 × 4)

```python
[[0.0, 1.0, 2.0, 3.0], [4.0, 5.0, 6.0, 7.0]]
```

:::

:::{slide}
:label: cs336-06-051-values-005
:at: 5
:until: 6
| Variable | Value |
| --- | --- |
| `stride_row` | 4 |
| `stride_col` | 1 |
| `index` | 6 |

**`x`** (torch.float32 · 2 × 4)

```python
[[0.0, 1.0, 2.0, 3.0], [4.0, 5.0, 6.0, 7.0]]
```

:::

:::{slide}
:label: cs336-06-051-output-006
:at: 7
Summary:
:::


(cs336-06-section-052)=
## compiled_gelu

:::{slide}
:label: cs336-06-052-output-001
:at: 0
- Know the programming model (PyTorch, Triton, PTX) to give you correctness
:::

:::{slide}
:label: cs336-06-052-output-002
:at: 1
- Understand the hardware (SMs, warps, occupancy, bank conflicts, etc.) to optimize performance
:::

:::{slide}
:label: cs336-06-052-output-003
:at: 2
- Benchmark to understand scaling
:::

:::{slide}
:label: cs336-06-052-output-004
:at: 3
- Profile to see what's being executed for how long
:::

:::{slide}
:label: cs336-06-052-output-005
:at: 4
- Triton: think in terms of thread blocks (read to shared memory, do stuff (fusion), write back HBM)
:::


(cs336-06-section-053)=
## compiled_gelu

:::{slide}
:label: cs336-06-053-output-001
:at: 0
- Examples: GeLU (elementwise), softmax (row-wise), row sum (baby tiling), matmul (tiling)
:::

:::{slide}
:label: cs336-06-053-output-002
:at: 1
Next time: more than one GPU!
:::

