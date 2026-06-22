"""Deploy operations (Fly.io + Vercel) routes.

Extracted from server.py as part of the modular refactor (Feb 2026).
All helpers, constants, and Pydantic models stay in server.py to keep
import surface minimal and avoid circular imports. This module imports
everything it needs from `server` (late binding via lazy import below).

server.py imports this module AT THE BOTTOM of the file (after all
helpers/db are defined) so the `from server import ...` here resolves
to the fully initialised module.
"""
from fastapi import APIRouter, Depends, HTTPException

# Lazy late-binding from server. Server.py only does
# `from routers.deploy import router` at the very bottom, which means by then
# all of these names are defined in the server module.
from server import (
    db,
    require_super_admin,
    logger,
    # helpers
    _load_deploy_config,
    _fly_graphql,
    _collect_fly_secrets,
    _random_password,
    _random_secret,
    _uptime_target_url,
    _run_uptime_check,
    hash_password,
    # models
    FlyRedeployRequest,
    RotateCredsRequest,
    # constants
    FLY_MACHINES_API,
)
# Standard lib needed in handler bodies
import asyncio
import json
import os
from pathlib import Path
import httpx
from datetime import datetime, timezone, timedelta

router = APIRouter(tags=['deploy'])


# ── In-process cache of the deploy info bundled with this image. We read
# `_deploy_info.json` (stamped by the deploy job before flyctl packages
# the source) once at module import and serve it cached. On the preview
# pod the file simply doesn't exist → we fall back to a "dev" record.
def _read_deploy_info():
    candidates = [
        Path('/app/backend/_deploy_info.json'),
        Path(__file__).resolve().parent.parent / '_deploy_info.json',
    ]
    for p in candidates:
        try:
            if p.exists():
                data = json.loads(p.read_text(encoding='utf-8'))
                data['source'] = 'stamped'
                return data
        except Exception:
            continue
    # Fallback: in dev / preview, try to read git directly.
    try:
        import subprocess
        out = subprocess.check_output(['git', '-C', '/app', 'log', '-1',
                                       '--pretty=format:%H|%s|%cI'],
                                      stderr=subprocess.DEVNULL, timeout=2)
        sha, subj, iso = out.decode('utf-8').split('|', 2)
        return {
            'commit_sha': sha,
            'commit_subject': subj,
            'commit_iso': iso,
            'deployed_at': '',
            'deployed_via': 'preview-runtime',
            'source': 'git',
        }
    except Exception:
        return {
            'commit_sha': '',
            'commit_subject': '',
            'commit_iso': '',
            'deployed_at': '',
            'deployed_via': 'unknown',
            'source': 'missing',
        }


_CACHED_DEPLOY_INFO = _read_deploy_info()


@router.get('/deploy/version')
async def get_deploy_version(user: dict = Depends(require_super_admin)):
    """Returns the commit metadata baked into THIS running image.

    Use this to verify (from the Super Admin UI) that the prod machine
    has actually picked up the latest code after a deploy. The data is
    cached at module load — no fs reads per request.
    """
    return _CACHED_DEPLOY_INFO

@router.post('/deploy/fly/apply-secrets')
async def fly_apply_secrets(user: dict = Depends(require_super_admin)):
    """Push all production secrets to Fly.io via GraphQL setSecrets mutation."""
    cfg = await _load_deploy_config()
    token = cfg.get('flyio_api_key', '')
    app_name = cfg.get('flyio_app_name', '')
    if not app_name:
        raise HTTPException(status_code=400, detail='Nome App Fly.io mancante')
    secrets = _collect_fly_secrets(cfg)
    if not secrets:
        raise HTTPException(status_code=400, detail='Nessun secret compilato nel tab "Secrets"')
    query = '''
    mutation($input: SetSecretsInput!) {
      setSecrets(input: $input) {
        release { id version reason description createdAt }
        app { name }
      }
    }'''
    data = await _fly_graphql(token, query, {
        'input': {'appId': app_name, 'secrets': secrets, 'replaceAll': False}
    })
    rel = (data.get('setSecrets') or {}).get('release') or {}
    return {
        'message': f'{len(secrets)} secrets applicati su Fly.io',
        'release_version': rel.get('version'),
        'release_description': rel.get('description'),
        'applied_keys': [s['key'] for s in secrets]
    }


# ────────────────────────────────────────────────────────────────────
# Deploy NEW backend code — build & push a fresh image to Fly registry
# ────────────────────────────────────────────────────────────────────
# Logs of the most recent in-flight deploy. Kept in-process (single
# machine) so the dashboard can poll progress while the build runs.
_DEPLOY_STATE = {
    'running': False,
    'started_at': None,
    'finished_at': None,
    'started_by': None,
    'exit_code': None,
    'log_tail': [],     # last ~200 lines, ring buffer
    'release_url': None,
}
_DEPLOY_LOG_MAX = 200


def _push_log(line: str):
    buf = _DEPLOY_STATE['log_tail']
    buf.append(line)
    if len(buf) > _DEPLOY_LOG_MAX:
        del buf[: len(buf) - _DEPLOY_LOG_MAX]


def _resolve_fly_source_dir() -> str:
    """Locate the directory containing fly.toml. Works for both:
      - Preview pod: repo cloned at /app, fly.toml in /app/backend/
      - Production container: backend files copied to /app, fly.toml in /app/
    """
    if os.path.isfile('/app/backend/fly.toml'):
        return '/app/backend'
    if os.path.isfile('/app/fly.toml'):
        return '/app'
    # Fallback: current working dir
    return os.getcwd()


async def _run_fly_deploy(token: str, app_name: str):
    """Spawn `flyctl deploy --remote-only` and stream output into the
    in-memory log buffer so the dashboard can poll it."""
    src_dir = _resolve_fly_source_dir()
    _push_log(f'[setup] flyctl deploy from {src_dir} (app={app_name})')

    # Locate flyctl. In production it's installed via the Dockerfile in
    # /usr/local/bin. In the preview pod the binary may live under
    # /root/.fly/bin which is NOT on the default PATH inherited by uvicorn
    # workers spawned by supervisord — so we look in known fallbacks too.
    probe_env = {**os.environ}
    probe_env.setdefault('HOME', '/tmp')
    flyctl_bin = None
    for candidate in ('/usr/local/bin/flyctl', '/root/.fly/bin/flyctl', 'flyctl'):
        try:
            check = await asyncio.create_subprocess_exec(
                candidate, 'version',
                env=probe_env,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )
            await check.wait()
            if check.returncode == 0:
                flyctl_bin = candidate
                break
        except (FileNotFoundError, PermissionError):
            continue

    if not flyctl_bin:
        _push_log('[error] flyctl non installato in questo container. '
                  "Rebuilda l'image con il nuovo Dockerfile o usa flyctl da CLI.")
        _DEPLOY_STATE.update({
            'running': False,
            'finished_at': datetime.now(timezone.utc).isoformat(),
            'exit_code': -127,
        })
        return

    _push_log(f'[setup] using {flyctl_bin}')

    # ── Stamp deploy info INTO the source dir BEFORE invoking flyctl, so the
    # packaged image carries an _deploy_info.json that the running backend
    # can read back at startup. This is the only reliable way to know
    # "what commit is actually live in production" since fly machines have
    # no git inside them.
    try:
        deploy_info = {
            'commit_sha': '',
            'commit_subject': '',
            'commit_iso': '',
            'deployed_at': datetime.now(timezone.utc).isoformat(),
            'deployed_via': 'super-admin-ui',
        }
        # Try to capture HEAD from the repo root (parent of /app/backend).
        repo_root = Path(src_dir).resolve().parent  # /app
        for fmt, key in [('%H', 'commit_sha'), ('%s', 'commit_subject'), ('%cI', 'commit_iso')]:
            try:
                p = await asyncio.create_subprocess_exec(
                    'git', '-C', str(repo_root), 'log', '-1', f'--pretty=format:{fmt}',
                    stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
                )
                out, _ = await p.communicate()
                if p.returncode == 0:
                    deploy_info[key] = out.decode('utf-8', errors='replace').strip()
            except Exception:
                pass
        info_path = Path(src_dir) / '_deploy_info.json'
        info_path.write_text(json.dumps(deploy_info, ensure_ascii=False, indent=2), encoding='utf-8')
        _push_log(f'[setup] stamped {info_path.name} commit={deploy_info.get("commit_sha","?")[:8]}')
    except Exception as e:
        _push_log(f'[warn] could not stamp deploy info: {e}')

    env = {**os.environ, 'FLY_API_TOKEN': token}
    # flyctl needs $HOME for its config cache. Provide a writable fallback
    # if the running process inherited a stripped environment (e.g. when
    # spawned by uvicorn from supervisord).
    env.setdefault('HOME', '/tmp')
    # Use `--strategy immediate` to mirror what we ship from CLI: single
    # machine restart is fine (no need for canary on a hobby tier).
    cmd = [flyctl_bin, 'deploy', '--remote-only', '--app', app_name,
           '--strategy', 'immediate']
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=src_dir,
            env=env,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
    except FileNotFoundError:
        _push_log('[error] flyctl improvvisamente sparito durante l\'esecuzione.')
        _DEPLOY_STATE.update({
            'running': False,
            'finished_at': datetime.now(timezone.utc).isoformat(),
            'exit_code': -127,
        })
        return

    # Stream output line-by-line into the ring buffer.
    assert proc.stdout is not None
    while True:
        line = await proc.stdout.readline()
        if not line:
            break
        text = line.decode('utf-8', errors='replace').rstrip()
        if text:
            _push_log(text)
            # Capture release URL for the dashboard "view deploy" link
            if 'monitoring' in text and 'fly.io/apps' in text:
                idx = text.find('https://')
                if idx >= 0:
                    _DEPLOY_STATE['release_url'] = text[idx:].split()[0]
    exit_code = await proc.wait()
    _DEPLOY_STATE.update({
        'running': False,
        'finished_at': datetime.now(timezone.utc).isoformat(),
        'exit_code': exit_code,
    })
    _push_log(f'[done] exit_code={exit_code}')


@router.post('/deploy/fly/deploy-code')
async def fly_deploy_code(user: dict = Depends(require_super_admin)):
    """Build & push a fresh backend image to Fly. Runs `flyctl deploy
    --remote-only` in the background; the active super-admin can poll
    `GET /deploy/fly/deploy-code/status` for live logs.

    Returns 409 if a deploy is already running."""
    if _DEPLOY_STATE['running']:
        raise HTTPException(status_code=409,
                              detail='Un deploy è già in corso. Attendi che finisca o controlla i log.')
    cfg = await _load_deploy_config()
    token = cfg.get('flyio_api_key', '')
    app_name = cfg.get('flyio_app_name', '')
    if not token or not app_name:
        raise HTTPException(status_code=400,
                              detail='Fly Token o Nome App mancante in Configurazione Deploy')

    # Reset state for the new run
    _DEPLOY_STATE.update({
        'running': True,
        'started_at': datetime.now(timezone.utc).isoformat(),
        'finished_at': None,
        'started_by': user.get('email', ''),
        'exit_code': None,
        'log_tail': [],
        'release_url': None,
    })
    _push_log(f'[start] triggered by {user.get("email", "?")}')

    # Run in background — the response returns immediately so the dashboard
    # can show a "deploy in corso" banner. The machine restarts only AFTER
    # the build is pushed (release_command stage), so the response will
    # reliably reach the client before the current machine dies.
    asyncio.create_task(_run_fly_deploy(token, app_name))

    return {
        'message': 'Deploy avviato. Il build richiede ~2-3 minuti, poi la '
                    'machine si riavvia automaticamente. Controlla il log live qui sotto.',
        'started_at': _DEPLOY_STATE['started_at'],
        'app': app_name,
    }


@router.get('/deploy/fly/deploy-code/status')
async def fly_deploy_code_status(user: dict = Depends(require_super_admin)):
    """Return the live status + recent log lines for the in-flight (or
    last) `flyctl deploy` run."""
    return {
        'running': _DEPLOY_STATE['running'],
        'started_at': _DEPLOY_STATE['started_at'],
        'finished_at': _DEPLOY_STATE['finished_at'],
        'started_by': _DEPLOY_STATE['started_by'],
        'exit_code': _DEPLOY_STATE['exit_code'],
        'release_url': _DEPLOY_STATE['release_url'],
        'log_tail': list(_DEPLOY_STATE['log_tail']),
    }


@router.get('/deploy/fly/status')
async def fly_status(user: dict = Depends(require_super_admin)):
    """Return machines status + current release info for the configured Fly app."""
    cfg = await _load_deploy_config()
    token = cfg.get('flyio_api_key', '')
    app_name = cfg.get('flyio_app_name', '')
    if not token or not app_name:
        raise HTTPException(status_code=400, detail='Fly Token o Nome App mancante')

    # 1) Machines via Machines API
    machines = []
    async with httpx.AsyncClient(timeout=20.0) as c:
        try:
            r = await c.get(f'{FLY_MACHINES_API}/apps/{app_name}/machines',
                              headers={'Authorization': f'Bearer {token}'})
            if r.status_code == 200:
                ms = r.json() if isinstance(r.json(), list) else []
                for m in ms:
                    machines.append({
                        'id': m.get('id'),
                        'state': m.get('state'),
                        'region': m.get('region'),
                        'image': (m.get('config') or {}).get('image', ''),
                        'updated_at': m.get('updated_at')
                    })
            elif r.status_code == 404:
                return {'app': app_name, 'exists': False, 'machines': [], 'release': None}
            else:
                # Don't crash — let GQL try
                pass
        except Exception as e:
            logger.warning(f'Fly machines fetch failed: {e}')

    # 2) Current release via GraphQL
    query = '''
    query($name: String!) {
      app(name: $name) {
        name
        status
        deployed
        currentRelease { id version description status createdAt imageRef }
      }
    }'''
    data = await _fly_graphql(token, query, {'name': app_name})
    a = data.get('app') or {}
    return {
        'app': a.get('name', app_name),
        'exists': bool(a),
        'app_status': a.get('status'),
        'deployed': a.get('deployed'),
        'release': a.get('currentRelease'),
        'machines': machines
    }



@router.post('/deploy/fly/redeploy')
async def fly_redeploy(req: FlyRedeployRequest, user: dict = Depends(require_super_admin)):
    """Re-release the current image (applies staged secrets). If image_ref provided, deploys that.
    Useful to apply secrets without rebuilding from source.

    Supports BOTH platforms:
    - Machines platform (new): restart each machine via REST API to pick up staged secrets
    - Nomad platform (legacy): GraphQL deployImage mutation

    Note: restart is scheduled in BACKGROUND so the HTTP response can return before the
    backend's own machine restarts (otherwise client gets a 502 "connection reset").
    """
    cfg = await _load_deploy_config()
    token = cfg.get('flyio_api_key', '')
    app_name = cfg.get('flyio_app_name', '')
    if not token or not app_name:
        raise HTTPException(status_code=400, detail='Fly Token o Nome App mancante')

    # 1) Detect platform: try Machines API first (works on new apps)
    async with httpx.AsyncClient(timeout=60.0) as c:
        r = await c.get(f'{FLY_MACHINES_API}/apps/{app_name}/machines',
                        headers={'Authorization': f'Bearer {token}'})
        if r.status_code == 200:
            machines = r.json() if isinstance(r.json(), list) else []
            if machines:
                machine_ids = [m.get('id') for m in machines if m.get('id')]
                current_image = (machines[0].get('config') or {}).get('image') if machines else None

                # Schedule redeploy in BACKGROUND so we can return 200 before our own machine dies.
                # Note: /machines/{id}/restart does NOT pick up staged secrets — it only restarts the
                # current instance. To force a fresh release that includes staged secrets we use
                # POST /machines/{id} with the existing config (or new image_ref): this creates a new
                # release and applies all staged secrets.
                async def _do_restart():
                    await asyncio.sleep(2)  # give time for client to receive response
                    async with httpx.AsyncClient(timeout=120.0) as cc:
                        for mid in machine_ids:
                            try:
                                m_orig = next((m for m in machines if m.get('id') == mid), {})
                                cfg_m = dict(m_orig.get('config') or {})
                                if req.image_ref:
                                    cfg_m['image'] = req.image_ref
                                await cc.post(f'{FLY_MACHINES_API}/apps/{app_name}/machines/{mid}',
                                                headers={'Authorization': f'Bearer {token}'},
                                                json={'config': cfg_m})
                            except Exception as e:
                                logger.error(f'Background redeploy machine {mid} failed: {e}')

                asyncio.create_task(_do_restart())

                return {
                    'message': f'Redeploy di {len(machine_ids)} machine(s) avviato in background '
                                '(attendi ~15-30s, i secret staged verranno applicati). Se sei superadmin '
                                'su questa stessa app, la prossima richiesta potrebbe fallire mentre il '
                                'backend riparte.',
                    'platform': 'machines',
                    'machines': machine_ids,
                    'image': req.image_ref or current_image,
                    'scheduled': True
                }

    # 2) Fallback: Nomad platform (legacy) — GraphQL deployImage mutation
    image = req.image_ref
    if not image:
        q = '''
        query($name: String!) {
          app(name: $name) { currentRelease { imageRef } }
        }'''
        d = await _fly_graphql(token, q, {'name': app_name})
        image = ((d.get('app') or {}).get('currentRelease') or {}).get('imageRef')
        if not image:
            raise HTTPException(status_code=400,
                                  detail='Nessuna release esistente su Fly. Fai prima un deploy iniziale '
                                          'da CLI (fly deploy) per creare la prima immagine.')

    mutation = '''
    mutation($input: DeployImageInput!) {
      deployImage(input: $input) {
        release { id version description status }
        app { name }
      }
    }'''
    data = await _fly_graphql(token, mutation, {
        'input': {'appId': app_name, 'image': image, 'strategy': 'ROLLING'}
    })
    rel = (data.get('deployImage') or {}).get('release') or {}
    return {
        'message': 'Redeploy avviato',
        'platform': 'nomad',
        'image': image,
        'release_version': rel.get('version'),
        'release_status': rel.get('status')
    }

    # 2) Fallback: Nomad platform (legacy) — GraphQL deployImage mutation
    image = req.image_ref
    if not image:
        q = '''
        query($name: String!) {
          app(name: $name) { currentRelease { imageRef } }
        }'''
        d = await _fly_graphql(token, q, {'name': app_name})
        image = ((d.get('app') or {}).get('currentRelease') or {}).get('imageRef')
        if not image:
            raise HTTPException(status_code=400,
                                  detail='Nessuna release esistente su Fly. Fai prima un deploy iniziale '
                                          'da CLI (fly deploy) per creare la prima immagine.')

    mutation = '''
    mutation($input: DeployImageInput!) {
      deployImage(input: $input) {
        release { id version description status }
        app { name }
      }
    }'''
    data = await _fly_graphql(token, mutation, {
        'input': {'appId': app_name, 'image': image, 'strategy': 'ROLLING'}
    })
    rel = (data.get('deployImage') or {}).get('release') or {}
    return {
        'message': 'Redeploy avviato',
        'platform': 'nomad',
        'image': image,
        'release_version': rel.get('version'),
        'release_status': rel.get('status')
    }


@router.post('/deploy/fly/update-image')
async def fly_update_image(req: FlyRedeployRequest, user: dict = Depends(require_super_admin)):
    """Update each machine with the latest image pushed to registry.fly.io.
    Useful after a CI build pushed a new image but machines haven't picked it up.

    Behaviour:
    - If `image_ref` is provided, uses it
    - Else fetches the latest release imageRef from Fly GraphQL
    - For each machine on the Machines platform: POSTs config.image = new_image
    """
    cfg = await _load_deploy_config()
    token = cfg.get('flyio_api_key', '')
    app_name = cfg.get('flyio_app_name', '')
    if not token or not app_name:
        raise HTTPException(status_code=400, detail='Fly Token o Nome App mancante')

    # 1) Resolve target image
    target_image = (req.image_ref or '').strip()
    if not target_image:
        q = '''
        query($name: String!) {
          app(name: $name) { currentRelease { imageRef } }
        }'''
        d = await _fly_graphql(token, q, {'name': app_name})
        target_image = ((d.get('app') or {}).get('currentRelease') or {}).get('imageRef') or ''
        if not target_image:
            raise HTTPException(status_code=400,
                                  detail='Nessuna release esistente. Fai prima `fly deploy` da CLI per pushare la prima image.')

    # 2) List machines
    async with httpx.AsyncClient(timeout=60.0) as c:
        r = await c.get(f'{FLY_MACHINES_API}/apps/{app_name}/machines',
                          headers={'Authorization': f'Bearer {token}'})
        if r.status_code >= 400:
            raise HTTPException(status_code=502, detail=f'Fly machines list: {r.status_code} {r.text[:200]}')
        machines = r.json() if isinstance(r.json(), list) else []
        if not machines:
            raise HTTPException(status_code=400, detail='Nessuna machine trovata. Fai prima `fly deploy` da CLI.')

        updated, skipped = [], []
        for m in machines:
            mid = m.get('id')
            current_image = ((m.get('config') or {}).get('image') or '').strip()
            if current_image == target_image:
                skipped.append({'id': mid, 'reason': 'already on target image'})
                continue
            # Update machine with new image (preserve full config)
            new_cfg = dict(m.get('config') or {})
            new_cfg['image'] = target_image
            rr = await c.post(f'{FLY_MACHINES_API}/apps/{app_name}/machines/{mid}',
                                headers={'Authorization': f'Bearer {token}'},
                                json={'config': new_cfg})
            if rr.status_code >= 400:
                raise HTTPException(status_code=502,
                                      detail=f'Fly machine {mid} update: {rr.status_code} {rr.text[:200]}')
            updated.append(mid)

    return {
        'message': f'{len(updated)} machine(s) aggiornata/e all\'ultima image' + (f' · {len(skipped)} già aggiornata/e' if skipped else ''),
        'platform': 'machines',
        'target_image': target_image,
        'updated': updated,
        'skipped': skipped
    }


@router.post('/deploy/vercel/trigger')
async def vercel_trigger(user: dict = Depends(require_super_admin)):
    """Trigger a Vercel deployment. Prefers Deploy Hook (no token); falls back to API + token."""
    cfg = await _load_deploy_config()
    hook = (cfg.get('vercel_deploy_hook') or '').strip()
    token = (cfg.get('vercel_token') or '').strip()
    project_id = (cfg.get('vercel_project_id') or '').strip()
    org_id = (cfg.get('vercel_org_id') or '').strip()

    async with httpx.AsyncClient(timeout=30.0) as c:
        if hook:
            r = await c.post(hook)
            if r.status_code >= 400:
                raise HTTPException(status_code=502, detail=f'Vercel hook: {r.status_code} {r.text[:300]}')
            try:
                payload = r.json()
            except Exception:
                payload = {'raw': r.text[:500]}
            return {'method': 'deploy_hook', 'status': r.status_code, **payload}

        if not token or not project_id:
            raise HTTPException(status_code=400,
                                  detail='Configura un Vercel Deploy Hook oppure Token + Project ID')

        # Try to find latest deployment, then re-deploy via API
        params = {'projectId': project_id, 'limit': '1'}
        if org_id:
            params['teamId'] = org_id
        headers = {'Authorization': f'Bearer {token}'}
        r = await c.get('https://api.vercel.com/v6/deployments', params=params, headers=headers)
        if r.status_code >= 400:
            raise HTTPException(status_code=502, detail=f'Vercel API: {r.status_code} {r.text[:300]}')
        deployments = (r.json() or {}).get('deployments') or []
        if not deployments:
            raise HTTPException(status_code=400,
                                  detail='Nessun deployment esistente da ridistribuire. Usa un Deploy Hook '
                                          'oppure crea un primo deploy manuale.')
        latest = deployments[0]
        meta = latest.get('meta') or {}
        body = {
            'name': latest.get('name') or project_id,
            'target': latest.get('target') or 'production',
            'projectSettings': {},
            'gitSource': {
                'type': meta.get('githubDeployment') and 'github' or latest.get('source') or 'github',
                'ref': meta.get('githubCommitRef') or 'main',
                'repoId': meta.get('githubRepoId'),
            }
        }
        # Filter empties to avoid 400s
        gs = {k: v for k, v in body['gitSource'].items() if v}
        if gs.get('repoId'):
            body['gitSource'] = gs
            url = 'https://api.vercel.com/v13/deployments'
            if org_id:
                url += f'?teamId={org_id}'
            r2 = await c.post(url, json=body, headers=headers)
            if r2.status_code >= 400:
                raise HTTPException(status_code=502, detail=f'Vercel deploy: {r2.status_code} {r2.text[:300]}')
            d = r2.json()
            return {'method': 'api', 'id': d.get('id'), 'url': d.get('url'), 'state': d.get('readyState')}
        raise HTTPException(status_code=400,
                              detail='Impossibile derivare gitSource. Configura un Deploy Hook su Vercel '
                                      '(Project → Settings → Git → Deploy Hooks) e incollalo nel pannello.')



@router.post('/deploy/rotate-credentials')
async def rotate_credentials(req: RotateCredsRequest, user: dict = Depends(require_super_admin)):
    """Rotate JWT_SECRET and/or admin/superadmin passwords. Updates local DB users +
    saves new values in deployment config + (optionally) pushes them to Fly secrets."""
    cfg = await _load_deploy_config()

    updates = {}
    rotated = {'jwt': False, 'superadmin_password': False}
    new_super_pwd = None

    if req.rotate_jwt:
        updates['prod_jwt_secret'] = _random_secret(32)
        rotated['jwt'] = True

    if req.rotate_superadmin_password:
        new_super_pwd = (req.new_superadmin_password or '').strip() or _random_password(16)
        updates['prod_superadmin_password'] = new_super_pwd
        rotated['superadmin_password'] = True
        super_email = cfg.get('prod_superadmin_email') or os.environ.get('SUPERADMIN_EMAIL', 'superadmin@qrhub.it')
        await db.users.update_one(
            {'email': super_email.lower(), 'role': 'super_admin'},
            {'$set': {'password_hash': hash_password(new_super_pwd)}}
        )

    if not updates:
        raise HTTPException(status_code=400, detail='Nessuna rotazione richiesta')

    # Persist into deployment config
    updates['updated_at'] = datetime.now(timezone.utc).isoformat()
    updates['updated_by'] = user.get('email', '')
    await db.config.update_one({'type': 'deployment'}, {'$set': updates}, upsert=True)

    fly_result = None
    if req.apply_to_fly and cfg.get('flyio_api_key') and cfg.get('flyio_app_name'):
        # Re-apply secrets so production picks up the new values
        new_cfg = {**cfg, **updates}
        secrets = _collect_fly_secrets(new_cfg)
        query = '''
        mutation($input: SetSecretsInput!) {
          setSecrets(input: $input) {
            release { id version description }
          }
        }'''
        data = await _fly_graphql(cfg['flyio_api_key'], query, {
            'input': {'appId': cfg['flyio_app_name'], 'secrets': secrets, 'replaceAll': False}
        })
        rel = (data.get('setSecrets') or {}).get('release') or {}
        fly_result = {
            'release_version': rel.get('version'),
            'release_description': rel.get('description'),
            'applied_keys': [s['key'] for s in secrets]
        }

    return {
        'message': 'Credenziali ruotate',
        'rotated': rotated,
        'new_superadmin_password': new_super_pwd if req.rotate_superadmin_password else None,
        'new_jwt_secret_preview': (updates.get('prod_jwt_secret') or '')[:8] + '…' if rotated['jwt'] else None,
        'fly': fly_result
    }


# ──────────────────────────────────────────────────────────────────
# Uptime monitor — pings production backend every N seconds
# ──────────────────────────────────────────────────────────────────

@router.get('/deploy/uptime/summary')
async def uptime_summary(user: dict = Depends(require_super_admin)):
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    checks = await db.uptime_checks.find(
        {'timestamp': {'$gte': cutoff}}, {'_id': 0}
    ).sort('timestamp', -1).to_list(2000)
    cfg = await _load_deploy_config()
    target = await _uptime_target_url(cfg)
    if not checks:
        return {
            'has_data': False, 'target': target,
            'enabled': cfg.get('uptime_enabled', True),
            'interval_sec': cfg.get('uptime_interval_sec', 60),
            'message': 'In attesa del primo check (entro 60s dal salvataggio dell\'URL Fly).'
        }
    total = len(checks)
    up_count = sum(1 for c in checks if c.get('up'))
    uptime_pct = round((up_count / total) * 100, 2) if total else 0.0
    latencies = [c['latency_ms'] for c in checks if c.get('up') and c.get('latency_ms')]
    avg_latency = round(sum(latencies) / len(latencies)) if latencies else 0
    last = checks[0]
    # Hourly bucket for chart
    buckets = {}
    for c in checks:
        try:
            h = c['timestamp'][:13]  # YYYY-MM-DDTHH
            b = buckets.setdefault(h, {'hour': h, 'up': 0, 'down': 0, 'lat_sum': 0, 'lat_cnt': 0})
            if c.get('up'):
                b['up'] += 1
                if c.get('latency_ms'):
                    b['lat_sum'] += c['latency_ms']
                    b['lat_cnt'] += 1
            else:
                b['down'] += 1
        except Exception:
            pass
    chart = []
    for h in sorted(buckets.keys()):
        b = buckets[h]
        chart.append({
            'hour': h[11:13] + ':00',
            'full_hour': h,
            'avg_latency': round(b['lat_sum'] / b['lat_cnt']) if b['lat_cnt'] else 0,
            'up': b['up'], 'down': b['down']
        })
    return {
        'has_data': True, 'target': target,
        'enabled': cfg.get('uptime_enabled', True),
        'interval_sec': cfg.get('uptime_interval_sec', 60),
        'current_status': 'up' if last.get('up') else 'down',
        'last_check': last,
        'uptime_pct_24h': uptime_pct,
        'avg_latency_ms': avg_latency,
        'total_checks': total,
        'down_count': total - up_count,
        'chart': chart,
        'recent': checks[:15]
    }


@router.post('/deploy/uptime/check-now')
async def uptime_check_now(user: dict = Depends(require_super_admin)):
    cfg = await _load_deploy_config()
    rec = await _run_uptime_check(cfg)
    if not rec:
        raise HTTPException(status_code=400, detail='Configura prima Fly App Name o Fly App URL')
    return rec
