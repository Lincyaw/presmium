---
'@lincyaw/workbench': patch
---

New Comment keeps the document where it was and puts the caret in the comment box. In a document with a block notice, the comment box used to mark the blocks as hidden, the editor redrew every block, the canvas scrolled away and the box lost focus. A recovered comment draft now scrolls its text into view and takes the focus too.
