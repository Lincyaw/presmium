(code-steps)=
## 代码引用：分步高亮

引用业务仓库中的代码，不把代码复制进文稿。代码来自 `e2e/fixtures/code/cart.ts` 的 checkout 区间，锁定在提交 6e4072a；幻灯片标题栏和网页代码块上的链接指向远端仓库中这个提交的对应行，徽标显示工作区中的代码是否已经改变。

```{code-ref} region:e2e/fixtures/code/cart.ts#checkout
:pin: 6e4072a
:steps: validate, price, receipt
:repo: https://github.com/Lincyaw/presmium
```

第一步：购物车为空时直接报错。嵌套的 `#region` 标出逻辑单元，编译时换算成每一步高亮的行。

第二步：按数量计算小计，再算出优惠券折扣。

第三步：生成收据文本。

(code-variants)=
## 代码引用：多版本切换

同一个函数在三个提交中的写法，随步骤原地切换。锚点按语法树找到函数，被引用的代码不需要任何标记。

```{code-ref} symbol:e2e/fixtures/code/cart.ts#total
:variants: 6e4072a, c4c6310, f6960cc
:repo: https://github.com/Lincyaw/presmium
```

total 的第一个版本：下标循环。

第二个版本改为 for-of 循环。

第三个版本改为 reduce 一行求和。

(code-syntax)=
## 代码引用：写法

````md
```{code-ref} region:e2e/fixtures/code/cart.ts#checkout
:pin: 6e4072a
:steps: validate, price, receipt
```
````

指令的参数是锚点：`region:<文件>#<区间名>`，或 `symbol:<文件>#<类名.方法名>`（TypeScript、JavaScript、Python），文件相对于仓库根目录。可选项：

- `:pin:` 锁定的提交；省略时读取工作区
- `:steps:` 逐步高亮的逻辑单元，即锚点内嵌套的 `#region`
- `:variants:` 逐步切换的提交列表
- `:lang:` 高亮语言，默认取文件扩展名
- `:repo:` 永久链接使用的仓库网址，默认取 `presmium.code.repo` 或 `origin` 远端
- `:run:` 编译时执行，输出随代码一起出现在各种媒介中

`presmium check` 报告失效的锚点、待确认的模糊匹配，以及锁定提交之后代码的漂移和差异。
