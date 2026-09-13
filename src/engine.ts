import { randomUUID } from 'node:crypto';
import type { Action, Entity, Plan, Receipt, Result, Store } from './domain.ts';
export const now = () => new Date().toISOString();
export function validDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s;
}
export function shift(date: string, days: number): string {
  return new Date(Date.parse(date) + days * 86400000).toISOString().slice(0,10);
}
export function compileExact(input: string): { targetDate: string; sourceDate?: string; method: string } | null {
  // A deliberately narrow grammar. Other prose goes through the optional intent compiler.
  const match = input.trim().match(/^move (?:our |the )?(?:product )?launch (?:from (\d{4}-\d{2}-\d{2}) )?to (\d{4}-\d{2}-\d{2})(?: and (?:make sure nobody is left with stale information|preserve dependencies))?[.!]?$/i);
  if (!match || !validDate(match[2]) || (match[1] && !validDate(match[1]))) return null;
  return { targetDate:match[2], ...(match[1] ? {sourceDate:match[1]} : {}), method:'Exact grammar' };
}
export function plan(nodes: Entity[], targetDate: string): Plan {
  const blockers: string[]=[]; const actions:Action[]=[];
  const result:Plan={id:randomUUID(),createdAt:now(),targetDate,actions,blockers};
  if (!validDate(targetDate)) { blockers.push('Target date is invalid.'); return result; }
  const root = nodes.find(n=>n.id==='launch');
  if (!root || !validDate(root.value)) { blockers.push('One dated launch root is required.'); return result; }
  if (new Set(nodes.map(n=>n.id)).size !== nodes.length) blockers.push('Duplicate entity IDs.');
  const byId = new Map(nodes.map(n=>[n.id,n])); const seen = new Set<string>(); const visiting = new Set<string>();

  function visit(n:Entity) {
    if (visiting.has(n.id)) { blockers.push(`Dependency cycle at ${n.id}.`); return; }
    if (seen.has(n.id)) return;
    visiting.add(n.id);
    for (const id of n.dependsOn) {
      const parent = byId.get(id);
      if (!parent) blockers.push(`Missing dependency ${id} for ${n.id}.`); else visit(parent);
    }
    visiting.delete(n.id); seen.add(n.id);
    if (!validDate(n.value)) { blockers.push(`Invalid observed date: ${n.id}.`); return; }
    if (n.id!=='launch' && !n.dependsOn.length) blockers.push(n.title+' is disconnected from the launch.');
    if (n.app==='Sheets' && (!Number.isInteger(n.offsetDays) || n.offsetDays! < -365 || n.offsetDays! > 0)) {blockers.push(n.title+' requires an explicit offset between -365 and 0 days.');return;}
    const expected = n.app==='Sheets'?shift(targetDate,n.offsetDays!):targetDate;
    if (n.latest && (!validDate(n.latest) || expected > n.latest)) blockers.push(`${n.title}: ${expected} violates fixed deadline ${n.latest}.`);
    if (n.locked && expected !== n.value) blockers.push(`${n.title} is locked.`);
    if (n.risk === 'BLOCKED') blockers.push(`${n.title} has unsupported or unsafe scope.`);
    // launch edges propagate dates; task-to-task edges enforce prerequisite deadlines.
    for (const id of n.dependsOn) {
      const parent = byId.get(id);
      if (parent && id !== 'launch' && (parent.offsetDays??0) > (n.offsetDays??0)) blockers.push(`${n.title} precedes prerequisite ${parent.title}.`);
    }
    actions.push({...n,expected,reason:n.id==='launch'?'Requested launch date':n.app==='Docs'?'Converge brief to launch date after all tasks verify':`Preserve declared ${n.offsetDays} day offset; verify prerequisites first`});
  }
  for (const n of nodes) visit(n);
  return result;
}
export async function execute(p: Plan, store: Store, options: {
  approved?: boolean; mode?: 'live' | 'rehearsal'; fault?: string;
  onChange?: (r:Receipt)=>Promise<void>;
} = {}): Promise<Receipt> {
  const r:Receipt={id:randomUUID(),planId:p.id,mode:options.mode??'rehearsal',startedAt:now(),verdict:'INCONCLUSIVE',status:'RUNNING',results:[],blockers:[...p.blockers],actions:p.actions,fault:options.fault??'none'};
  const emit=async()=>{await options.onChange?.(structuredClone(r));};
  const finish=async()=>{r.status='FINISHED';r.finishedAt=now();await emit();return r;};
  if (r.blockers.length) { r.verdict='FAILED';return finish(); }
  if (!p.actions.length) {r.blockers.push('No postconditions to verify.');return finish();}
  if (p.actions.some(a=>a.risk==='APPROVAL') && !options.approved) {r.blockers.push('Explicit approval required for external-facing changes.');return finish();}
  const results = new Map<string,Result>();
  for (const a of p.actions) {
    const row:Result={id:a.id,verdict:'INCONCLUSIVE',reason:'Not attempted',recovered:false,attempts:[],observations:[]};
    r.results.push(row);results.set(a.id,row);
  }
  async function observe(a:Action, phase:string):Promise<Entity|null> {
    const row=results.get(a.id)!;
    try {
      const n=await store.read(a.id);
      if (!n || n.id!==a.id || !validDate(n.value) || !n.version) throw new Error('Malformed external observation');
      const invariant=(x:Entity)=>JSON.stringify([x.id,x.app,x.externalId,x.dependsOn,x.owner,x.risk,x.latest,x.locked,x.offsetDays]);
      if(invariant(n)!==invariant(a)) throw new Error('Dependency scope or protected metadata changed; create a new preview.');
      row.observations.push({at:now(),phase,value:n.value,version:n.version}); await emit(); return n;
    } catch (e) {row.observations.push({at:now(),phase,error:message(e)});row.verdict='INCONCLUSIVE';row.reason='External state cannot be read.';await emit();return null;}
  }
  await emit();
  // Fail the whole preflight before any write when a preview assumption has broken.
  for (const a of p.actions) {
    const n=await observe(a,'preflight');
    if (!n) return finish();
    if (n.value!==a.value || n.version!==a.version) {
      const row=results.get(a.id)!;row.verdict='FAILED';row.reason='Conflict: external state changed since preview.';r.verdict='FAILED';return finish();
    }
  }
  for (const a of p.actions) {
    const row=results.get(a.id)!;
    if (a.dependsOn.some(id=>results.get(id)?.verdict!=='SUCCESS')) {row.reason='Withheld: a prerequisite is not verified.';await emit();continue;}
    const ancestors=new Set<string>();
    const collect=(id:string)=>{for(const parent of p.actions.find(x=>x.id===id)?.dependsOn??[]){if(!ancestors.has(parent)){ancestors.add(parent);collect(parent);}}};
    collect(a.id);let dependencyFailed=false;
    for(const id of ancestors){
      const parent=p.actions.find(x=>x.id===id)!;
      const current=await observe(parent,'dependency-recheck');
      if(!current || current.value!==parent.expected){
        const result=results.get(id)!;if(current){result.verdict='FAILED';result.reason='Prerequisite drift before dependent mutation.';}
        dependencyFailed=true;break;
      }
    }
    if(dependencyFailed){row.reason='Withheld: prerequisite drift or missing evidence.';await emit();continue;}
    let before=await observe(a,'before-write');
    if (!before) continue;
    if (before.value!==a.value || before.version!==a.version) {row.verdict='FAILED';row.reason='Conflict before mutation; replanning required.';await emit();continue;}
    if (before.value===a.expected) {row.verdict='SUCCESS';row.reason='Already at desired state; independently observed.';continue;}
    for (let attempt=0;attempt<2;attempt++) {
      row.reason=attempt?'Recovering: observed original state; one safe retry.':'Applying desired state';await emit();
      // Journal the intention before the external side effect.
      const entry={at:now(),acknowledged:false,error:undefined as string|undefined};row.attempts.push(entry);await emit();
      try {await store.mutate(a,before);entry.acknowledged=true;} catch(e) {entry.error=message(e);}
      await emit();
      const observed=await observe(a,attempt?'recovery-readback':'readback');
      if (!observed) break;
      if (observed.value===a.expected) {row.verdict='SUCCESS';row.recovered=attempt>0;row.reason=attempt?'Recovery verified by independent read.':'Desired state verified by independent read.';break;}
      row.verdict='FAILED';row.reason='Postcondition mismatch: desired state not observed.';
      if (observed.value!==a.value || observed.version!==before.version) {row.reason='Conflict: unexpected external state; no safe retry.';break;}
      before=observed;
    }
    await emit();
  }
  // Point-in-time final evidence catches changes made after the first readback.
  for (const a of p.actions) {
    const row=results.get(a.id)!;
    if (row.verdict!=='SUCCESS') continue;
    const n=await observe(a,'final-reconciliation');
    if (n && n.value!==a.expected) {row.verdict='FAILED';row.reason='Drift detected during final reconciliation.';}
  }
  r.verdict=r.results.some(x=>x.verdict==='FAILED')?'FAILED':r.results.every(x=>x.verdict==='SUCCESS')?'SUCCESS':'INCONCLUSIVE';
  return finish();
}
export function message(e:unknown):string {return e instanceof Error?e.message:'Unknown error';}
