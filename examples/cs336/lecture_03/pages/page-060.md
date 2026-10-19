## **GQA/MQA – Reducing attention head cost**

What’s the incremental arithmetic intensity?


K, V projection

**Total arithmetric operations** (𝑏𝑛𝑑 [2] ), **total memory accesses** (𝑏𝑛 [2] 𝑑+ 𝑛𝑑 [2] )



−1



1


𝑏



Arithmetic intensity is not good 𝑂


(n) or big model dimensions (d)



𝑛

𝑑 [+]




 - need large batches + short seq length



Is there some way around this? The n/d term is difficult to reduce.
