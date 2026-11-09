#!/usr/bin/env python3
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).parent))
import activity as a
import monitor as m

class Activity(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.root=Path(self.tmp.name)
        self.logs=self.root/'access';self.logs.mkdir()
        self.file=self.logs/'access.log';self.file.touch()
        self.db=m.connect(self.root)
        self.now=2000001600  # whole UTC hour
        a.ingest(self.db,self.logs,self.now)
    def tearDown(self):
        self.db.close();self.tmp.cleanup()
    def line(self,offset=1,**kw):
        return json.dumps({'ts':self.now+offset,'category':'home','method':'GET','status':200,'navigation':'1',**kw})+'\n'
    def append(self,**kw):
        with self.file.open('a') as f:f.write(self.line(**kw))
    def count(self):
        return self.db.execute('SELECT coalesce(sum(requests),0) FROM traffic_hours').fetchone()[0]
    def collect(self,offset=60):
        a.ingest(self.db,self.logs,self.now+offset);a.rollup(self.db,self.now+offset)
    def test_rotation_duplicate_runs_and_late_append(self):
        self.append();self.collect();self.assertEqual(self.count(),1)
        self.collect(61);self.assertEqual(self.count(),1)
        self.file.rename(self.logs/'access-rotated.log')
        self.file.write_text(self.line(62,status=304))
        self.collect(120);self.assertEqual(self.count(),2)
        self.assertFalse((self.logs/'access-rotated.log').exists())
        self.collect(180);self.assertEqual(self.count(),2)
        self.assertEqual(a.get_meta(self.db,'available'),True)
    def test_transaction_rollback_does_not_skip_or_double(self):
        self.append()
        original=a.parse_line
        with patch.object(a,'parse_line',side_effect=RuntimeError('simulated crash')):
            with self.assertRaises(RuntimeError):self.collect()
        self.assertEqual(self.count(),0)
        with patch.object(a,'parse_line',original):self.collect()
        self.assertEqual(self.count(),1)
    def test_partial_line_waits_for_completion(self):
        line=self.line()
        self.file.write_text(line[:-2]);self.collect()
        self.assertEqual(self.count(),0)
        with self.file.open('a') as f:f.write(line[-2:])
        self.collect(120);self.assertEqual(self.count(),1)
    def test_truncation_and_missing_stream_mark_gap(self):
        self.append();self.collect()
        self.file.write_text(self.line(61,status=304));self.collect(120)
        self.assertEqual(self.count(),2)
        self.file.unlink();self.collect(180)
        self.assertFalse(a.get_meta(self.db,'available'))
        self.assertGreater(self.db.execute('SELECT sum(gap) FROM coverage_minutes').fetchone()[0],0)
    def test_unknown_keys_invalid_values_and_head_never_count(self):
        for kw in [{'path':'/p/secret'},{'category':'secret'},{'navigation':'yes'},{'method':'SECRET'},{'status':True},{'ts':float('nan')},{'method':'HEAD'}]:self.append(**kw)
        self.collect();self.assertEqual(self.count(),0)
        self.assertNotIn('secret',str(list(self.db.iterdump())))
        self.assertEqual(self.db.execute('SELECT sum(invalid) FROM coverage_minutes').fetchone()[0],6)
    def test_report_statuses_and_no_invented_old_history(self):
        for kw in [{},{'status':304},{'status':404},{'category':'files','navigation':'0'},{'method':'POST'}]:self.append(**kw)
        self.collect()
        r=a.report(self.db,self.now+60,True)
        p=r['periods']['last24Hours']
        self.assertEqual(p['home'],{'ok':1,'notModified':1,'other':1,'navigation':2})
        self.assertEqual(p['requests'],5)
        self.assertTrue(p['partial'])
        self.assertEqual(r['comparison']['difference'],None)
    def test_90_day_rollups_survive_detail_purge(self):
        self.append();self.collect()
        a.rollup(self.db,self.now+8*a.DAY)
        self.assertEqual(self.db.execute('SELECT count(*) FROM traffic_minutes').fetchone()[0],0)
        self.assertEqual(self.count(),1)
        a.rollup(self.db,self.now+91*a.DAY)
        self.assertEqual(self.count(),0)
    def test_missing_collection_never_has_complete_coverage(self):
        self.append();self.collect(600)
        p=a.report(self.db,self.now+600)['periods']['last24Hours']
        self.assertEqual(p['quality']['missingMinutes'],9)
        self.assertEqual(p['quality']['gaps'],1)
    def test_business_snapshots_and_failed_reads(self):
        b={'exchanges':{'total':7},'activeExchanges':{'participants':24,'suggestions':23}}
        a.rollup(self.db,self.now,b)
        a.rollup(self.db,self.now+3600,None)
        r=a.report(self.db,self.now+3600,True)
        self.assertEqual(len(r['businessSnapshots']),1)
        self.assertEqual(r['businessSnapshots'][0]['exchanges']['total'],7)
    def test_read_only_does_not_write_even_when_stale(self):
        checks={'web':True,'api':True,'database':True}
        m.record(self.db,self.now,{'sourceStartedAt':1,'counts':dict.fromkeys(m.FIELDS,0)},checks)
        base={'schemaVersion':2,'generatedAt':'2033-05-18T03:00:00+00:00','health':checks,
              'metricsAvailable':True,'exchanges':{},'activeExchanges':{},'services':{},'monitorTimerActive':True,
              'backup':{'recent':True,'timerActive':True,'lastJobSucceeded':True}}
        with self.db:a.set_meta(self.db,'report',base)
        dbfile=self.root/'monitor.sqlite3';before=dbfile.read_bytes();mtime=dbfile.stat().st_mtime_ns
        result=subprocess.run([sys.executable,str(Path(m.__file__)),'/nonexistent','/nonexistent','--read-only','--history','--format','json'],capture_output=True,text=True,env={**os.environ,'KADO_MONITOR_DIR':str(self.root)})
        self.assertIn(result.returncode,(0,1),result.stderr)
        self.assertEqual(json.loads(result.stdout)['schemaVersion'],2)
        self.assertEqual(dbfile.read_bytes(),before);self.assertEqual(dbfile.stat().st_mtime_ns,mtime)
    def test_graph_boundaries_equal_selected_window(self):
        # Put one request before the 24h window, one inside its first partial
        # hour, and one in the current hour. The excluded request stays excluded.
        self.append(offset=1)
        self.append(offset=1900,status=304)
        self.collect(2000)
        self.append(offset=86420)
        self.collect(86460)
        now=self.now+88200
        report=a.report(self.db,now,True)
        period=report['periods']['last24Hours']
        by_hour={h['at']:h for h in report['hours']}
        by_hour.update({h['at']:h for h in period['boundaryHours']})
        total=sum(h['home']['ok']+h['home']['notModified'] for at,h in by_hour.items()
                  if period['from']//3600*3600<=at<=now and h['home'])
        self.assertEqual(total,period['home']['ok']+period['home']['notModified'])
        self.assertEqual(total,2)
    def test_all_failed_readings_are_null_not_zero(self):
        self.file.unlink();self.collect(60)
        report=a.report(self.db,self.now+2*a.DAY,True)
        self.assertIsNone(report['periods']['last24Hours']['requests'])
        self.assertIsNone(report['periods']['last24Hours']['home'])
    def test_prepare_snapshot_is_valid_and_additive(self):
        before=(self.root/'monitor.sqlite3').read_bytes()
        result=subprocess.run(['bash',str(Path(__file__).with_name('prepare-monitor.sh'))],
          capture_output=True,text=True,env={**os.environ,'KADO_MONITOR_DIR':str(self.root),'KADO_MONITOR_BACKUP_DIR':str(self.root/'backup')})
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual((self.root/'monitor.sqlite3').read_bytes(),before)
        with sqlite3.connect(next((self.root/'backup').glob('*.sqlite3'))) as copy:
            self.assertEqual(copy.execute('PRAGMA integrity_check').fetchone()[0],'ok')
    def test_missing_subroute_is_unavailable(self):
        with self.assertRaises(ValueError):m.parse_metrics('process_start_time_seconds 100\ncaddy_http_requests_total{handler="file_server"} 2')

if __name__=='__main__':unittest.main()
