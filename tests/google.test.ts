import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRows, parseBrief, parseLinks } from '../src/google.ts';

test('register discovery derives real dependencies and stable row IDs',()=>{
 const nodes=parseRows([['ID','Title','Due','Owner','Depends','Latest','Locked','Audience','OffsetDays'],['qa','QA','2026-09-16','Maya','launch','','false','internal',-2],['ship','Ship','2026-09-18','Sam','qa','','false','internal',-1]], 'sheet');
 assert.deepEqual(nodes[1].dependsOn,['qa']); assert.equal(nodes[0].externalId,'sheet!C2');
 assert.equal(nodes[0].owner,'Maya');
});
test('malformed dependency rows and duplicate IDs fail closed',()=>{
 assert.throws(()=>parseRows([['wrong']], 'sheet'));
 assert.throws(()=>parseRows([['ID','Title','Due','Owner','Depends','Latest','Locked','Audience','OffsetDays'],['launch','QA','2026-09-16','Maya','launch','','false','internal',-2]], 'sheet'));
});
test('brief parsing refuses ambiguous dates',()=>{
 assert.equal(parseBrief('Launch date: 2026-09-18\nAudience: internal\n').value,'2026-09-18');
 assert.throws(()=>parseBrief('Launch date: 2026-09-18\nLaunch date: 2026-09-19\n'));
});
test('discovered links are bounded to explicitly provisioned sandbox IDs',()=>{
 const sandbox={eventId:'e',sheetId:'s',docId:'d',calendarId:'primary'};
 assert.deepEqual(parseLinks('MERCURY_LINKS {"sheetId":"s","docId":"d"}',sandbox),{sheetId:'s',docId:'d'});
 assert.throws(()=>parseLinks('MERCURY_LINKS {"sheetId":"evil","docId":"d"}',sandbox));
});

test('brief audience cannot be inferred from contradictory declarations',()=>{
 assert.throws(()=>parseBrief('Launch date: 2026-09-18\nAudience: internal\nAudience: external\n'));
});
test('brief edit location targets only the anchored date, not historical prose',()=>{
 const text='Historical note: Launch date: 2026-09-18\nLaunch date: 2026-09-18\nAudience: internal\n';
 const parsed=parseBrief(text);
 assert.equal(parsed.dateOffset,54);
});
