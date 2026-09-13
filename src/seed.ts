import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { google, discover, documentText, parseRows } from './google.ts';
import type { Sandbox, Doc } from './google.ts';

const briefText='MERCURY_SANDBOX\nPRODUCT LAUNCH / OPERATIONS BRIEF\n\nLaunch date: 2026-09-18\nAudience: internal\n\nOwners: Maya (QA), Sam (release), Alex (enablement).\nThis date is updated only after task prerequisites are independently verified.\nMercury verifies recorded state, not whether every owner has read this brief.\n';
const initialRows=[['ID','Title','Due','Owner','Depends','Latest','Locked','Audience','OffsetDays'],['qa','Release quality gate','2026-09-16','Maya','launch','','false','internal',-2],['release','Release approval','2026-09-17','Sam','qa','','false','internal',-1],['enablement','Owner enablement','2026-09-18','Alex','release','','false','internal',0]];
export async function seed(request:typeof google=google,dataDir='data'):Promise<Sandbox> {
  await mkdir(dataDir,{recursive:true});
  let s:Partial<Sandbox>&{docInitialized?:boolean;sheetInitialized?:boolean}={calendarId:'primary'};
  const path=join(dataDir,'sandbox.json');
  try {s=JSON.parse(await readFile(path,'utf8'));} catch(e) {if((e as NodeJS.ErrnoException).code!=='ENOENT') throw e;}
  const save=async()=>{await writeFile(path+'.tmp',JSON.stringify(s,null,2));await rename(path+'.tmp',path);};
  if(!s.docId) {
    const d=await request<{documentId:string}>('https://docs.googleapis.com/v1/documents','POST',{title:'Mercury · Product launch brief'});
    if(!d.documentId) throw new Error('Docs creation returned no ID.');s.docId=d.documentId;await save();
  }
  if(!s.docInitialized){
    const d=await request<Doc>(`https://docs.googleapis.com/v1/documents/${s.docId}?includeTabsContent=true`);
    const {text,tabId}=documentText(d);
    if(!text.trim()){
      await request(`https://docs.googleapis.com/v1/documents/${s.docId}:batchUpdate`,'POST',{writeControl:{requiredRevisionId:d.revisionId},requests:[{insertText:{location:{tabId,index:1},text:briefText}}]});
    }else if(text!==briefText&&text!==briefText+'\n')throw new Error('Uninitialized brief contains unexpected text. Inspect it before retrying setup.');
    const check=documentText(await request<Doc>(`https://docs.googleapis.com/v1/documents/${s.docId}?includeTabsContent=true`)).text;
    if(check!==briefText&&check!==briefText+'\n')throw new Error('Brief initialization did not verify.');
    s.docInitialized=true;await save();
  }
  if(!s.sheetId) {
    const sh=await request<{spreadsheetId:string}>('https://sheets.googleapis.com/v4/spreadsheets','POST',{properties:{title:'Mercury · Launch dependency register'},sheets:[{properties:{title:'Tasks',gridProperties:{frozenRowCount:1}}}]});
    if(!sh.spreadsheetId) throw new Error('Sheets creation returned no ID.');s.sheetId=sh.spreadsheetId;await save();
  }
  if(!s.sheetInitialized){
    const url=`https://sheets.googleapis.com/v4/spreadsheets/${s.sheetId}/values/Tasks!A:I`;
    const existing=await request<{values?:unknown[][]}>(url);
    if(!existing.values?.length)await request(url.replace('Tasks!A:I','Tasks!A1:I4')+'?valueInputOption=RAW','PUT',{range:'Tasks!A1:I4',values:initialRows});
    else parseRows(existing.values,s.sheetId);
    const check=await request<{values?:unknown[][]}>(url+'?valueRenderOption=UNFORMATTED_VALUE');
    parseRows(check.values??[],s.sheetId);s.sheetInitialized=true;await save();
  }
  if(!s.eventId) {
    const e=await request<{id:string}>('https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=none','POST',{summary:'Mercury · Product launch',description:`Dedicated Mercury hackathon sandbox.\nMERCURY_LINKS ${JSON.stringify({sheetId:s.sheetId,docId:s.docId})}\nTask register: https://docs.google.com/spreadsheets/d/${s.sheetId}/edit\nBrief: https://docs.google.com/document/d/${s.docId}/edit`,start:{date:'2026-09-18'},end:{date:'2026-09-19'},extendedProperties:{private:{mercury:'sandbox'}}});
    if(!e.id) throw new Error('Calendar creation returned no ID.');s.eventId=e.id;await save();
  }
  const sandbox=s as Sandbox;const discovery=await discover(sandbox,request);
  await writeFile(join(dataDir,'seed-evidence.json'),JSON.stringify({at:new Date().toISOString(),mode:'live',nodes:discovery.nodes},null,2));
  return sandbox;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {await seed();console.log('Sandbox created and independently read across Calendar, Sheets and Docs.');}catch(e){console.error(e instanceof Error?e.message:e);process.exitCode=1;}
}

