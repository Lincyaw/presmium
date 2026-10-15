(guide)=
## 引导

:::{hints}
slides: { class: pm-guide }
:::

光标、聚光与提示都由步骤驱动：后退或直接跳到某一步，画面与逐步前进到那一步一致。下面是一个模拟的搜索界面，引导指令按 CSS 选择器指向其中的元素。

<div class="pm-guide-app">
  <input id="guide-query" value="presmium" readonly aria-label="关键字">
  <button id="guide-run" type="button">搜索</button>
  <button id="guide-help" type="button" aria-label="帮助">?</button>
  <div id="guide-output" class="pm-guide-app__output"><p>找到 3 条结果</p></div>
</div>

<style>
.pm-guide-app {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 0.5rem;
  margin-top: 1.5rem;
  padding: 1rem;
  border: 1px solid rgb(125 125 125 / 0.4);
  border-radius: 0.5rem;
}
.pm-guide-app input {
  min-width: 0;
  padding: 0.25rem 0.5rem;
  border: 1px solid rgb(125 125 125 / 0.4);
  border-radius: 0.25rem;
  background: transparent;
}
.pm-guide-app button {
  padding: 0.25rem 0.75rem;
  border-radius: 0.25rem;
  background: #0369a1;
  color: #fff;
}
.pm-guide-app__output {
  grid-column: 1 / -1;
  min-height: 6rem;
  padding: 0.5rem 0.75rem;
  border-radius: 0.25rem;
  background: rgb(125 125 125 / 0.1);
}
/* The results show once the cursor has clicked the search button. */
.pm-guide-app__output p {
  visibility: hidden;
}
#guide-run[data-pm-cursor='click'] ~ .pm-guide-app__output p {
  visibility: visible;
}
</style>

:::{cursor}
:reveal:
#guide-query
hover #guide-run
click #guide-run
:::

光标移到输入框。

光标悬停在“搜索”按钮上。

光标点击“搜索”，结果出现。

:::{spotlight} #guide-output
:reveal:
:title: 搜索结果
点击搜索后，结果出现在这里。
:::

聚光结果区域，其余部分变暗。聚光时按 Tab 键，焦点落在被聚光的区域上。

:::{hint} #guide-help
:reveal:
:title: 帮助
不确定关键字怎么写时，点这里查看语法。
:::

“帮助”按钮上出现提示动画，点击提示点可以看到说明。
