import { createServer } from 'node:http';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const clientPath=process.env.GOOGLE_CLIENT_PATH??'secrets/google-client.json';
const tokenPath='secrets/google-tokens.json';
interface Client { client_id:string; client_secret:string }
interface Tokens { access_token:string; refresh_token?:string; expires_at:number }
async function client():Promise<Client> {
  const json=JSON.parse(await readFile(clientPath,'utf8'));
  if (!json.installed?.client_id || !json.installed?.client_secret) throw new Error('Google Desktop OAuth client required at secrets/google-client.json.');
  return json.installed;
}
async function exchange(body:URLSearchParams):Promise<Tokens> {
  const res=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body,signal:AbortSignal.timeout(20000)});
  const json=await res.json() as {access_token?:string;refresh_token?:string;expires_in?:number};
  if (!res.ok || !json.access_token || !json.expires_in) throw new Error(`Google OAuth token exchange failed (${res.status}); reauthorize.`);
  return {access_token:json.access_token,refresh_token:json.refresh_token,expires_at:Date.now()+json.expires_in*1000};
}
export async function accessToken():Promise<string> {
  let tokens:Tokens;
  try {tokens=JSON.parse(await readFile(tokenPath,'utf8'));} catch {throw new Error('Google is not connected. Run npm run auth.');}
  if (tokens.access_token && tokens.expires_at>Date.now()+60000) return tokens.access_token;
  if (!tokens.refresh_token) throw new Error('Google authorization expired. Run npm run auth.');
  const c=await client(); const next=await exchange(new URLSearchParams({client_id:c.client_id,client_secret:c.client_secret,refresh_token:tokens.refresh_token,grant_type:'refresh_token'}));
  await writeFile(tokenPath,JSON.stringify({...next,refresh_token:tokens.refresh_token}),{mode:0o600});
  return next.access_token;
}
export async function startAuth():Promise<{url:string;done:Promise<void>}> {
  const c=await client(); const state=randomBytes(32).toString('hex'); const verifier=randomBytes(48).toString('base64url');
  const redirect='http://127.0.0.1:4318/callback';
  let settle:()=>void; let fail:(e:Error)=>void;
  const done=new Promise<void>((resolve,reject)=>{settle=resolve;fail=reject;});
  const server=createServer(async(req,res)=>{
    const url=new URL(req.url??'/',redirect);
    res.setHeader('Content-Type','text/plain; charset=utf-8');
    if (url.pathname!=='/callback') {res.writeHead(404).end('Not found');return;}
    const candidate=Buffer.from(url.searchParams.get('state')??''); const expected=Buffer.from(state);
    if (candidate.length!==expected.length || !timingSafeEqual(candidate,expected)) {res.writeHead(400).end('Invalid OAuth state');return;}
    try {
      const code=url.searchParams.get('code'); if(!code) throw new Error('Authorization was not granted.');
      const tokens=await exchange(new URLSearchParams({client_id:c.client_id,client_secret:c.client_secret,code,code_verifier:verifier,redirect_uri:redirect,grant_type:'authorization_code'}));
      await mkdir('secrets',{recursive:true}); await writeFile(tokenPath,JSON.stringify(tokens),{mode:0o600});
      res.end('Mercury connected. Return to http://127.0.0.1:4317 and create the demo workspace.');settle();
    } catch(e) {res.writeHead(400).end('Authorization failed. See Mercury for next steps.');fail(e instanceof Error?e:new Error('OAuth failed'));}
    finally {clearTimeout(timer);server.close();}
  });
  const timer=setTimeout(()=>{server.close();fail(new Error('OAuth timed out. Try again.'));},300000);
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(4318,'127.0.0.1',resolve);}).catch(e=>{clearTimeout(timer);throw e;});
  const params=new URLSearchParams({client_id:c.client_id,redirect_uri:redirect,response_type:'code',scope:'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/documents',access_type:'offline',prompt:'consent',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'});
  return {url:`https://accounts.google.com/o/oauth2/v2/auth?${params}`,done};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {const auth=await startAuth();console.log(`Open in your regular browser:\n${auth.url}`);await auth.done;console.log('Google authorization saved locally.');} catch(e) {console.error(e instanceof Error?e.message:e);process.exitCode=1;}
}
