## **Can we get rid of PPO?**

**Question for many:** can we avoid doing any ‘RL’ ? (i.e. on-policy RL algorithms)


**Some reasonable stuff people thought about**


Train the model with a control token – (SFT on the pairs, prepend [GOOD] to chosen,

[BAD] to not chosen)


Train the model on only preferred output


Train a reward model, get LM outputs, train on the preferred output


Train a reward model, get 1024 LM outputs, take the best one.
