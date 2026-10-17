(exec-long)=
## 长代码的面板

```{run-panel} python
:params: {text: slowest}
from collections import Counter


def get_stats(ids):
    return Counter(zip(ids, ids[1:]))


def merge(ids, pair, new_id):
    out, i = [], 0
    while i < len(ids):
        if i + 1 < len(ids) and (ids[i], ids[i + 1]) == pair:
            out.append(new_id)
            i += 2
        else:
            out.append(ids[i])
            i += 1
    return out


def train(text, vocab_size):
    ids = list(text.encode("utf-8"))
    merges = {}
    for new_id in range(256, vocab_size):
        stats = get_stats(ids)
        if not stats:
            break
        pair = max(stats, key=stats.get)
        ids = merge(ids, pair, new_id)
        merges[pair] = new_id
    return merges


def encode(text, merges):
    ids = list(text.encode("utf-8"))
    while len(ids) >= 2:
        stats = get_stats(ids)
        pair = min(stats, key=lambda p: merges.get(p, float("inf")))
        if pair not in merges:
            break
        ids = merge(ids, pair, merges[pair])
    return ids


corpus = " ".join(["low"] * 5 + ["lower"] * 2 + ["newest"] * 6 + ["widest"] * 3)
merges = train(corpus, 266)
vocab = {i: bytes([i]) for i in range(256)}
for (a, b), new_id in merges.items():
    vocab[new_id] = vocab[a] + vocab[b]
ids = encode(text, merges)
tokens = [vocab[i].decode("utf-8", errors="replace") for i in ids]
print(f"{tokens} {ids}")
```

一个比幻灯片高的面板：代码在面板中滚动，运行按钮、参数与输出留在幻灯片上，代码的字号不变。
