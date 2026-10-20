---
title: "CS336 Lecture 10: Inference"
lang: en
plugins:
  - '@lincyaw/slidev-addon-core'
  - '@lincyaw/slidev-addon-content'
renderers:
  web: {}
  notebook: {}
---

(cs336-10-cover)=
# Lecture 10: Inference

Stanford CS336 · Language Modeling from Scratch · Spring 2026.


(cs336-10-topic-002)=
## Lecture 10: inference

![inference-schema.png](../source/images/inference-schema.png)

(cs336-10-topic-003)=
### Understanding the inference workload

Inference shows up in many places:

- Actual use (chatbots, code completion, agents, batch data processing)
- Model evaluation (e.g., on instruction following)
- Reinforcement learning (sample many generations, then apply score)

Why **efficiency** matters: training is one-time cost, inference is repeated many times

- OpenAI processes ~8.6T tokens per day [article](https://www.pymnts.com/artificial-intelligence-2/2025/openai-bests-google-in-race-for-consumer-ai-token-consumption/)
- For reference, DeepSeek v4 was trained on 32T tokens [DeepSeek-V4: Towards Highly Efficient Million-Token Context Intelligence](https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro/blob/main/DeepSeek_V4.pdf)

Moreover:

- Chatbots: most tokens are meant for human consumption (humans are bottleneck)
- Agents: query → internal trace → output for human (number of tokens generated can grow unbounded)
- Tokens generated = compute spent

Companies doing inference (a big deal for anyone who has a product or platform):

- Providers serving closed models (OpenAI, Anthropic, Google, etc.)
- Providers serving open-weight models (Together, Fireworks, Baseten, DeepInfra, Groq, Cerebras, etc.)

Open-source packages:

- vLLM: from Berkeley, pioneered PagedAttention, popular and good default [GitHub](https://github.com/vllm-project/vllm)
- SGLang: from Berkeley, pioneered RadixAttention, good for agentic workloads [project](https://sgl-project.github.io/)
- TensorRT-LLM: from NVIDIA, highly optimized for GPUs [article](https://nvidia.github.io/TensorRT-LLM/overview.html)
- llama.cpp: C++ only, supports CPU inference, runs locally [GitHub](https://github.com/ggml-org/llama.cpp)

Inference is huge. Important to make it fast.

What does "fast" mean (metrics)?

- Time-to-first-token (TTFT): how long user waits before any generation happens (for interactive applications)
- Latency (seconds/token): how fast tokens appear for *one* query (for interactive applications)
- Throughput (tokens/second): how fast tokens appear for *many* queries (for batch processing)

What governs efficiency?

- Training (supervised): you see all tokens, can parallelize over sequence (matmul in Transformer)
- Inference: you have to generate sequentially, can't parallelize over generation, so harder to fully utilize compute [Scaling book chapter on Transformers](https://jax-ml.github.io/scaling-book/transformers/)

Notation (similar to einops):

- Symbols denote dimensions (and their length): B (batch), T (sequence), D (model dim), H (head dim)
- Example: BT&lt;font color="red">D&lt;/font> x &lt;font color="red">D&lt;/font>H → BTH
- &lt;font color="red">Contracting (red)&lt;/font> dimensions appear in both operands and disappear from result
- Regular (black) dimensions appear in one operand and stay in result
- Example: &lt;font color="blue">B&lt;/font>&lt;font color="red">D&lt;/font> x &lt;font color="blue">B&lt;/font>&lt;font color="red">D&lt;/font> → B
- &lt;font color="blue">Batching (blue)&lt;/font> dimensions appear in both operands and stay in result

![image-2a272a1a4f8f6ddbe5aaa45fcb38ed57-https_jax-ml_github_io_scaling-book_assets_img_transformer-diagram_png](../assets/d0738c814babb98e01466225.png)

Conventions:

- F = 4 D (MLP up-projects into 4x the model dimension)
- D = N H (model dimension split across N heads)
- N = K G (for GQA, number of heads split across K groups)
- S = T (during training, condition on S input tokens to predict T output tokens)

Setup: multiply X &lt;font color="gray">(B x D)&lt;/font> and W &lt;font color="gray">(D x F)&lt;/font> matrix

Intuition: B is batch size, D is hidden dimension, F is up-projection dimension in MLP

Let's do FLOPs and memory read/write accounting for the matrix multiplication (X * W).

1. Read X &lt;font color="gray">(B x D)&lt;/font> from HBM
2. Read W &lt;font color="gray">(D x F)&lt;/font> from HBM
3. Compute Y = X &lt;font color="gray">(B x D)&lt;/font> @ W &lt;font color="gray">(D x F)&lt;/font>
4. Write Y &lt;font color="gray">(B x F)&lt;/font> to HBM

Recall that **arithmetic intensity** is how much compute we do per byte transferred (want to be high).

| Variable | Value |
| --- | --- |
| `intensity` | B*D*F/(B*D + B*F + D*F) |

Assuming B is much less than D and F, then we can simplify:

| Variable | Value |
| --- | --- |
| `intensity` | B |

Accelerator intensity of H100:

| Variable | Value |
| --- | --- |
| `accelerator_intensity` | 295.2238805970149 |

If computation intensity > accelerator intensity, **compute-bound** (good)

If computation intensity < accelerator intensity, **memory-bound** (bad)

Conclusion: compute-bound iff B > 295

Extreme case (B = 1, corresponding to matrix-vector product):

- Arithmetic intensity: 1
- Memory-bound (read D x F matrix, perform only 2 D F FLOPs)
- This is basically what happens with inference... [Scaling book chapter on inference](https://jax-ml.github.io/scaling-book/inference/)

![image-7ba69ac6feff08da76241c8e1dcf334c-https_jax-ml_github_io_scaling-book_assets_img_naive-inference-1400_webp](../assets/717dbf0c530250aea5f1474d.webp)

Naive inference: to generate each token, feed history into Transformer

Complexity: generating T tokens requires O(T^3) FLOPs (one feedforward pass is O(T^2))

Observation: a lot of the work can be shared across prefixes

Solution: store **KV cache** in HBM

![image-1a4873c436f3fbe1d863837d3b38a114-https_jax-ml_github_io_scaling-book_assets_img_cached-inference-1400_webp](../assets/6120ead0f47aab9f3bac18d9.webp)

KV cache: for every sequence (B), token (S), layer (L), head (K), store an H-dimensional vector

Two stages of inference:

1. **Prefill**: given a prompt, encode into vectors (parallelizable like in training)
2. **Generation**: generate new response tokens (sequential)

Let's compute the FLOPs and memory IO for both the MLP and attention layers.

S is the number of tokens we're conditioning on, T is the number of tokens we're generating.

Later, we'll specialize to prefill (T = S) and generation (T = 1).

(cs336-10-topic-004)=
### MLP layers (only looking at the matrix multiplications)

1. Read X &lt;font color="gray">(B x T x D)&lt;/font> from HBM
2. Read Wup &lt;font color="gray">(D x F)&lt;/font>, Wgate &lt;font color="gray">(D x F)&lt;/font>, Wdown &lt;font color="gray">(F x D)&lt;/font> from HBM
3. Compute U = X &lt;font color="gray">(B x T x D)&lt;/font> @ Wup &lt;font color="gray">(D x F)&lt;/font>
4. Write U &lt;font color="gray">(B x T x F)&lt;/font> to HBM
5. Compute G = X &lt;font color="gray">(B x T x D)&lt;/font> @ Wgate &lt;font color="gray">(D x F)&lt;/font>
6. Write G &lt;font color="gray">(B x T x F)&lt;/font> to HBM
7. Compute Y = GeLU(G)*U &lt;font color="gray">(B x T x F)&lt;/font> @ Wdown &lt;font color="gray">(F x D)&lt;/font>
8. Write Y &lt;font color="gray">(B x T x D)&lt;/font> to HBM

| Variable | Value |
| --- | --- |
| `intensity` | 3*B*D*F*T/(2*B*D*T + 2*B*F*T + 3*D*F) |

Assume that B*T is much smaller than D and F.

| Variable | Value |
| --- | --- |
| `intensity` | B*T |

For the two stages:

1. Prefill: easy to make compute-bound (good) by making `B*T` large enough (large batches, long sequences)
2. Generation: two problems
- Generating one token at a time (T = 1)
- B is number of concurrent requests, unpredictable for interactive applications

(cs336-10-topic-005)=
### Attention layers (focusing on the matrix multiplications with FlashAttention)

- S is number of previous tokens (already generated)
- T is number of next tokens (to generate logits for)
1. Read Q &lt;font color="gray">(B x T x D)&lt;/font>, K &lt;font color="gray">(B x S x D)&lt;/font>, V &lt;font color="gray">(B x S x D)&lt;/font> from HBM
2. Compute A = Q &lt;font color="gray">(B x T x D)&lt;/font> @ K &lt;font color="gray">(B x S x D)&lt;/font>
3. Compute Y = softmax(A) &lt;font color="gray">(B x S x T x K x G)&lt;/font> @ V &lt;font color="gray">(B x S x K x H)&lt;/font>
4. Write Y &lt;font color="gray">(B x T x D)&lt;/font> to HBM

| Variable | Value |
| --- | --- |
| `intensity` | S*T/(S + T) |

For the two stages:

1. Prefill: T = S

| Variable | Value |
| --- | --- |
| `prefill_intensity` | S/2 |

2. Generation: T = 1

| Variable | Value |
| --- | --- |
| `generate_intensity` | S/(S + 1) |

Unlike MLPs, no dependence on B, so batching doesn't help!

Why?

- In MLP layers, every sequence hits the same MLP weights (Wup, Wgate, Wdown don't depend on B)
- In attention layers, every sequence has its own KV cache vectors (Q, K, V all depend on B)

Summary:

- Prefill is compute-bound, generation is memory-bound
- Prefill MLP intensity: `B*S`
- Prefill attention intensity: `S/2`
- Generation MLP intensity: `B` (requires concurrent requests)
- Generation attention intensity: `<1` (impossible to improve)

So we have shown that inference is memory-bound.

Let us now compute the theoretical maximum latency and throughput of a single request.

Assumption: can overlap compute and communication perfectly and ignore overhead.

Instantiate latency and throughput for Llama 2 13B on an H100:

**`config`**

```python
{'S': 1024,
 'D': 5120,
 'F': 13824,
 'N': 40,
 'K': 40,
 'H': 128,
 'L': 40,
 'V': 32000,
 'memory_bandwidth': 3350000000000.0}
```

| Variable | Value |
| --- | --- |
| `num_params` | 13015449600 |

| Variable | Value |
| --- | --- |
| `memory` | 838860800*B + 26030899200 |

| Variable | Value |
| --- | --- |
| `latency` | 0.000250406208955224*B + 0.00777041767164179 |

| Variable | Value |
| --- | --- |
| `throughput` | 127792.358398438*B/(32*B + 993) |

**`b1`**

```python
{'num_params': 13015449600,
 'memory': 26869760000,
 'latency': 0.008020823880597015,
 'throughput': 124.6754716082317}
```

**`b64`**

```python
{'num_params': 13015449600,
 'memory': 79717990400,
 'latency': 0.02379641504477612,
 'throughput': 2689.480742354489}
```

Result: worse latency, better throughput

**`b256`**

```python
{'num_params': 13015449600,
 'memory': 240779264000,
 'latency': 0.0718744071641791,
 'throughput': 3561.7685084376703}
```

Result: even worse latency, even better throughput

Result: doesn't fit into memory and throughput gains are diminishing too...

What increasing batch size does:

- Worsens latency because larger KV cache (O(B) size) to read/write
- Improves throughput because amortizes the cost of reading parameters

**Tradeoff** between latency and throughput:

1. Smaller batch sizes yield better latency but worse throughput
2. Larger batch sizes yield better throughput but worse latency

Easy parallelism: if you launch M copies of the model, latency is the same, throughput increases by M!

Harder parallelism: shard the model and the KV cache [Scaling book chapter on inference](https://jax-ml.github.io/scaling-book/inference/)

Note: time-to-first-token (TTFT) is essentially a function of prefill time

Use smaller batch sizes during prefill for faster TTFT

Use larger batch sizes during generation to improve throughput

(cs336-10-topic-006)=
### Taking shortcuts (lossy)

Recall that memory is the bottleneck for inference.

So let's try to reduce the size of the KV cache

...but make sure we don't lose too much accuracy.

(cs336-10-topic-007)=
### Grouped-query attention (GQA)

[Ainslie+ 2023](https://arxiv.org/pdf/2305.13245.pdf)

![image-45c47d328aa951d9cbe28b4ae0074615-https_jax-ml_github_io_scaling-book_assets_img_gmqa_png](../assets/51c624a45fec6e8a097f66e5.png)

Idea: N query heads, but only K key and value heads, each interacting with N/K query heads

Multi-headed attention (MHA): K=N

Multi-query attention (MQA): K=1

Group-query attention (GQA): K is somewhere in between

Latency/throughput improves: [Ainslie+ 2023](https://arxiv.org/pdf/2305.13245.pdf)

![gqa-speed.png](../source/images/gqa-speed.png)

Why does GQA improve latency and throughput?

GQA reduces the KV cache by a factor of N/K.

Reminder: reducing memory usage leads to speedup (since we're memory-bound).

**`k40_b64`**

```python
{'num_params': 13015449600,
 'memory': 79717990400,
 'latency': 0.023796415044776118,
 'throughput': 2689.480742354489}
```

**`k8_b64`**

```python
{'num_params': 11337728000,
 'memory': 33412874240,
 'latency': 0.00997399231044776,
 'throughput': 6416.688323787855}
```

Result: Worse latency, but better throughput (and it fits in memory now!)

**`k8_b256`**

```python
{'num_params': 11337728000,
 'memory': 65625128960,
 'latency': 0.01958959073432836,
 'throughput': 13068.164795877605}
```

Result: Worse latency, but better throughput (and still fits in memory!)

Check that accuracy doesn't drop: [Ainslie+ 2023](https://arxiv.org/pdf/2305.13245.pdf)

![gqa-accuracy.png](../source/images/gqa-accuracy.png)

(cs336-10-topic-008)=
### Multi-head latent attention (MLA)

[DeepSeek-AI+ 2024](https://arxiv.org/abs/2405.04434)

![mla-schema.png](../source/images/mla-schema.png)

Normal attention: KV cache consists of K = W_K h, V = W_V h (N*H dimensions)

MLA: store compressed vector c = W_c h (C dimensions), project up to K = W_K c, V = W_V c when needed

DeepSeek v2: reduce N*H = 16384 to C = 512

Wrinkle: MLA is not compatible with RoPE, so need to add additional 64 dimensions for RoPE, so 512 + 64 = 576 total dimensions

Latency/throughput improvements follow similarly from the KV cache reduction as argued earlier

Let's now check the accuracy.

First, MHA is better than GQA (though more expensive) [Table 8] [DeepSeek-AI+ 2024](https://arxiv.org/abs/2405.04434)

![mla-accuracy.png](../source/images/mla-accuracy.png)

Second, MLA is even a bit better than MHA (and much cheaper) [Table 9] [DeepSeek-AI+ 2024](https://arxiv.org/abs/2405.04434)

![mla-accuracy2.png](../source/images/mla-accuracy2.png)

(cs336-10-topic-009)=
### Cross-layer attention (CLA)

[Brandon+ 2024](https://arxiv.org/abs/2405.12981)

![cla-diagram.png](../source/images/cla-diagram.png)

Idea: share KVs across **layers** (just as GQA shares KVs across heads)

Empirically improves the pareto frontier of accuracy and KV cache size (latency and throughput)

![cla-results.png](../source/images/cla-results.png)

(cs336-10-topic-010)=
### Local (sliding window) attention

[Beltagy+ 2020](https://arxiv.org/pdf/2004.05150.pdf) [Child+ 2019](https://arxiv.org/pdf/1904.10509.pdf) [Jiang+ 2023](https://arxiv.org/pdf/2310.06825.pdf)

![longformer-attention.png](../source/images/longformer-attention.png)

Idea: just look at the local context, which is most relevant for modeling

Effective context scales linearly with the number of layers

KV cache is independent of sequence length!

Problem: this can still hurt accuracy

Solution: interleave local attention with global attention (hybrid layers)

(cs336-10-topic-011)=
### DeepSeek v4 attention

- Supports 1M context length [DeepSeek-V4: Towards Highly Efficient Million-Token Context Intelligence](https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro/blob/main/DeepSeek_V4.pdf)

![deepseek-v4-attention.png](../source/images/deepseek-v4-attention.png)

- Compressed Sparse Attention (CSA): compresses every m tokens into 1
- DeepSeek Sparse Attention (DSA): selects the top k
- Heavily Compressed Attention (HCA): compresses even more

Summary:

- Goal: reduce the KV cache size (since inference is memory-bound) without hurting accuracy
- Lower-dimensional KV cache (GQA, MLA, CLA)
- Local attention (truncates the KV cache) on some of the layers
- Other ideas: linear attention / state-space-models (Mamba 2, GatedDeltaNet), diffusion models

Key idea: reduce the precision of numbers

Less memory means higher latency/throughput (since inference is memory-bound).

Of course we have to worry about accuracy...

| Variable | Value |
| --- | --- |
| `x` | 5.2342 |

| Variable | Value |
| --- | --- |
| `x_quant` | 56 |

| Variable | Value |
| --- | --- |
| `x_approx` | 5.2 |

![image-6e6964259cf3d5a080f18d21764d2bec-https_www_datocms-assets_com_104802_1709770809-twitter-post-20_png](../assets/1b12d7a290332486a008e748.png) [article](https://www.baseten.co/blog/fp8-efficient-model-inference-with-8-bit-floating-point-numbers/)

- fp32 (4 bytes): needed for parameters and optimizer states during training
- bf16 (2 bytes): default for inference
- fp8 (1 byte) [-240, 240] for e4m3 on H100s: can train if you dare [Peng+ 2023](https://arxiv.org/pdf/2310.18313)
- int8 (1 byte) [-128, 127]: less accurate but cheaper than fp8, but for inference only [Baalen+ 2023](https://arxiv.org/pdf/2303.17951)
- int4 (0.5 bytes) [-8, 7]: cheaper, even less accurate [Baalen+ 2023](https://arxiv.org/pdf/2303.17951) [Overview of approaches](https://apxml.com/posts/llm-quantization-techniques-explained)

Quantization-aware training (QAT)

- During training, quantize-and-dequantize during the forward pass to simulate quantization errors
- Pro: weights are trained to work with quantization
- Con: requires expensive large-scale training

Post-training quantization (PTQ):

- Done after training, so much cheaper
- Run on sample data to determine scale and zero point for each layer or tensor
- GPTQ: use Hessian information to update non-quantized weights to account for quantization error [Frantar+ 2022](https://arxiv.org/abs/2210.17323)

(cs336-10-topic-012)=
### Activation-aware quantization (AWQ)

[Lin+ 2023](https://arxiv.org/abs/2306.00978)

- Observation: some activation channels are large
- Weights that hit those matter more
- Allocate more precision to those weights
- Idea: select which weights (0.1-1%) to keep in high precision based on activations
- fp16 → int3 produces 4x lower memory, 3.2x speedup

![awq-schema.png](../source/images/awq-schema.png)

Key idea: just rip out parts of an expensive model to make it cheaper

...and then fix it up.

Paper from NVIDIA [Muralidharan+ 2024](https://arxiv.org/abs/2407.14679)

![pruning-kd-loop.png](../source/images/pruning-kd-loop.png)

Algorithm:

1. Identify important {layer, head, hidden dimension} on a small calibration dataset (1024 samples)
2. Remove unimportant layers to get a smaller model
3. Distill the original model into pruned model

Results:

![pruning-kd.png](../source/images/pruning-kd.png)

Summary: reduce inference complexity without hurting accuracy

From scratch recipe:

1. Define faster model architecture
2. Train faster model

Distillation recipe:

1. Define faster model architecture
2. Initialize weights using original model (which has a different architecture)
3. Repair faster model (distillation)

(cs336-10-topic-013)=
### Use shortcuts but double check (lossless)

Recall the two stages of inference:

- Prefill: given a sequence, encode tokens in parallel (compute-bound) [note: also gives you probabilities]
- Generation: generate one token at a time (memory-bound)

In other words, checking is faster than generation.

Speculative sampling [Leviathan+ 2022](https://arxiv.org/abs/2211.17192) [Chen+ 2023](https://arxiv.org/abs/2302.01318)

- Use a cheaper **draft model** p to guess a few tokens (e.g., 4)
- Evaluate with target model q (process tokens in parallel), and accept if it looks good [Speculative sampling video](https://storage.googleapis.com/gweb-research2023-media/media/SpeculativeDecoding-1-Illustration.mp4) [article](https://research.google/blog/looking-back-at-speculative-decoding/)

![speculative-sampling-algorithm.png](../source/images/speculative-sampling-algorithm.png)

This is modified rejection sampling with proposal p and target q

Modification: always generate at least one candidate (rejection sampling will keep looping)

Key property: guaranteed to be an **exact sample** from the target model!

Proof by example: assume two vocabulary elements {A, B}

- Target model probabilities: [q(A), q(B)]
- Draft model probabilities: [p(A), p(B)]
- Assume p(A) > q(A) [draft model oversamples A].
- Therefore p(B) < q(B) [draft model undersamples B].
- Residual probabilities max(q-p, 0): [0, 1]

Compute the probabilities of speculatively sampling a token:

- P[sampling A] = p(A) * (q(A) / p(A)) + p(B) * 1 * 0 = q(A)
- P[sampling B] = p(B) * 1 + p(A) * (1 - q(A) / p(A)) * 1 = q(B)

![speculative-sampling-results.png](../source/images/speculative-sampling-results.png)

![speculative-sampling-stats.png](../source/images/speculative-sampling-stats.png)

In practice:

- Target model has 70B parameters, draft model has 8B parameters
- Target model has 8B parameters, draft model has 1B parameters
- Try to make draft model as close to target (distillation)

Extensions to improve the draft model:

- Medusa: draft model generates multiple tokens in parallel [Cai+ 2024](https://arxiv.org/abs/2401.10774)
- EAGLE: draft model takes high-level features from target model [Li+ 2024](https://arxiv.org/pdf/2401.15077)

![medusa-eagle.png](../source/images/medusa-eagle.png)

Summary:

- Exact sampling from target model (thanks to math)!
- Exploits asymmetry between checking and generation
- Lots of room for innovation on the draft model (involves training)

(cs336-10-topic-014)=
### Handling dynamic workloads

Batching over sequences in live traffic is tricky because:

1. Requests arrive at different times (waiting for batch is bad for early requests)
2. Sequences have shared prefixes (e.g., system prompts, generating multiple samples)
3. Sequences have different lengths (padding is inefficient) [Orca: A Distributed Serving System for Transformer-Based Generative Models](https://www.usenix.org/system/files/osdi22-yu.pdf) [talk](https://www.youtube.com/watch?v=Ob9PPLxETYU)

Problem:

- Training: get a dense block of tokens (batch size x sequence length)
- Inference: requests arrive and finish at different times, so you have a ragged array

![image-1d1ec88764cc9f6eee8cc00bfce35f75-https_images_ctfassets_net_xjan103pcp94_1LJioEsEdQQpDCxYNWirU6_82b9fbfc5b78b10c1d4508b60e72fdcf_cb_02_diagram-static-batching_png](../assets/a4b1963edf5361606005f998.png)

Solution: iteration-level scheduling

- Decode step by step
- Add new requests to the batch as they arrive (so don't have to wait until generation completes)

Problem:

- Batching only works when all sequences have the same dimensionality (right?)
- But each request might have a different length

Solution: selective batching

- Training: when all sequences of the same length, operate on a B x S x H tensor
- But we might have different lengths: [3, H], [9, H], [5, H], etc.
- Attention computation: process each sequence separately
- Non-attention computation: concatenate all the sequences together to [3 + 9 + 5, H]

Paper that introduced vLLM in addition to PagedAttention [Kwon+ 2023](https://arxiv.org/pdf/2309.06180.pdf)

Previous status quo:

- Request comes in
- Allocate section of KV cache for prompt and response (up to a max length)

![paged-attention-fragmentation.png](../source/images/paged-attention-fragmentation.png)

Problem: fragmentation (what happens to your hard drive)

- But this is wasteful since we might generate much fewer tokens (internal fragmentation)!
- Might be extra unused space between sections (external fragmentation)!

Solution: PagedAttention (remember operating systems)

- Divide the KV cache of a sequence into non-contiguous **blocks**

![paged-attention-blocks.png](../source/images/paged-attention-blocks.png)

Two requests share the KV caches:

![paged-attention-logical.png](../source/images/paged-attention-logical.png)

In general, multiple types of sharing KV caches across sequences:

![paged-attention-sharing.png](../source/images/paged-attention-sharing.png)

- Sharing the system prompt
- Sampling multiple responses per prompt (e.g., for program synthesis)

Solution: share prefixes, copy-on-write at the block level

![paged-attention-parallel.png](../source/images/paged-attention-parallel.png)

Other vLLM optimizations:

- Kernel to fuse block read and attention (reduce kernel launch overhead)
- Use latest kernels (FlashAttention, FlashDecoding)
- Use CUDA graphs to avoid kernel launch overhead

Summary: use ideas from operating systems (paging) to make use of memory for dynamic workloads

(cs336-10-topic-015)=
### Summary

- Inference is important (actual use, evaluation, reinforcement learning)
- Different characteristics compared to training (memory-bound, dynamic)
- Techniques: new architectures, quantization, pruning/distillation, speculative sampling
- Ideas from systems (speculative execution, paging)
- New architectures have huge potential for improvement
