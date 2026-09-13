import type { Entity, Store } from './domain.ts';
export const faults=['none','stale','reject','conflict','unreadable','approval'] as const;
export type Fault=typeof faults[number];
export function rehearsal(fault:Fault='none'):{nodes:Entity[];store:Store} {
  const nodes:Entity[]=[
    {id:'launch',app:'Calendar',title:'Product launch',value:'2026-09-18',version:'1',externalId:'fixture-event',url:'',dependsOn:[],owner:'Launch team',risk:'AUTO'},
    {id:'qa',offsetDays:-2,app:'Sheets',title:'Release quality gate',value:'2026-09-16',version:'1',externalId:'fixture-sheet!C2',url:'',dependsOn:['launch'],owner:'Maya',risk:'AUTO'},
    {id:'release',offsetDays:-1,app:'Sheets',title:'Release approval',value:'2026-09-17',version:'1',externalId:'fixture-sheet!C3',url:'',dependsOn:['qa'],owner:'Sam',risk:'AUTO'},
    {id:'enablement',offsetDays:0,app:'Sheets',title:'Owner enablement',value:'2026-09-18',version:'1',externalId:'fixture-sheet!C4',url:'',dependsOn:['release'],owner:'Alex',risk:'AUTO'},
    {id:'brief',app:'Docs',title:'Launch brief',value:'2026-09-18',version:'1',externalId:'fixture-document',url:'',dependsOn:['qa','release','enablement'],owner:'Launch team',risk:fault==='approval'?'APPROVAL':'AUTO'}
  ];
  const state=new Map(nodes.map(n=>[n.id,structuredClone(n)]));let attempted=false;
  if(fault==='conflict') state.get('qa')!.value='2026-09-17';
  return {nodes,store:{async read(id){
    if(fault==='unreadable'&&id==='qa'&&attempted) throw new Error('Controlled fault: readback unavailable');
    const node=state.get(id);if(!node) throw new Error('Entity missing');return structuredClone(node);
  },async mutate(a,before){
    if(a.id==='qa') {
      const first=!attempted;attempted=true;
      if(fault==='reject') throw new Error('Controlled fault: mutation rejected');
      if(fault==='stale'&&first) return;
    }
    const current=state.get(a.id)!;
    if(current.version!==before.version) throw new Error('Concurrent edit');
    current.value=a.expected;current.version=String(Number(current.version)+1);
  }}};
}
export function injectLiveStaleWrite(store:Store):Store {
  let injected=false;
  return {read:id=>store.read(id),async mutate(a,before){
    if(!injected&&a.app==='Sheets'&&a.expected!==before.value){
      injected=true;
      // Controlled fault: a real API write deliberately retains the original date.
      await store.mutate({...a,expected:before.value},before);return;
    }
    await store.mutate(a,before);
  }};
}
