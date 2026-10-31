"""Run on the deployment host; keep the current server token in memory only.

Measures raw HTTP payload bytes through the existing authenticated Hub entrance.
Does not measure JavaScript evaluation or browser paint.
"""
import gzip
import hashlib
import http.client
import json
import re
import subprocess
import time

container = 'presmium-cloud-hub-verification-studio-44035427-2d272c-2d498f-2dafa3-2dc3c631cdbd3a'
result = subprocess.run(['sudo', '-n', 'docker', 'exec', container, 'node', '--input-type=module', '-e',
    'console.log(JSON.stringify({token:process.env.JUPYTERHUB_API_TOKEN,user:process.env.JUPYTERHUB_USER}))'], capture_output=True, text=True, check=True)
credentials = json.loads(result.stdout)
prefix = f'/user/{credentials["user"]}/preview/'


def read(path, encoding='identity'):
    connection = http.client.HTTPConnection('127.0.0.1', 18787, timeout=40)
    start = time.monotonic()
    connection.request('GET', path, headers={'Host': 'hub.localhost:18787', 'Authorization': f'token {credentials["token"]}', 'Accept-Encoding': encoding})
    response = connection.getresponse()
    body = response.read()
    coding = response.getheader('Content-Encoding')
    answer = {'status': response.status, 'encoding': coding, 'bytes': len(body), 'ms': round((time.monotonic() - start) * 1000)}
    connection.close()
    return answer, gzip.decompress(body) if coding == 'gzip' else body


answer, page = read(prefix + '__app/view?document=guide-steps&presmium-block=semantic-scene')
if answer['status'] != 200:
    raise RuntimeError(f'preview status {answer["status"]}')
scripts = list(dict.fromkeys(re.findall(rb'(?:src|href)="([^"]+\.js)"', page)))
results = []
for encoding in ['identity', 'gzip']:
    total, errors, hashes, encodings = 0, [], [], set()
    start = time.monotonic()
    for script in scripts:
        measurement, content = read(script.decode(), encoding)
        total += measurement['bytes']
        encodings.add(measurement['encoding'] or 'identity')
        hashes.append(hashlib.sha256(content).hexdigest())
        if measurement['status'] != 200:
            errors.append(measurement['status'])
    results.append({'requested': encoding, 'encodings': sorted(encodings), 'scripts': len(scripts), 'wireBytes': total, 'ms': round((time.monotonic() - start) * 1000), 'errors': errors, 'hashes': hashes})
same = results[0]['hashes'] == results[1]['hashes']
for item in results:
    del item['hashes']
print(json.dumps({'results': results, 'decodedIdentical': same}))
