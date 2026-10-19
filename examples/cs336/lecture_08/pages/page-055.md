## **Recap: LLM parallelism table**



**Main bandwidth**

**cost**



**Scales global**
**Easy to use?**
**batch?**



**Param memory**
**Method** **Comm/Sync**
**per rank**



**Activation / KV**
**memory per rank**



gradient all-reduce
**DDP / ZeRO-1**
per step


Gradient all reduce
**FSDP / ZeRO-3**
– can be overlapped



**No param scaling**
(ZeRO-1 only opt
state)


**~1/DP** for
params/grads/opti
mizer state



**Gradient traffic ~**
**None** **Yes, linear in DP** **Very**
**O(params)**



**None**



**Pipeline parallel**


**Tensor parallel**


**Sequence /**
**Context parallel**


**Expert parallel**
**(MoE)**



Activation between
layers, **pipeline**
**bubbles**


**Blocking**
**activation**

**communication**



**token dispatch -**
**all-to-all per MoE**



Depends on
**~1/PP**
pipeline buffers



**Param traffic ~**
**O(params)**, higher
than DDP, overlap


**Activation traffic**
**between stages**


**Activation-sized**
**collectives every**
**block**



**Yes, linear in DP** **Moderate**


**No**, but needs
**Hard**
microbatches


**No** **Hard**



**~1/TP** for TPsharded weights



**~1/TP** for relevant
matmul activations
w/ SP


**~1/SP or 1/CP** on
sequence-side
activations / KV



per-layer sequence**None**
shard exchange



**Activation / KV**
**No** **Hard**
**communication**



**~1/EP for expert** **Token-routing all-**
**None**
**weights only** **to-all**



**No**, but needs
enough tokens per
expert



**Hard**
