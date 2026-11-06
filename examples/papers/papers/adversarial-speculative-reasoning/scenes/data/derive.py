#!/usr/bin/env python3
"""Reconstruct the figures and headline changes in arXiv 2611.05345.

The paper does not link a released results repository. The source values below are copied from its
text and Figures 3--5; this script checks every arithmetic relation used on screen and writes the
shared data module. Labels that are rounded differently in the text and a figure are kept separately.
"""

import json
from pathlib import Path


PAPER = "arXiv 2611.05345"
OUT = Path(__file__).with_name("asr.json")


def assert_close(actual: float, expected: float, label: str, tolerance: float = 0.051) -> None:
    if abs(actual - expected) > tolerance:
        raise SystemExit(f"{label}: got {actual:.3f}, expected {expected:.3f} from the paper")
    print(f"{label}: {actual:.3f} (paper {expected:.3f})")


def delta(before: float, after: float, expected: float, label: str) -> float:
    value = round(after - before, 1)
    assert_close(value, expected, label)
    return value


deep_swe_glm = delta(60.6, 67.6, 7.0, "DeepSWE GLM-5.3 change")
deep_swe_deepseek = delta(67.8, 71.8, 4.0, "DeepSWE DeepSeek change")
nl2repo_glm_reported = 5.8
nl2repo_glm_calculated = round(55.0 - 49.1, 1)
print(
    f"NL2Repo GLM-5.3 change: {nl2repo_glm_calculated:.1f} from rounded panel labels; "
    f"the paper prints +{nl2repo_glm_reported:.1f}"
)
nl2repo_deepseek = delta(65.0, 66.4, 1.4, "NL2Repo DeepSeek change")
preferred_glm = delta(60.6, 55.7, -4.9, "preferred-direction GLM-5.3 change")
preferred_deepseek = delta(67.8, 66.4, -1.4, "preferred-direction DeepSeek change")
unrelated_deepseek = delta(67.8, 67.5, -0.3, "unrelated-preference DeepSeek change")

glm_trainable_fraction = 2.15 / (753 + 2.46)
deepseek_trainable_fraction = 0.449 / (749 + 14.2)
assert_close(glm_trainable_fraction * 100, 0.28, "GLM trainable fraction (%)", 0.011)
assert_close(deepseek_trainable_fraction * 100, 0.06, "DeepSeek trainable fraction (%)", 0.011)

deepseek_acceptance_drop = (2.5 - 2.46) / 2.5
assert_close(deepseek_acceptance_drop * 100, 1.6, "DeepSeek accepted-length drop (%)", 0.051)

data = {
    "source": PAPER,
    "precision": {
        "slots": list(range(8)),
        "glm": {
            "relative": [round(1 + 0.041 * slot, 3) for slot in range(8)],
            "slope": 0.0195,
            "relative_per_slot": 0.041,
            "mean": [0.473, 0.55, 0.57, 0.59, 0.605, 0.615, 0.623, 0.634],
            "shift2": [3.2, 6.2],
            "shift3": [1.1, 2.1],
        },
        "deepseek": {
            "relative": [round(1 + 0.040 * slot, 3) for slot in range(6)],
            "slope": 0.0094,
            "relative_per_slot": 0.040,
            "shift1": [3.1, 4.5],
            "shift2": [0.41, 0.68],
        },
        "first_slot_reference": {"verify": 0.473, "decode": 0.478},
        "long_horizon": {
            "bins": ["11-30", "31-50", "51-70", "71-90"],
            "ratio_gt4": [0.98, 1.09, 1.16, 0.99],
            "independent_ratio_gt4": 1.20,
            "onset_turns": 30,
            "excess": [0.10, 0.20],
        },
    },
    "preferences": [
        {"key": "run_tests", "model": "DeepSeek-V4.1-Flash", "forward": 0.83, "adversarial": 0.85, "used": True},
        {"key": "decision_frame", "model": "GLM-5.3", "forward": 0.59, "adversarial": 0.635, "used": True},
        {"key": "thinking_length", "model": "DeepSeek-V4.1-Flash", "forward": 0.54, "adversarial": 0.65, "used": False},
        {
            "key": "decision_correctness",
            "model": "DeepSeek-V4.1-Flash",
            "forward": 0.61,
            "adversarial": 0.57,
            "used": False,
            "median_forward": 0.52,
            "median_adversarial": 0.46,
        },
    ],
    "results": [
        {
            "benchmark": "DeepSWE",
            "tasks": 113,
            "model": "GLM-5.3-NVFP4",
            "base": 60.6,
            "adversarial": 67.6,
            "delta": deep_swe_glm,
            "ci": [2.6, 11.4],
        },
        {
            "benchmark": "DeepSWE",
            "tasks": 113,
            "model": "DeepSeek-V4.1-Flash",
            "base": 67.8,
            "adversarial": 71.8,
            "delta": deep_swe_deepseek,
            "ci": [-1.3, 7.3],
            "figure": {"base": 67.9, "adversarial": 71.9},
        },
        {
            "benchmark": "NL2Repo-Bench",
            "tasks": 104,
            "model": "GLM-5.3-NVFP4",
            "base": 49.1,
            "adversarial": 55.0,
            "delta": nl2repo_glm_reported,
            "calculated_delta": nl2repo_glm_calculated,
        },
        {
            "benchmark": "NL2Repo-Bench",
            "tasks": 104,
            "model": "DeepSeek-V4.1-Flash",
            "base": 65.0,
            "adversarial": 66.4,
            "delta": nl2repo_deepseek,
            "ci": [0.4, 2.4],
            "p": 0.011,
        },
    ],
    "controls": {
        "preferred": [
            {"model": "GLM-5.3", "delta": preferred_glm},
            {"model": "DeepSeek-V4.1-Flash", "delta": preferred_deepseek},
        ],
        "adversarial": [
            {"model": "GLM-5.3", "delta": 7.0},
            {"model": "DeepSeek-V4.1-Flash", "delta": 4.1},
        ],
        "unrelated": {"runs": 27, "base": 67.8, "pooled": 67.5, "delta": unrelated_deepseek, "p": 0.83},
    },
    "speed": {
        "glm": {"accepted_before": 2.28, "accepted_after": 2.28},
        "deepseek": {"accepted_before": 2.50, "accepted_after": 2.46},
        "drop": round(deepseek_acceptance_drop, 4),
        "paper_approximation": 0.02,
    },
    "training": {
        "glm": {"target_b": 753, "draft_b": 2.46, "trainable_b": 2.15, "fraction": round(glm_trainable_fraction, 5)},
        "deepseek": {"target_b": 749, "draft_b": 14.2, "trainable_b": 0.449, "fraction": round(deepseek_trainable_fraction, 5)},
        "fraction_range": [0.0006, 0.0028],
    },
}

OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n")
print(f"wrote {OUT}")
