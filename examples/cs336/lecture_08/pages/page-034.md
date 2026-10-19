## **A solution: pipeline parallel**

**Solution: Pipeline-parallel.**

Process ‘micro-batches’ (in this case, 4).
Send off the first microbatch and start computing the second.



The ratio of bubble time to useful compute is ..



𝑛 𝑠𝑡𝑎𝑔𝑒𝑠 −1

𝑛 𝑚𝑖𝑐𝑟𝑜 [ so we need a big batch size!]
