import type { Entity, Store } from '../src/domain.ts';
export function fixture(): Entity[] {
  return [
    { id:'launch', app:'Calendar', title:'Product launch', value:'2026-09-18', version:'1', dependsOn:[], owner:'Launch team', risk:'AUTO', url:'', externalId:'event' },
    { id:'qa', offsetDays:-2, app:'Sheets', title:'Release QA', value:'2026-09-16', version:'1', dependsOn:['launch'], owner:'Maya', risk:'AUTO', url:'', externalId:'row2' },
    { id:'release', offsetDays:0, app:'Sheets', title:'Release approval', value:'2026-09-18', version:'1', dependsOn:['qa'], owner:'Sam', risk:'AUTO', url:'', externalId:'row3' },
    { id:'brief', app:'Docs', title:'Launch brief', value:'2026-09-18', version:'1', dependsOn:['release'], owner:'Launch team', risk:'AUTO', url:'', externalId:'doc' },
  ];
}
export function memoryStore(fault = ''): Store & { state: Map<string,Entity>; writes:string[] } {
  const state = new Map(fixture().map(n => [n.id, structuredClone(n)])); const writes:string[]=[];
  return { state, writes,
    async read(id) {
      if (fault === 'unreadable' && id === 'qa' && writes.includes('qa')) throw new Error('read unavailable');
      return structuredClone(state.get(id)!);
    },
    async mutate(action) {
      writes.push(action.id); const node = state.get(action.id)!;
      if (action.id === 'qa' && fault === 'reject') throw new Error('write rejected');
      if (action.id === 'qa' && fault === 'stale' && writes.filter(x=>x==='qa').length === 1) return;
      node.value = action.expected; node.version = String(Number(node.version)+1);
      if (fault === 'drift' && action.id === 'brief') state.get('qa')!.value = '2026-09-17';
      if (fault === 'lost' && action.id === 'qa') throw new Error('response lost');
    }
  };
}
