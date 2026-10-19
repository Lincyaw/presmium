## **Deriving muP (condition A2)**

Now we need to deal with updates. Suppose we have the update Δ𝑊 𝑙 on the weights.

For SGD, on a linear layer, this looks like a rank-one loss-activation outer product.


Δ𝑊 ∇ ℓ ℎ ⊤
𝑙 = −𝜂 𝑙 ℎ 𝑙 𝑙−1


Thus, Δ𝑊 𝑙 ℎ 𝑙−1 2 [=] Δ𝑊 𝑙 ∗ [ℎ] 𝑙−1 2 [ . Now note that we have the update]


Δh Δℎ
l = W l 𝑙−1 + Δ𝑊 𝑙 (ℎ 𝑙−1 + Δℎ 𝑙−1 )


Assuming that the leading order terms don’t cancel, we see that

W Δℎ
l 𝑙−1 = Θ( 𝑛 𝑙 ) from induction assumption + condition A1 argument


𝒏 𝒍

Δ𝑊 𝑙 ℎ 𝑙−1 = 𝛥𝑊 𝑙 ∗ [𝑛] 𝑙−1 [ from above, thus ] [𝜟𝑾] 𝒍 ∗ [= 𝚯]

𝒏 𝒍−𝟏

Δ𝑊 𝑙 Δℎ 𝑙−1 = 𝑂( Δ𝑊 𝑙 ∗ [𝑛] 𝑙−1 [)]
