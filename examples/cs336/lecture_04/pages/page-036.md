## **How do we train MoEs?**

**Major challenge:** we need sparsity for training-time efficiency…


But sparse gating decisions are not differentiable!


**Solutions?**


1. Reinforcment learning to optimize gating policies

2. Stochastic perturbations

3. Heuristic ‘balancing’ losses.

##### Guess which one people use in practice?
