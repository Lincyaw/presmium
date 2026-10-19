## **Overview table of model parallelism**

**DP** **TP/SP** **EP** **PP** **CP**


Deepseek ?? (Zero1) 1 8 16 ??


Deepseek v3 ?? (Zero1) 1 64 16 ??


Yi ?? (Zero1) >0 1 >0 ??


Llama3 405B 128 8 0 16 1


Gemma 2 768 8 0 0 0



Mixtral 8x22

(megatron)


Nemotron 3

120B (long
context)


Qwen 3
(megatron)



2 4 8 4 1


?? 2 64 ?? 64


?? 2 32 8 1


###### Patterns – TP generally <= 8. EP can be big (but hard!). Long context phases use large CP
