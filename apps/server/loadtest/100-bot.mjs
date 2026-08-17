import WebSocket from 'ws';
import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

const BASE_URL=(process.env.BASE_URL??'http://127.0.0.1:3080').replace(/\/$/,'');
const BOT_COUNT=Math.max(1,Number(process.env.BOT_COUNT??100));
const COMMAND_DELAY_MS=Math.max(0,Number(process.env.COMMAND_DELAY_MS??120));
const BOT_TIMEOUT_MS=Math.max(5000,Number(process.env.BOT_TIMEOUT_MS??90000));
const REPORT_PATH=process.env.LOADTEST_REPORT??`loadtest-report-${BOT_COUNT}.json`;
const AI_VARIANTS=process.env.LOADTEST_AI_VARIANTS==='true';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const percentile=(values,p)=>{if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b);return Number(sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*p))].toFixed(1));};
const stats=values=>({count:values.length,min:values.length?Number(Math.min(...values).toFixed(1)):null,avg:values.length?Number((values.reduce((a,b)=>a+b,0)/values.length).toFixed(1)):null,p50:percentile(values,.5),p95:percentile(values,.95),p99:percentile(values,.99),max:values.length?Number(Math.max(...values).toFixed(1)):null});

async function login(slot){
 const started=performance.now(),response=await fetch(`${BASE_URL}/api/dev/login/${slot}`,{method:'POST',redirect:'manual'}),latency=performance.now()-started;if(!response.ok)throw new Error(`login ${slot}: HTTP ${response.status}`);const cookie=response.headers.get('set-cookie')?.split(';')[0];if(!cookie)throw new Error(`login ${slot}: no session cookie`);return {cookie,latency};
}
async function state(cookie){const started=performance.now(),response=await fetch(`${BASE_URL}/api/me`,{headers:{cookie}}),latency=performance.now()-started;if(!response.ok)throw new Error(`/api/me HTTP ${response.status}`);return {data:await response.json(),latency};}
function openSocket(cookie){return new Promise((resolve,reject)=>{const started=performance.now(),url=BASE_URL.replace(/^http/,'ws')+'/ws',ws=new WebSocket(url,{headers:{Cookie:cookie}}),timer=setTimeout(()=>{ws.terminate();reject(new Error('websocket connect timeout'));},10000);ws.once('open',()=>{clearTimeout(timer);resolve({ws,latency:performance.now()-started});});ws.once('error',error=>{clearTimeout(timer);reject(error);});});}
function command(ws,text){return new Promise((resolve,reject)=>{const started=performance.now(),timer=setTimeout(()=>{cleanup();reject(new Error(`command timeout: ${text}`));},15000);const onMessage=raw=>{let message;try{message=JSON.parse(raw.toString());}catch{return;}if(message.type!=='OUTPUT')return;cleanup();resolve({latency:performance.now()-started,lines:Array.isArray(message.lines)?message.lines.map(String):[]});};const onClose=()=>{cleanup();reject(new Error(`socket closed during: ${text}`));};const cleanup=()=>{clearTimeout(timer);ws.off('message',onMessage);ws.off('close',onClose);};ws.on('message',onMessage);ws.on('close',onClose);ws.send(JSON.stringify({type:'COMMAND',text}));});}

function scriptFor(slot){
 const standard=['Look around','Ask Courier about Registry','Move Registry','Look around','Take letter','Read letter','Claim letter','Ask Clerk about ownership','Move Bellweather Square','Move Bakery','Look around','Ask Baker about Registry'];
 if(!AI_VARIANTS||slot%5!==0)return standard;
 return ['what is around me','could you ask the courier what the registry is doing','get me to the registry','have a look around','can I grab the letter','read this letter for me','I reckon this letter is mine','why does the clerk think ownership is different','take me back to bellweather square','head over to the bakery','what is around me here','what does the baker know about the registry'];
}

async function runBot(slot){
 const result={slot,ok:false,loginMs:0,wsConnectMs:0,stateMs:[],commandMs:[],commands:0,outputLines:0,errors:[],grade:'UNKNOWN',assessment:'UNKNOWN',origin:null,threads:0,knownConcepts:0};let ws;
 const deadline=setTimeout(()=>{try{ws?.terminate();}catch{}},BOT_TIMEOUT_MS);
 try{
  const auth=await login(slot);result.loginMs=auth.latency;const initial=await state(auth.cookie);result.stateMs.push(initial.latency);result.origin=initial.data?.social?.origin?.name??null;
  const socket=await openSocket(auth.cookie);ws=socket.ws;result.wsConnectMs=socket.latency;
  for(const text of scriptFor(slot)){
   const response=await command(ws,text);result.commandMs.push(response.latency);result.commands+=1;result.outputLines+=response.lines.length;await sleep(COMMAND_DELAY_MS+Math.floor(Math.random()*COMMAND_DELAY_MS));
  }
  let final=await state(auth.cookie);result.stateMs.push(final.latency);
  if(final.data?.progression?.grade==='FAIL'){
   // One recovery pass models a human reacting to temporary contention rather than staring at the wall forever.
   for(const text of ['Move Registry','Look around','Take ledger','Read ledger','Claim ledger','Ask Clerk about ownership','Move Bellweather Square','Move Market Lane','Look around']){const response=await command(ws,text);result.commandMs.push(response.latency);result.commands+=1;result.outputLines+=response.lines.length;await sleep(COMMAND_DELAY_MS);}
   final=await state(auth.cookie);result.stateMs.push(final.latency);
  }
  result.grade=final.data?.progression?.grade??'UNKNOWN';result.assessment=final.data?.progression?.assessment??'UNKNOWN';result.threads=Array.isArray(final.data?.threads)?final.data.threads.length:0;result.knownConcepts=Array.isArray(final.data?.knownConcepts)?final.data.knownConcepts.length:0;result.ok=true;
 }catch(error){result.errors.push(error instanceof Error?error.message:String(error));}finally{clearTimeout(deadline);try{ws?.close();}catch{}}
 return result;
}

const healthStart=performance.now(),health=await fetch(`${BASE_URL}/api/health`).catch(()=>null);if(!health?.ok){console.error(`Target ${BASE_URL} is not healthy or reachable.`);process.exit(2);}const healthMs=performance.now()-healthStart;
console.log(`UNINTENDED load test: ${BOT_COUNT} bots -> ${BASE_URL}`);
console.log(`AI variants: ${AI_VARIANTS?'enabled':'disabled'}; command delay: ${COMMAND_DELAY_MS}ms`);
const startedAt=new Date().toISOString(),wallStart=performance.now();
const results=await Promise.all(Array.from({length:BOT_COUNT},(_,index)=>runBot(index+1)));
const wallMs=performance.now()-wallStart,successful=results.filter(row=>row.ok),completed=successful.filter(row=>row.grade!=='FAIL'&&row.grade!=='UNKNOWN'),origins={};for(const row of successful)origins[row.origin??'UNKNOWN']=(origins[row.origin??'UNKNOWN']??0)+1;
const report={
 startedAt,finishedAt:new Date().toISOString(),target:BASE_URL,botCount:BOT_COUNT,aiVariants:AI_VARIANTS,healthMs:Number(healthMs.toFixed(1)),wallMs:Number(wallMs.toFixed(1)),
 summary:{botsOk:successful.length,botsErrored:BOT_COUNT-successful.length,bellweatherCompleted:completed.length,bellweatherCompletionPct:Number((completed.length/BOT_COUNT*100).toFixed(1)),commands:results.reduce((sum,row)=>sum+row.commands,0),outputLines:results.reduce((sum,row)=>sum+row.outputLines,0),origins},
 latencyMs:{login:stats(successful.map(row=>row.loginMs)),websocketConnect:stats(successful.map(row=>row.wsConnectMs)),state:stats(successful.flatMap(row=>row.stateMs)),command:stats(successful.flatMap(row=>row.commandMs))},
 grades:Object.fromEntries(['FAIL','BARE','COMPETENT','MASTERY','UNKNOWN'].map(grade=>[grade,results.filter(row=>row.grade===grade).length])),
 errors:results.filter(row=>row.errors.length).map(row=>({slot:row.slot,errors:row.errors})),bots:results
};
await writeFile(REPORT_PATH,JSON.stringify(report,null,2));
console.log(JSON.stringify({summary:report.summary,latencyMs:report.latencyMs,grades:report.grades,report:REPORT_PATH},null,2));
if(successful.length!==BOT_COUNT||completed.length/BOT_COUNT<.9)process.exitCode=1;
