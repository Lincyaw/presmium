(extend)=
# 延伸：换一种语言，换一种硬件

:::{slide}
1. 用 C 统计相邻对
2. 在 GPU 上统计
3. 先训练
4. 下一次合并哪一对？
5. 再编码
6. 延伸阅读
:::

{say alias="B P E"}`BPE` 训练的每一轮都要统计一遍相邻对。真实的分词器要在大量文本上训练出几万条规则，这一步会重复几万次，所以常用编译型语言来写，也可以交给 GPU 并行计算。这一章先把同样的统计换成 C 程序和 GPU 来做，再把训练与编码连起来跑一遍，最后列出可以继续读的代码。

(extend-c)=
## 用 C 统计相邻对

:::{hints}
slides: { zoom: 0.65 }
:::

(c-pairs)=
```{code} c
:run: both
#include <stdio.h>
#include <string.h>

// stats[a][b] 是字节 a 后面紧跟字节 b 的次数
static int stats[256][256];

void get_stats(const unsigned char *ids, int n) {
  for (int i = 0; i + 1 < n; i++) stats[ids[i]][ids[i + 1]] += 1;
}

int main(void) {
  const char *text = "aaabdaaabac";
  const unsigned char *ids = (const unsigned char *)text;
  int n = strlen(text);
  get_stats(ids, n);
  for (int a = 0; a < 256; a++)
    for (int b = 0; b < 256; b++)
      if (stats[a][b] > 0) printf("(%d, %d): %d\n", a, b, stats[a][b]);
  // 和 max(stats, key=stats.get) 一样: 次数相同时取先出现的一对
  int best = 0;
  for (int i = 1; i + 1 < n; i++)
    if (stats[ids[i]][ids[i + 1]] > stats[ids[best]][ids[best + 1]]) best = i;
  printf("次数最多的一对 (%d, %d) 就是 %c %c\n", ids[best], ids[best + 1], text[best], text[best + 1]);
  return 0;
}
```

这是第三章 `get_stats` 的 C 版本，统计的还是手算时的字符串 `aaabdaaabac`。C 没有字典，就用一张 256 行、256 列的表：{cue to=c-pairs lines=4-5}`spot` `stats[a][b]` 记下字节 `a` 后面紧跟字节 `b` 的次数。字节只有 256 种，所以这张表放得下所有可能的对。

`get_stats` 和 Python 版一样，从头到尾看每一对相邻的字节，给表中对应的格子加一。`main` 按字节的大小打印次数不为零的格子，再按 Python 版的规则选出次数最多的一对：次数相同时取先出现的。{cue to=c-pairs}`run`结果和手算的第一轮相同，`a a`，也就是 `(97, 97)`，出现了 4 次。

在网页和幻灯片中点“运行”，这段程序就在你的浏览器里编译、运行：C 编译器本身也编译成了 WebAssembly，所以不用安装任何软件，第一次运行要先下载编译器，大约 50 MB。真实的分词器常用 C++、Rust 这样的编译型语言来写统计与合并，在大量文本上训练时比 Python 快得多。

(extend-gpu)=
## 在 GPU 上统计

:::{hints}
slides: { zoom: 0.6 }
:::

(gpu-pairs)=
```{run-panel} wgsl
---
params:
  buffers:
    text: [97, 97, 97, 98, 100, 97, 97, 97, 98, 97, 99]
    best: { size: 3 }
  repeat: 10
---
@group(0) @binding(0) var<storage, read> text: array<u32>;
@group(0) @binding(1) var<storage, read_write> best: array<u32>;

var<workgroup> counts: array<u32, 256>;

@compute @workgroup_size(256)
fn main(@builtin(local_invocation_index) i: u32) {
  let n = arrayLength(&text);
  // 每个线程数一对：从第 i 个字节开始的一对在文本中出现几次
  var count = 0u;
  if (i + 1u < n) {
    for (var j = 0u; j + 1u < n; j++) {
      if (text[j] == text[i] && text[j + 1u] == text[i + 1u]) {
        count++;
      }
    }
  }
  counts[i] = count;
  workgroupBarrier();
  // 等所有线程都数完，第 0 号线程挑出次数最多的一对
  if (i == 0u) {
    var top = 0u;
    for (var k = 1u; k < 256u; k++) {
      if (counts[k] > counts[top]) {
        top = k;
      }
    }
    best[0] = text[top];
    best[1] = text[top + 1u];
    best[2] = counts[top];
  }
}
```

GPU 有成千上万个小核心，擅长把同一件简单的事同时做很多遍。这段代码用 GPU 的着色器语言 {say alias="W G S L"}`WGSL` 写成，叫作计算着色器（compute shader），它在 GPU 上统计同一个字符串 `aaabdaaabac`。参数 `text` 是字符串的 11 个字节，`best` 用来放结果。

{cue to=gpu-pairs}`spot`着色器一次启动 256 个线程，每个线程只负责一个位置 `i`：数一数从第 `i` 个字节开始的那一对在整个字符串中出现了几次，写进大家共用的数组 `counts`。所有线程同时在数，所以数完全部位置所花的时间，和一个线程数一遍差不多。

`workgroupBarrier()` 让线程在这里等齐：所有线程都数完之后，第 0 号线程才在 `counts` 中挑出次数最多的一对，次数相同时取先出现的。读回的 `best` 依次是这一对的两个字节和它的次数 `[97, 97, 4]`，又是 `a a` 出现 4 次。

在网页和幻灯片中点“运行”，着色器就在你的显卡上运行，面板显示每次运行用了多少时间。浏览器不支持 WebGPU、或者找不到可用的显卡时，面板显示构建讲义时录下的结果，并写明原因。为了好读，这个着色器只用一组 256 个线程，最多处理 257 个字节；处理大量文本时，要把文本分给许多组线程，再把各组的结果合起来。

(extend-train)=
## 先训练

:::{hints}
slides: { zoom: 0.75 }
:::

(train)=
```{code} python
:run: both
:session: bpe
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


corpus = " ".join(["low"] * 5 + ["lower"] * 2 + ["newest"] * 6 + ["widest"] * 3)
ids = list(corpus.encode("utf-8"))
merges = {}
vocab = {i: bytes([i]) for i in range(256)}
for new_id in range(256, 266):
    stats = get_stats(ids)
    pair = max(stats, key=stats.get)
    ids = merge(ids, pair, new_id)
    merges[pair] = new_id
    vocab[new_id] = vocab[pair[0]] + vocab[pair[1]]
print("学到", len(merges), "条规则")
print(len(corpus.encode("utf-8")), "个字节变成了", len(ids), "个词元")
```

现在把训练与编码连起来。这段代码就是第三章的 `get_stats`、`merge` 与训练循环，在同样的训练文本上学 10 条规则，同时像解码那样建起词表 `vocab`，记下每个新词元代表的字节串。

(extend-predict)=
## 下一次合并哪一对？

:::{hints}
slides: { zoom: 0.7 }
:::

(merges-table)=
```{code} python
:run:
:session: bpe
:echo: false
from IPython.display import Markdown

rows = ["| 顺序 | 合并的一对 | 新词元 | 编号 |", "| --- | --- | --- | --- |"]
for order, ((a, b), new_id) in enumerate(merges.items(), start=1):
    rows.append(f"| {order} | `{vocab[a].decode()!r}` 和 `{vocab[b].decode()!r}` | `{vocab[new_id].decode()!r}` | {new_id} |")
display(Markdown("\n".join(rows)))
```

表格按学到的先后列出了上一节的 10 次合并，它由一段只显示输出的代码生成。这段代码和上一节训练的代码属于同一个**会话**（session）：同一会话的代码块共用变量，所以它能直接用训练时算出的 `merges` 与 `vocab`。

:::{predict} 再训练一轮，第 11 次会合并哪一对？
:choices: ' low' 和 ' low', 'w' 和 'i', 'e' 和 'r'
注意空格也是一个字节：`' low'` 是一个空格加上 `low`。
:::

先自己想一想：合并了 10 次之后，`low` 和它前面的空格已经合成了一个词元 `' low'`，训练文本开头的几个 `low` 一个接一个。现在哪一对出现得最多？{cue}`pause 2s`选好答案、保存预测之后，答案才会出现。在课堂上，老师还能看到全班的预测是怎样分布的。

:::{slide}
:reveal:
**`' low'` 和 `' low'`**：这一对在合并了 10 次的文本中出现 4 次，比其他任何一对都多（`'w'` 和 `'i'` 只有 3 次），合并成新词元 `' low low'`，编号 266。
:::

答案是 `' low'` 和 `' low'`。这又是一个跨越两个词的词元，和表中的 `'newest newest '` 一样；为了不学出这样的词元，实际使用的分词器会先做预分词，最后一章会讲到。

(extend-encode)=
## 再编码

(encode-words)=
```{code} python
:run: both
:session: bpe
def encode(text):
    ids = list(text.encode("utf-8"))
    while len(ids) >= 2:
        stats = get_stats(ids)
        pair = min(stats, key=lambda p: merges.get(p, float("inf")))
        if pair not in merges:
            break
        ids = merge(ids, pair, merges[pair])
    return ids


for word in ["lowest", "newer"]:
    tokens = encode(word)
    print(word, [vocab[i].decode() for i in tokens], tokens)
```

编码用的还是第四章的规则：按学到的先后合并。这个代码块没有重新训练，它直接用同一会话中的 `merges`、`vocab` 与 `get_stats`、`merge`。`lowest` 被切成 `low` 和 `est`，编号 260 和 257，和第一章表格中的结果相同；`newer` 中的 `new` 是学过的片段，`e` 和 `r` 没有可用的规则，保留为单个字节。

在网页中，先运行“先训练”一节的代码块，再运行这一块，就可以把单词换成别的再试；没有先训练就运行这一块，会得到 `get_stats` 没有定义的错误。代码块旁的“重置会话”清空这个会话中的全部变量。

(extend-reading)=
## 延伸阅读

:::::{only} web, slides
::::{grid} 1 1 2 2
:::{card} minbpe
:link: https://github.com/karpathy/minbpe
Andrej Karpathy 用 Python 写的最小 BPE 实现，思路和本课相同，另有按正则表达式预分词的版本与 GPT-4 的分词规则。
:::
:::{card} tiktoken
:link: https://github.com/openai/tiktoken
OpenAI 的分词器，用 Rust 实现、提供 Python 接口，GPT 系列模型用它分词。
:::
:::{card} SentencePiece
:link: https://github.com/google/sentencepiece
Google 的 C++ 分词器，直接在原始文本上训练 BPE 或 Unigram，不需要先按空格切词。
:::
:::{card} Hugging Face Tokenizers
:link: https://github.com/huggingface/tokenizers
用 Rust 实现的分词器库，支持 BPE、WordPiece 与 Unigram，许多开源模型用它。
:::
::::
:::::

:::{only} notebook
- [minbpe](https://github.com/karpathy/minbpe)：Andrej Karpathy 用 Python 写的最小 BPE 实现，另有按正则表达式预分词的版本与 GPT-4 的分词规则。
- [tiktoken](https://github.com/openai/tiktoken)：OpenAI 的分词器，用 Rust 实现、提供 Python 接口。
- [SentencePiece](https://github.com/google/sentencepiece)：Google 的 C++ 分词器，直接在原始文本上训练 BPE 或 Unigram。
- [Hugging Face Tokenizers](https://github.com/huggingface/tokenizers)：用 Rust 实现的分词器库，支持 BPE、WordPiece 与 Unigram。
:::

本课的代码都很短，为的是看清每一步。想知道真实的分词器怎样处理大量文本、特殊词元与预分词，可以读这几个项目的代码，从 minbpe 读起最容易。
