import test from 'node:test';
import assert from 'node:assert/strict';
import { recoveryProof } from '../web/proof.ts';
import { plan,execute } from '../src/engine.ts';
import { rehearsal } from '../src/rehearsal.ts';

test('proof exposes actual mismatch and repair while preserving rehearsal provenance',async()=>{
 const d=rehearsal('stale');const r=await execute(plan(d.nodes,'2026-09-22'),d.store);
 const proof=recoveryProof(r);
 assert.equal(proof?.expected,'2026-09-20');assert.equal(proof?.observed,'2026-09-16');
 assert.equal(proof?.repaired,'2026-09-20');assert.equal(proof?.acknowledged,true);
 assert.equal(proof?.mode,'rehearsal');
});
test('an unresolved final state cannot display a recovered proof',async()=>{
 const d=rehearsal('stale');const r=await execute(plan(d.nodes,'2026-09-22'),d.store);
 r.results.find(x=>x.recovered)!.verdict='FAILED';r.verdict='FAILED';
 assert.equal(recoveryProof(r),null);
});

test('live failure evidence is visible while recovery is pending',async()=>{
 const {failureProof}=await import('../web/proof.ts');
 const d=rehearsal('stale');let seen=false;
 await execute(plan(d.nodes,'2026-09-22'),d.store,{onChange:async r=>{const proof=failureProof(r);if(proof){assert.equal(proof.observed,'2026-09-16');assert.equal(proof.expected,'2026-09-20');seen=true;}}});
 assert.equal(seen,true);
});
