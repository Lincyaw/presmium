---
title: Tall export fixture
plugins:
  - PACKAGES_DIR/addon-core
  - PACKAGES_DIR/addon-exec
  - ADDON_DIR
renderers:
  slides:
    theme: default
    fonts:
      provider: none
---

## Tall

:::{hints}
slides: { zoom: 0.65 }
:::

```{code} python
:run: both
# A long program on a zoomed slide, as the demo's C slide is.
# line 3
# line 4
# line 5
# line 6
# line 7
# line 8
# line 9
# line 10
# line 11
# line 12
# line 13
# line 14
# line 15
# line 16
# line 17
# line 18
# line 19
# line 20
print("TALL-OUTPUT", 6 * 7)
```

## Overflow

```text
A block much taller than the slide.
line 2
line 3
line 4
line 5
line 6
line 7
line 8
line 9
line 10
line 11
line 12
line 13
line 14
line 15
line 16
line 17
line 18
line 19
line 20
line 21
line 22
line 23
line 24
line 25
line 26
line 27
line 28
line 29
line 30
line 31
line 32
line 33
line 34
line 35
line 36
line 37
line 38
line 39
line 40
OVERFLOW-END
```

## After one

The third slide.

## After two

The fourth slide.

## Panel

```{run-panel} python
# A run panel longer than the slide: its static form keeps the recorded output on the page.
# line 2
# line 3
# line 4
# line 5
# line 6
# line 7
# line 8
# line 9
# line 10
# line 11
# line 12
# line 13
# line 14
# line 15
# line 16
# line 17
# line 18
# line 19
# line 20
# line 21
# line 22
# line 23
# line 24
# line 25
# line 26
# line 27
# line 28
# line 29
# line 30
# line 31
# line 32
# line 33
# line 34
# line 35
# line 36
# line 37
# line 38
# line 39
# line 40
# line 41
# line 42
# line 43
# line 44
# line 45
print("PANEL-OUTPUT", 6 * 7)
```
