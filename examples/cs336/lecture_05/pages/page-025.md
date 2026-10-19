## **Low precision improves arithmetic intensity**

**Example:** elementwise ReLU (𝑥= max(0, 𝑥)) on a vector of size 𝑛 **.**


(Float 32 case)

**Memory access** : 1 read (x), 1 write (if x < 0), float 32 = 4 bytes per op

**Operations:** 1 comparison op, 1 FLOP.

**Intensity:** 8 bytes / FLOP


(Float 16)

**Memory access** : 1 read (x), 1 write (if x < 0), float 16 = 2 bytes per op

**Operations:** 1 comparison op, 1 FLOP.

**Intensity:** 4 bytes / FLOP
