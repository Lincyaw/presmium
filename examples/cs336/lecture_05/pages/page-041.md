## **Tiling – store and reuse information in shared memory**

Cut up the matrix into smaller ‘tiles’, and load this into shared memory


Compute the matrix multiply in ‘phases’

1. Load 𝑀 and 𝑁 tiles into SHM
0,0 0,0

2. Compute partial sums for 𝑃


(Done with one tile)

3. Load the 𝑀 and 𝑁 tile into SHM
0,0 2,0

4. …

##### Advantages : repeated reads now access shared, not global memory and memory access can be coalesced
