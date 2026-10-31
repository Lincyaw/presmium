---
"@lincyaw/language-server": patch
---

Include the host and viewer dependencies required by the web renderer so editor previews work when installed outside the monorepo, and stop the preview process tree on Windows when the language server shuts down. The VS Code extension now packages a complete runtime in platform-specific VSIX files, with CI builds attached to GitHub Releases.
