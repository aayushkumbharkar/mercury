import {createServer} from 'node:http';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {readFile,writeFile,mkdir,readdir,rename,access} from 'node:fs/promises';
import {join,resolve,extname,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import type {Plan,Receipt,Store} from './domain.ts';
import {plan,execute,message,now} from './engine.ts';
import {compile} from './intent.ts';
import {discover,loadSandbox} from './google.ts';
import {startAuth} from './auth.ts';
import {seed} from './seed.ts';
import {rehearsal,injectLiveStaleWrite,faults} from './rehearsal.ts';
import type {Fault} from './rehearsal.ts';

export async function createMercuryServer(dataDir='data') {
  const plans=new Map<string,{plan:Plan;store:Store;mode:'live'|'rehearsal';fault:Fault}>();
  const runs=new Map<string,Receipt>();const started=new Set<string>();let busy=false;let authError='';let authRunning=false;
  const receiptsDir=join(dataDir,'receipts');await mkdir(receiptsDir,{recursive:true});
  async function save(r:Receipt){
    runs.set(r.planId,r);const path=join(receiptsDir,r.id+'.json');await writeFile(path+'.tmp',JSON.stringify(r,null,2));await rename(path+'.tmp',path);
    // Recording-only pacing: expose an actual failed verification before the bounded repair.
    const pause=Math.min(6000,Math.max(0,Number(process.env.MERCURY_DEMO_PAUSE_MS)||0));
    if(pause&&r.status==='RUNNING'&&r.results.some(x=>x.verdict==='FAILED'&&x.attempts.length===1&&x.reason.startsWith('Recovering:')))await new Promise(resolve=>setTimeout(resolve,pause));
  }
  for(const file of await readdir(receiptsDir)) {
    if(!file.endsWith('.json'))continue;
    const r=JSON.parse(await readFile(join(receiptsDir,file),'utf8')) as Receipt;
    if(r.status==='RUNNING'){r.status='INTERRUPTED';r.verdict='INCONCLUSIVE';r.blockers.push('Execution interrupted. Inspect external state and create a new preview; this run will not replay.');await save(r);}
    runs.set(r.planId,r);started.add(r.planId);
  }
  const json=(res:ServerResponse,status:number,value:unknown)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  async function body(req:IncomingMessage):Promise<Record<string,unknown>>{
    let value='';for await(const chunk of req){value+=chunk;if(value.length>8192)throw new Error('Request exceeds 8 KB.');}
    const parsed=JSON.parse(value||'{}');if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('JSON object required.');return parsed;
  }
  const exists=async(path:string)=>{try{await access(path);return true;}catch{return false;}};
  return createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
    const port=req.socket.localPort;const hosts=[`127.0.0.1:${port}`,`localhost:${port}`];
    if(!hosts.includes(req.headers.host??'')){json(res,403,{error:'Loopback host required.'});return;}
    const url=new URL(req.url??'/',`http://${req.headers.host}`);
    try {
      if(req.method==='POST'){
        if(req.headers['x-mercury-client']!=='1'||!req.headers['content-type']?.startsWith('application/json')||(req.headers.origin&&!hosts.map(h=>'http://'+h).includes(req.headers.origin))){json(res,403,{error:'Same-origin Mercury request required.'});return;}
      }
      if(req.method==='GET'&&url.pathname==='/api/status'){
        json(res,200,{clientReady:await exists(process.env.GOOGLE_CLIENT_PATH??'secrets/google-client.json'),connected:await exists('secrets/google-tokens.json'),seeded:await exists('data/seed-evidence.json'),busy,authError,modelConfigured:Boolean(process.env.OPENAI_API_KEY),recent:[...runs.values()].slice(-5).reverse()});return;
      }
      if(req.method==='POST'&&url.pathname==='/api/auth'){
        if(authRunning)throw new Error('Sign-in already in progress. Complete it in your browser.');
        const auth=await startAuth();authRunning=true;authError='';void auth.done.catch(e=>{authError=message(e);}).finally(()=>{authRunning=false;});json(res,200,{url:auth.url});return;
      }
      if(req.method==='POST'&&url.pathname==='/api/seed'){
        if(busy)throw new Error('Another operation is running.');busy=true;
        try{await seed();json(res,200,{verified:true});}finally{busy=false;}return;
      }
      if(req.method==='POST'&&url.pathname==='/api/plan'){
        const b=await body(req);if(b.mode!=='live'&&b.mode!=='rehearsal')throw new Error('Choose live or rehearsal mode.');
        if(typeof b.request!=='string'||typeof b.fault!=='string'||!faults.includes(b.fault as Fault))throw new Error('Invalid request or fault selection.');
        const fault=b.fault as Fault;
        if(b.mode==='live'&&!['none','stale'].includes(fault))throw new Error('Only the explicitly labeled stale-write fault is available live.');
        const intent=await compile(b.request);
        const d=b.mode==='live'?await discover(await loadSandbox()):rehearsal(fault);
        const p=plan(d.nodes,intent.targetDate);
        if(intent.sourceDate&&d.nodes.find(x=>x.id==='launch')?.value!==intent.sourceDate)p.blockers.push('Requested original launch date does not match external state.');
        if(plans.size>=50)throw new Error('Preview limit reached. Restart Mercury to clear unused previews.');
        plans.set(p.id,{plan:p,store:b.mode==='live'&&fault==='stale'?injectLiveStaleWrite(d.store):d.store,mode:b.mode,fault});
        json(res,200,{plan:p,intent,mode:b.mode,fault});return;
      }
      if(req.method==='POST'&&url.pathname==='/api/execute'){
        const b=await body(req);if(typeof b.planId!=='string')throw new Error('Plan ID required.');
        if(started.has(b.planId)){json(res,200,{planId:b.planId});return;}
        const entry=plans.get(b.planId);if(!entry)throw new Error('Preview not found. Create a new preview.');
        if(busy)throw new Error('Another execution is running.');
        if(Date.now()-Date.parse(entry.plan.createdAt)>600000)throw new Error('Preview expired. Discover external state again.');
        if(entry.plan.actions.some(a=>a.risk==='APPROVAL')&&b.approved!==true)throw new Error('Explicit approval required before executing this preview.');
        started.add(b.planId);busy=true;
        void execute(entry.plan,entry.store,{approved:b.approved===true,mode:entry.mode,fault:entry.fault,onChange:save})
          .catch(async(e)=>{const r=runs.get(entry.plan.id);if(r){r.status='INTERRUPTED';r.verdict='INCONCLUSIVE';r.blockers.push(`Execution halted: ${message(e)}`);r.finishedAt=now();try{await save(r);}catch{runs.set(r.planId,r);}}})
          .finally(()=>{busy=false;});
        json(res,202,{planId:b.planId});return;
      }
      if(req.method==='GET'&&url.pathname.startsWith('/api/run/')){
        const r=runs.get(url.pathname.slice('/api/run/'.length));json(res,r?200:404,r??{error:'Run not available.'});return;
      }
      if(url.pathname.startsWith('/api/')){json(res,404,{error:'Route not found.'});return;}
      if(req.method!=='GET'){json(res,405,{error:'Method not allowed.'});return;}
      const relative=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));
      const root=resolve('dist');const path=resolve(root,relative);
      if(!path.startsWith(root+sep)){json(res,403,{error:'Invalid path.'});return;}
      const bytes=await readFile(path);
      const types:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'};
      res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
      res.writeHead(200,{'Content-Type':types[extname(path)]??'application/octet-stream'});res.end(bytes);
    }catch(e){json(res,400,{error:message(e),verdict:'INCONCLUSIVE'});}
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const server=await createMercuryServer();server.listen(Number(process.env.PORT??4317),'127.0.0.1',()=>console.log(`Mercury: http://127.0.0.1:${process.env.PORT??4317}`));
}
