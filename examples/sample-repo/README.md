# sample-repo

示例讲义（`examples/demo`，“BPE 分词”）引用的代码仓库。

- `src/bpe.py`：字节级 BPE 分词器，包括训练（`train`）、编码（`encode`）与解码（`decode`）。讲义中的代码块直接引用这个文件，按逻辑单元（`#region`）分步高亮，或锁定到某个提交；`get_stats` 的三个版本来自这个文件的提交历史。
- `.devcontainer/devcontainer.json`：运行这些代码的开发容器（Python 3.12）。

在本目录运行：

```sh
python3 src/bpe.py
```

它在一小段文本上学习 10 条合并规则，打印学到的词元，再给 `lowest` 分词。
