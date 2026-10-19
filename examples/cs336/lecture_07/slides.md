---
title: "CS336 Lecture 07: Parallelism"
lang: en
plugins:
  - '@presmium/slidev-addon-core'
  - '@presmium/slidev-addon-content'
renderers:
  slides: {}
---

(cs336-07-cover)=
# Lecture 07: Parallelism

Stanford CS336 · Language Modeling from Scratch · Spring 2026.


(cs336-07-section-001)=
## Lecture 7: parallelism

:::{slide}
:label: cs336-07-001-output-001
:at: 0
Last week: parallelism within a single GPU
:::

:::{slide}
:label: cs336-07-001-output-002
:at: 1
This week: parallelism across multiple GPUs
:::

:::{slide}
:label: cs336-07-001-output-003
:at: 2
![gpu-node-overview.png](../source/images/gpu-node-overview.png)
:::

:::{slide}
:label: cs336-07-001-output-004
:at: 3
In both cases, **compute** (arithmetic logic units) is far from inputs/outputs (**data**).
:::


(cs336-07-section-002)=
## Lecture 7: parallelism

:::{slide}
:label: cs336-07-002-output-001
:at: 0
Unifying theme: orchestrate computation to avoid data transfer bottlenecks
:::

:::{slide}
:label: cs336-07-002-output-002
:at: 1
Generalized hierarchy:
:::

:::{slide}
:label: cs336-07-002-output-003
:at: 2
- Single node, single GPU: L1 cache / shared memory (fastest)
:::

:::{slide}
:label: cs336-07-002-output-004
:at: 3
- Single node, single GPU: HBM
:::

:::{slide}
:label: cs336-07-002-output-005
:at: 4
- Single node, multi-GPU: NVLink/NVSwitch
:::


(cs336-07-section-003)=
## Lecture 7: parallelism

:::{slide}
:label: cs336-07-003-output-001
:at: 0
- Multi-node, multi-GPU: Infiniband/Ethernet (slowest)
:::

:::{slide}
:label: cs336-07-003-output-002
:at: 1
Last week: reduce memory accesses via fusion/tiling
:::

:::{slide}
:label: cs336-07-003-output-003
:at: 2
This week: reduce communication across GPUs/nodes via replication/sharding
:::

:::{slide}
:label: cs336-07-003-output-004
:at: 3
Why do multi-GPU?
:::

:::{slide}
:label: cs336-07-003-output-005
:at: 4
1. Your parameters (optimizer state + gradients + activations) don't fit on a single GPU.
:::


(cs336-07-section-004)=
## Lecture 7: parallelism

:::{slide}
:label: cs336-07-004-output-001
:at: 0
2. You want to use more GPUs (more FLOPs) to train faster.
:::

:::{slide}
:label: cs336-07-004-output-002
:at: 1
[stdout for this lecture](../source/var/traces/lecture_07_stdout.txt)
:::


(cs336-07-section-005)=
## Part 1: building blocks of distributed communication/computation

:::{slide}
:label: cs336-07-005-output-001
:at: 0
**Collective operations** are the conceptual primitives used for distributed programming 

[article](https://en.wikipedia.org/wiki/Collective_operation)
:::

:::{slide}
:label: cs336-07-005-output-002
:at: 1
- These are classic in the parallel programming literature from the 1980s.
:::

:::{slide}
:label: cs336-07-005-output-003
:at: 2
- *Collective* means that you specify a general communication pattern across many devices.
:::

:::{slide}
:label: cs336-07-005-output-004
:at: 3
- This can be better/faster than managing point-to-point communication yourself.
:::


(cs336-07-section-006)=
## Part 1: building blocks of distributed communication/computation

:::{slide}
:label: cs336-07-006-output-001
:at: 0
**Setup**:
:::

:::{slide}
:label: cs336-07-006-output-002
:at: 1
![ranks.png](../source/images/ranks.png)
:::

:::{slide}
:label: cs336-07-006-output-003
:at: 2
- **Rank**: a particular device/GPU (e.g., 0, 1, 2, 3)
:::

:::{slide}
:label: cs336-07-006-output-004
:at: 3
- **World size**: total number of devices (e.g., 4)
:::

:::{slide}
:label: cs336-07-006-output-005
:at: 4
Operations:
:::


(cs336-07-section-007)=
## Part 1: building blocks of distributed communication/computation

:::{slide}
:label: cs336-07-007-output-001
:at: 0
- Broadcast, scatter, gather, reduce (foundations)
:::

:::{slide}
:label: cs336-07-007-output-002
:at: 1
- All-gather, reduce-scatter, all-reduce (workhorse)
:::

:::{slide}
:label: cs336-07-007-output-003
:at: 2
- All-to-all (for MoEs)
:::

:::{slide}
:label: cs336-07-007-output-004
:at: 3
**Broadcast**: copy from rank 0 to all ranks
:::

:::{slide}
:label: cs336-07-007-output-005
:at: 4
Minor use case: rank 0 loads initial checkpoint and broadcasts to all ranks
:::


(cs336-07-section-008)=
## Part 1: building blocks of distributed communication/computation

:::{slide}
:label: cs336-07-008-output-001
:at: 0
**Scatter** tensor on rank 0 to all ranks
:::

:::{slide}
:label: cs336-07-008-output-002
:at: 1
Note: stepping stone to understanding reduce-scatter
:::

:::{slide}
:label: cs336-07-008-output-003
:at: 2
**Gather** pieces from all ranks to rank 0 (opposite of scatter)
:::

:::{slide}
:label: cs336-07-008-output-004
:at: 3
Note: stepping stone to understanding all-gather
:::

:::{slide}
:label: cs336-07-008-output-005
:at: 4
**Reduce** pieces from all ranks to rank 0, applying some operation (e.g., sum, min, max)
:::


(cs336-07-section-009)=
## Part 1: building blocks of distributed communication/computation

:::{slide}
:label: cs336-07-009-output-001
:at: 0
Note: stepping stone to understanding all-reduce
:::

:::{slide}
:label: cs336-07-009-output-002
:at: 1
**All-gather**: perform gather to all ranks, not just rank 0
:::

:::{slide}
:label: cs336-07-009-output-003
:at: 2
Use case: each rank holds parameter shard, gather to get full parameters for forward pass
:::

:::{slide}
:label: cs336-07-009-output-004
:at: 3
**Reduce-scatter**: perform reduce on each dimension, scatter results
:::

:::{slide}
:label: cs336-07-009-output-005
:at: 4
Use case: after backward pass, sum gradients from different data shards, but distribute storage
:::


(cs336-07-section-010)=
## Part 1: building blocks of distributed communication/computation

:::{slide}
:label: cs336-07-010-output-001
:at: 0
**All-reduce** = reduce-scatter + all-gather
:::

:::{slide}
:label: cs336-07-010-output-002
:at: 1
Use case: after backward pass, sum gradients from different data shards, but replicate full parameters
:::

:::{slide}
:label: cs336-07-010-output-003
:at: 2
Breaking all-reduce into reduce-scatter + all-gather allows for flexibility (e.g., ZeRO/FSDP)
:::

:::{slide}
:label: cs336-07-010-output-004
:at: 3
**All-to-all**: each rank sends each other rank some tensor (most general)
:::

:::{slide}
:label: cs336-07-010-output-005
:at: 4
Notes:
:::


(cs336-07-section-011)=
## Part 1: building blocks of distributed communication/computation

:::{slide}
:label: cs336-07-011-output-001
:at: 0
- Useful for MoEs: each rank has split of data and subset of experts; need to route data to experts
:::

:::{slide}
:label: cs336-07-011-output-002
:at: 1
- For balanced splits, all-to-all looks like transpose
:::

:::{slide}
:label: cs336-07-011-output-003
:at: 2
- Also handles unbalanced splits (but want splits to be as balanced as possible)
:::

:::{slide}
:label: cs336-07-011-output-004
:at: 3
Way to remember the terminology:
:::

:::{slide}
:label: cs336-07-011-output-005
:at: 4
- Reduce: performs some associative/commutative operation (sum, min, max)
:::


(cs336-07-section-012)=
## Part 1: building blocks of distributed communication/computation

:::{slide}
:label: cs336-07-012-output-001
:at: 0
- Scatter is inverse of gather
:::

:::{slide}
:label: cs336-07-012-output-002
:at: 1
- All: means destination is all devices
:::

:::{slide}
:label: cs336-07-012-output-003
:at: 2
Classic (in the home):
:::

:::{slide}
:label: cs336-07-012-output-004
:at: 3
![image-b0641f11a73711b3078acbd257b0c805-https_media_springernature_com_lw685_springer-static_image_art_3A10_1186_2Fs42774-021-00098-3_MediaObjects_42774_2021_98_Fig1_HTML_png_as_webp](../assets/18a088a9e855fb94db742083.webp)
:::

:::{slide}
:label: cs336-07-012-output-005
:at: 4
- GPUs on same node communicate via a PCI(e) bus (v7.0, 16 lanes => 242 GB/s) 

[article](https://en.wikipedia.org/wiki/PCI_Express)
:::


(cs336-07-section-013)=
## Part 1: building blocks of distributed communication/computation

:::{slide}
:label: cs336-07-013-output-001
:at: 0
- GPUs on different nodes communicate via Ethernet (~200 MB/s)
:::

:::{slide}
:label: cs336-07-013-output-002
:at: 1
Modern (in the data center):
:::

:::{slide}
:label: cs336-07-013-output-003
:at: 2
![gpu-node-overview.png](../source/images/gpu-node-overview.png)
:::

:::{slide}
:label: cs336-07-013-output-004
:at: 3
Typical setup:
:::

:::{slide}
:label: cs336-07-013-output-005
:at: 4
- 8 GPUs per node, connected by NVLink to an NVSwitch (B200s' NVLink 5.0 gets 1.8 TB/s; HBM was 8 TB/s)
:::


(cs336-07-section-014)=
## Part 1: building blocks of distributed communication/computation

:::{slide}
:label: cs336-07-014-output-001
:at: 0
- 256 nodes per pod, connected by Infiniband (via PCIe -> HCA / Infiniband NIC -> Infiniband cable) (~0.05 TB/s)
:::

:::{slide}
:label: cs336-07-014-output-002
:at: 1
- N pods per cluster / datacenter, connected by Ethernet (via PCIe -> CPU)
:::

:::{slide}
:label: cs336-07-014-output-003
:at: 2
Bypassing the CPU:
:::

:::{slide}
:label: cs336-07-014-output-004
:at: 3
- Ethernet requires passing through the CPU (copying data to kernel socket buffer, build TCP packets, copy to NIC ring buffer)
:::

:::{slide}
:label: cs336-07-014-output-005
:at: 4
- Remote Direct Memory Access (RDMA): allows one GPU to directly read/write another GPU's memory without involving the CPU
:::


(cs336-07-section-015)=
## Part 1: building blocks of distributed communication/computation

:::{slide}
:label: cs336-07-015-output-001
:at: 0
- Infiniband supports RDMA, but standard Ethernet does not
:::

:::{slide}
:label: cs336-07-015-output-002
:at: 1
Advancements:
:::

:::{slide}
:label: cs336-07-015-output-003
:at: 2
- GB200/GB300 NVL72: 8 GPUs per tray, 9 trays per rack -> 72 GPUs in one NVLink domain
:::

:::{slide}
:label: cs336-07-015-output-004
:at: 3
- RDMA over Converged Ethernet (RoCE): Ethernet bypasses CPU, similar but cheaper/weaker than Infiniband, used by Meta
:::


(cs336-07-section-016)=
## NVIDIA Collective Communication Library (NCCL)

:::{slide}
:label: cs336-07-016-output-001
:at: 0
NCCL translates collective operations into low-level packets that are sent between GPUs. 

[talk](https://www.nvidia.com/en-us/on-demand/session/gtcspring21-s31880/)
:::

:::{slide}
:label: cs336-07-016-output-002
:at: 1
- Detects topology of hardware (e.g., number of nodes, switches, NVLink/PCIe)
:::

:::{slide}
:label: cs336-07-016-output-003
:at: 2
- Optimizes the path between GPUs
:::

:::{slide}
:label: cs336-07-016-output-004
:at: 3
- Launches GPU kernels to send/receive data
:::


(cs336-07-section-017)=
## NVIDIA Collective Communication Library (NCCL)

:::{slide}
:label: cs336-07-017-output-001
:at: 0
PyTorch distributed library (`torch.distributed`) 

[documentation](https://pytorch.org/docs/stable/distributed.html)
:::

:::{slide}
:label: cs336-07-017-output-002
:at: 1
- Provides clean interface for collective operations (e.g., `all_gather_into_tensor`)
:::

:::{slide}
:label: cs336-07-017-output-003
:at: 2
- Supports multiple backends for different hardware: gloo (CPU), nccl (GPU)
:::

:::{slide}
:label: cs336-07-017-output-004
:at: 3
- Also supports higher-level algorithms (e.g., `FullyShardedDataParallel`) [not used in this course]
:::

:::{slide}
:label: cs336-07-017-output-005
:at: 4
Let's walk through some examples.
:::


(cs336-07-section-018)=
## NVIDIA Collective Communication Library (NCCL)

:::{slide}
:label: cs336-07-018-values-001
:at: 0
:until: 1
| Variable | Value |
| --- | --- |
| `rank` | 0 |
| `world_size` | 4 |
:::

:::{slide}
:label: cs336-07-018-values-002
:at: 2
:until: 4
| Variable | Value |
| --- | --- |
| `rank` | 0 |
| `world_size` | 4 |
:::

:::{slide}
:label: cs336-07-018-output-003
:at: 3
Indeed, all-reduce = reduce-scatter + all-gather!
:::

:::{slide}
:label: cs336-07-018-values-004
:at: 5
:until: 6
| Variable | Value |
| --- | --- |
| `rank` | 0 |
| `world_size` | 4 |
:::

:::{slide}
:label: cs336-07-018-output-005
:at: 7
How fast does communication happen?
:::

:::{slide}
:label: cs336-07-018-output-006
:at: 8
References:
:::

:::{slide}
:label: cs336-07-018-output-007
:at: 9
[How to reason about collective operations](https://github.com/NVIDIA/nccl-tests/blob/master/doc/PERFORMANCE.md#allreduce)
:::


(cs336-07-section-019)=
## NVIDIA Collective Communication Library (NCCL)

:::{slide}
:label: cs336-07-019-output-001
:at: 0
[Sample benchmarking code](https://github.com/stas00/ml-engineering/blob/master/network/benchmarks/all_reduce_bench.py)
:::


(cs336-07-section-020)=
## Part 2: distributed training

:::{slide}
:label: cs336-07-020-output-001
:at: 0
Walk through bare-bones implementations of each strategy on deep MLPs.
:::

:::{slide}
:label: cs336-07-020-output-002
:at: 1
Recall that MLPs are the compute bottleneck in Transformers, so this is representative.
:::

:::{slide}
:label: cs336-07-020-output-003
:at: 2
![data-parallelism.png](../source/images/data-parallelism.png)
:::

:::{slide}
:label: cs336-07-020-output-004
:at: 3
Sharding strategy: each rank gets a slice of the data
:::


(cs336-07-section-021)=
## Part 2: distributed training

:::{slide}
:label: cs336-07-021-values-001
:at: 0
:until: 1
| Variable | Value |
| --- | --- |
| `batch_size` | 128 |
:::

:::{slide}
:label: cs336-07-021-values-002
:at: 1
:until: 2
| Variable | Value |
| --- | --- |
| `batch_size` | 128 |
| `num_dim` | 1024 |
:::

:::{slide}
:label: cs336-07-021-values-003
:at: 2
:until: 3
| Variable | Value |
| --- | --- |
| `batch_size` | 128 |
| `num_dim` | 1024 |
| `local_batch_size` | 32 |
:::

:::{slide}
:label: cs336-07-021-values-004
:at: 3
:until: 4
| Variable | Value |
| --- | --- |
| `batch_size` | 128 |
| `num_dim` | 1024 |
| `local_batch_size` | 32 |
| `start_index` | 0 |
:::

:::{slide}
:label: cs336-07-021-values-005
:at: 4
:until: 5
| Variable | Value |
| --- | --- |
| `batch_size` | 128 |
| `num_dim` | 1024 |
| `local_batch_size` | 32 |
| `start_index` | 0 |
| `end_index` | 32 |
:::

:::{slide}
:label: cs336-07-021-values-006
:at: 6
:until: 7
| Variable | Value |
| --- | --- |
| `batch_size` | 128 |
| `num_dim` | 1024 |
| `local_batch_size` | 32 |
| `start_index` | 0 |
| `end_index` | 32 |
:::


(cs336-07-section-022)=
## Part 2: distributed training

:::{slide}
:label: cs336-07-022-output-001
:at: 0
Notes:
:::

:::{slide}
:label: cs336-07-022-output-002
:at: 1
- Losses are different across ranks (computed on local data)
:::

:::{slide}
:label: cs336-07-022-output-003
:at: 2
- Gradients are all-reduced to be the same across ranks
:::

:::{slide}
:label: cs336-07-022-output-004
:at: 3
- Therefore, parameters remain the same across ranks
:::

:::{slide}
:label: cs336-07-022-output-005
:at: 4
Next time: FSDP/ZeRO: use all-gather and reduce-scatter to avoid holding all parameters in memory
:::


(cs336-07-section-023)=
## Part 2: distributed training

:::{slide}
:label: cs336-07-023-output-001
:at: 0
![tensor-parallelism.png](../source/images/tensor-parallelism.png)
:::

:::{slide}
:label: cs336-07-023-output-002
:at: 1
Sharding strategy: each rank gets part of each layer, transfer all data/activations
:::

:::{slide}
:label: cs336-07-023-values-003
:at: 2
:until: 3
| Variable | Value |
| --- | --- |
| `batch_size` | 128 |
:::

:::{slide}
:label: cs336-07-023-values-004
:at: 3
:until: 4
| Variable | Value |
| --- | --- |
| `batch_size` | 128 |
| `num_dim` | 1024 |
:::

:::{slide}
:label: cs336-07-023-values-005
:at: 4
:until: 5
| Variable | Value |
| --- | --- |
| `batch_size` | 128 |
| `num_dim` | 1024 |
| `local_num_dim` | 256 |
:::

:::{slide}
:label: cs336-07-023-values-006
:at: 6
:until: 7
| Variable | Value |
| --- | --- |
| `batch_size` | 128 |
| `num_dim` | 1024 |
| `local_num_dim` | 256 |
:::


(cs336-07-section-024)=
## Part 2: distributed training

:::{slide}
:label: cs336-07-024-output-001
:at: 0
![pipeline-parallelism.png](../source/images/pipeline-parallelism.png)
:::

:::{slide}
:label: cs336-07-024-output-002
:at: 1
Sharding strategy: each rank gets subset of layers, transfer all data/activations
:::

:::{slide}
:label: cs336-07-024-values-003
:at: 2
:until: 3
| Variable | Value |
| --- | --- |
| `batch_size` | 128 |
:::

:::{slide}
:label: cs336-07-024-values-004
:at: 3
:until: 4
| Variable | Value |
| --- | --- |
| `batch_size` | 128 |
| `num_dim` | 1024 |
:::

:::{slide}
:label: cs336-07-024-values-005
:at: 4
| Variable | Value |
| --- | --- |
| `batch_size` | 128 |
| `num_dim` | 1024 |
| `local_num_layers` | 2 |
:::


(cs336-07-section-025)=
## Part 2: distributed training

:::{slide}
:label: cs336-07-025-values-001
:at: 0
:until: 1
| Variable | Value |
| --- | --- |
| `batch_size` | 128 |
| `num_dim` | 1024 |
| `local_num_layers` | 2 |
| `micro_batch_size` | 32 |
:::

:::{slide}
:label: cs336-07-025-values-002
:at: 2
:until: 3
| Variable | Value |
| --- | --- |
| `batch_size` | 128 |
| `num_dim` | 1024 |
| `local_num_layers` | 2 |
| `micro_batch_size` | 32 |
:::

:::{slide}
:label: cs336-07-025-values-003
:at: 4
:until: 6
| Variable | Value |
| --- | --- |
| `batch_size` | 128 |
| `num_dim` | 1024 |
| `local_num_layers` | 2 |
| `micro_batch_size` | 32 |
:::

:::{slide}
:label: cs336-07-025-output-004
:at: 5
Not handled: overlapping communication/computation to eliminate pipeline bubbles
:::

:::{slide}
:label: cs336-07-025-output-005
:at: 7
What's missing?
:::

:::{slide}
:label: cs336-07-025-output-006
:at: 8
- Communication/computation overlap
:::

:::{slide}
:label: cs336-07-025-output-007
:at: 9
- More general models (with attention, etc.)
:::


(cs336-07-section-026)=
## Part 2: distributed training

:::{slide}
:label: cs336-07-026-output-001
:at: 0
- Other forms of parallelism (e.g., sequence parallelism, expert parallelism, combinations)
:::

:::{slide}
:label: cs336-07-026-output-002
:at: 1
- Jax/TPUs: just define the model, the sharding strategy, and the Jax compiler handles the rest 

[levanter](https://crfm.stanford.edu/2023/06/16/levanter-1_0-release.html)
:::

:::{slide}
:label: cs336-07-026-output-003
:at: 2
- But we're doing PyTorch so you can see how one builds up from the primitives
:::


(cs336-07-section-027)=
## Summary

:::{slide}
:label: cs336-07-027-output-001
:at: 0
- Many ways to parallelize: data (batch), tensor/expert (width), pipeline (depth), sequence (length)
:::

:::{slide}
:label: cs336-07-027-output-002
:at: 1
- Data parallelism: DDP (all-reduce), FSDP/ZeRO (all-gather + reduce-scatter)
:::

:::{slide}
:label: cs336-07-027-output-003
:at: 2
- Tensor parallelism: requires very fast interconnects (e.g., NVLink)
:::

:::{slide}
:label: cs336-07-027-output-004
:at: 3
- Pipeline parallelism: can work with slow interconnects, but need to work to reduce pipeline bubbles
:::


(cs336-07-section-028)=
## Summary

:::{slide}
:label: cs336-07-028-output-001
:at: 0
- Can **re-compute** or store in **memory** or store in another GPUs memory and **communicate**
:::

:::{slide}
:label: cs336-07-028-output-002
:at: 1
- Hardware is getting faster, but will always want bigger models, so will have this hierarchical structure
:::

