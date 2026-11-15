import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { mesh, group, dynamic, compact, instances, makeProp, makeRobot, flame, plaque } from './props.js';
import { material, textured, tileMap, palette, glowMap, backdropMap, random } from './textures.js';

export const ROOMS=['lab','storage','minefield','vault'];
export const OFFSETS=Object.fromEntries(ROOMS.map((r,i)=>[r,i*14]));
const themes={
  lab:{stone:'#b2a18b',edge:'#604531',floor:'wood',key:'#ffd1a0',fill:'#8dffc3',fog:'#324c45',accent:'#ecb96c'},
  storage:{stone:'#b3bac7',edge:'#465366',floor:'concrete',key:'#dceaff',fill:'#ffe080',fog:'#354351',accent:'#f1cd61'},
  minefield:{stone:'#a1938a',edge:'#4b3f40',floor:'stone',key:'#ffd2b0',fill:'#ff7144',fog:'#4e3330',accent:'#efae78'},
  vault:{stone:'#a8b8d8',edge:'#415b75',floor:'metal',key:'#bad8ff',fill:'#ffc75c',fog:'#2a405a',accent:'#f0c66b'},
};
const ease=t=>t<.5?2*t*t:1-(-2*t+2)**2/2;
const v=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const clamp=THREE.MathUtils.clamp;

function architecture(id,name){
  const room=group(null,[OFFSETS[id],0,0]);const t=themes[id];room.name=id;
  const stone=textured(id==='vault'?'metal':'stone',t.stone);const edge=material(`edge-${id}`,t.edge);
  mesh(room,'box',edge,[0,-.35,0],[10.6,.65,10.6]);mesh(room,'box',textured(t.floor),[0,-.035,0],[10,.08,10]);
  // Rooms connect along X. Both side walls have doorway openings at z=0;
  // the +Z camera side is a low cutaway, without foreground posts or lintels.
  mesh(room,'box',stone,[0,1.65,-5],[10,3.3,.28]);
  for(const x of [-5,5]){
    mesh(room,'box',stone,[x,1.65,-3.4],[.28,3.3,3.2]);
    mesh(room,'box',edge,[x,.12,3.4],[.16,.24,3.2]);
    mesh(room,'box',edge,[x,3.38,-3.4],[.43,.18,3.2]);
    mesh(room,'box',edge,[x,1.65,-4.85],[.36,3.4,.36]);
  }
  mesh(room,'box',edge,[0,.1,5],[10,.2,.18]);mesh(room,'box',edge,[0,.15,-4.8],[10,.3,.18]);
  mesh(room,'box',edge,[0,3.38,-5],[10.4,.18,.43]);
  // The upper half of the set suggests a ceiling without adding camera-facing walls.
  for(const z of [-4.8,-2.7])mesh(room,'box',edge,[0,3.48,z],[10.2,.21,.19]);
  for(const x of [-3.2,2.8])mesh(room,'box',edge,[x,3.48,-3.8],[.16,.23,2.6]);
  if(id!=='storage'){
    const lamp=group(room,[-.6,3.12,-3.6]);mesh(lamp,'cylinder',edge,[0,.25,0],[.025,.65,.025]);mesh(lamp,'cone',material('hanging-shade','#1f2e3a',{metalness:.65,roughness:.35}),[0,0,0],[.42,.23,.42]);mesh(lamp,'cylinder',material('hanging-bulb',t.accent,{emissive:t.accent,emissiveIntensity:2}),[0,-.12,0],[.3,.03,.3]);
  }
  // Finely spaced floor joints improve the sense of scale even at broadcast size.
  if(id==='storage'||id==='vault')for(let x=-4;x<=4;x+=2)mesh(room,'box',edge,[x,.012,0],[.022,.012,10]);
  if(id==='storage'||id==='vault')for(let z=-4;z<=4;z+=2)mesh(room,'box',edge,[0,.014,z],[10,.012,.022]);
  const title=plaque(room,name,[0,-.32,5.32],3.4,.32,{size:44,fg:t.accent,bg:'#17212a'});title.rotation.x=-.25;
  if(id==='lab'){
    // Wooden beams, a stone hearth, potion shelving and hanging brass ornaments.
    for(const x of [-4.7,-1.8,1.8,4.7])mesh(room,'box',textured('wood','#695243'),[x,1.65,-4.78],[.15,3.3,.18]);
    mesh(room,'box',textured('wood'),[-4.55,.7,-.3],[.7,.12,6.7]);
    for(let i=0;i<3;i++){mesh(room,'torus',material('brass','#b99655',{metalness:.7}),[-4.7,2.5,-4.3+i*.9],[.15,.15,.15],[0,Math.PI/2,0]);}
  } else if(id==='storage'){
    mesh(room,'box',edge,[-4.75,1.7,-4],[.15,3.4,.15]);
    const lamp=group(room,[0,3.7,0]);mesh(lamp,'cylinder',edge,[0,.4,0],[.02,.8,.02]);mesh(lamp,'cone',material('lamp','#405459',{metalness:.6}),[0,0,0],[.7,.4,.7]);mesh(lamp,'cylinder',material('lamp-glow','#ffdc9a',{emissive:'#ffdc9a',emissiveIntensity:2}),[0,-.2,0],[.53,.025,.53]);
    for(let i=0;i<3;i++){mesh(room,'box',textured('wood'),[-1.7+i*.4,.1,3.8],[.28,.2,1.5]);}
  } else if(id==='minefield'){
    for(const x of [-4.5,4.5]){mesh(room,'cylinder',stone,[x,1.45,-4.4],[.25,2.9,.25]);mesh(room,'box',stone,[x,2.9,-4.4],[.7,.25,.7]);}
    for(const z of [-2.5,2.5]){mesh(room,'cylinder',edge,[-4.65,1.7,z],[.065,.65,.065],[0,0,-.25]);flame(room,[-4.55,2.15,z],.33);}
  } else {
    for(const x of [-4.6,4.6]){mesh(room,'box',material('vault-brass','#b59660',{metalness:.65}),[x,.045,0],[.05,.03,9.3]);}
    for(const z of [-4.6,4.6])mesh(room,'box',material('vault-brass','#b59660',{metalness:.65}),[0,.045,z],[9.3,.03,.05]);
    for(const x of [-3.4,3.4]){mesh(room,'cylinder',material('vault-brass','#b59660',{metalness:.65}),[x,1.6,-4.65],[.08,3.2,.08]);mesh(room,'sphere',material('sconce','#ffe0a5',{emissive:'#ffe0a5',emissiveIntensity:1}),[x,2.3,-4.45],[.18,.32,.18]);}
  }
  dressing(room,id);
  compact(room,`architecture:${id}`);return room;
}

function dressing(room,id){
  const wood=textured('wood'),iron=material('dressing-iron','#4a5756',{metalness:.55}),cloth=textured('cloth','#c4ad85');
  // Edge clutter leaves the robot's route and the entire 7 × 9 board unobstructed.
  const spots=id==='minefield'?[[-4.4,2.5],[4.4,1.2]]:id==='lab'?[[-3.5,-4.2],[3.8,2.15]]:id==='storage'?[[-2.3,-4.15],[3.7,3.8]]:[[-4.2,-4.1],[1.8,3.8]];
  for(const [x,z] of spots){
    for(let j=0;j<3;j++){mesh(room,'rounded',cloth,[x+(j%2)*.35,.23+Math.floor(j/2)*.4,z],[.48,.43,.62],[0,j*.3,0]);mesh(room,'torus',wood,[x+(j%2)*.35,.45+Math.floor(j/2)*.4,z],[.07,.07,.07],[Math.PI/2,0,0]);}
  }
  if(id!=='minefield'){
    const x=id==='lab'?-2.8:id==='storage'?.2:-1.1,z=-4.35;
    for(let j=0;j<3;j++){mesh(room,'box',wood,[x+j*.55,.25,z],[.5,.5,.7]);for(const dx of [-.18,.18])mesh(room,'box',iron,[x+j*.55+dx,.25,z+.36],[.055,.5,.025]);}
    mesh(room,'box',wood,[x+.35,.75,z],[.62,.5,.65],[0,.13,0]);
    // A separate upper shelf of noninteractive old volumes and sealed bottles.
    mesh(room,'box',wood,[-3,2.75,-4.65],[2.7,.1,.6]);
    const books=Array.from({length:9},(_,i)=>({pos:[-4.12+i*.16,3.02,-4.56],scale:[.12,.43+(i%3)*.045,.32],rot:[0,0,i===7?.12:0]}));
    instances(room,'box',material('old-book-spines',id==='vault'?'#647f84':'#91704f'),books);
    const bottles=Array.from({length:6},(_,i)=>({pos:[-2.57+i*.2,2.97,-4.56],scale:[.065,.19,.065]}));
    instances(room,'cylinder',material('sealed-bottles','#748c70',{roughness:.35,metalness:.2}),bottles);
    instances(room,'cylinder',wood,bottles.map(b=>({pos:[b.pos[0],3.1,b.pos[2]],scale:[.035,.1,.035]})));
  }
  if(id==='lab'||id==='vault'){
    const chair=group(room,[1.65,0,id==='lab'?2.1:2.7]);chair.rotation.y=-.55;
    mesh(chair,'box',wood,[0,.65,0],[.65,.12,.65]);for(const x of [-.25,.25])for(const z of [-.25,.25])mesh(chair,'box',wood,[x,.32,z],[.08,.65,.08]);
    for(const x of [-.26,.26])mesh(chair,'box',wood,[x,1,-.27],[.07,.75,.07]);mesh(chair,'box',id==='vault'?material('chair-velvet','#566d66'):wood,[0,1.16,-.27],[.6,.35,.09]);
  }
  // Plumbing, cable clips and cobwebs fill the upper walls without extra lights.
  for(const y of [.45,3.04]){mesh(room,'cylinder',iron,[1.5,y,-4.77],[.045,5.8,.045],[0,0,Math.PI/2]);for(const x of [-1,1.5,4])mesh(room,'box',iron,[x,y,-4.74],[.09,.15,.07]);}
  if(id==='lab')for(let i=0;i<6;i++){
    const x=-3.6+i*.27;mesh(room,'cylinder',wood,[x,2.95,-3.8],[.012,.5,.012]);
    for(let j=0;j<3;j++)mesh(room,'sphere',material('hanging-herbs','#7b8050'),[x+(j-1)*.05,2.55,-3.8],[.055,.23,.05],[0,0,(j-1)*.3]);
  }
  const web=material('cobweb','#d8d1b6',{transparent:true,opacity:.23,side:THREE.DoubleSide,depthWrite:false});
  for(const side of [-1,1]){
    const corner=group(room,[side*4.75,3.25,-4.73]);
    for(let i=0;i<6;i++){const a=i*Math.PI/10;mesh(corner,'cylinder',web,[-side*Math.cos(a)*.5,-Math.sin(a)*.5,0],[.008,1,.008],[0,0,-side*(Math.PI/2-a)]);}
    for(const s of [.3,.6,.9])for(let j=0;j<5;j++){
      const a=j*Math.PI/10,b=(j+1)*Math.PI/10,x1=-side*Math.cos(a)*s,y1=-Math.sin(a)*s,x2=-side*Math.cos(b)*s,y2=-Math.sin(b)*s;
      mesh(corner,'cylinder',web,[(x1+x2)/2,(y1+y2)/2,0],[.005,Math.hypot(x2-x1,y2-y1),.005],[0,0,-Math.atan2(x2-x1,y2-y1)]);
    }
  }
}

export class World {
  constructor(renderer,game,index,player,environment){
    this.renderer=renderer;this.game=game;this.index=index;this.player=player;this.solution=game.solution();this.mode='auto';this.currentRoom='lab';this.now=0;this.tweens=[];this.scheduled=[];this.particles=[];this.flames=[];this.props=new Map();this.rooms=new Map();this.tiles=[];this.action=null;this.heldId=null;this.activeUntil=0;this.interestingUntil=0;this.shakeUntil=0;this.lastCameraCut=-1;this.eventCount=0;
    this.scene=new THREE.Scene();this.scene.background=backdropMap(themes.lab.fog);this.scene.environment=environment;this.scene.environmentIntensity=.18;this.scene.fog=new THREE.Fog(themes.lab.fog,23,65);this.directorTime=0;
    this.camera=new THREE.PerspectiveCamera(39,1,.1,140);this.camera.position.set(11,12,14);this.look=v(0,.65,0);this.camera.lookAt(this.look);
    this.scene.add(new THREE.HemisphereLight('#c8e1ff','#574334',.85));
    this.key=new THREE.DirectionalLight('#ffdab0',2.8);this.key.position.set(1,9,3);this.key.castShadow=true;this.key.shadow.mapSize.set(1024,1024);Object.assign(this.key.shadow.camera,{left:-7,right:7,top:7,bottom:-7,near:.5,far:24});this.key.shadow.normalBias=.04;this.key.shadow.bias=-.00025;this.key.shadow.radius=2;this.scene.add(this.key,this.key.target);
    this.warm=new THREE.PointLight('#ffab54',18,13,2);this.fill=new THREE.PointLight('#7fa8cc',12,15,2);this.scene.add(this.warm,this.fill);
    this.spot=new THREE.SpotLight('#fff0be',0,25,.5,.65,1.6);this.spot.position.set(OFFSETS.vault,7,3);this.spot.target.position.set(OFFSETS.vault,0,3);this.scene.add(this.spot,this.spot.target);
    for(const roomId of ROOMS){const room=architecture(roomId,game.rooms[roomId].name);this.scene.add(room);this.rooms.set(roomId,room);
      for(const def of game.rooms[roomId].objects){
        const prop=makeProp(def,this.solution,roomId);room.add(prop);this.props.set(`${roomId}:${def.id}`,prop);
        const doorway=game.rooms[roomId].doors.find(d=>d.id===def.id);
        if(doorway){const side=ROOMS.indexOf(doorway.to)>ROOMS.indexOf(roomId)||doorway.to==='exit'?1:-1;prop.position.set(side*5,0,0);prop.rotation.y=-side*Math.PI/2;prop.userData.visualTarget=true;prop.userData.doorSide=side;}
        // These controls belong to the relocated doorway, including interaction.
        if(def.id==='gate_sign'){prop.position.set(4.7,0,2.1);prop.rotation.y=-Math.PI/4;prop.userData.visualTarget=true;prop.userData.doorSide=1;}
      }
      this.attachContents(roomId);
    }
    // A dropped portable item can live in any room. It has its own root per world.
    this.dropped=group(this.scene);this.portables=new Map();
    const board=this.rooms.get('minefield'),tileBase=mesh(board,'tile',material('tile-stone-edge','#65605a',{roughness:.9}));
    const stones=new THREE.InstancedMesh(tileBase.geometry,tileBase.material,63),transform=new THREE.Object3D();tileBase.removeFromParent();stones.castShadow=true;stones.receiveShadow=true;board.add(stones);
    for(let row=0;row<9;row++){this.tiles[row]=[];for(let col=0;col<7;col++){
      const tile=group(board,[col-3,.12,row-4]);transform.position.copy(tile.position);transform.scale.set(.96,.23,.96);transform.updateMatrix();stones.setMatrixAt(row*7+col,transform.matrix);
      const face=mesh(tile,'plane',material('unknown-tile','#ffffff',{map:tileMap('unknown'),roughness:.95}),[0,.12,0],[.9,.9,1],[-Math.PI/2,0,0]);
      tile.userData.face=face;tile.userData.seen=false;this.tiles[row][col]=tile;
    }}
    this.robot=makeRobot(player.name,player.color);this.scene.add(this.robot);this.body=this.robot.getObjectByName('robot-body');this.scan=this.robot.getObjectByName('scan');this.slot=this.robot.getObjectByName('held-slot');
    const dustGeo=new THREE.BufferGeometry(),dustPositions=new Float32Array(90*3),rng=random(190+index);this.dustSeeds=[];
    for(let i=0;i<90;i++){const p=[(rng()-.5)*9,.3+rng()*3.1,(rng()-.5)*9];this.dustSeeds.push(p);dustPositions.set(p,i*3);}dustGeo.setAttribute('position',new THREE.BufferAttribute(dustPositions,3));
    this.dust=new THREE.Points(dustGeo,new THREE.PointsMaterial({color:'#ffe4b8',map:glowMap(),size:.038,transparent:true,opacity:.43,depthWrite:false,blending:THREE.AdditiveBlending}));this.dust.userData.transient=true;this.scene.add(this.dust);
    for(const id of ROOMS){const beam=mesh(this.rooms.get(id),'cone',material('light-shaft',themes[id].accent,{transparent:true,opacity:.025,emissive:themes[id].accent,emissiveIntensity:.5,depthWrite:false,side:THREE.DoubleSide}),id==='storage'?[0,1.6,0]:[-.6,1.6,-3.6],[1.05,2.85,1.05]);beam.castShadow=false;beam.receiveShadow=false;}
    this.scene.traverse(o=>{if(o.userData.flame)this.flames.push(o);});
    this.composer=new EffectComposer(renderer);this.composer.renderToScreen=false;this.composer.addPass(new RenderPass(this.scene,this.camera));this.bloom=new UnrealBloomPass(new THREE.Vector2(400,300),.2,.4,1.3);this.composer.addPass(this.bloom);this.output=new OutputPass();this.composer.addPass(this.output);this.antialias=new ShaderPass(FXAAShader);this.composer.addPass(this.antialias);
    this.sync(true);this.setRoom(game.players[index].room,true);
  }
  prop(id,room=this.currentRoom){return this.props.get(`${room}:${id}`);}
  attachContents(room){
    const definitions=this.game.rooms[room].objects;
    for(const def of definitions){if(!def.parent)continue;
      const parent=this.prop(def.parent,room),prop=this.prop(def.id,room),siblings=definitions.filter(d=>d.parent===def.parent),i=siblings.indexOf(def),kind=parent.userData.definition.kind;
      const anchor=parent.userData.slide||parent;anchor.add(prop);prop.position.set(0,0,0);prop.rotation.set(0,0,0);
      if(def.parent==='tarp'){prop.position.set(def.kind==='crate'?def.x-parent.userData.definition.x:1.15,0,def.kind==='crate'?def.z-parent.userData.definition.z:1.9);}
      else if(def.parent==='rug')prop.position.set(0,0,0);
      else if(def.parent==='vault_door')prop.position.set(def.id==='keypad'?-1:1,0,.15);
      else if(kind==='cabinet'){const count=def.parent==='potion_cabinet'?4:3;prop.position.set((i%count-(count-1)/2)*.36,parent.userData.shelves[Math.floor(i/count)%2],.12);}
      else if(kind==='shelf')prop.position.set((i%3-1)*.49,.27+Math.floor(i/3)*.75,.08);
      else if(kind==='desk'){if(def.kind!=='drawer')prop.position.set(def.id==='globe'?-.55:def.id==='candles'?.58:0,1.15,-.05);}
      else if(kind==='drawer')prop.position.set((i%3-1)*.36,.08,-.12+Math.floor(i/3)*.22);
      else if(kind==='board'){prop.position.set((i%3-1)*.57,1.48+Math.floor(i/3)*.65,.145+i*.006);prop.rotation.set(Math.PI/2,0,(i-2)*.08);}
      else if(kind==='chest'||kind==='toolbox')prop.position.set((i-(siblings.length-1)/2)*.4,def.parent==='satchel'?.1:.38,.07);
      else if(def.parent==='cauldron')prop.position.set(.74,.1,.38);
      else if(def.parent==='sink')prop.position.set(.44,1.24,.08);
      else if(def.parent==='coat_rack')prop.position.set(.12,1.3,.12);
      else if(def.parent==='umbrella_stand')prop.position.set(0,.6,0);
      else if(def.parent==='stone_bench')prop.position.set(0,.1,.15);
      else prop.position.set((i-(siblings.length-1)/2)*.3,kind==='armor'?.9:kind==='rack'?.45:.16,.2);
    }
  }
  position(room,x,z,y=0){return v(OFFSETS[room]+x,y,z);}
  movePosition(room,x,z){
    // Engine coordinates remain authoritative except for relocated door props.
    const prop=[...this.props.values()].find(p=>p.parent===this.rooms.get(room)&&p.userData.visualTarget&&Math.abs(p.userData.definition.x-x)<.01&&Math.abs(p.userData.definition.z-z)<.01);
    if(prop)return prop.getWorldPosition(v()).add(v(-prop.userData.doorSide*.95,0,0));
    // Stand beside the dial when reading it; do not put the robot inside it.
    const clock=this.game.rooms[room].objects.find(p=>p.kind==='clock'&&Math.abs(p.x-x)<.01&&Math.abs(p.z-z)<.01);
    if(clock)return this.position(room,x+1.1,z+.9);
    const furniture=this.game.rooms[room].objects.find(p=>!p.parent&&['cabinet','shelf','board','desk'].includes(p.kind)&&Math.abs(p.x-x)<.01&&Math.abs(p.z-z)<.01);
    if(furniture)return this.position(room,x+(x<0?1.25:-1.25),z+.65);
    // Engine room-entry coordinates are on Z; enter through the matching X door.
    if(room!=='minefield'&&x===0&&Math.abs(z)===4){const entry=this.game.rooms[room].doors.find(d=>Math.sign(d.z)===Math.sign(z)),door=entry&&this.prop(entry.id,room);if(door)return door.getWorldPosition(v()).add(v(-door.userData.doorSide*.95,0,0));}
    return this.position(room,x,z);
  }
  tween(duration,update,done){this.tweens.push({start:this.now,duration:Math.max(.01,duration),update,done});}
  later(delay,fn){this.scheduled.push({at:this.now+delay,fn});}
  setRoom(room,instant=false){
    if(!this.rooms.has(room))return;this.currentRoom=room;const offset=OFFSETS[room],t=themes[room];this.scene.background=backdropMap(t.fog);this.scene.fog.color.set(t.fog);if(this.dust){this.dust.position.x=offset;this.dust.material.color.set(t.accent);}
    this.key.color.set(t.key);this.key.position.set(offset+1,9,2);this.key.target.position.set(offset,0,0);this.warm.color.set(room==='minefield'?'#ff963a':t.key);this.warm.position.set(offset-3,2.7,-1.2);this.fill.color.set(t.fill);this.fill.position.set(offset+4,3,1);
    if(instant){this.cameraSnap=true;this.interestingUntil=0;this.eventHoldUntil=0;this.interaction=null;}
  }
  resize(width,height,pixelRatio){this.width=width;this.height=height;this.camera.aspect=width/height;this.camera.updateProjectionMatrix();this.composer.setPixelRatio(pixelRatio);this.composer.setSize(width,height);this.antialias.uniforms.resolution.value.set(1/(width*pixelRatio),1/(height*pixelRatio));this.cameraSnap=true;}
  tile(row,col,n,animate=true){const tile=this.tiles[row]?.[col];if(!tile)return;tile.userData.seen=true;tile.userData.face.material=material(`tile-face-${n}`,'#ffffff',{map:tileMap(n),emissive:'#ffffff',emissiveMap:tileMap(n),emissiveIntensity:.12,roughness:.85});if(animate)this.tween(.55,t=>{tile.position.y=.12+Math.sin(t*Math.PI)*.18;});}
  sync(instant=false,snapshot=null){
    const state=snapshot||this.game.players[this.index];
    if(instant){this.robot.position.copy(this.movePosition(state.room,state.pos.x,state.pos.z));this.setRoom(state.room,true);}
    for(const [key,prop] of this.props){const def=prop.userData.definition;const room=key.split(':')[0];
      let visible=!def.hidden||state.discovered.includes(def.id);
      if(state.inventory.includes(def.id)||state.scale.includes(def.id))visible=false;
      if(Object.hasOwn(state.itemLocations,def.id))visible=false;
      prop.visible=visible;
      const weight=prop.getObjectByName('weight-label');if(weight)weight.visible=state.read.includes(def.id);
      if(instant&&state.doors[def.id])this.openDoor(prop,def.id,false);
      if(instant&&def.id==='rust_seal')prop.getObjectByName('seal').visible=!state.locks.seal;
      if(instant&&!def.stuck&&(def.id==='cabinet'?state.cabinetOpen:state.read.includes(def.id)))this.openContainer(prop,false);
    }
    // Locate placed/dropped items independently of their original room.
    const placed=new Map();for(const [id,loc] of Object.entries(state.itemLocations)){if(loc)placed.set(id,{...loc,scale:.7});}
    state.scale.forEach((id,j)=>placed.set(id,{room:'storage',x:2.8+(j%2-.5)*.7,z:2.6+Math.floor(j/2)*.6,y:.38,scale:.58}));
    for(const [id,object] of this.portables){object.visible=placed.has(id);object.userData.present=placed.has(id);}
    for(const [id,loc] of placed){let object=this.portables.get(id);if(!object){const def=this.definition(id);if(!def)continue;object=makeProp({...def,x:0,z:0},this.solution,'portable');this.dropped.add(object);this.portables.set(id,object);}object.visible=true;object.userData.present=true;object.userData.room=loc.room;object.position.copy(this.position(loc.room,loc.x,loc.z,loc.y||.05));object.scale.setScalar(loc.scale);}
    this.updateLiquid(state.cauldron,instant);
    if(instant){const f=state.minefield;for(let r=0;r<9;r++)for(let c=0;c<7;c++){if(f.exploded[r][c])this.tile(r,c,'mine',false);else if(f.revealed[r][c]){let n=0;for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++)if((dr||dc)&&this.solution.mines[r+dr]?.[c+dc])n++;this.tile(r,c,n,false);}}
      this.setScale(state.scale.reduce((s,id)=>s+(id==='sand_sack'?9:this.solution.crateWeights[id]||0),0),false);const screen=this.prop('keypad','vault').getObjectByName('key-screen');screen.material.color.set(state.locks.keypad?'#63f6b0':'#70e8c9');this.spot.intensity=state.escaped?50:0;
    }
    this.hold(state.carrying||state.inventory.at(-1)||null);
  }
  definition(id){return this.game.items[id]||ROOMS.flatMap(r=>this.game.rooms[r].objects).find(o=>o.id===id);}
  hold(id){if(id===this.heldId)return;this.slot.clear();this.heldId=id;if(!id)return;const def=this.definition(id);if(!def)return;const held=makeProp({...def,x:0,z:0,hidden:false},this.solution,'held');held.visible=true;held.scale.setScalar(def.kind==='crate'?.45:.32);held.position.y=def.kind==='bottle'?-.35:0;this.slot.add(held);}
  updateLiquid(mix,instant=false){const liquid=this.prop('cauldron','lab').getObjectByName('liquid');const total=Object.values(mix).reduce((a,b)=>a+b,0);let color='#3c6d65';if(mix.black)color=palette.brown;else if(mix.red&&mix.yellow&&mix.blue)color=palette.brown;else if(mix.red&&mix.yellow)color=palette.orange;else if(mix.blue&&mix.yellow)color=palette.green;else if(mix.red&&mix.blue)color=palette.purple;else if(mix.red)color=palette.red;else if(mix.yellow)color=palette.yellow;else if(mix.blue)color=palette.blue;
    const target=new THREE.Color(color),from=liquid.material.color.clone();const change=t=>{liquid.material.color.copy(from).lerp(target,t);liquid.material.emissive.copy(liquid.material.color);liquid.material.emissiveIntensity=total?.32:.08;};if(instant)change(1);else this.tween(.65,change);
  }
  openDoor(prop,id,animate=true){if(!prop)return;const leaf=prop.getObjectByName('door-leaf');if(!leaf)return;const ice=prop.getObjectByName('ice');const fn=t=>{if(id==='gate'){leaf.position.y=t*3.2;leaf.visible=t<.995;}else if(id==='ice_door'){
    ice.scale.set(1-t*.1,Math.max(.001,1-t),1-t*.4);leaf.visible=t<.995;
    const puddle=prop.getObjectByName('melt-puddle');puddle.visible=t>0;puddle.scale.set(1.25*(.3+t),.025,.65*(.3+t));
    for(let i=0;i<5;i++){const drip=prop.getObjectByName(`ice-drip-${i}`);drip.visible=t>0&&t<.96;drip.position.y=((1-t*3+i*.17)%1+1)%1*2.6*(1-t);}
  }else leaf.rotation.y=t*(id==='vault_door'?1.45:1.5);};if(animate){this.tween(2,fn);if(ice){for(let i=0;i<4;i++)this.later(i*.38,()=>this.burst(prop.getWorldPosition(v()).add(v(0,.5+i*.2,.15)),'steam',14));}}else fn(1);}
  openContainer(prop,animate=true){
    if(!prop||prop.userData.definition.stuck)return;
    const data=prop.userData,start=data.openAmount||0;if(start===1)return;
    const update=t=>{const a=THREE.MathUtils.lerp(start,1,ease(t));data.openAmount=a;
      for(const part of data.openParts||[])part.node.rotation[part.axis]=part.to*a;
      if(data.slide)data.slide.position.z=.65*a;
      if(data.curtain){data.curtain.scale.x=1.6*(1-a*.93);data.curtain.position.x=-.75*a;}
      if(data.cover){data.cover.position.set(-.5*a,.87*a+Math.sin(a*Math.PI)*.6,-2.1*a);data.cover.rotation.z=-.35*a;data.cover.scale.set(1-a*.15,1-a*.8,1-a*.88);}
    };
    if(animate)this.tween(.85,update);else update(1);
  }
  setScale(kg,animate=true){const needle=this.prop('scale','storage').getObjectByName('needle');const start=needle.rotation.z,target=2.2-clamp(kg/50,0,1)*4.4;if(animate)this.tween(1.15,t=>{needle.rotation.z=THREE.MathUtils.lerp(start,target,t)+Math.sin(t*4*Math.PI)*(1-t)*.1;});else needle.rotation.z=target;}
  // Move segments follow the exact event path (including the path back to start
  // after an explosion). All timing is expressed in the viewer's simulation clock.
  animate(cmd,result,duration,snapshot=null){
    const seconds=duration/1000;this.activeUntil=this.now+seconds;this.action={cmd,start:this.now,end:this.activeUntil};this.eventCount+=result.ev.length;
    const target=this.prop(cmd.target|| (cmd.op==='enter_code'?'keypad':cmd.op==='go'?this.game.rooms[this.currentRoom].doors.find(d=>d.to===cmd.room)?.id:cmd.item));this.interaction=target?target.getWorldPosition(v()).add(v(0,1.1,0)):null;
    const events=result.ev;const moves=events.filter(e=>e.t==='move');let moveIndex=0;
    const hasBoom=events.some(e=>e.t==='boom');const walkBudget=seconds*(hasBoom?.43:.56);const moveDuration=moves.length?walkBudget/moves.length:0;
    let cursor=0;for(const event of events){
      if(event.t==='move'){
        const delay=cursor;const thisMove=moveIndex++;cursor+=moveDuration;
        this.later(delay,()=>{
          if(event.room!==this.currentRoom)this.setRoom(event.room,true);
          const from=this.robot.position.clone();let to=this.movePosition(event.room,event.x,event.z);
          const mapped=to.x!==OFFSETS[event.room]+event.x||to.z!==event.z;
          // Stop just short of furniture while preserving true tile coordinates.
          if(!mapped&&event.room!=='minefield'&&cmd.op!=='go'){const direction=from.clone().sub(to);direction.y=0;if(direction.length()>.3)to.add(direction.normalize().multiplyScalar(.85));}
          if(cmd.op==='go'&&event.room===cmd.room&&event.room!=='minefield')to.copy(this.robot.position);
          if(Math.abs(from.x-to.x)>10)from.copy(to);
          const path=[from];
          // The mine board keeps its exact engine coordinates. Connect its safe
          // endpoints to side doors via the outer apron, never across hidden tiles.
          if(event.room==='minefield'&&mapped){const edge=Math.sign(event.z)*4.7;path.push(v(from.x,0,edge),v(to.x,0,edge));}
          else if(event.room==='minefield'&&cmd.op==='go'&&event.room===cmd.room){const edge=Math.sign(event.z)*4.7;path.push(v(from.x,0,edge),v(to.x,0,edge));}
          path.push(to);const lengths=path.slice(1).map((p,i)=>p.distanceTo(path[i])),total=lengths.reduce((sum,n)=>sum+n,0);
          const direction=path[1].clone().sub(from);if(direction.length()>.1)this.turnTo(Math.atan2(direction.x,direction.z));
          this.walkUntil=this.now+moveDuration;this.tween(Math.max(.06,moveDuration),t=>{let travel=ease(t)*total,segment=0;while(segment<lengths.length-1&&travel>lengths[segment])travel-=lengths[segment++];this.robot.position.lerpVectors(path[segment],path[segment+1],lengths[segment]?clamp(travel/lengths[segment],0,1):1);if(segment>0){const facing=path[segment+1].clone().sub(path[segment]);this.robot.rotation.y=Math.atan2(facing.x,facing.z);}if(hasBoom&&thisMove===moves.length-1){this.robot.position.y=Math.sin(t*Math.PI)*1.5;this.body.rotation.z=Math.sin(t*Math.PI)*1.8;}});
        });
      } else if(event.t==='go') {this.later(cursor,()=>{this.setRoom(event.to,true);const door=this.prop(event.door,event.to);if(door)this.robot.position.copy(door.getWorldPosition(v()).add(v(-door.userData.doorSide*.95,0,0)));});}
      else if(event.t==='boom'){
        this.later(cursor,()=>this.event(event));cursor+=seconds*.27;
      } else {
        this.later(Math.min(seconds*.82,cursor),()=>this.event(event));
      }
    }
    this.later(Math.max(seconds,cursor),()=>this.sync(false,snapshot));
  }
  turnTo(angle){const start=this.robot.rotation.y;let delta=angle-start;delta=Math.atan2(Math.sin(delta),Math.cos(delta));this.tween(.25,t=>{this.robot.rotation.y=start+delta*t;});}
  event(e){
    const prop=this.prop(e.obj,e.room);const pos=prop?prop.getWorldPosition(v()).add(v(0,1,0)):this.position(e.room,e.x||0,e.z||0,1);
    if(['pour','brew','door','boom','code','escape'].includes(e.t))this.eventHoldUntil=this.directorTime+(e.t==='escape'?4:2.8);
    switch(e.t){
      case 'inspect':this.inspectUntil=this.now+.7;if(prop){this.turnTo(Math.atan2(pos.x-this.robot.position.x,pos.z-this.robot.position.z));if(e.obj!=='cabinet')this.openContainer(prop);}break;
      case 'reveal':if(prop){prop.visible=true;const scale=prop.userData.restScale;this.tween(.55,t=>prop.scale.copy(scale).multiplyScalar(Math.max(.01,t+Math.sin(t*Math.PI)*.16)));this.burst(pos,'spark',5);}break;
      case 'take': {
        this.reachUntil=this.now+.8;const source=this.prop(e.source||e.obj,e.room)||this.portables.get(e.obj);if(source&&e.obj!=='flask')source.visible=false;this.hold(e.obj);
        const item=this.slot.children[0];if(item){const scale=item.scale.x,end=item.position.clone();this.robot.updateMatrixWorld(true);const start=this.slot.worldToLocal(pos.clone());item.scale.setScalar(.01);this.tween(.7,t=>{item.scale.setScalar(Math.max(.01,t*scale));item.position.lerpVectors(start,end,ease(t));item.position.y+=Math.sin(t*Math.PI)*.4;});}
        this.burst(pos,'pickup',12,this.player.color);break;
      }
      case 'pour':this.pourUntil=this.now+1.05;this.interestingUntil=this.now+2;this.interest=pos;this.hold(e.item);this.pourStream(pos,palette[e.color]);if(e.measures)this.updateLiquid(e.measures);break;
      case 'brew':this.interestingUntil=this.now+2;this.interest=pos;this.burst(pos,'spark',28,palette[e.color]);this.hold(e.result);this.updateLiquid({});break;
      case 'drain':this.updateLiquid({});break;
      case 'door':for(const room of ROOMS)this.openDoor(this.prop(e.door,room),e.door);this.interest=this.prop(e.door,e.room)?.getWorldPosition(v()).add(v(0,1.5,0));this.interestingUntil=this.now+3;break;
      case 'tile':this.tile(e.r,e.c,e.n);break;
      case 'boom':this.tile(e.r,e.c,'mine');this.shakeUntil=this.now+1.4;this.interestingUntil=this.now+2.3;this.interest=this.position(e.room,e.c-3,e.r-4,.5);this.burst(this.interest,'boom',50);this.burst(this.interest,'smoke',18);break;
      case 'scale':this.setScale(e.kg);break;
      case 'drop':this.reachUntil=this.now+.65;this.hold(null);break;
      case 'open':this.openContainer(prop);break;
      case 'seal':if(prop){const seal=prop.getObjectByName('seal');this.tween(1,t=>{seal.scale.setScalar(1-t);},()=>{seal.visible=false;});this.burst(pos,'steam',18,'#b3f7a6');}break;
      case 'code':{const screen=this.prop('keypad','vault').getObjectByName('key-screen');screen.material.color.set(e.ok?'#65ffb0':'#ff5d49');screen.material.emissive.copy(screen.material.color);this.inspectUntil=this.now+.6;this.interest=screen.getWorldPosition(v());this.interestingUntil=this.now+2.6;break;}
      case 'escape':this.spot.intensity=65;this.spot.target.position.copy(this.robot.position);this.burst(this.robot.position.clone().add(v(0,3,0)),'confetti',95);this.interestingUntil=this.now+4;this.interest=this.robot.position.clone().add(v(0,1,0));break;
    }
  }
  pourStream(target,color='#ffd373'){
    this.robot.updateMatrixWorld(true);const source=this.slot.getWorldPosition(v()).add(v(0,.32,0));
    const positions=new Float32Array(18*3),geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));
    const mat=new THREE.PointsMaterial({color,size:.085,transparent:true,opacity:.85,depthWrite:false,blending:THREE.AdditiveBlending,map:glowMap()});const stream=new THREE.Points(geo,mat);stream.frustumCulled=false;this.scene.add(stream);
    this.tween(1.05,t=>{for(let i=0;i<18;i++){const f=(i/18+t*2)%1;const at=source.clone().lerp(target,f);at.y+=Math.sin(f*Math.PI)*.25;geo.attributes.position.setXYZ(i,at.x,at.y,at.z);}geo.attributes.position.needsUpdate=true;mat.opacity=Math.min(1,(1-t)*4);},()=>{stream.removeFromParent();geo.dispose();mat.dispose();});
    // Mark short-lived resources so a live reset can release an unfinished pour.
    stream.userData.transient=true;
  }
  burst(pos,kind,count,color){
    const rng=random(419+this.eventCount*73+this.particles.length);const isSmoke=kind==='steam'||kind==='smoke';
    const positions=new Float32Array(count*3),colors=new Float32Array(count*3),velocities=[];
    for(let i=0;i<count;i++){const c=new THREE.Color(color|| (kind==='confetti'?['#e5bb70','#72d7d0','#f690ac','#faf0cf'][i%4]:isSmoke?'#b3bec0':kind==='boom'?'#ffaf4c':'#e9d39b'));colors.set([c.r,c.g,c.b],i*3);velocities.push(v((rng()-.5)*(isSmoke?.9:4),isSmoke?.7+rng():1+rng()*3,(rng()-.5)*(isSmoke?.9:4)));}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));geo.setAttribute('color',new THREE.BufferAttribute(colors,3));
    const mat=new THREE.PointsMaterial({size:isSmoke?.9:kind==='confetti'?.1:.15,map:kind==='confetti'?null:glowMap(isSmoke),transparent:true,opacity:isSmoke?.5:1,depthWrite:false,vertexColors:true,blending:isSmoke||kind==='confetti'?THREE.NormalBlending:THREE.AdditiveBlending});
    const points=new THREE.Points(geo,mat);points.position.copy(pos);points.frustumCulled=false;this.scene.add(points);this.particles.push({points,velocities,start:this.now,life:isSmoke?2.5:kind==='confetti'?4:1.2,kind});
    if(kind==='boom'){const flash=new THREE.PointLight('#ffb64f',80,10);flash.position.copy(pos);this.scene.add(flash);this.tween(.45,t=>flash.intensity=80*(1-t),()=>flash.removeFromParent());}
  }
  update(now,dt){
    this.now=now;
    this.directorTime+=dt;
    const due=this.scheduled.filter(a=>a.at<=now);this.scheduled=this.scheduled.filter(a=>a.at>now);due.forEach(a=>a.fn());
    // Callbacks can enqueue tweens; preserve those new entries for the next frame.
    const tweens=this.tweens;this.tweens=[];for(const tween of tweens){const t=clamp((now-tween.start)/tween.duration,0,1);tween.update(t);if(t<1)this.tweens.push(tween);else tween.done?.();}
    const walking=now<(this.walkUntil||0),inspect=now<(this.inspectUntil||0),pour=now<(this.pourUntil||0),reach=now<(this.reachUntil||0);
    this.body.position.y=Math.sin(now*2.5+this.index)*.035+(walking?Math.abs(Math.sin(now*15))*.055:0);this.body.rotation.x=inspect?.13:0;
    if(now>this.shakeUntil)this.body.rotation.z=0;
    this.robot.getObjectByName('right-leg').rotation.x=walking?Math.sin(now*13)*.48:0;this.robot.getObjectByName('left-leg').rotation.x=walking?-Math.sin(now*13)*.48:0;
    this.robot.getObjectByName('right-arm').rotation.x=pour?-1.3:reach?-1.1:walking?-Math.sin(now*13)*.3:0;this.robot.getObjectByName('left-arm').rotation.x=walking?Math.sin(now*13)*.3:0;this.slot.rotation.z=pour?-.9:0;this.scan.visible=inspect;
    const blink=(this.directorTime+this.index*.7)%4.7;for(let i=0;i<2;i++)this.robot.getObjectByName(`eye-${i}`).scale.y=blink<.13?.018:.12;
    const dust=this.dust.geometry.attributes.position;for(let i=0;i<this.dustSeeds.length;i++){const [x,y,z]=this.dustSeeds[i];dust.setXYZ(i,x+Math.sin(this.directorTime*.25+i)*.12,.25+(y+this.directorTime*.045)%3.1,z+Math.cos(this.directorTime*.2+i)*.12);}dust.needsUpdate=true;
    for(const f of this.flames){const flicker=1+Math.sin(now*11+f.id)*.12+Math.sin(now*17)*.04;f.scale.set(f.userData.baseScale*flicker,f.userData.baseScale*1.8*flicker,1);}this.warm.intensity=18+(this.currentRoom==='storage'?0:Math.sin(now*9)*1.1);
    const pend=this.prop('grandfather_clock','vault').getObjectByName('pendulum');pend.rotation.z=Math.sin(now*2.6)*.22;
    const pot=this.prop('cauldron','lab');for(let i=0;i<6;i++){const b=pot.getObjectByName(`bubble-${i}`);b.position.y=1.26+((now*.35+i*.17)%1)*.3;b.scale.setScalar(.035+Math.sin(now*2+i)**2*.045);}
    for(let i=this.particles.length-1;i>=0;i--){const p=this.particles[i],age=now-p.start,t=age/p.life;if(t>=1){p.points.removeFromParent();p.points.geometry.dispose();p.points.material.dispose();this.particles.splice(i,1);continue;}const positions=p.points.geometry.attributes.position;for(let n=0;n<p.velocities.length;n++){const vel=p.velocities[n],gravity=['steam','smoke','pour'].includes(p.kind)?0:1.7;positions.setXYZ(n,vel.x*age,vel.y*age-gravity*age*age,vel.z*age);}positions.needsUpdate=true;p.points.material.opacity=(1-t)*(p.kind==='smoke'?.5:1);}
    this.direct(now,dt);
  }
  direct(now,dt){
    const offset=OFFSETS[this.currentRoom];let mode=this.mode;
    if(mode==='auto')mode=this.eventHoldUntil>this.directorTime&&this.interest?'event':'follow';
    this.shotMode=mode;
    const aim=v(offset,.65,0),eye=v();let fov=32;
    const aspect=this.camera.aspect;
    // A shallow broadcast angle fills wide panes; focus views expose more floor.
    const elevation=THREE.MathUtils.lerp(12,3.1,clamp((aspect-1.4)/1.6,0,1));
    const direction=v(1.4,elevation,18).normalize(),right=v().crossVectors(v(0,1,0),direction).normalize(),up=v().crossVectors(direction,right);
    const tan=Math.tan(THREE.MathUtils.degToRad(fov/2));
    const points=[];for(const x of [-5.35,5.35])for(const z of [-5.35,5.35])points.push(v(offset+x,-.65,z));
    for(const x of [-5.2,5.2])for(const z of [-5.2,1.8])points.push(v(offset+x,3.55,z));
    // Include the actor's actual antenna, not an oversized invisible bounding box.
    points.push(this.robot.position.clone().add(v(0,3.45,0)));
    let top=-Infinity,bottom=-Infinity,left=-Infinity,rightEdge=-Infinity;const vertical=tan*.92,horizontal=tan*aspect*.94;
    for(const point of points){const relative=point.sub(aim),depth=relative.dot(direction),x=relative.dot(right)/horizontal,y=relative.dot(up)/vertical;top=Math.max(top,depth+y);bottom=Math.max(bottom,depth-y);rightEdge=Math.max(rightEdge,depth+x);left=Math.max(left,depth-x);}
    aim.addScaledVector(up,(top-bottom)*vertical/2).addScaledVector(right,(rightEdge-left)*horizontal/2);
    const distance=Math.max((top+bottom)/2,(left+rightEdge)/2);
    eye.copy(aim).addScaledVector(direction,distance);
    if(mode==='overview'){aim.set(21,0,0);eye.set(25,30,37);eye.sub(aim).multiplyScalar(Math.max(1,1.7/aspect)).add(aim);fov=48;}
    else if(mode==='follow'||mode==='event'){
      const actor=this.robot.position.clone().add(v(0,1.6,0));
      const target=mode==='event'?this.interest:this.interaction;
      aim.copy(actor);if(target&&Math.abs(target.x-offset)<7)aim.lerp(target,.42);
      // Keep enough of the set around an actor at the edge, rather than aiming
      // half the wide broadcast pane into the space outside a side wall.
      aim.x=clamp(aim.x,offset-1.7,offset+1.7);aim.z=clamp(aim.z,-1.8,2.2);aim.y=1.35;
      // Look inward from the open front. The shoulder flips near a side doorway
      // so neither its frame nor its leaf can lie between camera and actor.
      const side=aim.x>offset+1?-1:1;
      const shoulder=v(side*4.3,6.1,12.5).normalize();
      const cameraRight=v().crossVectors(v(0,1,0),shoulder).normalize(),cameraUp=v().crossVectors(shoulder,cameraRight);
      fov=39;const tangent=Math.tan(THREE.MathUtils.degToRad(fov/2));
      let close=12.4*Math.max(1,1.25/aspect);
      const subjects=[actor.clone().setY(.05),actor.clone().setY(3.65)];
      if(target&&Math.abs(target.x-offset)<7)subjects.push(target.clone().add(v(0,-.7,0)),target.clone().add(v(0,1.4,0)));
      for(const point of subjects){const relative=point.sub(aim);close=Math.max(close,relative.dot(shoulder)+Math.abs(relative.dot(cameraRight))/(tangent*aspect*.83),relative.dot(shoulder)+Math.abs(relative.dot(cameraUp))/(tangent*.8));}
      eye.copy(aim).addScaledVector(shoulder,close);
    }
    const alpha=this.cameraSnap?1:1-Math.exp(-dt*(mode==='event'?2.3:1.8));this.cameraSnap=false;
    this.look.lerp(aim,alpha);this.camera.position.lerp(eye,alpha);this.camera.fov=THREE.MathUtils.lerp(this.camera.fov,fov,alpha);this.camera.updateProjectionMatrix();
    if(now<this.shakeUntil){const amount=(this.shakeUntil-now)*.11;this.camera.position.x+=Math.sin(now*81)*amount;this.camera.position.y+=Math.cos(now*72)*amount;}
    this.camera.lookAt(this.look);for(const [id,room] of this.rooms)room.visible=mode==='overview'||id===this.currentRoom;
    this.camera.updateMatrixWorld();const label=this.robot.getObjectByName('name-label');const depth=-label.getWorldPosition(v()).applyMatrix4(this.camera.matrixWorldInverse).z;
    const pixelUnit=2*Math.max(1,depth)*Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2))/Math.max(1,this.height||300)/1.6;
    const labelHeight=this.height>400?29:24;label.scale.set(pixelUnit*labelHeight*4,pixelUnit*labelHeight,1);
    for(const object of this.portables.values())object.visible=object.userData.present&&(mode==='overview'||object.userData.room===this.currentRoom);
    this.scene.fog.near=mode==='overview'?55:19;this.scene.fog.far=mode==='overview'?110:52;
  }
  render(){this.renderer.setScissorTest(false);this.composer.render();return this.composer.readBuffer.texture;}
  dispose(){
    this.tweens=[];this.scheduled=[];const disposed=new Set();this.scene.traverse(o=>{if(o.isInstancedMesh)o.dispose();if(o.isSprite||o.userData.ownedMaterial||o.userData.transient){if(o.material&&!disposed.has(o.material)){o.material.dispose();disposed.add(o.material);}if(o.userData.transient)o.geometry?.dispose();}});
    for(const p of this.particles){p.points.geometry.dispose();p.points.material.dispose();}this.particles=[];
    this.key.shadow.map?.dispose();for(const pass of this.composer.passes)pass.dispose?.();this.composer.dispose();this.scene.clear();
  }
}
