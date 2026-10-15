---
title: Running Code
lang: en-US
plugins:
  - '@presmium/slidev-addon-core'
  - '@presmium/slidev-addon-exec'
  - '@presmium/slidev-addon-exec-local'
  - '@presmium/slidev-addon-publish'
presmium:
  presmium.publish:
    offline: false
renderers:
  web:
    lang: en-US
  slides:
    theme: default
---

# Running Code

An English deck: the execution, local environment and publishing plugins speak English.

(js-panel)=
## JavaScript

```{run-panel} javascript
:params: {n: 4}
:run: live
for (let i = 1; i <= n; i++) console.log(i, i * i)
```

(ts-panel)=
## TypeScript

```{run-panel} typescript
:params: {who: Presmium}
:run: live
interface Greeting { text: string }
const greet = (name: string): Greeting => ({ text: `Hello, ${name}` })
console.log(greet(who).text)
```

(js-timeout)=
## Timeout

```{run-panel} javascript
:timeout: 1000
:run: live
:recorded: settled at 1.4142135623730951 (recorded)
let x = 1
while (true) x = (x + 2 / x) / 2
```

(js-later)=
## Later output

```{run-panel} javascript
setTimeout(() => console.log('later'), 50)
console.log('now')
```

(js-live)=
## Live code

```{code} javascript
:run: live
const words = ['run', 'in', 'the', 'browser']
console.log(words.map(w => w.toUpperCase()).join(' '))
```

(local-env)=
## Local environment

```{local-env} python
:file: hello.py
print("hello")
```
