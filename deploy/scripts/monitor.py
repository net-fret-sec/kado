#!/usr/bin/env python3
"""Private host-side monitoring. Persist numeric aggregates, never raw metrics/logs."""
import argparse
import fcntl
import activity
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
import time
import urllib.request
from zoneinfo import ZoneInfo

RETENTION = 7 * 86400
FIELDS = ('requests', 'clientErrors', 'serverErrors')

def parse_metrics(text):
    counts = dict.fromkeys(FIELDS, 0)
    started = None
    enabled = False
    outer = False
    for line in text.splitlines():
        if line.startswith('process_start_time_seconds '):
            started = float(line.split()[-1])
        if line.startswith('caddy_http_requests_total{'):
            enabled = True
        m = re.fullmatch(r'caddy_http_request_duration_seconds_count\{(.*)\} ([\d.eE+\-]+)', line)
        if not m:
            continue
        labels = dict(re.findall(r'(\w+)="([^"\\]*)"', m[1]))
        if labels.get('handler') == 'subroute':
            outer = True
        if labels.get('handler') != 'subroute' or labels.get('method') == 'HEAD':
            continue  # The domain site is wrapped in one outer subroute; HEAD probes are excluded.
        code = labels.get('code', '')
        value = float(m[2])
        if not re.fullmatch(r'(?:[1-5]\d\d|0)', code) or not math.isfinite(value) or value < 0 or not value.is_integer():
            raise ValueError('Invalid counter')
        counts['requests'] += int(value)
        if code.startswith('4'):
            counts['clientErrors'] += int(value)
        if code.startswith('5'):
            counts['serverErrors'] += int(value)
    if not enabled or not outer or started is None or not math.isfinite(started) or started <= 0:
        raise ValueError('Metrics unavailable')
    return {'sourceStartedAt': started, 'counts': counts}

def run(args, *, input=None, timeout=12):
    try:
        result = subprocess.run(args, input=input, capture_output=True, text=True, timeout=timeout)
        return result.stdout if result.returncode == 0 else None
    except (OSError, subprocess.TimeoutExpired):
        return None

def probe(base, path, kind):
    try:
        request = urllib.request.Request(base + path, method='HEAD')
        with urllib.request.urlopen(request, timeout=6) as response:
            expected = 'text/html' if kind == 'web' else 'application/json'
            return response.status == 200 and expected in response.headers.get('Content-Type', '')
    except (OSError, ValueError):
        return False

def connect(directory):
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(directory, 0o700)
    db = sqlite3.connect(directory / 'monitor.sqlite3', timeout=10)
    db.execute('PRAGMA secure_delete=ON')
    db.execute('PRAGMA auto_vacuum=FULL')
    db.execute('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
    db.execute('''CREATE TABLE IF NOT EXISTS minutes (
      at INTEGER PRIMARY KEY, requests INTEGER NOT NULL, client_errors INTEGER NOT NULL,
      server_errors INTEGER NOT NULL, web_ok INTEGER NOT NULL, api_ok INTEGER NOT NULL,
      db_ok INTEGER NOT NULL, metrics_ok INTEGER NOT NULL, gap INTEGER NOT NULL, restart INTEGER NOT NULL)''')
    activity.initialize(db)
    db.commit()
    os.chmod(directory / 'monitor.sqlite3', 0o600)
    return db

def record(db, now, metric, checks):
    # Serialize timer and manual reports; a stale overlapping scrape is discarded.
    db.execute('BEGIN IMMEDIATE')
    state = {key: json.loads(value) for key, value in db.execute('SELECT key,value FROM meta')}
    if now <= state.get('observedAt', 0):
        db.rollback()
        return
    delta = dict.fromkeys(FIELDS, 0)
    gap = 0
    restart = 0
    previous = state.get('baseline')
    if metric:
        if previous:
            elapsed = now - previous['at']
            restart = int(metric['sourceStartedAt'] != previous['sourceStartedAt'])
            if elapsed > 180 or elapsed <= 0 or elapsed > RETENTION:
                gap = 1  # No invented attribution of old traffic to a current minute.
            else:
                for key in FIELDS:
                    old = previous['counts'][key]
                    new = metric['counts'][key]
                    if restart:
                        delta[key] = new
                    elif new >= old:
                        delta[key] = new - old
                    else:
                        gap = 1  # Reload/reset not reflected by process start time.
                if gap:
                    delta = dict.fromkeys(FIELDS, 0)
        state['baseline'] = {**metric, 'at': now}
    else:
        gap = 1
    state.setdefault('startedAt', now)
    state['observedAt'] = now
    # A cumulative reference is only needed while recent; it is not an activity log.
    if state.get('baseline', {}).get('at', now) < now - RETENTION:
        state.pop('baseline', None)
    db.execute('DELETE FROM minutes WHERE at < ?', (now - RETENTION,))
    db.execute('''INSERT INTO minutes VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(at) DO UPDATE SET
      requests=requests+excluded.requests, client_errors=client_errors+excluded.client_errors,
      server_errors=server_errors+excluded.server_errors, web_ok=min(web_ok,excluded.web_ok),
      api_ok=min(api_ok,excluded.api_ok), db_ok=min(db_ok,excluded.db_ok),
      metrics_ok=min(metrics_ok,excluded.metrics_ok), gap=max(gap,excluded.gap), restart=max(restart,excluded.restart)''',
      (int(now // 60 * 60), delta['requests'], delta['clientErrors'], delta['serverErrors'],
       int(checks['web']), int(checks['api']), int(checks['database']), int(metric is not None), gap, restart))
    db.execute('DELETE FROM meta')
    db.executemany('INSERT INTO meta VALUES (?,?)', [(k, json.dumps(v)) for k, v in state.items()])
    db.commit()

def history(db, now):
    state = {key: json.loads(value) for key, value in db.execute('SELECT key,value FROM meta')}
    result = {'collectionStartedAt': state.get('startedAt'), 'sampledAt': state.get('observedAt'), 'retentionDays': 7}
    for label, seconds in [('last24Hours', 86400), ('last7Days', RETENTION)]:
        rows = db.execute('SELECT * FROM minutes WHERE at >= ? AND at <= ?', (now-seconds, now)).fetchall()
        totals = {'requests': sum(r[1] for r in rows), 'clientErrors': sum(r[2] for r in rows),
                  'serverErrors': sum(r[3] for r in rows), 'observedMinutes': len(rows),
                  'webFailures': sum(not r[4] for r in rows), 'apiFailures': sum(not r[5] for r in rows),
                  'databaseFailures': sum(not r[6] for r in rows), 'metricFailures': sum(not r[7] for r in rows),
                  'gaps': sum(r[8] for r in rows), 'restarts': sum(r[9] for r in rows)}
        beginning = max(now-seconds, state.get('startedAt', now))
        totals['missingMinutes'] = max(0, int(now//60 - beginning//60 + 1) - len(rows))
        result[label] = totals
    return result

def gather(root, config):
    compose = ['docker', 'compose', '--env-file', str(config), '-f', os.environ.get('KADO_COMPOSE_FILE', str(root/'deploy/docker-compose.prod.yml'))]
    domain = os.environ.get('KADO_MONITOR_URL') or os.environ.get('DOMAIN', '')
    base = (domain if domain.startswith(('http://', 'https://')) else 'https://' + domain).rstrip('/')
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {key: pool.submit(probe, base, path, key) for key, path in
                   [('web','/'), ('api','/health/live'), ('database','/health')]}
        checks = {key: f.result() for key, f in futures.items()}
    raw = run(compose + ['exec','-T','caddy','wget','-T','5','-qO-','http://127.0.0.1:2019/metrics'])
    try:
        metric = parse_metrics(raw or '')
    except ValueError:
        metric = None
    return compose, checks, metric

def service_states(compose):
    result = {}
    for name in ['caddy','api','db']:
        cid = (run(compose + ['ps','-aq',name]) or '').strip()
        fmt = '{"running":{{.State.Running}},"restarts":{{.RestartCount}},"oom":{{.State.OOMKilled}},"health":{{if .State.Health}}{{json .State.Health.Status}}{{else}}"not-configured"{{end}}}'
        raw = run(['docker','inspect',cid,'--format',fmt]) if re.fullmatch(r'[a-f0-9]{12,64}',cid) else None
        try:
            result[name] = json.loads(raw) if raw else {'running': False, 'health': 'unavailable'}
        except ValueError:
            result[name] = {'running': False, 'health': 'unavailable'}
    return result

def timer_active(unit):
    return (run(['systemctl','is-active',unit], timeout=3) or '').strip() == 'active'

def backup_state(now):
    directory = Path(os.environ.get('KADO_BACKUP_DIR', '/var/backups/kado'))
    try:
        files = [p for p in directory.glob('kado-*.dump') if p.is_file() and p.stat().st_size > 0]
        last = max(files, key=lambda p:p.stat().st_mtime) if files else None
        at = last.stat().st_mtime if last else None
        size = last.stat().st_size if last else 0
    except OSError:
        at, size = None, 0
    last_exit = (run(['systemctl','show','kado-backup.service','--property=ExecMainStatus','--value'], timeout=3) or '').strip()
    scheduled = timer_active('kado-backup.timer')
    return {'latestAt': at, 'bytes': size, 'recent': at is not None and 0 <= now-at <= 36*3600,
            'timerActive': scheduled, 'lastJobSucceeded': last_exit == '0' if last_exit else None}

def render(report):
    business = report if report.get('exchanges') is not None else None
    zone = ZoneInfo((business or {}).get('timeZone', 'America/Toronto'))
    def date(value):
        if isinstance(value, str): value = datetime.fromisoformat(value).timestamp()
        return datetime.fromtimestamp(value, zone).strftime('%Y-%m-%d %H:%M:%S %Z') if value else 'indisponible'
    def state(value): return 'OK' if value else 'À VÉRIFIER'
    print('Kado — état du service et activité serveur\n' + date(report['generatedAt']))
    h = report['health']
    print(f"\nÉtat actuel : site {state(h['web'])} · API {state(h['api'])} · base {state(h['database'])}")
    for name, value in report['services'].items():
        print(f"  {name} : {'en marche' if value['running'] else 'indisponible'} · santé {value['health']} · redémarrages {value.get('restarts', '?')}")
    b = report['backup']
    print(f"\nSauvegarde locale : {state(b['recent'] and b['timerActive'] and b['lastJobSucceeded'] is True)}")
    print(f"  Dernier fichier non vide : {date(b['latestAt'])} · {b['bytes']} octets")
    print(f"  Planification : {'active' if b['timerActive'] else 'inactive/inconnue'} · dernier travail : {state(b['lastJobSucceeded'] is True)}")
    print('  Archive vérifiée lors de sa création ; pas de test de restauration à chaque bilan.')
    m = report['serverActivity']
    print(f"\nActivité reçue par le serveur (requêtes, pas visiteurs ni pages)\n  Début de mesure : {date(m['collectionStartedAt'])}")
    print(f"  Mesures internes : {state(report['metricsAvailable'])} · collecte chaque minute : {'active' if report['monitorTimerActive'] else 'INACTIVE/INCONNUE'}")
    for key, label in [('last24Hours','24 dernières heures'),('last7Days','7 derniers jours')]:
        t=m[key]
        print(f"  {label} : {t['requests']} requêtes · {t['clientErrors']} réponses 4xx · {t['serverErrors']} réponses 5xx")
        print(f"    Minutes observées : {t['observedMinutes']} · manquantes : {t['missingMinutes']} · ruptures : {t['gaps']} · redémarrages Caddy détectés : {t['restarts']}")
        print(f"    Minutes avec échec de sonde : site {t['webFailures']} · API {t['apiFailures']} · base {t['databaseFailures']} · mesures {t['metricFailures']}")
    print('\nFichiers, robots et appels automatiques inclus ; requêtes HEAD (dont les sondes) exclues.')
    print('Pas de mesure des visiteurs uniques ni des pages servies uniquement depuis le cache.')
    print('Totaux par minute sur 7 jours, sans IP ni liens personnels, hors sauvegardes.')
    print('Une rupture de collecte ou un redémarrage peut laisser une courte période non mesurée.')
    traffic = report.get('traffic')
    if traffic:
        print('\nDemandes classées — début : ' + date(traffic['collectionStartedAt']))
        print('  Journal : ' + state(traffic['available'] and not traffic['stale']))
        for key, label in [('last24Hours','24 heures'), ('last7Days','7 jours'), ('last30Days','30 jours'), ('last90Days','90 jours')]:
            period = traffic['periods'][key]
            home = period['home']
            if home is None:
                print(f'  {label} : données indisponibles')
                continue
            quality = period['quality']
            incomplete = period['partial'] or quality['missingMinutes'] or quality['gaps'] or traffic['stale']
            print(f"  {label} : accueil GET 200 {home['ok']} · GET 304 {home['notModified']} · dont navigations {home['navigation']}" + (' — période incomplète' if incomplete else ''))
            print(f"    Requêtes classées : {period['requests']} · ruptures {quality['gaps']} · lignes invalides {quality['invalidRecords']}")
        comparison=traffic['comparison']
        print(f"  Comparaison Caddy : {comparison['hours']} heures complètes · écart classées − serveur : {comparison['difference'] if comparison['difference'] is not None else 'indisponible'}")
        print('  Agrégats horaires sur 90 jours ; robots et vos propres consultations inclus.')
    if report.get('stale'):
        print('\nATTENTION : dernier bilan périmé, collecte à vérifier.')
    if business:
        e=business['exchanges']; a=business['activeExchanges']
        print(f"\nÉchanges présents : {e['total']} · actifs : {e['active']} · archivés : {e['archived']}\n  Sans pige : {e['activeUndrawn']} · pige effectuée : {e['activeDrawn']}")
        print(f"  Actifs sans date de remise : {e['activeWithoutEventDate']} · avec au moins 3 participants : {e['activeWithAtLeastThreeParticipants']}")
        print(f"  Participants actifs : {a['participants']} · suggestions : {a['suggestions']}")
        print(f"  Créés et encore présents : 24 h {e['createdLast24Hours']} · 7 j {e['createdLast7Days']} · 30 j {e['createdLast30Days']}")
        print('Actif = non archivé (31 jours après la date de remise), pas récemment visité.')
    else:
        print('\nBilan des échanges indisponible. Les zéros ne sont pas substitués aux données manquantes.')

def build_report(db, now, compose, checks, metric, root):
    raw=run(compose+['exec','-T','api','node','--input-type=module','-','json'],
            input=(root/'deploy/scripts/status.mjs').read_text(), timeout=15)
    try: business=json.loads(raw) if raw else None
    except ValueError: business=None
    activity.rollup(db, now, business)
    return {**(business or {'exchanges':None,'activeExchanges':None,'timeZone':'America/Toronto'}),
            'schemaVersion':2,'generatedAt':datetime.fromtimestamp(now,timezone.utc).isoformat(),
            'health':checks,'metricsAvailable':metric is not None,'services':service_states(compose),
            'monitorTimerActive':timer_active('kado-monitor.timer'),'backup':backup_state(now)}


def exit_status(report):
    return 0 if (not report.get('stale') and report.get('traffic',{}).get('available',False) and all(report['health'].values()) and report['metricsAvailable']
      and report['exchanges'] is not None and report['monitorTimerActive']
      and all(s['running'] for s in report['services'].values())
      and report['backup']['recent'] and report['backup']['timerActive']
      and report['backup']['lastJobSucceeded'] is True) else 1


def main():
    if sys.argv[1:] == ['--parse-metrics']:
        print(json.dumps(parse_metrics(sys.stdin.read())))
        return 0
    parser=argparse.ArgumentParser()
    parser.add_argument('root',type=Path); parser.add_argument('config',type=Path)
    parser.add_argument('--collect',action='store_true'); parser.add_argument('--format',choices=['text','json'],default='text')
    parser.add_argument('--read-only',action='store_true'); parser.add_argument('--history',action='store_true')
    args=parser.parse_args()
    os.umask(0o077)
    directory=Path(os.environ.get('KADO_MONITOR_DIR','/var/lib/kado-monitor'))
    if args.read_only:
        # No mkdir, chmod, migration, probes, SSH side effects or database writes.
        with sqlite3.connect((directory/'monitor.sqlite3').resolve().as_uri()+'?mode=ro', uri=True, timeout=10) as db:
            db.execute('BEGIN')
            report=activity.get_meta(db,'report')
            if report is None: raise ValueError('No report')
            now=time.time()
            report['serverActivity']=history(db,now)
            report['traffic']=activity.report(db,now,args.history)
            report['stale']=now-datetime.fromisoformat(report['generatedAt']).timestamp()>180
            report['readAt']=datetime.fromtimestamp(now,timezone.utc).isoformat()
    else:
        directory.mkdir(mode=0o700,parents=True,exist_ok=True)
        with (directory/'collector.lock').open('a') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX | fcntl.LOCK_NB)
            # Serialize all external reads too; a slower old scrape cannot win.
            now=time.time()
            compose,checks,metric=gather(args.root,args.config)
            with connect(directory) as db:
                record(db,now,metric,checks)
                activity.ingest(db,Path(os.environ.get('KADO_MONITOR_LOG_DIR',str(directory/'access'))),now)
                report=build_report(db,now,compose,checks,metric,args.root)
                with db: activity.set_meta(db,'report',report)
                report['serverActivity']=history(db,now)
                report['traffic']=activity.report(db,now,args.history)
                report['stale']=False
    if args.collect:
        return 0  # Outages are data. The timer still persists failed probes.
    if args.format=='json': print(json.dumps(report,indent=2,ensure_ascii=False))
    else: render(report)
    return exit_status(report)

if __name__=='__main__':
    try: sys.exit(main())
    except (OSError,ValueError,sqlite3.Error):
        print('Bilan serveur indisponible : vérifier configuration, permissions et stockage local.',file=sys.stderr)
        sys.exit(2)
