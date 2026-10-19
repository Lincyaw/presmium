## **What’s wrong with naïve data parallelism? - Memory**

**Our memory situation is actually** _**terrible.**_


Depending on our precision..


We need 5 copies of weights and 16 bytes per param!



2 bytes for FP/BF 16 model parameters

2 bytes for FP/BF 16 gradients

4 bytes for FP32 master weights (the thing you accumulate into in SGD)

4 (or 2) bytes for FP32/BF16 Adam first moment estimates

4 (or 2) bytes for FP32/BF16 Adam second moment estimates



“Optimizer state”
