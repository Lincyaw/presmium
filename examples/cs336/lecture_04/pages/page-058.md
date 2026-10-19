## **What else do you need to make DeepSeek MoE v3?**

**Basic idea:** express the Q, K, V as functions of a lower-dim, ‘latent’ activation


𝐾𝑉

**Benefits:** when KV-caching, we only need to store 𝑐 𝑡, which can be much smaller.

𝑊 [𝑈𝐾] can be merged into the Q projection


(they also compress queries, for memory savings during training)


**Complexity:** rope conflicts with MLA-style caching.



𝐾𝑉 = ⟨ℎ 𝑊 𝑄 𝑊 𝑈𝐾, 𝑐 𝑡



Without RoPE – 𝑄, 𝐾= ℎ𝑊 [𝑄], 𝑊 [𝑈𝐾] 𝑐 𝑡



𝐾𝑉 ⟩



𝐾𝑉 = ℎ 𝑊 𝑄 𝑅 𝑞 𝑅 𝑘 𝑊 𝑈𝐾, 𝑐 𝑡



With RoPE - 𝑄𝑅 𝑞, 𝑅 𝑘 𝐾= ℎ𝑊 [𝑄] 𝑅 𝑞, 𝑅 𝑘 𝑊 [𝑈𝐾] 𝑐 𝑡



𝐾𝑉



The solution – Have a few non-latent key dimensions that can be rotated
