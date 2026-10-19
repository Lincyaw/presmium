## **Some surprising takeaways**

The effect of hyperparameters on big LMs can be predicted _before_ training!


                        Optimizer choice

                         Model depth

                       Architecture choice


**The scaling law based design procedure.**

1. Train a few smaller models

2. Establish a scaling law (e.g. ADAM vs SGD scaling law)

3. Select optimal hyperparam based on the scaling law prediction.
