"""Presmium Studio inside a JupyterHub single-user server.

At start it prepares the owner's workspace on /work and starts Studio, its workspace service and the cloud's control
service on fixed loopback ports; jupyter-server-proxy serves them below the user's Hub path (see
jupyter_server_config.py), so every request has passed JupyterHub's authentication first. /user/<name>/presmium
opens Studio with its launch token, optionally on one document.
"""
import base64
import glob
import hashlib
import json
import os
import subprocess
import time
from urllib.parse import urlencode

from jupyter_server.base.handlers import JupyterHandler
from tornado import web

STUDIO_PORT, PREVIEW_PORT, CONTROL_PORT = 18998, 18999, 18997
PRESMIUM = '/opt/presmium'
SPACE = '/work/space'
STATE = '/work/state/presmium/studio'


def _jupyter_server_extension_points():
    return [{'module': 'presmium_hub'}]


def _prepare():
    for directory in ('home', 'state', 'cache', 'config'):
        os.makedirs(f'/work/{directory}', mode=0o700, exist_ok=True)
    identity = '/work/home/.gitconfig'
    if not os.path.exists(identity):
        name = (os.environ.get('PRESMIUM_USER_NAME') or os.environ.get('JUPYTERHUB_USER') or 'Presmium').replace('\n', ' ')[:200]
        email = (os.environ.get('PRESMIUM_USER_EMAIL') or 'author@presmium.invalid').replace('\n', '').strip()[:200]
        with open(identity, 'w') as file:
            file.write(f'[user]\n\tname = {name}\n\temail = {email}\n[init]\n\tdefaultBranch = main\n')
    # A new space starts as the example workspace, as a first local `pnpm studio` does.
    if not os.path.isdir(SPACE) or not os.listdir(SPACE):
        subprocess.run(['node', f'{PRESMIUM}/examples/animations/try.mjs', SPACE], check=True)
    for state in glob.glob(f'{STATE}/*.json'):
        os.remove(state)


def _load_jupyter_server_extension(app):
    prefix = app.base_url  # /user/<name>/
    origin = os.environ['PRESMIUM_HUB_ORIGIN']
    _prepare()
    subprocess.Popen(['node', f'{PRESMIUM}/packages/studio/bin/presmium-studio.mjs', SPACE,
                      '--port', str(STUDIO_PORT), '--public-url', f'{origin}{prefix}studio/',
                      '--preview-url', f'{origin}{prefix}preview/', '--preview-port', str(PREVIEW_PORT)])
    subprocess.Popen(['node', f'{PRESMIUM}/deploy/cloud/studio/control.mjs', str(CONTROL_PORT)])

    class Open(JupyterHandler):
        def _navigate(self, target):
            # DeepSeek Harness's session cookie is SameSite=Strict: its token exchange must be a navigation this
            # origin's own page starts, not the tail of a redirect chain that began on the console.
            script = f'location.replace({json.dumps(target)})'.replace('<', '\\u003c')
            digest = base64.b64encode(hashlib.sha256(script.encode()).digest()).decode()
            self.set_header('Content-Security-Policy', f"default-src 'none'; script-src 'sha256-{digest}'")
            self.set_header('Cache-Control', 'no-store')
            self.set_header('Referrer-Policy', 'no-referrer')
            self.finish(f'<!doctype html><meta charset="utf-8"><title>Presmium</title><script>{script}</script>')

        @web.authenticated
        async def get(self):
            document, document_id = self.get_argument('document', None), self.get_argument('id', None)
            fragment = f"#presmium?{urlencode({'document': document, 'id': document_id})}" if document is not None and document_id else ''
            # Studio's state file holds its address with the launch token once it is ready.
            for _ in range(240):
                for state in glob.glob(f'{STATE}/*.json'):
                    with open(state) as file:
                        url = json.load(file).get('url', '')
                    if '?token=' in url:
                        return self._navigate(f"{prefix}studio/?{url.split('?', 1)[1]}{fragment}")
                time.sleep(0.5)
            raise web.HTTPError(503, 'Presmium Studio did not start')

    app.web_app.add_handlers('.*', [(f'{prefix}presmium', Open)])
