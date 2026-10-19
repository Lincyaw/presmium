## **DPO – RLHF without tears?**

**Try to simplify PPO by..**

Getting rid of the reward model

Getting rid of any on-policy stuff (rollouts, outer loops etc)


**Instead**

Take gradient steps on log-loss of good stuff

Take negative gradient steps on bad stuff (appropriately weighted).
