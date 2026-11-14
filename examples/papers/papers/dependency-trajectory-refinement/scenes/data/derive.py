"""Reported Table 2 values, arXiv:2609.18417v1; no raw experimental data supplied."""
from decimal import Decimal
baseline_acc=Decimal("48.35")
l1_acc=Decimal("50.04")
baseline_tokens=20940
l2a_tokens=10977
print("Table 2 accuracy:",baseline_acc,"->",l1_acc,"delta",l1_acc-baseline_acc,"percentage points")
print("Table 2 L2a accuracy: 48.10; distinct configuration from L1")
print("Table 2 tokens:",baseline_tokens,"->",l2a_tokens,"reduction",round(100*(1-l2a_tokens/baseline_tokens),2),"%")
