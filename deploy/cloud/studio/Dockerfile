# Debian trixie: the workspace service's history needs git 2.43 or later (cat-file -Z).
FROM node:22-trixie-slim@sha256:2117f713a417f3aff682ac8f5bc2ebbdf1beed51f36e67ab1e0fd3866b6d2d8f

# One user's complete Presmium Studio: the workbench, the AI assistant (DeepSeek Harness), the workspace service,
# builds and exports. The toolchain is fixed at image build; the user's files live on the volume mounted at /work.
ENV DEBIAN_FRONTEND=noninteractive PLAYWRIGHT_BROWSERS_PATH=/opt/playwright
RUN apt-get update \
 && apt-get install -y --no-install-recommends git python3 python3-venv ca-certificates tar \
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
COPY deploy/cloud/studio/entry.mjs deploy/cloud/studio/share-build.mjs ./deploy/cloud/studio/
USER 1000:1000
WORKDIR /work
EXPOSE 3080 3090
CMD ["node", "/opt/presmium/deploy/cloud/studio/entry.mjs"]
