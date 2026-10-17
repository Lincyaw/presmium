---
title: 现场代码与表格
plugins:
  - ../../../../addon-core
  - ../../../../addon-exec
renderers:
  slides:
    package: ../../..
    base: /slides/
    transition: none
---

# 现场代码与表格

(live)=
## 现场代码

```{code} python
:run: both
print("LIVE-RECORDED", 6 * 7)
```

(only-live)=
## 只在现场

```{code} python
:run: live
print("only live")
```

(table)=
## 表格

```{code} python
:run:
from IPython.display import HTML
rows = "".join(f"<tr><td>row {i}</td><td>{i * i}</td></tr>" for i in range(12))
display(HTML(f"<style scoped>.dataframe td {{ color: red }}</style><table><thead><tr><th>name</th><th>square</th></tr></thead><tbody>{rows}</tbody></table><script>window.fixtureScript = 1</script>"))
```
