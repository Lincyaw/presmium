## **What you implemented – simple, modern variant**

**Differences:**

                            **LayerNorm** is in front of the block


                            **Rotary position embeddings (RoPE)**


                            FF layers use **SwiGLU**, not ReLU

                            - **no**
Linear layers (and layernorm) have
**bias** (constant) terms


**Why did we pick these?**


**What should you pick?**
