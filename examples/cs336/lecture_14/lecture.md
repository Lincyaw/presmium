---
title: "CS336 Lecture 14: Data II"
lang: en
plugins:
  - '@lincyaw/slidev-addon-core'
  - '@lincyaw/slidev-addon-content'
renderers:
  web: {}
  notebook: {}
---

(cs336-14-cover)=
# Lecture 14: Data II

Stanford CS336 · Language Modeling from Scratch · Spring 2026.


(cs336-14-topic-002)=
## Lecture 14: Data II

Last lecture:

- Live service (e.g., GitHub) → dump/crawl (e.g., GitHub Archive) → processed data (e.g., The Stack)
- Considerations: terms of service, copyright (licenses or fair use)

This lecture:

- Data pipeline: transformation, filtering, deduplication, mixing
- Mid-training + SFT: synthetic data

Raw data does not come as text.

It is HTML, PDF (arxiv), or directories (code repositories).

HTML to text (main one):

- Remove boilerplate (e.g., navigation, ads) and extract content
- What about images, tables, etc.?
- Inherently lossy (need to linearize)
- Tools (rule-based): trafilatura, resiliparse, jusText, lynx, etc.
- Accuracy matters: [Li+ 2024](https://arxiv.org/abs/2406.11794)

![dclm-wet.png](../source/images/dclm-wet.png)

FinePDFs [post](https://huggingface.co/spaces/HuggingFaceFW/FinePDFsBlog)

![image-e9e730a30cd647ff18f24f33cae588c0-https_huggingfacefw-finepdfsblog_hf_space__astro_pdf-description_Cb49jXc6_Z17eX4E_webp](../assets/364ffa690f8b8544f644f1f4.webp)

- Source: Common Crawl
- Recrawl truncated PDFs (since they are big)
- OCR (RolmOCR) using a VLM or Docling (make these run fast)
- Lots of cleanup and filtering
- A lot of layout information is missing

Algorithmic building block:

- Given some **target data** T and lots of **raw data** R, find subset T' of R similar to T.

![raw-target-schema.png](../source/images/raw-target-schema.png)

Applications:

- Language identification (English versus rest)
- Quality filtering (high quality versus low quality)
- Toxicity filtering (non-toxic versus toxic)

Desiderata for filtering algorithm:

- Generalize from the target data (want T and T' to be different)
- Extremely fast (have to run it on R, which is huge)

Survey paper on data selection [Albalak+ 2024](https://arxiv.org/abs/2402.16827)

General framework: Given target T and raw R, find subset of R similar to T

1. Estimate some model based on R and T and derive a scoring function
2. Keep examples in R based on their score

Types of classifiers:

- Generative model of T (KenLM): score(x) = p_T(x)
- Simple classifier (fastText): score(x) = p(T | x)

To use: keep examples x with score(x) >= threshold (stochastically)

Model-based filtering?

- Some deliberately do not use model-based filtering (C4, Gopher, RefinedWeb, FineWeb, Dolma)
- Some use model-based filtering (GPT-3, LLaMA, DCLM) [becoming the norm]

Language identification:

- Goal: find text of a specific language (e.g., English)
- fastText language identification [article](https://fasttext.cc/docs/en/language-identification.html)
- Off-the-shelf classifier
- Supports 176 languages
- Trained on multilingual sites: Wikipedia, Tatoeba (translation site) and SETimes (Southeast European news)
- Dolma keeps pages with p(English) >= 0.5 [Soldaini+ 2024](https://arxiv.org/abs/2402.00159)

OpenMathText [Paster+ 2023](https://arxiv.org/pdf/2310.06786)

- Goal: curate large corpus of mathematical text from CommonCrawl
- Use rules to filter (e.g., contains latex commands)
- KenLM trained on ProofPile, keep if perplexity < 15000
- Trained fastText classifier to predict mathematical writing, threshold is 0.17 if math, 0.8 if no math
- Result: produced 14.7B tokens, used to train 1.4B models that do better than models trained on 20x data

GPT-3 [Brown+ 2020](https://arxiv.org/pdf/2005.14165)

- Positives: samples from {Wikipedia, WebText2, Books1, Books2}
- Negatives: samples from CommonCrawl

Train linear classifier based on word features [article](https://spark.apache.org/docs/latest/ml-features#tokenizer)

Keep documents stochastically based on score

LLaMA/RedPajama [Touvron+ 2023](https://arxiv.org/pdf/2302.13971)

- Positives: samples from pages **referenced** by Wikipedia
- Negatives: samples from CommonCrawl
- Keep documents that are classified positive

phi-1 [Gunasekar+ 2023](https://arxiv.org/pdf/2306.11644)

- Philosophy: really high quality data (textbooks) to train a small model (1.5B)
- Includes synthetic data from GPT 3.5 (later: GPT-4) and filtered data
- Train random forest classifier on T using output embedding from pretrained codegen model
- Select data from R that is classified positive by the classifier

Result on [HumanEval](https://huggingface.co/datasets/openai_humaneval):

- Train 1.3B LM on Python subset of The Stack (performance: 12.19% after 96K steps)
- Train 1.3B LM on new filtered subset (performance: 17.68% after 36K steps) - better!

Toxicity filtering in Dolma [Soldaini+ 2024](https://arxiv.org/abs/2402.00159)

- Dataset: Jigsaw Toxic Comments dataset (2018) [dataset](https://www.kaggle.com/datasets/julian3833/jigsaw-toxic-comment-classification-challenge)
- Project goal: help people have better discussions online [article](https://www.kaggle.com/competitions/jigsaw-toxic-comment-classification-challenge/discussion/46064)
- Data: comments on Wikipedia talk page annotated with {toxic, severe_toxic, obscene, threat, insult, identity_hate}

Scale-dependent effects of filtering:

- No single optimal threshold for filtering
- If training for longer, want more (lower quality) data
- If training for shorter, want less (higher quality) data

![data-filtering-scale.png](../source/images/data-filtering-scale.png)

Summary:

- Filtering is critical for building a good model
- Recipe: define target data (what good looks like), extrapolate to raw data

Two types of duplicates:

- Exact duplicates (mirror sites, GitHub forks) [Gutenberg mirrors](https://www.gutenberg.org/MIRRORS.ALL)
- Near duplicates: same text differing by a few tokens

Examples of near duplicates:

- Terms of service and licenses [MIT license](https://opensource.org/license/mit)
- Formulaic writing (copy/pasted or generated from a template)

![image-bd6f945561f42be108f3dd1de0ace52e-https_d3i71xaburhd42_cloudfront_net_4566c0d22ebf3c31180066ab23b6c445aeec78d5_5-Table1-1_png](../assets/8ebe878d66724f5ed1b9aeeb.png)
- Minor formatting differences in copy/pasting

Product description repeated 61,036 times in C4

'“by combining fantastic ideas, interesting arrangements, and follow the current trends in the field of that make you more inspired and give artistic touches. We’d be honored if you can apply some or all of these design in your wedding.  believe me, brilliant ideas would be perfect if it can be applied in real and make the people around you amazed! [example page](https://www.amazon.co.uk/suryagede-100-Graffiti-Gas-Mask/dp/B07CRHT3RG)

Deduplication training data makes language models better [Lee+ 2021](https://arxiv.org/pdf/2107.06499)

- Train more efficiently (because have fewer tokens)
- Avoid memorization (can mitigate copyright, privacy concerns)

Design space:

1. What is an item (sentence, paragraph, document)?
2. How to match (exact match, existence of common subitem, fraction of common subitems)?
3. What action to take (remove all, remove all but one)?

Key challenge:

- Deduplication is fundamentally about comparing items to other items
- Need linear time algorithms to scale
- Hash function h maps item to a hash value (integer or string)
- Hash value much smaller than item
- Hash collision: h(x) = h(y) for x ≠ y

Tradeoff between efficiency and collision resistance [article](https://softwareengineering.stackexchange.com/questions/49550/which-hashing-algorithm-is-best-for-uniqueness-and-speed)

- Cryptographic hash functions (SHA-256): collision resistant, slow (used in bitcoin)
- DJB2, MurmurHash, CityHash: not collision resistant, fast (used for hash tables)

We will use MurmurHash:

| Variable | Value |
| --- | --- |
| `h` | 613153351 |

**Simple example**

1. Item: string
2. How to match: exact match
3. Action: remove all but one

**`items`**

```python
['Hello!', 'hello', 'hello there', 'hello', 'hi', 'bye']
```

**`deduped_items`**

```python
['hi', 'bye', 'hello', 'hello there', 'Hello!']
```

- Pro: simple, clear semantics, high precision
- Con: does not deduplicate near duplicates
- This code is written in a MapReduce way, can easily parallelize and scale

**C4** [Raffel+ 2019](https://arxiv.org/pdf/1910.10683v4)

1. Item: 3-sentence spans
2. How to match: use exact match
3. Action: remove all but one

Warning: when a 3-sentence span is removed from the middle of a document, the resulting document might not be coherent

Let's now look at approximate set membership.

First we need a similarity measure.

(cs336-14-topic-003)=
### Jaccard similarity

Definition: Jaccard(A, B) = |A intersect B| / |A union B|

| Variable | Value |
| --- | --- |
| `intersection` | 3 |

| Variable | Value |
| --- | --- |
| `union` | 5 |

| Variable | Value |
| --- | --- |
| `jaccard` | 0.6 |

Definition: two documents are **near duplicates** if their Jaccard similarity >= threshold

Algorithmic challenge: find near duplicates in linear time

(cs336-14-topic-004)=
### MinHash

MinHash: a random hash function h so that Pr[h(A) = h(B)] = Jaccard(A, B)

Normally, you want different items to hash to different hashes

...but here, you want collision probability to depend on similarity

Characteristic matrix representation:

```text
item | A | B
```

```text
1    | 1 | 1
```

```text
2    | 1 | 1
```

```text
3    | 1 | 1
```

```text
4    | 1 | 0
```

```text
5    | 0 | 1
```

Random hash function induces a permutation over items

Look at which item is first in A and which item is first in B.

Each item has the same probability as being first (min)

- If 1, 2, 3 is first, then first in A = first in B.
- If 4, 5 is first, then first in A ≠ first in B.

| Variable | Value |
| --- | --- |
| `estimated_jaccard` | 0.6 |

Now we can hash our items, but a collision doesn't tell us Jaccard(A, B) > threshold.

Locality sensitive hashing (LSH) [book chapter](http://infolab.stanford.edu/~ullman/mmds/ch3n.pdf)

Suppose we hash examples with just one MinHash function

P[A and B collide] = Jaccard(A, B)

On average, more similar items will collide, but very stochastic...

Goal: have A and B collide if Jaccard(A, B) > threshold

We have to somehow sharpen the probabilities...

Solution: use n hash functions

Break up into b bands of r hash functions each (n = b * r)

Hash functions:

```text
h1 h2 h3 h4  |  h5 h6 h7 h8  |  h9 h10 h11 h12
```

Key: A and B collide if for *some* band, *all* its hash functions return same value

As we will see, the and-or structure of the bands sharpens the threshold

Given Jaccard(A, B), what is the probability that A and B collide?

| Variable | Value |
| --- | --- |
| `b` | 3 |
| `r` | 4 |

**Example**

| Variable | Value |
| --- | --- |
| `sim` | 0.8 |
| `b` | 5 |
| `r` | 10 |

| Variable | Value |
| --- | --- |
| `prob_match` | 0.10737418240000006 |

| Variable | Value |
| --- | --- |
| `prob_collision` | 0.43330782041120397 |

| Variable | Value |
| --- | --- |
| `b` | 3 |
| `r` | 4 |

![image-5c7429f9fdd2bf58b7c5651aebc8f045-https_cdn_sanity_io_images_vr8gru94_production_b470799575b8e77911bacb8500977afef06d6c85-1280x720_png](../assets/1ded4d2a0dc11193ad1fd4ac.png)

**`probs`**

```python
{'0.7': 0.24914417423121082,
 '0.75': 0.4398848046250401,
 '0.8': 0.6788599735928997,
 '0.85': 0.8883561842922729,
 '0.9': 0.9862610183556292,
 '0.95': 0.999891783915662,
 '0.98': 0.9999999580450986}
```

Increasing r sharpens the threshold and moves the curve to the right (harder to match)

**`probs`**

```python
{'0.7': 0.007950636881415285,
 '0.75': 0.03126337888689601,
 '0.8': 0.10949086440906874,
 '0.85': 0.3265265704029475,
 '0.9': 0.7264487568116678,
 '0.95': 0.9881951109097257,
 '0.98': 0.9999835371130633}
```

Increasing b moves the curve to the left (easier to match)

| Variable | Value |
| --- | --- |
| `sim` | 0.95 |
| `b` | 20 |
| `r` | 20 |

| Variable | Value |
| --- | --- |
| `prob_match` | 0.3584859224085419 |

| Variable | Value |
| --- | --- |
| `prob_collision` | 0.9998606445935663 |

| Variable | Value |
| --- | --- |
| `b` | 3 |
| `r` | 4 |
| `prob_collision` | 0.43330782041120397 |

**`probs`**

```python
{'0.7': 0.015838061136010495,
 '0.75': 0.061549358914366414,
 '0.8': 0.2069934794290924,
 '0.85': 0.546433539626784,
 '0.9': 0.9251697173501179,
 '0.95': 0.9998606445935663,
 '0.98': 0.9999999997289734}
```

![image-7666e77b1a420b4da170c895b069684e-https_cdn_sanity_io_images_vr8gru94_production_aace49fa240778e8ecf6e85ad08a2de7f5385566-1280x720_png](../assets/c5da0f5f44d6d01125db0d89.png)

Example setting [Lee+ 2021](https://arxiv.org/pdf/2107.06499) : n = 9000, b = 20, r = 450

What is the threshold (where the phase transition happens)?

| Variable | Value |
| --- | --- |
| `threshold` | 0.9933649271209614 |

Probability that a fixed band matches:

| Variable | Value |
| --- | --- |
| `prob_match` | 0.05 |

Probability that A and B collide is a constant (≈ 1-1/e):

| Variable | Value |
| --- | --- |
| `prob_collision` | 0.6415140775914581 |

Recall that language models are trained on multiple data sources.

Datasets in Marin: [token viewer](https://huggingface.co/spaces/marin-community/token-count-viewer)

![marin-token-viewer.png](../source/images/marin-token-viewer.png)

The Pile [Gao+ 2020](https://arxiv.org/pdf/2101.00027.pdf)

![image-4eb29ee713b99ea34eb86b995bd32bfd-https_stanford-cs324_github_io_winter2022_lectures_images_the-pile_png](../assets/4c4bc9c0b3901401e72eab30.png)

Key question: what distribution over the data sources should we use?

Example:

Baselines:

- Vibes: set p(s) manually based on intuition (quite common)
- Uniform sampling: sample uniformly (p(s) ∝ 1)
- Proportional mixing: sample proportional to the number of tokens in a source (p(s) ∝ num_tokens(s))

Intuition: should upweight higher quality sources

However...

1. We want to ensure diversity (e.g., across incomparable sources: literature, code, papers)
2. Each source is finite, so if put too much weight on a small source, then need to epoch over it

This last point is important and a bit subtle.

Example:

| Variable | Value |
| --- | --- |
| `low_num_epochs` | 0.05 |

| Variable | Value |
| --- | --- |
| `high_num_epochs` | 50.0 |

50x epochs on high quality data...can lead to overfitting!

UniMax [Chung+ 2023](https://arxiv.org/abs/2304.09151)

- Setting: balancing different languages for multilingual models
- Previous work: between uniform and proportional mixing (p(s) ∝ num_tokens(s)^α for α in [0, 1])
- Idea: sample sources uniformly but with a hard **cap** C on number of epochs for any source
- Specifically, p(s) * num_training_tokens ≤ C for all sources s

Regression-based mixing [Liu+ 2024](https://arxiv.org/abs/2407.01492) [Chen+ 2026](https://arxiv.org/pdf/2602.12237)

![regmix.png](../source/images/regmix.png)

- Define distribution over mixtures `p` (e.g., Dirichlet)
- Define regression method (e.g., linear, gradient boosted trees)
- Define target based on downstream evals (careful not to overfit!)
- Discrepancy between small and large scale (tradeoff cost and accuracy)

![data-mixing-methods.png](../source/images/data-mixing-methods.png)

Hope 1: regression model is accurate at minimizer 🙏

Hope 2: optimal data mixtures transfer from small to large scale 🙏

Hold on. There's at least one scale-dependent effect:

- If train small models on low token counts:
- But if train large model on this mixture, we will epoch a ton on high quality data and overfit!

Simulated epoching [Held+ 2025](https://arxiv.org/pdf/2501.11747)

- General idea: make small scale look like large scale (general theme of this course)
- Instantiation: downsample all sources proportionally

| Variable | Value |
| --- | --- |
| `ratio` | 0.01 |

**`downsampled_source_token_counts`**

```python
{'low': 100000000000.0, 'high': 100000000.0}
```

- In this downsampled mixture, models that epoch too much won't look good.
- So the optimum will be more balanced.

Summary:

- Problem: how to weight different data sources (e.g., Wikipedia, general, code)
- Regression-based mixing: estimate mixture → loss at small scale, optimize (analogous to scaling laws)
- Important consideration: epoching and overfitting (solution: cap or simulated)

Recipe:

1. Define a set of environments
2. Define a set of tasks / prompts
3. Collect responses from a strong model (teacher)

OpenThoughts [Guha+ 2025](https://arxiv.org/abs/2506.04178)

- 1.2M examples using QwQ-32B as a teacher
- Questions come from 27 human and synthetic sources (e.g., StackExchange, NuminaMath, Chemistry)

![openthoughts-sources.png](../source/images/openthoughts-sources.png)

- Sampling multiple (16) responses per prompt is helpful
- Better models aren't necessarily better teachers: QwQ-32B is a better teacher than DeepSeek-R1
- Answer filtering wasn't helpful
- Smaller high quality sources (e.g., OpenMath-2-Math) is better than large diverse sources

![openthoughts-pipeline.png](../source/images/openthoughts-pipeline.png)

SWE-smith [Yang+ 2025](https://arxiv.org/abs/2504.21798)

![swe-smith.png](../source/images/swe-smith.png)

- Given a repository, use LM to generate tasks (introduce bugs with LM)
- 128 GitHub repositories yields 50K tasks

SWE-Zero [Ludwig+ 2026](https://arxiv.org/abs/2604.01496)

- SWE tasks have heavy dependencies (unlike math or coding contests)
- Setting up thousands of Docker images is an infrastructural nightmare
- Observation: strong models can solve many tasks without execution feedback

![swezero-noexec.png](../source/images/swezero-noexec.png)

Key: strong models have internal "world model" of code semantics

- SWE-Zero: 300K agent trajectories that don't require repository-specific execution
- 150K GitHub PRs
- OpenHands scaffold, remove future git commits to prevent "git hacking" by agent

![swezero-prompt.png](../source/images/swezero-prompt.png)

- Distilled from Qwen3-Coder-480B + filtering (try to execute anyway)
- SWE-Hero: 13K agent trajectories that do require execution feedback

![swezero-results.png](../source/images/swezero-results.png)

SWE-rebench [Badertdinov+ 2025](https://arxiv.org/pdf/2505.20411)

- 21K interactive Python SWE tasks from 3.4K GitHub repositories
- 450K PRs from GitHub and GitHub Archive
- Used Qwen 2.5-72B-Instruct to install dependencies and assess PR quality

![swe-rebench.png](../source/images/swe-rebench.png)

SWE-ZERO-12M-trajectories [data](https://huggingface.co/datasets/AlienKevin/SWE-ZERO-12M-trajectories)

- Scale SWE-Zero up to 12M agent trajectories
- Used the SWE-rebench-v2 tasks (32K executable tasks + 120K nonexecutable tasks)
- Ran mini-coder-1.7b (very small model, 50.4 pass@100), mini-swe-agent scaffold
- [Example](https://huggingface.co/datasets/AlienKevin/SWE-ZERO-12M-trajectories/viewer/default/train?row=5&conversation-viewer=0)

Summary:

- Generating prompts: fully-synthetic, semi-synthetic (real environment + synthetic tasks), real (GitHub PRs)
- Responses: from capable models (that are also good teachers)
- Code environments are painful
- Lots of filtering and other details

Summary:

- Filtering: train classifier (language id, quality, toxicity) for what good looks like
- Deduplication: hashing scales to large datasets for fuzzy matching
- Mixing: try mixtures at small scale, extrapolate to optimal mixture and large scale
- Applications: language identification, quality filtering, toxicity filtering
- Post-training data: looks like evaluations, use of synthetic data
- A lot of data work is domain-specific, looking at examples, etc.
