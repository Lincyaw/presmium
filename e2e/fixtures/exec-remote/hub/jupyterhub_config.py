# JupyterHub of e2e/exec-remote.spec.ts. Any name signs in (DummyAuthenticator); the test signs a learner
# up and gets their token through the API with the service token of PRESMIUM_TEST_HUB_TOKEN.
import os

c = get_config()  # noqa: F821

c.JupyterHub.bind_url = 'http://0.0.0.0:8000'
c.JupyterHub.authenticator_class = 'dummy'
c.Authenticator.allow_all = True
# Single-user servers are processes of the hub's user, in the image's environment.
c.JupyterHub.spawner_class = 'simple'
c.Spawner.notebook_dir = '/tmp'
c.Spawner.args = [f"--ServerApp.allow_origin_pat={os.environ['PRESMIUM_TEST_ORIGIN_PAT']}"]
c.Spawner.environment = {'JUPYTERHUB_ALLOW_TOKEN_IN_URL': '1'}

# The pages of the course site's origin read the token's user from the hub's API.
c.JupyterHub.tornado_settings = {
    'headers': {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    },
}

c.JupyterHub.services = [{'name': 'presmium-test', 'api_token': os.environ['PRESMIUM_TEST_HUB_TOKEN']}]
c.JupyterHub.load_roles = [{
    'name': 'presmium-test',
    'scopes': ['admin:users', 'admin:servers', 'tokens'],
    'services': ['presmium-test'],
}]
