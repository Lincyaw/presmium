## **New kid on the block: GRPO**

**What’s GRPO?**

Start with PPO (many parts are similar)

Remove the value function / advantage computation

Calculate the advantage as “z-score within group”

##### (PPO for reference)


**In the** _**online**_ **case (rollout+immediate update), this is just policy gradient with group normalized rewards**
