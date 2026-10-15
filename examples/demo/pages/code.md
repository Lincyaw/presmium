---
routeAlias: code-steps
presmium:
  presmium.code:
    repo: https://github.com/presmium/presmium
---

# 代码引用：分步高亮

引用业务仓库中的代码并锁定到提交；嵌套的 `#region` 标出逻辑单元，随步骤依次高亮。

```coderef
anchor: region:examples/sample-repo/coderef/cart.ts#checkout
pin: 669aa6b
steps: [validate, price, receipt]
```

<!--
代码来自 examples/sample-repo/coderef/cart.ts 的 checkout 区间，锁定在提交 669aa6b。标题栏的链接指向远端仓库中这个提交的对应行，徽标显示工作区中的代码是否已经改变。

第一步：购物车为空时直接报错。

[click] 第二步：按数量计算小计，再算出优惠券折扣。

[click] 第三步：生成收据文本。
-->

---
routeAlias: code-variants
presmium:
  presmium.code:
    repo: https://github.com/presmium/presmium
---

# 代码引用：多版本切换

同一个函数在三个提交中的写法，随步骤原地切换。锚点按语法树找到函数，被引用的代码不需要任何标记。

```coderef
anchor: symbol:examples/sample-repo/coderef/cart.ts#total
variants: [669aa6b, 6a2119a, 5a20e7c]
```

<!--
total 的三个版本：下标循环。

[click] 改为 for-of 循环。

[click] 改为 reduce 一行求和。
-->

---

# 代码引用：写法

代码块的语言写 `coderef`，内容是 YAML：

````md
```coderef
anchor: region:examples/sample-repo/coderef/cart.ts#checkout
pin: 669aa6b
steps: [validate, price, receipt]
```
````

- `anchor`：`region:<文件>#<区间名>` 或 `symbol:<文件>#<符号名>`，文件相对于仓库根目录
- `pin`：锁定的提交；省略时读取工作区
- `steps`：逐步高亮的逻辑单元，即锚点内嵌套的 `#region`
- `variants`：逐步切换的提交列表
- `lang`：高亮语言，默认取文件扩展名

`presmium check` 报告失效的锚点、待确认的模糊匹配，以及锁定提交之后代码的漂移和差异。
