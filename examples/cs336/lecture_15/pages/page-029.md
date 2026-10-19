## **Turning instruction tuning into pretraining**

Can we somehow turn instruction tuning data into pretraining data?


The following (increasingly popular) idea says yes:


1. Pre-train on web/pretraining data

2. Mix in instruction-tuning data into pre-training

3. Do an actual (but short) instruction-tuning round.


Lets you scale up instruction tuning w/o catastrophic forgetting
