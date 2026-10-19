## **PPO in practice – generalized advantage estimate**

##### Instead of reward, we use advantages

where


Funny detail – this is a bandit problem and gamma=lambda=1 works – this is the reward-to-go vs the value
