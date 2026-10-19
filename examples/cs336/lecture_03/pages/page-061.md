## **MQA – just have fewer key dimensions.**

**Key idea** – have multiple queries, but just one dimension for keys and values


We have much fewer items to move in and out of memory (KV Cache)



𝑛

𝑑ℎ [+]



−1



1


𝑏



**Total memory access** (𝑏𝑛𝑑+ 𝑏𝑛 [2] 𝑘+ 𝑛𝑑 [2] ), **Arithmetic intensity** 𝑂



1

𝑑 [+]




[figure from https://blog.fireworks.ai/multi-query-attention-is-all-you-need-db072e758055]
