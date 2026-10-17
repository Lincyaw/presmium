# The one image of a shared deployment (docs/architecture.md 10.5): serve, gateway and sandbox run it as
# three users with different uids. Debian trixie: glibc 2.41, which deltabox-lite's prebuilt binaries
# need (2.39 or later; node:22-bookworm is too old).
#
# The build context is a checkout of Presmium in which `pnpm install` has run; its node_modules is copied
# as it is (see Dockerfile.dockerignore), with the operator's plugins among its packages. Build it with
# `docker compose build` from this directory (compose.yaml names the context).
FROM node:22-trixie-slim@sha256:154ba2f4d6fec323d28e4f4bb86bba4677f1223391a1979cf521304e03a98dfa

# git for the workspace's history, Python for compile-time execution (the exec plugin's executor), fuse3's
# fusermount3 for deltabox (compose.deltabox.yaml; without the override it is never used).
RUN apt-get update \
  && apt-get install -y --no-install-recommends git python3 ca-certificates fuse3 \
  && rm -rf /var/lib/apt/lists/*

# serve 1001 and sandbox 1003 share the group of the document directories, presmium-docs 1100;
# gateway 1002 and classroom 1004 have none. Each has a home of its own (caches, temporary HOMEs).
RUN groupadd -g 1100 presmium-docs \
  && useradd -u 1001 -U -m -G presmium-docs -s /usr/sbin/nologin serve \
  && useradd -u 1002 -U -m -s /usr/sbin/nologin gateway \
  && useradd -u 1003 -U -m -G presmium-docs -s /usr/sbin/nologin sandbox \
  && useradd -u 1004 -U -m -s /usr/sbin/nologin classroom

COPY --chown=root:root . /opt/presmium
RUN ln -s /opt/presmium/packages/cli/bin/presmium.mjs /usr/local/bin/presmium \
  && ln -s /opt/presmium/packages/classroom-server/bin/server.mjs /usr/local/bin/presmium-classroom-server \
  && chmod 0755 /opt/presmium/templates/workspace/compose/init.sh

# The CLI loads its TypeScript with jiti, whose cache root would write before the processes become their users.
ENV JITI_FS_CACHE=false

WORKDIR /workspace
