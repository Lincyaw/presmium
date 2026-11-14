#!/usr/bin/env python3
"""Quoted table values and arithmetic; does not rerun model experiments."""
import json
from pathlib import Path
data={"source":"arXiv:2610.23831v1 Table 1, Qwen3-8B; MuSiQue-only gradient updates","metric":"Exact Match (%)","methods":["Raw","Answer-only","Original trace","ReDiST"],"source_musique":[34.2,56.2,42.6,58.4],"transfer_2wiki":[51.6,47.9,52.1,68.6]}
data["gain_vs_original_trace_2wiki_pp"]=round(data["transfer_2wiki"][3]-data["transfer_2wiki"][2],1)
print(json.dumps(data,ensure_ascii=False,indent=2))
assert data["gain_vs_original_trace_2wiki_pp"]==16.5
Path(__file__).with_name("reported.json").write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n")
