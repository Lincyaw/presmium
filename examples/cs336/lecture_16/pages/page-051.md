## **SFT + Reasoning RL**

We know the playbook by now, and Qwen uses a lot of this..


Filtering for difficulty (by best-of-n, like kimi)

#### •
##### Remove things that the model gets right w/o CoT

#### •
##### Remove things too similar to validation data


Manual filtering for the quality of CoTs (guessing vs getting it right)

RL with GRPO on **only 3995 examples**
