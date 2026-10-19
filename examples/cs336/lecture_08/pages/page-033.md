## **What’s wrong with layer-wise parallel**

**Utilization of layer-wise parallelism is** _**terrible..**_



With n gpus, each gpu is active



1

n [ of the time.]



Each GPU is idling most of the time, waiting for the backward pass to propagate back
