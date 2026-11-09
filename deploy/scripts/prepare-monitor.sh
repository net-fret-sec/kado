#!/usr/bin/env bash
# Run on the host before installing/restarting the v2 collector. Does not deploy Kado.
set -euo pipefail
monitor_dir="${KADO_MONITOR_DIR:-/var/lib/kado-monitor}"
backup_dir="${KADO_MONITOR_BACKUP_DIR:-/var/backups/kado-monitor}"
umask 077
install -d -m 700 "$monitor_dir" "$monitor_dir/access" "$backup_dir"
python3 - "$monitor_dir" "$backup_dir" <<'PY'
from datetime import datetime, timezone
from pathlib import Path
import sqlite3
import sys
import time
source=Path(sys.argv[1])/'monitor.sqlite3'
directory=Path(sys.argv[2])
if source.is_file():
    target=directory/('monitor-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%f')+'.sqlite3')
    with sqlite3.connect(source.resolve().as_uri()+'?mode=ro',uri=True) as origin, sqlite3.connect(target) as copy:
        origin.backup(copy)
        if copy.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise RuntimeError('Invalid monitoring backup')
    target.chmod(0o600)
    print('Monitoring snapshot verified: '+str(target))
for path in directory.glob('monitor-*.sqlite3'):
    if path.stat().st_mtime < time.time()-7*86400:
        path.unlink()
PY
