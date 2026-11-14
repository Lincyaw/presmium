"""Reported values only: arXiv2606.16152v1, Tables 1/3/5 and section 6.2."""
from decimal import Decimal
native_reward,refined_reward=Decimal("1.47"),Decimal("1.70")
native_dft,refined_dft=Decimal("37.06"),Decimal("34.06")
print("Table 1 DFT reward:",native_reward,"->",refined_reward)
print("Table 1 DFT five-benchmark Avg@16:",native_dft,"->",refined_dft,"delta",refined_dft-native_dft,"pp")
print("Table 1 SFT ordering differs: synthesized23.26 > native22.74; do not generalize DFT ranking.")
print("Section 6.2 Style-Aligned(Qwen) PEAK39.12; teacher Qwen2.5-Math-72B-Instruct.")
print("PPL native1.52 / standard1.85 / alignedQwen1.46; proxy only.")
