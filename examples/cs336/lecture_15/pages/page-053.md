## **PPO – at a conceptual level**

A brief (and high level) intro to the various ideas in PPO..


Attempt 1: Policy gradients (variances are too high)

∇ 𝐸 𝑅𝑧 = 𝐸
𝜃 𝑝 𝜃 𝑝 𝜃 [R(z)∇ 𝜃 log 𝑝 𝜃 𝑧]


Attempt 2: TRPO (Linearize the problem around the current policy)


Attempt 3: PPO (Clip the ratios at some eps)
