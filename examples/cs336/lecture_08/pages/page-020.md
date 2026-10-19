## **ZeRO stage 1. how it works**

**Step 1.** Everyone computes a full gradient on their subset of the batch


**Step 2.** ReduceScatter the gradients – incur #params communication cost


**Step 3.** Each machine updates their param using their gradient + state.

**Step 4.** All Gather the parameters – incur #params communication cost
