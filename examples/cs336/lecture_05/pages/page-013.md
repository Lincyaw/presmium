## **Side thread – What about TPUs?**

GPUs, TPUs, and many other accelerators are at a high level, similar


A GPU has _more SMs_


TPUs has fewer TCs
(but similar matmul perf)

##### Core structure – lightweight control, fast (big) matmul unit, fast memory. Differences - how the accelerators are networked (in the parallelism lecture) -  no warps (just blocks – tradeoffs in matmul vs non-matmul)
