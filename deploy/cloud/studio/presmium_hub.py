"""Presmium Studio inside a JupyterHub single-user server.

At start it prepares the owner's workspace on /work and starts Studio, its workspace service and the cloud's control
service on fixed loopback ports; jupyter-server-proxy serves them below the user's Hub path (see
jupyter_server_config.py), so every request has passed JupyterHub's authentication first. /user/<name>/presmium
opens Studio with its launch token, optionally on one document.

The server answers as soon as the control service runs: the workspace is copied and Studio started in the background,
and the control service's /status tells the console which of these is under way (its progress screen).
"""
import asyncio
import base64
import glob
import hashlib
import json
import os
import shutil
import subprocess
import threading
from urllib.parse import urlencode

from jupyter_server.base.handlers import JupyterHandler
from tornado import web

STUDIO_PORT, PREVIEW_PORT, CONTROL_PORT = 18998, 18999, 18997
PRESMIUM = '/opt/presmium'
# What the image's build prepared once for everyone (deploy/cloud/studio/warm.mjs).
WARM = f'{PRESMIUM}/warm'
SPACE = '/work/space'
STATE = '/work/state/presmium/studio'


def _jupyter_server_extension_points():
    return [{'module': 'presmium_hub'}]


def _prepare():
    """What must be in place before anything else runs here; quick."""
    for directory in ('home', 'state', 'cache', 'config'):
        os.makedirs(f'/work/{directory}', mode=0o700, exist_ok=True)
    identity = '/work/home/.gitconfig'
    if not os.path.exists(identity):
        name = (os.environ.get('PRESMIUM_USER_NAME') or os.environ.get('JUPYTERHUB_USER') or 'Presmium').replace('\n', ' ')[:200]
        email = (os.environ.get('PRESMIUM_USER_EMAIL') or 'author@presmium.invalid').replace('\n', '').strip()[:200]
        with open(identity, 'w') as file:
            file.write(f'[user]\n\tname = {name}\n\temail = {email}\n[init]\n\tdefaultBranch = main\n')
    # Nothing runs yet in this new container, but a Studio the idle culler stopped left its state files on the volume.
    # A workspace service's file names a process ID that a process of this container may now have, and would stop the
    # new workspace service from starting; Studio's would tell the control service that Studio is ready. Its host lock
    # counts as held for ten seconds after the last container stopped, so a Studio reopened at once would not start.
    cache = os.environ.get('XDG_CACHE_HOME') or '/work/cache'
    for state in glob.glob(f'{STATE}/*.json') + glob.glob(f'{cache}/presmium/serve/*/server.json'):
        os.remove(state)
    for lock in glob.glob(f'{cache}/presmium/serve/*/host.lock'):
        shutil.rmtree(lock, ignore_errors=True)
    # TypeScript transpiled at the image's build (/tmp is new in every container).
    if os.path.isdir(f'{WARM}/jiti') and not os.path.exists('/tmp/jiti'):
        shutil.copytree(f'{WARM}/jiti', '/tmp/jiti')


def _seed():
    """A new space starts with the complete gallery, as a first local `pnpm studio` does."""
    if os.path.isdir(SPACE) and os.listdir(SPACE):
        return
    if not os.path.isdir(f'{WARM}/space'):
        subprocess.run(['node', f'{PRESMIUM}/examples/gallery/try.mjs', SPACE], check=True)
        return
    # The copy appears whole or not at all: the control service reports the workspace as being prepared until then.
    partial = f'{SPACE}.new'
    shutil.rmtree(partial, ignore_errors=True)
    subprocess.run(['cp', '-a', '--reflink=auto', f'{WARM}/space', partial], check=True)
    history = '/work/state/presmium/history'
    if os.path.isdir(f'{WARM}/history'):
        os.makedirs(history, exist_ok=True)
        for name in os.listdir(f'{WARM}/history'):
            if not os.path.exists(f'{history}/{name}'):
                subprocess.run(['cp', '-a', '--reflink=auto', f'{WARM}/history/{name}', f'{history}/{name}'], check=True)
    if os.path.isdir(SPACE):
        os.rmdir(SPACE)
    os.rename(partial, SPACE)


def _load_jupyter_server_extension(app):
    if os.environ.get('PRESMIUM_RUNTIME_ONLY') == '1':
        # A named execution server runs kernels and terminals, without a second Studio or its private files.
        return
    prefix = app.base_url  # /user/<name>/
    origin = os.environ['PRESMIUM_HUB_ORIGIN']
    _prepare()
    subprocess.Popen(['node', f'{PRESMIUM}/deploy/cloud/studio/control.mjs', str(CONTROL_PORT)])
    # The sample's proxy environment uses this author's own authenticated single-user server.
    # Keep the server token in the workspace service, never in document JSON or browser settings.
    studio_env = os.environ.copy()
    if 'PRESMIUM_ENV_LAB_URL' not in studio_env:
        studio_env['PRESMIUM_ENV_LAB_URL'] = f'http://127.0.0.1:{app.port}{prefix}'
        studio_env['PRESMIUM_ENV_LAB_TOKEN'] = os.environ['JUPYTERHUB_API_TOKEN']

    def start():
        try:
            _seed()
        except Exception as error:  # noqa: BLE001 - logged; Studio still starts on what is there
            app.log.error('presmium: preparing the workspace failed: %s', error)
        # `presmium studio` hands Studio its own command; presmium-studio alone would look for `presmium` on PATH.
        subprocess.Popen(['node', f'{PRESMIUM}/packages/presmium/bin/presmium.mjs', 'studio', SPACE,
                          '--port', str(STUDIO_PORT), '--public-url', f'{origin}{prefix}studio/',
                          '--preview-url', f'{origin}{prefix}preview/', '--preview-port', str(PREVIEW_PORT)], env=studio_env)

    threading.Thread(target=start, name='presmium-start', daemon=True).start()
    console = os.environ.get('PRESMIUM_CONSOLE_URL', '')

    class Open(JupyterHandler):
        def _navigate(self, target, locale):
            # DeepSeek Harness's session cookie is SameSite=Strict: its token exchange must be a navigation this
            # origin's own page starts, not the tail of a redirect chain that began on the console. Studio finds the
            # console (sharing, access tokens) by what this page leaves in the origin's storage, and its first start
            # screen speaks the language the author chose in the console.
            remember = (f'if (!localStorage.getItem("presmium.startup.locale")) localStorage.setItem("presmium.startup.locale", {json.dumps(locale)}); '
                        if locale else '')
            script = (f'try {{ {remember}localStorage.setItem("presmium.cloud.console", {json.dumps(console)}) }} catch {{}}\n'
                      f'location.replace({json.dumps(target)})').replace('<', '\\u003c')
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
            for _ in range(480):
                for state in glob.glob(f'{STATE}/*.json'):
                    try:
                        with open(state) as file:
                            url = json.load(file).get('url', '')
                    except (OSError, ValueError):
                        continue
                    if '?token=' in url:
                        locale = self.get_argument('locale', None)
                        return self._navigate(f"{prefix}studio/?{url.split('?', 1)[1]}{fragment}", locale if locale in ('zh-CN', 'en') else None)
                await asyncio.sleep(0.5)
            raise web.HTTPError(503, 'Presmium Studio did not start')

    app.web_app.add_handlers('.*', [(f'{prefix}presmium', Open)])
