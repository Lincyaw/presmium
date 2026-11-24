FROM node:24.22.3-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54 AS theme
ENV CI=true
WORKDIR /src
RUN corepack enable && corepack prepare pnpm@11.20.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY deploy/cloud/keycloak ./deploy/cloud/keycloak
RUN pnpm install --filter @lincyaw/design... --frozen-lockfile --ignore-scripts \
 && node deploy/cloud/keycloak/build-theme.mjs /theme-output

FROM quay.io/keycloak/keycloak:26.8.1@sha256:a78d6b79572168cb25886b80a8b5b8d4ed4390743e3eecb810538683e209dd6b AS build
ENV KC_DB=postgres KC_HEALTH_ENABLED=true KC_METRICS_ENABLED=true
RUN /opt/keycloak/bin/kc.sh build

FROM quay.io/keycloak/keycloak:26.8.1@sha256:a78d6b79572168cb25886b80a8b5b8d4ed4390743e3eecb810538683e209dd6b
COPY --from=build /opt/keycloak/ /opt/keycloak/
COPY --from=theme /theme-output/ /opt/keycloak/themes/
COPY --chmod=0555 deploy/cloud/keycloak/presmium-health.sh /opt/keycloak/bin/presmium-health.sh
ENV KC_DB=postgres KC_HEALTH_ENABLED=true KC_METRICS_ENABLED=true
ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
