## **Control divergence (not a memory issue)**

GPUs operate in a SIMT model – every thread in a warp is executing the same instruction


Conditionals are fine, but lead to significant overhead from the execution model
