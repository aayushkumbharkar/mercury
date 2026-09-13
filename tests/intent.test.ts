import test from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../src/intent.ts';

test('exact compiler preserves explicitly supplied source date',async()=>{
 const intent=await compile('Move launch from 2026-09-18 to 2026-09-22');
 assert.equal(intent.sourceDate,'2026-09-18');assert.equal(intent.targetDate,'2026-09-22');
});
test('model output cannot bypass calendar date validation',async()=>{
 const original=globalThis.fetch;const key=process.env.OPENAI_API_KEY;
 process.env.OPENAI_API_KEY='test-only';
 globalThis.fetch=async()=>new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({supported:true,targetDate:'2026-02-30',sourceDate:null,reason:''})}]}]}));
 try{await assert.rejects(compile('reschedule the launch in February'),/ambiguous/);}finally{globalThis.fetch=original;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});
test('compiler rejects extra unsupported actions without silently extracting a date',async()=>{
 const key=process.env.OPENAI_API_KEY;delete process.env.OPENAI_API_KEY;
 try{await assert.rejects(compile('Move launch to 2026-09-22 and delete all tasks'),/unsupported/);}finally{if(key!==undefined)process.env.OPENAI_API_KEY=key;}
});
