---
"@lincyaw/presmium": patch
"@lincyaw/web": patch
"@lincyaw/addon-publish": patch
---

The cloud can run on the server's bare IP at one address (`install.sh --ip`): Caddy routes the console, sign-in, Studio and shared pages by path, shared pages run sandboxed, and the certificate comes from Let's Encrypt for a public IP or Caddy's own CA otherwise. `--registry` pulls from a mirror and failed pulls say why. The viewer starts in sandboxed pages.
