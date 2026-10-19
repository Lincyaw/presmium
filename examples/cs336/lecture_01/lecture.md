---
title: "CS336 Lecture 01: Introduction and tokenization"
lang: en
plugins:
  - '@presmium/slidev-addon-core'
  - '@presmium/slidev-addon-content'
renderers:
  web: {}
  notebook: {}
---

(cs336-01-cover)=
# Lecture 01: Introduction and tokenization

Stanford CS336 · Language Modeling from Scratch · Spring 2026.


(cs336-01-topic-002)=
## CS336: Language Models From Scratch (Spring 2026)

![course-staff.png](../source/images/course-staff.png)

...bringing you the 3rd offering of CS336.

Lectures from 2nd offering (Spring 2025) are on [YouTube](https://www.youtube.com/playlist?list=PLoROMvodv4rOY23Y0BoGoBGgQ1zmU_MT_).

What's new?

- Same 'from scratch' philosophy
- Prioritize high value-per-time concepts, don't lose the forest for the trees
- More coverage of modern LM ingredients (mixture of experts, long-context, agents)

(cs336-01-topic-003)=
## Why did we make this course?

Problem: researchers are becoming **disconnected** from the underlying technology.

- 2016: researchers implemented and trained their own models.
- 2018: researchers downloaded models (e.g., BERT) and fine-tuned them.
- Today: researchers prompt API models (e.g., GPT/Claude/Gemini).

Moving up levels of abstraction boosts productivity, but

- These abstractions are leaky (in contrast to programming languages or operating systems).
- There is still fundamental research to be done that requires tearing up the stack.

**Full understanding** of this technology is necessary for **fundamental research**.

Philosophy of this course: **understanding via building**.

But there's one small problem...

(cs336-01-topic-004)=
## The industrialization of language models

![image-dda46aa409183107fcd9201cd89dac21-https_upload_wikimedia_org_wikipedia_commons_c_cc_Industrialisation_jpg](../assets/5111a3f53e45baa6d0120979.jpg)

Frontier models are really expensive:

- 2023: GPT-4 supposedly cost $100M to train. [article](https://www.wired.com/story/openai-ceo-sam-altman-the-age-of-giant-ai-models-is-already-over/)
- 2025: xAI builds cluster with 230K GPUs for training Grok. [article](https://x.com/elonmusk/status/1947701807389515912)

There are no public details on how frontier models are built.

From the GPT-4 technical report [OpenAI+ 2023](https://arxiv.org/pdf/2303.08774.pdf) :

![gpt4-no-details.png](../source/images/gpt4-no-details.png)

Frontier models are out of reach for us.

We could build small language models (<1B parameters), but this might not be representative of large language models.

Example 1: fraction of FLOPs spent in attention versus MLP changes with scale. [post](https://x.com/stephenroller/status/1579993017234382849)

![roller-flops.png](../source/images/roller-flops.png)

Example 2: emergence of behavior with scale [Wei+ 2022](https://arxiv.org/pdf/2206.07682)

![wei-emergence-plot.png](../source/images/wei-emergence-plot.png)

(cs336-01-topic-005)=
## What can we learn in this class that transfers to frontier models?

There are three types of knowledge:

- **Mechanics**: how things work (what a Transformer is, how model parallelism works)
- **Mindset**: squeezing the most out of the hardware, taking scaling seriously
- **Intuitions**: which data and modeling decisions yield good accuracy

We can teach mechanics and mindset (these do transfer).

We can only partially teach intuitions (do not necessarily transfer across scales).

(cs336-01-topic-006)=
## Intuitions? 🤷

Some design decisions are simply not (yet) justifiable and just come from experimentation.

Example: Noam Shazeer paper that introduced SwiGLU [Shazeer 2020](https://arxiv.org/pdf/2002.05202.pdf)

![divine-benevolence.png](../source/images/divine-benevolence.png)

(cs336-01-topic-007)=
## The bitter lesson

Wrong interpretation: scale is all that matters, algorithms don't matter.

Right interpretation: algorithms that scale are what matter.

(cs336-01-topic-008)=
### accuracy = efficiency x resources

In fact, efficiency is way more important at larger scales (can't afford to be wasteful).

[Hernandez+ 2020](https://arxiv.org/abs/2005.04305) showed 44x algorithmic efficiency on ImageNet between 2012 and 2019.

Framing: what is the best model one can build given a certain compute and data budget?

In other words, **maximize efficiency**!

(cs336-01-topic-009)=
## Pre-neural (before 2010s)

- Language model to measure the entropy of English [Shannon 1950](https://www.princeton.edu/~wbialek/rome/refs/shannon_51.pdf)
- N-gram language models (used in machine translation and speech recognition systems) [Brants+ 2007](https://aclanthology.org/D07-1090.pdf)

(cs336-01-topic-010)=
## Neural ingredients (2010s)

- Long-Short Term Memory (LSTM) [Hochreiter+ 1997](https://www.bioinf.jku.at/publications/older/2604.pdf)
- First neural language model [Bengio+ 2003](https://www.jmlr.org/papers/volume3/bengio03a/bengio03a.pdf)
- Sequence-to-sequence modeling (for machine translation) [Sutskever+ 2014](https://arxiv.org/pdf/1409.3215.pdf)
- Adam optimizer [Kingma+ 2014](https://arxiv.org/pdf/1412.6980.pdf)
- Attention mechanism (for machine translation) [Bahdanau+ 2014](https://arxiv.org/pdf/1409.0473.pdf)
- Transformer architecture (for machine translation) [Vaswani+ 2017](https://arxiv.org/pdf/1706.03762.pdf)
- Mixture of experts [Shazeer+ 2017](https://arxiv.org/pdf/1701.06538.pdf)
- Model parallelism [Huang+ 2018](https://arxiv.org/pdf/1811.06965.pdf) [Rajbhandari+ 2019](https://arxiv.org/abs/1910.02054) [Shoeybi+ 2019](https://arxiv.org/pdf/1909.08053.pdf)

(cs336-01-topic-011)=
## Early foundation models (late 2010s)

- ELMo: pretraining with LSTMs, fine-tuning improves downstream tasks [Peters+ 2018](https://arxiv.org/abs/1802.05365)
- BERT: pretraining with Transformer, fine-tuning improves downstream tasks [Devlin+ 2018](https://arxiv.org/abs/1810.04805)
- Google's T5 (11B): cast everything as text-to-text [Raffel+ 2019](https://arxiv.org/pdf/1910.10683.pdf)

(cs336-01-topic-012)=
## Embracing scaling

- OpenAI's GPT-2 (1.5B): fluent text, first signs of zero-shot [Radford+ 2019](https://cdn.openai.com/better-language-models/language_models_are_unsupervised_multitask_learners.pdf)
- Scaling laws: provide hope / predictability for scaling [Kaplan+ 2020](https://arxiv.org/pdf/2001.08361.pdf)
- OpenAI's GPT-3 (175B): in-context learning [Brown+ 2020](https://arxiv.org/pdf/2005.14165.pdf)
- Google's PaLM (540B): massive scale, undertrained [Chowdhery+ 2022](https://arxiv.org/pdf/2204.02311.pdf)
- DeepMind's Chinchilla (70B): compute-optimal scaling laws [Hoffmann+ 2022](https://arxiv.org/pdf/2203.15556.pdf)

(cs336-01-topic-013)=
## Open models

Early attempts (attempts to replicate GPT-3):

- EleutherAI's open datasets (The Pile) and models (GPT-J) [Gao+ 2020](https://arxiv.org/pdf/2101.00027.pdf) [Wang+ 2021](https://arankomatsuzaki.wordpress.com/2021/06/04/gpt-j/)
- Meta's OPT (175B): GPT-3 replication, lots of hardware issues [Zhang+ 2022](https://arxiv.org/pdf/2205.01068.pdf)
- Hugging Face / BigScience's BLOOM (176B): focused on data sourcing [Workshop+ 2022](https://arxiv.org/abs/2211.05100)

Credible open-weight models (weights + paper):

- Meta's Llama models [Touvron+ 2023](https://arxiv.org/pdf/2302.13971.pdf) [Touvron+ 2023](https://arxiv.org/pdf/2307.09288.pdf) [Grattafiori+ 2024](https://arxiv.org/abs/2407.21783)
- Mistral's models [Jiang+ 2023](https://arxiv.org/pdf/2310.06825.pdf) [Jiang+ 2024](https://arxiv.org/pdf/2401.04088.pdf)
- DeepSeek's models [DeepSeek-AI+ 2024](https://arxiv.org/pdf/2401.02954.pdf) [DeepSeek-AI+ 2024](https://arxiv.org/abs/2405.04434) [DeepSeek-AI+ 2024](https://arxiv.org/pdf/2412.19437.pdf) [DeepSeek-AI+ 2025](https://arxiv.org/pdf/2501.12948.pdf) [DeepSeek-AI+ 2025](https://arxiv.org/abs/2512.02556)
- Alibaba's Qwen models [Qwen+ 2024](https://arxiv.org/abs/2412.15115) [Yang+ 2025](https://arxiv.org/abs/2505.09388)
- Moonshot's Kimi models [Kimi Team 2025](https://arxiv.org/pdf/2501.12599.pdf) [Kimi Team 2026](https://arxiv.org/abs/2602.02276)
- Z.ai's GLM models [GLM-4.5 Team 2025](https://arxiv.org/abs/2508.06471) [GLM-5-Team 2026](https://arxiv.org/abs/2602.15763)
- Minimax's models [MiniMax M2.5](https://www.minimax.io/news/minimax-m25)
- Xiaomi's MIMO models [Xiaomi MIMO v2](https://mimo.xiaomi.com/mimo-v2-pro)

These models are approaching closed models (GPT, Claude, Gemini, etc.).

Open-source models (weights + paper + code + data):

- AI2's Olmo models [Groeneveld+ 2024](https://arxiv.org/pdf/2402.00838.pdf) [Team OLMo 2024](https://arxiv.org/abs/2501.00656) [Team Olmo 2025](https://arxiv.org/abs/2512.13961)
- NVIDIA's Nemotron models [Parmar+ 2024](https://arxiv.org/pdf/2402.16819.pdf) [NVIDIA+ 2025](https://arxiv.org/abs/2512.20856)
- Marin's models (open development) [Marin 8B retro](https://marin.readthedocs.io/en/latest/reports/marin-8b-retro/) [Marin 32B retro](https://marin.readthedocs.io/en/latest/reports/marin-32b-retro/)

Openness is important for trust and innovation [Kapoor+ 2024](https://arxiv.org/abs/2403.07918)

Ideas from open models enable us to teach CS336.

What is a language model?

- 2018 (BERT): something you fine-tune
- 2020 (GPT-3): something you prompt
- 2022 (ChatGPT): something you talk to [example conversation](https://huggingface.co/datasets/HuggingFaceTB/smoltalk/viewer/all/train?row=72&conversation-viewer=72)
- 2026 (agents): something that acts autonomously [example trace](https://huggingface.co/datasets/nebius/SWE-rebench-openhands-trajectories/viewer/default/train?conversation-viewer=1)

The fundamentals are the same (attention, kernels, optimization).

The specs are different (longer context, inference efficiency matters even more).

This is an *executable lecture*, a program whose execution delivers the content of a lecture.

Executable lectures make it possible to:

- view and run code (since everything is code!),

| Variable | Value |
| --- | --- |
| `total` | 0 |

| Variable | Value |
| --- | --- |
| `total` | 6 |
| `x` | 3 |

- see the hierarchical structure of the lecture

All information online: [course website](https://stanford-cs336.github.io/spring2026/)

This is a 5-unit class.

Comment from Spring 2024 course evaluation:

> *The entire assignment was approximately the same amount of work as all 5 assignments from CS 224n plus the final project. And that's just the first homework assignment.*

(cs336-01-topic-014)=
## Why you should take this course

- You have an obsessive need to understand how things work.
- You want to build up your research engineering muscles.

(cs336-01-topic-015)=
## Why you should not take this course

- You actually want to get research done this quarter. (Talk to your advisor.)
- You are interested in learning about the hottest new techniques in AI (e.g., multimodality, RAG, etc.). (You should take a seminar class for that.)
- You want to get good results on your own application domain. (You should just prompt or fine-tune an existing model.)

(cs336-01-topic-016)=
## How you can follow along at home

- All lecture materials and assignments will be posted online, so feel free to follow on your own.
- Lectures are recorded via [CGOE](https://cgoe.stanford.edu/).

(cs336-01-topic-017)=
## Assignments

- 5 assignments (basics, systems, scaling laws, data, alignment).
- No scaffolding code, but we provide unit tests and adapter interfaces to help you check correctness.
- Implement locally to test for correctness, then run on cluster for benchmarking (accuracy and speed).
- Leaderboard for some assignments (minimize perplexity given training budget).

(cs336-01-topic-018)=
## AI policy

- Coding agents can solve all the assignments, but you won't learn anything.
- AI can be tremendously useful for answering questions and tutoring.
- You must use our provided AGENTS.md file, which asks the AI to be pedagogically-minded.
- Please read our [AI policy guide](https://docs.google.com/document/d/1SZAlExB1qAc9izHt54gwunNpjKE6wXb8Y7yA_e-baK8/edit?tab=t.0).

(cs336-01-topic-019)=
## Compute

- Thanks to [Modal](https://modal.com/) for providing compute. 🙏
- Please read the [guide](https://docs.google.com/document/d/1cHE0iKVyXLJ3XpIs2XuXTmZ-HMmPk2hIPeCvy-AydMg/edit?tab=t.otis27tacaef) on how to access and use the compute.

Goal: be able to train a basic language model

Components: tokenization, model architecture, training

(cs336-01-topic-020)=
## Tokenization

What are the atoms that the model operates on?

Formally: a tokenizer converts between raw inputs (bytes) and sequences of integers (tokens)

![tokenized-example.png](../source/images/tokenized-example.png)

Popular tokenizer: **Byte-Pair Encoding** (BPE) [Sennrich+ 2015](https://arxiv.org/abs/1508.07909)

Intuition: break input into frequently-occuring chunks

Efficiency lens

- Reduce context length (1000 bytes → ~250 tokens)
- Adaptive computation (more modeling capacity on interesting parts of input)

The dream: tokenizer-free model architectures, which operate directly on bytes [Xue+ 2021](https://arxiv.org/abs/2105.13626) [Yu+ 2023](https://arxiv.org/pdf/2305.07185.pdf) [Pagnoni+ 2024](https://arxiv.org/abs/2412.09871) [Deiseroth+ 2024](https://arxiv.org/abs/2406.19223) [Hwang+ 2025](https://arxiv.org/abs/2507.07955)

These are promising, but have not yet been scaled up to the frontier.

(cs336-01-topic-021)=
## Model architecture

Starting point: original Transformer [Vaswani+ 2017](https://arxiv.org/pdf/1706.03762.pdf)

![transformer-architecture.png](../source/images/transformer-architecture.png)

Refinements:

- Activation functions: ReLU, SwiGLU [Shazeer 2020](https://arxiv.org/pdf/2002.05202.pdf)
- Positional encodings: sinusoidal, RoPE [Su+ 2021](https://arxiv.org/pdf/2104.09864.pdf)
- Normalization: LayerNorm, RMSNorm, QK norm, pre-norm versus post-norm [Ba+ 2016](https://arxiv.org/pdf/1607.06450.pdf) [Zhang+ 2019](https://arxiv.org/abs/1910.07467) [Dehghani+ 2023](https://arxiv.org/abs/2302.05442) [Xiong+ 2020](https://arxiv.org/pdf/2002.04745.pdf)
- Attention: full, sparse/local attention, group-query attention (GQA), multi-head latent attention (MLA) [Child+ 2019](https://arxiv.org/pdf/1904.10509.pdf) [Ainslie+ 2023](https://arxiv.org/pdf/2305.13245.pdf) [DeepSeek-AI+ 2024](https://arxiv.org/abs/2405.04434)
- Recurrence/state-space models/linear attention: Mamba, Gated DeltaNet [Katharopoulos+ 2020](https://arxiv.org/abs/2006.16236) [Dao+ 2024](https://arxiv.org/abs/2405.21060) [Yang+ 2024](https://arxiv.org/abs/2412.06464) [Lahoti+ 2026](https://arxiv.org/abs/2603.15569)
- MLP: dense, mixture of experts [Shazeer+ 2017](https://arxiv.org/pdf/1701.06538.pdf) [Fedus+ 2021](https://arxiv.org/abs/2101.03961)
- Shape (hidden dimension, depth, number of heads, number of experts)

(cs336-01-topic-022)=
## Training

How do you set the parameters of the model?

- Loss function (e.g., multi-token prediction) [Gloeckle+ 2024](https://arxiv.org/abs/2404.19737) [DeepSeek-AI+ 2024](https://arxiv.org/pdf/2412.19437.pdf)
- Optimizer (e.g., AdamW, SOAP, Muon) [Kingma+ 2014](https://arxiv.org/pdf/1412.6980.pdf) [Loshchilov+ 2017](https://arxiv.org/pdf/1711.05101.pdf) [Vyas+ 2024](https://arxiv.org/abs/2409.11321) [Keller 2024](https://kellerjordan.github.io/posts/muon/)
- Initialization scale (e.g., Xavier init, muP) [Glorot+ 2010](https://proceedings.mlr.press/v9/glorot10a/glorot10a.pdf) [Yang+ 2022](https://arxiv.org/abs/2203.03466)
- Learning rate schedule (e.g., cosine, WSD) [Loshchilov+ 2016](https://arxiv.org/pdf/1608.03983.pdf) [Hu+ 2024](https://arxiv.org/pdf/2404.06395.pdf)
- Regularization (e.g., dropout, weight decay)
- Batch size (e.g., critical batch size) [McCandlish+ 2018](https://arxiv.org/pdf/1812.06162.pdf)
- MoE specific: load balancing (e.g., aux-free) [Wang+ 2024](https://arxiv.org/abs/2408.15664) [DeepSeek-AI+ 2024](https://arxiv.org/pdf/2412.19437.pdf)

(cs336-01-topic-023)=
## Assignment 1 (basics)

[GitHub](https://github.com/stanford-cs336/assignment1-basics) [PDF](https://github.com/stanford-cs336/assignment1-basics/blob/main/cs336_spring2026_assignment1_basics.pdf)

- Implement BPE tokenizer
- Implement Transformer, cross-entropy loss, AdamW optimizer, training loop
- Do resource accounting
- Train on TinyStories and OpenWebText
- Leaderboard: minimize OpenWebText perplexity given 45 minutes on a B200 [last year's leaderboard](https://github.com/stanford-cs336/spring2025-assignment1-basics-leaderboard)

High-level principle: everything is about balancing the following:

- Expressivity (can represent complex dependencies in the data)
- Stability (keep parameter and gradient norms in goldilocks zone)
- Efficiency (runs fast on hardware, both training and inference)

Goal: squeeze the most out of the hardware (GPU or TPU)

Components: kernels, parallelism, inference

(cs336-01-topic-024)=
## Basics

- Resource accounting: memory and compute characteristics of a model

| Variable | Value |
| --- | --- |
| `total_flops` | 4.2e+23 |

![compute-memory.png](../source/images/compute-memory.png)

- Model parameters must be moved from memory (HBM) to the compute (SMs)
- Example: B200 can perform 2.25 PFLOP/sec (bf16) with 8TB/sec memory bandwidth
- Roofline analysis: understand whether we're compute-bound or memory-bound
- Benchmarking and profiling (nsight): see what happens in practice

[DGX B200](https://docs.nvidia.com/dgx/dgxb200-user-guide/introduction-to-dgxb200.html):

![image-d41d89a3b5f61b2597e9a608032479f0-https_docs_nvidia_com_dgx_dgxb200-user-guide__images_dgx-b200-system-topology_png](../assets/74c6a871d16f2484924bd789.png)

(cs336-01-topic-025)=
## Kernels

- Kernel is a function that runs on GPU
- When using PyTorch, each primitive operation launches a standard kernel
- Can write custom kernels to make GPUs go brrr
- Principle: organize computation to minimize data movement
- Naive: read HBM; compute A; write HBM; read HBM; compute B; write HBM
- Fused: read HBM; compute A and B; write HBM
- Strategies: operator fusion (matmul + activation), tiling (FlashAttention)
- Warp divergence, memory coalescing, bank conflicts, occupancy, bulk-async memory transfers
- Write kernels in CUDA/**Triton**/CUTLASS/ThunderKittens

(cs336-01-topic-026)=
## Parallelism

- What if we have 1024 GPUs?
- Data movement between GPUs is even slower, but same 'minimize data movement' principle holds
- Use classic collective operations (e.g., gather, reduce, all-reduce)
- Shard memory (parameters, activations, gradients, optimizer states) across GPUs
- How to split computation: {data,tensor,pipeline,sequence,expert} parallelism

(cs336-01-topic-027)=
## Inference

Goal: generate tokens given a prompt (needed to actually use models!)

Inference is also needed for reinforcement learning, test-time compute, evaluation

Two phases: prefill and decode

![prefill-decode.png](../source/images/prefill-decode.png)

- Prefill (similar to training): tokens are given, can process all at once (compute-bound)
- Decode: need to generate one token at a time (memory-bound)

Methods to speed up decoding:

- Use cheaper model (via model pruning, quantization, distillation)
- Speculative decoding: use a cheaper "draft" model to generate multiple tokens, then use the full model to score in parallel (exact decoding!)
- Systems optimizations: fused kernels, continuous batching

(cs336-01-topic-028)=
## Assignment 2 (systems)

[GitHub](https://github.com/stanford-cs336/assignment2-systems) [PDF from Spring 2025](https://github.com/stanford-cs336/assignment2-systems/blob/spring2025/cs336_spring2025_assignment2_systems.pdf)

- Implement a fused RMSNorm kernel in Triton
- Implement distributed data parallel training
- Implement optimizer state sharding
- Benchmark and profile the implementations

Recommended book: [How to Scale Your Model](https://jax-ml.github.io/scaling-book/)

- Nicely lays out how to approach systems for LLMs conceptually
- From Google, so it foregrounds TPUs, but high-level concepts are similar

Setting: if you had 1e25 FLOPs of compute, what hyperparameters would you use to train a good model?

Too expensive to do hyperparameter tuning at full scale!

Key conceptual shift: instead of a single scale, think of a **scaling recipe** (FLOPs → hyperparameters)

For a scaling recipe:

- Run experiments to compute the loss at various smaller scales (e.g., up to 1e24 FLOPs)
- Fit a scaling law to predict the loss of the scaling recipe at the target scale (e.g., 1e25 FLOPs)

Now you can:

1. Optimize the scaling recipe targeting a larger scale using smaller scale experiments
2. Predict the loss at the target scale before actually running the experiment!

Scaling laws don't happen automatically, they require careful construction of a scaling recipe.

Parameterize the model in a way to get **hyperparameter transfer** [Yang+ 2022](https://arxiv.org/abs/2203.03466)

Predictability is at least as important as optimality!

Question: given a FLOPs budget (C = 6 N D), use a bigger model (N) or train on more tokens (D)?

Classic compute-optimal scaling laws: [Kaplan+ 2020](https://arxiv.org/pdf/2001.08361.pdf) [Hoffmann+ 2022](https://arxiv.org/pdf/2203.15556.pdf)

- ISOFLOP curves: for multiple small FLOPs budgets, find optimal N
- Then fit a scaling law to extrapolate to large FLOPs budgets

![chinchilla-isoflop.png](../source/images/chinchilla-isoflop.png)

TL;DR: D = 20 N is roughly optimal (e.g., 70B parameter model should be trained on ~1.4T tokens)

Caveat: this doesn't take into account inference costs (want a smaller model)

Live example from Marin [post](https://x.com/percyliang/status/2034367256277533100)

![image-49c56e974c417eacabafcd41ab0a90f0-https_pbs_twimg_com_media_HDuErvvbsAAQ5Yt_format_jpg_name_4096x4096](../assets/a58472618b0a090e3ab5bbf6.jpg)

Should be done training this week, should see how well we match the preregistered loss!

(cs336-01-topic-029)=
## Assignment 3 (scaling laws)

[GitHub](https://github.com/stanford-cs336/assignment3-scaling) [PDF from Spring 2025](https://github.com/stanford-cs336/assignment3-scaling/blob/master/cs336_spring2025_assignment3_scaling.pdf)

- We define a training API (hyperparameters → loss) based on previous runs
- Submit "training jobs" (under a FLOPs budget) and gather data points
- Fit scaling laws to the data points
- Submit extrapolated hyperparameters and loss predictions
- Leaderboard: minimize loss given FLOPs budget

Question: What capabilities do we want the model to have?

Multilingual?  Good at conversation?  Agentic coding capabilities?

(cs336-01-topic-030)=
## Evaluation

What is the purpose of evaluation?

1. Internal: guide model development (smoothness across scales, relative performance matters)
2. External: measure absolute quality of a real use case (ecological validity matters)

Examples of evaluations:

1. Perplexity: ideally run on private documents not on Internet (avoid contamination)
2. Advanced use cases: GPQA, HLE, SWE-Bench, Terminal-Bench

LMs are general purpose, require a diverse set of evaluations!

(cs336-01-topic-031)=
## Data curation

- Data does not just fall from the sky.
- Sources: webpages crawled from the Internet, books, arXiv papers, GitHub code, etc.

![image-b3aebfa83a900cd491e70acf27806db3-https_ar5iv_labs_arxiv_org_html_2101_00027_assets_pile_chart2_png](../assets/19aa95878c163804f2825704.png)

- Appeal to fair use to train on copyright data? [Henderson+ 2023](https://arxiv.org/pdf/2303.15715.pdf)
- Might have to license data (e.g., Google with Reddit data) [article](https://www.reuters.com/technology/reddit-ai-content-licensing-deal-with-google-sources-say-2024-02-22/)
- Raw data is HTML, PDF, directories (not text), requires processing

(cs336-01-topic-032)=
## Data processing

- Transformation: convert HTML/PDF to text (extract main content)
- Filtering: keep high quality data, remove harmful content (via classifiers)
- Deduplication: save compute, avoid memorization; use Bloom filters or MinHash
- Data mixing: how much to upweight/downweight each source? [Liu+ 2024](https://arxiv.org/abs/2407.01492) [Chen+ 2026](https://arxiv.org/abs/2602.12237)
- Rewriting / synthetic data: use LM to augment real data, more similar to downstream tasks [Maini+ 2024](https://arxiv.org/abs/2401.16380)

Types of data:

- Pretraining data: large and diverse
- Mid-training data: high quality, including long-context
- Post-training data: supervised fine-tuning (conversations, agentic traces with tool calling)

(cs336-01-topic-033)=
## Assignment 4 (data)

[GitHub](https://github.com/stanford-cs336/assignment4-data) [PDF from Spring 2025](https://github.com/stanford-cs336/assignment4-data/blob/spring2025/cs336_spring2025_assignment4_data.pdf)

- Convert Common Crawl HTML to text
- Train classifiers to filter for quality and harmful content
- Deduplication using MinHash
- Leaderboard: minimize perplexity given token budget

So far, we have trained a model on full supervision (predict the next token).

Now that the model should be reasonable, we can improve it further from **weak supervision**.

Why weak supervision?  When it is easier to critique than to generate.

Basic template:

1. Generate responses from the model.
2. Score responses with a {human, verifier, LM judge}.
3. Update the model to prefer better responses.

Algorithms:

- Proximal Policy Optimization (PPO) from reinforcement learning [Schulman+ 2017](https://arxiv.org/pdf/1707.06347.pdf) [Ouyang+ 2022](https://arxiv.org/pdf/2203.02155.pdf)
- Direct Policy Optimization (DPO): for preference data, simpler [Rafailov+ 2023](https://arxiv.org/pdf/2305.18290.pdf)
- Group Relative Preference Optimization (GRPO): remove value function [Shao+ 2024](https://arxiv.org/pdf/2402.03300.pdf)

Challenges:

- RL algorithms are unstable and hard to tune
- At scale, this requires a lot of new infrastructure (inference with async rollouts)
- Constantly trading off systems efficiency and on-policyness

(cs336-01-topic-034)=
## Assignment 5 (alignment)

[GitHub](https://github.com/stanford-cs336/assignment5-alignment) [PDF from Spring 2025](https://github.com/stanford-cs336/assignment5-alignment/blob/spring2025/cs336_spring2025_assignment5_alignment.pdf)

- Implement Direct Preference Optimization (DPO)
- Implement Group Relative Preference Optimization (GRPO)

Remember it's all about **efficiency**:

- Resources: data + hardware (compute, memory, communication bandwidth)
- How do you train the best model given a fixed set of resources?

Today, we are compute-constrained, so design decisions will reflect squeezing the most out of given hardware.

- Systems: clearly about efficiency
- Tokenization: working with raw bytes is elegant, but compute-inefficient with today's model architectures
- Model architecture: many changes motivated by reducing memory or FLOPs (e.g., sharing KV caches, sliding window attention)
- Data filtering: avoid wasting precious compute updating on bad / irrelevant data
- Scaling laws: use less compute on smaller models to do hyperparameter tuning

Tomorrow, we will become data-constrained...

This unit was inspired by Andrej Karpathy's video on tokenization; check it out! [video](https://www.youtube.com/watch?v=zduSFxRajkE)

Raw text is generally represented as Unicode strings.

A language model places a probability distribution over sequences of tokens (usually represented by integer indices).

So we need a procedure that *encodes* strings into tokens.

We also need a procedure that *decodes* tokens back into strings.

A [Tokenizer](https://github.com/stanford-cs336/lectures/blob/de53a9f979a6ee35f7d13a5e1aadee5ea1afc58e/lecture_01.py#L256) is a class that implements the encode and decode methods.

To get a feel for how tokenizers work, play with this [interactive site](https://tiktokenizer.vercel.app/?encoder=gpt2)

(cs336-01-topic-035)=
## Observations

- A word and its preceding space are part of the same token (e.g., " world").
- A word at the beginning and in the middle are represented differently (e.g., "hello hello").
- Numbers are tokenized into every few digits.

Here's the GPT-5 tokenizer from OpenAI (tiktoken) in action.

| Variable | Value |
| --- | --- |
| `string` | Hello, 🌍! 你好! |

Check that encode() and decode() roundtrip:

**`indices`**

```python
[13225, 11, 130321, 235, 0, 220, 177519, 0]
```

| Variable | Value |
| --- | --- |
| `reconstructed_string` | Hello, 🌍! 你好! |

Compression ratio: number of bytes per token

| Variable | Value |
| --- | --- |
| `num_bytes` | 20 |

| Variable | Value |
| --- | --- |
| `num_tokens` | 8 |

| Variable | Value |
| --- | --- |
| `compression_ratio` | 2.5 |

The larger the compression ratio, the shorter the sequence (good since attention is quadratic in sequence length).

One could increase compression ratio by increasing **vocabulary size** (number of possible token values increases), leading to sparsity.

| Variable | Value |
| --- | --- |
| `vocabulary_size` | 200019 |

Let's take a look at the actual vocabulary: [vocab](https://github.com/stanford-cs336/lectures/blob/main/var/gpt5_tokenizer_vocab.txt)

A Unicode string is a sequence of Unicode characters.

Each character can be converted into a code point (integer) via `ord`.

It can be converted back via `chr`.

Now let's build a `Tokenizer` and make sure it round-trips:

**`indices`**

```python
[72, 101, 108, 108, 111, 44, 32, 127757, 33, 32, 20320, 22909, 33]
```

There are approximately 150K Unicode characters. [Wikipedia](https://en.wikipedia.org/wiki/List_of_Unicode_characters)

| Variable | Value |
| --- | --- |
| `vocabulary_size` | 127758 |

Problem 1: this is a very large vocabulary.

Problem 2: many characters are quite rare (e.g., 🌍), which is inefficient use of the vocabulary.

| Variable | Value |
| --- | --- |
| `compression_ratio` | 1.5384615384615385 |

This tokenizer is the worst of both worlds (large vocabulary, low compression ratio).

Unicode strings can be represented as a sequence of bytes, which can be represented by integers between 0 and 255.

The most common Unicode encoding is [UTF-8](https://en.wikipedia.org/wiki/UTF-8)

Some Unicode characters are represented by one byte:

Others take multiple bytes:

Now let's build a `Tokenizer` and make sure it round-trips:

**`indices`**

```python
[72, 101, 108, 108, 111, 44, 32, 240, 159, 140, 141, 33, 32, 228, 189, 160, 229, 165,
 189, 33]
```

The vocabulary is nice and small: a byte can represent 256 values.

| Variable | Value |
| --- | --- |
| `vocabulary_size` | 256 |

What about the compression rate?

| Variable | Value |
| --- | --- |
| `compression_ratio` | 1.0 |

The compression ratio is terrible, which means the sequences will be too long.

Given that the context length of a Transformer is limited (since attention is quadratic), this is not looking great...

Another approach (closer to what was done classically in NLP) is to split strings into words.

**`chunks`**

```python
['I', "'", 'll', ' ', 'say', ' ', 'supercalifragilisticexpialidocious', '!']
```

This regular expression keeps all alphanumeric characters together (words).

To turn this into a `Tokenizer`, we need to map these chunks into integers.

Then, we can build a mapping from each chunk into an integer.

What's good: each token is meaningful (since humans invented words).

| Variable | Value |
| --- | --- |
| `compression_ratio` | 5.5 |

Compression ratio is good, but vocabulary size can be huge.

Moreover:

- Many words are rare and the model won't learn much about them.
- This doesn't obviously provide a fixed vocabulary size.
- New words we haven't seen during training get a special UNK token, which is ugly and can mess up perplexity calculations.

(cs336-01-topic-036)=
## Byte Pair Encoding (BPE)

The BPE algorithm was introduced by Philip Gage in 1994 for data compression. [article](http://www.pennelynn.com/Documents/CUJ/HTML/94HTML/19940045.HTM)

It was adapted to NLP for neural machine translation. [Sennrich+ 2015](https://arxiv.org/abs/1508.07909)

(Previously, papers had been using word-based tokenization.)

BPE was then used by GPT-2. [Radford+ 2019](https://cdn.openai.com/better-language-models/language_models_are_unsupervised_multitask_learners.pdf)

Basic idea: *train* the tokenizer on raw text to construct a vocabulary tailored to the data.

Intuition: common sequences of bytes are represented by a single token, rare sequences are represented by many tokens.

Sketch: start with each byte as a token, and successively merge the most common pair of adjacent tokens.

(cs336-01-topic-037)=
## Training the tokenizer

| Variable | Value |
| --- | --- |
| `string` | the cat in the hat |

| Variable | Value |
| --- | --- |
| `num_merges` | 3 |

Start with the list of bytes of `string`.

**`indices`**

```python
[116, 104, 101, 32, 99, 97, 116, 32, 105, 110, 32, 116, 104, 101, 32, 104, 97, 116]
```

| Variable | Value |
| --- | --- |
| `new_index` | 257 |

**`indices`**

```python
[257, 32, 99, 97, 116, 32, 105, 110, 32, 257, 32, 104, 97, 116]
```


**`counts`**

```python
{'(257, 32)': 2,
 '(32, 99)': 1,
 '(99, 97)': 1,
 '(97, 116)': 2,
 '(116, 32)': 1,
 '(32, 105)': 1,
 '(105, 110)': 1,
 '(110, 32)': 1,
 '(32, 257)': 1,
 '(32, 104)': 1,
 '(104, 97)': 1}
```


**`pair`**

```python
[256, 101]
```


**`merges`**

```python
{'(116, 104)': 256, '(256, 101)': 257}
```


**`vocab`**

```python
{'0': "b'\\x00'",
 '1': "b'\\x01'",
 '2': "b'\\x02'",
 '3': "b'\\x03'",
 '4': "b'\\x04'",
 '5': "b'\\x05'",
 '6': "b'\\x06'",
 '7': "b'\\x07'",
 '8': "b'\\x08'",
 '9': "b'\\t'",
 '10': "b'\\n'",
 '11': "b'\\x0b'",
 '12': "b'\\x0c'",
 '13': "b'\\r'",
 '14': "b'\\x0e'",
 '15': "b'\\x0f'",
 '16': "b'\\x10'",
 '17': "b'\\x11'",
 '18': "b'\\x12'",
 '19': "b'\\x13'",
 '20': "b'\\x14'",
 '21': "b'\\x15'",
 '22': "b'\\x16'",
 '23': "b'\\x17'",
 '24': "b'\\x18'",
 '25': "b'\\x19'",
 '26': "b'\\x1a'",
 '27': "b'\\x1b'",
 '28': "b'\\x1c'",
 '29': "b'\\x1d'",
 '30': "b'\\x1e'",
 '31': "b'\\x1f'",
 '32': "b' '",
 '33': "b'!'",
 '34': 'b\'"\'',
 '35': "b'#'",
 '36': "b'$'",
 '37': "b'%'",
 '38': "b'&'",
 '39': 'b"\'"',
 '40': "b'('",
 '41': "b')'",
 '42': "b'*'",
 '43': "b'+'",
 '44': "b','",
 '45': "b'-'",
 '46': "b'.'",
 '47': "b'/'",
 '48': "b'0'",
 '49': "b'1'",
 '50': "b'2'",
 '51': "b'3'",
 '52': "b'4'",
 '53': "b'5'",
 '54': "b'6'",
 '55': "b'7'",
 '56': "b'8'",
 '57': "b'9'",
 '58': "b':'",
 '59': "b';'",
 '60': "b'<'",
 '61': "b'='",
 '62': "b'>'",
 '63': "b'?'",
 '64': "b'@'",
 '65': "b'A'",
 '66': "b'B'",
 '67': "b'C'",
 '68': "b'D'",
 '69': "b'E'",
 '70': "b'F'",
 '71': "b'G'",
 '72': "b'H'",
 '73': "b'I'",
 '74': "b'J'",
 '75': "b'K'",
 '76': "b'L'",
 '77': "b'M'",
 '78': "b'N'",
 '79': "b'O'",
 '80': "b'P'",
 '81': "b'Q'",
 '82': "b'R'",
 '83': "b'S'",
 '84': "b'T'",
 '85': "b'U'",
 '86': "b'V'",
 '87': "b'W'",
 '88': "b'X'",
 '89': "b'Y'",
 '90': "b'Z'",
 '91': "b'['",
 '92': "b'\\\\'",
 '93': "b']'",
 '94': "b'^'",
 '95': "b'_'",
 '96': "b'`'",
 '97': "b'a'",
 '98': "b'b'",
 '99': "b'c'",
 '100': "b'd'",
 '101': "b'e'",
 '102': "b'f'",
 '103': "b'g'",
 '104': "b'h'",
 '105': "b'i'",
 '106': "b'j'",
 '107': "b'k'",
 '108': "b'l'",
 '109': "b'm'",
 '110': "b'n'",
 '111': "b'o'",
 '112': "b'p'",
 '113': "b'q'",
 '114': "b'r'",
 '115': "b's'",
 '116': "b't'",
 '117': "b'u'",
 '118': "b'v'",
 '119': "b'w'",
 '120': "b'x'",
 '121': "b'y'",
 '122': "b'z'",
 '123': "b'{'",
 '124': "b'|'",
 '125': "b'}'",
 '126': "b'~'",
 '127': "b'\\x7f'",
 '128': "b'\\x80'",
 '129': "b'\\x81'",
 '130': "b'\\x82'",
 '131': "b'\\x83'",
 '132': "b'\\x84'",
 '133': "b'\\x85'",
 '134': "b'\\x86'",
 '135': "b'\\x87'",
 '136': "b'\\x88'",
 '137': "b'\\x89'",
 '138': "b'\\x8a'",
 '139': "b'\\x8b'",
 '140': "b'\\x8c'",
 '141': "b'\\x8d'",
 '142': "b'\\x8e'",
 '143': "b'\\x8f'",
 '144': "b'\\x90'",
 '145': "b'\\x91'",
 '146': "b'\\x92'",
 '147': "b'\\x93'",
 '148': "b'\\x94'",
 '149': "b'\\x95'",
 '150': "b'\\x96'",
 '151': "b'\\x97'",
 '152': "b'\\x98'",
 '153': "b'\\x99'",
 '154': "b'\\x9a'",
 '155': "b'\\x9b'",
 '156': "b'\\x9c'",
 '157': "b'\\x9d'",
 '158': "b'\\x9e'",
 '159': "b'\\x9f'",
 '160': "b'\\xa0'",
 '161': "b'\\xa1'",
 '162': "b'\\xa2'",
 '163': "b'\\xa3'",
 '164': "b'\\xa4'",
 '165': "b'\\xa5'",
 '166': "b'\\xa6'",
 '167': "b'\\xa7'",
 '168': "b'\\xa8'",
 '169': "b'\\xa9'",
 '170': "b'\\xaa'",
 '171': "b'\\xab'",
 '172': "b'\\xac'",
 '173': "b'\\xad'",
 '174': "b'\\xae'",
 '175': "b'\\xaf'",
 '176': "b'\\xb0'",
 '177': "b'\\xb1'",
 '178': "b'\\xb2'",
 '179': "b'\\xb3'",
 '180': "b'\\xb4'",
 '181': "b'\\xb5'",
 '182': "b'\\xb6'",
 '183': "b'\\xb7'",
 '184': "b'\\xb8'",
 '185': "b'\\xb9'",
 '186': "b'\\xba'",
 '187': "b'\\xbb'",
 '188': "b'\\xbc'",
 '189': "b'\\xbd'",
 '190': "b'\\xbe'",
 '191': "b'\\xbf'",
 '192': "b'\\xc0'",
 '193': "b'\\xc1'",
 '194': "b'\\xc2'",
 '195': "b'\\xc3'",
 '196': "b'\\xc4'",
 '197': "b'\\xc5'",
 '198': "b'\\xc6'",
 '199': "b'\\xc7'",
 '200': "b'\\xc8'",
 '201': "b'\\xc9'",
 '202': "b'\\xca'",
 '203': "b'\\xcb'",
 '204': "b'\\xcc'",
 '205': "b'\\xcd'",
 '206': "b'\\xce'",
 '207': "b'\\xcf'",
 '208': "b'\\xd0'",
 '209': "b'\\xd1'",
 '210': "b'\\xd2'",
 '211': "b'\\xd3'",
 '212': "b'\\xd4'",
 '213': "b'\\xd5'",
 '214': "b'\\xd6'",
 '215': "b'\\xd7'",
 '216': "b'\\xd8'",
 '217': "b'\\xd9'",
 '218': "b'\\xda'",
 '219': "b'\\xdb'",
 '220': "b'\\xdc'",
 '221': "b'\\xdd'",
 '222': "b'\\xde'",
 '223': "b'\\xdf'",
 '224': "b'\\xe0'",
 '225': "b'\\xe1'",
 '226': "b'\\xe2'",
 '227': "b'\\xe3'",
 '228': "b'\\xe4'",
 '229': "b'\\xe5'",
 '230': "b'\\xe6'",
 '231': "b'\\xe7'",
 '232': "b'\\xe8'",
 '233': "b'\\xe9'",
 '234': "b'\\xea'",
 '235': "b'\\xeb'",
 '236': "b'\\xec'",
 '237': "b'\\xed'",
 '238': "b'\\xee'",
 '239': "b'\\xef'",
 '240': "b'\\xf0'",
 '241': "b'\\xf1'",
 '242': "b'\\xf2'",
 '243': "b'\\xf3'",
 '244': "b'\\xf4'",
 '245': "b'\\xf5'",
 '246': "b'\\xf6'",
 '247': "b'\\xf7'",
 '248': "b'\\xf8'",
 '249': "b'\\xf9'",
 '250': "b'\\xfa'",
 '251': "b'\\xfb'",
 '252': "b'\\xfc'",
 '253': "b'\\xfd'",
 '254': "b'\\xfe'",
 '255': "b'\\xff'",
 '256': "b'th'",
 '257': "b'the'"}
```

**`pair`**

```python
[257, 32]
```

| Variable | Value |
| --- | --- |
| `new_index` | 258 |

**`merges`**

```python
{'(116, 104)': 256, '(256, 101)': 257, '(257, 32)': 258}
```

**`vocab`**

```python
{'0': "b'\\x00'",
 '1': "b'\\x01'",
 '2': "b'\\x02'",
 '3': "b'\\x03'",
 '4': "b'\\x04'",
 '5': "b'\\x05'",
 '6': "b'\\x06'",
 '7': "b'\\x07'",
 '8': "b'\\x08'",
 '9': "b'\\t'",
 '10': "b'\\n'",
 '11': "b'\\x0b'",
 '12': "b'\\x0c'",
 '13': "b'\\r'",
 '14': "b'\\x0e'",
 '15': "b'\\x0f'",
 '16': "b'\\x10'",
 '17': "b'\\x11'",
 '18': "b'\\x12'",
 '19': "b'\\x13'",
 '20': "b'\\x14'",
 '21': "b'\\x15'",
 '22': "b'\\x16'",
 '23': "b'\\x17'",
 '24': "b'\\x18'",
 '25': "b'\\x19'",
 '26': "b'\\x1a'",
 '27': "b'\\x1b'",
 '28': "b'\\x1c'",
 '29': "b'\\x1d'",
 '30': "b'\\x1e'",
 '31': "b'\\x1f'",
 '32': "b' '",
 '33': "b'!'",
 '34': 'b\'"\'',
 '35': "b'#'",
 '36': "b'$'",
 '37': "b'%'",
 '38': "b'&'",
 '39': 'b"\'"',
 '40': "b'('",
 '41': "b')'",
 '42': "b'*'",
 '43': "b'+'",
 '44': "b','",
 '45': "b'-'",
 '46': "b'.'",
 '47': "b'/'",
 '48': "b'0'",
 '49': "b'1'",
 '50': "b'2'",
 '51': "b'3'",
 '52': "b'4'",
 '53': "b'5'",
 '54': "b'6'",
 '55': "b'7'",
 '56': "b'8'",
 '57': "b'9'",
 '58': "b':'",
 '59': "b';'",
 '60': "b'<'",
 '61': "b'='",
 '62': "b'>'",
 '63': "b'?'",
 '64': "b'@'",
 '65': "b'A'",
 '66': "b'B'",
 '67': "b'C'",
 '68': "b'D'",
 '69': "b'E'",
 '70': "b'F'",
 '71': "b'G'",
 '72': "b'H'",
 '73': "b'I'",
 '74': "b'J'",
 '75': "b'K'",
 '76': "b'L'",
 '77': "b'M'",
 '78': "b'N'",
 '79': "b'O'",
 '80': "b'P'",
 '81': "b'Q'",
 '82': "b'R'",
 '83': "b'S'",
 '84': "b'T'",
 '85': "b'U'",
 '86': "b'V'",
 '87': "b'W'",
 '88': "b'X'",
 '89': "b'Y'",
 '90': "b'Z'",
 '91': "b'['",
 '92': "b'\\\\'",
 '93': "b']'",
 '94': "b'^'",
 '95': "b'_'",
 '96': "b'`'",
 '97': "b'a'",
 '98': "b'b'",
 '99': "b'c'",
 '100': "b'd'",
 '101': "b'e'",
 '102': "b'f'",
 '103': "b'g'",
 '104': "b'h'",
 '105': "b'i'",
 '106': "b'j'",
 '107': "b'k'",
 '108': "b'l'",
 '109': "b'm'",
 '110': "b'n'",
 '111': "b'o'",
 '112': "b'p'",
 '113': "b'q'",
 '114': "b'r'",
 '115': "b's'",
 '116': "b't'",
 '117': "b'u'",
 '118': "b'v'",
 '119': "b'w'",
 '120': "b'x'",
 '121': "b'y'",
 '122': "b'z'",
 '123': "b'{'",
 '124': "b'|'",
 '125': "b'}'",
 '126': "b'~'",
 '127': "b'\\x7f'",
 '128': "b'\\x80'",
 '129': "b'\\x81'",
 '130': "b'\\x82'",
 '131': "b'\\x83'",
 '132': "b'\\x84'",
 '133': "b'\\x85'",
 '134': "b'\\x86'",
 '135': "b'\\x87'",
 '136': "b'\\x88'",
 '137': "b'\\x89'",
 '138': "b'\\x8a'",
 '139': "b'\\x8b'",
 '140': "b'\\x8c'",
 '141': "b'\\x8d'",
 '142': "b'\\x8e'",
 '143': "b'\\x8f'",
 '144': "b'\\x90'",
 '145': "b'\\x91'",
 '146': "b'\\x92'",
 '147': "b'\\x93'",
 '148': "b'\\x94'",
 '149': "b'\\x95'",
 '150': "b'\\x96'",
 '151': "b'\\x97'",
 '152': "b'\\x98'",
 '153': "b'\\x99'",
 '154': "b'\\x9a'",
 '155': "b'\\x9b'",
 '156': "b'\\x9c'",
 '157': "b'\\x9d'",
 '158': "b'\\x9e'",
 '159': "b'\\x9f'",
 '160': "b'\\xa0'",
 '161': "b'\\xa1'",
 '162': "b'\\xa2'",
 '163': "b'\\xa3'",
 '164': "b'\\xa4'",
 '165': "b'\\xa5'",
 '166': "b'\\xa6'",
 '167': "b'\\xa7'",
 '168': "b'\\xa8'",
 '169': "b'\\xa9'",
 '170': "b'\\xaa'",
 '171': "b'\\xab'",
 '172': "b'\\xac'",
 '173': "b'\\xad'",
 '174': "b'\\xae'",
 '175': "b'\\xaf'",
 '176': "b'\\xb0'",
 '177': "b'\\xb1'",
 '178': "b'\\xb2'",
 '179': "b'\\xb3'",
 '180': "b'\\xb4'",
 '181': "b'\\xb5'",
 '182': "b'\\xb6'",
 '183': "b'\\xb7'",
 '184': "b'\\xb8'",
 '185': "b'\\xb9'",
 '186': "b'\\xba'",
 '187': "b'\\xbb'",
 '188': "b'\\xbc'",
 '189': "b'\\xbd'",
 '190': "b'\\xbe'",
 '191': "b'\\xbf'",
 '192': "b'\\xc0'",
 '193': "b'\\xc1'",
 '194': "b'\\xc2'",
 '195': "b'\\xc3'",
 '196': "b'\\xc4'",
 '197': "b'\\xc5'",
 '198': "b'\\xc6'",
 '199': "b'\\xc7'",
 '200': "b'\\xc8'",
 '201': "b'\\xc9'",
 '202': "b'\\xca'",
 '203': "b'\\xcb'",
 '204': "b'\\xcc'",
 '205': "b'\\xcd'",
 '206': "b'\\xce'",
 '207': "b'\\xcf'",
 '208': "b'\\xd0'",
 '209': "b'\\xd1'",
 '210': "b'\\xd2'",
 '211': "b'\\xd3'",
 '212': "b'\\xd4'",
 '213': "b'\\xd5'",
 '214': "b'\\xd6'",
 '215': "b'\\xd7'",
 '216': "b'\\xd8'",
 '217': "b'\\xd9'",
 '218': "b'\\xda'",
 '219': "b'\\xdb'",
 '220': "b'\\xdc'",
 '221': "b'\\xdd'",
 '222': "b'\\xde'",
 '223': "b'\\xdf'",
 '224': "b'\\xe0'",
 '225': "b'\\xe1'",
 '226': "b'\\xe2'",
 '227': "b'\\xe3'",
 '228': "b'\\xe4'",
 '229': "b'\\xe5'",
 '230': "b'\\xe6'",
 '231': "b'\\xe7'",
 '232': "b'\\xe8'",
 '233': "b'\\xe9'",
 '234': "b'\\xea'",
 '235': "b'\\xeb'",
 '236': "b'\\xec'",
 '237': "b'\\xed'",
 '238': "b'\\xee'",
 '239': "b'\\xef'",
 '240': "b'\\xf0'",
 '241': "b'\\xf1'",
 '242': "b'\\xf2'",
 '243': "b'\\xf3'",
 '244': "b'\\xf4'",
 '245': "b'\\xf5'",
 '246': "b'\\xf6'",
 '247': "b'\\xf7'",
 '248': "b'\\xf8'",
 '249': "b'\\xf9'",
 '250': "b'\\xfa'",
 '251': "b'\\xfb'",
 '252': "b'\\xfc'",
 '253': "b'\\xfd'",
 '254': "b'\\xfe'",
 '255': "b'\\xff'",
 '256': "b'th'",
 '257': "b'the'",
 '258': "b'the '"}
```

**`indices`**

```python
[258, 99, 97, 116, 32, 105, 110, 32, 258, 104, 97, 116]
```

| Variable | Value |
| --- | --- |
| `num_bytes` | 18 |

| Variable | Value |
| --- | --- |
| `num_tokens` | 12 |

| Variable | Value |
| --- | --- |
| `compression_ratio` | 1.5 |

(cs336-01-topic-038)=
## Using the tokenizer

Now, given a new text, we can encode it.

| Variable | Value |
| --- | --- |
| `string` | the quick brown fox |

**`indices`**

```python
[116, 104, 101, 32, 113, 117, 105, 99, 107, 32, 98, 114, 111, 119, 110, 32, 102, 111,
 120]
```

| Variable | Value |
| --- | --- |
| `new_index` | 257 |

**`new_indices`**

```python
[]
```

| Variable | Value |
| --- | --- |
| `i` | 0 |

| Variable | Value |
| --- | --- |
| `new_index` | 258 |

**`indices`**

```python
[258, 113, 117, 105, 99, 107, 32, 98, 114, 111, 119, 110, 32, 102, 111, 120]
```

| Variable | Value |
| --- | --- |
| `reconstructed_string` | the quick brown fox |

In Assignment 1, you will go beyond this in the following ways:

- encode() currently loops over all merges. Only loop over merges that matter.
- Detect and preserve special tokens (e.g., <|endoftext|>).
- Use pre-tokenization (e.g., the GPT-2 tokenizer regex).
- Try to make the implementation as fast as possible.

Summary:

- Tokenizer: strings ↔ tokens (indices)
- Character-based, byte-based, word-based tokenization are highly suboptimal
- BPE is an effective heuristic that is data-driven
- Tokenization is a separate step, maybe one day do it end-to-end from bytes...

But whatever solution needs to satisfy:

1. Model (e.g., Transformer) should operate on chunks (abstractions) of the sequence (text, video, DNA, etc.)
2. Chunks should be variable (allocate more model capacity to interesting chunks)

Next time: resource accounting
