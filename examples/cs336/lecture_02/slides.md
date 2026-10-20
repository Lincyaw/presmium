---
title: "CS336 Lecture 02: Resource accounting"
lang: en
plugins:
  - '@lincyaw/slidev-addon-core'
  - '@lincyaw/slidev-addon-content'
renderers:
  slides: {}
---

(cs336-02-cover)=
# Lecture 02: Resource accounting

Stanford CS336 · Language Modeling from Scratch · Spring 2026.


(cs336-02-section-001)=
## Resource accounting

:::{slide}
:label: cs336-02-001-output-001
:at: 0
Announcements:
:::

:::{slide}
:label: cs336-02-001-output-002
:at: 1
- Join the CS336 slack
:::

:::{slide}
:label: cs336-02-001-output-003
:at: 2
- Sign up on Modal with your **Stanford** email
:::

:::{slide}
:label: cs336-02-001-output-004
:at: 3
- Read the [AI policy guide](https://docs.google.com/document/d/1SZAlExB1qAc9izHt54gwunNpjKE6wXb8Y7yA_e-baK8/edit?tab=t.0)
:::

:::{slide}
:label: cs336-02-001-output-005
:at: 4
- Read the [cluster guide](https://docs.google.com/document/d/1cHE0iKVyXLJ3XpIs2XuXTmZ-HMmPk2hIPeCvy-AydMg/edit?tab=t.otis27tacaef)
:::


(cs336-02-section-002)=
## Resource accounting

:::{slide}
:label: cs336-02-002-output-001
:at: 0
Marin 1e23 FLOPs run finished and [matched forecasts](https://x.com/WilliamBarrHeld/status/2039373983632814318)!
:::

:::{slide}
:label: cs336-02-002-output-002
:at: 1
![image-75df5937a21eff96383d1c7c2ff05132-https_pbs_twimg_com_media_HE1P1HmaUAAjLXF_format_jpg_name_medium](../assets/820157e9f3f25829700e0dd3.jpg)
:::

:::{slide}
:label: cs336-02-002-output-003
:at: 2
Last lecture: overview, tokenization
:::

:::{slide}
:label: cs336-02-002-output-004
:at: 3
Today: resource accounting (systems)
:::

:::{slide}
:label: cs336-02-002-output-005
:at: 4
Recall: what's the best model one can train given fixed resources (compute, memory)?
:::


(cs336-02-section-003)=
## Resource accounting

:::{slide}
:label: cs336-02-003-output-001
:at: 0
In other words: maximize (computational) **efficiency**.
:::

:::{slide}
:label: cs336-02-003-output-002
:at: 1
Prerequisite: understand the resources (compute, memory) for a given computation.
:::

:::{slide}
:label: cs336-02-003-output-003
:at: 2
**Question**: How long would it take to train a 70B parameter model on 15T tokens on 1024 H100s?
:::

:::{slide}
:label: cs336-02-003-values-004
:at: 3
:until: 4
| Variable | Value |
| --- | --- |
| `total_flops` | 6.3e+24 |
:::

:::{slide}
:label: cs336-02-003-values-005
:at: 4
| Variable | Value |
| --- | --- |
| `total_flops` | 6.3e+24 |
| `flops_per_day` | 4.37723136e+22 |
:::


(cs336-02-section-004)=
## Resource accounting

:::{slide}
:label: cs336-02-004-values-001
:at: 0
:until: 2
| Variable | Value |
| --- | --- |
| `total_flops` | 6.3e+24 |
| `flops_per_day` | 4.37723136e+22 |
| `days` | 143.92659381842682 |
:::

:::{slide}
:label: cs336-02-004-output-002
:at: 1
**Question**: What's the largest model that can you can train on 8 H100s using AdamW?
:::

:::{slide}
:label: cs336-02-004-values-003
:at: 2
:until: 3
| Variable | Value |
| --- | --- |
| `total_flops` | 6.3e+24 |
| `flops_per_day` | 4.37723136e+22 |
| `days` | 143.92659381842682 |
| `h100_bytes` | 80000000000.0 |
:::

:::{slide}
:label: cs336-02-004-values-004
:at: 3
:until: 4
| Variable | Value |
| --- | --- |
| `total_flops` | 6.3e+24 |
| `flops_per_day` | 4.37723136e+22 |
| `days` | 143.92659381842682 |
| `h100_bytes` | 80000000000.0 |
| `bytes_per_parameter` | 12 |
:::

:::{slide}
:label: cs336-02-004-values-005
:at: 4
| Variable | Value |
| --- | --- |
| `total_flops` | 6.3e+24 |
| `flops_per_day` | 4.37723136e+22 |
| `days` | 143.92659381842682 |
| `h100_bytes` | 80000000000.0 |
| `bytes_per_parameter` | 12 |
| `num_parameters` | 53333333333.333336 |
:::


(cs336-02-section-005)=
## Resource accounting

:::{slide}
:label: cs336-02-005-output-001
:at: 0
Caveat: activations are not accounted for (depends on batch size and sequence length), so this is an upper bound.
:::

:::{slide}
:label: cs336-02-005-values-002
:at: 0
:until: 3
| Variable | Value |
| --- | --- |
| `total_flops` | 6.3e+24 |
| `flops_per_day` | 4.37723136e+22 |
| `days` | 143.92659381842682 |
| `h100_bytes` | 80000000000.0 |
| `bytes_per_parameter` | 12 |
| `num_parameters` | 53333333333.333336 |
:::

:::{slide}
:label: cs336-02-005-output-003
:at: 1
This is a rough back-of-the-envelope calculation.
:::

:::{slide}
:label: cs336-02-005-output-004
:at: 2
But it gives you the flavor of napkin math one can quickly do to get a sense of resources.
:::

:::{slide}
:label: cs336-02-005-output-005
:at: 4
What knowledge to take away from this lecture:
:::

:::{slide}
:label: cs336-02-005-output-006
:at: 5
- Mechanics: straightforward (PyTorch semantics)
:::


(cs336-02-section-006)=
## Resource accounting

:::{slide}
:label: cs336-02-006-output-001
:at: 0
- Mindset: resource accounting (remember to do it)
:::

:::{slide}
:label: cs336-02-006-output-002
:at: 1
- Intuitions: get a sense of how resources are spent, no ML magic today
:::

:::{slide}
:label: cs336-02-006-output-003
:at: 2
Tensors are the basic building block for storing everything:
:::

:::{slide}
:label: cs336-02-006-output-004
:at: 3
- data
:::

:::{slide}
:label: cs336-02-006-output-005
:at: 4
- parameters
:::


(cs336-02-section-007)=
## Resource accounting

:::{slide}
:label: cs336-02-007-output-001
:at: 0
- gradients
:::

:::{slide}
:label: cs336-02-007-output-002
:at: 1
- optimizer state
:::

:::{slide}
:label: cs336-02-007-output-003
:at: 2
- activations
:::

:::{slide}
:label: cs336-02-007-output-004
:at: 3
Example: parameters of the DeepSeek v3.2 model 

[DeepSeek-AI+ 2025](https://arxiv.org/abs/2512.02556)
:::

:::{slide}
:label: cs336-02-007-output-005
:at: 4
[DeepSeek v3.2 model on Hugging Face](https://huggingface.co/deepseek-ai/DeepSeek-V3.2?show_file_info=model.safetensors.index.json)
:::


(cs336-02-section-008)=
## Resource accounting

:::{slide}
:label: cs336-02-008-output-001
:at: 0
Each tensor has a rank, which is the number of dimensions.
:::

:::{slide}
:label: cs336-02-008-values-002
:at: 1
:until: 2
**`x`** (torch.float32 · 4)

```python
[0.0, 0.0, 0.0, 0.0]
```

:::

:::{slide}
:label: cs336-02-008-values-003
:at: 2
:until: 3
**`x`** (torch.float32 · 4 × 8)

```python
[[0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
 [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]]
```

:::

:::{slide}
:label: cs336-02-008-values-004
:at: 3
:until: 5
**`x`** (torch.float32 · 4 × 8 × 2)

```python
[[[0.0, 0.0], [0.0, 0.0], [0.0, 0.0], [0.0, 0.0], [0.0, 0.0], [0.0, 0.0], [0.0, 0.0],
  [0.0, 0.0]],
 [[0.0, 0.0], [0.0, 0.0], [0.0, 0.0], [0.0, 0.0], [0.0, 0.0], [0.0, 0.0], [0.0, 0.0],
  [0.0, 0.0]],
 [[0.0, 0.0], [0.0, 0.0], [0.0, 0.0], [0.0, 0.0], [0.0, 0.0], [0.0, 0.0], [0.0, 0.0],
  [0.0, 0.0]],
 [[0.0, 0.0], [0.0, 0.0], [0.0, 0.0], [0.0, 0.0], [0.0, 0.0], [0.0, 0.0], [0.0, 0.0],
  [0.0, 0.0]]]
```

:::

:::{slide}
:label: cs336-02-008-output-005
:at: 4
In Transformers, will see tensors of rank 4:
:::


(cs336-02-section-009)=
## Resource accounting

:::{slide}
:label: cs336-02-009-output-001
:at: 0
Elements of tensors are generally floating point numbers.
:::


(cs336-02-section-010)=
## fp32

:::{slide}
:label: cs336-02-010-output-001
:at: 0
[Wikipedia](https://en.wikipedia.org/wiki/Single-precision_floating-point_format)
:::

:::{slide}
:label: cs336-02-010-output-002
:at: 1
![fp32.png](../source/images/fp32.png)
:::

:::{slide}
:label: cs336-02-010-output-003
:at: 2
The fp32 data type (also known as float32 or single precision) is the default.
:::

:::{slide}
:label: cs336-02-010-output-004
:at: 3
Traditionally, in scientific computing, fp32 is the baseline; you could use double precision (fp64) in some cases.
:::


(cs336-02-section-011)=
## fp32

:::{slide}
:label: cs336-02-011-output-001
:at: 0
In deep learning, you can be a lot sloppier.
:::

:::{slide}
:label: cs336-02-011-output-002
:at: 1
Let's examine memory usage of these tensors.
:::

:::{slide}
:label: cs336-02-011-output-003
:at: 2
Memory is determined by the (i) number of values and (ii) data type of each value.
:::

:::{slide}
:label: cs336-02-011-values-004
:at: 3
:until: 4
**`x`** (torch.float32 · 4 × 8)

```python
[[0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
 [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]]
```

:::

:::{slide}
:label: cs336-02-011-values-005
:at: 5
**`x`** (torch.float32 · 4 × 8)

```python
[[0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
 [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]]
```

:::

:::{slide}
:label: cs336-02-011-output-006
:at: 6
One matrix in the feedforward layer of GPT-3:
:::


(cs336-02-section-012)=
## fp16

:::{slide}
:label: cs336-02-012-values-001
:at: 0
:until: 4
**`x`** (torch.float32 · 4 × 8)

```python
[[0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
 [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]]
```

:::

:::{slide}
:label: cs336-02-012-output-002
:at: 1
[Wikipedia](https://en.wikipedia.org/wiki/Half-precision_floating-point_format)
:::

:::{slide}
:label: cs336-02-012-output-003
:at: 2
![fp16.png](../source/images/fp16.png)
:::

:::{slide}
:label: cs336-02-012-output-004
:at: 3
The fp16 data type (also known as float16 or half precision) cuts down the memory.
:::

:::{slide}
:label: cs336-02-012-values-005
:at: 4
**`x`** (torch.float16 · 4 × 8)

```python
[[0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
 [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]]
```

:::


(cs336-02-section-013)=
## fp16

:::{slide}
:label: cs336-02-013-output-001
:at: 0
However, the dynamic range (especially for small numbers) isn't great.
:::

:::{slide}
:label: cs336-02-013-values-002
:at: 0
:until: 1
**`x`** (torch.float16 · 4 × 8)

```python
[[0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
 [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]]
```

:::

:::{slide}
:label: cs336-02-013-values-003
:at: 1
**`x`** (torch.float16 · 1)

```python
[0.0]
```

:::

:::{slide}
:label: cs336-02-013-output-004
:at: 2
If this happens when you train, you can get instability.
:::


(cs336-02-section-014)=
## bf16

:::{slide}
:label: cs336-02-014-values-001
:at: 0
**`x`** (torch.float16 · 1)

```python
[0.0]
```

:::

:::{slide}
:label: cs336-02-014-output-002
:at: 1
[Wikipedia](https://en.wikipedia.org/wiki/Bfloat16_floating-point_format)
:::

:::{slide}
:label: cs336-02-014-output-003
:at: 2
![bf16.png](../source/images/bf16.png)
:::

:::{slide}
:label: cs336-02-014-output-004
:at: 3
Google Brain developed brain floating point (bf16) in 2018 to address this issue.
:::

:::{slide}
:label: cs336-02-014-output-005
:at: 4
bf16 uses the same memory as fp16 but has the same dynamic range as fp32!
:::


(cs336-02-section-015)=
## bf16

:::{slide}
:label: cs336-02-015-output-001
:at: 0
The only catch is that the resolution is worse, but this matters less for deep learning.
:::

:::{slide}
:label: cs336-02-015-values-002
:at: 0
:until: 1
**`x`** (torch.float16 · 1)

```python
[0.0]
```

:::

:::{slide}
:label: cs336-02-015-values-003
:at: 1
**`x`** (torch.bfloat16 · 1)

```python
[1.0011717677116394e-08]
```

:::


(cs336-02-section-016)=
## Mixed precision

:::{slide}
:label: cs336-02-016-values-001
:at: 0
**`x`** (torch.bfloat16 · 1)

```python
[1.0011717677116394e-08]
```

:::

:::{slide}
:label: cs336-02-016-output-002
:at: 1
Implications on training:
:::

:::{slide}
:label: cs336-02-016-output-003
:at: 2
- Training with fp32 works, but requires lots of memory.
:::

:::{slide}
:label: cs336-02-016-output-004
:at: 3
- Training with fp16 and even bf16 is risky, and you can get instability.
:::

:::{slide}
:label: cs336-02-016-output-005
:at: 4
Solution: mixed precision training 

[Micikevicius+ 2017](https://arxiv.org/pdf/1710.03740.pdf)
:::


(cs336-02-section-017)=
## Mixed precision

:::{slide}
:label: cs336-02-017-output-001
:at: 0
- Use bf16 for parameters, activations, and gradients
:::

:::{slide}
:label: cs336-02-017-values-002
:at: 0
:until: 4
**`x`** (torch.bfloat16 · 1)

```python
[1.0011717677116394e-08]
```

:::

:::{slide}
:label: cs336-02-017-output-003
:at: 1
- Use fp32 for optimizer states
:::

:::{slide}
:label: cs336-02-017-output-004
:at: 2
Pytorch has an automatic mixed precision (AMP) library. 

[docs](https://pytorch.org/docs/stable/amp.html)
:::

:::{slide}
:label: cs336-02-017-output-005
:at: 3
Tries to cast things into bf16 when safe (matmuls, not exp).
:::

:::{slide}
:label: cs336-02-017-values-006
:at: 4
**`x`** (torch.float32 · 4 × 8)

```python
[[0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
 [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]]
```

:::


(cs336-02-section-018)=
## fp8

:::{slide}
:label: cs336-02-018-values-001
:at: 0
**`x`** (torch.float32 · 4 × 8)

```python
[[0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
 [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]]
```

:::

:::{slide}
:label: cs336-02-018-output-002
:at: 1
In 2022, fp8 was standardized, motivated by machine learning workloads [primer](https://docs.nvidia.com/deeplearning/transformer-engine/user-guide/examples/fp8_primer.html).
:::

:::{slide}
:label: cs336-02-018-output-003
:at: 2
![image-df6d7649a3bdb77cfdc38092d8387a99-https_docs_nvidia_com_deeplearning_transformer-engine_user-guide__images_fp8_formats_png](../assets/975d48f49f46ee22524541e4.png)
:::

:::{slide}
:label: cs336-02-018-output-004
:at: 3
H100s support two variants of FP8: E4M3 (range [-448, 448]) and E5M2 ([-57344, 57344]).
:::

:::{slide}
:label: cs336-02-018-output-005
:at: 4
Reference: 

[Micikevicius+ 2022](https://arxiv.org/pdf/2209.05433.pdf)
:::


(cs336-02-section-019)=
## fp4

:::{slide}
:label: cs336-02-019-values-001
:at: 0
**`x`** (torch.float32 · 4 × 8)

```python
[[0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
 [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]]
```

:::

:::{slide}
:label: cs336-02-019-output-002
:at: 1
In 2025, NVIDIA developed [nvfp4](https://developer.nvidia.com/blog/introducing-nvfp4-for-efficient-and-accurate-low-precision-inference/)
:::

:::{slide}
:label: cs336-02-019-output-003
:at: 2
Only 4 bits per value!
:::

:::{slide}
:label: cs336-02-019-output-004
:at: 3
Values: -6, -4, -3, -2, -1.5, -1.0, -0.5, 0.0, 0.5, 1.0, 1.5, 2, 3, 4, 6
:::

:::{slide}
:label: cs336-02-019-output-005
:at: 4
Use a separate scale factor per block, so actually get more dynamic range (but just can't vary freely from neighbors).
:::


(cs336-02-section-020)=
## fp4

:::{slide}
:label: cs336-02-020-output-001
:at: 0
Nemotron 3 Super was trained in NVFP4 

[Nemotron 3 Super: Open, Efficient Mixture-of-Experts Hybrid Mamba-Transformer Model for Agentic Reasoning](https://research.nvidia.com/labs/nemotron/files/NVIDIA-Nemotron-3-Super-Technical-Report.pdf)
:::

:::{slide}
:label: cs336-02-020-values-002
:at: 0
:until: 2
**`x`** (torch.float32 · 4 × 8)

```python
[[0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
 [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]]
```

:::

:::{slide}
:label: cs336-02-020-output-003
:at: 1
Some of this is done in NVIDIA libraries outside of user control.
:::

:::{slide}
:label: cs336-02-020-output-004
:at: 3
By default, tensors are stored in CPU memory.
:::

:::{slide}
:label: cs336-02-020-output-005
:at: 4
However, what about GPUs?
:::

:::{slide}
:label: cs336-02-020-output-006
:at: 5
![cpu-gpu.png](../source/images/cpu-gpu.png)
:::


(cs336-02-section-021)=
## fp4

:::{slide}
:label: cs336-02-021-values-001
:at: 0
:until: 3
| Variable | Value |
| --- | --- |
| `device` | cuda:0 |
:::

:::{slide}
:label: cs336-02-021-output-002
:at: 1
In order to take advantage of the massive parallelism of GPUs, we need to move them to GPU memory.
:::

:::{slide}
:label: cs336-02-021-output-003
:at: 2
Or create the tensor directly on the GPU:
:::

:::{slide}
:label: cs336-02-021-output-004
:at: 4
Traditional PyTorch code:
:::

:::{slide}
:label: cs336-02-021-values-005
:at: 5
**`x`** (torch.float32 · 2 × 2 × 3)

```python
[[[1.0, 1.0, 1.0], [1.0, 1.0, 1.0]], [[1.0, 1.0, 1.0], [1.0, 1.0, 1.0]]]
```

:::


(cs336-02-section-022)=
## fp4

:::{slide}
:label: cs336-02-022-values-001
:at: 0
:until: 1
**`x`** (torch.float32 · 2 × 2 × 3)

```python
[[[1.0, 1.0, 1.0], [1.0, 1.0, 1.0]], [[1.0, 1.0, 1.0], [1.0, 1.0, 1.0]]]
```


**`y`** (torch.float32 · 2 × 2 × 3)

```python
[[[1.0, 1.0, 1.0], [1.0, 1.0, 1.0]], [[1.0, 1.0, 1.0], [1.0, 1.0, 1.0]]]
```

:::

:::{slide}
:label: cs336-02-022-values-002
:at: 1
:until: 3
**`x`** (torch.float32 · 2 × 2 × 3)

```python
[[[1.0, 1.0, 1.0], [1.0, 1.0, 1.0]], [[1.0, 1.0, 1.0], [1.0, 1.0, 1.0]]]
```


**`y`** (torch.float32 · 2 × 2 × 3)

```python
[[[1.0, 1.0, 1.0], [1.0, 1.0, 1.0]], [[1.0, 1.0, 1.0], [1.0, 1.0, 1.0]]]
```


**`z`** (torch.float32 · 2 × 2 × 2)

```python
[[[3.0, 3.0], [3.0, 3.0]], [[3.0, 3.0], [3.0, 3.0]]]
```

:::

:::{slide}
:label: cs336-02-022-output-003
:at: 2
Easy to mess up the dimensions (what is -2, -1?)...
:::

:::{slide}
:label: cs336-02-022-output-004
:at: 4
Einops is a library for manipulating tensors where dimensions are named.
:::

:::{slide}
:label: cs336-02-022-output-005
:at: 5
It is inspired by Einstein summation notation (Einstein, 1916).
:::


(cs336-02-section-023)=
## fp4

:::{slide}
:label: cs336-02-023-output-001
:at: 0
[Einops tutorial](https://einops.rocks/1-einops-basics/)
:::

:::{slide}
:label: cs336-02-023-output-002
:at: 1
Einsum is generalized matrix multiplication with good bookkeeping.
:::

:::{slide}
:label: cs336-02-023-values-003
:at: 2
:until: 3
**`x`** (torch.float32 · 3 × 4)

```python
[[1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0]]
```

:::

:::{slide}
:label: cs336-02-023-values-004
:at: 3
:until: 4
**`x`** (torch.float32 · 3 × 4)

```python
[[1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0]]
```


**`y`** (torch.float32 · 4 × 3)

```python
[[1.0, 1.0, 1.0], [1.0, 1.0, 1.0], [1.0, 1.0, 1.0], [1.0, 1.0, 1.0]]
```

:::

:::{slide}
:label: cs336-02-023-values-005
:at: 4
**`x`** (torch.float32 · 3 × 4)

```python
[[1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0]]
```


**`y`** (torch.float32 · 4 × 3)

```python
[[1.0, 1.0, 1.0], [1.0, 1.0, 1.0], [1.0, 1.0, 1.0], [1.0, 1.0, 1.0]]
```


**`z`** (torch.float32 · 3 × 3)

```python
[[4.0, 4.0, 4.0], [4.0, 4.0, 4.0], [4.0, 4.0, 4.0]]
```

:::


(cs336-02-section-024)=
## fp4

:::{slide}
:label: cs336-02-024-output-001
:at: 0
Let's try a more complex example...
:::

:::{slide}
:label: cs336-02-024-values-002
:at: 1
:until: 2
**`x`** (torch.float32 · 2 × 3 × 4)

```python
[[[1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0]],
 [[1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0]]]
```

:::

:::{slide}
:label: cs336-02-024-values-003
:at: 2
:until: 3
**`x`** (torch.float32 · 2 × 3 × 4)

```python
[[[1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0]],
 [[1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0]]]
```


**`y`** (torch.float32 · 2 × 3 × 4)

```python
[[[1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0]],
 [[1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0]]]
```

:::

:::{slide}
:label: cs336-02-024-values-004
:at: 3
**`x`** (torch.float32 · 2 × 3 × 4)

```python
[[[1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0]],
 [[1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0]]]
```


**`y`** (torch.float32 · 2 × 3 × 4)

```python
[[[1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0]],
 [[1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0]]]
```


**`z`** (torch.float32 · 2 × 3 × 3)

```python
[[[4.0, 4.0, 4.0], [4.0, 4.0, 4.0], [4.0, 4.0, 4.0]],
 [[4.0, 4.0, 4.0], [4.0, 4.0, 4.0], [4.0, 4.0, 4.0]]]
```

:::


(cs336-02-section-025)=
## fp4

:::{slide}
:label: cs336-02-025-output-001
:at: 0
Dimensions that are not named in the output are summed over.
:::

:::{slide}
:label: cs336-02-025-values-002
:at: 0
:until: 1
**`x`** (torch.float32 · 2 × 3 × 4)

```python
[[[1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0]],
 [[1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0]]]
```


**`y`** (torch.float32 · 2 × 3 × 4)

```python
[[[1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0]],
 [[1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0]]]
```


**`z`** (torch.float32 · 2 × 3 × 3)

```python
[[[4.0, 4.0, 4.0], [4.0, 4.0, 4.0], [4.0, 4.0, 4.0]],
 [[4.0, 4.0, 4.0], [4.0, 4.0, 4.0], [4.0, 4.0, 4.0]]]
```

:::

:::{slide}
:label: cs336-02-025-output-003
:at: 2
You can reduce a single tensor via some operation (e.g., sum, mean, max, min).
:::

:::{slide}
:label: cs336-02-025-values-004
:at: 3
:until: 4
**`x`** (torch.float32 · 2 × 3 × 4)

```python
[[[1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0]],
 [[1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0]]]
```

:::

:::{slide}
:label: cs336-02-025-values-005
:at: 4
:until: 5
**`x`** (torch.float32 · 2 × 3 × 4)

```python
[[[1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0]],
 [[1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0]]]
```


**`y`** (torch.float32 · 2 × 3)

```python
[[4.0, 4.0, 4.0], [4.0, 4.0, 4.0]]
```

:::

:::{slide}
:label: cs336-02-025-output-006
:at: 6
Sometimes, a dimension represents two dimensions
:::


(cs336-02-section-026)=
## fp4

:::{slide}
:label: cs336-02-026-output-001
:at: 0
...and you want to operate on one of them.
:::

:::{slide}
:label: cs336-02-026-values-002
:at: 1
:until: 3
**`x`** (torch.float32 · 3 × 8)

```python
[[1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
 [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0]]
```

:::

:::{slide}
:label: cs336-02-026-output-003
:at: 2
...where `total_hidden` is a flattened representation of `heads * hidden1`
:::

:::{slide}
:label: cs336-02-026-values-004
:at: 3
:until: 4
**`x`** (torch.float32 · 3 × 8)

```python
[[1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
 [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0]]
```


**`w`** (torch.float32 · 4 × 4)

```python
[[1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0]]
```

:::

:::{slide}
:label: cs336-02-026-values-005
:at: 4
**`x`** (torch.float32 · 3 × 2 × 4)

```python
[[[1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0]],
 [[1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0]],
 [[1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0]]]
```


**`w`** (torch.float32 · 4 × 4)

```python
[[1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0]]
```

:::


(cs336-02-section-027)=
## fp4

:::{slide}
:label: cs336-02-027-values-001
:at: 0
:until: 1
**`x`** (torch.float32 · 3 × 2 × 4)

```python
[[[4.0, 4.0, 4.0, 4.0], [4.0, 4.0, 4.0, 4.0]],
 [[4.0, 4.0, 4.0, 4.0], [4.0, 4.0, 4.0, 4.0]],
 [[4.0, 4.0, 4.0, 4.0], [4.0, 4.0, 4.0, 4.0]]]
```


**`w`** (torch.float32 · 4 × 4)

```python
[[1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0]]
```

:::

:::{slide}
:label: cs336-02-027-values-002
:at: 1
:until: 2
**`x`** (torch.float32 · 3 × 8)

```python
[[4.0, 4.0, 4.0, 4.0, 4.0, 4.0, 4.0, 4.0], [4.0, 4.0, 4.0, 4.0, 4.0, 4.0, 4.0, 4.0],
 [4.0, 4.0, 4.0, 4.0, 4.0, 4.0, 4.0, 4.0]]
```


**`w`** (torch.float32 · 4 × 4)

```python
[[1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0]]
```

:::

:::{slide}
:label: cs336-02-027-output-003
:at: 3
Having gone through all the operations, let us examine their computational cost.
:::

:::{slide}
:label: cs336-02-027-output-004
:at: 4
A floating-point operation (FLOP) is a basic operation like addition (x + y) or multiplication (x y).
:::

:::{slide}
:label: cs336-02-027-output-005
:at: 5
Two terribly confusing acronyms (pronounced the same!):
:::


(cs336-02-section-028)=
## fp4

:::{slide}
:label: cs336-02-028-output-001
:at: 0
- FLOPs: floating-point operations (measure of computation done)
:::

:::{slide}
:label: cs336-02-028-output-002
:at: 1
- FLOP/s: floating-point operations per second (also written as FLOPS), which is used to measure the speed of hardware.
:::


(cs336-02-section-029)=
## Intuitions

:::{slide}
:label: cs336-02-029-output-001
:at: 0
Training GPT-3 (2020) took 3.14e23 FLOPs. 

[article](https://lambdalabs.com/blog/demystifying-gpt-3)
:::

:::{slide}
:label: cs336-02-029-output-002
:at: 1
Training GPT-4 (2023) is speculated to take 2e25 FLOPs. 

[article](https://patmcguinness.substack.com/p/gpt-4-details-revealed)
:::

:::{slide}
:label: cs336-02-029-output-003
:at: 2
H100 has a peak performance of 1979 teraFLOP/s with sparsity, 50% without 

[spec](https://resources.nvidia.com/en-us-tensor-core/nvidia-tensor-core-gpu-datasheet)
:::

:::{slide}
:label: cs336-02-029-output-004
:at: 3
8 H100s for 2 weeks:
:::


(cs336-02-section-030)=
## Intuitions

:::{slide}
:label: cs336-02-030-values-001
:at: 0
| Variable | Value |
| --- | --- |
| `total_flops` | 9.5751936e+21 |
:::


(cs336-02-section-031)=
## Linear model

:::{slide}
:label: cs336-02-031-values-001
:at: 0
:until: 3
| Variable | Value |
| --- | --- |
| `total_flops` | 9.5751936e+21 |
:::

:::{slide}
:label: cs336-02-031-output-002
:at: 1
How many FLOPs is this matmul?
:::

:::{slide}
:label: cs336-02-031-output-003
:at: 2
We have one multiplication (x[i][j] * w[j][k]) and one addition per (i, j, k) triple.
:::

:::{slide}
:label: cs336-02-031-values-004
:at: 3
:until: 5
| Variable | Value |
| --- | --- |
| `total_flops` | 9.5751936e+21 |
| `actual_num_flops` | 8796093022208 |
:::

:::{slide}
:label: cs336-02-031-output-005
:at: 4
We can also time this operation to see how long it takes.
:::


(cs336-02-section-032)=
## Linear model

:::{slide}
:label: cs336-02-032-values-001
:at: 0
:until: 2
| Variable | Value |
| --- | --- |
| `total_flops` | 9.5751936e+21 |
| `actual_num_flops` | 8796093022208 |
| `actual_time` | 0.16473602780000007 |
:::

:::{slide}
:label: cs336-02-032-output-002
:at: 1
The actual FLOP/s of this operation:
:::

:::{slide}
:label: cs336-02-032-values-003
:at: 2
| Variable | Value |
| --- | --- |
| `total_flops` | 9.5751936e+21 |
| `actual_num_flops` | 8796093022208 |
| `actual_time` | 0.16473602780000007 |
| `actual_flop_per_sec` | 53395077808280.12 |
:::

:::{slide}
:label: cs336-02-032-output-004
:at: 3
Each GPU has a specification sheet that provides the peak performance.
:::

:::{slide}
:label: cs336-02-032-output-005
:at: 4
- Example: 

[H100 spec](https://resources.nvidia.com/en-us-gpu-resources/h100-datasheet-24306)
:::


(cs336-02-section-033)=
## Linear model

:::{slide}
:label: cs336-02-033-output-001
:at: 0
Note that the FLOP/s depends heavily on the data type!
:::

:::{slide}
:label: cs336-02-033-values-002
:at: 0
:until: 1
| Variable | Value |
| --- | --- |
| `total_flops` | 9.5751936e+21 |
| `actual_num_flops` | 8796093022208 |
| `actual_time` | 0.16473602780000007 |
| `actual_flop_per_sec` | 53395077808280.12 |
:::

:::{slide}
:label: cs336-02-033-values-003
:at: 2
:until: 3
| Variable | Value |
| --- | --- |
| `properties.name` | NVIDIA H100 80GB HBM3 |
:::

:::{slide}
:label: cs336-02-033-values-004
:at: 3
| Variable | Value |
| --- | --- |
| `total_flops` | 9.5751936e+21 |
| `actual_num_flops` | 8796093022208 |
| `actual_time` | 0.16473602780000007 |
| `actual_flop_per_sec` | 53395077808280.12 |
| `promised_flop_per_sec` | 67500000000000.0 |
:::


(cs336-02-section-034)=
## Model FLOPs utilization (MFU)

:::{slide}
:label: cs336-02-034-values-001
:at: 0
:until: 2
| Variable | Value |
| --- | --- |
| `total_flops` | 9.5751936e+21 |
| `actual_num_flops` | 8796093022208 |
| `actual_time` | 0.16473602780000007 |
| `actual_flop_per_sec` | 53395077808280.12 |
| `promised_flop_per_sec` | 67500000000000.0 |
:::

:::{slide}
:label: cs336-02-034-output-002
:at: 1
Definition: MFU = (actual FLOP/s) / (promised FLOP/s) [ignore communication/overhead]
:::

:::{slide}
:label: cs336-02-034-values-003
:at: 2
| Variable | Value |
| --- | --- |
| `total_flops` | 9.5751936e+21 |
| `actual_num_flops` | 8796093022208 |
| `actual_time` | 0.16473602780000007 |
| `actual_flop_per_sec` | 53395077808280.12 |
| `promised_flop_per_sec` | 67500000000000.0 |
| `mfu` | 0.791038189752298 |
:::

:::{slide}
:label: cs336-02-034-output-004
:at: 3
Usually, MFU of ≥ 0.5 is quite good!
:::

:::{slide}
:label: cs336-02-034-output-005
:at: 4
But why is MFU not closer to 1?
:::


(cs336-02-section-035)=
## Model FLOPs utilization (MFU)

:::{slide}
:label: cs336-02-035-output-001
:at: 0
To answer this question, we need to look more closely at how computations are done on GPUs...
:::

:::{slide}
:label: cs336-02-035-values-002
:at: 0
:until: 1
| Variable | Value |
| --- | --- |
| `total_flops` | 9.5751936e+21 |
| `actual_num_flops` | 8796093022208 |
| `actual_time` | 0.16473602780000007 |
| `actual_flop_per_sec` | 53395077808280.12 |
| `promised_flop_per_sec` | 67500000000000.0 |
| `mfu` | 0.791038189752298 |
:::

:::{slide}
:label: cs336-02-035-output-003
:at: 2
![compute-memory.png](../source/images/compute-memory.png)
:::

:::{slide}
:label: cs336-02-035-output-004
:at: 3
How to compute a thing:
:::

:::{slide}
:label: cs336-02-035-output-005
:at: 4
1. Send inputs from memory to accelerator
:::

:::{slide}
:label: cs336-02-035-output-006
:at: 5
2. Perform computation
:::


(cs336-02-section-036)=
## Model FLOPs utilization (MFU)

:::{slide}
:label: cs336-02-036-output-001
:at: 0
3. Send outputs from accelerator to memory
:::

:::{slide}
:label: cs336-02-036-output-002
:at: 1
How long does this take?
:::

:::{slide}
:label: cs336-02-036-output-003
:at: 2
Depends on two things:
:::

:::{slide}
:label: cs336-02-036-output-004
:at: 3
1. Accelerator speed (FLOP/s)
:::

:::{slide}
:label: cs336-02-036-output-005
:at: 4
2. Memory bandwidth (bytes/s)
:::


(cs336-02-section-037)=
## Model FLOPs utilization (MFU)

:::{slide}
:label: cs336-02-037-values-001
:at: 0
:until: 1
| Variable | Value |
| --- | --- |
| `communication_time` | 1.2520310447761193e-06 |
:::

:::{slide}
:label: cs336-02-037-values-002
:at: 1
:until: 3
| Variable | Value |
| --- | --- |
| `communication_time` | 1.2520310447761193e-06 |
| `computation_time` | 1.0597028802425467e-09 |
:::

:::{slide}
:label: cs336-02-037-output-003
:at: 2
Assume we can overlap communication and computation perfectly.
:::

:::{slide}
:label: cs336-02-037-values-004
:at: 3
| Variable | Value |
| --- | --- |
| `communication_time` | 1.2520310447761193e-06 |
| `computation_time` | 1.0597028802425467e-09 |
| `total_time` | 1.2520310447761193e-06 |
:::

:::{slide}
:label: cs336-02-037-output-005
:at: 4
What is the bottleneck?
:::


(cs336-02-section-038)=
## Model FLOPs utilization (MFU)

:::{slide}
:label: cs336-02-038-output-001
:at: 0
- Memory-bound: communication time > computation time
:::

:::{slide}
:label: cs336-02-038-values-002
:at: 0
| Variable | Value |
| --- | --- |
| `communication_time` | 1.2520310447761193e-06 |
| `computation_time` | 1.0597028802425467e-09 |
| `total_time` | 1.2520310447761193e-06 |
:::

:::{slide}
:label: cs336-02-038-output-003
:at: 1
- Compute-bound: computation time > communication time
:::

:::{slide}
:label: cs336-02-038-output-004
:at: 2
In this case, ReLU is memory-bound.
:::

:::{slide}
:label: cs336-02-038-output-005
:at: 3
Alternative way to see this:
:::

:::{slide}
:label: cs336-02-038-output-006
:at: 4
Accelerator intensity: how much work can the accelerator do per byte transferred?
:::


(cs336-02-section-039)=
## Model FLOPs utilization (MFU)

:::{slide}
:label: cs336-02-039-values-001
:at: 0
:until: 2
| Variable | Value |
| --- | --- |
| `communication_time` | 1.2520310447761193e-06 |
| `computation_time` | 1.0597028802425467e-09 |
| `total_time` | 1.2520310447761193e-06 |
| `h100_accelerator_intensity` | 295.3731343283582 |
:::

:::{slide}
:label: cs336-02-039-output-002
:at: 1
Arithmetic intensity: how much actual work per byte for this workload?
:::

:::{slide}
:label: cs336-02-039-values-003
:at: 2
| Variable | Value |
| --- | --- |
| `communication_time` | 1.2520310447761193e-06 |
| `computation_time` | 1.0597028802425467e-09 |
| `total_time` | 1.2520310447761193e-06 |
| `h100_accelerator_intensity` | 295.3731343283582 |
| `arithmetic_intensity` | 0.25 |
:::

:::{slide}
:label: cs336-02-039-output-004
:at: 3
What is the bottleneck?
:::

:::{slide}
:label: cs336-02-039-output-005
:at: 4
- Memory-bound: arithmetic intensity < accelerator intensity
:::


(cs336-02-section-040)=
## Model FLOPs utilization (MFU)

:::{slide}
:label: cs336-02-040-output-001
:at: 0
- Compute-bound: arithmetic intensity > accelerator intensity
:::

:::{slide}
:label: cs336-02-040-values-002
:at: 0
:until: 3
| Variable | Value |
| --- | --- |
| `communication_time` | 1.2520310447761193e-06 |
| `computation_time` | 1.0597028802425467e-09 |
| `total_time` | 1.2520310447761193e-06 |
| `h100_accelerator_intensity` | 295.3731343283582 |
| `arithmetic_intensity` | 0.25 |
:::

:::{slide}
:label: cs336-02-040-output-003
:at: 1
In general, we'll find ourselves memory bound.
:::

:::{slide}
:label: cs336-02-040-output-004
:at: 2
Can we increase arithmetic intensity?
:::

:::{slide}
:label: cs336-02-040-values-005
:at: 4
:until: 5
| Variable | Value |
| --- | --- |
| `arithmetic_intensity` | 5.0 |
:::

:::{slide}
:label: cs336-02-040-values-006
:at: 5
| Variable | Value |
| --- | --- |
| `arithmetic_intensity` | 5.0 |
| `h100_accelerator_intensity` | 295.3731343283582 |
:::


(cs336-02-section-041)=
## Model FLOPs utilization (MFU)

:::{slide}
:label: cs336-02-041-output-001
:at: 0
Note that GeLU does more work than ReLU per byte moved, so it has higher arithmetic intensity.
:::

:::{slide}
:label: cs336-02-041-values-002
:at: 0
:until: 3
| Variable | Value |
| --- | --- |
| `arithmetic_intensity` | 5.0 |
| `h100_accelerator_intensity` | 295.3731343283582 |
:::

:::{slide}
:label: cs336-02-041-output-003
:at: 1
But still memory-bound!
:::

:::{slide}
:label: cs336-02-041-output-004
:at: 2
In other words, ReLU is not faster than GeLU (when doing things in an isolated way).
:::

:::{slide}
:label: cs336-02-041-values-005
:at: 4
:until: 5
| Variable | Value |
| --- | --- |
| `arithmetic_intensity` | 0.49999952316306917 |
:::

:::{slide}
:label: cs336-02-041-values-006
:at: 5
| Variable | Value |
| --- | --- |
| `arithmetic_intensity` | 0.49999952316306917 |
| `h100_accelerator_intensity` | 295.3731343283582 |
:::


(cs336-02-section-042)=
## Model FLOPs utilization (MFU)

:::{slide}
:label: cs336-02-042-output-001
:at: 0
Memory-bound!
:::

:::{slide}
:label: cs336-02-042-values-002
:at: 0
:until: 1
| Variable | Value |
| --- | --- |
| `arithmetic_intensity` | 0.49999952316306917 |
| `h100_accelerator_intensity` | 295.3731343283582 |
:::

:::{slide}
:label: cs336-02-042-values-003
:at: 2
:until: 3
| Variable | Value |
| --- | --- |
| `arithmetic_intensity` | 0.9975633528265108 |
:::

:::{slide}
:label: cs336-02-042-values-004
:at: 3
:until: 5
| Variable | Value |
| --- | --- |
| `arithmetic_intensity` | 0.9975633528265108 |
| `h100_accelerator_intensity` | 295.3731343283582 |
:::

:::{slide}
:label: cs336-02-042-output-005
:at: 4
Memory-bound!
:::

:::{slide}
:label: cs336-02-042-values-006
:at: 6
| Variable | Value |
| --- | --- |
| `arithmetic_intensity` | 341.1666666666667 |
:::


(cs336-02-section-043)=
## Model FLOPs utilization (MFU)

:::{slide}
:label: cs336-02-043-values-001
:at: 0
| Variable | Value |
| --- | --- |
| `arithmetic_intensity` | 341.1666666666667 |
| `h100_accelerator_intensity` | 295.3731343283582 |
:::

:::{slide}
:label: cs336-02-043-output-002
:at: 1
Finally, compute-bound!
:::

:::{slide}
:label: cs336-02-043-output-003
:at: 2
As long as we have large matrices, we're compute-bound (saturating the accelerator).
:::

:::{slide}
:label: cs336-02-043-output-004
:at: 3
Training Transformers involves big matrix multiplications.
:::

:::{slide}
:label: cs336-02-043-output-005
:at: 4
Matrix-vector product is what happens during inference, which is why inference is memory-bound.
:::


(cs336-02-section-044)=
## Model FLOPs utilization (MFU)

:::{slide}
:label: cs336-02-044-output-001
:at: 0
Note: arithmetic/accelerator intensity also depends on the precision (bf16 versus fp32).
:::

:::{slide}
:label: cs336-02-044-values-002
:at: 0
:until: 1
| Variable | Value |
| --- | --- |
| `arithmetic_intensity` | 341.1666666666667 |
| `h100_accelerator_intensity` | 295.3731343283582 |
:::

:::{slide}
:label: cs336-02-044-output-003
:at: 2
We can visualize the relationship between arithmetic intensity and performance using roofline plots.
:::

:::{slide}
:label: cs336-02-044-output-004
:at: 3
![image-42d32b9c87939fe9a4b0a268d6d02ea7-https_jax-ml_github_io_scaling-book_assets_img_roofline-improved-1400_webp](../assets/2c9018ab614d888baec0a3cc.webp)
:::

:::{slide}
:label: cs336-02-044-output-005
:at: 4
- Each slice on the x-axis is a particular computation (with some arithmetic intensity)
:::

:::{slide}
:label: cs336-02-044-output-006
:at: 5
- Each piecewise linear function corresponds to a particular hardware
:::


(cs336-02-section-045)=
## Model FLOPs utilization (MFU)

:::{slide}
:label: cs336-02-045-output-001
:at: 0
- Kink is the accelerator intensity (transition from memory-bound to compute-bound)
:::

:::{slide}
:label: cs336-02-045-output-002
:at: 1
We can now relate this back to MFU:
:::

:::{slide}
:label: cs336-02-045-output-003
:at: 2
MFU = min(1, arithmetic-intensity / accelerator-intensity)
:::

:::{slide}
:label: cs336-02-045-output-004
:at: 3
[reference](https://jax-ml.github.io/scaling-book/roofline/)
:::

:::{slide}
:label: cs336-02-045-output-005
:at: 4
![deep-network.png](../source/images/deep-network.png)
:::


(cs336-02-section-046)=
## Model FLOPs utilization (MFU)

:::{slide}
:label: cs336-02-046-output-001
:at: 0
Consider a deep network with L layers and D-dimensional inputs, activations, and outputs.
:::

:::{slide}
:label: cs336-02-046-values-002
:at: 1
:until: 2
| Variable | Value |
| --- | --- |
| `num_parameters` | 192 |
:::

:::{slide}
:label: cs336-02-046-values-003
:at: 2
:until: 3
| Variable | Value |
| --- | --- |
| `num_parameters` | 192 |

**`x`** (torch.float32 · 4 × 8)

```python
[[-0.72291499376297, -0.6120545268058777, 1.6612735986709595, -1.062111258506775,
  -1.616408348083496, -0.562229573726654, 0.9921274781227112, 1.3648921251296997],
 [-0.4067245125770569, 0.33605775237083435, -1.1981796026229858, 0.4662819504737854,
  -0.8871488571166992, 0.4371821880340576, 0.5280646681785583, 2.169325351715088],
 [0.10878380388021469, -0.42200401425361633, 0.23314610123634338, 0.27144762873649597,
  0.17549186944961548, 0.20626647770404816, -0.552985429763794, 0.9418168663978577],
 [1.854123592376709, -1.4687186479568481, -0.5016686320304871, -0.6536047458648682,
  0.06595765799283981, 0.2897912561893463, 1.368851661682129, 1.2301273345947266]]
```

:::

:::{slide}
:label: cs336-02-046-values-004
:at: 4
:until: 5
| Variable | Value |
| --- | --- |
| `num_parameters` | 192 |

**`x`** (torch.float32 · 4 × 8)

```python
[[-0.72291499376297, -0.6120545268058777, 1.6612735986709595, -1.062111258506775,
  -1.616408348083496, -0.562229573726654, 0.9921274781227112, 1.3648921251296997],
 [-0.4067245125770569, 0.33605775237083435, -1.1981796026229858, 0.4662819504737854,
  -0.8871488571166992, 0.4371821880340576, 0.5280646681785583, 2.169325351715088],
 [0.10878380388021469, -0.42200401425361633, 0.23314610123634338, 0.27144762873649597,
  0.17549186944961548, 0.20626647770404816, -0.552985429763794, 0.9418168663978577],
 [1.854123592376709, -1.4687186479568481, -0.5016686320304871, -0.6536047458648682,
  0.06595765799283981, 0.2897912561893463, 1.368851661682129, 1.2301273345947266]]
```


**`y`** (torch.float32 · 4 × 8)

```python
[[0.0235306266695261, 0.0, 0.23113322257995605, 0.0, 0.0, 0.29269376397132874, 0.0,
  0.0],
 [0.0, 0.0, 0.3809593915939331, 0.0, 0.0, 0.21591168642044067, 0.0, 0.0],
 [0.0, 0.0, 0.14147023856639862, 0.0, 0.0, 0.17523622512817383, 0.0,
  0.012988884933292866],
 [0.0, 0.0, 0.017859330400824547, 0.0, 0.0, 0.2608188986778259, 0.0, 0.0]]
```

:::

:::{slide}
:label: cs336-02-046-output-005
:at: 6
So far, we've constructed tensors and passed them through operations (forward).
:::


(cs336-02-section-047)=
## Model FLOPs utilization (MFU)

:::{slide}
:label: cs336-02-047-output-001
:at: 0
Now, we're going to compute the gradient (backward).
:::

:::{slide}
:label: cs336-02-047-output-002
:at: 1
As a simple example, let's consider the simple linear model:
:::

:::{slide}
:label: cs336-02-047-output-003
:at: 2
y = 0.5 (x * w - 5)^2
:::

:::{slide}
:label: cs336-02-047-output-004
:at: 3
Forward pass: compute loss
:::

:::{slide}
:label: cs336-02-047-output-005
:at: 4
Backward pass: compute gradients
:::


(cs336-02-section-048)=
## Model FLOPs utilization (MFU)

:::{slide}
:label: cs336-02-048-values-001
:at: 0
:until: 1
**`w.grad`** (torch.float32 · 3)

```python
[1.0, 2.0, 3.0]
```

:::

:::{slide}
:label: cs336-02-048-output-002
:at: 2
Let us count the FLOPs for computing gradients.
:::

:::{slide}
:label: cs336-02-048-output-003
:at: 3
![deep-network.png](../source/images/deep-network.png)
:::

:::{slide}
:label: cs336-02-048-output-004
:at: 4
Define a simplified model (2-layer linear network):
:::


(cs336-02-section-049)=
## Zoom in on one layer

:::{slide}
:label: cs336-02-049-output-001
:at: 0
Let's focus on the second layer (h2 = h1 @ w2)
:::

:::{slide}
:label: cs336-02-049-output-002
:at: 1
**Forward pass**: Recall the number of forward FLOPs:
:::

:::{slide}
:label: cs336-02-049-values-003
:at: 2
| Variable | Value |
| --- | --- |
| `num_forward_flops` | 134217728 |
:::

:::{slide}
:label: cs336-02-049-output-004
:at: 3
**Backward pass**: How many FLOPs is running the backward pass?
:::


(cs336-02-section-050)=
## Zoom in on one layer

:::{slide}
:label: cs336-02-050-output-001
:at: 0
We need to compute:
:::

:::{slide}
:label: cs336-02-050-values-002
:at: 0
:until: 3
| Variable | Value |
| --- | --- |
| `num_forward_flops` | 134217728 |
:::

:::{slide}
:label: cs336-02-050-output-003
:at: 1
- h1.grad = d loss / d h1
:::

:::{slide}
:label: cs336-02-050-output-004
:at: 2
- w2.grad = d loss / d w2
:::

:::{slide}
:label: cs336-02-050-values-005
:at: 3
| Variable | Value |
| --- | --- |
| `num_forward_flops` | 134217728 |
| `num_backward_flops` | 268435456 |
:::

:::{slide}
:label: cs336-02-050-output-006
:at: 4
Note that the backward pass is 2x more expensive than the forward pass.
:::


(cs336-02-section-051)=
## Consider all layers

:::{slide}
:label: cs336-02-051-values-001
:at: 0
| Variable | Value |
| --- | --- |
| `num_forward_flops` | 134217728 |
| `num_backward_flops` | 268435456 |
:::

:::{slide}
:label: cs336-02-051-output-002
:at: 1
This was just for w2, need to apply it to all parameters in the network.
:::

:::{slide}
:label: cs336-02-051-output-003
:at: 2
Putting it together:
:::

:::{slide}
:label: cs336-02-051-output-004
:at: 3
- Forward pass: 2 (# data points) (# parameters) FLOPs
:::

:::{slide}
:label: cs336-02-051-output-005
:at: 4
- Backward pass: 4 (# data points) (# parameters) FLOPs
:::


(cs336-02-section-052)=
## Consider all layers

:::{slide}
:label: cs336-02-052-output-001
:at: 0
- Total: 6 (# data points) (# parameters) FLOPs
:::

:::{slide}
:label: cs336-02-052-values-002
:at: 0
:until: 3
| Variable | Value |
| --- | --- |
| `num_forward_flops` | 134217728 |
| `num_backward_flops` | 268435456 |
:::

:::{slide}
:label: cs336-02-052-output-003
:at: 1
This is for multilayer perceptrons (MLPs)
:::

:::{slide}
:label: cs336-02-052-output-004
:at: 2
...but it turns out to be a good approximation for Transformers for short context lengths as well.
:::

:::{slide}
:label: cs336-02-052-output-005
:at: 4
Recall our deep network.
:::

:::{slide}
:label: cs336-02-052-output-006
:at: 5
Let's define the AdaGrad optimizer
:::


(cs336-02-section-053)=
## Consider all layers

:::{slide}
:label: cs336-02-053-output-001
:at: 0
- momentum = SGD + exponential averaging of grad
:::

:::{slide}
:label: cs336-02-053-output-002
:at: 1
- AdaGrad = SGD + averaging by grad^2
:::

:::{slide}
:label: cs336-02-053-output-003
:at: 2
- RMSProp = AdaGrad but with exponential averaging of grad^2
:::

:::{slide}
:label: cs336-02-053-output-004
:at: 3
- Adam = RMSProp + momentum
:::

:::{slide}
:label: cs336-02-053-output-005
:at: 4
AdaGrad 

[Duchi+ 2011](https://www.jmlr.org/papers/volume12/duchi11a/duchi11a.pdf)
:::


(cs336-02-section-054)=
## Consider all layers

:::{slide}
:label: cs336-02-054-values-001
:at: 0
:until: 1
**`state`**

```python
{'layers.0.weight': [[0.12565205991268158, -0.4037643373012543, -0.5802772045135498,
                      -0.09542008489370346],
                     [-0.566138744354248, 0.5806535482406616, -0.44740989804267883,
                      0.09120729565620422],
                     [-1.4790738821029663, -0.04514556750655174, -0.3360743224620819,
                      -0.5281411409378052],
                     [-0.9840545654296875, -0.32218900322914124, -0.42407146096229553,
                      -0.24516351521015167]],
 'layers.1.weight': [[0.46539613604545593, 0.6678878664970398, -0.27391934394836426,
                      0.39892899990081787],
                     [0.631434440612793, -0.0681697204709053, -1.1128594875335693,
                      -0.07139184325933456],
                     [-0.11660940200090408, -0.5985015034675598, 0.3100452721118927,
                      0.3057173490524292],
                     [0.7570882439613342, -1.1655778884887695, 0.18017065525054932,
                      0.6537290811538696]],
 'layers.2.weight': [[-1.085352897644043, -0.4440416693687439, -0.15685807168483734,
                      -0.03024565801024437],
                     [-0.5796391367912292, -0.1088181585073471, 1.346548080444336,
                      -0.027938872575759888],
                     [-0.3900461494922638, 0.3673260807991028, 0.5264703035354614,
                      -0.1486826241016388],
                     [-0.9801381230354309, -0.0005752771976403892, -0.6993281841278076,
                      -0.6743273138999939]]}
```

:::

:::{slide}
:label: cs336-02-054-values-002
:at: 2
:until: 3
**`state`**

```python
{'layers.0.weight': [[0.12565205991268158, -0.4037643373012543, -0.5802772045135498,
                      -0.09542008489370346],
                     [-0.566138744354248, 0.5806535482406616, -0.44740989804267883,
                      0.09120729565620422],
                     [-1.4790738821029663, -0.04514556750655174, -0.3360743224620819,
                      -0.5281411409378052],
                     [-0.9840545654296875, -0.32218900322914124, -0.42407146096229553,
                      -0.24516351521015167]],
 'layers.1.weight': [[0.46539613604545593, 0.6678878664970398, -0.27391934394836426,
                      0.39892899990081787],
                     [0.631434440612793, -0.0681697204709053, -1.1128594875335693,
                      -0.07139184325933456],
                     [-0.11660940200090408, -0.5985015034675598, 0.3100452721118927,
                      0.3057173490524292],
                     [0.7570882439613342, -1.1655778884887695, 0.18017065525054932,
                      0.6537290811538696]],
 'layers.2.weight': [[-1.085352897644043, -0.4440416693687439, -0.15685807168483734,
                      -0.03024565801024437],
                     [-0.5796391367912292, -0.1088181585073471, 1.346548080444336,
                      -0.027938872575759888],
                     [-0.3900461494922638, 0.3673260807991028, 0.5264703035354614,
                      -0.1486826241016388],
                     [-0.9801381230354309, -0.0005752771976403892, -0.6993281841278076,
                      -0.6743273138999939]]}
```

:::

:::{slide}
:label: cs336-02-054-values-003
:at: 4
**`state`**

```python
{'layers.0.weight': [[0.12565205991268158, -0.4037643373012543, -0.5802772045135498,
                      -0.09542008489370346],
                     [-0.566138744354248, 0.5806535482406616, -0.44740989804267883,
                      0.09120729565620422],
                     [-1.4790738821029663, -0.04514556750655174, -0.3360743224620819,
                      -0.5281411409378052],
                     [-0.9840545654296875, -0.32218900322914124, -0.42407146096229553,
                      -0.24516351521015167]],
 'layers.1.weight': [[0.46539613604545593, 0.6678878664970398, -0.27391934394836426,
                      0.39892899990081787],
                     [0.631434440612793, -0.0681697204709053, -1.1128594875335693,
                      -0.07139184325933456],
                     [-0.11660940200090408, -0.5985015034675598, 0.3100452721118927,
                      0.3057173490524292],
                     [0.7570882439613342, -1.1655778884887695, 0.18017065525054932,
                      0.6537290811538696]],
 'layers.2.weight': [[-1.085352897644043, -0.4440416693687439, -0.15685807168483734,
                      -0.03024565801024437],
                     [-0.5796391367912292, -0.1088181585073471, 1.346548080444336,
                      -0.027938872575759888],
                     [-0.3900461494922638, 0.3673260807991028, 0.5264703035354614,
                      -0.1486826241016388],
                     [-0.9801381230354309, -0.0005752771976403892, -0.6993281841278076,
                      -0.6743273138999939]]}
```


**`optimizer_state`**

```python
{'0': {'g2': [[0.5346072316169739, 0.0, 0.0, 0.0], [0.04465468227863312, 0.0, 0.0, 0.0],
              [0.050645485520362854, 0.0, 0.0, 0.0],
              [0.07512986660003662, 0.0, 0.0, 0.0]]},
 '1': {'g2': [[0.0018079879228025675, 0.13323718309402466, 0.0, 0.03593716025352478],
              [0.0, 0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 0.0]]},
 '2': {'g2': [[0.0, 0.0, 0.015915758907794952, 0.0],
              [0.0, 0.0, 0.032778482884168625, 0.0], [0.0, 0.0, 0.0, 0.0],
              [0.0, 0.0, 0.011694265529513359, 0.0]]}}
```

:::


(cs336-02-section-055)=
## Memory

:::{slide}
:label: cs336-02-055-values-001
:at: 0
:until: 1
**`state`**

```python
{'layers.0.weight': [[0.12565205991268158, -0.4037643373012543, -0.5802772045135498,
                      -0.09542008489370346],
                     [-0.566138744354248, 0.5806535482406616, -0.44740989804267883,
                      0.09120729565620422],
                     [-1.4790738821029663, -0.04514556750655174, -0.3360743224620819,
                      -0.5281411409378052],
                     [-0.9840545654296875, -0.32218900322914124, -0.42407146096229553,
                      -0.24516351521015167]],
 'layers.1.weight': [[0.46539613604545593, 0.6678878664970398, -0.27391934394836426,
                      0.39892899990081787],
                     [0.631434440612793, -0.0681697204709053, -1.1128594875335693,
                      -0.07139184325933456],
                     [-0.11660940200090408, -0.5985015034675598, 0.3100452721118927,
                      0.3057173490524292],
                     [0.7570882439613342, -1.1655778884887695, 0.18017065525054932,
                      0.6537290811538696]],
 'layers.2.weight': [[-1.085352897644043, -0.4440416693687439, -0.15685807168483734,
                      -0.03024565801024437],
                     [-0.5796391367912292, -0.1088181585073471, 1.346548080444336,
                      -0.027938872575759888],
                     [-0.3900461494922638, 0.3673260807991028, 0.5264703035354614,
                      -0.1486826241016388],
                     [-0.9801381230354309, -0.0005752771976403892, -0.6993281841278076,
                      -0.6743273138999939]]}
```


**`optimizer_state`**

```python
{'0': {'g2': [[0.5346072316169739, 0.0, 0.0, 0.0], [0.04465468227863312, 0.0, 0.0, 0.0],
              [0.050645485520362854, 0.0, 0.0, 0.0],
              [0.07512986660003662, 0.0, 0.0, 0.0]]},
 '1': {'g2': [[0.0018079879228025675, 0.13323718309402466, 0.0, 0.03593716025352478],
              [0.0, 0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 0.0]]},
 '2': {'g2': [[0.0, 0.0, 0.015915758907794952, 0.0],
              [0.0, 0.0, 0.032778482884168625, 0.0], [0.0, 0.0, 0.0, 0.0],
              [0.0, 0.0, 0.011694265529513359, 0.0]]}}
```

:::

:::{slide}
:label: cs336-02-055-values-002
:at: 1
:until: 2
| Variable | Value |
| --- | --- |
| `parameter_memory` | 96 |

**`state`**

```python
{'layers.0.weight': [[0.12565205991268158, -0.4037643373012543, -0.5802772045135498,
                      -0.09542008489370346],
                     [-0.566138744354248, 0.5806535482406616, -0.44740989804267883,
                      0.09120729565620422],
                     [-1.4790738821029663, -0.04514556750655174, -0.3360743224620819,
                      -0.5281411409378052],
                     [-0.9840545654296875, -0.32218900322914124, -0.42407146096229553,
                      -0.24516351521015167]],
 'layers.1.weight': [[0.46539613604545593, 0.6678878664970398, -0.27391934394836426,
                      0.39892899990081787],
                     [0.631434440612793, -0.0681697204709053, -1.1128594875335693,
                      -0.07139184325933456],
                     [-0.11660940200090408, -0.5985015034675598, 0.3100452721118927,
                      0.3057173490524292],
                     [0.7570882439613342, -1.1655778884887695, 0.18017065525054932,
                      0.6537290811538696]],
 'layers.2.weight': [[-1.085352897644043, -0.4440416693687439, -0.15685807168483734,
                      -0.03024565801024437],
                     [-0.5796391367912292, -0.1088181585073471, 1.346548080444336,
                      -0.027938872575759888],
                     [-0.3900461494922638, 0.3673260807991028, 0.5264703035354614,
                      -0.1486826241016388],
                     [-0.9801381230354309, -0.0005752771976403892, -0.6993281841278076,
                      -0.6743273138999939]]}
```


**`optimizer_state`**

```python
{'0': {'g2': [[0.5346072316169739, 0.0, 0.0, 0.0], [0.04465468227863312, 0.0, 0.0, 0.0],
              [0.050645485520362854, 0.0, 0.0, 0.0],
              [0.07512986660003662, 0.0, 0.0, 0.0]]},
 '1': {'g2': [[0.0018079879228025675, 0.13323718309402466, 0.0, 0.03593716025352478],
              [0.0, 0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 0.0]]},
 '2': {'g2': [[0.0, 0.0, 0.015915758907794952, 0.0],
              [0.0, 0.0, 0.032778482884168625, 0.0], [0.0, 0.0, 0.0, 0.0],
              [0.0, 0.0, 0.011694265529513359, 0.0]]}}
```

:::

:::{slide}
:label: cs336-02-055-values-003
:at: 2
:until: 3
| Variable | Value |
| --- | --- |
| `parameter_memory` | 96 |
| `gradient_memory` | 96 |

**`state`**

```python
{'layers.0.weight': [[0.12565205991268158, -0.4037643373012543, -0.5802772045135498,
                      -0.09542008489370346],
                     [-0.566138744354248, 0.5806535482406616, -0.44740989804267883,
                      0.09120729565620422],
                     [-1.4790738821029663, -0.04514556750655174, -0.3360743224620819,
                      -0.5281411409378052],
                     [-0.9840545654296875, -0.32218900322914124, -0.42407146096229553,
                      -0.24516351521015167]],
 'layers.1.weight': [[0.46539613604545593, 0.6678878664970398, -0.27391934394836426,
                      0.39892899990081787],
                     [0.631434440612793, -0.0681697204709053, -1.1128594875335693,
                      -0.07139184325933456],
                     [-0.11660940200090408, -0.5985015034675598, 0.3100452721118927,
                      0.3057173490524292],
                     [0.7570882439613342, -1.1655778884887695, 0.18017065525054932,
                      0.6537290811538696]],
 'layers.2.weight': [[-1.085352897644043, -0.4440416693687439, -0.15685807168483734,
                      -0.03024565801024437],
                     [-0.5796391367912292, -0.1088181585073471, 1.346548080444336,
                      -0.027938872575759888],
                     [-0.3900461494922638, 0.3673260807991028, 0.5264703035354614,
                      -0.1486826241016388],
                     [-0.9801381230354309, -0.0005752771976403892, -0.6993281841278076,
                      -0.6743273138999939]]}
```


**`optimizer_state`**

```python
{'0': {'g2': [[0.5346072316169739, 0.0, 0.0, 0.0], [0.04465468227863312, 0.0, 0.0, 0.0],
              [0.050645485520362854, 0.0, 0.0, 0.0],
              [0.07512986660003662, 0.0, 0.0, 0.0]]},
 '1': {'g2': [[0.0018079879228025675, 0.13323718309402466, 0.0, 0.03593716025352478],
              [0.0, 0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 0.0]]},
 '2': {'g2': [[0.0, 0.0, 0.015915758907794952, 0.0],
              [0.0, 0.0, 0.032778482884168625, 0.0], [0.0, 0.0, 0.0, 0.0],
              [0.0, 0.0, 0.011694265529513359, 0.0]]}}
```

:::

:::{slide}
:label: cs336-02-055-values-004
:at: 3
:until: 4
| Variable | Value |
| --- | --- |
| `parameter_memory` | 96 |
| `gradient_memory` | 96 |
| `optimizer_state_memory` | 192 |

**`state`**

```python
{'layers.0.weight': [[0.12565205991268158, -0.4037643373012543, -0.5802772045135498,
                      -0.09542008489370346],
                     [-0.566138744354248, 0.5806535482406616, -0.44740989804267883,
                      0.09120729565620422],
                     [-1.4790738821029663, -0.04514556750655174, -0.3360743224620819,
                      -0.5281411409378052],
                     [-0.9840545654296875, -0.32218900322914124, -0.42407146096229553,
                      -0.24516351521015167]],
 'layers.1.weight': [[0.46539613604545593, 0.6678878664970398, -0.27391934394836426,
                      0.39892899990081787],
                     [0.631434440612793, -0.0681697204709053, -1.1128594875335693,
                      -0.07139184325933456],
                     [-0.11660940200090408, -0.5985015034675598, 0.3100452721118927,
                      0.3057173490524292],
                     [0.7570882439613342, -1.1655778884887695, 0.18017065525054932,
                      0.6537290811538696]],
 'layers.2.weight': [[-1.085352897644043, -0.4440416693687439, -0.15685807168483734,
                      -0.03024565801024437],
                     [-0.5796391367912292, -0.1088181585073471, 1.346548080444336,
                      -0.027938872575759888],
                     [-0.3900461494922638, 0.3673260807991028, 0.5264703035354614,
                      -0.1486826241016388],
                     [-0.9801381230354309, -0.0005752771976403892, -0.6993281841278076,
                      -0.6743273138999939]]}
```


**`optimizer_state`**

```python
{'0': {'g2': [[0.5346072316169739, 0.0, 0.0, 0.0], [0.04465468227863312, 0.0, 0.0, 0.0],
              [0.050645485520362854, 0.0, 0.0, 0.0],
              [0.07512986660003662, 0.0, 0.0, 0.0]]},
 '1': {'g2': [[0.0018079879228025675, 0.13323718309402466, 0.0, 0.03593716025352478],
              [0.0, 0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 0.0]]},
 '2': {'g2': [[0.0, 0.0, 0.015915758907794952, 0.0],
              [0.0, 0.0, 0.032778482884168625, 0.0], [0.0, 0.0, 0.0, 0.0],
              [0.0, 0.0, 0.011694265529513359, 0.0]]}}
```

:::

:::{slide}
:label: cs336-02-055-values-005
:at: 4
| Variable | Value |
| --- | --- |
| `parameter_memory` | 96 |
| `gradient_memory` | 96 |
| `optimizer_state_memory` | 192 |
| `activation_memory` | 48 |

**`state`**

```python
{'layers.0.weight': [[0.12565205991268158, -0.4037643373012543, -0.5802772045135498,
                      -0.09542008489370346],
                     [-0.566138744354248, 0.5806535482406616, -0.44740989804267883,
                      0.09120729565620422],
                     [-1.4790738821029663, -0.04514556750655174, -0.3360743224620819,
                      -0.5281411409378052],
                     [-0.9840545654296875, -0.32218900322914124, -0.42407146096229553,
                      -0.24516351521015167]],
 'layers.1.weight': [[0.46539613604545593, 0.6678878664970398, -0.27391934394836426,
                      0.39892899990081787],
                     [0.631434440612793, -0.0681697204709053, -1.1128594875335693,
                      -0.07139184325933456],
                     [-0.11660940200090408, -0.5985015034675598, 0.3100452721118927,
                      0.3057173490524292],
                     [0.7570882439613342, -1.1655778884887695, 0.18017065525054932,
                      0.6537290811538696]],
 'layers.2.weight': [[-1.085352897644043, -0.4440416693687439, -0.15685807168483734,
                      -0.03024565801024437],
                     [-0.5796391367912292, -0.1088181585073471, 1.346548080444336,
                      -0.027938872575759888],
                     [-0.3900461494922638, 0.3673260807991028, 0.5264703035354614,
                      -0.1486826241016388],
                     [-0.9801381230354309, -0.0005752771976403892, -0.6993281841278076,
                      -0.6743273138999939]]}
```


**`optimizer_state`**

```python
{'0': {'g2': [[0.5346072316169739, 0.0, 0.0, 0.0], [0.04465468227863312, 0.0, 0.0, 0.0],
              [0.050645485520362854, 0.0, 0.0, 0.0],
              [0.07512986660003662, 0.0, 0.0, 0.0]]},
 '1': {'g2': [[0.0018079879228025675, 0.13323718309402466, 0.0, 0.03593716025352478],
              [0.0, 0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 0.0]]},
 '2': {'g2': [[0.0, 0.0, 0.015915758907794952, 0.0],
              [0.0, 0.0, 0.032778482884168625, 0.0], [0.0, 0.0, 0.0, 0.0],
              [0.0, 0.0, 0.011694265529513359, 0.0]]}}
```

:::


(cs336-02-section-056)=
## Memory

:::{slide}
:label: cs336-02-056-output-001
:at: 0
It is customary to use fp32 for stability (accumulating averages over powers over many steps).
:::

:::{slide}
:label: cs336-02-056-values-002
:at: 0
:until: 4
| Variable | Value |
| --- | --- |
| `parameter_memory` | 96 |
| `gradient_memory` | 96 |
| `optimizer_state_memory` | 192 |
| `activation_memory` | 48 |

**`state`**

```python
{'layers.0.weight': [[0.12565205991268158, -0.4037643373012543, -0.5802772045135498,
                      -0.09542008489370346],
                     [-0.566138744354248, 0.5806535482406616, -0.44740989804267883,
                      0.09120729565620422],
                     [-1.4790738821029663, -0.04514556750655174, -0.3360743224620819,
                      -0.5281411409378052],
                     [-0.9840545654296875, -0.32218900322914124, -0.42407146096229553,
                      -0.24516351521015167]],
 'layers.1.weight': [[0.46539613604545593, 0.6678878664970398, -0.27391934394836426,
                      0.39892899990081787],
                     [0.631434440612793, -0.0681697204709053, -1.1128594875335693,
                      -0.07139184325933456],
                     [-0.11660940200090408, -0.5985015034675598, 0.3100452721118927,
                      0.3057173490524292],
                     [0.7570882439613342, -1.1655778884887695, 0.18017065525054932,
                      0.6537290811538696]],
 'layers.2.weight': [[-1.085352897644043, -0.4440416693687439, -0.15685807168483734,
                      -0.03024565801024437],
                     [-0.5796391367912292, -0.1088181585073471, 1.346548080444336,
                      -0.027938872575759888],
                     [-0.3900461494922638, 0.3673260807991028, 0.5264703035354614,
                      -0.1486826241016388],
                     [-0.9801381230354309, -0.0005752771976403892, -0.6993281841278076,
                      -0.6743273138999939]]}
```


**`optimizer_state`**

```python
{'0': {'g2': [[0.5346072316169739, 0.0, 0.0, 0.0], [0.04465468227863312, 0.0, 0.0, 0.0],
              [0.050645485520362854, 0.0, 0.0, 0.0],
              [0.07512986660003662, 0.0, 0.0, 0.0]]},
 '1': {'g2': [[0.0018079879228025675, 0.13323718309402466, 0.0, 0.03593716025352478],
              [0.0, 0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 0.0]]},
 '2': {'g2': [[0.0, 0.0, 0.015915758907794952, 0.0],
              [0.0, 0.0, 0.032778482884168625, 0.0], [0.0, 0.0, 0.0, 0.0],
              [0.0, 0.0, 0.011694265529513359, 0.0]]}}
```

:::

:::{slide}
:label: cs336-02-056-output-003
:at: 1
Optimizer state memory:
:::

:::{slide}
:label: cs336-02-056-output-004
:at: 2
- AdaGrad: 4 bytes/parameter for storing second moments
:::

:::{slide}
:label: cs336-02-056-output-005
:at: 3
- Adam: 8 bytes/parameter for storing first and second moments
:::

:::{slide}
:label: cs336-02-056-values-006
:at: 4
| Variable | Value |
| --- | --- |
| `parameter_memory` | 96 |
| `gradient_memory` | 96 |
| `optimizer_state_memory` | 192 |
| `activation_memory` | 48 |
| `total_memory` | 432 |

**`state`**

```python
{'layers.0.weight': [[0.12565205991268158, -0.4037643373012543, -0.5802772045135498,
                      -0.09542008489370346],
                     [-0.566138744354248, 0.5806535482406616, -0.44740989804267883,
                      0.09120729565620422],
                     [-1.4790738821029663, -0.04514556750655174, -0.3360743224620819,
                      -0.5281411409378052],
                     [-0.9840545654296875, -0.32218900322914124, -0.42407146096229553,
                      -0.24516351521015167]],
 'layers.1.weight': [[0.46539613604545593, 0.6678878664970398, -0.27391934394836426,
                      0.39892899990081787],
                     [0.631434440612793, -0.0681697204709053, -1.1128594875335693,
                      -0.07139184325933456],
                     [-0.11660940200090408, -0.5985015034675598, 0.3100452721118927,
                      0.3057173490524292],
                     [0.7570882439613342, -1.1655778884887695, 0.18017065525054932,
                      0.6537290811538696]],
 'layers.2.weight': [[-1.085352897644043, -0.4440416693687439, -0.15685807168483734,
                      -0.03024565801024437],
                     [-0.5796391367912292, -0.1088181585073471, 1.346548080444336,
                      -0.027938872575759888],
                     [-0.3900461494922638, 0.3673260807991028, 0.5264703035354614,
                      -0.1486826241016388],
                     [-0.9801381230354309, -0.0005752771976403892, -0.6993281841278076,
                      -0.6743273138999939]]}
```


**`optimizer_state`**

```python
{'0': {'g2': [[0.5346072316169739, 0.0, 0.0, 0.0], [0.04465468227863312, 0.0, 0.0, 0.0],
              [0.050645485520362854, 0.0, 0.0, 0.0],
              [0.07512986660003662, 0.0, 0.0, 0.0]]},
 '1': {'g2': [[0.0018079879228025675, 0.13323718309402466, 0.0, 0.03593716025352478],
              [0.0, 0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 0.0]]},
 '2': {'g2': [[0.0, 0.0, 0.015915758907794952, 0.0],
              [0.0, 0.0, 0.032778482884168625, 0.0], [0.0, 0.0, 0.0, 0.0],
              [0.0, 0.0, 0.011694265529513359, 0.0]]}}
```

:::


(cs336-02-section-057)=
## Compute (for one training step)

:::{slide}
:label: cs336-02-057-values-001
:at: 0
:until: 1
| Variable | Value |
| --- | --- |
| `parameter_memory` | 96 |
| `gradient_memory` | 96 |
| `optimizer_state_memory` | 192 |
| `activation_memory` | 48 |
| `total_memory` | 432 |

**`state`**

```python
{'layers.0.weight': [[0.12565205991268158, -0.4037643373012543, -0.5802772045135498,
                      -0.09542008489370346],
                     [-0.566138744354248, 0.5806535482406616, -0.44740989804267883,
                      0.09120729565620422],
                     [-1.4790738821029663, -0.04514556750655174, -0.3360743224620819,
                      -0.5281411409378052],
                     [-0.9840545654296875, -0.32218900322914124, -0.42407146096229553,
                      -0.24516351521015167]],
 'layers.1.weight': [[0.46539613604545593, 0.6678878664970398, -0.27391934394836426,
                      0.39892899990081787],
                     [0.631434440612793, -0.0681697204709053, -1.1128594875335693,
                      -0.07139184325933456],
                     [-0.11660940200090408, -0.5985015034675598, 0.3100452721118927,
                      0.3057173490524292],
                     [0.7570882439613342, -1.1655778884887695, 0.18017065525054932,
                      0.6537290811538696]],
 'layers.2.weight': [[-1.085352897644043, -0.4440416693687439, -0.15685807168483734,
                      -0.03024565801024437],
                     [-0.5796391367912292, -0.1088181585073471, 1.346548080444336,
                      -0.027938872575759888],
                     [-0.3900461494922638, 0.3673260807991028, 0.5264703035354614,
                      -0.1486826241016388],
                     [-0.9801381230354309, -0.0005752771976403892, -0.6993281841278076,
                      -0.6743273138999939]]}
```


**`optimizer_state`**

```python
{'0': {'g2': [[0.5346072316169739, 0.0, 0.0, 0.0], [0.04465468227863312, 0.0, 0.0, 0.0],
              [0.050645485520362854, 0.0, 0.0, 0.0],
              [0.07512986660003662, 0.0, 0.0, 0.0]]},
 '1': {'g2': [[0.0018079879228025675, 0.13323718309402466, 0.0, 0.03593716025352478],
              [0.0, 0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 0.0]]},
 '2': {'g2': [[0.0, 0.0, 0.015915758907794952, 0.0],
              [0.0, 0.0, 0.032778482884168625, 0.0], [0.0, 0.0, 0.0, 0.0],
              [0.0, 0.0, 0.011694265529513359, 0.0]]}}
```

:::

:::{slide}
:label: cs336-02-057-values-002
:at: 1
| Variable | Value |
| --- | --- |
| `parameter_memory` | 96 |
| `gradient_memory` | 96 |
| `optimizer_state_memory` | 192 |
| `activation_memory` | 48 |
| `total_memory` | 432 |
| `flops` | 576 |

**`state`**

```python
{'layers.0.weight': [[0.12565205991268158, -0.4037643373012543, -0.5802772045135498,
                      -0.09542008489370346],
                     [-0.566138744354248, 0.5806535482406616, -0.44740989804267883,
                      0.09120729565620422],
                     [-1.4790738821029663, -0.04514556750655174, -0.3360743224620819,
                      -0.5281411409378052],
                     [-0.9840545654296875, -0.32218900322914124, -0.42407146096229553,
                      -0.24516351521015167]],
 'layers.1.weight': [[0.46539613604545593, 0.6678878664970398, -0.27391934394836426,
                      0.39892899990081787],
                     [0.631434440612793, -0.0681697204709053, -1.1128594875335693,
                      -0.07139184325933456],
                     [-0.11660940200090408, -0.5985015034675598, 0.3100452721118927,
                      0.3057173490524292],
                     [0.7570882439613342, -1.1655778884887695, 0.18017065525054932,
                      0.6537290811538696]],
 'layers.2.weight': [[-1.085352897644043, -0.4440416693687439, -0.15685807168483734,
                      -0.03024565801024437],
                     [-0.5796391367912292, -0.1088181585073471, 1.346548080444336,
                      -0.027938872575759888],
                     [-0.3900461494922638, 0.3673260807991028, 0.5264703035354614,
                      -0.1486826241016388],
                     [-0.9801381230354309, -0.0005752771976403892, -0.6993281841278076,
                      -0.6743273138999939]]}
```


**`optimizer_state`**

```python
{'0': {'g2': [[0.5346072316169739, 0.0, 0.0, 0.0], [0.04465468227863312, 0.0, 0.0, 0.0],
              [0.050645485520362854, 0.0, 0.0, 0.0],
              [0.07512986660003662, 0.0, 0.0, 0.0]]},
 '1': {'g2': [[0.0018079879228025675, 0.13323718309402466, 0.0, 0.03593716025352478],
              [0.0, 0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 0.0]]},
 '2': {'g2': [[0.0, 0.0, 0.015915758907794952, 0.0],
              [0.0, 0.0, 0.032778482884168625, 0.0], [0.0, 0.0, 0.0, 0.0],
              [0.0, 0.0, 0.011694265529513359, 0.0]]}}
```

:::


(cs336-02-section-058)=
## Transformers

:::{slide}
:label: cs336-02-058-values-001
:at: 0
:until: 5
| Variable | Value |
| --- | --- |
| `parameter_memory` | 96 |
| `gradient_memory` | 96 |
| `optimizer_state_memory` | 192 |
| `activation_memory` | 48 |
| `total_memory` | 432 |
| `flops` | 576 |

**`state`**

```python
{'layers.0.weight': [[0.12565205991268158, -0.4037643373012543, -0.5802772045135498,
                      -0.09542008489370346],
                     [-0.566138744354248, 0.5806535482406616, -0.44740989804267883,
                      0.09120729565620422],
                     [-1.4790738821029663, -0.04514556750655174, -0.3360743224620819,
                      -0.5281411409378052],
                     [-0.9840545654296875, -0.32218900322914124, -0.42407146096229553,
                      -0.24516351521015167]],
 'layers.1.weight': [[0.46539613604545593, 0.6678878664970398, -0.27391934394836426,
                      0.39892899990081787],
                     [0.631434440612793, -0.0681697204709053, -1.1128594875335693,
                      -0.07139184325933456],
                     [-0.11660940200090408, -0.5985015034675598, 0.3100452721118927,
                      0.3057173490524292],
                     [0.7570882439613342, -1.1655778884887695, 0.18017065525054932,
                      0.6537290811538696]],
 'layers.2.weight': [[-1.085352897644043, -0.4440416693687439, -0.15685807168483734,
                      -0.03024565801024437],
                     [-0.5796391367912292, -0.1088181585073471, 1.346548080444336,
                      -0.027938872575759888],
                     [-0.3900461494922638, 0.3673260807991028, 0.5264703035354614,
                      -0.1486826241016388],
                     [-0.9801381230354309, -0.0005752771976403892, -0.6993281841278076,
                      -0.6743273138999939]]}
```


**`optimizer_state`**

```python
{'0': {'g2': [[0.5346072316169739, 0.0, 0.0, 0.0], [0.04465468227863312, 0.0, 0.0, 0.0],
              [0.050645485520362854, 0.0, 0.0, 0.0],
              [0.07512986660003662, 0.0, 0.0, 0.0]]},
 '1': {'g2': [[0.0018079879228025675, 0.13323718309402466, 0.0, 0.03593716025352478],
              [0.0, 0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 0.0]]},
 '2': {'g2': [[0.0, 0.0, 0.015915758907794952, 0.0],
              [0.0, 0.0, 0.032778482884168625, 0.0], [0.0, 0.0, 0.0, 0.0],
              [0.0, 0.0, 0.011694265529513359, 0.0]]}}
```

:::

:::{slide}
:label: cs336-02-058-output-002
:at: 1
The accounting for a Transformer is more complicated, but the same idea.
:::

:::{slide}
:label: cs336-02-058-output-003
:at: 2
Assignment 1 will ask you to do that.
:::

:::{slide}
:label: cs336-02-058-output-004
:at: 3
Blog post describing memory usage for Transformer training 

[article](https://erees.dev/transformer-memory/)
:::

:::{slide}
:label: cs336-02-058-output-005
:at: 4
Blog post describing FLOPs for a Transformer: 

[article](https://www.adamcasson.com/posts/transformer-flops)
:::


(cs336-02-section-059)=
## Transformers

:::{slide}
:label: cs336-02-059-output-001
:at: 0
Large batch sizes: improve training stability
:::

:::{slide}
:label: cs336-02-059-output-002
:at: 1
However, activation memory scales with batch size, so might run out.
:::

:::{slide}
:label: cs336-02-059-values-003
:at: 2
| Variable | Value |
| --- | --- |
| `activation_memory` | 2097152 |
:::

:::{slide}
:label: cs336-02-059-output-004
:at: 3
Gradient accumulation:
:::

:::{slide}
:label: cs336-02-059-output-005
:at: 4
- Compute gradient on micro batches
:::


(cs336-02-section-060)=
## Transformers

:::{slide}
:label: cs336-02-060-output-001
:at: 0
- Accumulate the gradients (don't zero it out)
:::

:::{slide}
:label: cs336-02-060-values-002
:at: 0
:until: 2
| Variable | Value |
| --- | --- |
| `activation_memory` | 2097152 |
:::

:::{slide}
:label: cs336-02-060-output-003
:at: 1
- Every batch_size / micro_batch_size steps, update the parameters and zero out the gradients
:::

:::{slide}
:label: cs336-02-060-values-004
:at: 2
:until: 3
| Variable | Value |
| --- | --- |
| `activation_memory` | 8388608 |
:::

:::{slide}
:label: cs336-02-060-output-005
:at: 4
For training, we need to store the activations of all layers
:::

:::{slide}
:label: cs336-02-060-output-006
:at: 5
For inference, we don't compute gradients, so we only need to store the current layer's activations.
:::


(cs336-02-section-061)=
## Transformers

:::{slide}
:label: cs336-02-061-output-001
:at: 0
![deep-network.png](../source/images/deep-network.png)
:::

:::{slide}
:label: cs336-02-061-output-002
:at: 1
The memory usage is
:::

:::{slide}
:label: cs336-02-061-values-003
:at: 2
:until: 3
| Variable | Value |
| --- | --- |
| `activation_memory` | 2097152 |
:::

:::{slide}
:label: cs336-02-061-values-004
:at: 3
| Variable | Value |
| --- | --- |
| `activation_memory` | 2097152 |
| `memory` | 202114048 |
:::

:::{slide}
:label: cs336-02-061-output-005
:at: 4
Can we reduce this?
:::


(cs336-02-section-062)=
## Transformers

:::{slide}
:label: cs336-02-062-output-001
:at: 0
Activation checkpointing = gradient checkpointing = rematerialization
:::

:::{slide}
:label: cs336-02-062-values-002
:at: 0
| Variable | Value |
| --- | --- |
| `activation_memory` | 2097152 |
| `memory` | 202114048 |
:::

:::{slide}
:label: cs336-02-062-output-003
:at: 1
Key idea:
:::

:::{slide}
:label: cs336-02-062-output-004
:at: 2
- Forward pass: keep only activations at subset of layers
:::

:::{slide}
:label: cs336-02-062-output-005
:at: 3
- Backward pass: recompute the missing activations from the last checkpoint
:::

:::{slide}
:label: cs336-02-062-output-006
:at: 4
Philosophy: tradeoff memory for compute
:::


(cs336-02-section-063)=
## Transformers

:::{slide}
:label: cs336-02-063-values-001
:at: 0
| Variable | Value |
| --- | --- |
| `activation_memory` | 2097152 |
| `memory` | 202114048 |
| `checkpointed_memory` | 202900480 |
:::

:::{slide}
:label: cs336-02-063-output-002
:at: 1
Can we reduce this even more, especially for deep networks (large L)?
:::

:::{slide}
:label: cs336-02-063-output-003
:at: 2
How frequently to checkpoint?
:::

:::{slide}
:label: cs336-02-063-output-004
:at: 3
- If store each layer's activations, then activation memory is O(L) and no recomputation.
:::

:::{slide}
:label: cs336-02-063-output-005
:at: 4
- If store no activations, then activation memory is O(1) and compute is O(L^2) (recompute from the start for each layer).
:::


(cs336-02-section-064)=
## Transformers

:::{slide}
:label: cs336-02-064-output-001
:at: 0
- If store every sqrt(L) layers, then activation memory is O(sqrt(L)) and O(L) recomputation.
:::

:::{slide}
:label: cs336-02-064-values-002
:at: 0
:until: 1
| Variable | Value |
| --- | --- |
| `activation_memory` | 2097152 |
| `memory` | 202114048 |
| `checkpointed_memory` | 202900480 |
:::

:::{slide}
:label: cs336-02-064-output-003
:at: 2
Summary:
:::

:::{slide}
:label: cs336-02-064-output-004
:at: 3
- Everything is operations on tensors (parameters, gradients, activations, optimizer states, data)
:::

:::{slide}
:label: cs336-02-064-output-005
:at: 4
- einops: better way to think about tensor operations
:::

:::{slide}
:label: cs336-02-064-output-006
:at: 5
- 6 (# data points) (# parameters) FLOPs per training step
:::


(cs336-02-section-065)=
## Transformers

:::{slide}
:label: cs336-02-065-output-001
:at: 0
- Arithmetic intensity / roofline analysis: compute-bound or memory-bound?
:::

:::{slide}
:label: cs336-02-065-output-002
:at: 1
- Matrix multiplications are compute-bound, elementwise operations are memory-bound
:::

:::{slide}
:label: cs336-02-065-output-003
:at: 2
- Gradient accumulation, activation checkpointing: reduce memory to use bigger batch sizes
:::

