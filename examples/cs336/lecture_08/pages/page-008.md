## **Important detail – all reduce vs reduce-scatter-gather.**

Reduce can be implemented as two steps: reduce-scatter and all-gather


Importantly, in the bandwidth-limited regime, this is the best you can do
