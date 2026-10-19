## **DPO derivation 2**

We can now optimize the implied reward as a reward model via the Stiennon objective

##### and


This gives the DPO objective,


**The key steps?**
1. Make a nonparametric assumption (links 𝜋 𝜃 and r in closed form)
2. Parametrize reward r via the policy
3. Optimize the reward using supervised losses (which in turn, optimizes the policy)


Conceptually.. This is MLE on the pairwise rewards, under nonparametric assumption + alternative parametrization
