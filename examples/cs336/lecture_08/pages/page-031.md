## **Beyond data parallel – model parallelism**

**Scaling up in memory (without changing batch size) with model parallelism**


**What model parallelism is..**


   It splits up the parameters across GPUs (like zero3)..

   But communicate activations (while zero3 sends params).


**We cover three different types of parallelism**


1. Pipeline parallel
2. Tensor parallel (+ Sequence parallel)
3. Expert parallel


These correspond to three different ways of cutting up the model.
