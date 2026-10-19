## **ZeRO in practice: will it fit?**

Pure BF16 training (with Kahan summation), is viable and optimizer states are less

beefy. Let’s say BF16 for everything but the master weights – 12 bytes per param


On a 8X A100 80G..

###### **Max size (params) Formula for B/param** Baseline 6.66.. B 12 Zero stage 1 16 B 5 Zero stage 2 24.62 B 2 (param) + (10 (grad+state))/8) Zero stage 3 53.33 B 12/8
