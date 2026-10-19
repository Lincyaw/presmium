## **Comparing ZeRO stage 1 and naïve data parallel**

###### **Naïve DDP ZeRO stage 1**


###### One reduce scatter (send gradients) + all gather (collect params)


###### Communication primitive


###### One all-reduce (gradients)


###### Communication cost 2* # params 2* # params Memory (4+K) * #params (4+K/Ngpu) * #params ZeRO stage 1 is free (in the bandwidth limited regime) memory wins
