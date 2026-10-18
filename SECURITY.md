# Security

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub's private vulnerability reporting: open <https://github.com/Lincyaw/presmium/security/advisories/new> (the repository's Security tab, "Report a vulnerability"). Do not open a public issue for a vulnerability.

Say which package and version you used, how to reproduce the problem, and what an attacker gains. The maintainers acknowledge the report, agree on a fix and a disclosure date with you, and credit you in the advisory unless you prefer otherwise. Fixes go into the latest 1.x release; there are no separate maintenance branches.

## Trust model

Presmium is a local tool for one user. Read these points before reporting, since they decide what is and is not a vulnerability.

- **One user, who is the operator.** `presmium dev` and `presmium serve` serve the person who runs them, on their own machine (or in their own container). There are no accounts, no logins and no isolation between users: everyone who can use the service acts as that user. Presmium has no multi-user deployment; where several people need it, each gets their own container, for example from a hub such as JupyterHub.
- **This machine only, by default.** The services listen on the loopback address and refuse requests whose `Host` or `Origin` is not local (against DNS rebinding and cross-site requests). `presmium serve --host` and `presmium studio --host` open the service and the workbench to the local network with no login, and says so when it starts: whoever reaches the port works as the user. The one service that listens on every interface by default is the standalone classroom server, `presmium-classroom-server` (for lectures published to static hosting): anyone with a join link can join; use `--host 127.0.0.1` to keep it on this machine. The classroom of `presmium dev` and `presmium serve` stays on their own address.
- **Code and agents run as the user.** Code that a lecture runs at build time, and the AI agent of the workbench that changes lectures, run with the user's identity. The measures around them are defense in depth, not a boundary: compile-time code gets an environment without variables that look like credentials; operations that change state (running code, writing files outside the document, starting a classroom) need the user's approval; an agent's changes are reviewed file by file before they are committed. What code running as the user could still read anyway is not a vulnerability of Presmium.
- **Credentials stay out of documents and outputs.** Model, speech and environment credentials come from environment variables or from settings the user enters in the page, saved in the user's configuration directory in files only they can read; they are never written into the workspace, the documents or the build outputs, and pages never show a saved key. The MCP token of each server process is in a state file only the user can read.
- **Readers get static files.** Built sites need no server. A reader who uses the AI questions panel enters their own model service; the key is kept in their browser, where scripts of the same site can read it (the panel says so).

In scope, for example: a page of another site that can act on a local Presmium service; a built site or a lecture's output that leaks a credential or the content kept for teachers from the students' version; a published build that includes files outside the document; a way around the approvals or the review of an agent's changes from outside the user's own session; a crash of the services from a request they accept. Out of scope: anything that needs the user's own account or code running as the user, and the consequences of `--host` described above.
