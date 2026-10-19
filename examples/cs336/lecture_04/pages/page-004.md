## **Linear attention**

Consider the usual attention operation.. 𝑄∈𝑅 [𝑛×𝑑] [𝑘], 𝐾∈𝑅 [𝑛×𝑑] [𝑘], 𝑉∈𝑅 [𝑛×𝑑] [𝑣]


𝐴𝑡𝑡𝑛𝑄, 𝐾, 𝑉= 𝜌𝑄𝐾 [⊤] 𝑉


This is quadratic due to 𝑄𝐾 [⊤] (𝑛 [2] 𝑑 𝑘 ). Can we do better (when 𝜌 is the identity)?


𝑄𝐾 [⊤] 𝑉= 𝑄(𝐾 [⊤] 𝑉)


This is very silly, but surprisingly important.. We get from 𝑛 [2] 𝑑 𝑘 + 𝑛 [2] 𝑑 𝑣 to 2𝑛𝑑 𝑣 𝑑 𝑘


[Shen et al 2018, Katharopoulos 2020 for kernel version. Also connections to things like fast weight programmers]
