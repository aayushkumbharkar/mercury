import type {Receipt} from '../src/domain.ts';
export function recoveryProof(receipt:Receipt){
 if(receipt.status!=='FINISHED')return null;
 for(const result of receipt.results){
  if(!result.recovered||result.verdict!=='SUCCESS')continue;
  const action=receipt.actions.find(a=>a.id===result.id);if(!action)continue;
  const mismatch=result.observations.find(o=>o.phase==='readback'&&o.value&&o.value!==action.expected);
  const repair=result.observations.find(o=>o.phase==='recovery-readback'&&o.value===action.expected);
  const final=result.observations.at(-1);
  if(!mismatch?.value||!repair?.value||final?.phase!=='final-reconciliation'||final.value!==action.expected)continue;
  return {title:action.title,app:action.app,url:action.url,externalId:action.externalId,mode:receipt.mode,expected:action.expected,observed:mismatch.value,repaired:repair.value,acknowledged:result.attempts[0]?.acknowledged===true,verifiedAt:final.at,attempts:result.attempts.length};
 }
 return null;
}

export function failureProof(receipt:Receipt){
 if(receipt.status!=='RUNNING')return null;
 const row=receipt.results.find(r=>r.verdict==='FAILED');
 const action=receipt.actions.find(a=>a.id===row?.id);
 const observed=row?.observations.at(-1);
 if(!row||!action||!observed?.value||observed.value===action.expected)return null;
 return {title:action.title,expected:action.expected,observed:observed.value,acknowledged:row.attempts.at(-1)?.acknowledged===true};
}
