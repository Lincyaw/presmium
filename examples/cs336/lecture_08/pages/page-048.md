## **Making memory truly linear – sequence parallel**

**Observation:** all the 10sbh terms are pointwise ops over the sequence

… so split up the layer norm/dropout layers along the sequence axis.

In the forward pass, ‘𝑔’ is an all gather, ‘ ത𝑔’ is reduce-scatter

In the backward pass, the two are reversed.
