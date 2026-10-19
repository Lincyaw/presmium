## **GQA/MQA – Reducing attention head cost**

**Let’s think about the compute involved for attention**


X softmax projection

**Total arithmetric operations** (𝑏𝑛𝑑 [2] ), **total memory accesses** (𝑏𝑛𝑑+ 𝑏ℎ𝑛 [2] + 𝑑 [2] )



d = hidden dim

b = batch
n = length (<d)
h = heads

k = head dim (d/h)



1


𝑏𝑛



−1



Arithmetic intensity (compute/memory) is high 𝑂



1

𝑘 [+]



- we can keep our GPUs running
