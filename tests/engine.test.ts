import test from 'node:test';
import assert from 'node:assert/strict';
import { plan, execute, compileExact } from '../src/engine.ts';
import { fixture, memoryStore } from './fixtures.ts';

test('A: preserves offsets and verifies every dependency', async () => {
  const store = memoryStore(); const p = plan(fixture(), '2026-09-22');
  assert.equal(p.actions.find(a => a.id === 'qa')?.expected, '2026-09-20');
  const r = await execute(p, store);
  assert.equal(r.verdict, 'SUCCESS');
  assert.equal(r.results.length, 4);
  assert.ok(r.results.every(a => a.verdict === 'SUCCESS' && a.observations.length > 0));
});
test('B: permanent failure stops dependents and bounds retries', async () => {
  const store = memoryStore('reject'); const r = await execute(plan(fixture(), '2026-09-22'), store);
  assert.equal(r.verdict, 'FAILED');
  assert.equal(store.writes.filter(x => x === 'qa').length, 2);
  assert.equal(store.writes.includes('brief'), false);
});
test('C: acknowledged stale write is detected and repaired', async () => {
  const store = memoryStore('stale'); const r = await execute(plan(fixture(), '2026-09-22'), store);
  assert.equal(r.verdict, 'SUCCESS');
  const qa = r.results.find(x => x.id === 'qa')!;
  assert.equal(qa.attempts.length, 2);
  assert.equal(qa.attempts[0].acknowledged, true);
  assert.ok(qa.observations.some(o => o.value === '2026-09-16'));
  assert.equal(qa.recovered, true);
});
test('D: concurrent edit is never overwritten', async () => {
  const store = memoryStore(); const p = plan(fixture(), '2026-09-22');
  store.state.get('qa')!.value = '2026-09-17';
  const r = await execute(p, store);
  assert.equal(r.verdict, 'FAILED'); assert.equal(store.writes.length, 0);
});
test('E: ambiguous intent cannot become an executable date', () => {
  assert.equal(compileExact('Move launch to next week'), null);
  assert.equal(compileExact('Move launch to 2026-02-30'), null);
  assert.equal(compileExact('Move launch from 2026-09-18 to 2026-09-22')?.targetDate, '2026-09-22');
});
test('F: approval is required before any external-facing write', async () => {
  const nodes = fixture(); nodes[3].risk = 'APPROVAL';
  const store = memoryStore(); store.state.get('brief')!.risk='APPROVAL'; const p = plan(nodes, '2026-09-22');
  assert.equal((await execute(p, store)).verdict, 'INCONCLUSIVE');
  assert.equal(store.writes.length, 0);
  assert.equal((await execute(p, store, { approved: true })).verdict, 'SUCCESS');
});
test('G: unreadable postcondition stays inconclusive without blind retry', async () => {
  const store = memoryStore('unreadable'); const r = await execute(plan(fixture(), '2026-09-22'), store);
  assert.equal(r.verdict, 'INCONCLUSIVE');
  assert.equal(store.writes.filter(x => x === 'qa').length, 1);
});
test('H: lost response reconciles successful external write without repeat', async () => {
  const store = memoryStore('lost'); const r = await execute(plan(fixture(), '2026-09-22'), store);
  assert.equal(r.verdict, 'SUCCESS'); assert.equal(store.writes.filter(x => x === 'qa').length, 1);
});
test('I: cycles, missing dependencies and fixed deadlines block entire plan', () => {
  const nodes = fixture(); nodes[1].latest = '2026-09-19';
  assert.ok(plan(nodes, '2026-09-22').blockers.length);
  nodes[1].latest = undefined; nodes[0].dependsOn = ['brief'];
  assert.ok(plan(nodes, '2026-09-22').blockers.some(x => /cycle/i.test(x)));
  nodes[0].dependsOn = ['missing'];
  assert.ok(plan(nodes, '2026-09-22').blockers.length);
});
test('J: final sweep catches drift after initial verification', async () => {
  const store = memoryStore('drift'); const r = await execute(plan(fixture(), '2026-09-22'), store);
  assert.equal(r.verdict, 'FAILED');
});

test('K: replan after partial execution repairs stale task using declared offset', async()=>{
 const nodes=fixture();nodes[0].value='2026-09-22';nodes[0].version='2';
 const p=plan(nodes,'2026-09-22');
 assert.equal(p.actions.find(a=>a.id==='qa')?.expected,'2026-09-20');
 assert.equal(p.actions.find(a=>a.id==='brief')?.expected,'2026-09-22');
});
test('L: stale brief converges to requested launch date instead of preserving drift',()=>{
 const nodes=fixture();nodes[3].value='2026-09-15';
 assert.equal(plan(nodes,'2026-09-22').actions.find(a=>a.id==='brief')?.expected,'2026-09-22');
});
test('M: drift in a prerequisite is detected before changing its dependent',async()=>{
 const base=memoryStore();const mutate=base.mutate;
 base.mutate=async(a,b)=>{await mutate(a,b);if(a.id==='qa')base.state.get('launch')!.value='2026-09-25';};
 const r=await execute(plan(fixture(),'2026-09-22'),base);
 assert.equal(r.verdict,'FAILED');assert.equal(base.writes.includes('brief'),false);
});
