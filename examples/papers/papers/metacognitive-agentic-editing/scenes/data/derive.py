#!/usr/bin/env python3
"""Check quoted paper values and derived differences; does not rerun model experiments."""
import json
from pathlib import Path
reported={"source":"arXiv:2602.22508v3 Table 2; Figure 4 right, Section 5.2","metric":"math avg@8 (%)","unedited":83.1,"token_matched":83.2,"whole_rewrite":73.9,"agentic_edit":85.4,"planning_unedited":11.5,"planning_agentic":87.5}
reported["gain_pp"]=round(reported["agentic_edit"]-reported["unedited"],1)
print(json.dumps(reported,ensure_ascii=False,indent=2))
assert reported["gain_pp"]==2.3
Path(__file__).with_name("reported.json").write_text(json.dumps(reported,ensure_ascii=False,indent=2)+"\n")
