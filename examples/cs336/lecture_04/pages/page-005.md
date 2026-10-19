## **Recurrent form of linear attention**

Recall that in purely linear attention, we consider the reordering


𝑄𝐾 [⊤] 𝑉= 𝑄(𝐾 [⊤] 𝑉)


This is linear time (great) but the even nicer thing is that this looks like a RNN.



⊤ and
𝑦 𝑡 = 𝑞 𝑡



𝑆 = 𝑆 𝑣
𝑡 𝑡−1 + 𝑘 𝑡 𝑡



⊤ 𝑆

𝑡 𝑡



This ‘duality’ allows us to train efficiently (using the parallel, quadratic form) and

inference efficiently (using the serial, linear form)


(Note: if one weights 𝑆 𝑡−1 by 𝛾, you get a RetNet)
