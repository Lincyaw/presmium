## **Execution model of a GPU**

###### There are 3 important players in the execution model

**Threads:** Threads ‘do the work’ in parallel – all threads execute the same instructions but with

different inputs (SIMT).

**Blocks:** Blocks are groups of threads. Each block runs on a SM w/ its own shared memory.

**Warp:** Threads always execute in a ‘warp’ of 32 consecutively numbered threads each.
