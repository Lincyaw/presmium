## **ZeRO stage 3 (aka FSDP) shard everything**

We’ve gotten almost everything for free so far.. lets try to solve _all_ our memory issues


**High level idea**

Shard everything – incl parameters!

Use the same ‘incremental communication / computation’ ideas

Send and request parameters on demand while stepping through the compute graph.


Is it possible to do this with low overhead?
