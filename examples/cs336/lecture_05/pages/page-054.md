## **Putting it all together – the forward pass of flash attention**

From Dao 2023, we see

Tile-wise computation of the inner products, (𝑆)

Fusion of the exponential operator

Tile-wise computation of the softmax via the online, telescoping sum trick


(We won’t cover the backward pass – but they recompute tile-by-tile..)
