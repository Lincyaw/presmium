"""JupyterHub for Presmium Cloud: one complete Presmium Studio per user (deploy/cloud/studio).

JupyterHub owns sign-in to Studio (through the same Keycloak realm as the console), starting and stopping each
user's container, routing /user/<name>/ to it and stopping idle ones. The console is a Hub service: with its token
it starts a user's server and reaches the cloud's control service in it (shares, copies, MCP).
"""
import os
from urllib.parse import urlsplit

env = os.environ
public = env['CLOUD_HUB_URL'].rstrip('/')
issuer = env['CLOUD_OIDC_ISSUER'].rstrip('/')
internal = (env.get('CLOUD_OIDC_ISSUER_INTERNAL_URL') or issuer).rstrip('/')

c.JupyterHub.hub_ip = '0.0.0.0'
c.JupyterHub.hub_connect_ip = 'hub'
c.JupyterHub.db_url = 'sqlite:////srv/jupyterhub/data/jupyterhub.sqlite'
c.JupyterHub.cookie_secret_file = '/srv/jupyterhub/data/cookie_secret'
c.JupyterHub.redirect_to_server = True
c.JupyterHub.default_url = '/hub/user-redirect/presmium'
# Restarting or upgrading the Hub leaves running Studios alone; the Hub finds them again from its database.
c.JupyterHub.cleanup_servers = False

# Sign-in: the user's OIDC subject is the Hub user name, as the console names the same user.
c.JupyterHub.authenticator_class = 'generic-oauth'
c.GenericOAuthenticator.client_id = env.get('CLOUD_HUB_CLIENT_ID', 'presmium-hub')
c.GenericOAuthenticator.client_secret = env['CLOUD_HUB_CLIENT_SECRET']
c.GenericOAuthenticator.oauth_callback_url = f'{public}/hub/oauth_callback'
c.GenericOAuthenticator.authorize_url = f'{issuer}/protocol/openid-connect/auth'
c.GenericOAuthenticator.token_url = f'{internal}/protocol/openid-connect/token'
c.GenericOAuthenticator.userdata_url = f'{internal}/protocol/openid-connect/userinfo'
c.GenericOAuthenticator.scope = ['openid', 'email', 'profile']
c.GenericOAuthenticator.username_claim = 'sub'
c.GenericOAuthenticator.login_service = 'Presmium'
c.GenericOAuthenticator.allow_all = True
c.GenericOAuthenticator.enable_auth_state = True
c.GenericOAuthenticator.auto_login = True
# The console starts a user's Studio for a copy or an MCP call before that user's first Studio visit; that user has
# no stored login yet, so the Hub must not demand a fresh one before spawning. The console has authenticated them.
c.GenericOAuthenticator.refresh_pre_spawn = False
c.GenericOAuthenticator.auth_refresh_age = 0

# One container per user from the Studio image, with the files on the user's own volume.
c.JupyterHub.spawner_class = 'dockerspawner.DockerSpawner'
c.DockerSpawner.image = env.get('CLOUD_STUDIO_IMAGE', 'presmium-cloud-studio:0.1.0')
c.DockerSpawner.network_name = env['CLOUD_STUDIOS_NETWORK']
c.DockerSpawner.name_template = env.get('CLOUD_INSTANCE_ID', 'presmium-cloud') + '-studio-{username}'
c.DockerSpawner.volumes = {env.get('CLOUD_INSTANCE_ID', 'presmium-cloud') + '-work-{username}': '/work'}
c.DockerSpawner.remove = True
c.DockerSpawner.cmd = ['jupyterhub-singleuser']
c.DockerSpawner.mem_limit = env.get('CLOUD_STUDIO_MEMORY', '4G')
c.DockerSpawner.cpu_limit = float(env.get('CLOUD_STUDIO_CPUS', '2'))
c.DockerSpawner.http_timeout = 240
c.DockerSpawner.start_timeout = 240
c.DockerSpawner.environment = {'PRESMIUM_HUB_ORIGIN': f'{urlsplit(public).scheme}://{urlsplit(public).netloc}'}
c.DockerSpawner.extra_host_config = {
    'read_only': True,
    # Native addons (DeepSeek Harness's loader) are copied to /tmp and loaded from there: exec.
    'tmpfs': {'/tmp': 'rw,exec,nosuid,nodev,size=1g,mode=1777'},
    'cap_drop': ['ALL'],
    'security_opt': ['no-new-privileges:true'],
    'pids_limit': int(env.get('CLOUD_STUDIO_PIDS', '2048')),
}


async def identity(spawner):
    # The author's name and email for the workspace's git commits.
    state = await spawner.user.get_auth_state() or {}
    user = state.get('oauth_user') or {}
    spawner.environment['PRESMIUM_USER_NAME'] = str(user.get('name') or user.get('preferred_username') or spawner.user.name)[:200]
    if user.get('email'):
        spawner.environment['PRESMIUM_USER_EMAIL'] = str(user['email'])[:200]

c.Spawner.pre_spawn_hook = identity

# Idle Studios stop; their volumes stay.
c.JupyterHub.services = [
    {'name': 'idle-culler', 'command': ['python3', '-m', 'jupyterhub_idle_culler', f"--timeout={env.get('CLOUD_STUDIO_IDLE_SECONDS', '1800')}"]},
    {'name': 'presmium-console', 'api_token': env['CLOUD_HUB_API_TOKEN']},
]
c.JupyterHub.load_roles = [
    {'name': 'idle-culler', 'scopes': ['list:users', 'read:users:activity', 'read:servers', 'delete:servers'], 'services': ['idle-culler']},
    {'name': 'presmium-console', 'scopes': ['admin:users', 'admin:servers', 'access:servers'], 'services': ['presmium-console']},
]
