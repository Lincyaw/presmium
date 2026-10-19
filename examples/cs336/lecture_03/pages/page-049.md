## **Dropout and weight decay in practice**

**Model** **Dropout*** **Weight decay**


Original transformer 0.1 0


GPT2 0.1 0.1


T5 0.1 0


GPT3 0.1 0.1


T5 v1.1 0 0


PaLM 0 (variable)


OPT 0.1 0.1


LLaMA 0 0.1


Qwen 14B 0.1 0.1



Many older models used
dropout during pretraining


Newer models (except Qwen) rely
only on weight decay




- Most of the times papers just don’t discuss dropout. On open models, this closely matches not doing dropout.

This may not be true of closed models.
