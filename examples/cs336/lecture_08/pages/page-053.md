## **Complexity: Decoupling attention / expert parallelism**

**Recall** : MoEs apply to the MLPs, not the attention (with some exotic exceptions)


This can lead to some imbalance between attention and MLPs for parallelism

High TP – useful for attention parallelization (since we cant use EP)

Low TP – useful for MLP parallelization (we’d rather EP than TP)


What to do? More flexible parallelism strategies (i.e. in Megatron)


Separates out TP/CP/DP (for attention) and (ETP/EP/EDP) for MLPs


https://docs.nvidia.com/megatron-core/developer-guide/latest/user-guide/features/moe.html
