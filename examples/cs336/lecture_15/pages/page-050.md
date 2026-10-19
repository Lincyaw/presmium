## **From imitation to optimization**

**Imitation (SFT)**


Fit for some reference distribution
ො𝑝𝑦𝑥≈𝑝 [∗] (𝑦|𝑥) 𝑝 [∗] 𝑦𝑥


               Pure generative modeling perspective

              Requires samples from reference policy


**Optimization (RLHF)**


Find ෝ𝒑𝒚𝒙 such that max 𝐸 𝑝 [𝑅𝑦, 𝑥] for a reward 𝑅(𝑦, 𝑥)

𝑝


          Maximize some reward function that we can measure

           LMs are policies, not a model of some distribution
