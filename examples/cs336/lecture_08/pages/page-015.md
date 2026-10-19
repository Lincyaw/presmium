## **Naïve data parallelism**

**Starting point** – imagine we are doing naïve SGD


𝐵


𝜃 𝑡+1 = 𝜃 𝑡
−𝜂෍

𝑖=1



∇𝑓(𝑥 𝑖 )



**Naive parallelism:** split the elements of B sized batch across M machines. Exchange gradients to

synchronize


**How does this do?**

Compute scaling – each GPU gets B/M examples.
Communication overhead – transmits 2x # params every batch. OK if batches are big
Memory scaling – none. Every GPU needs # params at least
