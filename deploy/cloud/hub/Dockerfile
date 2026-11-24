# Presmium's pages in place of JupyterHub's (deploy/cloud/pages): the design system's styles and brand mark put in.
FROM node:24.22.3-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54 AS pages
WORKDIR /src
COPY packages/design ./packages/design
COPY deploy/cloud/pages ./deploy/cloud/pages
RUN node deploy/cloud/pages/build.mjs /pages

FROM quay.io/jupyterhub/jupyterhub:5.5.4@sha256:d2b824f33fdbf5c5f8a9616be38cc77de624cf23c23a7b2fd441dd60ba50e87f
RUN pip install --no-cache-dir dockerspawner==14.0.0 oauthenticator==17.4.0 jupyterhub-idle-culler==2.0.0
COPY --from=pages /pages /srv/jupyterhub/templates
COPY deploy/cloud/hub/jupyterhub_config.py /srv/jupyterhub/jupyterhub_config.py
WORKDIR /srv/jupyterhub
CMD ["jupyterhub", "-f", "/srv/jupyterhub/jupyterhub_config.py"]
