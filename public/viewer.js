import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { World } from './world.js';
import { disposePropGeometry } from './props.js';
import { palette, disposeAssets } from './textures.js';

// One context, four independent world states and four postprocessing pipelines.
// OutputPass resolves tone mapping/sRGB into each target; the final quad copies
// pixels unchanged into the matching DOM viewport (no second color conversion).
const params=new URLSearchParams(location.search);
const mode=params.get('mode')==='live'?'live':'demo';
const speed=mode==='demo'?[1,2,4].includes(Number(params.get('speed')))?Number(params.get('speed')):1:1;
const shot=params.get('shot')==='1';
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const $=id=>document.getElementById(id);
const fallbackPlayers=[{id:'careful',name:'הזהיר',color:'#71d5cc'},{id:'fast',name:'הזריז',color:'#e9b870'},{id:'chatty',name:'הפטפטן',color:'#b6a0ec'},{id:'chaotic',name:'הכאוטי',color:'#ee8c9b'}];
const roomIcons=['⚗','▣','▦','◈'];
const roomNames=['המעבדה','המחסן','שדה המוקשים','הכספת'];
const validModes=new Set(['auto','follow','room','overview']);
const dom={views:$('views'),tracks:$('race-tracks'),clock:$('show-clock'),log:$('thought-log')};
const debug={ready:false,fps:0,mode,speed,game:null,worlds:[],errors:[],renderScale:1};window.__viewer=debug;
let game,players=[],worlds=[],views=[],bots=[],source=null,seed,startTime=0,simTime=0,finishTime=null,raceState='lobby',focus=-1,epoch=0,disposed=false,resultsShown=false;
let lastFrame=performance.now(),frameCount=0,fpsStart=lastFrame,lastUI=0,layoutDirty=true,quality=1,slowSince=null,qualityRecovery=0,booting=false;
let replayApproximate=false;
let liveBaseMs=0,liveWallStart=performance.now(),liveFinishedMs=null;
const logEntries=[],queues=[],nextActions=[],times=[],wrongCodes=[];
const renderer=new THREE.WebGLRenderer({canvas:$('stage'),antialias:false,alpha:false,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.9;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.autoClear=false;
renderer.setClearColor('#0b1017');renderer.info.autoReset=false;
// One reflection probe is shared by all four sets and released with the renderer.
const studio=new RoomEnvironment(renderer),pmrem=new THREE.PMREMGenerator(renderer);
const environment=pmrem.fromScene(studio,.04);studio.dispose();pmrem.dispose();
const blitScene=new THREE.Scene();const blitCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
const blitMaterial=new THREE.ShaderMaterial({uniforms:{map:{value:null}},vertexShader:'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }',fragmentShader:'uniform sampler2D map; varying vec2 vUv; void main(){ gl_FragColor=texture2D(map,vUv); }',depthTest:false,depthWrite:false,toneMapped:false});
const blitQuad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),blitMaterial);blitScene.add(blitQuad);

function element(tag,className,text){const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;}
function formatTime(ms){const seconds=Math.max(0,Math.floor(ms/1000));return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;}
function elapsed(){if(raceState==='lobby')return 0;if(mode==='live')return liveFinishedMs??Math.max(0,liveBaseMs+performance.now()-liveWallStart);return Math.max(0,(finishTime??simTime)-startTime)*1000;}
function parseSeed(value){if(value===null)return crypto.getRandomValues(new Uint32Array(1))[0];return /^-?\d+$/.test(value)&&Number.isSafeInteger(Number(value))?Number(value):value;}
function color(value,fallback){return typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)?value:fallback;}
function definitions(){return Object.assign({},...Object.values(game.rooms).map(r=>Object.fromEntries(r.objects.map(o=>[o.id,o]))),game.items);}
let defs={};
function name(id){return defs[id]?.name||game.rooms[id]?.name||'החפץ';}
function commandText(cmd){
  switch(cmd?.op){
    case 'look':return 'מסתכל סביב ובוחן את החדר';
    case 'inspect':return `בודק: ${name(cmd.target)}`;
    case 'take':return `לוקח: ${name(cmd.target)}`;
    case 'use':return cmd.target==='cauldron'?`מוזג: ${name(cmd.item)} לקדרה`:cmd.item==='drain_valve'?'מרוקן את הקדרה':`משתמש ב${name(cmd.item)}${cmd.target?` על ${name(cmd.target)}`:''}`;
    case 'go':return `עובר אל ${name(cmd.room)}`;
    case 'step':return `צועד למשבצת ${cmd.row}, ${cmd.col}`;
    case 'enter_code':return `מנסה קוד בלוח המקשים: ${typeof cmd.code==='string'||typeof cmd.code==='number'?cmd.code:''}`;
    case 'inventory':return 'בודק אילו חפצים נמצאים ברשותו';
    case 'drop':return `מניח: ${name(cmd.item)}`;
    default:return 'מתכנן את הצעד הבא';
  }
}
function cameraSelect(value='auto'){
  const select=element('select','view-camera');select.setAttribute('aria-label','מצב מצלמה לזירה');for(const [id,text] of [['auto','במאי אוטומטי'],['follow','מעקב'],['room','מבט לחדר'],['overview','כל המסלול']]){const option=element('option','',text);option.value=id;select.append(option);}select.value=value;return select;
}
function buildUI(){
  dom.views.replaceChildren();dom.tracks.replaceChildren();views=[];
  players.forEach((p,i)=>{
    const card=element('article','view');card.style.setProperty('--agent',p.color);card.tabIndex=0;card.setAttribute('aria-label',`הזירה של ${p.name}. לפתיחת יומן המתמודד יש ללחוץ.`);
    const viewport=element('div','viewport');
    const top=element('div','view-top'),contestant=element('div','contestant'),avatar=element('span','agent-avatar'),names=element('div');const room=element('div','room-name');names.append(element('div','agent-name',p.name),room);contestant.append(avatar,names);top.append(contestant);
    const controls=element('div','view-tools'),select=cameraSelect(shot?'room':'auto'),focusHint=element('span','focus-hint','⤢');focusHint.title='לחצו להגדלת הזירה';controls.append(select,focusHint);top.append(controls);card.append(top);
    const objective=element('p','objective'),objectiveText=element('span');objective.append(objectiveText);viewport.append(objective);card.append(viewport);
    const inventory=element('div','inventory');inventory.setAttribute('aria-label','חפצים ברשות המתמודד');top.insertBefore(inventory,controls);
    const thoughtPanel=element('div','thought-panel');thoughtPanel.setAttribute('aria-label','המחשבות של '+p.name);const thought=element('p','thought-text','כל רמז יכול לפתוח את הדלת הבאה.');const command=element('span','', 'מתבונן בחדר'),status=element('span','action-status','מתכונן');const lastCommand=element('div','last-command');lastCommand.append(command,status);thoughtPanel.append(thought,lastCommand);card.append(thoughtPanel);
    const alert=element('div','view-alert');lastCommand.insertBefore(alert,status);dom.views.append(card);
    const track=element('div','race-track');track.style.setProperty('--agent',p.color);const trackHeading=element('div','track-heading'),place=element('span','track-place','בדרך לחופש');trackHeading.append(element('span','track-name',p.name),place);const path=element('div','track-path'),line=element('div','track-line'),fill=element('div','track-fill');line.append(fill);const stations=element('div','track-stations');roomIcons.forEach((icon,n)=>{const s=element('span','',icon);s.title=roomNames[n];stations.append(s);});const dot=element('span','robot-dot');path.append(line,stations,dot);track.append(trackHeading,path);dom.tracks.append(track);
    const view={card,viewport,room,objective:objectiveText,inventory,thought,command,status,select,alert,place,fill,dot,thoughtFull:'',thoughtAt:0,alertUntil:0,busyUntil:0,logRendered:0};views.push(view);
    card.addEventListener('click',e=>{if(e.target.closest('select,button,.inventory'))return;setFocus(focus===i?-1:i);});
    card.addEventListener('keydown',e=>{if(e.target!==card)return;if(e.key==='Enter'||e.key===' '){e.preventDefault();setFocus(focus===i?-1:i);}});
    select.addEventListener('change',()=>{worlds[i].mode=select.value;$('global-camera').value=worlds.every(w=>w.mode===select.value)?select.value:'mixed';});
  });
  $('lobby-players').replaceChildren(...players.map(p=>{const e=element('span','lobby-contestant',p.name);e.style.setProperty('--agent',p.color);return e;}));
  $('seed-label').textContent=`מרוץ ${seed}`;$('mode-label').textContent=mode==='live'?'מרוץ מתמודדים':speed===1?'מרוץ הדגמה':`הדגמה · מהירות ×${speed}`;
  $('global-camera').value=shot?'room':'auto';layoutDirty=true;
}
function refreshView(i,state=game.players[i],objective=game.objective(i),progress=game.progress(i)){
  const view=views[i];view.room.textContent=`חדר ${Object.keys(game.rooms).indexOf(state.room)+1} מתוך 4 · ${game.rooms[state.room].name}`;view.objective.textContent=objective;
  view.inventory.replaceChildren(...state.inventory.map(id=>{const chip=element('span','item-chip');const dot=element('i');dot.style.setProperty('--item',palette[defs[id]?.color]||'#e3c58c');chip.append(dot,document.createTextNode(name(id)));return chip;}));
  view.fill.style.width=`${progress*100}%`;view.dot.style.left=`${progress*100}%`;view.place.textContent=state.escaped?`${['🥇','🥈','🥉','🏁'][state.place-1]} מקום ${state.place}`:'בדרך לחופש';view.card.classList.toggle('escaped',state.escaped);
  if(state.escaped)view.status.textContent='הגיע לחופש';
}
function pushTicker(i,text){const item=element('span','ticker-event',`${players[i].name} — ${text}`);item.style.setProperty('--agent',players[i].color);const box=$('ticker-items');if(!box.querySelector('.ticker-event'))box.replaceChildren();box.prepend(item);while(box.children.length>7)box.lastChild.remove();}
function notable(i,result){for(const e of result.ev){let message='';switch(e.t){case 'escape':message=`יצא לחופש במקום ${e.place}!`;break;case 'boom':message='מוקש התפוצץ! חוזר לתחילת הלוח';break;case 'door':message=`${name(e.door)} נפתחה`;break;case 'code':message=e.ok?'פיצח את קוד הכספת':'ניסה קוד שגוי';break;case 'brew':message=e.result==='flask_muddy'?'השיקוי יצא עכור':'הכין שיקוי חדש';break;case 'seal':message='המיס את החותם החלוד';break;}if(message){pushTicker(i,message);views[i].alert.textContent=message;views[i].alertUntil=simTime+(e.t==='escape'?4:2.3);}}}
function appendLog(i,entry){logEntries[i].push(entry);if(focus===i)renderLog(i,false);}
function renderLog(i,full=true){
  const nearBottom=dom.log.scrollHeight-dom.log.scrollTop-dom.log.clientHeight<120;if(full){dom.log.replaceChildren();views[i].logRendered=0;}
  const fragment=document.createDocumentFragment();for(const entry of logEntries[i].slice(views[i].logRendered)){
    const article=element('article',`log-entry${entry.result.ok?'':' failed'}`),meta=element('div','log-meta');meta.append(element('span','',`צעד ${entry.step}`),element('time','',`${entry.approximate?'≈ ':''}${formatTime(entry.time)}`));article.append(meta,element('p','log-thought',entry.thought||'המתמודד לא הוסיף מחשבה לצעד הזה.'),element('p','log-command',commandText(entry.cmd)),element('span','log-response-label','זו התשובה שהמתמודד קיבל'),element('pre','log-response',entry.result.text));fragment.append(article);
  }dom.log.append(fragment);views[i].logRendered=logEntries[i].length;if(full||nearBottom)dom.log.scrollTop=dom.log.scrollHeight;
}
function setFocus(i){
  if(i===focus)return;const previous=focus;focus=i;document.body.classList.toggle('focused',i>=0);$('focus-panel').hidden=i<0;views.forEach((v,n)=>v.card.classList.toggle('focused-view',i===n));
  if(i>=0){$('focus-name').textContent=players[i].name;$('focus-panel').style.setProperty('--agent',players[i].color);renderLog(i);$('close-focus').focus({preventScroll:true});}else if(previous>=0)views[previous]?.card.focus({preventScroll:true});layoutDirty=true;
}
function setStatus(state){
  if(!['lobby','running','finished'].includes(state))return;
  if(state==='running'&&raceState!=='running'&&raceState!=='finished'&&logEntries.every(l=>!l.length)){startTime=simTime;liveBaseMs=0;liveWallStart=performance.now();}
  if(state==='finished'&&finishTime===null){finishTime=simTime;liveFinishedMs=liveBaseMs+performance.now()-liveWallStart;}
  raceState=state;debug.status=state;
  $('lobby').hidden=state==='running'||(state==='finished'&&game?.finished);
  $('lobby-title').textContent=state==='finished'?'המרוץ הסתיים':'ממתינים לתחילת המרוץ';$('lobby-message').textContent=state==='finished'?'התוצאות נשמרו. ממתינים למרוץ הבא.':'המתמודדים מתכוננים. ארבעה חדרים מחכים להם.';
}
function validatePlayers(input){return (Array.isArray(input)&&input.length?input:fallbackPlayers).slice(0,4).map((p,i)=>({name:typeof p.name==='string'?p.name.slice(0,50):fallbackPlayers[i].name,color:color(p.color,fallbackPlayers[i].color),id:p.id||fallbackPlayers[i].id}));}
async function initialize(data){
  const previous={seed,elapsed:elapsed(),count:logEntries.reduce((sum,entries)=>sum+entries.length,0),approximate:replayApproximate};
  const ticket=++epoch;booting=true;debug.ready=false;$('loading').hidden=false;
  setFocus(-1);for(const world of worlds)world.dispose();worlds=[];disposePropGeometry();
  seed=data.seed??parseSeed(params.get('seed'));players=validatePlayers(data.players);game=new window.EscapeEngine.Game(seed,players.length);defs=definitions();bots=[];logEntries.length=queues.length=nextActions.length=times.length=wrongCodes.length=0;resultsShown=false;$('results').hidden=true;finishTime=null;liveFinishedMs=null;simTime=0;startTime=0;raceState='lobby';replayApproximate=false;
  for(let i=0;i<players.length;i++){logEntries[i]=[];queues[i]=[];nextActions[i]=0;times[i]=null;wrongCodes[i]=0;}
  const replayTime=players.map(()=>0);const replay=Array.isArray(data.log)?data.log:[];
  for(const action of replay){if(!validAction(action))continue;const result=game.act(action.p,action.cmd);const timestamped=Number.isFinite(action.t)&&action.t>=0;replayTime[action.p]=timestamped?action.t:replayTime[action.p]+window.EscapeEngine.durationMs(action.cmd,result);for(const event of result.ev){if(event.t==='code'&&!event.ok)wrongCodes[action.p]++;if(event.t==='escape')times[action.p]=replayTime[action.p];}logEntries[action.p].push({cmd:action.cmd,thought:typeof action.thought==='string'?action.thought:'',result,time:replayTime[action.p],step:logEntries[action.p].length+1,approximate:!timestamped});}
  if(replay.length){simTime=Math.max(...replayTime)/1000;replayApproximate=!game.finished||replay.some(a=>!Number.isFinite(a.t));}
  liveBaseMs=simTime*1000;liveWallStart=performance.now();
  if(mode==='live'&&seed===previous.seed&&previous.count>0&&replay.length>=previous.count)liveBaseMs=Math.max(liveBaseMs,previous.elapsed);
  buildUI();
  // Yield once between worlds so loading remains responsive on integrated GPUs.
  for(let i=0;i<players.length;i++){if(ticket!==epoch)return;const world=new World(renderer,game,i,players[i],environment.texture);world.mode=shot?'room':'auto';worlds.push(world);await renderer.compileAsync(world.scene,world.camera);refreshView(i);const entry=logEntries[i].at(-1);if(entry){views[i].thoughtFull=entry.thought;views[i].thought.textContent=entry.thought;views[i].command.textContent=commandText(entry.cmd);}await new Promise(resolve=>requestAnimationFrame(resolve));}
  if(ticket!==epoch)return;
  if(mode==='demo'){
    if(!window.EscapeMock?.MockBot)throw new Error('קובץ מתמודדי ההדגמה טרם נטען. נסו לרענן בעוד רגע.');
    bots=players.map((p,i)=>({bot:new window.EscapeMock.MockBot(game,i,p.id,seed),rng:window.EscapeEngine.mulberry32(`${seed}:thinking:${i}`),personality:p.id}));
    bots.forEach((b,i)=>{nextActions[i]=simTime+thinking(b)/1000;});
  }
  setStatus(mode==='demo'?'running':typeof data.status==='string'?data.status:data.status?.state|| (replay.length?'running':'lobby'));
  if(game.finished){finishTime=simTime;liveFinishedMs=liveBaseMs;}
  Object.assign(debug,{game,worlds,players,seed,ready:true,logs:logEntries,commandText,focus:setFocus,setCamera:(value)=>{if(validModes.has(value)){worlds.forEach(w=>w.mode=value);views.forEach(v=>v.select.value=value);$('global-camera').value=value;}},get elapsedMs(){return elapsed();}});
  $('loading').hidden=true;layoutDirty=true;booting=false;lastFrame=fpsStart=performance.now();frameCount=0;slowSince=null;qualityRecovery=0;
}
function thinking(entry){
  const supplied=typeof entry.bot.thinkMs==='function'?entry.bot.thinkMs():entry.bot.thinkMs;if(Number.isFinite(supplied)&&supplied>=0)return supplied;
  const [min,max]=({careful:[2500,4000],fast:[1000,2000],chatty:[2000,3500],chaotic:[1000,3000]})[entry.personality]||[2000,3000];return min+(max-min)*entry.rng();
}
function validAction(action){return action&&Number.isInteger(action.p)&&action.p>=0&&action.p<players.length&&action.cmd&&typeof action.cmd.op==='string';}
function receiveAction(action){
  if(!validAction(action))return;
  const {p,cmd}=action;const thought=typeof action.thought==='string'?action.thought:'';const result=game.act(p,cmd);
  const duration=window.EscapeEngine.durationMs(cmd,result);
  const entry={cmd,thought,result,time:elapsed(),step:logEntries[p].length+1,approximate:replayApproximate};appendLog(p,entry);
  for(const event of result.ev){if(event.t==='code'&&!event.ok)wrongCodes[p]++;if(event.t==='escape')times[p]=elapsed();}
  // Capture the state at reception, not the future state at animation completion.
  queues[p].push({cmd,thought,result,duration,state:JSON.parse(JSON.stringify(game.players[p])),objective:game.objective(p),progress:game.progress(p)});
  if(game.finished&&finishTime===null){liveFinishedMs=elapsed();finishTime=simTime;}
  return {result,duration};
}
function startAction(i,action){const view=views[i],world=worlds[i];view.busyUntil=simTime+action.duration/1000;view.thoughtFull=action.thought||'בודק את הרמזים ומתכנן את הצעד הבא.';view.thoughtAt=simTime;view.command.textContent=commandText(action.cmd);view.status.textContent=action.result.ok?'בפעולה':'מנסה דרך אחרת';refreshView(i,action.state,action.objective,action.progress);notable(i,action.result);world.animate(action.cmd,action.result,action.duration,action.state);}
function updateBots(){
  if(mode!=='demo'||raceState!=='running')return;
  bots.forEach((entry,i)=>{if(game.players[i].escaped||simTime<nextActions[i]||queues[i].length||simTime<views[i].busyUntil)return;
    try{const action=entry.bot.next();if(!action?.cmd){nextActions[i]=simTime+2;return;}const feedback=receiveAction({p:i,...action});entry.bot.observe(feedback.result);nextActions[i]=simTime+(feedback.duration+thinking(entry))/1000;}
    catch(error){debug.errors.push(String(error));views[i].status.textContent='המתמודד ממתין';nextActions[i]=Infinity;console.error('Demo contestant failed',i,error);pushTicker(i,'ממתין להמשך הפעולה');}
  });
}
function showResults(){
  if(resultsShown)return;resultsShown=true;const table=$('results-table');table.replaceChildren();const header=element('div','result-row');['מקום','מתמודד','זמן','פיצוצים','קודים שגויים'].forEach(t=>header.append(element('span','',t)));table.append(header);
  const order=game.players.map((p,i)=>({p,i})).sort((a,b)=>(a.p.place||99)-(b.p.place||99));
  for(const {p,i} of order){const row=element('div',`result-row${p.place===1?' winner':''}`);row.style.setProperty('--agent',players[i].color);row.append(element('span','result-rank',['🥇','🥈','🥉','🏁'][p.place-1]),element('span','result-name',players[i].name),element('span','result-time',`${replayApproximate?'≈ ':''}${formatTime(times[i]??elapsed())}`),element('span','',String(p.minefield.strikes)),element('span','',String(wrongCodes[i])));table.append(row);}
  if(replayApproximate)table.append(element('p','', 'הזמנים משוערים: השידור נפתח לאחר תחילת המרוץ.'));
  $('results').hidden=false;$('dismiss-results').focus({preventScroll:true});
}
function measure(){
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight,false);
  views.forEach((view,i)=>{const rect=view.viewport.getBoundingClientRect();view.rect=rect;if(rect.width&&rect.height)worlds[i]?.resize(Math.round(rect.width),Math.round(rect.height),Math.min(devicePixelRatio,1.5)*quality);});layoutDirty=false;
}
function frame(now){
  if(disposed)return;requestAnimationFrame(frame);const realDt=Math.min(.15,Math.max(0,(now-lastFrame)/1000));lastFrame=now;
  if(document.hidden||booting||!debug.ready)return;
  // Demo is paused with a hidden tab; live actions are buffered and retain order.
  simTime+=realDt*speed;
  updateBots();for(let i=0;i<worlds.length;i++){if(queues[i].length&&simTime>=views[i].busyUntil)startAction(i,queues[i].shift());worlds[i].update(simTime,realDt);}
  if(layoutDirty)measure();renderer.info.reset();renderer.setRenderTarget(null);renderer.setScissorTest(false);renderer.setViewport(0,0,innerWidth,innerHeight);renderer.setClearColor('#0b1017');renderer.clear();
  for(let i=0;i<worlds.length;i++){
    const rect=views[i].rect;if((focus>=0&&focus!==i)||!rect||!rect.width||rect.bottom<0||rect.top>innerHeight)continue;
    const texture=worlds[i].render();renderer.setRenderTarget(null);renderer.setViewport(rect.left,innerHeight-rect.bottom,rect.width,rect.height);renderer.setScissor(rect.left,innerHeight-rect.bottom,rect.width,rect.height);renderer.setScissorTest(true);blitMaterial.uniforms.map.value=texture;renderer.render(blitScene,blitCamera);
  }
  renderer.setScissorTest(false);
  if(now-lastUI>50){lastUI=now;dom.clock.textContent=formatTime(elapsed());views.forEach((view,i)=>{const count=reducedMotion?view.thoughtFull.length:Math.floor((simTime-view.thoughtAt)*32);if(view.thoughtFull)view.thought.textContent=view.thoughtFull.slice(0,Math.max(0,count));view.alert.classList.toggle('active',view.alertUntil>simTime);if(simTime>=view.busyUntil&&!game.players[i].escaped)view.status.textContent='חושב על הצעד הבא';});}
  if(game.finished&&worlds.every((w,i)=>!queues[i].length&&simTime>views[i].busyUntil+1))showResults();
  frameCount++;if(now-fpsStart>1500){debug.fps=Math.round(frameCount*1000/(now-fpsStart));debug.drawCalls=renderer.info.render.calls;debug.triangles=renderer.info.render.triangles;debug.queueLengths=queues.map(q=>q.length);debug.elapsedMs=elapsed();frameCount=0;fpsStart=now;
    // Measure visible rendering time, excluding loading and background pauses.
    // Require a sustained <24 fps before sacrificing detail; never go below 75%.
    if(debug.fps<24){qualityRecovery=0;slowSince??=now;if(now-slowSince>=3000&&quality>.75){quality=Math.max(.75,quality-.05);slowSince=now;layoutDirty=true;}}
    else{slowSince=null;if(debug.fps>=50&&quality<1){if(++qualityRecovery>=4){quality=Math.min(1,quality+.05);qualityRecovery=0;layoutDirty=true;}}else qualityRecovery=0;}
    debug.renderScale=quality;
  }
}
function fail(error){console.error(error);debug.errors.push(String(error));debug.ready=false;booting=false;$('loading').hidden=false;$('loading-message').textContent=error.message?.match(/[א-ת]/)?error.message:'לא ניתן להציג את הזירות. בדקו שחיבור האינטרנט והאצת הגרפיקה פעילים ורעננו.';}

// SSE handlers are serialized, including async reset construction. Reconnection
// init is authoritative: discard the old worlds, logs, effects and action queues.
let incoming=Promise.resolve();
function enqueue(fn){incoming=incoming.then(fn).catch(fail);}
function connect(){
  $('lobby').hidden=false;source=new EventSource('/api/events');
  source.addEventListener('open',()=>{$('connection').hidden=true;});source.addEventListener('error',()=>{$('connection').hidden=false;});
  source.addEventListener('init',event=>enqueue(async()=>{const data=JSON.parse(event.data);$('connection').hidden=true;await initialize(data);}));
  source.addEventListener('action',event=>enqueue(()=>{if(game)receiveAction(JSON.parse(event.data));}));
  source.addEventListener('status',event=>enqueue(()=>{const data=JSON.parse(event.data);setStatus(data.state);}));
}
const mixedCamera=element('option','','מצבים שונים');mixedCamera.value='mixed';mixedCamera.disabled=true;$('global-camera').append(mixedCamera);
$('global-camera').addEventListener('change',e=>{if(!validModes.has(e.target.value))return;worlds.forEach(w=>w.mode=e.target.value);views.forEach(v=>v.select.value=e.target.value);});
$('close-focus').addEventListener('click',()=>setFocus(-1));
$('dismiss-results').addEventListener('click',()=>{$('results').hidden=true;if(views[0])views[0].card.focus({preventScroll:true});});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!$('results').hidden)$('results').hidden=true;else setFocus(-1);}});
window.addEventListener('resize',()=>layoutDirty=true);window.addEventListener('scroll',()=>layoutDirty=true,{passive:true});
const resizeObserver=new ResizeObserver(()=>layoutDirty=true);resizeObserver.observe(dom.views);
document.addEventListener('visibilitychange',()=>{lastFrame=fpsStart=performance.now();frameCount=0;slowSince=null;qualityRecovery=0;layoutDirty=true;});
renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();fail(new Error('החיבור לכרטיס הגרפי אבד. רעננו כדי לחזור לשידור.'));});
function dispose(){if(disposed)return;disposed=true;epoch++;source?.close();resizeObserver.disconnect();worlds.forEach(w=>w.dispose());disposePropGeometry();disposeAssets();blitQuad.geometry.dispose();blitMaterial.dispose();environment.dispose();renderer.dispose();debug.ready=false;}
window.addEventListener('pagehide',dispose);debug.dispose=dispose;
// Wait for Hebrew glyph metrics before drawing the robot name sprites.
async function boot(){await Promise.race([document.fonts.ready,new Promise(resolve=>setTimeout(resolve,1800))]);if(mode==='live')connect();else await initialize({seed:parseSeed(params.get('seed')),players:window.EscapeMock?.MockBot?.PERSONALITIES||fallbackPlayers,status:'running'});}
requestAnimationFrame(frame);boot().catch(fail);
