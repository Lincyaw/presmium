## **Row vs Column tensor parallel**

How do we split up in tensor parallel across a transformer block?

Columnwise – QKV, up-projection

Rowwise – Attention output, down-projection

Replicated – norms, routers, etc
