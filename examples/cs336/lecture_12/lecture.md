---
title: "CS336 Lecture 12: Evaluation"
lang: en
plugins:
  - '@lincyaw/slidev-addon-core'
  - '@lincyaw/slidev-addon-content'
renderers:
  web: {}
  notebook: {}
---

(cs336-12-cover)=
# Lecture 12: Evaluation

Stanford CS336 · Language Modeling from Scratch · Spring 2026.


(cs336-12-topic-002)=
## Lecture 12: evaluation

- So far: we've covered everything for training an LM (architecture, training, systems, scaling).
- Missing piece: what **data** do you train on?
- Data shapes model behavior (code? multilingual? DNA?).
- Before talking about data, need to talk about what behavior we want from a model.

**Evaluation**: given a model, how "**good**" is it?

Evaluation might appear to be a mechanical process:

1. Define some prompts
2. Send prompts to a model and get back responses
3. Compute accuracy

But actually, evaluation is a deep and important topic...

...which shapes the development of AI.

**Core challenge**: &lt;font color="red">abstract construct&lt;/font> → &lt;font color="blue">concrete metric&lt;/font>

Maybe a model is good if it does well on benchmarks... [Artificial Analysis](https://artificialanalysis.ai/)

![artificial-analysis.png](../source/images/artificial-analysis.png)

Maybe a model is good if it does well on benchmarks and is cheap to run...

![artificial-analysis-cost.png](../source/images/artificial-analysis-cost.png)

Maybe a model is good if people prefer its responses... [Arena AI (formerly Chatbot Arena)](https://arena.ai/leaderboard)

![lmarena-leaderboard.png](../source/images/lmarena-leaderboard.png)

Maybe a model is good if people simply choose to use (and pay for) it... [OpenRouter](https://openrouter.ai/rankings)

![openrouter.png](../source/images/openrouter.png)

- Recall: that a language model is a probability distribution **p(x)** over sequences of tokens.
- Perplexity (1/p(D))^(1/|D|) measures whether p assigns high probability to some dataset D.
- In pre-training, you minimize perplexity on the training set.
- The obvious thing is to measure perplexity on the test set.
- This is what people did traditionally in language modeling research.

Standard datasets:

- Penn Treebank (WSJ)
- WikiText-103 (Wikipedia)
- One Billion Word Benchmark (from machine translation WMT11 - EuroParl, UN, news)

Classic paradigm: in-distribution evaluation: train on train split and evaluate on test split of some dataset.

Pure CNNs+LSTMs on the One Billion Word Benchmark (perplexity 51.3 → 30.0) [Jozefowicz+ 2016](https://arxiv.org/abs/1602.02410)

GPT-2:

- Trained on WebText (40GB text, websites linked from Reddit)
- Zero-shot on standard datasets (**out-of-distribution** evaluation)

![gpt2-perplexity.png](../source/images/gpt2-perplexity.png)

- Works better on small datasets (PTB) where transfer is helpful, but not larger datasets (1BW)

Perplexity is all you need (more faith than science):

- True distribution is t, model is p.
- Best possible perplexity is H(t) obtained iff p = t.
- If p = t, then solve all the tasks: p(solution | problem)
- So by pushing down on perplexity, we will eventually "reach AGI".

Perplexity is maybe more than you need:

- Example: *Stanford was founded in 1885*
- Perplexity penalizes prediction on all tokens, some (e.g., *founded*) of which might not be relevant
- Solution: measure conditional perplexity p(response | prompt)^(1/|response|)

Some benchmarks are perplexity in disguise:

- Cloze tasks (fill in the blank): LAMBADA [Paperno+ 2016](https://arxiv.org/abs/1606.06031)

![lambada.png](../source/images/lambada.png)

- Multiple choice sentence completion: HellaSwag [Zellers+ 2019](https://arxiv.org/pdf/1905.07830)

![hellaswag.png](../source/images/hellaswag.png)

**Warning** (if you're running a perplexity leaderboard):

- People submit `LM` and you compute `log_prob = LM(test_data)`
- You need to trust that the probabilities are valid (sum to 1)
- For downstream tasks, `response = LM(prompt)` and compute accuracy on `response`

Summary:

- Perplexity is still used heavily in language model development (smooth scaling laws)
- Still need benchmarks that capture real-world situations (for the non-believers)...

Exams are a useful way to test language models (as with humans):

- Have control over the subject and difficulty
- Design to have unambiguous correct answer, easy to grade

**Massive Multitask Language Understanding (MMLU)** [Hendrycks+ 2020](https://arxiv.org/pdf/2009.03300.pdf)

- 57 subjects (e.g., math, US history, law, morality), multiple-choice
- "collected by graduate and undergraduate students from freely available sources online"
- Despite the name, MMLU is really about testing knowledge, not language understanding
- Evaluated on GPT-3 using few-shot prompting

![mmlu.png](../source/images/mmlu.png) [https://llm-stats.com/benchmarks/mmlu](https://llm-stats.com/benchmarks/mmlu) [HELM MMLU for visualizing predictions](https://crfm.stanford.edu/helm/mmlu/latest/)

**MMLU-Pro** [Wang+ 2024](https://arxiv.org/abs/2406.01574)

- Removed noisy/trivial questions from MMLU
- Expanded 4 choices to 10 choices
- Evaluated using chain of thought (gives model more of a chance)
- Accuracy of models drop by 16% to 33% (not as saturated)

![mmlu-pro.png](../source/images/mmlu-pro.png) [https://llm-stats.com/benchmarks/mmlu-pro](https://llm-stats.com/benchmarks/mmlu-pro) [HELM MMLU-Pro for visualizing predictions](https://crfm.stanford.edu/helm/capabilities/latest/#/leaderboard/mmlu_pro)

**Graduate-Level Google-Proof Q&A (GPQA)** [Rein+ 2023](https://arxiv.org/abs/2311.12022)

- Questions written by 61 PhD contractors from Upwork

![gpqa.png](../source/images/gpqa.png)

- PhD experts achieve 65% accuracy
- Non-experts achieve 34% over 30 minutes with access to Google
- GPT-4 achieves 39% [https://llm-stats.com/benchmarks/gpqa](https://llm-stats.com/benchmarks/gpqa) [HELM GPQA for visualizing predictions](https://crfm.stanford.edu/helm/capabilities/latest/#/leaderboard/gpqa)

**Humanity's Last Exam (HLE)** [Phan+ 2025](https://arxiv.org/abs/2501.14249)

- 2500 questions: multimodal, many subjects, multiple-choice + short-answer

![hle-examples.png](../source/images/hle-examples.png)

- Awarded $500K prize pool + co-authorship to question creators
- Filtered by frontier LLMs, multiple stages of review

![hle-pipeline.png](../source/images/hle-pipeline.png)

![hle-results.png](../source/images/hle-results.png) [https://llm-stats.com/benchmarks/hle](https://llm-stats.com/benchmarks/hle)

Summary:

- Trend towards harder questions as models improve and saturate existing benchmarks
- Multiple-choice format can be as difficult as one wants
- Does not capture real usage (open-ended, doesn't necessarily exist correct answer)
- So far, we've been evaluating on well-defined multiple-choice tasks.
- Most people don't ask multiple-choice exam questions to their AI assistant.

Example:

Prompt: *I would like to make a beet salad with goat cheese. What kind of herbs would work well and what would not work well?*

Response: *Here’s a breakdown of herbs that work well (and some that don’t) in a beet + goat cheese salad, based on how their flavors interact with the sweet-earthiness of beets and the tangy creaminess of goat cheese...

**Challenge**: how to evaluate an open-ended response?

**Chatbot Arena** [Chiang+ 2024](https://arxiv.org/abs/2403.04132)

Data collection:

- Random person from the Internet types in prompt
- They get response from two random (anonymized) models
- They rate which one is better

![arena-beets.png](../source/images/arena-beets.png)

Compute ELO rankings based on pairwise comparisons:

- Define model: p(A wins against B) = 1 / (1 + 10^((ELO_B - ELO_A)/400))
- Fit this model to maximize probability of pairwise comparisons [Arena AI (formerly Chatbot Arena)](https://arena.ai/leaderboard)

![lmarena-leaderboard.png](../source/images/lmarena-leaderboard.png)

Properties:

- Real-world prompts (free for users, incentives to actually use it)
- But who are these people? biases? spammers?
- Binary preference but conflates style and correctness
- How does the human even assess correctness?  Prone to sycophancy?
- Feature: don't need to feed same prompts to all models (important because human is rating)
- Dynamic: incorporates new prompts and models over time

**AlpacaEval** (2023) [leaderboard](https://tatsu-lab.github.io/alpaca_eval/)

- 805 instructions from various sources
- Metric: win rate against baseline model (GPT-4 preview) as judged by GPT-4 preview (potential bias?)
- Problem: LLM judges favor longer responses, resulted in leaderboard gaming
- Alpaca Eval 2.0 used regression to debias the metric [Dubois+ 2024](https://arxiv.org/pdf/2404.04475)
- How do we evaluate the metric?
- Correlation with Chatbot Arena (humans) is high:

![image-434a1510a7ed21d5355814149a9490c4-https_github_com_tatsu-lab_alpaca_eval_raw_main_figures_chat_correlations_no_ae_png](../assets/cdf035a2b6e1b8e00b236eba.png)

![alpacaeval-leaderboard.png](../source/images/alpacaeval-leaderboard.png)

**WildBench** [Lin+ 2024](https://arxiv.org/pdf/2406.04770)

- Sourced 1024 examples from 1M human-chatbot conversations
- Uses GPT-4 turbo as a judge with a checklist (like CoT for judging) + GPT-4 as a judge
- Well-correlated with Chatbot Arena (seems to be the de facto sanity check)

![wildbench.png](../source/images/wildbench.png) [HELM WildBench for visualizing predictions](https://crfm.stanford.edu/helm/capabilities/latest/#/leaderboard/wildbench)

Summary:

- Challenge: how to evaluate open-ended responses?
- Pairwise comparisons between similar responses provide higher signal
- Beware of biases (both from humans and LLM judges)
- Checklist/rubric improves reliability (regardless of human or LLM judge)

Previously: evaluate what LMs say (chat)

Now: evaluate what LMs do (agents)

Agent = language model + agent scaffold (logic for deciding how to use the LM)

Consider tasks that require tool use (e.g., running code) and iterating over a period of time

**SWEBench** [Jimenez+ 2023](https://arxiv.org/abs/2310.06770)

- 2294 tasks across 12 Python repositories
- Given codebase + issue description, submit a PR
- Evaluation metric: unit tests

![swebench.png](../source/images/swebench.png) [https://llm-stats.com/benchmarks/swe-bench-verified](https://llm-stats.com/benchmarks/swe-bench-verified)

**TerminalBench** [Merrill+ 2026](https://arxiv.org/abs/2601.11868) [website](https://www.tbench.ai/)

![terminal-bench.png](../source/images/terminal-bench.png)

- Computer terminal environments: simple and universal
- 229 tasks crowdsourced from 93 contributors, 89 tasks constitute Terminal-Bench 2.0

![terminal-bench-human-time.png](../source/images/terminal-bench-human-time.png)

![terminal-bench-results.png](../source/images/terminal-bench-results.png) [https://llm-stats.com/benchmarks/terminal-bench](https://llm-stats.com/benchmarks/terminal-bench)

**CyBench** [Zhang+ 2024](https://arxiv.org/abs/2408.08926)

![cybench.png](../source/images/cybench.png)

- 40 Capture the Flag (CTF) tasks
- Use first-solve time as a measure of difficulty

![cybench-agent.png](../source/images/cybench-agent.png)

![cybench-results.png](../source/images/cybench-results.png) [https://llm-stats.com/benchmarks/cybench](https://llm-stats.com/benchmarks/cybench)

**MLEBench** [Chan+ 2024](https://arxiv.org/abs/2410.07095)

- 75 Kaggle competitions (require training models, processing data, etc.)

![mlebench.png](../source/images/mlebench.png)

![mlebench-results.png](../source/images/mlebench-results.png)

Agent scaffolds [post](https://www.philschmid.de/agents-2.0-deep-agents)

![image-155d1eb10710df090449bf401822dd7e-https_www_philschmid_de_static_blog_agents-2_0-deep-agents_overview_png](../assets/bce9746e55531159b07c4507.png)

- Explicit planning: keep a todo list that gets checked off
- Hierarchical delegation: agents calling other sub-agents (clean context)
- Persistent memory: read/write files
- Extreme context engineering: explicit more instructions on process

Summary:

- Agents dramatically enhance the capability surface of language models
- Agent scaffolds are very important
- Evaluating agents = evaluating agent scaffold + language model
- All of the tasks so far require linguistic and world knowledge.
- Can we isolate **reasoning** from knowledge?
- Arguably, reasoning captures a more pure form of intelligence (isn't just about memorizing facts).

**ARC-AGI** [website](https://arcprize.org/arc-agi)

- 100\% solvable by humans, but challenging for AI
- Each task is unique, so memorization doesn't help.
- ARC-AGI-1 (2019): first iteration

![image-d1a33e9159cfdb77197551bbbecc6a76-https_arcprize_org_media_images_arc-task-grids_jpg](../assets/ca91237aa14d52a9b8b2b2ec.jpg)

- ARC-AGI-2 (March 2025): more multi-step reasoning

![image-a0338c9fb72d1163cfc8ac66fea4e4ed-https_arcprize_org_media_images_blog_arc-agi-2-unsolved-1_png](../assets/6f5c24072e35c5b7fd89463d.png)

![arc-agi-results.png](../source/images/arc-agi-results.png)

- Pretrained language models didn't move the needle
- Reasoning models (o1, o3) started making things take off
- ARC-AGI-3 (March 2026): interactive environments [post](https://arcprize.org/media/ARC_AGI_3_Technical_Report.pdf)

![arc-agi-3.png](../source/images/arc-agi-3.png)

![arc-agi-3-results.png](../source/images/arc-agi-3-results.png)

Summary:

- Goal is to disentangle reasoning from knowledge (difficult to do!)
- Constrained to human reasoning (not superhuman reasoning)
- Clearly exposes gaps in current models

![image-a375cd28c372458baf4135c081a1ce8b-https_www_team-bhp_com_forum_attachments_road-safety_2173645d1625144681-will-crash-test-rating-change-if-higher-variant-chosen-images-30_jpeg](../assets/cba1ee57314e3b7c90b0859f.jpg)

What does safety mean for AI?

**HarmBench** [Mazeika+ 2024](https://arxiv.org/abs/2402.04249)

- Based on 510 harmful behaviors that violate laws or norms [HarmBench on HELM](https://crfm.stanford.edu/helm/safety/latest/#/leaderboard/harm_bench) [Example of safety failure](https://crfm.stanford.edu/helm/safety/latest/#/runs/harm_bench:model=anthropic_claude-3-7-sonnet-20250219?instancesPage=4)

**AIR-Bench** [Zeng+ 2024](https://arxiv.org/abs/2407.17436)

- Based on regulatory frameworks and company policies
- Taxonomized into 314 risk categories, 5694 prompts

![image-5993188f3fa9dc78b85f9866fcee27ac-https_crfm_stanford_edu_helm_assets_air-overview-DpBbyagA_png](../assets/d2e6c49f82744f9d7e8f1ec8.png) [HELM AIR-Bench](https://crfm.stanford.edu/helm/air-bench/latest/#/leaderboard)

Jailbreaking:

- Language models are trained to refuse harmful instructions
- Greedy Coordinate Gradient (GCG) automatically optimizes prompts to bypass safety [Zou+ 2023](https://arxiv.org/pdf/2307.15043)
- Transfers from open-weight models (Llama) to closed models (GPT-4)

![gcg-examples.png](../source/images/gcg-examples.png)

What is safety?

- Many aspects of safety are strongly contextual (politics, law, social norms - which vary across countries)
- Many risks are quite varied (hallucinations, sycophancy, abetting crimes, inequality, losing critical thinking)

**Dual-use**: capable cybersecurity agents (Mythos) can be used to hack into a system or to do penetration testing

**Ecological validity**: how well does an evaluation capture real-world use?

- Exam benchmarks (e.g., GPQA) are far away from real-world use.
- Chatbot Arena prompts are from real people, but distribution is uncontrolled.

**GDPVal** (OpenAI) [Patwardhan+ 2025](https://arxiv.org/pdf/2510.04374)

- 44 occupations from top 9 sectors according to US GDP
- Tasks come from professionals with ~14 years of experience

![gdpval.png](../source/images/gdpval.png)

**MedHELM** [Bedi+ 2025](https://arxiv.org/abs/2505.23802)

- Previous medical benchmarks were based on standardized exams
- 121 clinical tasks sourced from 29 clinicians, mixture of private and public datasets

![image-93ff2615b50418e8fd4dd6f6435bdff1-https_crfm_stanford_edu_helm_assets_medhelm-overview-CND0EIsy_png](../assets/eac29843bf5c374efe714b27.png) [MedHELM](https://crfm.stanford.edu/helm/medhelm/latest/#/leaderboard)

**Clio** (Anthropic) [Tamkin+ 2024](https://arxiv.org/abs/2412.13678)

- Use language models to analyze real user data
- Share general patterns of what people are asking

![clio-table4.png](../source/images/clio-table4.png)

Unfortunately, realism and privacy are sometimes at odds with each other.

How do we know our evaluations are valid?

(cs336-12-topic-003)=
### Train-test overlap

- Machine learning 101: don't train on your test set
- Pre-foundation models (ImageNet, SQuAD): well-defined train-test splits
- Today: train on the Internet and don't tell people about your data

Route 1: try to infer train-test overlap from model

- Exploit exchangeability of data points [Oren+ 2023](https://arxiv.org/pdf/2310.17623)

![contamination-exchangeability.png](../source/images/contamination-exchangeability.png)

Route 2: encourage reporting norms (e.g., people report confidence intervals)

- Model providers should report train-test overlap [Zhang+ 2024](https://arxiv.org/abs/2410.08385)

Route 3: use fresh evals

- LiveCodeBench, UncheatableEval: scrape new webpages
- Timestamps aren't always safe due to copying either

Route 4: use private evals

- Companies use internal code bases that aren't on the Internet
- Use your personal writings
- Easiest for perplexity

(cs336-12-topic-004)=
### Dataset quality

- Fixed up SWE-Bench to produce SWE-Bench Verified [post](https://openai.com/index/introducing-swe-bench-verified/)
- Create Platinum versions of benchmarks [Vendrow+ 2025](https://arxiv.org/abs/2502.03461)

![image-a1149b095a48ea306dcdea342363230c-https_pbs_twimg_com_media_GjICXQlWkAAYnDS_format_jpg_name_4096x4096](../assets/087f0e275e274a4e97b85b25.jpg)

![image-306ae3f862cee7c7842c0b29af3a2f5c-https_pbs_twimg_com_media_GjICcGQXYAAM4o1_format_jpg_name_4096x4096](../assets/7139a2cb71a481942278ebda.jpg)

- Problems with agentic benchmarks: insufficient test cases, trivial agent can solve task [Zhu+ 2025](https://arxiv.org/abs/2507.02825)
- Docent: use LLM to inspect agent traces to detect problems [post](https://transluce.org/introducing-docent)

(cs336-12-topic-005)=
### What's the point of evaluation?

There is no one true evaluation; it depends on what question you're trying to answer.

1. User or company wants to make a purchase decision (model A or model B) for their use case (e.g., customer service chatbots).
2. Researchers want to measure the raw capabilities of a model (e.g., intelligence).
3. We want to understand the benefits + harms of a model (for business and policy reasons).
4. Model developers want to get feedback to improve the model.

(cs336-12-topic-006)=
### What are we evaluating?

- Pre-foundation models, we evaluated **methods** (standardized train-test splits).
- Today, we're (mostly) evaluating **models/systems** (anything goes).

There are some exceptions...

- nanogpt speedrun: fixed data, compute time to get to a particular validation loss

![karpathy-nanogpt-speedrun.png](../source/images/karpathy-nanogpt-speedrun.png) [post](https://x.com/karpathy/status/1846790537262571739)

Evaluating methods encourage algorithmic innovation from researchers.

Evaluating models/systems is useful for downstream users.

Either way, we need to define the rules of the game!

Takeaways:

- There is no one true evaluation; choose the evaluation depending on what you're trying to measure.
- Clearly state the rules of the game (methods versus models versus agents).
- Considerations: difficulty, realism, validity.
