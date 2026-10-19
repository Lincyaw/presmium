## **‘3D (4D) parallelism’ – putting it all together**

**Simple rules of thumb from the literature.**


1. Until your model fits in memory..


  Tensor / expert parallel up to GPUs / machine

  Pipeline parallel across machines

›
(Or use Zero-3, depending on BW)


2. Then until you run out of GPUs


   Scale the rest of the way with data parallel


If your batch size is small.. gradient accumulate to trade higher
batch sizes for better communication efficiency.
