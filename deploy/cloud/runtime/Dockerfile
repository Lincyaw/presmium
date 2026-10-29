FROM node:22-bookworm-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d

ENV DEBIAN_FRONTEND=noninteractive PLAYWRIGHT_BROWSERS_PATH=/opt/playwright
RUN corepack enable && corepack prepare pnpm@11.20.0 --activate
WORKDIR /opt/presmium
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig*.json ./
COPY packages ./packages
COPY examples ./examples
COPY .agents/skills/presmium-animate/gallery ./.agents/skills/presmium-animate/gallery
COPY e2e/fixtures/regression ./e2e/fixtures/regression
COPY site ./site
# The locked toolchain and supported plugins are installed at image build, never from tenant hooks.
RUN pnpm install --frozen-lockfile --ignore-scripts \
 && pnpm --filter @lincyaw/render-slides exec playwright install --with-deps chromium \
 && mkdir -p /work/input /work/output /opt/presmium-runtime \
 && chown -R node:node /work
ENV NODE_ENV=production
COPY deploy/cloud/runtime/run.mjs /opt/presmium-runtime/run.mjs
COPY deploy/cloud/runtime/warmup.mjs /opt/presmium-runtime/warmup.mjs
# Compile only operator-owned source while building the locked toolchain. Each
# task copies this root-owned seed into its own writable, bounded /tmp mount.
RUN chown -R node:node /opt/presmium-runtime
USER node
RUN node /opt/presmium-runtime/warmup.mjs
USER root
RUN chown -R root:root /opt/presmium-runtime
USER node
WORKDIR /work
CMD ["node", "/opt/presmium-runtime/run.mjs"]
