(encode)=
# 用学到的规则分词

:::{slide}
1. 编码：按学到的先后合并
2. 解码：把字节拼回来
3. 在分词器里看结果
4. 自己分词
5. 小测验
:::

训练得到的合并规则表，就是分词器的全部知识。这一章用它给新文本分词，也就是编码；再把编号还原成文本，也就是解码。

(encode-order)=
## 编码：按学到的先后合并

```{code-ref} symbol:examples/sample-repo/src/bpe.py#encode
:pin: dd64ade
```

给新文本分词时，同样从字节开始，然后反复合并。不同的是，这时不再看次数，而是看规则学到的先后：在当前序列的所有相邻对中，找出最早学到的那条规则来合并。`merges.get(p, float("inf"))` 让没学过的对排在最后；如果连排在最前面的一对都没学过，说明已经没有可用的规则，编码结束。

为什么要按先后？因为后学到的规则建立在先学到的规则之上。手算时 `Z = aa` 先于 `Y = Za` 学到，编码时也必须先合并出 `Z`，才可能出现 `Z a` 这一对。

(encode-decode)=
## 解码：把字节拼回来

```{code-ref} symbol:examples/sample-repo/src/bpe.py#decode
:pin: dd64ade
```

解码要简单得多。先建一张表，写出每个 id 代表的字节串：0 到 255 是单个字节，之后每条规则的新 id 等于它合并的两个 id 的字节串连在一起。规则是按学到的先后排列的，所以建表时用到的 id 一定已经在表里。

然后把每个 id 换成字节串，拼起来按 UTF-8 解码。模型生成的 id 序列有可能停在一个汉字的三个字节中间，`errors="replace"` 让这种不完整的字节显示为替换符号 �，而不是直接报错。

(encode-playground)=
## 在分词器里看结果

<div class="bpe-playground">
  <input id="bpe-text" value="slowest" readonly aria-label="要分词的文本">
  <button id="bpe-run" type="button" disabled aria-disabled="true">分词</button>
  <button id="bpe-vocab" type="button" disabled aria-disabled="true">词表</button>
  <div id="bpe-output" class="bpe-playground__output">
    <p class="bpe-playground__tokens"><span>s<small>115</small></span><span>low<small>260</small></span><span>est<small>257</small></span></p>
    <p class="bpe-playground__count">3 个词元，7 个字节</p>
  </div>
</div>

<style>
.bpe-playground {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 0.5rem;
  margin-top: 1.5rem;
  padding: 1rem;
  border: 1px solid rgb(125 125 125 / 0.4);
  border-radius: 0.5rem;
}
.bpe-playground input {
  min-width: 0;
  padding: 0.25rem 0.5rem;
  border: 1px solid rgb(125 125 125 / 0.4);
  border-radius: 0.25rem;
  background: transparent;
  font-family: var(--slidev-code-font-family, ui-monospace, monospace);
}
.bpe-playground button {
  padding: 0.25rem 0.75rem;
  border-radius: 0.25rem;
  background: #0369a1;
  color: #fff;
  cursor: default;
}
.bpe-playground__output {
  grid-column: 1 / -1;
  min-height: 7rem;
  padding: 0.5rem 0.75rem;
  border-radius: 0.25rem;
  background: rgb(125 125 125 / 0.1);
}
.bpe-playground__output p {
  margin: 0.25rem 0;
}
.bpe-playground__tokens {
  display: flex;
  gap: 0.25rem;
  font-family: var(--slidev-code-font-family, ui-monospace, monospace);
}
.bpe-playground__tokens span {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  padding: 0.1rem 0.5rem;
  border: 1px solid rgb(3 105 161 / 0.6);
  border-radius: 0.25rem;
  background: rgb(14 165 233 / 0.15);
}
.bpe-playground__tokens small {
  font-size: 0.7em;
}
/* Where the cursor plays (the web form and the slides), the result shows once it has clicked the
   button; elsewhere (a notebook) it is always shown. */
:is(.pm-section, .pm-present, .slidev-layout) .bpe-playground__output p {
  visibility: hidden;
}
#bpe-run[data-pm-cursor='click'] ~ .bpe-playground__output p {
  visibility: visible;
}
</style>

很多分词器都提供这样的演练场：输入一段文本，就能看到它被切成了哪些词元。本节的演练场只是示意，按钮不会响应点击，结果是预先算好的：分词器用 `src/bpe.py` 在上一章“在浏览器里训练”的那段文本上学了 10 条规则。下一节可以自己运行这个分词器。

:::{cursor}
:reveal:
#bpe-text
hover #bpe-run
click #bpe-run
:::

先在输入框里写下要分词的文本 `slowest`。训练文本里并没有这个词。

然后把鼠标移到“分词”按钮上。

点击之后，结果出现在下方。

:::{spotlight} #bpe-output
:reveal:
:title: 分词结果
每个色块是一个词元，下面的小字是它的编号。
:::

`slowest` 被切成了 `s`、`low`、`est` 三个词元。`low` 和 `est` 都是训练中学到的片段，`s` 没有可用的规则，就保留为单个字节。没见过的词也能用学过的片段拼出来，这正是子词分词的好处。

:::{hint} #bpe-vocab
:reveal:
:title: 词表
在真实的演练场中，这个按钮列出全部 266 个词元：256 个字节，加上学到的 10 条规则。
:::

想知道某个编号代表什么，就去词表里查：编号 256 以后的词元，都是由两个更早的词元拼成的。

(encode-run)=
## 自己分词

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

这就是 `src/bpe.py` 中的 `get_stats`、`merge`、`train` 与 `encode`，训练文本也和上一章相同。代码先学 10 条规则，再给参数 `text` 分词，打印每个词元的文字与编号；文字来自末尾像解码那样建起的词表。点“运行”，得到的正是上一节演练场中的 `s`、`low`、`est`。

把 `text` 改成 `newer`、`lowest` 或者你自己的词再运行，面板会对比两次的结果。训练文本里没有的字母只能保留为单个字节，学过的片段则会合并成一个词元。

(encode-quiz)=
## 小测验

```{quiz}
编码新文本时，按什么顺序应用合并规则？

- [ ] 按这一对在新文本中出现的次数，从多到少
- [x] 按规则学到的先后，先学到的先用
- [ ] 按合并后词元的长度，从长到短
```

训练时看次数，编码时看先后，这是初学者最容易混淆的地方。
