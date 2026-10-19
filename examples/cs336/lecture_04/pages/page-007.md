## **From linear attention to Mamba-2**

Let’s generalize linear attention a little bit and add per-position weights..



𝑆 𝑡 = 𝑆 𝑡−1 + 𝑘 𝑡 𝑣 𝑡 ⊤ and  𝑦 𝑡 = 𝑞 𝑡 ⊤ 𝑆 𝑡 (Linear attention)


⊤ ⊤ ⊤

𝑆 𝑡 = 𝛾 𝑡 𝑆 𝑡−1 + 𝑘 𝑡 𝑣 𝑡 and  𝑦 𝑡 = 𝑞 𝑡 𝑆 𝑡 + 𝑣 𝑡 𝐷 with 𝛾 𝑡 = 𝑓(𝑥 𝑡 )



⊤ and
𝑦 𝑡 = 𝑞 𝑡



𝑆 = 𝑆 𝑣
𝑡 𝑡−1 + 𝑘 𝑡 𝑡



⊤ and
𝑦 𝑡 = 𝑞 𝑡



𝑡⊤ 𝑆 𝑡 + 𝑣 𝑡



⊤ 𝐷 with 𝛾 𝑡 = 𝑓(𝑥 𝑡 )(Mamba-2)



There is a lot more words to justify this (go read the mamba 2 paper) but the mechanics

is that we can make linear attention more expressive via gating (gating is good!)


This continues to have duality properties (compute 𝛾 in parallel, apply duality)
