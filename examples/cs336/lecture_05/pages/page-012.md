## **Memory model of a GPU**

Each thread can access its own register, and shared memory within the block.
**Information that goes across blocks need to be read/written to global memory (slow)**
