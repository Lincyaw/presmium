## **Trick 5 (the big one): tiling**

**Tiling** is the idea of grouping and ordering threads to minimize global memory access.


Let’s go back to matrix multiplication..


Note that memory access is not coalesced, and repeated (M0,0 and N1,0)
