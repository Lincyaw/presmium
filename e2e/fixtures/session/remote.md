(remote)=
## 共享状态

:::{hints}
slides: { routeAlias: remote }
:::

e2e/session.spec.ts 在有课堂服务的副本中包含这一页，并加上 e2e/fixtures/core 的夹具插件：它的计数器是 `useSharedState(…, { scope: 'remote' })`，主讲的修改经课堂到达学习者。

```{component} FixtureShared
```
