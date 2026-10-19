## **Scaling strategies from Narayanan 2021**

**Notes**

Tensor parallel first up to 8, then caps out at 8.

Pipeline parallel goes up to make the model fit.

Dara parallel gradually decreases with scale, with the largest model having DP=6



DP size


32

32

32

32

32

32

24

15

9

6
