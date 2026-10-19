## **Important note – train-optimal is likely not what you want**

**Chinchilla** aims to tell you what gives the best model for fixed training compute..
But most of the compute in a real deployment is inference.. So we should ‘over’ train


  **GPT3** – 2 tokens / param

  **Chinchilla** – 20 tokens / param

  - **LLaMA65B** – 22 tokens / param

  **Llama 2 70B** – 29 tokens / param

  **Mistral 7B** – 110 tokens / param

  **Llama 3 70B** – 215 tokens / param

… etc etc


The more usage we expect, the more it becomes worth it to pay the upfront cost
