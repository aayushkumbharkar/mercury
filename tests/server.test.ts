import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMercuryServer } from '../src/server.ts';
test('HTTP refuses cross-origin writes and deduplicates executions',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'mercury-test-'));const server=await createMercuryServer(dir);
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=server.address();assert.ok(address&&typeof address==='object');const root=`http://127.0.0.1:${address.port}`;
 const post=(path:string,body:unknown,origin?:string)=>fetch(root+path,{method:'POST',headers:{'Content-Type':'application/json','X-Mercury-Client':'1',...(origin?{Origin:origin}:{})},body:JSON.stringify(body)});
 try{
  assert.equal((await post('/api/plan',{},'https://evil.example')).status,403);
  const response=await post('/api/plan',{request:'Move launch to 2026-09-22',mode:'rehearsal',fault:'stale'});
  const p=await response.json() as {plan:{id:string}};assert.ok(p.plan.id);
  assert.equal((await post('/api/execute',{planId:p.plan.id})).status,202);
  assert.equal((await post('/api/execute',{planId:p.plan.id})).status,200);
  let r:{status:string;verdict:string}={status:'RUNNING',verdict:''};
  for(let i=0;i<100&&r.status==='RUNNING';i++){await new Promise(r=>setTimeout(r,10));r=await(await fetch(root+'/api/run/'+p.plan.id)).json() as typeof r;}
  assert.equal(r.verdict,'SUCCESS');
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(dir,{recursive:true,force:true});}
});
