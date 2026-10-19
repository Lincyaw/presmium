## **Frontiers in low precision**

Very low precision (FP8) with different tradeoffs Multiple scaling factors MXFP8 (Blackwell)


MXFP8 has many _interesting_ things about it

      Uses E4M3 (more mantissa) due to more scale factors

      Scale factors themselves are FP8 (E8M0), 1 per 32

      - Transposes are now nontrivial!
