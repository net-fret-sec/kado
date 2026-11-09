import importlib.util
import json
from pathlib import Path
import tempfile
import sys
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).parent))
import unittest

spec=importlib.util.spec_from_file_location('monitor',Path(__file__).with_name('monitor.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class Monitoring(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.db=m.connect(Path(self.tmp.name))
        self.now=2000000040
        self.checks={'web':True,'api':True,'database':True}
    def tearDown(self):
        self.db.close();self.tmp.cleanup()
    def source(self,n=1,start=100,client=0,server=0):
        return {'sourceStartedAt':start,'counts':{'requests':n,'clientErrors':client,'serverErrors':server}}
    def record(self,offset,n=1,**kw):
        m.record(self.db,self.now+offset,self.source(n,**kw),self.checks)
    def test_parser_counts_one_handler_and_discards_personal_labels(self):
        metrics='''process_start_time_seconds 100
caddy_http_requests_total{handler="subroute",server="srv0"} 6
caddy_http_request_duration_seconds_count{handler="file_server",code="200"} 1000
caddy_http_request_duration_seconds_count{handler="subroute",code="200",method="HEAD"} 2000
caddy_http_request_duration_seconds_count{handler="subroute",code="200",uri="/p/secret",ip="192.0.2.42"} 3
caddy_http_request_duration_seconds_count{handler="subroute",code="404"} 2
caddy_http_request_duration_seconds_count{handler="subroute",code="502"} 1
'''
        got=m.parse_metrics(metrics)
        self.assertEqual(got,self.source(6,client=2,server=1))
        m.record(self.db,self.now,got,self.checks)
        self.assertNotIn('secret',str(list(self.db.iterdump())))
        self.assertNotIn('192.0.2.42',str(list(self.db.iterdump())))
    def test_missing_or_invalid_metrics_not_a_zero(self):
        for raw in ['', 'process_start_time_seconds 100', 'process_start_time_seconds nan\ncaddy_http_requests_total{handler="subroute"} 0']:
            with self.assertRaises(ValueError):m.parse_metrics(raw)
    def test_initial_reference_then_increments_and_manual_reports(self):
        self.record(0,100)
        self.record(10,103)
        self.record(60,108,client=2,server=1)
        h=m.history(self.db,self.now+60)['last24Hours']
        self.assertEqual((h['requests'],h['clientErrors'],h['serverErrors']),(8,2,1))
        self.assertEqual(h['observedMinutes'],2)
    def test_restart_keeps_new_counts_and_marks_uncertainty(self):
        self.record(0,100)
        self.record(60,3,start=101)
        h=m.history(self.db,self.now+60)['last24Hours']
        self.assertEqual((h['requests'],h['restarts']),(3,1))
    def test_long_gap_does_not_attribute_old_traffic_to_now(self):
        self.record(0,100)
        self.record(600,300)
        h=m.history(self.db,self.now+600)['last24Hours']
        self.assertEqual((h['requests'],h['gaps'],h['missingMinutes']),(0,1,9))
    def test_failed_scrape_retains_reference_and_health_failure(self):
        self.record(0,100)
        m.record(self.db,self.now+60,None,{'web':True,'api':False,'database':False})
        self.record(120,105)
        h=m.history(self.db,self.now+120)['last24Hours']
        self.assertEqual((h['requests'],h['apiFailures'],h['databaseFailures'],h['metricFailures']),(5,1,1,1))
    def test_counter_drop_without_process_restart_is_a_gap(self):
        self.record(0,100)
        self.record(60,1)
        h=m.history(self.db,self.now+60)['last24Hours']
        self.assertEqual((h['requests'],h['gaps']),(0,1))
    def test_out_of_order_scrape_is_ignored(self):
        self.record(60,100)
        self.record(0,50)
        self.record(120,105)
        self.assertEqual(m.history(self.db,self.now+120)['last24Hours']['requests'],5)
    def test_retention_even_when_server_is_down(self):
        self.record(0,100)
        self.record(60,105)
        m.record(self.db,self.now+8*86400,None,dict.fromkeys(self.checks,False))
        self.assertEqual(self.db.execute('SELECT count(*) FROM minutes').fetchone()[0],1)
        self.assertIsNone(self.db.execute("SELECT value FROM meta WHERE key='baseline'").fetchone())
        self.assertEqual(m.history(self.db,self.now+8*86400)['last7Days']['requests'],0)
        self.assertEqual(self.db.execute('PRAGMA secure_delete').fetchone()[0],1)
    def test_read_history_excludes_expired_data_without_collection(self):
        self.record(0,100);self.record(60,120)
        self.assertEqual(m.history(self.db,self.now+8*86400)['last7Days']['requests'],0)

if __name__=='__main__':unittest.main()
