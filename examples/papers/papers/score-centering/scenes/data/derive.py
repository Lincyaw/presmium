"""Recompute the educational examples, separately from paper observations.
Paper values are cited from arXiv:2609.20807v1 section 5.4 and appendix A/B.
No paper training curves are fabricated or inferred from the toy probabilities.
"""
import json
from pathlib import Path
p=[.5,.5]
q=[.6,.4]
score=[1-p[0],-p[0]]
mean=sum(a*b for a,b in zip(q,score))
centered=[s-mean for s in score]
reward=[1,0]
raw=sum(a*r*s for a,r,s in zip(q,reward,score))
mean_reward=sum(a*r for a,r in zip(q,reward))
data={
 "toy":{"p":p,"q":q,"score":score,"meanScore":mean,"centered":centered,
 "centeredMean":sum(a*s for a,s in zip(q,centered)),
 "reward":reward,"rawUpdate":raw,"drift":mean_reward*mean,
 "centeredUpdate":sum(a*r*s for a,r,s in zip(q,reward,centered)),
 "onPolicyUpdate":sum(a*r*s for a,r,s in zip(p,reward,score)),
 "rho":(1-.8)/(1-.7)},
 "storage":{"vocabulary":152000,"bytesPerValue":4,"bytesPerToken":152000*4,
 "rollouts":1024,"length":32768,"decimalTB":152000*4*1024*32768/1e12},
 "paper":{"source":"arXiv:2609.20807v1, section5.4; appendixA.1,A.4,B",
 "metric":"training accuracy","fp8":{"PG":.58},
 "fp4KV":{"SC":.52,"TIS":.51},
 "int8Int4":{"SC":.30,"TIS":.12,"otherUpperBound":.05},
 "stalenessSyncInterval":64,"defaultTopK":128,"testedTopK":[32,128],
 "jaxWallClockDifferenceUpperBound":.01}
}
Path(__file__).with_name("values.json").write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n")
print(json.dumps(data,ensure_ascii=False,indent=2))
