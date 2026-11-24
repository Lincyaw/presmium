FROM node:24.22.3-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54 AS build
ENV CI=true
RUN corepack enable && corepack prepare pnpm@11.20.0 --activate
WORKDIR /opt/presmium
COPY . .
RUN pnpm install --filter @lincyaw/cloud... --frozen-lockfile --ignore-scripts \
 && pnpm --filter @lincyaw/cloud build

FROM node:24.22.3-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54
ENV NODE_ENV=production JITI_FS_CACHE=false
WORKDIR /opt/presmium
COPY --from=build --chown=node:node /opt/presmium/ /opt/presmium/
USER node
EXPOSE 8787 8788
CMD ["node", "packages/cloud/bin/presmium-cloud.mjs", "serve"]
