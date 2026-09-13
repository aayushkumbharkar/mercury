import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const take=process.argv[2]??'3';
const config=JSON.parse(await readFile('demo/config.json','utf8'));
const marks=JSON.parse(await readFile(`demo/evidence/take-${take}-timing.json`,'utf8'));
const narration=JSON.parse(await readFile('demo/narration.json','utf8'));
const probe=path=>JSON.parse(spawnSync('ffprobe',['-v','error','-show_entries','format=duration','-of','json',path],{encoding:'utf8'}).stdout).format.duration;
const rawDuration=Number(probe(`demo/raw/take-${take}.webm`));
const trim=Math.max(0,rawDuration-marks.contentSeconds);
// Align speech to the observed failure, after the execution sentence has finished.
narration[3].at=Math.max(47,Math.min(50,marks.failureAt+1));
function stamp(seconds){const ms=Math.round(seconds*1000);return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`;}
let captions='';let count=1;
for(let i=0;i<narration.length;i++){
 const words=narration[i].text.split(/\s+/);const duration=Number(probe(`demo/audio/segment-${i}.wav`));
 for(let start=0;start<words.length;start+=12){const chunk=words.slice(start,start+12);const middle=Math.ceil(chunk.length/2);captions+=`${count++}\n${stamp(narration[i].at+duration*start/words.length)} --> ${stamp(narration[i].at+duration*Math.min(start+12,words.length)/words.length)}\n${chunk.slice(0,middle).join(' ')}\n${chunk.slice(middle).join(' ')}\n\n`;}
}
await writeFile('demo/captions.srt',captions);
const args=['-y','-loglevel','error','-ss',trim.toFixed(3),'-i',`demo/raw/take-${take}.webm`];
for(let i=0;i<narration.length;i++)args.push('-i',`demo/audio/segment-${i}.wav`);
const filters=narration.map((s,i)=>`[${i+1}:a]adelay=${Math.round(s.at*1000)}:all=1[a${i}]`);
filters.push(narration.map((_,i)=>`[a${i}]`).join('')+`amix=inputs=${narration.length}:duration=longest:normalize=0,apad,atrim=duration=${config.durationSeconds},loudnorm=I=-16:TP=-1.5:LRA=11[a]`);
filters.push("[0:v]scale=1920:1080,subtitles=filename=demo/captions.srt:force_style='FontName=Arial,FontSize=19,PrimaryColour=&H00FFFFFF,OutlineColour=&H00282828,BorderStyle=3,Outline=1,Shadow=0,MarginV=14'[v]");
args.push('-filter_complex',filters.join(';'),'-map','[v]','-map','[a]','-t',String(config.durationSeconds),'-r','30','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart','demo/mercury-demo.mp4');
const encoded=spawnSync('ffmpeg',args,{encoding:'utf8',maxBuffer:4*1024*1024});if(encoded.status!==0)throw new Error(encoded.stderr);
const duration=Number(probe('demo/mercury-demo.mp4'));
if(duration>120||duration<105)throw new Error('Final video outside required duration.');
await writeFile('demo/render-report.json',JSON.stringify({take,source:`raw/take-${take}.webm`,rawDuration,trimmedSetupSeconds:trim,finalDuration:duration,voice:'Microsoft Zira Desktop (local synthetic)',captions:'captions.srt',fault:'Real stale write; six-second pause after actual mismatch',narration},null,2));
console.log(JSON.stringify({output:'demo/mercury-demo.mp4',duration,trimmedSetupSeconds:trim}));
