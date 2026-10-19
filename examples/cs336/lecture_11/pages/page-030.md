## **Recent scaling law recipes**

**DeepSeek recipe**

Assume most transformer hypers are invariant to scale

Do a scaling analysis on batch / LR to figure out optimal scaling

IsoFLOP analysis to figure out model sizing


›
Use a piecewise-linear schedule to make chinchilla scaling cheap.


**miniCPM recipe**

Use muP to make transformer + LR invariant to scale

Use a piecewise linear schedule to get sample for Chinchilla method 3 (curve fitting)


Recent (late 2024+) but less detailed
**Qwen –** Lr/batch (very few details..)
**Kimi K2** – MoE scaling
**LLaMA 3 / Hunyuan**

Just isoflops (no other scaling details)
**Minimax**

Architecture choice / decision scaling
