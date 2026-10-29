FROM node:22-bookworm-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d AS build
ENV CI=true
RUN corepack enable && corepack prepare pnpm@11.20.0 --activate
WORKDIR /opt/presmium
COPY . .
RUN pnpm install --filter @lincyaw/cloud... --frozen-lockfile --ignore-scripts \
 && pnpm --filter @lincyaw/cloud build

FROM node:22-bookworm-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d
ENV NODE_ENV=production JITI_FS_CACHE=false
WORKDIR /opt/presmium
COPY --from=build --chown=node:node /opt/presmium/ /opt/presmium/
USER node
EXPOSE 8787 8788
CMD ["node", "packages/cloud/bin/presmium-cloud.mjs", "serve"]
