---
"@lincyaw/viewer": patch
"@lincyaw/addon-motion": patch
"@lincyaw/web": patch
"@lincyaw/skills": patch
---

On a web page with several scrolling sections, a scene plays its step's motion again as the reader scrolls to the step, instead of showing the step's last frame: only the section across the reading line moves the reader's place, where every one of them used to, so that the last section on the page held it. The outline follows the section being read. A scene is built again only when the step's state or a parameter it read while building changes, so a scene whose timeline covers every step keeps it from step to step instead of rebuilding (a pause of a whole build at every step); the library helpers pass the context on without reading it. On a reading page a scene is built as it comes within a screen of the window, while the page is idle, instead of every scene at once when the page opens. The site marks a page with scrolling sections with an attribute instead of a `:has()` selector, which made the browser restyle the whole page at every change a scene made while building.
