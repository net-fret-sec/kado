"""Anonymous request aggregates. No visitor identifiers, raw URLs or headers."""
import hashlib
import json
import math
import os
from pathlib import Path
import sqlite3

DAY = 86400
DETAIL = 7 * DAY
RETENTION = 90 * DAY
CATEGORIES = ('home', 'organizer', 'participant', 'files', 'api', 'technical', 'other')
METHODS = ('GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'OTHER')


def initialize(db):
    db.executescript('''
      CREATE TABLE IF NOT EXISTS activity_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS activity_sources (
        identity TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, offset INTEGER NOT NULL,
        size INTEGER NOT NULL, seen REAL NOT NULL, active INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS traffic_minutes (
        at INTEGER, category TEXT, method TEXT, status INTEGER, navigation INTEGER, requests INTEGER NOT NULL,
        PRIMARY KEY(at,category,method,status,navigation));
      CREATE TABLE IF NOT EXISTS traffic_hours (
        at INTEGER, category TEXT, method TEXT, status INTEGER, navigation INTEGER, requests INTEGER NOT NULL,
        PRIMARY KEY(at,category,method,status,navigation));
      CREATE TABLE IF NOT EXISTS coverage_minutes (
        at INTEGER PRIMARY KEY, ok INTEGER NOT NULL, gap INTEGER NOT NULL, invalid INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS coverage_hours (
        at INTEGER PRIMARY KEY, observed INTEGER, failures INTEGER, gaps INTEGER, invalid INTEGER);
      CREATE TABLE IF NOT EXISTS server_hours (
        at INTEGER PRIMARY KEY, requests INTEGER, client_errors INTEGER, server_errors INTEGER,
        observed INTEGER, gaps INTEGER, restarts INTEGER, failures INTEGER);
      CREATE TABLE IF NOT EXISTS business_hours (at INTEGER PRIMARY KEY, sampled_at REAL, report TEXT);
    ''')


def get_meta(db, key, default=None):
    row = db.execute('SELECT value FROM activity_meta WHERE key=?', (key,)).fetchone()
    return json.loads(row[0]) if row else default


def set_meta(db, key, value):
    db.execute('INSERT INTO activity_meta VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
               (key, json.dumps(value)))


def parse_line(line, now):
    item = json.loads(line)
    # Fail closed on schema drift: the collector never copies extra fields.
    if not isinstance(item, dict) or set(item) != {'ts', 'category', 'method', 'status', 'navigation'}:
        raise ValueError('Unexpected schema')
    ts = item['ts']
    status = item['status']
    if isinstance(ts, bool) or not isinstance(ts, (float, int)) or not math.isfinite(ts) or not 0 < ts <= now + 60:
        raise ValueError('Invalid time')
    if type(status) is not int or not (100 <= status <= 599 or status == 0):
        raise ValueError('Invalid status')
    if item['category'] not in CATEGORIES or item['method'] not in METHODS or str(item['navigation']) not in ('0', '1'):
        raise ValueError('Invalid classification')
    return ts, item['category'], item['method'], status, int(item['navigation'])


def ingest(db, directory, now):
    """Cursors and counts commit together; rotation is followed by device/inode.

    Runs under the caller's collector lock. An incomplete final line is retried.
    Closed, consumed files are removed after commit. No active file is truncated.
    """
    directory = Path(directory)
    db.execute('BEGIN IMMEDIATE')
    expired = []
    try:
        previous = get_meta(db, 'observedAt', 0)
        if now <= previous:
            db.rollback()
            return
        started = get_meta(db, 'startedAt')
        paths = sorted(directory.glob('access*.log')) if directory.is_dir() else []
        active_exists = (directory / 'access.log').is_file()
        if started is None and active_exists:
            started = now
            set_meta(db, 'startedAt', started)
        gap = int(bool(previous and now - previous > 180))
        ok = active_exists
        invalid = 0
        seen = set()
        budget = 32 * 1024 * 1024
        for path in paths:
            if path.is_symlink():
                ok = False
                gap = 1
                continue
            try:
                with path.open('rb') as stream:
                    stat = os.fstat(stream.fileno())
                    identity = f'{stat.st_dev}:{stat.st_ino}'
                    seen.add(identity)
                    first = stream.readline(4097)
                    fingerprint = hashlib.sha256(first).hexdigest() if first.endswith(b'\n') else ''
                    old = db.execute('SELECT fingerprint,offset,size FROM activity_sources WHERE identity=?', (identity,)).fetchone()
                    offset = old[1] if old else 0
                    if old and (stat.st_size < offset or (offset and old[0] != fingerprint)):
                        offset = 0
                        gap = 1
                    stream.seek(offset)
                    while stream.tell() < stat.st_size and budget > 0:
                        position = stream.tell()
                        line = stream.readline(min(4097, stat.st_size-position))
                        budget -= len(line)
                        if not line.endswith(b'\n'):
                            if len(line) <= 4096:
                                stream.seek(position)
                                break
                            # Skip a malformed overlong record without retaining its contents.
                            while line and not line.endswith(b'\n') and stream.tell() < stat.st_size:
                                line = stream.readline(4097)
                                budget -= len(line)
                            invalid += 1
                            continue
                        try:
                            ts, category, method, status, navigation = parse_line(line, now)
                        except (ValueError, TypeError, UnicodeError):
                            invalid += 1
                            continue
                        if started is None or ts < max(started, now-DAY) or method == 'HEAD':
                            continue
                        for table, step in [('traffic_minutes', 60), ('traffic_hours', 3600)]:
                            db.execute(f'''INSERT INTO {table} VALUES (?,?,?,?,?,1)
                              ON CONFLICT(at,category,method,status,navigation) DO UPDATE SET requests=requests+1''',
                              (int(ts//step*step), category, method, status, navigation))
                    offset = stream.tell()
                    if offset < stat.st_size:
                        ok = False  # A partial write/backlog is not a complete sample.
                    db.execute('''INSERT INTO activity_sources VALUES (?,?,?,?,?,?) ON CONFLICT(identity) DO UPDATE SET
                      fingerprint=excluded.fingerprint,offset=excluded.offset,size=excluded.size,
                      seen=excluded.seen,active=excluded.active''',
                      (identity, fingerprint, offset, stat.st_size, now, int(path.name == 'access.log')))
                    # Delete only closed files; their cursors remain to make retries safe.
                    if path.name != 'access.log' and (offset >= stat.st_size or stat.st_mtime < now-DAY):
                        expired.append(path)
            except OSError:
                ok = False
                gap = 1
        for identity, in db.execute('SELECT identity FROM activity_sources WHERE active=1 AND seen < ?', (now,)):
            if identity not in seen:
                gap = 1
        if not ok or invalid:
            gap = 1
        minute = int(now//60*60)
        db.execute('''INSERT INTO coverage_minutes VALUES (?,?,?,?) ON CONFLICT(at) DO UPDATE SET
          ok=min(ok,excluded.ok),gap=max(gap,excluded.gap),invalid=invalid+excluded.invalid''',
          (minute, int(ok), gap, invalid))
        set_meta(db, 'observedAt', now)
        set_meta(db, 'available', bool(ok and not invalid))
        db.execute('DELETE FROM activity_sources WHERE seen < ?', (now-DAY,))
        db.commit()
    except BaseException:
        db.rollback()
        raise
    for path in expired:
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass  # Caddy's size/time rotation remains a second retention limit.


def rollup(db, now, business=None):
    # Do not overwrite the oldest hour from a minute table already partly purged.
    beginning = math.ceil((now-DETAIL)/3600)*3600
    with db:
        db.execute('''INSERT OR REPLACE INTO server_hours
          SELECT CAST(at/3600 AS INTEGER)*3600,sum(CASE WHEN metrics_ok=1 THEN requests END),sum(CASE WHEN metrics_ok=1 THEN client_errors END),sum(CASE WHEN metrics_ok=1 THEN server_errors END),
          count(*),sum(gap),sum(restart),sum(CASE WHEN metrics_ok=0 THEN 1 ELSE 0 END)
          FROM minutes WHERE at>=? GROUP BY CAST(at/3600 AS INTEGER)''', (beginning,))
        db.execute('''INSERT OR REPLACE INTO coverage_hours
          SELECT CAST(at/3600 AS INTEGER)*3600,count(*),sum(1-ok),sum(gap),sum(invalid)
          FROM coverage_minutes WHERE at>=? GROUP BY CAST(at/3600 AS INTEGER)''', (beginning,))
        if business is not None:
            # Fixed aggregate schema only. Never store arbitrary API/database output.
            safe = {key: business[key] for key in ('exchanges', 'activeExchanges')}
            if not all(isinstance(group, dict) and all(type(v) is int and v >= 0 for v in group.values()) for group in safe.values()):
                raise ValueError('Invalid business aggregate')
            db.execute('INSERT OR REPLACE INTO business_hours VALUES (?,?,?)',
                       (int(now//3600*3600), now, json.dumps(safe)))
        for table in ('traffic_minutes', 'coverage_minutes'):
            db.execute(f'DELETE FROM {table} WHERE at < ?', (now-DETAIL,))
        for table in ('traffic_hours', 'coverage_hours', 'server_hours', 'business_hours'):
            db.execute(f'DELETE FROM {table} WHERE at < ?', (now-RETENTION,))


def report(db, now, include_history=False):
    started = get_meta(db, 'startedAt')
    observed = get_meta(db, 'observedAt')
    result = {'collectionStartedAt': started, 'sampledAt': observed, 'retentionDays': 90,
              'available': bool(get_meta(db, 'available', False)),
              'stale': observed is None or now-observed > 180, 'periods': {}}
    for days, key in [(1, 'last24Hours'), (7, 'last7Days'), (30, 'last30Days'), (90, 'last90Days')]:
        # Hourly windows for long periods; boundaries are explicit, never mixed with exact windows.
        start = int((now-days*DAY)//(60 if days <= 7 else 3600))*(60 if days <= 7 else 3600)
        table = 'traffic_minutes' if days <= 7 else 'traffic_hours'
        rows = db.execute(f'SELECT category,method,status,navigation,sum(requests) FROM {table} WHERE at>=? AND at<=? GROUP BY category,method,status,navigation', (start, now)).fetchall()
        categories = {k: 0 for k in CATEGORIES}
        statuses = {'200': 0, '304': 0, 'other': 0}
        navigation = 0
        for category, method, status, nav, n in rows:
            categories[category] += n
            if category == 'home' and method == 'GET':
                statuses[str(status) if status in (200,304) else 'other'] += n
                if status in (200,304) and nav:
                    navigation += n
        quality_start = max(start, int(started//60*60)) if started else start
        if days <= 7:
            quality = db.execute('SELECT count(*),coalesce(sum(1-ok),0),coalesce(sum(gap),0),coalesce(sum(invalid),0) FROM coverage_minutes WHERE at>=? AND at<=?', (quality_start, now)).fetchone()
        else:
            quality = db.execute('SELECT coalesce(sum(observed),0),coalesce(sum(failures),0),coalesce(sum(gaps),0),coalesce(sum(invalid),0) FROM coverage_hours WHERE at>=? AND at<=?', (start, now)).fetchone()
        effective = max(start, started) if started else None
        expected = max(0, int(now//60-effective//60+1)) if effective else 0
        measured = started is not None and quality[0] > quality[1]
        result['periods'][key] = {
          'from': start, 'to': now, 'effectiveFrom': effective, 'partial': not started or started > start,
          'requests': sum(categories.values()) if measured else None, 'categories': categories if measured else None,
          'home': {'ok': statuses['200'], 'notModified': statuses['304'], 'other': statuses['other'],
                   'navigation': navigation} if measured else None,
          'quality': {'observedMinutes': quality[0], 'expectedMinutes': expected,
                      'missingMinutes': max(0,expected-quality[0]), 'failures': quality[1],
                      'gaps': quality[2], 'invalidRecords': quality[3]},
        }
    end = int((now-120)//3600)*3600
    start = max(end-DAY, math.ceil(started/3600)*3600 if started else end)
    comparisons = []
    for at, requests, _, _, observed_minutes, gaps, restarts, failures in db.execute('SELECT * FROM server_hours WHERE at>=? AND at<?', (start,end)):
        coverage = db.execute('SELECT observed,failures,gaps,invalid FROM coverage_hours WHERE at=?', (at,)).fetchone()
        if observed_minutes != 60 or gaps or restarts or failures or coverage != (60,0,0,0):
            continue
        count = db.execute('SELECT coalesce(sum(requests),0) FROM traffic_hours WHERE at=?', (at,)).fetchone()[0]
        comparisons.append((requests,count))
    result['comparison'] = {'hours':len(comparisons), 'serverRequests':sum(r[0] for r in comparisons),
                            'classifiedRequests':sum(r[1] for r in comparisons),
                            'difference':sum(r[1]-r[0] for r in comparisons) if comparisons else None,
                            'note':'Heures complètes comparables; de petits écarts aux frontières des relevés sont possibles.'}
    if include_history:
        hours = {}
        def hour(at):
            return hours.setdefault(at, {'at':at,'requests':None,'clientErrors':None,'serverErrors':None,
              'observedMinutes':0,'gaps':0,'restarts':0,'metricFailures':0,'coverage':None,'categories':None,'home':None})
        for row in db.execute('SELECT * FROM server_hours WHERE at>=? AND at<=? ORDER BY at', (now-RETENTION,now)):
            at, requests, client, server, n, gaps, restarts, failures = row
            hour(at).update(requests=requests,clientErrors=client,serverErrors=server,observedMinutes=n,gaps=gaps,restarts=restarts,metricFailures=failures)
        for at,n,failures,gaps,invalid in db.execute('SELECT * FROM coverage_hours WHERE at>=? AND at<=?', (now-RETENTION,now)):
            h=hour(at)
            h['coverage']={'observedMinutes':n,'failures':failures,'gaps':gaps,'invalidRecords':invalid}
            if started is not None and at+3600>started and n>failures:
                h['categories']=dict.fromkeys(CATEGORIES,0)
                h['home']={'ok':0,'notModified':0,'other':0,'navigation':0}
        for at,category,method,status,nav,n in db.execute('SELECT * FROM traffic_hours WHERE at>=? AND at<=?', (now-RETENTION,now)):
            h=hour(at)
            if h['categories'] is None:
                h['categories']=dict.fromkeys(CATEGORIES,0)
                h['home']={'ok':0,'notModified':0,'other':0,'navigation':0}
            h['categories'][category]+=n
            if category=='home' and method=='GET':
                h['home']['ok' if status==200 else 'notModified' if status==304 else 'other']+=n
                if nav and status in (200,304):h['home']['navigation']+=n
        # Clip the first/last displayed hour to each selected window. This keeps
        # cards, CSV and graphs consistent without returning 10,080 minute rows.
        for period in result['periods'].values():
            period['boundaryHours'] = []
            for at in sorted({int(period['from']//3600*3600), int(now//3600*3600)}):
                if at < math.ceil((now-DETAIL)/3600)*3600:
                    continue
                lo, hi = max(at, period['from']), min(at+3599, now)
                h = {'at':at,'requests':None,'clientErrors':None,'serverErrors':None,
                     'observedMinutes':0,'gaps':0,'restarts':0,'metricFailures':0,
                     'coverage':None,'categories':None,'home':None}
                stats=db.execute('SELECT sum(CASE WHEN metrics_ok=1 THEN requests END),sum(CASE WHEN metrics_ok=1 THEN client_errors END),sum(CASE WHEN metrics_ok=1 THEN server_errors END),count(*),sum(gap),sum(restart),sum(1-metrics_ok) FROM minutes WHERE at>=? AND at<=?',(lo,hi)).fetchone()
                if stats[3]:
                    for key,value in zip(('requests','clientErrors','serverErrors','observedMinutes','gaps','restarts','metricFailures'),stats):h[key]=value
                c=db.execute('SELECT count(*),coalesce(sum(1-ok),0),coalesce(sum(gap),0),coalesce(sum(invalid),0) FROM coverage_minutes WHERE at>=? AND at<=?',(lo,hi)).fetchone()
                if c[0]:h['coverage']=dict(zip(('observedMinutes','failures','gaps','invalidRecords'),c))
                rows=db.execute('SELECT category,method,status,navigation,sum(requests) FROM traffic_minutes WHERE at>=? AND at<=? GROUP BY category,method,status,navigation',(lo,hi)).fetchall()
                if (started is not None and c[0]>c[1] and at+3600>started) or rows:
                    h['categories']=dict.fromkeys(CATEGORIES,0)
                    h['home']={'ok':0,'notModified':0,'other':0,'navigation':0}
                    for category,method,status,nav,n in rows:
                        h['categories'][category]+=n
                        if category=='home' and method=='GET':
                            h['home']['ok' if status==200 else 'notModified' if status==304 else 'other']+=n
                            if nav and status in (200,304):h['home']['navigation']+=n
                period['boundaryHours'].append(h)
        result['hours']=[hours[at] for at in sorted(hours)]
        result['businessSnapshots']=[{'at':at,'sampledAt':sampled,**json.loads(raw)} for at,sampled,raw in db.execute('SELECT * FROM business_hours WHERE at>=? AND at<=? ORDER BY at',(now-RETENTION,now))]
    return result
