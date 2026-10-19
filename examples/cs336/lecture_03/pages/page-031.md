## **RoPE: rotary position embeddings**

**High level thought process:** a _relative_ position embedding should be some 𝑓(𝑥, 𝑖) s.t.


𝑓𝑥, 𝑖, 𝑓𝑦, 𝑗 = 𝑔(𝑥, 𝑦, 𝑖−𝑗)


That is, the attention function _only_ gets to depend on the relative position (i-j). How do

existing embeddings not fulfill this goal?


**Sine:** Has various cross-terms that are not relative


𝐸𝑚𝑏𝑒𝑑𝑥, 𝑖, 𝐸𝑚𝑏𝑒𝑑𝑦, 𝑖 = 𝑣 𝑥, 𝑣 𝑦 + 𝑃𝐸 𝑖, 𝑣 𝑦 …


**Absolute:** obviously not relative


##### Relative embeddings: is not an inner product
