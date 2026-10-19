## **What’s the point?**

Distributed data parallel costs 2*# param communication


**What about ZeRO?**


- **Zero stage 1** is 2*# param – it’s free! – you might as well always do it


- **Zero stage 2** is 2*# param – it’s (almost) free (ignoring overhead)


- **Zero stage 3** is 3*# param – 1.5x comm cost, but that’s not bad! (ignoring latency..)


This is also conceptually very simple – write a FSDP block wrapper.
