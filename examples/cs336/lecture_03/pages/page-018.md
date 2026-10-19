## **More generally: dropping bias terms**

**Most modern transformers don’t have bias terms.**


Original Transformer:


Most implementations (if they’re not gated):


𝐹𝐹𝑁𝑥= 𝜎𝑥𝑊
1 𝑊 2


**Reasons:** memory (similar to RMSnorm) and optimization stability
