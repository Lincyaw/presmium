"""字节级 BPE（字节对编码）分词器：从文本中学习合并规则，再用它编码与解码。

运行 `python3 src/bpe.py`，在一小段文本上训练，看看学到的词元与分词结果。
"""


# #region get_stats
from collections import Counter


def get_stats(ids):
    """统计每一对相邻 id 出现的次数。"""
    return Counter(zip(ids, ids[1:]))
# #endregion get_stats


def merge(ids, pair, new_id):
    """从左到右，把 ids 中每一处相邻的 pair 换成 new_id。"""
    out = []
    i = 0
    while i < len(ids):
        if i + 1 < len(ids) and (ids[i], ids[i + 1]) == pair:
            out.append(new_id)
            i += 2
        else:
            out.append(ids[i])
            i += 1
    return out


def train(text, vocab_size):
    """从 text 中学习 vocab_size - 256 条合并规则，按学到的先后排列。"""
    # #region bytes
    ids = list(text.encode("utf-8"))
    merges = {}
    # #endregion bytes
    for new_id in range(256, vocab_size):
        # #region count
        stats = get_stats(ids)
        if not stats:
            break
        # #endregion count
        # #region pick
        pair = max(stats, key=stats.get)
        # #endregion pick
        # #region merge
        ids = merge(ids, pair, new_id)
        merges[pair] = new_id
        # #endregion merge
    return merges


def encode(text, merges):
    """把 text 切成 id：先取字节，再按学到的先后应用合并规则。"""
    ids = list(text.encode("utf-8"))
    while len(ids) >= 2:
        stats = get_stats(ids)
        pair = min(stats, key=lambda p: merges.get(p, float("inf")))
        if pair not in merges:
            break
        ids = merge(ids, pair, merges[pair])
    return ids


def decode(ids, merges):
    """把 id 还原成文本：每个 id 对应一串字节，拼起来再按 UTF-8 解码。"""
    vocab = {i: bytes([i]) for i in range(256)}
    for (a, b), new_id in merges.items():
        vocab[new_id] = vocab[a] + vocab[b]
    return b"".join(vocab[i] for i in ids).decode("utf-8", errors="replace")


if __name__ == "__main__":
    corpus = " ".join(["low"] * 5 + ["lower"] * 2 + ["newest"] * 6 + ["widest"] * 3)
    merges = train(corpus, 256 + 10)
    vocab = {i: bytes([i]) for i in range(256)}
    for (a, b), new_id in merges.items():
        vocab[new_id] = vocab[a] + vocab[b]
        print(f"{new_id}: {vocab[new_id].decode('utf-8')!r}")
    ids = encode("slowest", merges)
    print("slowest ->", [vocab[i].decode("utf-8") for i in ids], ids)
    assert decode(ids, merges) == "slowest"
