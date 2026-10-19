## **Storing (and retrieving) activations can be expensive!**

Let’s say we stack 3 sigmoids on top of each other.


This is really terrible for perf – 8 mem read/writes, very low arithmetic intensity.


https://dev-discuss.pytorch.org/t/min-cut-optimal-recomputation-i-e-activation-checkpointing-with-aotautograd/467
