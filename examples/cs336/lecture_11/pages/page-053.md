## **What is muP robust to?**

Modern LMs have many components that deviate from muP’s theory


Activations – SwiGLU and squared relu

Batch sizes – Large / small

Initialization variations – zero attention, etc.

RMS norm gains

Exotic optimizers (Lion)

Regularizers


Which of these (if any) break muP?
