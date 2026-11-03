import argparse
parser = argparse.ArgumentParser(description='Promote a verified staged FarmFlow release; unchanged releases are integrity-checked no-ops.')
parser.add_argument('--stage', default='/app/3drfm-farmflow/deployment-candidate.json')
parser.add_argument('--verify', action='store_true', help='Read-only verification; never recreate services')
args = parser.parse_args()
import time
started = time.monotonic()
import json, pathlib, subprocess, hashlib, os, shutil, yaml, urllib.request, time, re, fcntl
root = pathlib.Path('/app/3drfm-farmflow')
stage = json.loads(pathlib.Path(args.stage).read_text())
if not stage['staged']:
    raise RuntimeError('Deployment preflight failed')
lock = (root / 'hi-rollout.lock').open('a')
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
if not hashlib.sha256((root / '.env').read_bytes()).hexdigest() == stage['expectedEnvSha256']:
    raise RuntimeError('Deployment preflight failed')
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
try:
    current = json.loads(subprocess.check_output(['docker', 'inspect', '3drfm-farmflow'], text=True))[0]
    current_api = next((m['Source'] for m in current['Mounts'] if m['Destination'] == '/app/api'))
    with opener.open('http://127.0.0.1:8797/api/public/slicing-quotes/config', timeout=5) as response:
        live = json.load(response)
    matched = current_api == str(pathlib.Path(stage['release']) / 'api') and live.get('available') and (live['profileBundle']['manifestSha256'] == stage['manifestSha256'])
except Exception:
    matched = False
if matched:
    meta = json.loads((pathlib.Path(stage['release']) / 'deployment-artifacts.json').read_text())
    for group, folder in [('api', 'api'), ('utils', 'frontend-vue/src/utils'), ('dist', 'dist')]:
        for relative, digest in meta[group].items():
            if hashlib.sha256((pathlib.Path(stage['release']) / folder / relative).read_bytes()).hexdigest() != digest:
                raise RuntimeError('Live artifact drift: ' + group + '/' + relative)
    check = subprocess.run(['docker', 'exec', '3drfm-farmflow-orca', 'node', '/app/scripts/check-slicer-profile.mjs'], capture_output=True, text=True, timeout=30)
    if check.returncode:
        raise RuntimeError('Worker integrity failed')
    print(json.dumps({'status': 'already_current', 'sourceCommit': stage['sourceCommit'], 'manifestSha256': stage['manifestSha256'], 'rebuilt': False, 'restarted': False, 'verified': True, 'elapsedSeconds': round(time.monotonic() - started, 3)}))
    raise SystemExit(0)
if args.verify:
    raise RuntimeError('Candidate not active; no mutation performed')
roles = {'layerpilot': '3drfm-farmflow', 'layerpilot-worker': '3drfm-farmflow-worker', 'orca-worker': '3drfm-farmflow-orca'}
before = {k: json.loads(subprocess.check_output(['docker', 'inspect', n], text=True))[0] for k, n in roles.items()}
if not next((m['Source'] for m in before['layerpilot']['Mounts'] if m['Destination'] == '/app/api')) == stage['expectedPreviousApiRoot']:
    raise RuntimeError('Deployment preflight failed')
for c in before.values():
    if not json.loads(subprocess.check_output(['docker', 'image', 'inspect', c['Config']['Image']], text=True))[0]['Id'] == c['Image']:
        raise RuntimeError('Image tag drift requires review')
env = dict((s.split('=', 1) for s in before['layerpilot']['Config']['Env']))
schema = env.get('LAYERPILOT_POSTGRES_SCHEMA', 'public')
key = env.get('LAYERPILOT_POSTGRES_DOCUMENT_KEY', 'state')
if not (re.fullmatch('[A-Za-z_][A-Za-z0-9_]*', schema) and re.fullmatch('[A-Za-z0-9_-]+', key)):
    raise RuntimeError('Deployment preflight failed')
sql = f"""SELECT (SELECT count(*) FROM jsonb_array_elements(COALESCE(value->'slicingQuotes','[]'::jsonb)) j WHERE j->>'status' IN ('queued','processing')) + (SELECT count(*) FROM jsonb_array_elements(COALESCE(value->'slicerJobs','[]'::jsonb)) j WHERE j->>'status' IN ('queued','running')) FROM "{schema}".layerpilot_documents WHERE key='{key}';"""
r = subprocess.run(['docker', 'exec', '3drfm-farmflow-postgres', 'sh', '-c', 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "$1"', 'sh', sql], capture_output=True, text=True)
if not (r.returncode == 0 and r.stdout.strip() == '0'):
    raise RuntimeError('Active slicer jobs must drain before replacement')
backup = root / 'backups' / ('rollout-' + __import__('datetime').datetime.now(__import__('datetime').timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
backup.mkdir(mode=448, parents=True, exist_ok=False)
override = root / 'docker-compose.override.yml'
old = override.read_bytes()
(backup / 'docker-compose.override.yml').write_bytes(old)
(backup / '.env').write_bytes((root / '.env').read_bytes())
(backup / 'container-inspect.json').write_text(json.dumps(before))
for f in backup.iterdir():
    f.chmod(384)
dump = backup / 'database.pgcustom'
with dump.open('wb') as f:
    r = subprocess.run(['docker', 'exec', '3drfm-farmflow-postgres', 'sh', '-c', 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc'], stdout=f, stderr=subprocess.PIPE, timeout=120)
if not (r.returncode == 0 and dump.stat().st_size > 1000):
    raise RuntimeError('Database backup failed')
dump.chmod(384)
with dump.open('rb') as f:
    r = subprocess.run(['docker', 'exec', '-i', '3drfm-farmflow-postgres', 'pg_restore', '-l'], stdin=f, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=45)
if not (r.returncode == 0 and b'layerpilot_documents' in r.stdout):
    raise RuntimeError('Database archive validation failed')
config = yaml.safe_load(old)
services = config.setdefault('services', {})
release = pathlib.Path(stage['release'])
profiles = pathlib.Path(stage['profileRoot'])
profile_env = {'ORCA_PROFILE_BUNDLE_MANIFEST': '/profiles/active/manifest.json', 'ORCA_SLICER_VERSION': '2.4.2'}

def setmounts(service, items):
    s = services.setdefault(service, {})
    vols = s.setdefault('volumes', [])
    targets = {v.split(':')[1] for v in items}
    s['volumes'] = [v for v in vols if not (isinstance(v, str) and len(v.split(':')) > 1 and (v.split(':')[1] in targets))] + items
setmounts('layerpilot', [str(release / 'api') + ':/app/api:ro', str(release / 'dist') + ':/app/dist:ro', str(release / 'frontend-vue/src/utils') + ':/app/frontend-vue/src/utils:ro', str(profiles) + ':/profiles:ro'])
services['layerpilot'].setdefault('environment', {}).update(profile_env)
setmounts('layerpilot-worker', [str(release / 'api') + ':/app/api:ro', str(release / 'frontend-vue/src/utils') + ':/app/frontend-vue/src/utils:ro'])
setmounts('orca-worker', [str(release / 'api') + ':/app/api:ro', str(release / 'frontend-vue/src/utils') + ':/app/frontend-vue/src/utils:ro', str(release / 'scripts') + ':/app/scripts:ro', stage['dependencies'] + ':/app/node_modules:ro', stage['nodePath'] + ':/usr/local/bin/node:ro', str(profiles) + ':/profiles:ro'])
services['orca-worker'].setdefault('environment', {}).update({**profile_env, 'ORCA_SLICER_SETTINGS_PATH': '/profiles/active/machine.json;/profiles/active/process.json', 'ORCA_SLICER_FILAMENT_PATH': '/profiles/active/filament.json'})
candidate = root / 'docker-compose.hi-candidate-20261103.yml'
candidate.write_text(yaml.safe_dump(config, allow_unicode=True, sort_keys=False))
candidate.chmod(override.stat().st_mode & 511)
compose = ['docker', 'compose', '--project-name', '3drfm-farmflow', '--project-directory', str(root), '--env-file', str(root / '.env'), '-f', str(root / 'docker-compose.yml')]

def merged(p):
    return json.loads(subprocess.check_output(compose + ['-f', str(p), 'config', '--format', 'json'], text=True))
a = merged(override)
b = merged(candidate)
allowed = {'ORCA_PROFILE_BUNDLE_MANIFEST', 'ORCA_SLICER_VERSION', 'ORCA_SLICER_SETTINGS_PATH', 'ORCA_SLICER_FILAMENT_PATH'}
for role in roles:
    ae = a['services'][role].get('environment', {})
    be = b['services'][role].get('environment', {})
    if not {k: v for k, v in ae.items() if k not in allowed} == {k: v for k, v in be.items() if k not in allowed}:
        raise RuntimeError('Environment changes outside approved profile fields')
    if not a['services'][role].get('ports') == b['services'][role].get('ports'):
        raise RuntimeError('Port change not allowed')
active = profiles / 'active'
oldactive = os.readlink(active) if active.is_symlink() else None
link = profiles / 'active.hi-new'
os.symlink('releases/' + stage['profileVersion'], link)
os.replace(link, active)
applied = False
try:
    os.replace(candidate, override)
    applied = True
    r = subprocess.run(compose + ['-f', str(override), 'up', '-d', '--no-deps', '--no-build', '--pull', 'never', *roles], capture_output=True, text=True, timeout=160)
    if r.returncode:
        raise RuntimeError('Container replacement failed; raw output withheld')
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    health = False
    cfg = {}
    for i in range(90):
        try:
            with opener.open('http://127.0.0.1:8797/api/public/slicing-quotes/config', timeout=3) as resp:
                cfg = json.load(resp)
            if cfg.get('available') and cfg['profileBundle']['manifestSha256'] == stage['manifestSha256']:
                health = True
                break
        except Exception:
            pass
        time.sleep(1)
    if not health:
        raise RuntimeError('New API/profile did not become healthy')
    after = {k: json.loads(subprocess.check_output(['docker', 'inspect', n], text=True))[0] for k, n in roles.items()}
    for role, c in after.items():
        prior = before[role]
        oe = dict((s.split('=', 1) for s in prior['Config']['Env']))
        ne = dict((s.split('=', 1) for s in c['Config']['Env']))
        if not {k: v for k, v in oe.items() if k not in allowed} == {k: v for k, v in ne.items() if k not in allowed}:
            raise RuntimeError('Live environment drift')
        if not c['Config']['User'] == prior['Config']['User']:
            raise RuntimeError('Deployment preflight failed')
        if not c['HostConfig']['PortBindings'] == prior['HostConfig']['PortBindings']:
            raise RuntimeError('Deployment preflight failed')
        if not (c['HostConfig']['Memory'] == prior['HostConfig']['Memory'] and c['HostConfig']['NanoCpus'] == prior['HostConfig']['NanoCpus']):
            raise RuntimeError('Deployment preflight failed')
        olddata = [m['Source'] for m in prior['Mounts'] if m['Destination'] == '/data']
        newdata = [m['Source'] for m in c['Mounts'] if m['Destination'] == '/data']
        if not olddata == newdata:
            raise RuntimeError('Deployment preflight failed')
    for role in ['layerpilot', 'orca-worker']:
        m = next((m for m in after[role]['Mounts'] if m['Destination'] == '/profiles'))
        if not (m['Source'] == str(profiles) and (not m['RW'])):
            raise RuntimeError('Deployment preflight failed')
    r = subprocess.run(['docker', 'exec', '3drfm-farmflow-orca', 'node', '/app/scripts/check-slicer-profile.mjs'], capture_output=True, text=True, timeout=35)
    if not r.returncode == 0:
        raise RuntimeError('Worker profile integrity check failed')
    check = json.loads(r.stdout)
    if not hashlib.sha256((root / '.env').read_bytes()).hexdigest() == stage['expectedEnvSha256']:
        raise RuntimeError('Deployment preflight failed')
    result = {'deployed': True, 'sourceCommit': stage['sourceCommit'], 'profile': cfg['profileBundle'], 'backup': str(backup), 'databaseBackupBytes': dump.stat().st_size, 'credentialsUnchanged': True, 'dataVolumesUnchanged': True, 'portsAndLimitsUnchanged': True, 'readOnlyProfileMountsVerified': True, 'workerIntegrity': check, 'containerIds': {k: c['Id'][:12] for k, c in after.items()}, 'diskFreeMiB': round(shutil.disk_usage(root).free / 1024 ** 2)}
    (root / 'deployment-state.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
    result['elapsedSeconds'] = round(time.monotonic() - started, 3)
    print(json.dumps(result, ensure_ascii=False))
except Exception:
    if applied:
        restore = root / 'docker-compose.hi-restore.yml'
        restore.write_bytes(old)
        os.replace(restore, override)
        if oldactive:
            retry = profiles / 'active.hi-rollback'
            os.symlink(oldactive, retry)
            os.replace(retry, active)
        subprocess.run(compose + ['-f', str(override), 'up', '-d', '--no-deps', '--no-build', '--pull', 'never', *roles], capture_output=True, timeout=160)
    raise
