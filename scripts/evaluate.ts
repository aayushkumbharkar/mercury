import {writeFile,mkdir} from 'node:fs/promises';
import {plan,execute,compileExact} from '../src/engine.ts';
import {rehearsal} from '../src/rehearsal.ts';
import type {Fault} from '../src/rehearsal.ts';
import type {Verdict} from '../src/domain.ts';
const cases:{name:string;fault:Fault;want:Verdict;approved?:boolean}[]=[
 {name:'A · all succeed',fault:'none',want:'SUCCESS'},
 {name:'B · rejected mutation',fault:'reject',want:'FAILED'},
 {name:'C · acknowledged stale write',fault:'stale',want:'SUCCESS'},
 {name:'D · concurrent edit',fault:'conflict',want:'FAILED'},
 {name:'F · approval withheld',fault:'approval',want:'INCONCLUSIVE'},
 {name:'F2 · explicit approval',fault:'approval',want:'SUCCESS',approved:true},
 {name:'G · unreadable postcondition',fault:'unreadable',want:'INCONCLUSIVE'},
];
const results=[];
await mkdir('data/evaluations',{recursive:true});
for(const c of cases){
 const d=rehearsal(c.fault);let writes=0;
 const r=await execute(plan(d.nodes,'2026-09-22'),{read:id=>d.store.read(id),async mutate(a,b){writes++;return d.store.mutate(a,b);}},{approved:c.approved,fault:c.fault});
 const recovered=r.results.filter(x=>x.recovered).length;
 const passed=r.verdict===c.want&&r.results.every(x=>x.attempts.length<=2)&&(c.fault!=='stale'||recovered===1)&&(c.fault!=='conflict'||writes===0)&&(c.fault!=='approval'||c.approved||writes===0);
 results.push({case:c.name,expected:c.want,actual:r.verdict,writes,verified:r.results.filter(x=>x.verdict==='SUCCESS').length,recovered,passed});
 await writeFile(`data/evaluations/${c.fault}${c.approved?'-approved':''}.json`,JSON.stringify(r,null,2));
}
results.splice(4,0,{case:'E · ambiguous request',expected:'INCONCLUSIVE',actual:compileExact('Move launch to next week')===null?'INCONCLUSIVE':'FAILED',writes:0,verified:0,recovered:0,passed:compileExact('Move launch to next week')===null});
const report={at:new Date().toISOString(),mode:'deterministic fixtures, not live integration evidence',passed:results.filter(x=>x.passed).length,total:results.length,results};
await writeFile('data/evaluations/report.json',JSON.stringify(report,null,2));
await writeFile('EVALUATION_RESULTS.md',`# Deterministic evaluation results\n\nGenerated ${report.at}. ${report.passed}/${report.total} passed. These results exercise the real coordinator against isolated fixture state. They do not establish live API behavior.\n\n| Case | Expected | Actual | Writes | Verified | Recovered | Pass |\n|---|---|---|---:|---:|---:|---|\n${results.map(r=>`| ${r.case} | ${r.expected} | ${r.actual} | ${r.writes} | ${r.verified} | ${r.recovered} | ${r.passed?'yes':'NO'} |`).join('\n')}\n\nRun: \`npm run evaluate\`. Unit/contract/HTTP tests: \`npm test\`. Local machine-readable receipts: \`data/evaluations/\`.\n`);
console.log(JSON.stringify(report,null,2));
if(report.passed!==report.total)process.exitCode=1;
