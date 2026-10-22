# A JupyterHub for e2e/exec-remote.spec.ts (`auth: prompt` with `{user}`): the image of
# templates/env/compose (it has JupyterHub and its single-user server) with the proxy JupyterHub needs,
# DummyAuthenticator, and single-user servers as local processes. Set up as the Zero to JupyterHub
# values of templates/env/kubernetes/README.md: the hub's API and the user servers answer the pages of
# other origins, and a user server takes the token in a WebSocket's URL.
FROM quay.io/jupyter/base-notebook:2026-10-12@sha256:3fc2b8023bb7e3f11a09bd77aa07575c1ece16a0b9b64556757e34c52f667a1a
RUN mamba install --yes --quiet -c conda-forge configurable-http-proxy && mamba clean --all --yes
COPY jupyterhub_config.py /home/jovyan/jupyterhub_config.py
WORKDIR /home/jovyan
CMD ["jupyterhub", "-f", "/home/jovyan/jupyterhub_config.py"]
