## **Actual picture of how FDSP / ZeRO stage 3 works**

Let’s walk through a FSDP example to see some important ideas


**Incremental computation / communication**

Parameters / gradients are requested / sent and then immediately freed


**Overlapping communication and computation (** 𝑾 𝟏 𝑾 𝟎 + 𝑾 𝟐 𝑾 𝟎 )𝒙= 𝒚

The all-gathers happen all at once while forward happens, masking the comm cost.


https://arxiv.org/pdf/2304.11277.pdf
