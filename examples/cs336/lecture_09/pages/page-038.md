## **4. Critical batch size definitions..**

**What is critical batch size, more precisely?**

Pick a target loss and train 1). Steps needed (S), 2). Examples needed.

Sweep over batches
The curve should follow roughly..


Fit for 𝑆 𝑚𝑖𝑛, 𝐸 𝑚𝑖𝑛 on this curve and pick


This balances both sides of the equation, giving roughly 2x the steps / passes optimal


(this is claimed to be close to the ratio of the trace of the gradient covariance and squared norm of the gradient)
