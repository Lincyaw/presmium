## **Recap: scaling in the wild**

**What are challenges in scaling ‘in practice’**

1. Setting model arch hyperparameters ( width, etc)

2. Setting optimizer hyperparameters (LR, batch)

3. Compute needed to fit the big chinchilla sweep


**Some solutions?**

1. Assume stability (or use muP)

2. Search for optimal LR / batch in small scale, either keep fixed or predict scaling

3. Use alternative learning schedules (WSD-like)
