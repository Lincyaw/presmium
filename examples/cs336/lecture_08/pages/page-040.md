## **Tensor parallel – GPUs have submatrices**

Assign columns (A1, A2) and rows (B1, B2) to separate GPUs.

In the forward pass, f is the identity, and g is an all-reduce.

In the backward pass, f is an all-reduce, g is the identity.
