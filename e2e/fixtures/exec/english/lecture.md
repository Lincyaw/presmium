---
title: Running Code
# A language Presmium has no messages for: the interface follows the browser (English in the tests).
lang: fr
plugins:
  - '@lincyaw/addon-core'
  - '@lincyaw/addon-exec'
  - '@lincyaw/addon-exec-local'
  - '@lincyaw/addon-publish'
presmium:
  presmium.publish:
    offline: false
renderers:
  web: {}
  slides:
    theme: default
---

# Running Code

A deck in French, a language Presmium has no messages for: the execution, local environment and publishing plugins speak the browser's language, English.

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

(js-rejected)=
## A promise rejected later

```{run-panel} javascript
new Promise((_, reject) => setTimeout(() => reject(new Error('late')), 20))
console.log('started')
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
