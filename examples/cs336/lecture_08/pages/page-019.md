## **ZeRO stage 1. optimizer state sharding**

**High level idea:**

Split up the optimizer state (first + second moments) across GPUs

Everyone has the parameters + gradients


Each worker is responsible for updating a subset of params (corresponding to their slice)
