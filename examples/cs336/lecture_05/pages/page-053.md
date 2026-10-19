## **Tiling part 2: incremental computation of the softmax**

From Mikailov and Gimelshein 2018,


**Normal softmax**

**Online softmax**


To keep track of the max, incrementally update the max, and set up a telescoping sum

**This lets you compute the softmax tile-by-tile**
