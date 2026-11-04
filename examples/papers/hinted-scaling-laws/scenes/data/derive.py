#!/usr/bin/env python3
"""Everything the scenes of this film draw, computed from the paper's released results.

    uv run --no-project --with numpy --with scipy --with pandas python -I \
        examples/papers/hinted-scaling-laws/scenes/data/derive.py <clone of tatsu-lab/hinted-scaling-laws> <out.json>

Reads only the CSV and JSON tables of `data/results` (and one problem of `data/benchmarks`); the fits follow the
paper's Eq. (2) and its multi-start least squares, and the script prints each number the film quotes next to the
paper's value, so a mismatch shows here and not on screen.
"""
import json
import statistics
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.optimize import least_squares
from scipy.special import expit as sigmoid

REPO, OUT = Path(sys.argv[1]), Path(sys.argv[2])
RESULTS = REPO / "data" / "results"
ROLLOUTS = RESULTS / "rollouts"
FIT_ROLLOUTS = {"aime": 10, "hle": 10, "gsm8k": None}
C_SHIFT = 20.0
MODELS = pd.read_csv(RESULTS / "models.csv")
HEADLINE = [("gsm8k", "delphi"), ("aime", "qwen25"), ("aime", "gemma3"), ("hle", "qwen3"), ("hle", "qwen35")]
FAMILY = {"delphi": "Delphi", "qwen25": "Qwen2.5", "gemma3": "Gemma-3", "qwen3": "Qwen3", "qwen35": "Qwen3.5"}


def expand(path: Path) -> pd.DataFrame:
    """One row per rollout: `passed` holds one character per rollout, in rank order."""
    w = pd.read_csv(path, dtype=str, keep_default_na=False)
    n = w["passed"].str.len().to_numpy()
    long = w.loc[w.index.repeat(n), [c for c in w.columns if c not in ("passed", "pool")]].reset_index(drop=True)
    long["sample_id"] = np.concatenate([np.arange(k) for k in n])
    long["passed"] = (np.frombuffer("".join(w["passed"]).encode(), dtype="S1") == b"1").astype(int)
    if "pool" in w.columns:
        long["pool"] = np.frombuffer("".join(w["pool"]).encode(), dtype="S1").astype(str)
    if "hint" in long.columns:
        long["hint"] = long["hint"].astype(float).round(4)
    return long


def cells_of(bench: str, method: str) -> pd.DataFrame:
    """One row per (model, hint): accuracy over the rollouts the fits use, the mean of the seeds' accuracies."""
    df = expand(ROLLOUTS / f"{bench}__{method}.csv")
    if FIT_ROLLOUTS[bench] is not None:
        df = df[df.sample_id < FIT_ROLLOUTS[bench]]
    if method == "no_hint":
        df = df.assign(hint=0.0)
    if "seed" not in df.columns:
        df = df.assign(seed="")
    per_seed = df.groupby(["model", "hint", "seed"], as_index=False).passed.mean()
    return per_seed.groupby(["model", "hint"], as_index=False).passed.mean().rename(columns={"passed": "acc"})


def pair(bench: str, family: str, methods=("mask", "truncate")):
    meta = MODELS[(MODELS.benchmark == bench) & (MODELS.family == family) & MODELS.in_forecasts]
    meta = meta[["model", "capability"]]
    no_hint = cells_of(bench, "no_hint").merge(meta, on="model").sort_values("capability").reset_index(drop=True)
    full = {m: pd.concat([cells_of(bench, m).merge(meta, on="model"), no_hint], ignore_index=True) for m in methods}
    return no_hint, full


def law(b, c, h):
    """The floored sigmoid law of Eq. (2), b = [b1, b2, b0, A, L, F], with the scale axis centred at 20."""
    z = b[0] * (np.asarray(c, dtype=float) - C_SHIFT) + b[1] * np.asarray(h, dtype=float) + b[2]
    return np.maximum(b[5], b[4] + (b[3] - b[4]) * sigmoid(z))


def fit_joint(df: pd.DataFrame) -> np.ndarray:
    c, h, y = df.capability.to_numpy(float), df.hint.to_numpy(float), df.acc.to_numpy(float)
    best = None
    for b1 in (0.5, 2.0):
        for b2 in (0.5, 2.0, 8.0):
            for b0 in (-4.0, -2.0, 0.0):
                for A0, L0 in ((0.9, 0.0), (1.0, -0.1), (0.9, -0.5)):
                    for F0 in (0.0, 0.01, 0.02):
                        r = least_squares(lambda x: law(x, c, h) - y, x0=[b1, b2, b0, A0, L0, F0],
                                          bounds=([0, 0, -np.inf, 1e-3, -50, 0], [np.inf, np.inf, np.inf, 1, 0.999, 0.999]))
                        if best is None or r.cost < best.cost:
                            best = r
    return best.x


def fit_baseline(c: np.ndarray, y: np.ndarray) -> np.ndarray:
    """[a1, a0] of acc = sigmoid(a1 C + a0), a1 >= 0: the standard scaling law on the unhinted scores alone."""
    best = None
    for x0 in ([1.0, -10.0], [1.0, -c.mean()], [0.5, -0.5 * c.mean()], [3.0, -3.0 * c.mean()], [10.0, -10.0 * c.mean()]):
        r = least_squares(lambda a: sigmoid(a[0] * c + a[1]) - y, x0=x0, bounds=([0, -np.inf], [np.inf, np.inf]))
        if best is None or r.cost < best.cost:
            best = r
    return best.x


def forecast(no_hint, full, t):
    """Fit on the t smallest models; read H = 0 at the largest, which every window holds out."""
    c0, y0 = no_hint.capability.to_numpy(), no_hint.acc.to_numpy()
    boundary, top, truth = c0[t - 1], c0[-1], y0[-1]
    a = fit_baseline(c0[:t], y0[:t])
    laws = {m: fit_joint(df[df.capability <= boundary + 1e-9]) for m, df in full.items()}
    preds = {m: float(law(b, top, 0.0)) for m, b in laws.items()}
    base = float(sigmoid(a[0] * top + a[1]))
    mean = float(np.mean(list(preds.values())))
    return dict(t=t, boundary=float(boundary), frac=float(10 ** (boundary - top)), baseline=[float(v) for v in a], base_pred=base,
                base_err=abs(base - truth), laws={m: [float(v) for v in b] for m, b in laws.items()}, preds=preds,
                pred=mean, err=abs(mean - truth))


def rate_digits(rates) -> str:
    """Per-problem pass rates as one hex digit each, 0 = never and f = always."""
    return "".join(format(int(round(float(r) * 15)), "x") for r in rates)


def delphi() -> dict:
    no_hint, full = pair("gsm8k", "delphi", ("mask", "truncate", "logit_mix"))
    no_hint = no_hint.sort_values("capability").reset_index(drop=True)
    rungs = [{"model": m, "c": float(c), "acc": float(a)} for m, c, a in zip(no_hint.model, no_hint.capability, no_hint.acc)]
    out = {"rungs": rungs, "methods": {}}
    for method, df in full.items():
        hints = sorted(df.hint.unique().tolist())
        grid = df.pivot_table(index="hint", columns="capability", values="acc").reindex(index=hints, columns=no_hint.capability)
        b = fit_joint(df)
        mae = float(np.abs(law(b, df.capability, df.hint) - df.acc).mean())
        out["methods"][method] = {"hints": hints, "acc": [[None if np.isnan(v) else float(v) for v in row] for row in grid.to_numpy()],
                                  "law": [float(v) for v in b], "mae": mae}
        print(f"delphi {method}: law {np.round(b, 3).tolist()} joint MAE {100 * mae:.2f} points")
    # Logit mixing forecasts: every window from 3 models up, the paper's nine training sets.
    print("delphi forecasts (logit mixing), window: frac, baseline err, law err")
    mix = {"logit_mix": full["logit_mix"]}
    out["forecast_logit"] = [forecast(no_hint, mix, t) for t in range(3, len(no_hint))]
    for f in out["forecast_logit"]:
        print(f"  t={f['t']:2d} frac={100 * f['frac']:.3g}% base={100 * f['base_pred']:.1f} (err {100 * f['base_err']:.1f}) law={100 * f['pred']:.1f} (err {100 * f['err']:.1f})")
    errs = [f["err"] for f in out["forecast_logit"]]
    print(f"  mean err {100 * np.mean(errs):.1f} (paper 3.3), worst {100 * max(errs):.1f} (paper 6.6)")
    # The curve under each window, drawn by the scenes from these parameters.
    bpb = pd.read_csv(RESULTS / "bpb_delphi.csv")
    bpb["c"] = np.log10(bpb.train_flops)
    out["bpb"] = [{"c": float(c), "bpb": float(v)} for c, v in zip(bpb.c, bpb.bits_per_byte)]
    # The sheet: one rung's per-problem pass rates at each level, 256 problems.
    sheet = {}
    for rung in ("delphi_1e21", "delphi_1e22"):
        sheet[rung] = {}
        h0 = expand(ROLLOUTS / "gsm8k__no_hint.csv")
        h0 = h0[h0.model == rung].groupby("problem_id").passed.mean()
        order = sorted(h0.index, key=int)
        for method in ("mask", "truncate", "logit_mix"):
            df = expand(ROLLOUTS / f"gsm8k__{method}.csv")
            df = df[df.model == rung]
            levels = {"0": rate_digits(h0.loc[order])}
            for h, g in df.groupby("hint"):
                levels[f"{h:g}"] = rate_digits(g.groupby("problem_id").passed.mean().loc[order])
            sheet[rung][method] = levels
    out["sheet"] = sheet
    return out


def families() -> dict:
    panels = []
    for bench, fam in HEADLINE:
        no_hint, full = pair(bench, fam)
        n = len(no_hint)
        for t in range(7 if bench == "gsm8k" else 2, n):
            f = forecast(no_hint, full, t)
            panels.append({"bench": bench, "family": fam, "name": FAMILY[fam], "t": t, "frac": f["frac"], "base_err": f["base_err"], "err": f["err"],
                           "truth": float(no_hint.acc.iloc[-1])})
            print(f"  {bench}/{fam} t={t} truth={100 * no_hint.acc.iloc[-1]:.1f} baseline err {100 * f['base_err']:.1f} ensemble err {100 * f['err']:.1f}")
    wins = sum(p["err"] < p["base_err"] for p in panels)
    med_b, med_e = statistics.median(p["base_err"] for p in panels), statistics.median(p["err"] for p in panels)
    print(f"panels {len(panels)} (paper: 19), ensemble wins {wins} (paper: 17), median {100 * med_b:.1f} -> {100 * med_e:.1f} (paper: 21 -> 4.3)")
    return {"panels": panels, "wins": wins, "median_base": med_b, "median_ens": med_e}


def answer_mix() -> dict:
    """The control: return the reference answer with probability H. Every hinted cell follows from the unhinted one."""
    no_hint, _ = pair("gsm8k", "delphi", ())
    rows = []
    for h in np.round(np.arange(0.0, 1.0001, 0.1), 1):
        d = no_hint.copy()
        d["hint"] = float(h)
        d["acc"] = h + (1 - h) * no_hint.acc.to_numpy()
        rows.append(d)
    df = pd.concat(rows, ignore_index=True)
    res = [forecast(no_hint, {"answer": df}, t) for t in range(7, len(no_hint))]
    print("answer mixing on delphi:", [(f["t"], round(100 * f["err"], 1)) for f in res])
    return {"rows": [{"t": f["t"], "err": f["err"], "pred": f["pred"]} for f in res]}


def ranking(bench: str, cfg: dict) -> dict:
    b = cfg["benchmarks"][bench]
    subset = list(b["model_subset"])
    h0 = expand(ROLLOUTS / f"{bench}__no_hint.csv")
    h0 = h0[h0.model.isin(subset)]
    problems = sorted(h0.problem_id.unique())
    P = len(problems)
    y = h0[h0.pool == "y"].groupby(["model", "problem_id"]).passed.mean().groupby("model").mean()
    models = sorted(subset, key=lambda m: -y[m])
    truth = np.array([y[m] for m in models])
    x0 = h0[h0.pool == "x"].groupby(["model", "problem_id"]).passed.agg(["mean", "size"])
    rate0 = np.array([[x0.loc[(m, p), "mean"] for p in problems] for m in models])
    size0 = np.array([[x0.loc[(m, p), "size"] for p in problems] for m in models])
    hinted = expand(ROLLOUTS / f"{bench}__truncate.csv")
    hinted = hinted[hinted.model.isin(subset) & (hinted.sample_id < b["hinted_per_problem"])]
    levels = [float(h) for h in b["hint_levels"]]
    rate_h = {h: np.array([[hinted[(hinted.model == m) & (hinted.hint == h) & (hinted.problem_id == p)].passed.mean() for p in problems] for m in models]) for h in levels}
    trials = int(cfg["trials"])
    rng = np.random.default_rng(int(cfg["seed"]))
    M = len(models)
    i, j = np.triu_indices(M, 1)
    sign_truth = np.sign(truth[i] - truth[j])

    def tau(scores):  # scores: trials x models; Kendall's tau-a, a tie counting in the denominator
        return float((np.sign(scores[:, i] - scores[:, j]) * sign_truth).mean())

    def avg_at(k):
        kk = np.minimum(k, size0)
        drawn = rng.binomial(kk[None], rate0[None], size=(trials, M, P))
        return tau(drawn.sum(2) / kk.sum(1)[None])

    def z(a):
        sd = a.std(1, keepdims=True)
        return np.where(sd > 0, (a - a.mean(1, keepdims=True)) / np.where(sd > 0, sd, 1), 0.0)

    def hint_prior(k, lam=float(cfg["hint_prior_lambda"])):
        rank = rng.random((trials, P)).argsort(1).argsort(1)
        assign = rank % len(levels)
        correct = np.zeros((trials, M))
        for n, h in enumerate(levels):
            mask = assign == n
            draws = rng.random((trials, M, P)) < rate_h[h][None]
            correct += (draws & mask[:, None, :]).sum(2)
        pilot = correct / P
        if k <= 1:
            return tau(z(pilot))
        kk = np.minimum(k - 1, size0)
        un = rng.binomial(kk[None], rate0[None], size=(trials, M, P)).sum(2) / kk.sum(1)[None]
        alpha = (k - 1) / (k - 1 + lam)
        return tau(alpha * z(un) + (1 - alpha) * z(pilot))

    def single(h):
        drawn = rng.random((trials, M, P)) < rate_h[h][None]
        return tau(drawn.sum(2) / P)

    budgets = [1, 2, 3, 4, 5, 6, 7, 8, 12, 16, 24, 32, 48, 64] + ([96, 128] if bench == "aime" else [])
    res = {"models": models, "truth": [float(v) for v in truth],
           "curves": {f"{h:g}": [float(rate_h[h][n].mean()) for n in range(M)] for h in levels},
           "levels": levels, "budgets": budgets,
           "avg": [avg_at(k) for k in budgets], "prior": [hint_prior(k) for k in budgets],
           "single": {f"{h:g}": single(h) for h in levels}}
    lead = res["prior"][0] - res["avg"][0]
    match = next((k for k, v in zip(budgets, res["avg"]) if v >= res["prior"][0]), None)
    print(f"{bench}: truth {[round(100 * v, 2) for v in truth]}; tau at k=1 avg {res['avg'][0]:.2f} prior {res['prior'][0]:.2f} lead {lead:.2f}; avg@k matches at k={match}")
    print(f"  best single level at k=1: {max(res['single'].items(), key=lambda kv: kv[1])}")
    return res


data = {"delphi": delphi()}
d = data["delphi"]
print(f"truth at 1e23: {100 * d['rungs'][-1]['acc']:.1f}% (paper: 25.9%)")
window = next(f for f in d["forecast_logit"] if abs(f["boundary"] - np.log10(1.8e20)) < 0.02 or abs(f["boundary"] - 20.0) < 0.06)
print(f"window up to {10 ** window['boundary']:.2g} FLOPs: law error {100 * window['err']:.1f} (paper: within 3), baseline error {100 * window['base_err']:.1f} (paper: 13)")
data["families"] = families()
data["answer_mix"] = answer_mix()
cfg = json.loads((RESULTS / "ranking_config.json").read_text())
data["ranking"] = {b: ranking(b, cfg) for b in ("aime", "hle")}
problem = json.loads((REPO / "data" / "benchmarks" / "gsm8k_delphi.jsonl").read_text().splitlines()[0])
hint = json.loads((REPO / "data" / "benchmarks" / "gsm8k_solution_hints.jsonl").read_text().splitlines()[0])
data["problem"] = {"id": problem["problem_id"], "question": problem["question"], "answer": problem["answer"], "solution": hint["full_hint"]}
OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":"), default=lambda v: v.item()) + "\n")
print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KiB)")
