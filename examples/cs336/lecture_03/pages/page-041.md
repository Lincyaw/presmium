## **What can we learn from the model-dim hyperparam?**


The ‘default’ choices of 𝑑 𝑓𝑓 = 4𝑑 𝑚𝑜𝑑𝑒𝑙 and 𝑑 𝑓𝑓 = 2.66𝑑 𝑚𝑜𝑑𝑒𝑙 have worked well for nearly
all modern LLMs.


But T5 does show that even radical choices of 𝑑 = 64𝑑 can work. This
𝑓𝑓 𝑚𝑜𝑑𝑒𝑙
hyperparameter choice isn’t written in stone.


That said, T5 has a follow-up model (T5 v1.1) that is ‘improved’ and uses a much more
standard 2.5 multiplier on GeGLU, so the 64-times multiplier is likely suboptimal.
