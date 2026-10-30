# Debian trixie: the workspace service's history needs git 2.43 or later (cat-file -Z).
FROM node:22-trixie-slim@sha256:2117f713a417f3aff682ac8f5bc2ebbdf1beed51f36e67ab1e0fd3866b6d2d8f

# One user's complete Presmium Studio (the workbench, the AI assistant, the workspace service, builds and exports)
# as a JupyterHub single-user server. The toolchain is fixed at image build; the user's files live on /work.
ENV DEBIAN_FRONTEND=noninteractive PLAYWRIGHT_BROWSERS_PATH=/opt/playwright
RUN apt-get update \
 && apt-get install -y --no-install-recommends git python3 python3-venv ca-certificates tar ffmpeg \
 && rm -rf /var/lib/apt/lists/* \
 && corepack enable && corepack prepare pnpm@11.20.0 --activate
WORKDIR /opt/presmium
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig*.json ./
COPY packages ./packages
COPY examples ./examples
COPY site ./site
COPY .agents ./.agents
COPY e2e/fixtures/regression ./e2e/fixtures/regression
RUN pnpm install --frozen-lockfile \
 && pnpm --filter @lincyaw/render-slides exec playwright install --with-deps chromium \
 && node packages/dsh/build/client.mjs \
 && pnpm --filter @lincyaw/skills run skills
# JupyterHub's single-user server around Studio (deploy/cloud/hub): Hub authenticates every request.
RUN python3 -m venv /opt/hub \
 && /opt/hub/bin/pip install --no-cache-dir jupyterhub==5.5.4 jupyter-server-proxy==4.6.0 ipykernel==6.30.1 \
 && /opt/hub/bin/python -m ipykernel install --prefix=/opt/hub --name python3 \
 && mkdir -p /work && chown 1000:1000 /work
COPY deploy/cloud/studio/jupyter_server_config.py /etc/jupyter/jupyter_server_config.py
COPY deploy/cloud/studio/presmium_hub.py deploy/cloud/studio/control.mjs deploy/cloud/studio/share-build.mjs ./deploy/cloud/studio/
ENV PATH=/opt/hub/bin:$PATH PYTHONPATH=/opt/presmium/deploy/cloud/studio HOME=/work/home XDG_STATE_HOME=/work/state XDG_CACHE_HOME=/work/cache XDG_CONFIG_HOME=/work/config
USER 1000:1000
WORKDIR /work
EXPOSE 8888
CMD ["jupyterhub-singleuser"]
