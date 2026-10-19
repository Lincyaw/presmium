## **Gated delta net (and friends)**

Let’s generalize things further – gate the input and selectively erase the state.



⊤ and
𝑦 𝑡 = 𝑞 𝑡



⊤ 𝐷 with 𝛾 𝑡 = 𝑓(𝑥 𝑡 )(Mamba-2)



𝑆 𝑡 = 𝛾 𝑡 𝑆 𝑡−1 + 𝑘 𝑡 𝑣 𝑡



𝑡 ⊤ 𝑆 𝑡 + 𝑣 𝑡



𝑆 𝑡 = 𝛾 𝑡 (𝐼−𝛽 𝑡 𝑘 𝑡 𝑘 𝑡 ⊤ )𝑆 𝑡−1 + 𝛽 𝑡 𝑘 𝑡 𝑣 𝑡 ⊤ and

𝑦 𝑡 = 𝑞 𝑡⊤ 𝑆 𝑡 with 𝛾 𝑡 = 𝑓𝑥 𝑡, 𝛽 𝑡 = 𝑓𝑥 𝑡



𝑡 ⊤ )𝑆 𝑡−1 + 𝛽 𝑡 𝑘 𝑡 𝑣 𝑡



𝑆 𝑡 = 𝛾 𝑡 (𝐼−𝛽 𝑡 𝑘 𝑡 𝑘 𝑡



𝑡⊤ 𝑆 𝑡 with 𝛾 𝑡 = 𝑓𝑥 𝑡, 𝛽 𝑡 = 𝑓𝑥 𝑡 (Gated Delta Net)



The gated delta net adds a ‘no input operation’ gate (𝛽= 0)
And _erases_ 𝑘 𝑘 ⊤
anything in the direction of the current key (𝐼−𝛽 𝑡 𝑡 𝑡 )



Close relationships to various fast weight programming / test time training ideas.
