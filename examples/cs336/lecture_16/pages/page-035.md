## **SFT/RLHF**

The usual post-training process happens _after_ RLVR / reasoning RL.


**SFT step, 2 epochs.**

Reasoning data – non-verifiable tasks (‘write a proof of X’), use V3 as a judge (600k)

Non-reasoning data – V3 SFT dataset (200k)


**RLHF step**

Re-use R1-zero style reasoning RLHF in here

Non-verifiable tasks - V3 RLHF pipeline. Still uses GRPO (for RLHF)
