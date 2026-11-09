// Isolated Caddy + real browsers: no requests to production and no production DB.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile, cp, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { once } from 'node:events'
import { createRequire } from 'node:module'
import { chromium } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { createMonitorServer } from '../../apps/monitor/server.mjs'
const root=path.resolve(import.meta.dirname,'../..')
const scratch=await mkdtemp(path.join(tmpdir(),'kado-monitor-browser-'))
const name='kado-monitor-test-'+process.pid
const image=process.env.KADO_CADDY_TEST_IMAGE??'caddy:2.11.7-alpine'
const run=(args,options={})=>{
  const result=spawnSync(args[0],args.slice(1),{cwd:root,encoding:'utf8',...options})
  if(result.status!==0)throw Error(`${args.slice(0,3).join(' ')}: ${result.stderr}`)
  return result.stdout.trim()
}
let browser,server,container=false
const notes=[]
try {
  const current=path.join(root,'apps/web/dist'),live=path.join(scratch,'web'),old=path.join(scratch,'old')
  await mkdir(live);await mkdir(old)
  const previous=process.env.KADO_PREVIOUS_WEB_IMAGE
  if(previous) {
    const id=run(['docker','create',previous])
    try {run(['docker','cp',`${id}:/srv/.`,old])} finally {run(['docker','rm',id])}
    notes.push('Migration depuis '+previous)
  } else {
    await cp(current,old,{recursive:true})
    // Original generateSW strategy, used in CI when no previous release image exists.
    const require=createRequire(await realpath(path.join(root,'apps/web/node_modules/vite-plugin-pwa/package.json')))
    const {generateSW}=require('workbox-build')
    await generateSW({globDirectory:old,swDest:path.join(old,'sw.js'),globPatterns:['**/*.{js,css,html}','assets/*.webp'],skipWaiting:true,clientsClaim:true,navigateFallback:'index.html',navigateFallbackDenylist:[/^\/api(?:\/|$)/,/^\/health(?:\/|$)/]})
  }
  await cp(old,live,{recursive:true})
  await mkdir(path.join(scratch,'access'))
  run(['docker','run','-d','--rm','--name',name,'-p','127.0.0.1::8080','-e','DOMAIN=http://127.0.0.1:8080','-e','ACME_EMAIL=test@example.com',
    '-v',`${live}:/srv:ro`,'-v',`${root}/deploy/Caddyfile:/etc/caddy/Caddyfile:ro`,
    '-v',`${root}/deploy/monitor.Caddyfile:/etc/caddy/monitor.Caddyfile:ro`,
    '-v',`${scratch}/access:/var/log/kado`,image])
  container=true
  const port=run(['docker','port',name,'8080/tcp']).split(':').at(-1)
  const base=`http://127.0.0.1:${port}`
  for(let i=0;i<50;i++){
    try {if((await fetch(base,{method:'HEAD'})).ok)break} catch{}
    await new Promise(r=>setTimeout(r,100))
  }
  const log=()=>run(['docker','exec',name,'cat','/var/log/kado/access.log']).split('\n').filter(Boolean).map(JSON.parse)
  const metrics=()=>JSON.parse(run(['python3','deploy/scripts/monitor.py','--parse-metrics'],{input:run(['docker','exec',name,'wget','-qO-','http://127.0.0.1:2019/metrics'])})).counts
  const before=metrics()
  const cases=[['/?secret=PRIVATE','home'],['/index.html','home'],['/exchanges/PRIVATE','organizer'],['/p/PRIVATE','participant'],['/assets/missing.js','files'],['/api/PRIVATE','api'],['/health/live','technical'],['/sw.js','technical'],['/.env?PRIVATE','other']]
  for(const [pathname,category] of cases){
    await fetch(base+pathname,{headers:{Cookie:'PRIVATE',Authorization:'Bearer PRIVATE',Referer:'https://private.example/PRIVATE','User-Agent':'PRIVATE','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document','DNT':'1','Sec-GPC':'1'}})
    assert.equal(log().at(-1).category,category)
  }
  const first=await fetch(base+'/');const etag=first.headers.get('etag');assert(etag)
  assert.equal(first.headers.get('cache-control'),'no-cache')
  assert.equal((await fetch(base+'/',{headers:{'If-None-Match':etag}})).status,304)
  const headBefore=log().length;await fetch(base+'/',{method:'HEAD'});assert.equal(log().length,headBefore)
  assert.equal(metrics().requests-before.requests,cases.length+2,'One Caddy count per completed request')
  for(const row of log())assert.deepEqual(Object.keys(row).sort(),['category','method','navigation','status','ts'])
  assert(!JSON.stringify(log()).includes('PRIVATE'))
  const runtime=spawnSync('docker',['logs',name],{encoding:'utf8'})
  assert(!(runtime.stdout+runtime.stderr).includes('PRIVATE'),'Runtime errors do not reintroduce private request fields')
  notes.push('Classification, filtrage avant écriture, HEAD exclus, 304, DNT/GPC et comparaison exacte Caddy : OK')
  browser=await chromium.launch({headless:true})
  const context=await browser.newContext()
  const page=await context.newPage()
  await page.goto(base);await page.evaluate(async()=>{await navigator.serviceWorker.ready})
  await page.reload();await page.waitForFunction(()=>!!navigator.serviceWorker.controller)
  let prior=log().filter(r=>r.category==='home'&&String(r.navigation)==='1').length
  await page.reload();await page.waitForTimeout(250)
  assert.equal(log().filter(r=>r.category==='home'&&String(r.navigation)==='1').length,prior,'Old SW serves cached home')
  await cp(current,live,{recursive:true})
  await page.evaluate(async()=>{const registration=await navigator.serviceWorker.ready;await registration.update()})
  await page.waitForTimeout(1500)
  await page.reload();await page.waitForLoadState('networkidle')
  prior=log().filter(r=>r.category==='home').length
  await page.goto(base+'/?return=1');await page.waitForLoadState('networkidle')
  assert.equal(log().filter(r=>r.category==='home').length,prior+1,'Warm home navigation goes to the server once')
  prior=log().filter(r=>r.category==='home').length
  await page.evaluate(()=>{history.pushState({},'', '/route-de-test');dispatchEvent(new PopStateEvent('popstate'))})
  await page.goBack();await page.waitForTimeout(200)
  assert.equal(log().filter(r=>r.category==='home').length,prior,'Internal history navigation does not invent a server request')
  let slowRequests=0
  await context.route('**/?slow=1',async route=>{slowRequests++;await new Promise(r=>setTimeout(r,4500));await route.continue().catch(()=>{})})
  const slowStart=Date.now()
  await page.goto(base+'/?slow=1');await page.locator('#home-view').waitFor()
  assert.equal(slowRequests,1)
  assert(Date.now()-slowStart<4200,'Precaching fallback returns within the network timeout')
  await page.waitForTimeout(1700);await context.unroute('**/?slow=1')
  await context.route('**/?failure=1',route=>route.fulfill({status:503,body:'Unavailable'}))
  await page.goto(base+'/?failure=1');await page.locator('#home-view').waitFor()
  await context.unroute('**/?failure=1')
  await context.setOffline(true);await page.reload();await page.locator('#app').waitFor();assert(await page.locator('#app').textContent())
  await context.setOffline(false)
  notes.push('Ancien SW, mise à jour, retour avec cache, rechargement et secours hors ligne : OK')
  // A clean first visit, then offline, verifies the precached-shell fallback too.
  const fresh=await browser.newContext({extraHTTPHeaders:{DNT:'1','Sec-GPC':'1'}})
  const freshPage=await fresh.newPage();await freshPage.goto(base);await freshPage.evaluate(async()=>navigator.serviceWorker.ready)
  await fresh.setOffline(true);await freshPage.reload();assert(await freshPage.locator('#app').textContent());await fresh.close()
  const now=Math.floor(Date.now()/1000),start=Math.floor((now-86400)/3600)*3600
  const hours=Array.from({length:25},(_,i)=>({at:start+i*3600,requests:i*3,clientErrors:0,serverErrors:0,observedMinutes:60,gaps:0,restarts:0,metricFailures:0,
    coverage:{observedMinutes:60,failures:i===8?1:0,gaps:i===8?1:0,invalidRecords:0},categories:{home:i%5,api:i*2,files:i},home:{ok:i%4,notModified:i%2,other:0,navigation:i%4}}))
  const periods=Object.fromEntries(['last24Hours','last7Days','last30Days','last90Days'].map((key,i)=>[key,{from:now-[1,7,30,90][i]*86400,to:now,effectiveFrom:start,partial:i>0,requests:204,categories:{home:41,organizer:4,participant:13,api:87,files:45,technical:8,other:6},home:{ok:32,notModified:9,other:0,navigation:30},quality:{observedMinutes:1440,missingMinutes:0,gaps:1,invalidRecords:0,failures:1}}]))
  const fixture={schemaVersion:2,generatedAt:new Date().toISOString(),health:{web:true,api:true,database:true},services:{caddy:{running:true},api:{running:true},db:{running:true}},metricsAvailable:true,monitorTimerActive:true,
    exchanges:{total:7,active:7,activeDrawn:2},activeExchanges:{participants:24,suggestions:23},backup:{recent:true,timerActive:true,lastJobSucceeded:true,latestAt:now-20000},
    traffic:{periods,hours,businessSnapshots:[],collectionStartedAt:start,sampledAt:now,available:true,stale:false,comparison:{hours:22,difference:0}}}
  let failure=false
  server=createMonitorServer({ttl:0,readReport:async()=>{if(failure)throw Error('Connexion SSH indisponible — test');return fixture}})
  server.listen(0,'127.0.0.1');await once(server,'listening')
  const local=`http://127.0.0.1:${server.address().port}`
  const dashboardContext=await browser.newContext({viewport:{width:1440,height:1120}})
  const dashboard=await dashboardContext.newPage()
  const errors=[];dashboard.on('pageerror',e=>errors.push(e.message))
  await dashboard.goto(local);await dashboard.getByText('Demandes d’accueil reçues',{exact:true}).waitFor()
  await dashboard.evaluate(()=>{const note=document.createElement('p');note.textContent='Aperçu — données de test, sans lien avec le trafic réel.';note.className='notice';document.querySelector('main').prepend(note)})
  await dashboard.screenshot({path:path.join(scratch,'dashboard-desktop.png'),fullPage:true})
  const axe=await new AxeBuilder({page:dashboard}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()
  assert.deepEqual(axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[])
  await dashboard.keyboard.press('Tab');assert(await dashboard.evaluate(()=>document.activeElement.tagName==='A'))
  await dashboard.getByRole('button',{name:'30 jours',exact:true}).click()
  const download=dashboard.waitForEvent('download');await dashboard.getByRole('button',{name:/Exporter CSV/}).click();assert.match((await download).suggestedFilename(),/30j/)
  await dashboard.getByText('Consulter les données horaires',{exact:true}).click();await dashboard.getByRole('button',{name:'Plus ancien'}).click()
  failure=true;await dashboard.getByRole('button',{name:'Actualiser',exact:true}).click();await dashboard.getByText('Dernier bilan connu — données périmées',{exact:true}).waitFor()
  assert(await dashboard.getByText('Demandes d’accueil reçues',{exact:true}).isVisible())
  await dashboard.setViewportSize({width:390,height:844});await dashboard.screenshot({path:path.join(scratch,'dashboard-mobile.png'),fullPage:true})
  assert(await dashboard.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
  assert.deepEqual(errors,[])
  notes.push('Vue locale : graphiques, CSV, clavier, WCAG AA, mobile, erreurs SSH : OK (données de test)')
  console.log(notes.join('\n'));console.log('Captures de test : '+scratch)
} finally {
  await browser?.close()
  if(server)await new Promise(r=>server.close(r))
  if(container)run(['docker','rm','-f',name])
  // Screenshots and test evidence are retained; no production data is present.
}
