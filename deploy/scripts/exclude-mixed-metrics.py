#!/usr/bin/env python3
"""Mark a known mixed-domain interval unreliable; preserve original counters/logs.

Stop the collector first and back up SQLite. The operation is idempotent.
"""
import argparse
from datetime import datetime
import fcntl
import json
from pathlib import Path
import sqlite3
import time
import activity


def exclude(db, start, end, once=False):
    if not (0 < start <= end):
        raise ValueError('Invalid interval')
    corrections = activity.get_meta(db, 'metricCorrections', [])
    if once and any(item['from'] == start and item.get('reason') == 'mixed-domain-counters' for item in corrections):
        return  # Re-migration after rollback must not invalidate subsequently valid measurements.
    # Include the boundary minutes: no invented partial-minute attribution.
    lower, upper = int(start // 60 * 60), int(end // 60 * 60)
    with db:
        db.execute('UPDATE minutes SET metrics_ok=0,gap=1 WHERE at>=? AND at<=?', (lower, upper))
        db.execute("DELETE FROM meta WHERE key='baseline'")
        corrections = activity.get_meta(db, 'metricCorrections', [])
        item = {'from': start, 'to': end, 'reason': 'mixed-domain-counters'}
        if item not in corrections:
            corrections.append(item)
        activity.set_meta(db, 'metricCorrections', corrections)
    activity.rollup(db, time.time())


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    parser.add_argument('--start', required=True)
    parser.add_argument('--end', required=True)
    parser.add_argument('--once', action='store_true', help='Do not extend an already recorded incident')
    args = parser.parse_args()
    start, end = (datetime.fromisoformat(v).timestamp() for v in (args.start, args.end))
    with (args.directory / 'collector.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        with sqlite3.connect(args.directory / 'monitor.sqlite3') as db:
            exclude(db, start, end, once=args.once)
    print(json.dumps({'excludedFrom': start, 'excludedTo': end}))
