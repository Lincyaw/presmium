# The single-user server of a Presmium Cloud user: Studio, its previews and the cloud's control service below
# /user/<name>/. Studio's prefix is stripped (DeepSeek Harness serves root routes); the previews keep theirs
# (`presmium serve --public-url` with a path).
c.ServerApp.jpserver_extensions = {'presmium_hub': True}
c.ServerProxy.servers = {
    'studio': {'port': 18998, 'absolute_url': False, 'launcher_entry': {'enabled': False}},
    'preview': {'port': 18999, 'absolute_url': True, 'launcher_entry': {'enabled': False}},
    'cloud': {'port': 18997, 'absolute_url': False, 'launcher_entry': {'enabled': False}},
}
c.ServerApp.default_url = '/presmium'
