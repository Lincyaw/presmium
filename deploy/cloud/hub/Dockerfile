# Presmium's pages in place of JupyterHub's (deploy/cloud/pages): the design system's styles and brand mark put in.
FROM node:22-bookworm-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d AS pages
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
