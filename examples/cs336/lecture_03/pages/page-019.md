## **LayerNorm: recap**

##### • Basically everyone does non-residual norm (often prenorm)

###### •

Intuition – keep the good parts of residual connections

###### •

Observations – nicer gradient propagation, fewer spike

###### •

Some people add a second norm outside the residual stream

##### • Most people do RMSnorm

###### •

In practice, works as well as LayerNorm

###### •

But, has fewer parameters to move around, which saves on wallclock time

###### •

People more generally drop bias terms since the compute/param tradeoffs are not

great.
