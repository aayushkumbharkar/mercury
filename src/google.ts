import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Action, Entity, Store } from './domain.ts';
import { validDate, shift } from './engine.ts';
import { accessToken } from './auth.ts';

export interface Sandbox {calendarId:string;eventId:string;sheetId:string;docId:string}
const enc=encodeURIComponent;
const digest=(x:unknown)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export async function google<T>(url:string,method='GET',body?:unknown,headers:Record<string,string>={}):Promise<T> {
  const token=await accessToken();
  const res=await fetch(url,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000),redirect:'error'});
  if(!res.ok) throw new Error(`Google ${method} returned HTTP ${res.status}${res.status===412?' (revision conflict)':''}.`);
  return await res.json() as T;
}
export async function loadSandbox():Promise<Sandbox> {
  const s=JSON.parse(await readFile('data/sandbox.json','utf8')) as Sandbox;
  if(![s.calendarId,s.eventId,s.sheetId,s.docId].every(x=>typeof x==='string'&&x.length>0)) throw new Error('Incomplete sandbox. Run npm run seed.');
  return s;
}
export function parseLinks(description:string,s:Sandbox):{sheetId:string;docId:string} {
  const matches=[...description.matchAll(/^MERCURY_LINKS (\{[^\n]+\})$/gm)];
  if(matches.length!==1) throw new Error('Launch must contain exactly one Mercury dependency link record.');
  const links=JSON.parse(matches[0][1]);
  if(links.sheetId!==s.sheetId||links.docId!==s.docId) throw new Error('Discovered links are outside the provisioned Mercury sandbox.');
  return {sheetId:links.sheetId,docId:links.docId};
}
export function parseRows(rows:unknown[][],sheetId:string):Entity[] {
  const header=['ID','Title','Due','Owner','Depends','Latest','Locked','Audience','OffsetDays'];
  if(!Array.isArray(rows)||JSON.stringify(rows[0])!==JSON.stringify(header)) throw new Error('Task register header does not match Mercury schema.');
  if(rows.length>50) throw new Error('Register exceeds 49-task scope.');
  const ids=new Set(['launch','brief']);
  return rows.slice(1).map((raw,i)=>{
    const row=raw.map(x=>String(x??'')); const [id,title,value,owner,depends,latest='',locked='',audience='',offset='']=row;
    if(!id||ids.has(id)||!/^[a-z][a-z0-9_-]{0,40}$/.test(id)||!title||!owner||!validDate(value)||!depends||!['true','false'].includes(locked)||!['internal','external'].includes(audience)) throw new Error(`Invalid task register row ${i+2}.`);
    if(!/^-?\d+$/.test(offset)||!Number.isInteger(Number(offset))||Number(offset)<-365||Number(offset)>0) throw new Error(`Invalid offset in row ${i+2}.`);
    ids.add(id);
    return {id,offsetDays:Number(offset),app:'Sheets',title,value,owner,dependsOn:depends.split(',').map(x=>x.trim()),latest:latest||undefined,locked:locked==='true',risk:audience==='external'?'APPROVAL':'AUTO',version:digest(raw),externalId:`${sheetId}!C${i+2}`,url:`https://docs.google.com/spreadsheets/d/${enc(sheetId)}/edit#range=C${i+2}`};
  });
}
export function parseBrief(text:string):{value:string;risk:'AUTO'|'APPROVAL';dateOffset:number} {
  const matches=[...text.matchAll(/^Launch date: (\d{4}-\d{2}-\d{2})$/gm)];
  if(matches.length!==1||!validDate(matches[0][1])) throw new Error('Brief requires exactly one unambiguous Launch date line.');
  const audience=[...text.matchAll(/^Audience: (.*)$/gm)];
  if(audience.length!==1||!['internal','external'].includes(audience[0][1])) throw new Error('Brief requires exactly one supported Audience declaration.');
  return {value:matches[0][1],risk:audience[0][1]==='internal'?'AUTO':'APPROVAL',dateOffset:matches[0].index!+13};
}
interface CalendarEvent {id:string;summary:string;description?:string;etag:string;htmlLink:string;start:{date?:string};end:{date?:string};attendees?:unknown[];recurrence?:unknown;status?:string;organizer?:{self?:boolean};extendedProperties?:{private?:Record<string,string>}}
export interface Doc {
  documentId:string;title:string;revisionId:string;
  tabs?:{tabProperties?:{tabId?:string};childTabs?:unknown[];documentTab?:{body?:{content?:{sectionBreak?:unknown;paragraph?:{elements?:{startIndex?:number;textRun?:{content?:string}}[]} }[]}}}[];
}
export function documentText(d:Doc):{text:string;tabId:string} {
  if(d.tabs?.length!==1||d.tabs[0].childTabs?.length||!d.tabs[0].tabProperties?.tabId) throw new Error('Only a single-tab sandbox brief is supported.');
  let text='';
  for(const block of d.tabs[0].documentTab?.body?.content??[]) {
    if(block.sectionBreak)continue;
    if(!block.paragraph)throw new Error('Brief contains unsupported non-paragraph content.');
    for(const e of block.paragraph.elements??[]){
      if(typeof e.textRun?.content!=='string'||e.startIndex!==text.length+1)throw new Error('Unsupported brief text structure.');
      text+=e.textRun.content;
    }
  }
  return {text,tabId:d.tabs[0].tabProperties.tabId};
}
export async function discover(s:Sandbox,request:typeof google=google):Promise<{nodes:Entity[];store:Store}> {
  const eventUrl=`https://www.googleapis.com/calendar/v3/calendars/${enc(s.calendarId)}/events/${enc(s.eventId)}`;
  async function calendar():Promise<Entity> {
    const e=await request<CalendarEvent>(eventUrl);
    if(e.id!==s.eventId||!e.etag||!e.start?.date||!e.end?.date||e.recurrence||e.status==='cancelled'||e.extendedProperties?.private?.mercury!=='sandbox'||!e.organizer?.self) throw new Error('Only an owned Mercury sandbox all-day launch event is supported.');
    if(e.end.date!==shift(e.start.date,1)) throw new Error('Only one-day launch events are supported.');
    parseLinks(e.description??'',s);
    return {id:'launch',app:'Calendar',title:e.summary,value:e.start.date,version:e.etag,externalId:e.id,url:e.htmlLink,dependsOn:[],owner:'Launch team',risk:e.attendees?.length?'APPROVAL':'AUTO'};
  }
  async function rows():Promise<Entity[]> {
    const r=await request<{values?:unknown[][]}>(`https://sheets.googleapis.com/v4/spreadsheets/${enc(s.sheetId)}/values/Tasks!A:I?valueRenderOption=UNFORMATTED_VALUE`);
    const parsed=parseRows(r.values??[],s.sheetId);
    if(taskIds.length && JSON.stringify(parsed.map(n=>n.id).sort())!==JSON.stringify([...taskIds].sort())) throw new Error('Task membership changed; rediscover the dependency graph.');
    return parsed;
  }
  let taskIds:string[]=[];
  async function readBrief() {
    if(taskIds.length) await rows();
    const d=await request<Doc>(`https://docs.googleapis.com/v1/documents/${enc(s.docId)}?includeTabsContent=true`);
    const {text,tabId}=documentText(d);
    if(d.documentId!==s.docId||!d.revisionId||!text.startsWith('MERCURY_SANDBOX\n')) throw new Error('Brief is outside supported sandbox scope.');
    const {value,risk,dateOffset}=parseBrief(text);
    const entity:Entity={id:'brief',app:'Docs',title:d.title,value,version:d.revisionId,externalId:d.documentId,url:`https://docs.google.com/document/d/${enc(d.documentId)}/edit`,dependsOn:[...taskIds],owner:'Launch team',risk};
    return {entity,dateIndex:dateOffset+1,tabId};
  }
  const brief=async()=>(await readBrief()).entity;
  const root=await calendar();const tasks=await rows();
  if(!tasks.length) throw new Error('No downstream tasks discovered.');
  taskIds=tasks.map(t=>t.id);const doc=await brief();
  const read=async(id:string):Promise<Entity>=>{
    if(id==='launch') return calendar(); if(id==='brief') return brief();
    const row=(await rows()).find(n=>n.id===id);if(!row) throw new Error(`Task ${id} disappeared.`);return row;
  };
  return {nodes:[root,...tasks,doc],store:{read,async mutate(a:Action,before:Entity) {
    if(a.id==='launch') {
      await request(eventUrl+`?sendUpdates=${a.risk==='APPROVAL'?'all':'none'}`,'PATCH',{start:{date:a.expected},end:{date:shift(a.expected,1)}},{'If-Match':before.version});
    } else if(a.id==='brief') {
      const current=await readBrief();
      if(current.entity.version!==before.version) throw new Error('Brief changed immediately before write.');
      await request(`https://docs.googleapis.com/v1/documents/${enc(s.docId)}:batchUpdate`,'POST',{writeControl:{requiredRevisionId:before.version},requests:[
        {deleteContentRange:{range:{tabId:current.tabId,startIndex:current.dateIndex,endIndex:current.dateIndex+10}}},
        {insertText:{location:{tabId:current.tabId,index:current.dateIndex},text:a.expected}}
      ]});
    } else {
      const current=await read(a.id);
      if(current.version!==before.version||current.externalId!==before.externalId) throw new Error('Sheet row changed immediately before write.');
      const cell=current.externalId.split('!')[1];
      await request(`https://sheets.googleapis.com/v4/spreadsheets/${enc(s.sheetId)}/values/${enc('Tasks!'+cell)}?valueInputOption=RAW`,'PUT',{range:'Tasks!'+cell,majorDimension:'ROWS',values:[[a.expected]]});
    }
  }}};
}
