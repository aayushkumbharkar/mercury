import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {discover,google} from '../src/google.ts';
import {plan,execute} from '../src/engine.ts';
import {seed} from '../src/seed.ts';

function transport(empty=false){
 const rows:unknown[][]=empty?[]:[['ID','Title','Due','Owner','Depends','Latest','Locked','Audience','OffsetDays'],['qa','QA','2026-09-16','Maya','launch','','false','internal',-2]];
 let text=empty?'\n':'MERCURY_SANDBOX\nHistorical note: Launch date: 2026-09-18\nLaunch date: 2026-09-18\nAudience: internal\n';
 let revision=1;let rejectDoc=false;let docCreates=0;
 const event={id:'event',summary:'Launch',etag:'v1',htmlLink:'https://calendar.google.com/event',start:{date:'2026-09-18'},end:{date:'2026-09-19'},organizer:{self:true},extendedProperties:{private:{mercury:'sandbox'}},description:'MERCURY_LINKS {"sheetId":"sheet","docId":"doc"}'};
 const calls:{url:string;method:string;body:unknown;headers:unknown}[]=[];
 const request:typeof google=async<T>(url:string,method='GET',body?:unknown,headers?:Record<string,string>):Promise<T>=>{
  calls.push({url,method,body,headers});let result:unknown;
  if(url==='https://docs.googleapis.com/v1/documents'&&method==='POST'){docCreates++;result={documentId:'doc'};}
  else if(url.includes('docs.googleapis.com')&&method==='GET')result={documentId:'doc',title:'Brief',revisionId:String(revision),tabs:[{tabProperties:{tabId:'tab'},documentTab:{body:{content:[{paragraph:{elements:[{startIndex:1,textRun:{content:text}}]}}]}}}]};
  else if(url.includes('docs.googleapis.com')&&method==='POST'){
   if(rejectDoc){rejectDoc=false;throw new Error('Injected initial document write failure');}
   const b=body as {writeControl:{requiredRevisionId:string};requests:({deleteContentRange?:{range:{startIndex:number;endIndex:number;tabId:string}};insertText?:{location:{index:number;tabId:string};text:string}})[]};
   assert.equal(b.writeControl.requiredRevisionId,String(revision));
   for(const item of b.requests){if(item.deleteContentRange){const range=item.deleteContentRange.range;assert.equal(range.tabId,'tab');text=text.slice(0,range.startIndex-1)+text.slice(range.endIndex-1);}if(item.insertText){const x=item.insertText;assert.equal(x.location.tabId,'tab');text=text.slice(0,x.location.index-1)+x.text+text.slice(x.location.index-1);}}
   revision++;result={};
  }else if(url==='https://sheets.googleapis.com/v4/spreadsheets'&&method==='POST')result={spreadsheetId:'sheet'};
  else if(url.includes('sheets.googleapis.com')&&method==='GET')result={values:rows};
  else if(url.includes('sheets.googleapis.com')&&method==='PUT'){
   const b=body as {values:unknown[][];range:string};
   assert.equal(decodeURIComponent(url.split('/values/')[1].split('?')[0]),b.range,'Sheets URL and body must identify the same range');
   if(b.values.length>1)rows.splice(0,rows.length,...b.values);else{const index=Number(decodeURIComponent(url).match(/Tasks!C(\d+)/)?.[1])-1;rows[index][2]=b.values[0][0];}result={};
  }else if(url.includes('/events')&&method==='POST'){Object.assign(event,body);result={id:'event'};}
  else if(url.includes('/events/')&&method==='GET')result=event;
  else if(url.includes('/events/')&&method==='PATCH'){assert.equal(headers?.['If-Match'],event.etag);Object.assign(event,body);event.etag='v2';result={};}
  else throw new Error('Unexpected Google request: '+method+' '+url);
  return structuredClone(result) as T;
 };
 return {request,rows,calls,get text(){return text;},get docCreates(){return docCreates;},rejectNextDoc(){rejectDoc=true;}};
}
const sandbox={calendarId:'primary',eventId:'event',sheetId:'sheet',docId:'doc'};
test('three adapters emit guarded writes and independent reads; historical text survives',async()=>{
 const t=transport();const d=await discover(sandbox,t.request);const r=await execute(plan(d.nodes,'2026-09-22'),d.store);
 assert.equal(r.verdict,'SUCCESS');assert.equal(t.rows[1][2],'2026-09-20');
 assert.ok(t.text.includes('Historical note: Launch date: 2026-09-18'));
 assert.ok(t.text.includes('\nLaunch date: 2026-09-22\n'));
 for(const app of ['docs.googleapis.com','sheets.googleapis.com','/events/']){
  const write=t.calls.findIndex(c=>c.url.includes(app)&&c.method!=='GET');assert.ok(write>=0);
  assert.ok(t.calls.slice(write+1).some(c=>c.url.includes(app)&&c.method==='GET'));
 }
});
test('new register task invalidates frozen dependency membership',async()=>{
 const t=transport();const d=await discover(sandbox,t.request);
 t.rows.push(['new','New task','2026-09-18','Alex','qa','','false','internal',0]);
 await assert.rejects(d.store.read('qa'),/membership changed/);
});
test('full column discovery rejects populated tasks outside supported bounds',async()=>{
 const t=transport();while(t.rows.length<52)t.rows.push([]);
 t.rows[51]=['distant','Hidden task','2026-09-18','Alex','qa','','false','internal',0];
 await assert.rejects(discover(sandbox,t.request),/49-task/);
 assert.ok(t.calls.some(c=>c.url.includes('/values/Tasks!A:I?')));
});
test('initialization failure can resume without creating duplicate resources',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'mercury-seed-'));const t=transport(true);t.rejectNextDoc();
 try{
  await assert.rejects(seed(t.request,dir),/initial document write failure/);
  await seed(t.request,dir);assert.equal(t.docCreates,1);assert.equal(t.rows.length,4);
 }finally{await rm(dir,{recursive:true,force:true});}
});
