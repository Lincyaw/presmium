# The single-user server of a Presmium Cloud user: Studio, its previews and the cloud's control service below
# /user/<name>/. Studio's prefix is stripped (DeepSeek Harness serves root routes); the previews keep theirs
# (`presmium serve --public-url` with a path).
import os

c.ServerApp.jpserver_extensions = {'presmium_hub': True}
c.ServerProxy.servers = {
    'studio': {'port': 18998, 'absolute_url': False, 'launcher_entry': {'enabled': False}},
    'preview': {'port': 18999, 'absolute_url': True, 'launcher_entry': {'enabled': False}},
    'cloud': {'port': 18997, 'absolute_url': False, 'launcher_entry': {'enabled': False}},
}
c.ServerApp.default_url = '/presmium'
# Presmium's pages (deploy/cloud/pages) for the errors this server can show, e.g. while Studio is not answering.
c.ServerApp.extra_template_paths = ['/opt/presmium/pages']
c.ServerApp.jinja_template_vars = {'presmium_console': os.environ.get('PRESMIUM_CONSOLE_URL', '')}
