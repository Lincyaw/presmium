---
title: "CS336 Lecture 12: Evaluation"
lang: en
plugins:
  - '@lincyaw/slidev-addon-core'
  - '@lincyaw/slidev-addon-content'
renderers:
  slides: {}
---

(cs336-12-cover)=
# Lecture 12: Evaluation

Stanford CS336 · Language Modeling from Scratch · Spring 2026.


(cs336-12-section-001)=
## Lecture 12: evaluation

:::{slide}
:label: cs336-12-001-output-001
:at: 0
- So far: we've covered everything for training an LM (architecture, training, systems, scaling).
:::

:::{slide}
:label: cs336-12-001-output-002
:at: 1
- Missing piece: what **data** do you train on?
:::

:::{slide}
:label: cs336-12-001-output-003
:at: 2
- Data shapes model behavior (code? multilingual? DNA?).
:::

:::{slide}
:label: cs336-12-001-output-004
:at: 3
- Before talking about data, need to talk about what behavior we want from a model.
:::


(cs336-12-section-002)=
## Lecture 12: evaluation

:::{slide}
:label: cs336-12-002-output-001
:at: 0
**Evaluation**: given a model, how "**good**" is it?
:::

:::{slide}
:label: cs336-12-002-output-002
:at: 1
Evaluation might appear to be a mechanical process:
:::

:::{slide}
:label: cs336-12-002-output-003
:at: 2
1. Define some prompts
:::

:::{slide}
:label: cs336-12-002-output-004
:at: 3
2. Send prompts to a model and get back responses
:::

:::{slide}
:label: cs336-12-002-output-005
:at: 4
3. Compute accuracy
:::


(cs336-12-section-003)=
## Lecture 12: evaluation

:::{slide}
:label: cs336-12-003-output-001
:at: 0
But actually, evaluation is a deep and important topic...
:::

:::{slide}
:label: cs336-12-003-output-002
:at: 1
...which shapes the development of AI.
:::

:::{slide}
:label: cs336-12-003-output-003
:at: 2
**Core challenge**: &lt;font color="red">abstract construct&lt;/font> → &lt;font color="blue">concrete metric&lt;/font>
:::

:::{slide}
:label: cs336-12-003-output-004
:at: 3
Maybe a model is good if it does well on benchmarks...
:::

:::{slide}
:label: cs336-12-003-output-005
:at: 4
[Artificial Analysis](https://artificialanalysis.ai/)
:::


(cs336-12-section-004)=
## Lecture 12: evaluation

:::{slide}
:label: cs336-12-004-output-001
:at: 0
![artificial-analysis.png](../source/images/artificial-analysis.png)
:::

:::{slide}
:label: cs336-12-004-output-002
:at: 1
Maybe a model is good if it does well on benchmarks and is cheap to run...
:::

:::{slide}
:label: cs336-12-004-output-003
:at: 2
![artificial-analysis-cost.png](../source/images/artificial-analysis-cost.png)
:::

:::{slide}
:label: cs336-12-004-output-004
:at: 3
Maybe a model is good if people prefer its responses...
:::

:::{slide}
:label: cs336-12-004-output-005
:at: 4
[Arena AI (formerly Chatbot Arena)](https://arena.ai/leaderboard)
:::


(cs336-12-section-005)=
## Lecture 12: evaluation

:::{slide}
:label: cs336-12-005-output-001
:at: 0
![lmarena-leaderboard.png](../source/images/lmarena-leaderboard.png)
:::

:::{slide}
:label: cs336-12-005-output-002
:at: 1
Maybe a model is good if people simply choose to use (and pay for) it...
:::

:::{slide}
:label: cs336-12-005-output-003
:at: 2
[OpenRouter](https://openrouter.ai/rankings)
:::

:::{slide}
:label: cs336-12-005-output-004
:at: 3
![openrouter.png](../source/images/openrouter.png)
:::

:::{slide}
:label: cs336-12-005-output-005
:at: 4
- Recall: that a language model is a probability distribution **p(x)** over sequences of tokens.
:::


(cs336-12-section-006)=
## Lecture 12: evaluation

:::{slide}
:label: cs336-12-006-output-001
:at: 0
- Perplexity (1/p(D))^(1/|D|) measures whether p assigns high probability to some dataset D.
:::

:::{slide}
:label: cs336-12-006-output-002
:at: 1
- In pre-training, you minimize perplexity on the training set.
:::

:::{slide}
:label: cs336-12-006-output-003
:at: 2
- The obvious thing is to measure perplexity on the test set.
:::

:::{slide}
:label: cs336-12-006-output-004
:at: 3
- This is what people did traditionally in language modeling research.
:::

:::{slide}
:label: cs336-12-006-output-005
:at: 4
Standard datasets:
:::


(cs336-12-section-007)=
## Lecture 12: evaluation

:::{slide}
:label: cs336-12-007-output-001
:at: 0
- Penn Treebank (WSJ)
:::

:::{slide}
:label: cs336-12-007-output-002
:at: 1
- WikiText-103 (Wikipedia)
:::

:::{slide}
:label: cs336-12-007-output-003
:at: 2
- One Billion Word Benchmark (from machine translation WMT11 - EuroParl, UN, news)
:::

:::{slide}
:label: cs336-12-007-output-004
:at: 3
Classic paradigm: in-distribution evaluation: train on train split and evaluate on test split of some dataset.
:::

:::{slide}
:label: cs336-12-007-output-005
:at: 4
Pure CNNs+LSTMs on the One Billion Word Benchmark (perplexity 51.3 → 30.0) 

[Jozefowicz+ 2016](https://arxiv.org/abs/1602.02410)
:::


(cs336-12-section-008)=
## Lecture 12: evaluation

:::{slide}
:label: cs336-12-008-output-001
:at: 0
GPT-2:
:::

:::{slide}
:label: cs336-12-008-output-002
:at: 1
- Trained on WebText (40GB text, websites linked from Reddit)
:::

:::{slide}
:label: cs336-12-008-output-003
:at: 2
- Zero-shot on standard datasets (**out-of-distribution** evaluation)
:::

:::{slide}
:label: cs336-12-008-output-004
:at: 3
![gpt2-perplexity.png](../source/images/gpt2-perplexity.png)
:::

:::{slide}
:label: cs336-12-008-output-005
:at: 4
- Works better on small datasets (PTB) where transfer is helpful, but not larger datasets (1BW)
:::


(cs336-12-section-009)=
## Lecture 12: evaluation

:::{slide}
:label: cs336-12-009-output-001
:at: 0
Perplexity is all you need (more faith than science):
:::

:::{slide}
:label: cs336-12-009-output-002
:at: 1
- True distribution is t, model is p.
:::

:::{slide}
:label: cs336-12-009-output-003
:at: 2
- Best possible perplexity is H(t) obtained iff p = t.
:::

:::{slide}
:label: cs336-12-009-output-004
:at: 3
- If p = t, then solve all the tasks: p(solution | problem)
:::

:::{slide}
:label: cs336-12-009-output-005
:at: 4
- So by pushing down on perplexity, we will eventually "reach AGI".
:::


(cs336-12-section-010)=
## Lecture 12: evaluation

:::{slide}
:label: cs336-12-010-output-001
:at: 0
Perplexity is maybe more than you need:
:::

:::{slide}
:label: cs336-12-010-output-002
:at: 1
- Example: *Stanford was founded in 1885*
:::

:::{slide}
:label: cs336-12-010-output-003
:at: 2
- Perplexity penalizes prediction on all tokens, some (e.g., *founded*) of which might not be relevant
:::

:::{slide}
:label: cs336-12-010-output-004
:at: 3
- Solution: measure conditional perplexity p(response | prompt)^(1/|response|)
:::

:::{slide}
:label: cs336-12-010-output-005
:at: 4
Some benchmarks are perplexity in disguise:
:::


(cs336-12-section-011)=
## Lecture 12: evaluation

:::{slide}
:label: cs336-12-011-output-001
:at: 0
- Cloze tasks (fill in the blank): LAMBADA 

[Paperno+ 2016](https://arxiv.org/abs/1606.06031)
:::

:::{slide}
:label: cs336-12-011-output-002
:at: 1
![lambada.png](../source/images/lambada.png)
:::

:::{slide}
:label: cs336-12-011-output-003
:at: 2
- Multiple choice sentence completion: HellaSwag 

[Zellers+ 2019](https://arxiv.org/pdf/1905.07830)
:::

:::{slide}
:label: cs336-12-011-output-004
:at: 3
![hellaswag.png](../source/images/hellaswag.png)
:::

:::{slide}
:label: cs336-12-011-output-005
:at: 4
**Warning** (if you're running a perplexity leaderboard):
:::


(cs336-12-section-012)=
## Lecture 12: evaluation

:::{slide}
:label: cs336-12-012-output-001
:at: 0
- People submit `LM` and you compute `log_prob = LM(test_data)`
:::

:::{slide}
:label: cs336-12-012-output-002
:at: 1
- You need to trust that the probabilities are valid (sum to 1)
:::

:::{slide}
:label: cs336-12-012-output-003
:at: 2
- For downstream tasks, `response = LM(prompt)` and compute accuracy on `response`
:::

:::{slide}
:label: cs336-12-012-output-004
:at: 3
Summary:
:::

:::{slide}
:label: cs336-12-012-output-005
:at: 4
- Perplexity is still used heavily in language model development (smooth scaling laws)
:::


(cs336-12-section-013)=
## Lecture 12: evaluation

:::{slide}
:label: cs336-12-013-output-001
:at: 0
- Still need benchmarks that capture real-world situations (for the non-believers)...
:::

:::{slide}
:label: cs336-12-013-output-002
:at: 1
Exams are a useful way to test language models (as with humans):
:::

:::{slide}
:label: cs336-12-013-output-003
:at: 2
- Have control over the subject and difficulty
:::

:::{slide}
:label: cs336-12-013-output-004
:at: 3
- Design to have unambiguous correct answer, easy to grade
:::

:::{slide}
:label: cs336-12-013-output-005
:at: 4
**Massive Multitask Language Understanding (MMLU)** 

[Hendrycks+ 2020](https://arxiv.org/pdf/2009.03300.pdf)
:::


(cs336-12-section-014)=
## Lecture 12: evaluation

:::{slide}
:label: cs336-12-014-output-001
:at: 0
- 57 subjects (e.g., math, US history, law, morality), multiple-choice
:::

:::{slide}
:label: cs336-12-014-output-002
:at: 1
- "collected by graduate and undergraduate students from freely available sources online"
:::

:::{slide}
:label: cs336-12-014-output-003
:at: 2
- Despite the name, MMLU is really about testing knowledge, not language understanding
:::

:::{slide}
:label: cs336-12-014-output-004
:at: 3
- Evaluated on GPT-3 using few-shot prompting
:::

:::{slide}
:label: cs336-12-014-output-005
:at: 4
![mmlu.png](../source/images/mmlu.png)
:::


(cs336-12-section-015)=
## Lecture 12: evaluation

:::{slide}
:label: cs336-12-015-output-001
:at: 0
[https://llm-stats.com/benchmarks/mmlu](https://llm-stats.com/benchmarks/mmlu)
:::

:::{slide}
:label: cs336-12-015-output-002
:at: 1
[HELM MMLU for visualizing predictions](https://crfm.stanford.edu/helm/mmlu/latest/)
:::

:::{slide}
:label: cs336-12-015-output-003
:at: 2
**MMLU-Pro** 

[Wang+ 2024](https://arxiv.org/abs/2406.01574)
:::

:::{slide}
:label: cs336-12-015-output-004
:at: 3
- Removed noisy/trivial questions from MMLU
:::

:::{slide}
:label: cs336-12-015-output-005
:at: 4
- Expanded 4 choices to 10 choices
:::


(cs336-12-section-016)=
## Lecture 12: evaluation

:::{slide}
:label: cs336-12-016-output-001
:at: 0
- Evaluated using chain of thought (gives model more of a chance)
:::

:::{slide}
:label: cs336-12-016-output-002
:at: 1
- Accuracy of models drop by 16% to 33% (not as saturated)
:::

:::{slide}
:label: cs336-12-016-output-003
:at: 2
![mmlu-pro.png](../source/images/mmlu-pro.png)
:::

:::{slide}
:label: cs336-12-016-output-004
:at: 3
[https://llm-stats.com/benchmarks/mmlu-pro](https://llm-stats.com/benchmarks/mmlu-pro)
:::

:::{slide}
:label: cs336-12-016-output-005
:at: 4
[HELM MMLU-Pro for visualizing predictions](https://crfm.stanford.edu/helm/capabilities/latest/#/leaderboard/mmlu_pro)
:::


(cs336-12-section-017)=
## Lecture 12: evaluation

:::{slide}
:label: cs336-12-017-output-001
:at: 0
**Graduate-Level Google-Proof Q&A (GPQA)** 

[Rein+ 2023](https://arxiv.org/abs/2311.12022)
:::

:::{slide}
:label: cs336-12-017-output-002
:at: 1
- Questions written by 61 PhD contractors from Upwork
:::

:::{slide}
:label: cs336-12-017-output-003
:at: 2
![gpqa.png](../source/images/gpqa.png)
:::

:::{slide}
:label: cs336-12-017-output-004
:at: 3
- PhD experts achieve 65% accuracy
:::

:::{slide}
:label: cs336-12-017-output-005
:at: 4
- Non-experts achieve 34% over 30 minutes with access to Google
:::


(cs336-12-section-018)=
## Lecture 12: evaluation

:::{slide}
:label: cs336-12-018-output-001
:at: 0
- GPT-4 achieves 39%
:::

:::{slide}
:label: cs336-12-018-output-002
:at: 1
[https://llm-stats.com/benchmarks/gpqa](https://llm-stats.com/benchmarks/gpqa)
:::

:::{slide}
:label: cs336-12-018-output-003
:at: 2
[HELM GPQA for visualizing predictions](https://crfm.stanford.edu/helm/capabilities/latest/#/leaderboard/gpqa)
:::

:::{slide}
:label: cs336-12-018-output-004
:at: 3
**Humanity's Last Exam (HLE)** 

[Phan+ 2025](https://arxiv.org/abs/2501.14249)
:::

:::{slide}
:label: cs336-12-018-output-005
:at: 4
- 2500 questions: multimodal, many subjects, multiple-choice + short-answer
:::


(cs336-12-section-019)=
## Lecture 12: evaluation

:::{slide}
:label: cs336-12-019-output-001
:at: 0
![hle-examples.png](../source/images/hle-examples.png)
:::

:::{slide}
:label: cs336-12-019-output-002
:at: 1
- Awarded $500K prize pool + co-authorship to question creators
:::

:::{slide}
:label: cs336-12-019-output-003
:at: 2
- Filtered by frontier LLMs, multiple stages of review
:::

:::{slide}
:label: cs336-12-019-output-004
:at: 3
![hle-pipeline.png](../source/images/hle-pipeline.png)
:::

:::{slide}
:label: cs336-12-019-output-005
:at: 4
![hle-results.png](../source/images/hle-results.png)
:::


(cs336-12-section-020)=
## Lecture 12: evaluation

:::{slide}
:label: cs336-12-020-output-001
:at: 0
[https://llm-stats.com/benchmarks/hle](https://llm-stats.com/benchmarks/hle)
:::

:::{slide}
:label: cs336-12-020-output-002
:at: 1
Summary:
:::

:::{slide}
:label: cs336-12-020-output-003
:at: 2
- Trend towards harder questions as models improve and saturate existing benchmarks
:::

:::{slide}
:label: cs336-12-020-output-004
:at: 3
- Multiple-choice format can be as difficult as one wants
:::

:::{slide}
:label: cs336-12-020-output-005
:at: 4
- Does not capture real usage (open-ended, doesn't necessarily exist correct answer)
:::


(cs336-12-section-021)=
## Lecture 12: evaluation

:::{slide}
:label: cs336-12-021-output-001
:at: 0
- So far, we've been evaluating on well-defined multiple-choice tasks.
:::

:::{slide}
:label: cs336-12-021-output-002
:at: 1
- Most people don't ask multiple-choice exam questions to their AI assistant.
:::

:::{slide}
:label: cs336-12-021-output-003
:at: 2
Example:
:::

:::{slide}
:label: cs336-12-021-output-004
:at: 3
Prompt: *I would like to make a beet salad with goat cheese. What kind of herbs would work well and what would not work well?*
:::

:::{slide}
:label: cs336-12-021-output-005
:at: 4
Response: *Here’s a breakdown of herbs that work well (and some that don’t) in a beet + goat cheese salad, based on how their flavors interact with the sweet-earthiness of beets and the tangy creaminess of goat cheese...
:::


(cs336-12-section-022)=
## Lecture 12: evaluation

:::{slide}
:label: cs336-12-022-output-001
:at: 0
**Challenge**: how to evaluate an open-ended response?
:::

:::{slide}
:label: cs336-12-022-output-002
:at: 1
**Chatbot Arena** 

[Chiang+ 2024](https://arxiv.org/abs/2403.04132)
:::

:::{slide}
:label: cs336-12-022-output-003
:at: 2
Data collection:
:::

:::{slide}
:label: cs336-12-022-output-004
:at: 3
- Random person from the Internet types in prompt
:::

:::{slide}
:label: cs336-12-022-output-005
:at: 4
- They get response from two random (anonymized) models
:::


(cs336-12-section-023)=
## Lecture 12: evaluation

:::{slide}
:label: cs336-12-023-output-001
:at: 0
- They rate which one is better
:::

:::{slide}
:label: cs336-12-023-output-002
:at: 1
![arena-beets.png](../source/images/arena-beets.png)
:::

:::{slide}
:label: cs336-12-023-output-003
:at: 2
Compute ELO rankings based on pairwise comparisons:
:::

:::{slide}
:label: cs336-12-023-output-004
:at: 3
- Define model: p(A wins against B) = 1 / (1 + 10^((ELO_B - ELO_A)/400))
:::

:::{slide}
:label: cs336-12-023-output-005
:at: 4
- Fit this model to maximize probability of pairwise comparisons
:::


(cs336-12-section-024)=
## Lecture 12: evaluation

:::{slide}
:label: cs336-12-024-output-001
:at: 0
[Arena AI (formerly Chatbot Arena)](https://arena.ai/leaderboard)
:::

:::{slide}
:label: cs336-12-024-output-002
:at: 1
![lmarena-leaderboard.png](../source/images/lmarena-leaderboard.png)
:::

:::{slide}
:label: cs336-12-024-output-003
:at: 2
Properties:
:::

:::{slide}
:label: cs336-12-024-output-004
:at: 3
- Real-world prompts (free for users, incentives to actually use it)
:::

:::{slide}
:label: cs336-12-024-output-005
:at: 4
- But who are these people? biases? spammers?
:::


(cs336-12-section-025)=
## Lecture 12: evaluation

:::{slide}
:label: cs336-12-025-output-001
:at: 0
- Binary preference but conflates style and correctness
:::

:::{slide}
:label: cs336-12-025-output-002
:at: 1
- How does the human even assess correctness?  Prone to sycophancy?
:::

:::{slide}
:label: cs336-12-025-output-003
:at: 2
- Feature: don't need to feed same prompts to all models (important because human is rating)
:::

:::{slide}
:label: cs336-12-025-output-004
:at: 3
- Dynamic: incorporates new prompts and models over time
:::

:::{slide}
:label: cs336-12-025-output-005
:at: 4
**AlpacaEval** (2023)

[leaderboard](https://tatsu-lab.github.io/alpaca_eval/)
:::


(cs336-12-section-026)=
## Lecture 12: evaluation

:::{slide}
:label: cs336-12-026-output-001
:at: 0
- 805 instructions from various sources
:::

:::{slide}
:label: cs336-12-026-output-002
:at: 1
- Metric: win rate against baseline model (GPT-4 preview) as judged by GPT-4 preview (potential bias?)
:::

:::{slide}
:label: cs336-12-026-output-003
:at: 2
- Problem: LLM judges favor longer responses, resulted in leaderboard gaming
:::

:::{slide}
:label: cs336-12-026-output-004
:at: 3
- Alpaca Eval 2.0 used regression to debias the metric 

[Dubois+ 2024](https://arxiv.org/pdf/2404.04475)
:::

:::{slide}
:label: cs336-12-026-output-005
:at: 4
- How do we evaluate the metric?
:::


(cs336-12-section-027)=
## Lecture 12: evaluation

:::{slide}
:label: cs336-12-027-output-001
:at: 0
- Correlation with Chatbot Arena (humans) is high:
:::

:::{slide}
:label: cs336-12-027-output-002
:at: 1
![image-434a1510a7ed21d5355814149a9490c4-https_github_com_tatsu-lab_alpaca_eval_raw_main_figures_chat_correlations_no_ae_png](../assets/cdf035a2b6e1b8e00b236eba.png)
:::

:::{slide}
:label: cs336-12-027-output-003
:at: 2
![alpacaeval-leaderboard.png](../source/images/alpacaeval-leaderboard.png)
:::

:::{slide}
:label: cs336-12-027-output-004
:at: 3
**WildBench** 

[Lin+ 2024](https://arxiv.org/pdf/2406.04770)
:::

:::{slide}
:label: cs336-12-027-output-005
:at: 4
- Sourced 1024 examples from 1M human-chatbot conversations
:::


(cs336-12-section-028)=
## Lecture 12: evaluation

:::{slide}
:label: cs336-12-028-output-001
:at: 0
- Uses GPT-4 turbo as a judge with a checklist (like CoT for judging) + GPT-4 as a judge
:::

:::{slide}
:label: cs336-12-028-output-002
:at: 1
- Well-correlated with Chatbot Arena (seems to be the de facto sanity check)
:::

:::{slide}
:label: cs336-12-028-output-003
:at: 2
![wildbench.png](../source/images/wildbench.png)
:::

:::{slide}
:label: cs336-12-028-output-004
:at: 3
[HELM WildBench for visualizing predictions](https://crfm.stanford.edu/helm/capabilities/latest/#/leaderboard/wildbench)
:::

:::{slide}
:label: cs336-12-028-output-005
:at: 4
Summary:
:::


(cs336-12-section-029)=
## Lecture 12: evaluation

:::{slide}
:label: cs336-12-029-output-001
:at: 0
- Challenge: how to evaluate open-ended responses?
:::

:::{slide}
:label: cs336-12-029-output-002
:at: 1
- Pairwise comparisons between similar responses provide higher signal
:::

:::{slide}
:label: cs336-12-029-output-003
:at: 2
- Beware of biases (both from humans and LLM judges)
:::

:::{slide}
:label: cs336-12-029-output-004
:at: 3
- Checklist/rubric improves reliability (regardless of human or LLM judge)
:::

:::{slide}
:label: cs336-12-029-output-005
:at: 4
Previously: evaluate what LMs say (chat)
:::


(cs336-12-section-030)=
## Lecture 12: evaluation

:::{slide}
:label: cs336-12-030-output-001
:at: 0
Now: evaluate what LMs do (agents)
:::

:::{slide}
:label: cs336-12-030-output-002
:at: 1
Agent = language model + agent scaffold (logic for deciding how to use the LM)
:::

:::{slide}
:label: cs336-12-030-output-003
:at: 2
Consider tasks that require tool use (e.g., running code) and iterating over a period of time
:::

:::{slide}
:label: cs336-12-030-output-004
:at: 3
**SWEBench** 

[Jimenez+ 2023](https://arxiv.org/abs/2310.06770)
:::

:::{slide}
:label: cs336-12-030-output-005
:at: 4
- 2294 tasks across 12 Python repositories
:::


(cs336-12-section-031)=
## Lecture 12: evaluation

:::{slide}
:label: cs336-12-031-output-001
:at: 0
- Given codebase + issue description, submit a PR
:::

:::{slide}
:label: cs336-12-031-output-002
:at: 1
- Evaluation metric: unit tests
:::

:::{slide}
:label: cs336-12-031-output-003
:at: 2
![swebench.png](../source/images/swebench.png)
:::

:::{slide}
:label: cs336-12-031-output-004
:at: 3
[https://llm-stats.com/benchmarks/swe-bench-verified](https://llm-stats.com/benchmarks/swe-bench-verified)
:::

:::{slide}
:label: cs336-12-031-output-005
:at: 4
**TerminalBench** 

[Merrill+ 2026](https://arxiv.org/abs/2601.11868)

[website](https://www.tbench.ai/)
:::


(cs336-12-section-032)=
## Lecture 12: evaluation

:::{slide}
:label: cs336-12-032-output-001
:at: 0
![terminal-bench.png](../source/images/terminal-bench.png)
:::

:::{slide}
:label: cs336-12-032-output-002
:at: 1
- Computer terminal environments: simple and universal
:::

:::{slide}
:label: cs336-12-032-output-003
:at: 2
- 229 tasks crowdsourced from 93 contributors, 89 tasks constitute Terminal-Bench 2.0
:::

:::{slide}
:label: cs336-12-032-output-004
:at: 3
![terminal-bench-human-time.png](../source/images/terminal-bench-human-time.png)
:::

:::{slide}
:label: cs336-12-032-output-005
:at: 4
![terminal-bench-results.png](../source/images/terminal-bench-results.png)
:::


(cs336-12-section-033)=
## Lecture 12: evaluation

:::{slide}
:label: cs336-12-033-output-001
:at: 0
[https://llm-stats.com/benchmarks/terminal-bench](https://llm-stats.com/benchmarks/terminal-bench)
:::

:::{slide}
:label: cs336-12-033-output-002
:at: 1
**CyBench** 

[Zhang+ 2024](https://arxiv.org/abs/2408.08926)
:::

:::{slide}
:label: cs336-12-033-output-003
:at: 2
![cybench.png](../source/images/cybench.png)
:::

:::{slide}
:label: cs336-12-033-output-004
:at: 3
- 40 Capture the Flag (CTF) tasks
:::

:::{slide}
:label: cs336-12-033-output-005
:at: 4
- Use first-solve time as a measure of difficulty
:::


(cs336-12-section-034)=
## Lecture 12: evaluation

:::{slide}
:label: cs336-12-034-output-001
:at: 0
![cybench-agent.png](../source/images/cybench-agent.png)
:::

:::{slide}
:label: cs336-12-034-output-002
:at: 1
![cybench-results.png](../source/images/cybench-results.png)
:::

:::{slide}
:label: cs336-12-034-output-003
:at: 2
[https://llm-stats.com/benchmarks/cybench](https://llm-stats.com/benchmarks/cybench)
:::

:::{slide}
:label: cs336-12-034-output-004
:at: 3
**MLEBench** 

[Chan+ 2024](https://arxiv.org/abs/2410.07095)
:::

:::{slide}
:label: cs336-12-034-output-005
:at: 4
- 75 Kaggle competitions (require training models, processing data, etc.)
:::


(cs336-12-section-035)=
## Lecture 12: evaluation

:::{slide}
:label: cs336-12-035-output-001
:at: 0
![mlebench.png](../source/images/mlebench.png)
:::

:::{slide}
:label: cs336-12-035-output-002
:at: 1
![mlebench-results.png](../source/images/mlebench-results.png)
:::

:::{slide}
:label: cs336-12-035-output-003
:at: 2
Agent scaffolds 

[post](https://www.philschmid.de/agents-2.0-deep-agents)
:::

:::{slide}
:label: cs336-12-035-output-004
:at: 3
![image-155d1eb10710df090449bf401822dd7e-https_www_philschmid_de_static_blog_agents-2_0-deep-agents_overview_png](../assets/bce9746e55531159b07c4507.png)
:::

:::{slide}
:label: cs336-12-035-output-005
:at: 4
- Explicit planning: keep a todo list that gets checked off
:::


(cs336-12-section-036)=
## Lecture 12: evaluation

:::{slide}
:label: cs336-12-036-output-001
:at: 0
- Hierarchical delegation: agents calling other sub-agents (clean context)
:::

:::{slide}
:label: cs336-12-036-output-002
:at: 1
- Persistent memory: read/write files
:::

:::{slide}
:label: cs336-12-036-output-003
:at: 2
- Extreme context engineering: explicit more instructions on process
:::

:::{slide}
:label: cs336-12-036-output-004
:at: 3
Summary:
:::

:::{slide}
:label: cs336-12-036-output-005
:at: 4
- Agents dramatically enhance the capability surface of language models
:::


(cs336-12-section-037)=
## Lecture 12: evaluation

:::{slide}
:label: cs336-12-037-output-001
:at: 0
- Agent scaffolds are very important
:::

:::{slide}
:label: cs336-12-037-output-002
:at: 1
- Evaluating agents = evaluating agent scaffold + language model
:::

:::{slide}
:label: cs336-12-037-output-003
:at: 2
- All of the tasks so far require linguistic and world knowledge.
:::

:::{slide}
:label: cs336-12-037-output-004
:at: 3
- Can we isolate **reasoning** from knowledge?
:::

:::{slide}
:label: cs336-12-037-output-005
:at: 4
- Arguably, reasoning captures a more pure form of intelligence (isn't just about memorizing facts).
:::


(cs336-12-section-038)=
## Lecture 12: evaluation

:::{slide}
:label: cs336-12-038-output-001
:at: 0
**ARC-AGI** 

[website](https://arcprize.org/arc-agi)
:::

:::{slide}
:label: cs336-12-038-output-002
:at: 1
- 100\% solvable by humans, but challenging for AI
:::

:::{slide}
:label: cs336-12-038-output-003
:at: 2
- Each task is unique, so memorization doesn't help.
:::

:::{slide}
:label: cs336-12-038-output-004
:at: 3
- ARC-AGI-1 (2019): first iteration
:::

:::{slide}
:label: cs336-12-038-output-005
:at: 4
![image-d1a33e9159cfdb77197551bbbecc6a76-https_arcprize_org_media_images_arc-task-grids_jpg](../assets/ca91237aa14d52a9b8b2b2ec.jpg)
:::


(cs336-12-section-039)=
## Lecture 12: evaluation

:::{slide}
:label: cs336-12-039-output-001
:at: 0
- ARC-AGI-2 (March 2025): more multi-step reasoning
:::

:::{slide}
:label: cs336-12-039-output-002
:at: 1
![image-a0338c9fb72d1163cfc8ac66fea4e4ed-https_arcprize_org_media_images_blog_arc-agi-2-unsolved-1_png](../assets/6f5c24072e35c5b7fd89463d.png)
:::

:::{slide}
:label: cs336-12-039-output-003
:at: 2
![arc-agi-results.png](../source/images/arc-agi-results.png)
:::

:::{slide}
:label: cs336-12-039-output-004
:at: 3
- Pretrained language models didn't move the needle
:::

:::{slide}
:label: cs336-12-039-output-005
:at: 4
- Reasoning models (o1, o3) started making things take off
:::


(cs336-12-section-040)=
## Lecture 12: evaluation

:::{slide}
:label: cs336-12-040-output-001
:at: 0
- ARC-AGI-3 (March 2026): interactive environments 

[post](https://arcprize.org/media/ARC_AGI_3_Technical_Report.pdf)
:::

:::{slide}
:label: cs336-12-040-output-002
:at: 1
![arc-agi-3.png](../source/images/arc-agi-3.png)
:::

:::{slide}
:label: cs336-12-040-output-003
:at: 2
![arc-agi-3-results.png](../source/images/arc-agi-3-results.png)
:::

:::{slide}
:label: cs336-12-040-output-004
:at: 3
Summary:
:::

:::{slide}
:label: cs336-12-040-output-005
:at: 4
- Goal is to disentangle reasoning from knowledge (difficult to do!)
:::


(cs336-12-section-041)=
## Lecture 12: evaluation

:::{slide}
:label: cs336-12-041-output-001
:at: 0
- Constrained to human reasoning (not superhuman reasoning)
:::

:::{slide}
:label: cs336-12-041-output-002
:at: 1
- Clearly exposes gaps in current models
:::

:::{slide}
:label: cs336-12-041-output-003
:at: 2
![image-a375cd28c372458baf4135c081a1ce8b-https_www_team-bhp_com_forum_attachments_road-safety_2173645d1625144681-will-crash-test-rating-change-if-higher-variant-chosen-images-30_jpeg](../assets/cba1ee57314e3b7c90b0859f.jpg)
:::

:::{slide}
:label: cs336-12-041-output-004
:at: 3
What does safety mean for AI?
:::

:::{slide}
:label: cs336-12-041-output-005
:at: 4
**HarmBench** 

[Mazeika+ 2024](https://arxiv.org/abs/2402.04249)
:::


(cs336-12-section-042)=
## Lecture 12: evaluation

:::{slide}
:label: cs336-12-042-output-001
:at: 0
- Based on 510 harmful behaviors that violate laws or norms
:::

:::{slide}
:label: cs336-12-042-output-002
:at: 1
[HarmBench on HELM](https://crfm.stanford.edu/helm/safety/latest/#/leaderboard/harm_bench)
:::

:::{slide}
:label: cs336-12-042-output-003
:at: 2
[Example of safety failure](https://crfm.stanford.edu/helm/safety/latest/#/runs/harm_bench:model=anthropic_claude-3-7-sonnet-20250219?instancesPage=4)
:::

:::{slide}
:label: cs336-12-042-output-004
:at: 3
**AIR-Bench** 

[Zeng+ 2024](https://arxiv.org/abs/2407.17436)
:::

:::{slide}
:label: cs336-12-042-output-005
:at: 4
- Based on regulatory frameworks and company policies
:::


(cs336-12-section-043)=
## Lecture 12: evaluation

:::{slide}
:label: cs336-12-043-output-001
:at: 0
- Taxonomized into 314 risk categories, 5694 prompts
:::

:::{slide}
:label: cs336-12-043-output-002
:at: 1
![image-5993188f3fa9dc78b85f9866fcee27ac-https_crfm_stanford_edu_helm_assets_air-overview-DpBbyagA_png](../assets/d2e6c49f82744f9d7e8f1ec8.png)
:::

:::{slide}
:label: cs336-12-043-output-003
:at: 2
[HELM AIR-Bench](https://crfm.stanford.edu/helm/air-bench/latest/#/leaderboard)
:::

:::{slide}
:label: cs336-12-043-output-004
:at: 3
Jailbreaking:
:::

:::{slide}
:label: cs336-12-043-output-005
:at: 4
- Language models are trained to refuse harmful instructions
:::


(cs336-12-section-044)=
## Lecture 12: evaluation

:::{slide}
:label: cs336-12-044-output-001
:at: 0
- Greedy Coordinate Gradient (GCG) automatically optimizes prompts to bypass safety 

[Zou+ 2023](https://arxiv.org/pdf/2307.15043)
:::

:::{slide}
:label: cs336-12-044-output-002
:at: 1
- Transfers from open-weight models (Llama) to closed models (GPT-4)
:::

:::{slide}
:label: cs336-12-044-output-003
:at: 2
![gcg-examples.png](../source/images/gcg-examples.png)
:::

:::{slide}
:label: cs336-12-044-output-004
:at: 3
What is safety?
:::

:::{slide}
:label: cs336-12-044-output-005
:at: 4
- Many aspects of safety are strongly contextual (politics, law, social norms - which vary across countries)
:::


(cs336-12-section-045)=
## Lecture 12: evaluation

:::{slide}
:label: cs336-12-045-output-001
:at: 0
- Many risks are quite varied (hallucinations, sycophancy, abetting crimes, inequality, losing critical thinking)
:::

:::{slide}
:label: cs336-12-045-output-002
:at: 1
**Dual-use**: capable cybersecurity agents (Mythos) can be used to hack into a system or to do penetration testing
:::

:::{slide}
:label: cs336-12-045-output-003
:at: 2
**Ecological validity**: how well does an evaluation capture real-world use?
:::

:::{slide}
:label: cs336-12-045-output-004
:at: 3
- Exam benchmarks (e.g., GPQA) are far away from real-world use.
:::

:::{slide}
:label: cs336-12-045-output-005
:at: 4
- Chatbot Arena prompts are from real people, but distribution is uncontrolled.
:::


(cs336-12-section-046)=
## Lecture 12: evaluation

:::{slide}
:label: cs336-12-046-output-001
:at: 0
**GDPVal** (OpenAI) 

[Patwardhan+ 2025](https://arxiv.org/pdf/2510.04374)
:::

:::{slide}
:label: cs336-12-046-output-002
:at: 1
- 44 occupations from top 9 sectors according to US GDP
:::

:::{slide}
:label: cs336-12-046-output-003
:at: 2
- Tasks come from professionals with ~14 years of experience
:::

:::{slide}
:label: cs336-12-046-output-004
:at: 3
![gdpval.png](../source/images/gdpval.png)
:::

:::{slide}
:label: cs336-12-046-output-005
:at: 4
**MedHELM** 

[Bedi+ 2025](https://arxiv.org/abs/2505.23802)
:::


(cs336-12-section-047)=
## Lecture 12: evaluation

:::{slide}
:label: cs336-12-047-output-001
:at: 0
- Previous medical benchmarks were based on standardized exams
:::

:::{slide}
:label: cs336-12-047-output-002
:at: 1
- 121 clinical tasks sourced from 29 clinicians, mixture of private and public datasets
:::

:::{slide}
:label: cs336-12-047-output-003
:at: 2
![image-93ff2615b50418e8fd4dd6f6435bdff1-https_crfm_stanford_edu_helm_assets_medhelm-overview-CND0EIsy_png](../assets/eac29843bf5c374efe714b27.png)
:::

:::{slide}
:label: cs336-12-047-output-004
:at: 3
[MedHELM](https://crfm.stanford.edu/helm/medhelm/latest/#/leaderboard)
:::

:::{slide}
:label: cs336-12-047-output-005
:at: 4
**Clio** (Anthropic) 

[Tamkin+ 2024](https://arxiv.org/abs/2412.13678)
:::


(cs336-12-section-048)=
## Lecture 12: evaluation

:::{slide}
:label: cs336-12-048-output-001
:at: 0
- Use language models to analyze real user data
:::

:::{slide}
:label: cs336-12-048-output-002
:at: 1
- Share general patterns of what people are asking
:::

:::{slide}
:label: cs336-12-048-output-003
:at: 2
![clio-table4.png](../source/images/clio-table4.png)
:::

:::{slide}
:label: cs336-12-048-output-004
:at: 3
Unfortunately, realism and privacy are sometimes at odds with each other.
:::

:::{slide}
:label: cs336-12-048-output-005
:at: 4
How do we know our evaluations are valid?
:::


(cs336-12-section-049)=
## Train-test overlap

:::{slide}
:label: cs336-12-049-output-001
:at: 0
- Machine learning 101: don't train on your test set
:::

:::{slide}
:label: cs336-12-049-output-002
:at: 1
- Pre-foundation models (ImageNet, SQuAD): well-defined train-test splits
:::

:::{slide}
:label: cs336-12-049-output-003
:at: 2
- Today: train on the Internet and don't tell people about your data
:::

:::{slide}
:label: cs336-12-049-output-004
:at: 3
Route 1: try to infer train-test overlap from model
:::


(cs336-12-section-050)=
## Train-test overlap

:::{slide}
:label: cs336-12-050-output-001
:at: 0
- Exploit exchangeability of data points 

[Oren+ 2023](https://arxiv.org/pdf/2310.17623)
:::

:::{slide}
:label: cs336-12-050-output-002
:at: 1
![contamination-exchangeability.png](../source/images/contamination-exchangeability.png)
:::

:::{slide}
:label: cs336-12-050-output-003
:at: 2
Route 2: encourage reporting norms (e.g., people report confidence intervals)
:::

:::{slide}
:label: cs336-12-050-output-004
:at: 3
- Model providers should report train-test overlap 

[Zhang+ 2024](https://arxiv.org/abs/2410.08385)
:::

:::{slide}
:label: cs336-12-050-output-005
:at: 4
Route 3: use fresh evals
:::


(cs336-12-section-051)=
## Train-test overlap

:::{slide}
:label: cs336-12-051-output-001
:at: 0
- LiveCodeBench, UncheatableEval: scrape new webpages
:::

:::{slide}
:label: cs336-12-051-output-002
:at: 1
- Timestamps aren't always safe due to copying either
:::

:::{slide}
:label: cs336-12-051-output-003
:at: 2
Route 4: use private evals
:::

:::{slide}
:label: cs336-12-051-output-004
:at: 3
- Companies use internal code bases that aren't on the Internet
:::

:::{slide}
:label: cs336-12-051-output-005
:at: 4
- Use your personal writings
:::


(cs336-12-section-052)=
## Train-test overlap

:::{slide}
:label: cs336-12-052-output-001
:at: 0
- Easiest for perplexity
:::


(cs336-12-section-053)=
## Dataset quality

:::{slide}
:label: cs336-12-053-output-001
:at: 0
- Fixed up SWE-Bench to produce SWE-Bench Verified 

[post](https://openai.com/index/introducing-swe-bench-verified/)
:::

:::{slide}
:label: cs336-12-053-output-002
:at: 1
- Create Platinum versions of benchmarks 

[Vendrow+ 2025](https://arxiv.org/abs/2502.03461)
:::

:::{slide}
:label: cs336-12-053-output-003
:at: 2
![image-a1149b095a48ea306dcdea342363230c-https_pbs_twimg_com_media_GjICXQlWkAAYnDS_format_jpg_name_4096x4096](../assets/087f0e275e274a4e97b85b25.jpg)
:::

:::{slide}
:label: cs336-12-053-output-004
:at: 3
![image-306ae3f862cee7c7842c0b29af3a2f5c-https_pbs_twimg_com_media_GjICcGQXYAAM4o1_format_jpg_name_4096x4096](../assets/7139a2cb71a481942278ebda.jpg)
:::


(cs336-12-section-054)=
## Dataset quality

:::{slide}
:label: cs336-12-054-output-001
:at: 0
- Problems with agentic benchmarks: insufficient test cases, trivial agent can solve task 

[Zhu+ 2025](https://arxiv.org/abs/2507.02825)
:::

:::{slide}
:label: cs336-12-054-output-002
:at: 1
- Docent: use LLM to inspect agent traces to detect problems 

[post](https://transluce.org/introducing-docent)
:::


(cs336-12-section-055)=
## What's the point of evaluation?

:::{slide}
:label: cs336-12-055-output-001
:at: 0
There is no one true evaluation; it depends on what question you're trying to answer.
:::

:::{slide}
:label: cs336-12-055-output-002
:at: 1
1. User or company wants to make a purchase decision (model A or model B) for their use case (e.g., customer service chatbots).
:::

:::{slide}
:label: cs336-12-055-output-003
:at: 2
2. Researchers want to measure the raw capabilities of a model (e.g., intelligence).
:::

:::{slide}
:label: cs336-12-055-output-004
:at: 3
3. We want to understand the benefits + harms of a model (for business and policy reasons).
:::


(cs336-12-section-056)=
## What's the point of evaluation?

:::{slide}
:label: cs336-12-056-output-001
:at: 0
4. Model developers want to get feedback to improve the model.
:::


(cs336-12-section-057)=
## What are we evaluating?

:::{slide}
:label: cs336-12-057-output-001
:at: 0
- Pre-foundation models, we evaluated **methods** (standardized train-test splits).
:::

:::{slide}
:label: cs336-12-057-output-002
:at: 1
- Today, we're (mostly) evaluating **models/systems** (anything goes).
:::

:::{slide}
:label: cs336-12-057-output-003
:at: 2
There are some exceptions...
:::

:::{slide}
:label: cs336-12-057-output-004
:at: 3
- nanogpt speedrun: fixed data, compute time to get to a particular validation loss
:::


(cs336-12-section-058)=
## What are we evaluating?

:::{slide}
:label: cs336-12-058-output-001
:at: 0
![karpathy-nanogpt-speedrun.png](../source/images/karpathy-nanogpt-speedrun.png)

[post](https://x.com/karpathy/status/1846790537262571739)
:::

:::{slide}
:label: cs336-12-058-output-002
:at: 1
Evaluating methods encourage algorithmic innovation from researchers.
:::

:::{slide}
:label: cs336-12-058-output-003
:at: 2
Evaluating models/systems is useful for downstream users.
:::

:::{slide}
:label: cs336-12-058-output-004
:at: 3
Either way, we need to define the rules of the game!
:::

:::{slide}
:label: cs336-12-058-output-005
:at: 4
Takeaways:
:::


(cs336-12-section-059)=
## What are we evaluating?

:::{slide}
:label: cs336-12-059-output-001
:at: 0
- There is no one true evaluation; choose the evaluation depending on what you're trying to measure.
:::

:::{slide}
:label: cs336-12-059-output-002
:at: 1
- Clearly state the rules of the game (methods versus models versus agents).
:::

:::{slide}
:label: cs336-12-059-output-003
:at: 2
- Considerations: difficulty, realism, validity.
:::

