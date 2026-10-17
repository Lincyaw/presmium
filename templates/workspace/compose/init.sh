#!/bin/sh
# Prepares the volumes of the compose layout (docs/architecture.md 10.5), as root, before the other
# services start; a workspace already prepared keeps its content and gets its permissions again.
#
# - The workspace: the seed (/seed) copied in when the volume is empty, with the template's .gitignore
#   when it has none (what is generated stays out of the history and of an agent's review), made a git
#   repository when it is none; the operator's packages at its root (node_modules: the packages
#   installed in the image).
# - Permissions: the repository belongs to serve; .git only serve may read and write (sandbox cannot
#   change git's configuration); the root's files (presmium.workspace.yaml, package.json,
#   node_modules) sandbox may only read; every document directory (the directory of a lecture.md
#   below the root) belongs to serve and the group presmium-docs, setgid and group-writable: the only
#   places sandbox may write. A document at the root itself is not supported in this layout.
# - The operator directory belongs to the gateway alone.
set -eu
W=/workspace

if [ -d /seed ] && [ -z "$(ls -A "$W")" ]; then
  cp -a /seed/. "$W/"
  if [ ! -e "$W/.gitignore" ]; then
    cp /opt/presmium/templates/workspace/.gitignore "$W/.gitignore"
  fi
fi
if [ ! -e "$W/node_modules" ]; then
  # The packages installed in the image, the operator's plugins among them (D14: installed at the workspace root).
  ln -s /opt/presmium/examples/demo/node_modules "$W/node_modules"
fi
if [ -e "$W/lecture.md" ]; then
  echo "init: $W/lecture.md: a document at the workspace root is not supported in a shared deployment; move it into a subdirectory" >&2
  exit 1
fi
if [ ! -d "$W/.git" ]; then
  git -c safe.directory='*' -C "$W" init -q -b main
  git -c safe.directory='*' -c user.name=Presmium -c user.email=presmium@presmium.invalid -c core.hooksPath=/dev/null -C "$W" add -A
  git -c safe.directory='*' -c user.name=Presmium -c user.email=presmium@presmium.invalid -c core.hooksPath=/dev/null -C "$W" commit -q --allow-empty -m 'Initial commit'
fi

chown -hR serve:serve "$W"
chmod 0755 "$W"
find "$W" -mindepth 1 -maxdepth 1 ! -name node_modules ! -name .git -exec chmod -R go-w {} +
chmod 0700 "$W/.git"
find "$W" -name lecture.md -not -path "$W/.git/*" -not -path '*/node_modules/*' | while read -r entry; do
  dir=$(dirname "$entry")
  chgrp -R presmium-docs "$dir"
  find "$dir" -type d -exec chmod 2775 {} +
  find "$dir" -type f -exec chmod g+w {} +
done

chown -R gateway:gateway /operator
chmod 0700 /operator
echo "init: $W is ready"
