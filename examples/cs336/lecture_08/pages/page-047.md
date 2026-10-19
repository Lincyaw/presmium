## **Activation under tensor parallel**

**Tensor parallel** splits out the matrix multiplies in attention + MLP


The remaining **10** term is for the LayerNorm (4sbh), Dropout (2sbh), and inputs to the
attention and MLP (4sbh). These terms alone will continue to grow with size
