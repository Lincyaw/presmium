## **Why pipeline parallel?**

Pipelines seem terrible. Why do we do it?


1. Pipelines save memory (compared to DDP)


2. Pipelines can have good communication properties (compared to FDSP) – it
depends only on activations (𝑏× 𝑠× ℎ) and is _point to point_


Generally, we will use pipelines on slower network links (i.e. inter-node) as a way to get

better memory-wise scaling.
