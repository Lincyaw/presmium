(implement)=
# 用 Python 实现

:::{slide}
1. 统计相邻对
2. 一行一行地看
3. 动手：合并一对
4. 训练循环
5. 在浏览器里训练
:::

接下来把手算的过程写成代码。完整的实现在示例仓库的 `src/bpe.py` 中，只有几十行；这一章逐个函数地读它，中间请你动手写其中一个。

(implement-stats)=
## 统计相邻对

```{code-ref} region:e2e/fixtures/regression/code/bpe.py#get_stats
```

`get_stats` 统计每一对相邻 id 出现的次数，返回一个字典：键是一对 id，值是次数。这个函数在仓库里改过两次，我们按提交的先后看它的三个版本。第一版用下标遍历，`ids[i]` 和 `ids[i + 1]` 组成一对，循环只走到倒数第二个元素。

第二版用 `zip(ids, ids[1:])`，把序列和错开一位的自己配对，直接得到每一对相邻元素。不再需要下标，也就不会把边界写错。

第三版换成标准库的 `Counter`，计数交给它来做。三个版本的结果完全相同，字典里的键都按第一次出现的先后排列，这一点后面挑选次数最多的一对时会用到。

(implement-trace)=
## 一行一行地看

```{step-run} python
:steps: 16
ids = [97, 98, 97, 98, 99]  # "ababc" 的字节
counts = {}
for pair in zip(ids, ids[1:]):
    counts[pair] = counts.get(pair, 0) + 1
    print(pair, "出现", counts[pair], "次")
print(counts)
```

这是第二版 `get_stats` 的循环，作用在字符串 `ababc` 的五个字节上。每前进一步就执行一行代码：高亮的是刚刚执行的那一行，旁边是到这一步为止的输出。

循环一共处理了四对相邻的字节，其中 `(97, 98)`，也就是 `ab`，出现了两次，所以它会是第一个被合并的对。后退一步，输出也会退回上一步的样子。

(implement-merge)=
## 动手：合并一对

````{exercise} python
补全函数 `merge(ids, pair, new_id)`：从左到右，把 `ids` 中每一处相邻的 `pair` 换成 `new_id`，返回新的列表。

```python
def merge(ids, pair, new_id):
    out = []
    i = 0
    while i < len(ids):
        if (ids[i], ids[i + 1]) == pair:
            out.append(new_id)
            i += 2
        else:
            out.append(ids[i])
            i += 1
    return out
```

```python
assert merge([1, 2, 3, 1, 2], (1, 2), 9) == [9, 3, 9], "[1, 2, 3, 1, 2] 合并 (1, 2) 后应为 [9, 3, 9]"
assert merge([1, 1, 1], (1, 1), 9) == [9, 1], "重叠时从左往右合并：[1, 1, 1] 应为 [9, 1]"
assert merge([5], (1, 2), 9) == [5], "只有一个元素时没有可合并的对，原样返回"
```
````

起始代码看上去没问题，第一个例子也能通过，但在另外两个例子上会出错。先读一遍代码，想想 `i` 指向最后一个元素时会发生什么，再提交运行校验。

(implement-train)=
## 训练循环

```{code-ref} symbol:e2e/fixtures/regression/code/bpe.py#train
:steps: bytes, count, pick, merge
```

`train` 把前面的函数串在一起。第一步，把文本按 UTF-8 编码成字节，得到最初的 id 序列；`merges` 按先后记下学到的合并规则。新词元的编号从 256 开始，因为 0 到 255 已经分给了单个字节。

第二步，统计当前序列中每一对相邻 id 的次数。序列只剩一个 id 时没有可数的对，训练提前结束。

第三步，`max(stats, key=stats.get)` 选出次数最多的一对。打成平手时，`max` 返回先遇到的那一个，也就是先出现的一对，和手算时的约定一致。

第四步，把这一对合并成新 id，并记进 `merges`。循环每转一圈，词表就多一个词元，直到达到 `vocab_size`。代码上方的链接指向仓库中这段代码所在的提交，可以点开查看完整的文件。

(implement-run)=
## 在浏览器里训练

```{run-panel} python
:params: {num_merges: 4}
words = ["low"] * 5 + ["lower"] * 2 + ["newest"] * 6 + ["widest"] * 3
tokens = [bytes([b]) for b in " ".join(words).encode()]
for _ in range(num_merges):
    pairs = list(zip(tokens, tokens[1:]))
    a, b = max(pairs, key=pairs.count)
    i, out = 0, []
    while i < len(tokens):
        hit = tokens[i:i + 2] == [a, b]
        out.append(a + b if hit else tokens[i])
        i += 2 if hit else 1
    tokens = out
    print(f"合并 {(a + b).decode()!r}，剩 {len(tokens)} 个词元")
```

这是一个精简的训练过程。训练文本由 `low`、`lower`、`newest`、`widest` 四个词重复组成，共 94 个字节。为了方便阅读，词元直接用字节串表示，而不是编号；参数 `num_merges` 是合并的轮数。点“运行”，代码就在你的浏览器里执行，每合并一次打印一行。

把 `num_merges` 改成 10 再运行一次，面板会对比两次运行：多出了哪几条合并，词元又少了多少。`est`、`low`、`new` 这些常见的片段最先被合并出来；到第十轮，94 个字节只剩 27 个词元，甚至出现了跨越两个词的 `'newest newest '`。
