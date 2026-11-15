/* Local-only headless visual verification. No production/server files are changed. */
const fs=require('fs'),path=require('path'),http=require('http'),{spawn}=require('child_process');
const root=path.resolve(__dirname,'../..'),out=__dirname;
const three=path.resolve(root,'../Simulator/node_modules/three');
const report={viewport:[1600,1000],mode:'demo',speed:4,errors:[],screenshots:[],checks:[]};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let browser,server,ws,seq=0;const pending=new Map();
async function cdp(method,params={}){const id=++seq;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
async function until(expression,ms=60000){const start=Date.now();while(Date.now()-start<ms){if(await evaluate(expression))return;await wait(200);}throw new Error('Timeout: '+expression);}
async function shot(name,settle=300){await wait(settle);const r=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,`pass4-${name}.png`),Buffer.from(r.data,'base64'));report.screenshots.push(`pass4-${name}.png`);console.log('Screenshot',name);}
async function main(){
  if(!fs.existsSync(three))throw new Error('Local Three package unavailable');report.three=JSON.parse(fs.readFileSync(path.join(three,'package.json'))).version;
  server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');let file=url.pathname.startsWith('/__three/')?path.join(three,url.pathname.slice(9)):path.join(root,'public',url.pathname==='/'?'index.html':url.pathname);try{let data=fs.readFileSync(file);if(file.endsWith('index.html'))data=Buffer.from(data.toString().replaceAll('https://cdn.jsdelivr.net/npm/three@0.186.0/','/__three/'));if(file.endsWith('viewer.js'))data=Buffer.from(data.toString().replace("if(mode!=='demo'||raceState!=='running')return;","if(window.__capture?.manual||mode!=='demo'||raceState!=='running')return;")+`\nwindow.__capture={manual:false,receiveAction,initialize,refreshView,views,queues,get time(){return simTime},freeze:false};\n`);res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(data);}catch(e){res.statusCode=404;res.end('Not found');}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
  const profile=path.join(out,'pass4-chrome-profile-'+process.pid);fs.mkdirSync(profile,{recursive:true});
  browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-sandbox','--remote-debugging-port=0',`--user-data-dir=${profile}`,'--window-size=1600,1000','--force-device-scale-factor=1','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-extensions','--disable-features=Translate,OptimizationHints','about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
  browser.stderr.pipe(fs.createWriteStream(path.join(out,'pass4-chrome.log')));browser.on('exit',code=>console.log('Chrome exited',code));
  fs.writeFileSync(path.join(out,'pass4-pids.json'),JSON.stringify({harness:process.pid,chrome:browser.pid,profile}));
  let debugPort;for(let i=0;i<100;i++){try{debugPort=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);if(debugPort)break;}catch{}await wait(100);}
  const pages=await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r));
  ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}}else if(m.method==='Runtime.exceptionThrown')report.errors.push(m.params.exceptionDetails);});
  await cdp('Runtime.enable');await cdp('Page.enable');await cdp('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
  // Pause only the demo's decision source before the first frame, preserving animation.
  await cdp('Page.addScriptToEvaluateOnNewDocument',{source:`Object.defineProperty(window,'__capture',{configurable:true,get(){return this._cap},set(v){this._cap=v;v.manual=true;}});`});
  await cdp('Page.navigate',{url:`http://127.0.0.1:${port}/?mode=demo&seed=42&speed=4&shot=1`});
  await until('window.__viewer?.ready',90000);await wait(700);await shot('start-lab');
  report.initial=await evaluate(`(()=>{const d=__viewer;return {objects:d.worlds[0].props.size,visible:[...d.worlds[0].props.values()].filter(p=>p.visible).length,hiddenLeaks:[...d.worlds[0].props.values()].filter(p=>p.userData.definition.hidden&&p.visible).map(p=>p.name),shadows:d.worlds.map(w=>{let n=0;w.scene.traverse(o=>{if(o.isLight&&o.castShadow)n++});return n}),instances:d.worlds.map(w=>{let n=0;w.scene.traverse(o=>{if(o.isInstancedMesh)n++});return n})}})()`);
  // Genuine engine actions via the same reception and animation path as SSE/demo.
  await evaluate(`__capture.receiveAction({p:0,cmd:{op:'inspect',target:'potion_cabinet'},thought:'פותח את ארון הזכוכית ובוחן מה נמצא על המדפים.'});__capture.receiveAction({p:1,cmd:{op:'inspect',target:'bookshelf'},thought:'בין הספרים יש גם חפצים קטנים. בודק אותם מקרוב.'});`);
  await wait(210);await shot('containers-opening',0);await wait(800);await shot('containers-open');
  await evaluate(`__viewer.focus(0)`);await wait(900);await shot('focus-cabinet');
  await evaluate(`__viewer.focus(-1);__capture.receiveAction({p:2,cmd:{op:'inspect',target:'desk'},thought:'בודק את השולחן.'})`);await wait(600);
  report.checks.push(await evaluate(`({name:'nested-before-drawer',drawer:__viewer.worlds[2].prop('desk_drawer','lab').visible,key:__viewer.worlds[2].prop('brass_key','lab').visible})`));
  await evaluate(`__capture.receiveAction({p:2,cmd:{op:'inspect',target:'desk_drawer'},thought:'פותח את המגירה.'});__capture.receiveAction({p:3,cmd:{op:'inspect',target:'rug'},thought:'מרים את קצה השטיח.'});`);await wait(750);
  report.checks.push(await evaluate(`({name:'nested-reveal-and-isolation',key:__viewer.worlds[2].prop('brass_key','lab').visible,otherPlayerKey:__viewer.worlds[3].prop('brass_key','lab').visible,slide:__viewer.worlds[2].prop('desk_drawer','lab').userData.slide.position.z,rug:__viewer.worlds[3].prop('rug','lab').userData.openAmount,trapdoor:__viewer.worlds[3].prop('trapdoor','lab').visible})`));
  await evaluate(`__viewer.focus(2)`);await wait(600);await shot('focus-drawer');
  await evaluate(`__viewer.focus(-1);__capture.manual=false`);
  // Natural MockBot decisions from the observation API. The two pre-inspected containers
  // are idempotent; the bots discover them normally when their own turns reach them.
  const captured=new Set();const started=Date.now();
  while(Date.now()-started<230000&&captured.size<4){
    const state=await evaluate(`({rooms:__viewer.game.players.map(p=>p.room),tarps:__viewer.worlds.map(w=>w.prop('tarp','storage').userData.openAmount||0),boards:__viewer.game.players.map(p=>p.discovered.includes('torn_page')),time:__viewer.elapsedMs,errors:__viewer.errors,fps:__viewer.fps})`);
    if(!captured.has('storage')){const i=state.rooms.findIndex((r,i)=>r==='storage'&&state.tarps[i]>.95);if(i>=0){await shot('storage-tarp');await evaluate(`__capture.manual=true;__viewer.focus(${i})`);await wait(900);await shot('focus-storage');await evaluate(`__viewer.focus(-1);__capture.manual=false`);captured.add('storage');}}
    if(!captured.has('minefield')){const i=state.rooms.indexOf('minefield');if(i>=0){await shot('minefield');await evaluate(`__capture.manual=true;__viewer.focus(${i})`);await wait(900);await shot('focus-minefield');await evaluate(`__viewer.focus(-1);__capture.manual=false`);captured.add('minefield');}}
    if(!captured.has('vault')){const i=state.rooms.findIndex((r,i)=>r==='vault'&&state.boards[i]);if(i>=0){await shot('vault-board');await evaluate(`__capture.manual=true;__viewer.focus(${i})`);await wait(900);await shot('focus-vault');await evaluate(`__viewer.setCamera('auto')`);await wait(1200);await shot('focus-vault-auto');await evaluate(`__viewer.focus(-1)`);await wait(900);await shot('four-views-auto');await evaluate(`__viewer.setCamera('room');__capture.manual=false`);captured.add('vault');}}
    if(state.rooms.every(r=>r==='vault')&&captured.size===3)captured.add('finish');
    if(await evaluate('__viewer.game.finished'))break;
    await wait(500);
  }
  report.final=await evaluate(`(()=>{const d=__viewer;return {fps:d.fps,drawCalls:d.drawCalls,triangles:d.triangles,renderScale:d.renderScale,errors:d.errors,finished:d.game.finished,rooms:d.game.players.map(p=>p.room),chipOverflow:[...document.querySelectorAll('.discoveries,.inventory')].map(e=>({scroll:e.scrollWidth,width:e.clientWidth})),objectiveElements:document.querySelectorAll('.objective').length,activities:[...document.querySelectorAll('.activity-line')].map(e=>e.textContent),missing:d.worlds.map(w=>Object.entries(d.game.rooms).flatMap(([r,room])=>room.objects.filter(o=>!w.prop(o.id,r)).map(o=>r+':'+o.id)))}})()`);
  console.log(JSON.stringify({initial:report.initial,final:report.final}));
  fs.writeFileSync(path.join(out,'pass4-report.json'),JSON.stringify(report,null,2));
}
main().catch(e=>{console.error(e);report.error=String(e);fs.writeFileSync(path.join(out,'pass4-report.json'),JSON.stringify(report,null,2));process.exitCode=1;}).finally(async()=>{try{await cdp('Browser.close');}catch{}ws?.close();browser?.kill();server?.close();setTimeout(()=>process.exit(process.exitCode||0),500).unref();});
