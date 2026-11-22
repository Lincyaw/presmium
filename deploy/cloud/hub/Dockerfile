FROM quay.io/jupyterhub/jupyterhub:5.5.4@sha256:d2b824f33fdbf5c5f8a9616be38cc77de624cf23c23a7b2fd441dd60ba50e87f
RUN pip install --no-cache-dir dockerspawner==14.0.0 oauthenticator==17.4.0 jupyterhub-idle-culler==2.0.0
COPY deploy/cloud/hub/jupyterhub_config.py /srv/jupyterhub/jupyterhub_config.py
WORKDIR /srv/jupyterhub
CMD ["jupyterhub", "-f", "/srv/jupyterhub/jupyterhub_config.py"]
