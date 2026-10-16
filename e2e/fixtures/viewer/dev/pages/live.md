(components)=
## 组件

出错的组件在作者修好之后恢复，不需要刷新页面。

:::{component} FixtureBoom
fail: true
:::

逐个出现的词：每个词一步，最后一个字在它们之后。

:::{component} FixtureClicks
:span: 4
items: [甲, 乙, 丙]
:::

## 会改名的一节

:::{slide}
:reveal: items
- 第一点
- 第二点
:::

这一节没有标签，它的 id 来自标题。

(slow)=
## 慢代码

```{code} javascript
:run: live
const end = Date.now() + 4000
while (Date.now() < end) {}
console.log('旧代码的输出')
```

这段代码运行四秒。
