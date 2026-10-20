---
title: "CS336 Lecture 15: After pretraining: mid-training and post-training"
lang: en
plugins:
  - '@lincyaw/slidev-addon-core'
  - '@lincyaw/slidev-addon-content'
renderers:
  web: {}
  notebook: {}
---

(cs336-15-cover)=
# Lecture 15: After pretraining: mid-training and post-training

Stanford CS336 · Language Modeling from Scratch · Spring 2026.


(cs336-15-page-001)=

## Lecture 15

“A FT E R PR E T RA INI NG ” ( MI D / PO ST T R AI NIN G )

CS336



![](figures/lecture_15.pdf-0-0.png)

(cs336-15-page-002)=

## The class thus far

We’ve now covered pre-training, which gets you to GPT3.. But how do we get to instructGPT?



![](figures/lecture_15.pdf-1-0.png)

![](figures/lecture_15.pdf-1-1.png)

![](figures/lecture_15.pdf-1-2.png)

![](figures/lecture_15.pdf-1-3.png)

(cs336-15-page-003)=

## Instruction following is a remarkable form of control

![](figures/lecture_15.pdf-2-0.png)

Text example from [Bubeck et al 2023]

(cs336-15-page-004)=

## Goal today: enable better, tighter controls over LM output

Pretraining data isn’t quite what we want (but it scales)..

Can we collect data of behaviors we do want and train the LM?


1. What does that data look like?

2. How do we best make use of that data?

3. Do we need scale for this?

(cs336-15-page-005)=

## Caveat: post-training information is pretty sparse!

**Rich information from the pre-chatgpt competition**

Stiennon 2020 (RLHF paper) – contains annotation guidelines, etc

Bai 2022 (Anthropic HH) – details on how to set up safety annotation, etc


**Poor information in modern times..**

Open source: lots of distillation, not too public in open-source release notes

Closed source: ‘secret sauce’ for data.



![](figures/lecture_15.pdf-4-0.png)

(cs336-15-page-006)=

## Where today’s lecture fits in

Standard approach – imitation (SFT) followed by reinforcement (‘RL’ HF)

![](figures/lecture_15.pdf-5-0.png)


**Part 1** : the ‘supervised finetuning’ part [Ouyang 2022]

(cs336-15-page-007)=

## What are the ingredients in SFT?

**The training data**

![](figures/lecture_15.pdf-6-0.png)


The **method**



![](figures/lecture_15.pdf-6-1.png)

![](figures/lecture_15.pdf-6-2.png)

(cs336-15-page-008)=

## Training data

We’ve already seen some of the major types of instruction data..


Let’s talk about two more details about instruction tuning datasets


1. What’s actually inside these datasets?


2. What matters in building ‘high performance’ instruction tuning data?

(cs336-15-page-009)=

## Progression of SFT data (in the open world)

![](figures/lecture_15.pdf-8-0.png)

![](figures/lecture_15.pdf-8-1.png)

![](figures/lecture_15.pdf-8-2.png)

![](figures/lecture_15.pdf-8-3.png)

**FLAN** **Self-instruct** **Alpaca** **ShareGPT/Vicuna**

![](figures/lecture_15.pdf-8-4.png)

![](figures/lecture_15.pdf-8-5.png)

![](figures/lecture_15.pdf-8-6.png)

![](figures/lecture_15.pdf-8-7.png)


**Open Assistant** **WizardLM** **Tulu3** **Nemotron**

**Tool use etc.**

(cs336-15-page-010)=

## FLAN – random examples

Stephanie - Can you finalize the attached and have it signed. I need to initial it, but it needs to be signed by
Ronald Chisholm LOI
Brad Richter. Thanks. Write a subject line for this email.



Ahold to Sell Spain Operations to Permira (AP) AP - The Dutch supermarket retailer Ahold, seeking to streamline
global operations and reduce debt, said Sunday it will sell its holdings in Spain to Permira Funds for about
#36;849 million. What is this text about? OPTIONS: - World - Sports - Business - Science/Tech


Write highlights for this article: Sauntering down leafy avenues past typical Dutch step-gabled buildings, carpets of crocuses, the
occasional cyclist whooshing quietly by and the sun bouncing off the canal, I can think of few more pleasant places to spend a spring
weekend than The Hague. […]The most prized Dutch colony was apparently run from The Hague (aka 'the Widow of Indonesia'). For
summer: the excellent Grapes & Olives and the Café de Bieb on Veenkade will have boats on a newly renovated bit of canal, with
music and boat trips planned, including a tour at the Kompaan brewery (I can vouch for the product). My art gorging finishes at the
Panorama, an extraordinary, 14 ft-high circular panorama of The Hague's seaside resort, Scheveningen, painted by Hendrik Mesdag. I
take a 15-minute tram to the place itself and gorge on scallops and sole at Catch by Simonis on the harbour front. The Hague has
netted a new fan. British Airways (0844 493 0787, www.ba.com) flies to Rotterdam Den Haag (half-hour taxi) from £100 return. For
tours with Remco Dörr, email remco.dorr@hotmail.com. Double rooms at the Carlton Ambassador (00 31 70 363 0363,
www.carlton.nl/ambassador) cost from £84, room only. More information on travel in The Netherlands at www.holland.com.


Here is some data about a restaurant: name = Aromi, eatType = coffee shop, food = English,
customer rating = 5 out of 5, area = city centre. Write a sentence that includes the following data
about a restaurant



Business


The least known of the Dutch

cities, The Hague was a village
until 1806. It owes its growth to
Louis Bonaparte, Napoleon's
brother, who ruled here. The
city has a wealth of art,
including Vermeer's 'Girl With A
Pearl Earring'


In the city centre there is a
coffee shop with a
customer rating of 5 out of
5 called Aromi which serves
English food.

(cs336-15-page-011)=

## Alpaca – random examples

Give three tips for staying healthy.


What does “algorithm” mean?


Find the average number in a list.



1.Eat a balanced diet and make sure to include plenty of fruits and
vegetables. 2. Exercise regularly to keep your body active and strong. 3.
Get enough sleep and maintain a consistent sleep schedule.


An algorithm is a step-by-step set of instructions used to solve a problem
or achieve a goal. It is a process of breaking down complex tasks into
smaller, more manageable steps. Algorithms can be used to find the
shortest path from one place to another, sort data, or render data from an
immense database in a few seconds.


def avg_list(nums): total = 0 for n in nums: total += n return total /
len(nums) print(avg_list([4, 3, 6, 10, 8])) # Output 6.4

(cs336-15-page-012)=

## O enAssistant – random exam les** **p p



Can you write a short introduction about the relevance of the term
"monopsony" in economics? Please use examples related to
potential monopsonies in the labour market and cite relevant
research.


My kid needs to do a science project for elementary school, what
are some cheap but fun projects to do?



"Monopsony" refers to a market structure where there is only one buyer for
a particular good or service. In economics, this term is particularly relevant
in the labor market, where a monopsony employer has significant power
over the wages and working conditions of their employees. […]. Overall, the
concept of monopsony is essential to understanding the dynamics of labor
markets and the impact of market power on workers. Further research is
needed to understand the extent and impact of monopsonies on the
economy and to develop policies to address this issue. References: Bivens,
J., & Mishel, L. (2013). The Pay of Corporate Executives and Financial
Professionals as Evidence of Rents in Top 1 Percent Incomes. Journal of
Economic Perspectives, 27(3), 57-78.


There are many cheap and fun science projects that elementary school kids
can do! Here are a few ideas: 1. Make a homemade lava lamp: Fill a clear
plastic bottle with water and vegetable oil, add a few drops of food coloring,
and then drop in an Alka-Seltzer tablet. The reaction will cause bubbles to
rise and fall like a lava lamp. […]7. Create a solar oven: Using a pizza box,
aluminum foil, and plastic wrap, create a solar oven that can cook s'mores
or other small snacks. 8. Explore magnets: Using magnets and a variety of
objects, have your child experiment with magnetism to see what objects are
attracted to magnets and which ones are not. These are just a few ideas to
get you started! There are many more cheap and fun science projects that
your child can do with household items and a little creativity.

(cs336-15-page-013)=

## Nemotron-SFT-O enCode-v1** **p



What are the key differences between using `async/await` and
`.then()` for handling promises in JavaScript, and when should I
prefer one approach over the other in terms of readability and
error handling?


I'm building a simple calculator app and need to decide between
using integers or floating-point numbers for all calculations. What
are the trade-offs of each approach, and which would you
recommend for a beginner-friendly calculator that handles basic
arithmetic operations?



{"role": "assistant", "content": "I'll analyze the key differences between
`async/await` and `.then()` for handling promises in JavaScript based
on the provided AGENTS.md instructions.", "tool_calls": [ { "id":
"call_132a55728f6c498fbeac3b95", "type": "function", "function": {
"name": "skill", "arguments": "{\"name\":\"bash-skills\"}" } } ]}


"role": "assistant",
"content": "I'll help you decide between integers and floating-point
numbers for your calculator app. Let me analyze the trade-offs and provide
a recommendation based on the requirements in AGENTS.md.",
"tool_calls": [{"id": "call_b06182c280514fc7bd1d3ae4","type": "function",
"function": {"name": "todowrite","arguments":
"{\"todos\":[{\"content\":\"Review the AGENTS.md file for calculator data
typerequirements\",\"id\":\"1\",\"priority\":\"high\",\"status\":\"in_progres
s\"},{\"content\":\"Analyze trade-offs between integers and floating-point
numbers\",\"id\":\"2\",\"priority\":\"high\",\"status\":\"pending\"},{\"conte
nt\":\"Check available skills for relevant
guidance\",\"id\":\"3\",\"priority\":\"medium\",\"status\":\"pending\"},{\"c
ontent\":\"Provide recommendation for beginner-friendly
calculator\",\"id\":\"4\",\"priority\":\"high\",\"status\":\"pending\"}]}"}}]

(cs336-15-page-014)=

## What’s varying across these?

**“Chattiness” –** FLAN is (usually) valid data, but people don’t want to talk to a NLP

benchmark. Later datasets move towards longer, more detailed responses


**Detail** – OASST goes into much more detail about various factual pieces of knowledge.

As we will see, this can be both a pro and a con.


**Tool use** – SFT in the last year or two has also been shifting much more towards

tool/use, agentic downstream applications.

(cs336-15-page-015)=

## What did we notice across the datasets?** These datasets vary in many ways…


**Length and bullet points** (style variations)


**References, other complex knowledge**


Less visible, but important aspects..

**Scale**

**Safety**

How do these factors affect the model?

(cs336-15-page-016)=

## Style variations in data and models

Models vary _a lot_ in response length..



![](figures/lecture_15.pdf-15-0.png)
[Wang+ 2023]

(cs336-15-page-017)=

## When evaluating by preferences, style matters.

We see very strong length effects (in both humans and GPT-based evaluations)

[Dubois+ 2023]



![](figures/lecture_15.pdf-16-0.png)

![](figures/lecture_15.pdf-16-1.png)

![](figures/lecture_15.pdf-16-2.png)

(cs336-15-page-018)=

## What about benchmarks?

These factors are (mostly) not that relevant for other benchmark perfs



![](figures/lecture_15.pdf-17-0.png)

(cs336-15-page-019)=

## References, complex knowledge, and factuality

Consider this example from open assistant:



Can you write a short introduction about the relevance of the term
"monopsony" in economics? Please use examples related to
potential monopsonies in the labour market and cite relevant
research.



"Monopsony" refers to a market structure where there is only one buyer for
a particular good or service. In economics, this term is particularly relevant
in the labor market, where a monopsony employer has significant power
over the wages and working conditions of their employees. […]. Overall, the
concept of monopsony is essential to understanding the dynamics of labor
markets and the impact of market power on workers. Further research is
needed to understand the extent and impact of monopsonies on the
economy and to develop policies to address this issue. **References: Bivens,**
**J., & Mishel, L. (2013). The Pay of Corporate Executives and Financial**
**Professionals as Evidence of Rents in Top 1 Percent Incomes. Journal of**
**Economic Perspectives, 27(3), 57-78.**



What is this example teaching the model?

1. Teaching the model about Bivens J & Mishel, L

2. Teaching the model to output citations when asked to do so

(But by what mechanism? Does the model know about cites?)

(cs336-15-page-020)=

## Knowledge extraction and alignment

**Folklore** : Fine-tuning a model on ‘facts it doesn’t know’ makes it hallucinate

![](figures/lecture_15.pdf-19-1.png)


[Gekhman 2023]

![](figures/lecture_15.pdf-19-0.png)

[Schulman 2023]

(cs336-15-page-021)=

## Takeaways on knowledge extraction and alignment

1. You may not want to fine-tune on tail knowledge, even that’s the LM use case


2. In principle, ‘RL’ style correctness feedback could help


3. Knowledge storage and extraction in LMs is messy, and nuanced.

(cs336-15-page-022)=

## Safety

LMs are widely deployed to end-users, and need some safety controls

Misinformation Scams and spam

![](figures/lecture_15.pdf-21-0.png)

![](figures/lecture_15.pdf-21-1.png)


[Goldstein+ 2023] [Kang+ 2023]

(cs336-15-page-023)=

## Safety SFT in the wild

Details are pretty sparse



![](figures/lecture_15.pdf-22-0.png)

Examples? ~ few thousand in Llama 2

(cs336-15-page-024)=

## Pipeline with most details



![](figures/lecture_15.pdf-23-0.png)

![](figures/lecture_15.pdf-23-1.png)

(cs336-15-page-025)=

## Main safety approach – extract scenarios from users



![](figures/lecture_15.pdf-24-0.png)

![](figures/lecture_15.pdf-24-1.png)

![](figures/lecture_15.pdf-24-2.png)

(cs336-15-page-026)=

## Safety-tuning with just a little data

Significant improvements to safety with ~500 samples.

![](figures/lecture_15.pdf-25-0.png)


Adding 500 Alpaca-style examples makes models follow safety guidelines

(cs336-15-page-027)=

## Putting it together – SFT Data

1. Instruction fine-tuning (SFT) works works best when we are just extracting pretraining behaviors, not adding new ones


2. Adding (factually correct!) data can sometimes hurt


3. Small amounts of the right kinds of behavior (safety, instruction-following, style)
make a big difference, but there is a long-tail that benefits from more data

(cs336-15-page-028)=

## How to fine-tune

Just do gradient descent..

![](figures/lecture_15.pdf-27-0.png)


In many academic settings – this is basically it. **But what if..**


You have tons of compute and data, you want to scale up instruction tuning

(cs336-15-page-029)=

## Turning instruction tuning into pretraining

Can we somehow turn instruction tuning data into pretraining data?


The following (increasingly popular) idea says yes:


1. Pre-train on web/pretraining data

2. Mix in instruction-tuning data into pre-training

3. Do an actual (but short) instruction-tuning round.


Lets you scale up instruction tuning w/o catastrophic forgetting

(cs336-15-page-030)=

## ‘Midtraining’ / ‘Two-phase training’

The recipe is common knowledge among many LLM companies (but not documented)

![](figures/lecture_15.pdf-29-0.png)

Widely used by most models today.. Publicized in recent Chinese-derived LMs (miniCPM, jetMoE)

(cs336-15-page-031)=

## The second part of RLHF

Standard approach – imitation (SFT) followed by reinforcement (‘RL’ HF)

![](figures/lecture_15.pdf-30-0.png)


**Part 2** : the ‘RL’ part [Ouyang 2022]

(cs336-15-page-032)=

## From imitation to optimization

**Imitation (SFT)**


Fit for some reference distribution
ො𝑝𝑦𝑥≈𝑝 [∗] (𝑦|𝑥) 𝑝 [∗] 𝑦𝑥


Pure generative modeling perspective

Requires samples from reference policy


**Optimization (RLHF)**


Find ෝ𝒑𝒚𝒙 such that max 𝐸 𝑝 [𝑅𝑦, 𝑥] for a reward 𝑅(𝑦, 𝑥)

𝑝


Maximize some reward function that we can measure

LMs are policies, not a model of some distribution

(cs336-15-page-033)=

## Why optimize? G-V gap

People don’t always write the thing that they prefer in LM outputs..

![](figures/lecture_15.pdf-32-0.png)

![](figures/lecture_15.pdf-32-1.png)

![](figures/lecture_15.pdf-32-2.png)


From: Zhang et al – “Benchmarking Large Language Models for News Summarization” 2023

(cs336-15-page-034)=

## Overview

We’ll cover three aspects of RLHF


**Data**

How do people collect RLHF data?

What are some things to worry about


**How do we RLHF?**

PPO

DPO


**What are some side-effects of RLHF?**

(cs336-15-page-035)=

## RLHF Data

What types of pairwise feedback. How do we get (good) pairwise feedback?



![](figures/lecture_15.pdf-34-0.png)

(cs336-15-page-036)=

## RLHF and data – standard setups

Standard ‘pairwise feedback’ setup



![](figures/lecture_15.pdf-35-0.png)

(cs336-15-page-037)=

## RLHF and data – instruct GPT guideline



![](figures/lecture_15.pdf-36-0.png)

![](figures/lecture_15.pdf-36-1.png)

(cs336-15-page-038)=

## Another old example – bard annotations

![](figures/lecture_15.pdf-37-0.png)

https://assets.bwbx.io/documents/users/iqjWHBFdfxIU/rqKqEqbXBnDI/v0

(cs336-15-page-039)=

## Modern worker distribution

Caveat: many platforms, covers only one (Outlier, ScaleAI)



![](figures/lecture_15.pdf-38-0.png)

![](figures/lecture_15.pdf-38-1.png)

![](figures/lecture_15.pdf-38-2.png)

(cs336-15-page-040)=

## Large variation in compensation

**Lots of growth in “expert annotation”**

![](figures/lecture_15.pdf-39-0.png)

![](figures/lecture_15.pdf-39-1.png)


https://www.businessinsider.com/ai-data-labeling-annotators-pay-subject-experts-generalists-gig-workers-2025-12

(cs336-15-page-041)=

## RLHF and data - crowdsourcing

Complexities of crowdsourcing


Hard to get really high-quality, verifiable annotators


Hard to get them to really check correctness


Have to be careful about AI use..

(cs336-15-page-042)=

## RLHF and data – crowdsourcing ethics

Data collection at scale can have significant issues



![](figures/lecture_15.pdf-41-0.png)

![](figures/lecture_15.pdf-41-1.png)

(cs336-15-page-043)=

## RLHF and data - demographics

The annotator distribution for RLHF can significantly shift its behaviors




[Santurkar+ 2023]



![](figures/lecture_15.pdf-42-0.png)

![](figures/lecture_15.pdf-42-1.png)

![](figures/lecture_15.pdf-42-2.png)

![](figures/lecture_15.pdf-42-3.png)

(cs336-15-page-044)=

## RLHF and style – annotators matter (a lot)

This is true even for many annotators – but not all annotators



![](figures/lecture_15.pdf-43-0.png)


[Hosking, Blunsom, Bartolo 2024]

(cs336-15-page-045)=

## RLFH and data - LM-generated

GPT4 is a surprisingly good pairwise feedback system

![](figures/lecture_15.pdf-44-0.png)

![](figures/lecture_15.pdf-44-1.png)

![](figures/lecture_15.pdf-44-2.png)

Near-perfect rank correlation at the system level Agreement near human inter-annotator levels

(cs336-15-page-046)=

## RLHF and data - LM-generated

For people following the frontier – AI feedback often used for RLHF


Ultrafeedback Zephyr 7b

![](figures/lecture_15.pdf-45-1.png)


Tulu3



![](figures/lecture_15.pdf-45-2.png)

Used in e.g. Olmo, Zephyr, etc



![](figures/lecture_15.pdf-45-0.png)

https://thesequence.substack.com/p/the-sequence-chat-hugging-faces-lewis

(cs336-15-page-047)=

## RLHF and data – Self-training



![](figures/lecture_15.pdf-46-0.png)

From Constitutional AI, Bai et al.

(cs336-15-page-048)=

## RLHF and style – Length effects

Length effects are a very significant outcome of RLHF

![](figures/lecture_15.pdf-47-0.png)

![](figures/lecture_15.pdf-47-1.png)


[Chen et al 2024] [Singhal et al 2024]

(cs336-15-page-049)=

## How do we RLHF?

We now have a (high quality) pairwise feedback data collection pipeline?

How do we adapt the model to make use of pairwise feedback?


**Part 1: PPO** – the original and very finicky approach (the brief version)


**Part 2: DPO** – the new, very accessible approach

(cs336-15-page-050)=

## From imitation to optimization

**Imitation (SFT)**


Fit for some reference distribution
ො𝑝𝑦𝑥≈𝑝 [∗] (𝑦|𝑥) 𝑝 [∗] 𝑦𝑥


Pure generative modeling perspective

Requires samples from reference policy


**Optimization (RLHF)**


Find ෝ𝒑𝒚𝒙 such that max 𝐸 𝑝 [𝑅𝑦, 𝑥] for a reward 𝑅(𝑦, 𝑥)

𝑝


Maximize some reward function that we can measure

LMs are policies, not a model of some distribution

(cs336-15-page-051)=

## PPO in language modeling

From InstructGPT



![](figures/lecture_15.pdf-50-0.png)

..this is very innocuous looking

(cs336-15-page-052)=

## More details and background from Stiennon

From "Learning to summarize from human feedback”



![](figures/lecture_15.pdf-51-0.png)

(cs336-15-page-053)=

## PPO – at a conceptual level

A brief (and high level) intro to the various ideas in PPO..


Attempt 1: Policy gradients (variances are too high)

∇ 𝐸 𝑅𝑧 = 𝐸
𝜃 𝑝 𝜃 𝑝 𝜃 [R(z)∇ 𝜃 log 𝑝 𝜃 𝑧]


Attempt 2: TRPO (Linearize the problem around the current policy)

![](figures/lecture_15.pdf-52-0.png)


Attempt 3: PPO (Clip the ratios at some eps)



![](figures/lecture_15.pdf-52-1.png)

(cs336-15-page-054)=

## Can we get rid of PPO?

**Question for many:** can we avoid doing any ‘RL’ ? (i.e. on-policy RL algorithms)


**Some reasonable stuff people thought about**


Train the model with a control token – (SFT on the pairs, prepend [GOOD] to chosen,

[BAD] to not chosen)


Train the model on only preferred output


Train a reward model, get LM outputs, train on the preferred output


Train a reward model, get 1024 LM outputs, take the best one.

(cs336-15-page-055)=

## DPO – RLHF without tears?

**Try to simplify PPO by..**

Getting rid of the reward model

Getting rid of any on-policy stuff (rollouts, outer loops etc)


**Instead**

Take gradient steps on log-loss of good stuff

Take negative gradient steps on bad stuff (appropriately weighted).



![](figures/lecture_15.pdf-54-0.png)

(cs336-15-page-056)=

## DPO – derivation from the RLHF formula

Our goal is to optimize

![](figures/lecture_15.pdf-55-0.png)


𝜋
Assume that the policy is the set of all policies (nonparametric assumption).

The maximizer is then,

![](figures/lecture_15.pdf-55-1.png)


Solve for the ‘implied reward’

![](figures/lecture_15.pdf-55-2.png)


(This is the equivalence also used in the kimi-think paper)

(cs336-15-page-057)=

## DPO derivation 2

We can now optimize the implied reward as a reward model via the Stiennon objective

and

![](figures/lecture_15.pdf-56-0.png)


This gives the DPO objective,

![](figures/lecture_15.pdf-56-2.png)


**The key steps?**

![](figures/lecture_15.pdf-56-1.png)
1. Make a nonparametric assumption (links 𝜋 𝜃 and r in closed form)
2. Parametrize reward r via the policy
3. Optimize the reward using supervised losses (which in turn, optimizes the policy)


Conceptually.. This is MLE on the pairwise rewards, under nonparametric assumption + alternative parametrization

(cs336-15-page-058)=

## DPO updates and components

In some sense, reduces to “pos gradient on good, neg gradient on bad”

![](figures/lecture_15.pdf-57-0.png)


(Scaled by ‘prediction error’ of the implied reward model)

(cs336-15-page-059)=

## DPO in LLaMA (and other open models)

![](figures/lecture_15.pdf-58-0.png)

**DPO + Expert iteration for post-training**

(cs336-15-page-060)=

## Variants

Lots of variants (too many variants), but maybe two of note from the Tulu 3 paper..

SimPO (no ref)

![](figures/lecture_15.pdf-59-0.png)

Length normalized DPO



![](figures/lecture_15.pdf-59-1.png)

(cs336-15-page-061)=

## But PPO does too (and sometimes better?)

The trickiness of RL-related empirical work..


_Lots of results are highly contingent (on the specifics of the experiment setup)_



![](figures/lecture_15.pdf-60-0.png)

![](figures/lecture_15.pdf-60-1.png)

![](figures/lecture_15.pdf-60-2.png)

![](figures/lecture_15.pdf-60-3.png)

(cs336-15-page-062)=

## Things to watch out for in RLHF

Overoptimization / overfitting on the reward Mode collapse / entropy



![](figures/lecture_15.pdf-61-0.png)

![](figures/lecture_15.pdf-61-1.png)

(cs336-15-page-063)=

## Thins to watch out for - Overoptimization

Across many different RLHF-style optimizers. Optimizing for reward overfits past a point

![](figures/lecture_15.pdf-62-0.png)


Holds true for human pref (left), noisy LM pref (mid) but not noiseless LM pref (right)

(cs336-15-page-064)=

## Things to watch out for - mode collapse

RLHF makes models no longer ‘probabilistic models’ – no calibration by default



![](figures/lecture_15.pdf-63-0.png)

![](figures/lecture_15.pdf-63-1.png)

![](figures/lecture_15.pdf-63-2.png)

(cs336-15-page-065)=

## Recap of the lecture

RLHF recap:


1. RLHF data collection is (also) hard! Many confounding factors


2. RLHF algorithms are a bit more complex than SFT – esp. PPO


3. Be mindful of the impact of (over) optimizing for rewards
