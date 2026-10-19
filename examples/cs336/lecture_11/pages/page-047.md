## **Deriving muP (condition A1)**

Suppose that we have a simple, deep linear network (ℎ 𝑙 = 𝑊 𝑙 ℎ 𝑙−1 ) and we init

𝑊 𝑙 ∼𝑁0, 𝜎 [2] 𝐼 𝑛 𝑙 ×𝑛 𝑙−1 then by basic matrix concentration 𝑊 𝑙 ∗ [→𝜎( 𝑛] 𝑙−1 [+] 𝑛 𝑙 )
and,


ℎ 𝑙 2 [≈] 𝑊 𝑙 ∗ [ℎ] 𝑙−1 2



1

𝑛 𝑙−1 [min 1,]



𝑛 𝑙 . What happens?
𝑛 𝑙−1



−1
= Θ



𝜎=
Now let’s pick



𝑛 𝑙
𝑛 𝑙 + 𝑛 𝑙−1
𝑛 𝑙−1



                 **Inductive assumption** ℎ 𝑙−1 2 [= Θ] 𝑛 𝑙−1


**Inductive case** - 𝑊 𝑙 ∗ [→𝜎] 𝑛 𝑙−1 + 𝑛 𝑙 =



𝑛 𝑙

𝑛 𝑙−1



ℎ 𝑛
𝑙 2 [=] 𝑙 + 𝑜( 𝑛 𝑙 )


≈

[Comments – this is a kind of ‘worst case’ derivation – the is an upper bound ]
