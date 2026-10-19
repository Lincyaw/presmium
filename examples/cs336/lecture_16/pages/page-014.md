## **PPO in practice – reward shaping**

**High level** – add per-token KL penalty, last-token full reward

**In practice?** Clip KL for sequences where new policy logp < reference logp


Helps with stability? If we blow up our model, this prevents kl from diverging
