---
'@lincyaw/kernel': minor
'@lincyaw/viewer': minor
'@lincyaw/addon-lecture': minor
'@lincyaw/workbench': minor
'@lincyaw/dsh': minor
'create-presmium': patch
---

The workbench owns its keyboard. While presenting, Space plays or pauses the lecture (and still moves to the next step when there is nothing to play); in Video Production, Space plays or pauses and the left and right arrows select the previous or next step, also while the preview has the focus (preview frames with `presmium-keys=playback` send them as the `shortcut` commands `play-pause`, `previous` and `next`). Ctrl+S (⌘S) saves at once anywhere, fields included, instead of opening the browser's Save dialog (the `save` shortcut command from the preview). A click no longer makes Space press the clicked button again: `@lincyaw/kernel` exports `keyBelongsToTarget` and `watchFocusSource`, under which text fields, editors, open menus and dialogs keep every key, a control reached with the keyboard keeps the keys it uses, and a clicked control gives Space and the arrows to the page. A viewer plugin's action now runs before the built-in action on the same key. The keys are listed as fixed rows in Settings → Keyboard Shortcuts.
