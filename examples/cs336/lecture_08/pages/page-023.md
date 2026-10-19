## **ZeRO stage 2. how it works**

**Step 1.** Everyone incrementally goes backward on the computation graph

Step 1a. After computing a layer’s gradients, immediately reduce to send this to the
right worker


Step 1b. Once gradients are not needed in the backward graph, immediately free it.

**Step 2.** Each machine updates their param using their gradient + state.

**Step 3.** All Gather the parameters.
