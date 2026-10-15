---
class: pm-guide
---

# 引导

<div class="grid grid-cols-[3fr_2fr] gap-10 mt-8">
<div class="pm-guide-app">
  <div class="pm-guide-app__bar">
    <input id="guide-query" value="presmium" readonly aria-label="关键字">
    <button id="guide-run" type="button">搜索</button>
    <button id="guide-help" type="button" aria-label="帮助">?</button>
  </div>
  <div id="guide-output" class="pm-guide-app__output">
    <p v-click="3">找到 3 条结果</p>
  </div>
</div>
<div>

1. 光标移到输入框
2. 悬停在“搜索”按钮上
3. 点击“搜索”
4. 聚光结果区域
5. 提示“帮助”按钮可以点击

</div>
</div>

<PmCursor :path="[{ to: '#guide-query' }, { to: '#guide-run', action: 'hover' }, { to: '#guide-run', action: 'click' }]" />
<PmSpotlight target="#guide-output" at="4" until="5" title="搜索结果" text="点击搜索后，结果出现在这里。" />
<PmHint target="#guide-help" at="5" title="帮助" text="不确定关键字怎么写时，点这里查看语法。" />

<style>
.pm-guide-app {
  border: 1px solid rgb(125 125 125 / 0.4);
  border-radius: 0.5rem;
  padding: 1rem;
}
.pm-guide-app__bar {
  display: flex;
  gap: 0.5rem;
}
.pm-guide-app__bar input {
  flex: 1;
  min-width: 0;
  padding: 0.25rem 0.5rem;
  border: 1px solid rgb(125 125 125 / 0.4);
  border-radius: 0.25rem;
  background: transparent;
}
.pm-guide-app__bar button {
  padding: 0.25rem 0.75rem;
  border-radius: 0.25rem;
  background: #0ea5e9;
  color: #fff;
}
.pm-guide-app__output {
  margin-top: 1rem;
  min-height: 6rem;
  padding: 0.5rem 0.75rem;
  border-radius: 0.25rem;
  background: rgb(125 125 125 / 0.1);
}
</style>

<!--
光标、聚光与提示都由步骤驱动：后退或直接跳到某一步，画面与逐步前进到那一步一致。

[click] 光标移到输入框。

[click] 光标悬停在“搜索”按钮上。

[click] 光标点击“搜索”，结果出现。

[click] 聚光结果区域，其余部分变暗。

[click] “帮助”按钮上出现提示动画，点击提示点可以看到说明。
-->
