## **Exception #2 – T5**

As we have (and will) see, most LMs are have boring, conservative hyperparameters.

One exception is T5 [Raffel et al 2020] which has some _very bold_ settings.


In particular, for the 11B model, they set


𝑑 = 65,536
𝑓𝑓
𝑑 = 1024
𝑚𝑜𝑑𝑒𝑙


For an astounding 64-times multiplier.


Other, recent exceptions – Gemma 2 (8x), SmolLM/Gemma 3/Gemma 4 (4x, GLU)
