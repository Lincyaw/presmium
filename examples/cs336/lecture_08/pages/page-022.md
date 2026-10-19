## **ZeRO stage 2. the simple extension to gradient sharding**

Emboldened by our success, let’s shard even more stuff


**High level idea**

Also keep the gradients (pink slices) sharded across the machines.

Use the same (rough) tricks as stage 1.


**Complexity** – we can never instantiate a full gradient vector, but each worker must

compute a full gradient (since we’re data parallel)
