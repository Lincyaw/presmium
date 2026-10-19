## **GQA/MQA – Reducing attention head cost**

What about the _incremental_ case when we generate text?


**Key difference:** can’t parallelize the generation process – needs to be step by step


In this case – we need to incrementally re-compute/update attention via the ‘KV cache’


[Animation from https://medium.com/@joaolages/kv-caching-explained-276520203249]
