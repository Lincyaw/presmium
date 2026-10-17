(wrapup)=
# 回顾与展望

:::{slide}
1. 知识地图
2. 提问与反馈
3. 继续学习
:::

最后把这一课的内容串起来，并给出继续学习的方向。

(wrapup-map)=
## 知识地图

````{markmap}
# BPE 分词
## 出发点
- 256 个字节
- 任何文本都能表示
## 训练
- 统计相邻对
- 合并次数最多的一对
- 按先后记下规则
## 编码
- 从字节开始
- 按学到的先后合并
## 解码
- 查表拼接字节
- 按 UTF-8 还原
## 取舍
- 词表大小
- 序列长度
## 延伸
- C 与 WebAssembly
- GPU 上并行统计
````

BPE 的内容都在这张图里。训练从 256 个字节出发，一轮轮合并次数最多的相邻对，得到一张按先后排列的规则表；编码按规则学到的先后合并，解码查表把字节拼回来。词表大小是唯一需要我们决定的量：词表越大，序列越短，但模型要为更多词元学习参数。上一章把统计相邻对换成 C 程序和 GPU 来做，得到的结果和 Python 版完全相同。

(wrapup-feedback)=
## 提问与反馈

(bpe-rule)=
:::{slide}
> **一句话记住**：训练看次数，编码看先后。
:::

```{question-box}
:target: bpe-rule
哪里还不清楚？写下你的问题，老师会在课上回答。
```

```{pulse} 训练和编码的区别，你弄清楚了吗？
```

上课时，你可以在这里向老师提问，问题挂在上面这句话上，老师在自己的面板里按位置看到它；也可以告诉老师你理解了多少。

:::{only} web
自己阅读时，可以用每一节旁边的“笔记”按钮记下想法，笔记只保存在你的浏览器里。
:::

(wrapup-next)=
## 继续学习

:::{slide}
- **预分词**：先按空格与标点切开，合并不跨越词的边界
- **特殊词元**：例如标记文本结束的词元，不参与合并
- **其他子词方法**：WordPiece、Unigram
:::

我们的实现直接在整段文本上合并，所以会学出 `'newest newest '`、`' low low'` 这样跨越两个词的词元。实际使用的分词器会先用规则把文本切成单词、数字、标点和空白等小段，这一步叫作预分词，合并只在每一段内部进行。

此外，分词器还会预留一些特殊词元，例如 GPT-2 用 `<|endoftext|>` 标出一段文本的结束，它们不经过合并，直接对应固定的编号。BPE 也不是唯一的子词方法，WordPiece 和 Unigram 用不同的标准挑选词元，思路却很相近。

想深入了解，可以读这几篇文献：

- Philip Gage，*A New Algorithm for Data Compression*，1994：BPE 最早是一种数据压缩算法。
- Rico Sennrich 等，[*Neural Machine Translation of Rare Words with Subword Units*](https://arxiv.org/abs/1508.07909)，2016：把 BPE 用于子词分词。
- Alec Radford 等，*Language Models are Unsupervised Multitask Learners*，2019：GPT-2 的字节级 BPE。
