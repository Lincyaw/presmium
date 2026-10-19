## **Tensor parallel – pros and cons vs pipeline parallel**

How do things compare to pipeline parallel?


**Pros** – no bubble. If your network is fast enough, there’s no waiting for others.
– low complexity – simple to ‘wrap’ models without major infra changes
– doesn’t need large batch sizes to work well


**Cons** – _much_ larger communication than pipeline parallel.

      - Pipeline: 𝑏𝑠ℎ point-to-point communication per microbatch




- Tensor: 8𝑏𝑠ℎ



𝑛 𝑑𝑒𝑣𝑖𝑐𝑒𝑠 −1 _per layer_ and _all-reduce_ communication.

𝑛 𝑑𝑒𝑣𝑖𝑐𝑒𝑠



Use tensor parallel whenever we have low-latency, high-bandwidth interconnects
