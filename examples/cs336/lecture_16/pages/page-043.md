## **Length control in Kimi**

**The kimi objective doesn’t have the same GRPO length bias problem.**

.. But they want to further compress the CoTs.


For each batch, they have a _length reward_


**How should I interpret this?**

The lambda is in [0.5, -0.5], with longer sequences in a group being negative

Correct answers are incentivized to be short

Incorrect answers are incentivized to be shorter than the center of the range of rollouts


(They also only enable this later on in traning, due to its effects on perf)
