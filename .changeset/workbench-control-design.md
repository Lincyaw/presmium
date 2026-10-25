---
'@lincyaw/design': patch
---

Add shared target tokens for regular controls, touch hit areas and larger context icons, and register the existing UI icon/font asset sources. Define desktop workbench properties and toolbars as compact controls using the existing 30px height, 13px text and 4/8/12px spacing tokens; regular dialogs use 36px controls, while touch inputs retain 44px hit areas and 16px text. Add an 80px compact narration-editor minimum height without changing the existing 192px editor token; regular textareas retain their 96px minimum.

Specify thin, neutral input borders with sufficient default contrast, distinct focus and error states, and a separate compact Figma component set. Existing controls retain their appearance until their shared styles are migrated.

Register named minimum widths for short numbers, time fields and the desktop canvas. Fix the interaction-state catalog and responsive layout rules in the design documentation without changing current component behavior.

Add shared target colors for primary/accent hover and pressed states and a disabled-opacity token, keeping the current control stylesheet unchanged until migration.

Register semantic editing, timing and loading icons from Lucide so prototypes and future controls use the shared map.
