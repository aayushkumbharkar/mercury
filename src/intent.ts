import { compileExact, validDate } from './engine.ts';
export interface Intent {targetDate:string;sourceDate?:string;method:string}
export async function compile(input:string):Promise<Intent> {
  if(typeof input!=='string'||input.length>1500||!input.trim()) throw new Error('Enter a launch move request under 1500 characters.');
  const exact=compileExact(input);if(exact) return exact;
  if(!process.env.OPENAI_API_KEY) throw new Error('Ambiguous or unsupported request. Use: Move launch from 2026-09-18 to 2026-09-22.');
  const res=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(30000),body:JSON.stringify({
    model:process.env.OPENAI_MODEL??'gpt-6-astra',store:false,max_output_tokens:1200,
    instructions:'Compile a launch date change. Return supported=false for ambiguity, relative dates, unsupported actions, sending notifications, deleting anything, or conflicting instructions. Only date shifts preserving dependencies and updating recorded information are supported. Never invent a year: use explicit year or the supplied sandbox year 2026 for named month/day. Return sourceDate only when explicitly specified. Reason is a short explanation. You cannot approve actions.',
    input,
    text:{format:{type:'json_schema',name:'launch_intent',strict:true,schema:{type:'object',properties:{supported:{type:'boolean'},targetDate:{type:['string','null']},sourceDate:{type:['string','null']},reason:{type:'string'}},required:['supported','targetDate','sourceDate','reason'],additionalProperties:false}}}
  })});
  if(!res.ok) throw new Error(`Intent compiler unavailable (HTTP ${res.status}). Use an explicit ISO-date launch request.`);
  const json=await res.json() as {status?:string;output?:{content?:{type:string;text?:string}[]}[]};
  if(json.status!=='completed') throw new Error('Intent compilation incomplete. No executable plan created.');
  const text=json.output?.flatMap(o=>o.content??[]).filter(c=>c.type==='output_text').map(c=>c.text??'').join('');
  if(!text) throw new Error('Intent compiler returned no usable output.');
  const parsed=JSON.parse(text);
  if(parsed.supported!==true||typeof parsed.targetDate!=='string'||!validDate(parsed.targetDate)|| (parsed.sourceDate!==null&&(typeof parsed.sourceDate!=='string'||!validDate(parsed.sourceDate)))) throw new Error('Request is ambiguous or unsupported. Specify a single launch date and preserve dependencies.');
  return {targetDate:parsed.targetDate,...(parsed.sourceDate?{sourceDate:parsed.sourceDate}:{}),method:'Model interpretation; inspect dates before execution'};
}

