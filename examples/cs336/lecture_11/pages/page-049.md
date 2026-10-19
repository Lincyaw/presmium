## **Deriving muP (condition A2) part 2**

Recall –the key is to pick LR such that Δ𝑊 𝑙 ∗ [𝑛] 𝑙−1 [= Θ] 𝑛 𝑙 . How can we do that?


Suppose that the loss update _also_ scales O(1). Then we can write down..


Δℓ≈Θ Δ𝑊 𝑙, ∇ 𝑊 𝑙 ℓ = Θ Δ𝑊 𝑙 𝐹 [∇] 𝑊 𝑙 [ℓ] 𝐹 = Θ Δ𝑊 𝑙 ∗ [∇] 𝑊 𝑙 [ℓ] ∗


Where we use the fact that Δ𝑊 𝑙 = −𝜂∇ 𝑊 𝑙 ℓ in standard SGD updates.



𝑛 𝑙−1



Now plug in Δℓ= O 1, Δ𝑊 𝑙 ∗ [= Θ]



𝑛 𝑙
𝑛 𝑙−1 [to get that ] [∇] [𝑊] [𝑙] [ℓ] ∗ [= Θ]



𝑛 𝑙−1 ∗ 𝑛 𝑙

Finally, from the previous slide, recall that Δ𝑊 𝑙 = −𝜂 𝑙 ∇ ℎ 𝑙 ℓ ℎ 𝑙−1 ⊤ and thus



⊤ and thus



𝑛
𝑙
= Θ
𝜂 𝑙
𝑛
𝑙−1




[with Adam, Δ𝑊 𝑙 ∗ [𝑛] 𝑙−1 [= Θ] 𝜂 𝑙 ]
