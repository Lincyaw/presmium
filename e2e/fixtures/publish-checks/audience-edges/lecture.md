---
title: 受众的边界
lang: zh-CN
renderers:
  web: {}
---

# 受众的边界

## 公开的一节

每个人都能看到这一节，关键词 PUBLICTEXT。

```{include} instructor/secret-answers.md
:audience: teacher
```

::::{note}
公开的提示，每个人都能看到。

:::{tip}
:audience: teacher
教师的提示 HIDDENTIP36 用到 {hiddenrole}`x` 这个角色。
:::
::::

## 没写受众的一节

:::{audience}
:::

这一节没有写给谁看，口令 NONAMEKEY63。

## 教师的一节

:::{audience} teacher
:::

教师用到 {secretrole}`x` 这个角色。

```{include} instructor/solutions-final-exam.md
```

## 练习

```{include} part.md
:audience: teacher
```

:::{only} web
:audience: teacher
助教在网页上看的补充 ONLYKEY29。
:::

这一段写在引入之后，本来是给所有人看的 AFTERKEY74。

## 结尾

结尾的话。
