## **Detour: scaling laws for (nonparametric) learning**

Neural nets can approximate arbitrary functions. Lets turn that into an example.


**Input** : 𝑥 1 … 𝑥 𝑛 uniform in 2D unit box. 𝑦 𝑖 = 𝑓𝑥 𝑖 + 𝑁(0,1)

**Task:** estimate f(x)

**Approach** : cut up the 2D space into boxes with length 𝑛 ~~[−]~~ 4 [1]


**What’s our estimation error?**


𝑛 𝑛
Informally, we have boxes, each box gets samples.



𝐸𝑟𝑟𝑜𝑟≈ [1]

𝑛 [+ 𝑜𝑡ℎ𝑒𝑟 𝑠𝑚𝑜𝑜𝑡ℎ𝑛𝑒𝑠𝑠 𝑡𝑒𝑟𝑚𝑠]


In 𝑑-dimensions, this becomes 𝐸𝑟𝑟𝑜𝑟= 𝑛 [−1/𝑑] - **This means scaling is** 𝒚= −



𝟏

𝒅 [𝒙+ 𝑪]



**Takeaway:** flexible ‘nonparametric’ learning has dimension dependent scaling laws.
