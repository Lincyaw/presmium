"""Recompute reported table averages and derived counts from the paper source; never execute LaTeX."""
from pathlib import Path
import argparse, json, re
parser = argparse.ArgumentParser()
parser.add_argument('--source', type=Path)
args = parser.parse_args()
paper = Path(__file__).resolve().parents[2]
source = args.source or paper.parents[1] / '.cache' / '2611.14912' / 'source'
text = (source / 'app_exp.tex').read_text()
label = text.index(r'\label{tab:benchmark_results}')
start = text.rfind(r'\begin{table}', 0, label)
end = text.index(r'\end{table}', label)
rows = []
reported = None
for line in text[start:end].splitlines():
    fields = line.split('&')
    if len(fields) != 10 or 'Benchmark' in fields[0]:
        continue
    numbers = []
    for cell in fields[1:]:
        match = re.search(r'\d+(?:\.\d+)?', cell)
        if not match:
            break
        numbers.append(float(match.group()))
    if len(numbers) != 9:
        continue
    name = fields[0].strip()
    if name == 'Average':
        reported = numbers
    else:
        rows.append({'task': name, 'scores': numbers})
names = ['base', 'rl', 'sft_rl_source', 'mix_90_10', 'mix_70_30', 'mix_50_50', 'mix_30_70', 'mix_10_90', 'sft_qwen3_source']
if len(rows) != 12 or reported is None:
    raise SystemExit('The expected 12-task paper table was not found; inspect the source before changing numbers.')
recomputed = [sum(row['scores'][i] for row in rows)/len(rows) for i in range(9)]
correct, incorrect = 39623, 98641
report = {
    'paper': 'arxiv:2611.14912v1',
    'sources': {
        'source_scores': 'app_exp.tex / tab:benchmark_results',
        'matched_budget_scores': 'figures/plot_1_exp1_4_reasoning.png, orange bars',
        'mixed_scores': 'app_exp.tex / tab:eval_std; experiments.tex / fig:plot_3_mix2',
        'counts': 'app_exp.tex B.3.2; experiments.tex 3.2',
        'coverage': 'figures/distribution_method_usage.png (total covered methods, not tail count)',
        'tail_usage': 'app_exp.tex / tab:tail_usage',
    },
    'source_task_scores': rows,
    'source_reported_mean': dict(zip(names, reported)),
    'source_mean_from_rounded_task_scores': dict(zip(names, [round(v,4) for v in recomputed])),
    'rounding_difference': dict(zip(names, [round(a-b,4) for a,b in zip(recomputed,reported)])),
    'training_pairs': {'correct':correct,'final_answer_incorrect':incorrect,'total':correct+incorrect},
    'matched_budget_rl_source_scores': [38.7,39.9,42.7,43.7],
    'rl_reference': 43.8,
    'mixed_90_10': {'score':44.4,'evaluation_stderr':0.42,'rl_score':43.8,'rl_stderr':0.43,'mean_difference':round(44.4-43.8,1)},
    'qwen3_8b': {'best_mix':[50,50],'sft':42.6,'rl':42.5,'mean_difference':round(42.6-42.5,1)},
    'rl_source_total_method_coverage': {'k':[1,2,4,8],'covered':[101,119,128,132],'identified_methods':138,'minimum_occurrences':100},
    'tail_usage_mmlu_pro_in_correct_rollouts': {'reduced_tail':40,'full_data':108,'difference':108-40},
    'notes': 'Task scores are rounded in the paper. Keep the reported aggregate in the film; recomputed means are a consistency check. Rollout count is not API calls or end-to-end total compute. Tail usage is a multilabel LLM annotation count, not accuracy.'
}
out = Path(__file__).with_name('reported.json')
out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:report[k] for k in ['paper','source_reported_mean','source_mean_from_rounded_task_scores','rounding_difference','training_pairs','mixed_90_10','qwen3_8b']},ensure_ascii=False,indent=2))
