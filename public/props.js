import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { material, physical, textured, textMap, labelMaterial, clockMap, palette, glowMap, floorGlow, frostMap, artMap, paperMap, random } from './textures.js';

const geometries = new Map();
const merged = new Map();
const TAU = Math.PI * 2;
export const G = {
  rounded:()=>new RoundedBoxGeometry(1,1,1,3,.12),
  tile:()=>new RoundedBoxGeometry(1,1,1,1,.08),
  box:()=>new THREE.BoxGeometry(1,1,1), sphere:()=>new THREE.SphereGeometry(1,16,10),
  cylinder:()=>new THREE.CylinderGeometry(1,1,1,20), cone:()=>new THREE.ConeGeometry(1,1,16),
  torus:()=>new THREE.TorusGeometry(1,.12,6,24), plane:()=>new THREE.PlaneGeometry(1,1), disk:()=>new THREE.CircleGeometry(1,48),
  pot:()=>new THREE.LatheGeometry([[.3,-.8],[.65,-.65],[.95,-.3],[1,.1],[.93,.5],[.9,.76]].map(([x,y])=>new THREE.Vector2(x,y)),24),
};
export function mesh(parent,shape,mat,pos=[0,0,0],scale=[1,1,1],rot=[0,0,0],name){
  if(!geometries.has(shape))geometries.set(shape,G[shape]());
  const m=new THREE.Mesh(geometries.get(shape),mat);m.position.set(...pos);m.scale.set(...scale);m.rotation.set(...rot);m.castShadow=true;m.receiveShadow=true;if(name)m.name=name;parent.add(m);return m;
}
export function group(parent,pos=[0,0,0],name){const g=new THREE.Group();g.position.set(...pos);if(name)g.name=name;if(parent)parent.add(g);return g;}
export function dynamic(obj){obj.userData.dynamic=true;return obj;}
const wood=()=>textured('wood'), darkWood=()=>textured('wood','#6c5245'), metal=()=>textured('metal'), darkMetal=()=>material('iron','#29343d',{metalness:.75,roughness:.43}), gold=()=>material('brass','#c49b50',{metalness:.74,roughness:.3}), ivory=()=>material('ivory','#e5d6b6');
export function plaque(parent,text,pos=[0,1,0],w=1.4,h=.4,options={}){
  return mesh(parent,'plane',labelMaterial(text,options),pos,[w,h,1]);
}
export function flame(parent,pos=[0,1,0],scale=.28){
  const m=new THREE.SpriteMaterial({map:glowMap(),color:'#ffce77',transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
  const s=new THREE.Sprite(m);s.position.set(...pos);s.scale.set(scale,scale*1.8,1);s.name='flame';s.userData.flame=true;s.userData.baseScale=scale;parent.add(s);return s;
}

// Merge the static parts of each prop, preserving hinges, needles and liquids.
// Merged geometries are shared by every player, while movable roots stay separate.
export function compact(root,key){
  root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),buckets=new Map(),remove=[];
  function walk(node){for(const child of node.children){if(child.userData.dynamic||child.isSprite||child.isLight||child.isInstancedMesh)continue;
    if(child.isMesh&&!Array.isArray(child.material)){const id=child.material.uuid;if(!buckets.has(id))buckets.set(id,{mat:child.material,parts:[]});const geo=child.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,child.matrixWorld));buckets.get(id).parts.push(geo);remove.push(child);}else walk(child);
  }}walk(root);
  let n=0;for(const {mat,parts} of buckets.values()){const cacheKey=`${key}:${n++}`;let geometry=merged.get(cacheKey);if(!geometry){geometry=mergeGeometries(parts);merged.set(cacheKey,geometry);}parts.forEach(g=>g.dispose());const m=new THREE.Mesh(geometry,mat);m.castShadow=true;m.receiveShadow=true;root.add(m);}
  for(const child of remove)child.removeFromParent();return root;
}

export function instances(parent,shape,mat,placements){
  if(!geometries.has(shape))geometries.set(shape,G[shape]());
  const batch=new THREE.InstancedMesh(geometries.get(shape),mat,placements.length),at=new THREE.Object3D();
  placements.forEach(({pos,scale,rot=[0,0,0]},i)=>{at.position.set(...pos);at.scale.set(...scale);at.rotation.set(...rot);at.updateMatrix();batch.setMatrixAt(i,at.matrix);});
  batch.castShadow=true;batch.receiveShadow=true;parent.add(batch);return batch;
}

function cupboard(p,def){
  const w=def.id==='potion_cabinet'?1.65:def.id==='tall_cupboard'?1.65:1.35,h=def.id==='cabinet'?1.8:2.65,d=.8;
  mesh(p,'box',darkWood(),[0,h/2,-d/2],[w,h,.1]);
  for(const x of [-w/2,w/2])mesh(p,'box',wood(),[x,h/2,0],[.12,h,d]);
  for(const y of [.15,h/2,h-.05])mesh(p,'box',wood(),[0,y,0],[w+.12,.12,d]);
  mesh(p,'box',gold(),[0,h+.04,0],[w+.23,.08,d+.1]);
  const pivots=[];for(const side of [-1,1]){
    const leaf=dynamic(group(p,[side*w/2,h/2,d/2],side===-1?'cabinet-leaf':'cabinet-leaf-right'));
    const cx=-side*w/4;mesh(leaf,'box',wood(),[cx,0,0],[w/2-.03,h-.2,.09]);
    // Opaque frosted panels keep the undiscovered contents unidentifiable.
    mesh(leaf,'box',def.id==='potion_cabinet'?material('frosted-panel','#688c8b',{metalness:.25,roughness:.48}):darkWood(),[cx,0,.055],[w/2-.19,h-.5,.03]);
    for(const y of [-h*.32,h*.32])mesh(leaf,'box',gold(),[cx,y,.08],[w/2-.2,.025,.025]);
    mesh(leaf,'sphere',gold(),[-side*(w/2-.12),0,.12],[.045,.08,.055]);pivots.push({node:leaf,axis:'y',to:side*1.85});
  }
  p.userData.openParts=pivots;p.userData.shelves=[.22,h/2+.07];
}
function chest(p,def){
  const stone=def.id==='stone_chest',bag=def.id==='satchel',card=def.id==='cardboard_boxes';
  const mat=stone?textured('stone'):card?material('cardboard','#ad875b'):bag?textured('cloth'):wood();
  const w=bag?.8:1.45,h=bag?.45:.75,d=bag?.5:.85;
  mesh(p,'box',mat,[0,.08,0],[w,.16,d]);
  mesh(p,'box',bag?mat:textured('cloth','#ada087'),[0,bag?.08:.31,0],[w-.12,.12,d-.12]);
  for(const z of [-d/2,d/2])mesh(p,'box',mat,[0,h/2,z],[w,h,.08]);
  for(const x of [-w/2,w/2])mesh(p,'box',mat,[x,h/2,0],[.08,h,d]);
  const lid=dynamic(group(p,[0,h,-d/2],'lid'));mesh(lid,'box',mat,[0,0,d/2],[w+.08,.14,d+.08]);
  for(const x of [-w*.34,w*.34])mesh(lid,'box',card?ivory():gold(),[x,.08,d/2],[.08,.025,d+.08]);
  mesh(p,'box',gold(),[0,h*.7,d/2+.05],[.13,.21,.06]);
  p.userData.openParts=[{node:lid,axis:'x',to:-1.65}];
  if(card){mesh(p,'box',mat,[.8,.3,-.28],[.7,.6,.65]);mesh(p,'box',ivory(),[.8,.61,-.28],[.07,.015,.65]);}
}
function cloth(p,tarp){
  if(tarp){
    // A draped cover with a rectangular silhouette, not visible hidden crates.
    const cover=dynamic(group(p,[0,0,0],'cover'));
    mesh(cover,'rounded',textured('cloth'),[0,1.18,0],[2.8,.12,4.65]);
    for(const x of [-1.38,1.38])mesh(cover,'box',textured('cloth'),[x,.61,0],[.05,1.15,4.65],[0,0,x>0?.06:-.06]);
    for(const z of [-2.3,2.3])mesh(cover,'box',textured('cloth'),[0,.62,z],[2.8,1.16,.05],[z>0?-.05:.05,0,0]);
    for(let i=0;i<7;i++)mesh(cover,'box',textured('cloth','#c1c7ac'),[-1.3+i*.43,1.255,0],[.025,.012,4.5]);
    p.userData.cover=cover;p.userData.coverType='tarp';
  }else{
    mesh(p,'plane',textured('rug'),[0,.04,-.83],[3,1.65,1],[-Math.PI/2,0,0]);
    const fold=dynamic(group(p,[0,.045,0],'rug-fold'));mesh(fold,'plane',textured('rug'),[0,0,.825],[3,1.65,1],[-Math.PI/2,0,0]);
    // Both sides remain visible as the fabric folds back.
    fold.children[0].material=material('rug-fold','#fff',{map:textured('rug').map,side:THREE.DoubleSide,roughness:1});
    p.userData.openParts=[{node:fold,axis:'x',to:-3.04}];
  }
}
function detail(p,def){
  const id=def.id;
  if(id==='trapdoor'){
    mesh(p,'box',darkWood(),[0,.025,.72],[1.6,.045,1.35]);
    for(const x of [-.55,.55])mesh(p,'box',darkMetal(),[x,.055,.72],[.1,.03,1.3]);
    mesh(p,'torus',gold(),[.45,.07,1.13],[.11,.11,.11],[-Math.PI/2,0,0]);
    for(const x of [-.7,.7])for(const z of [.16,1.28])mesh(p,'sphere',metal(),[x,.07,z],[.035,.02,.035]);return true;
  }
  if(id==='sink'){
    const stone=textured('stone','#c2c1af');table(p,1.5,.85,.9);
    for(const x of [-.7,.7])mesh(p,'box',stone,[x,1.02,0],[.15,.4,.9]);
    for(const z of [-.4,.4])mesh(p,'box',stone,[0,1.02,z],[1.5,.4,.12]);mesh(p,'box',darkMetal(),[0,.85,0],[1.2,.06,.7]);
    mesh(p,'cylinder',gold(),[0,1.35,-.3],[.045,.55,.045]);mesh(p,'cylinder',gold(),[0,1.59,-.12],[.045,.4,.045],[Math.PI/2,0,0]);return true;
  }
  if(id==='ladder'){
    for(const x of [-.38,.38])mesh(p,'box',wood(),[x,1.35,0],[.1,2.8,.12],[.16,0,0]);
    for(let i=0;i<8;i++)mesh(p,'box',wood(),[0,.2+i*.35,-.2+i*.057],[.8,.08,.12]);p.rotation.y=-.5;return true;
  }
  if(id==='wheelbarrow'){
    mesh(p,'box',metal(),[0,.55,0],[1.05,.12,.95]);
    for(const x of [-.52,.52])mesh(p,'box',metal(),[x,.78,0],[.08,.5,.95],[0,0,-x*.3]);
    for(const z of [-.47,.47])mesh(p,'box',metal(),[0,.78,z],[1.1,.5,.07]);
    for(const x of [-.4,.4]){mesh(p,'cylinder',wood(),[x,.61,.85],[.05,1.1,.05],[Math.PI/2-.2,0,0]);mesh(p,'cylinder',darkMetal(),[x,.26,.24],[.045,.5,.045],[.25,0,0]);}
    mesh(p,'torus',darkMetal(),[0,.3,-.7],[.3,.3,.3],[0,Math.PI/2,0]);mesh(p,'cylinder',gold(),[0,.3,-.7],[.06,.3,.06],[0,0,Math.PI/2]);p.rotation.y=.4;return true;
  }
  if(id==='coat_rack'||id==='torch_holder'||id==='umbrella_stand'){
    if(id==='umbrella_stand'){mesh(p,'cylinder',darkMetal(),[0,.06,0],[.4,.12,.4]);for(let i=0;i<8;i++){const a=i*TAU/8;mesh(p,'cylinder',gold(),[Math.cos(a)*.35,.48,Math.sin(a)*.35],[.025,.9,.025]);}mesh(p,'torus',gold(),[0,.95,0],[.37,.37,.37],[Math.PI/2,0,0]);}
    else{mesh(p,'cylinder',id==='coat_rack'?wood():darkMetal(),[0,1.05,0],[.065,2.1,.065]);for(let i=0;i<4;i++){const a=i*TAU/4;mesh(p,'cylinder',gold(),[Math.sin(a)*.2,1.9,Math.cos(a)*.2],[.035,.5,.035],[Math.cos(a)*.8,0,-Math.sin(a)*.8]);mesh(p,'box',darkWood(),[Math.sin(a)*.2,.08,Math.cos(a)*.2],[.15,.16,.55],[0,a,0]);}if(id==='torch_holder')flame(p,[0,2.32,0],.3);}return true;
  }
  if(id==='stone_bench'){table(p,1.8,.62,.6);mesh(p,'box',textured('stone'),[0,.65,0],[1.95,.2,.75]);p.rotation.y=.65;return true;}
  if(id==='cracked_shield'){
    mesh(p,'sphere',darkMetal(),[0,1.75,0],[.55,.75,.12]);mesh(p,'torus',gold(),[0,1.75,.05],[.49,.67,.1]);mesh(p,'box',gold(),[0,1.75,.13],[.075,1.2,.03]);mesh(p,'box',material('crack','#101415'),[.15,1.6,.15],[.04,.6,.02],[0,0,.3]);p.rotation.y=-.6;return true;
  }
  if(id==='weapons_rack'){
    for(const x of [-.5,.5])mesh(p,'box',wood(),[x,1.1,0],[.12,2.2,.3]);for(const y of [.2,1.5,2.1])mesh(p,'box',darkWood(),[0,y,0],[1.15,.14,.4]);return true;
  }
  if(id==='barometer'){
    mesh(p,'box',darkWood(),[0,2.1,0],[.62,1.1,.12]);mesh(p,'cylinder',gold(),[0,2.2,.1],[.28,.08,.28],[Math.PI/2,0,0]);mesh(p,'disk',ivory(),[0,2.2,.15],[.23,.23,1]);mesh(p,'box',darkMetal(),[.06,2.25,.17],[.035,.27,.025],[0,0,-.7]);return true;
  }
  if(id==='old_map'){
    mesh(p,'box',darkWood(),[0,2,0],[1.8,1.35,.12]);mesh(p,'plane',material('map','#fff',{map:paperMap('map')}),[0,2,.075],[1.64,1.2,1]);p.rotation.y=.65;return true;
  }
  if(def.kind!=='prop')return false;
  // Small junk has a recognisable silhouette rather than an anonymous cube.
  if(/clothes|apron|coat|lining|cloth|gloves|straps/.test(id)){
    const mat=textured('cloth',/coat|apron/.test(id)?'#9f857b':'#c4c3aa');
    mesh(p,'rounded',mat,[0,.12,0],[.6,.22,.43]);mesh(p,'rounded',mat,[.06,.25,-.03],[.5,.1,.36],[0,.15,0]);
  }else if(/broom|spear|sword|torch|umbrella/.test(id)){
    mesh(p,'cylinder',wood(),[0,.48,0],[.025,.9,.025],[0,0,-.2]);
    mesh(p,id==='bent_umbrella'?'cone':'box',id==='broom'?ivory():metal(),[.1,.83,0],[.16,.3,.09]);
  }else if(/basket/.test(id)){
    mesh(p,'cylinder',textured('cloth','#cbb082'),[0,.16,0],[.3,.3,.3]);mesh(p,'torus',wood(),[0,.32,0],[.32,.32,.32],[Math.PI/2,0,0]);
    for(let i=0;i<8;i++)mesh(p,'sphere',material('dry-herbs','#647749'),[Math.sin(i*2)*.2,.42+i%3*.05,Math.cos(i*2)*.2],[.08,.21,.07],[0,0,i*.4]);
  }else if(/stool/.test(id)){table(p,.55,.5,.55);}
  else if(/paint_cans|empty_jars/.test(id)){
    for(let i=0;i<3;i++){mesh(p,'cylinder',id==='paint_cans'?metal():material('jar','#86a9a4',{metalness:.25,roughness:.25}),[(i-1)*.22,.18,0],[.1,.35,.1]);mesh(p,'cylinder',gold(),[(i-1)*.22,.36,0],[.11,.03,.11]);}
  }else if(id==='rope'){for(let i=0;i<5;i++)mesh(p,'torus',textured('cloth','#d3bc89'),[0,.035+i*.035,0],[.27,.27,.27],[Math.PI/2,0,0]);}
  else if(id==='lantern'){mesh(p,'cylinder',gold(),[0,.06,0],[.18,.08,.18]);mesh(p,'cylinder',material('lantern-glass','#a2bbb0',{roughness:.3}),[0,.25,0],[.13,.32,.13]);mesh(p,'cone',darkMetal(),[0,.46,0],[.2,.15,.2]);mesh(p,'torus',gold(),[0,.6,0],[.1,.13,.1]);}
  else if(id==='helmet'){mesh(p,'sphere',metal(),[0,.16,0],[.25,.23,.23]);mesh(p,'box',darkMetal(),[0,.1,.22],[.35,.055,.02]);}
  else if(/spectacles/.test(id)){for(const x of [-.12,.12])mesh(p,'torus',gold(),[x,.035,0],[.11,.11,.11],[-Math.PI/2,0,0]);mesh(p,'box',gold(),[0,.035,0],[.08,.02,.025]);}
  else if(/hammer|screwdriver|pencils|ink_pen/.test(id)){
    const count=id==='pencils'?3:1;for(let i=0;i<count;i++){mesh(p,'cylinder',id==='ink_pen'?metal():wood(),[(i-1)*.08,.035,0],[.023,.48,.023],[Math.PI/2,0,.1*i]);mesh(p,'box',metal(),[(i-1)*.08,.04,-.25],[id==='hammer'?.23:.035,.06,.07]);}
  }else if(id==='stamp'){mesh(p,'box',darkWood(),[0,.05,0],[.23,.1,.18]);mesh(p,'sphere',wood(),[0,.17,0],[.08,.14,.08]);}
  else if(/bowl|shards/.test(id)){mesh(p,'pot',material('terracotta','#ae7355'),[0,.14,0],[.26,.17,.26]);}
  else if(/pouch/.test(id)){mesh(p,'sphere',textured('cloth','#895e71'),[0,.16,0],[.18,.2,.16]);mesh(p,'torus',gold(),[0,.32,0],[.08,.08,.08],[Math.PI/2,0,0]);}
  else{for(let i=0;i<3;i++)mesh(p,id==='nails'?'cylinder':'rounded',id==='nails'?metal():ivory(),[(i-1)*.1,.04+i%2*.03,0],[.06,.06,.12],[0,i*.6,.25]);}
  return true;
}

function bottle(parent,color='clear',pos=[0,0,0],scale=1){
  const b=group(parent,pos);b.scale.setScalar(scale);
  const glass=material('glass','#b7e8ed',{transparent:true,opacity:.29,metalness:.18,roughness:.19,depthWrite:false});
  mesh(b,'sphere',glass,[0,.4,0],[.23,.32,.23]);mesh(b,'cylinder',glass,[0,.72,0],[.09,.35,.09]);
  mesh(b,'cylinder',wood(),[0,.92,0],[.105,.12,.105]);
  if(color!=='clear')mesh(b,'sphere',material(`liquid-${color}`,palette[color]||color,{emissive:palette[color]||color,emissiveIntensity:.32,roughness:.27}),[0,.36,0],[.195,.23,.195]);
  mesh(b,'box',ivory(),[0,.44,.218],[.22,.17,.01]);return b;
}
function table(parent,w=1.8,d=.9,h=1.1){mesh(parent,'box',wood(),[0,h,0],[w,.16,d]);for(const x of [-1,1])for(const z of [-1,1])mesh(parent,'box',darkWood(),[x*(w/2-.14),h/2,z*(d/2-.1)],[.13,h,.13]);}
function clock(parent,time,standing=false){
  if(standing){mesh(parent,'box',darkWood(),[0,1.35,0],[.95,2.7,.65]);mesh(parent,'box',gold(),[0,.2,0],[1.15,.18,.8]);mesh(parent,'box',wood(),[0,2.7,0],[1.1,.18,.8]);mesh(parent,'box',darkMetal(),[0,1.12,.34],[.6,1.5,.03]);
    const pend=dynamic(group(parent,[0,1.85,.39],'pendulum'));mesh(pend,'box',gold(),[0,-.65,0],[.035,1.25,.04]);mesh(pend,'sphere',gold(),[0,-1.22,0],[.2,.2,.06]);
  }
  const face=dynamic(group(parent,[0,standing?2.2:2.3,standing?.39:.08],'clock-face'));face.userData.time=time;if(!standing)face.scale.setScalar(1.5);
  mesh(face,'cylinder',gold(),[0,0,0],[.51,.12,.51],[Math.PI/2,0,0]);mesh(face,'cylinder',ivory(),[0,0,.075],[.44,.025,.44],[Math.PI/2,0,0]);
  mesh(face,'disk',material('clock-dial','#ffffff',{map:clockMap(),emissiveMap:clockMap(),emissive:'#ffffff',emissiveIntensity:.4,roughness:1}),[0,0,.095],[.44,.44,1]);
  const [hr,min]=time.split(':').map(Number);for(const [name,angle,length,width] of [['hour-hand',(hr%12+min/60)*TAU/12,.22,.045],['minute-hand',min*TAU/60,.35,.024]]){const hand=group(face,[0,0,.13],name);hand.rotation.z=-angle;mesh(hand,'box',material('clock-hand','#131d2a',{roughness:1}),[0,length/2,0],[width,length,.025]);}mesh(face,'sphere',gold(),[0,0,.16],[.045,.045,.03]);
}
function frame(parent,portrait=false){
  mesh(parent,'box',darkWood(),[0,2.1,0],[1.8,1.55,.13]);mesh(parent,'box',gold(),[0,2.1,.08],[1.65,1.4,.06]);mesh(parent,'plane',material(`art:${portrait}`,'#fff',{map:artMap(portrait)}),[0,2.1,.12],[1.47,1.22,1]);
}
function door(parent,id){
  for(const x of [-1.25,1.25])mesh(parent,'box',textured('stone'),[x,1.55,0],[.4,3.1,.55]);mesh(parent,'box',textured('stone'),[0,3.1,0],[2.9,.3,.55]);
  const leaf=dynamic(group(parent,[0,0,0],'door-leaf'));
  if(id==='gate'){
    for(let x=-1.05;x<1.1;x+=.3){mesh(leaf,'cylinder',darkMetal(),[x,1.5,0],[.055,3,.055]);mesh(leaf,'cone',gold(),[x,3.02,0],[.09,.24,.09]);}
    for(const y of [.35,2.5])mesh(leaf,'box',metal(),[0,y,0],[2.3,.12,.15]);
  } else if(id==='ice_door'){
    const ice=dynamic(group(leaf,[0,0,0],'ice'));
    const icy=physical('ice-wall','#b7efff',{transmission:.72,thickness:.65,ior:1.31,roughness:.23,roughnessMap:frostMap(),bumpMap:frostMap(),bumpScale:.055,attenuationColor:new THREE.Color('#56b9dc'),attenuationDistance:2,envMapIntensity:1.1});
    mesh(ice,'rounded',icy,[0,1.46,0],[2.2,2.91,.48]);
    const rim=material('ice-rim','#96efff',{emissive:'#51d9ff',emissiveIntensity:.8,transparent:true,opacity:.75});
    for(const x of [-1.08,1.08])mesh(ice,'box',rim,[x,1.46,.23],[.035,2.85,.035]);
    for(const y of [.05,2.88])mesh(ice,'box',rim,[0,y,.23],[2.16,.035,.035]);
    for(let i=0;i<5;i++)mesh(ice,'cone',icy,[-.86+i*.43,2.65,.3],[.07,.3+(i%3)*.13,.08],[Math.PI,0,0]);
    const puddle=dynamic(mesh(parent,'sphere',physical('melt-water','#84dced',{transparent:true,opacity:.48,roughness:.08,metalness:.2}),[0,.026,.3],[1.25,.025,.65],[0,0,0],'melt-puddle'));puddle.visible=false;puddle.castShadow=false;
    for(let i=0;i<5;i++){const drip=dynamic(mesh(parent,'sphere',icy,[-.8+i*.4,2.3,.32],[.035,.13,.035],[0,0,0],`ice-drip-${i}`));drip.visible=false;}
  } else {
    leaf.position.x=-1.1;mesh(leaf,'box',darkWood(),[1.1,1.5,0],[2.2,3,.22]);for(const y of [.5,2.5])mesh(leaf,'box',darkMetal(),[1.1,y,.16],[2.15,.16,.08]);mesh(leaf,'torus',gold(),[1.8,1.4,.22],[.13,.13,.13]);
  }
}
export function makeProp(def,solution,room){
  const p=group(null,[def.x,0,def.z]);p.name=def.id;p.userData.definition=def;
  const id=def.id;const col=def.color||'clear';
  if(!detail(p,def))switch(def.kind){
    case 'cauldron': {
      mesh(p,'cylinder',textured('stone'),[0,.1,0],[1,.2,1]);mesh(p,'pot',darkMetal(),[0,.77,0],[.85,.7,.85]);
      mesh(p,'torus',metal(),[0,1.3,0],[.77,.77,.77],[Math.PI/2,0,0]);for(const x of [-1,1])mesh(p,'torus',gold(),[x*.87,.95,0],[.23,.23,.23],[0,Math.PI/2,0]);
      const liquid=dynamic(mesh(p,'cylinder',material('base-liquid','#487a64',{emissive:'#3baf8c',emissiveIntensity:.25,roughness:.15}).clone(),[0,1.25,0],[.69,.025,.69],[0,0,0],'liquid'));
      liquid.userData.ownedMaterial=true;
      for(let i=0;i<6;i++){const b=dynamic(mesh(p,'sphere',material('bubble','#b5e4bc',{transparent:true,opacity:.6,roughness:.2}),[Math.sin(i*2)*.48,1.3,Math.cos(i*2)*.48],[.07,.07,.07],[0,0,0],`bubble-${i}`));b.userData.bubble=i;}
      for(let i=0;i<5;i++)flame(p,[Math.cos(i*1.3)*.43,.28,Math.sin(i*1.3)*.43],.23);break;
    }
    case 'valve':mesh(p,'cylinder',metal(),[0,.25,0],[.06,.5,.06]);mesh(p,'torus',gold(),[0,.48,0],[.2,.2,.2],[Math.PI/2,0,0]);for(let i=0;i<3;i++)mesh(p,'box',gold(),[0,.48,0],[.36,.04,.035],[0,i*Math.PI/3,0]);break;
    case 'bottle':bottle(p,col);break;
    case 'flask':bottle(p,col,[0,0,0]);break;
    case 'rack':table(p,1.5,.7,.8);for(let i=0;i<4;i++)bottle(p,'clear',[-.5+i*.34,.87,0],.65);break;
    case 'shelf': {
      const shelf=group(p);p.rotation.y=def.x>0?-.55:.55;
      mesh(shelf,'box',darkWood(),[0,1.3,-.3],[1.7,2.6,.14]);for(const x of [-.85,.85])mesh(shelf,'box',wood(),[x,1.3,0],[.14,2.6,.7]);
      for(let y=.2;y<2.7;y+=.75)mesh(shelf,'box',wood(),[0,y,0],[1.8,.12,.7]);
      // A curtain hides the actual searchable contents until the shelf is inspected.
      const curtain=dynamic(mesh(p,'box',textured('cloth','#9b8973'),[0,1.36,.38],[1.6,2.35,.035],[0,0,0],'shelf-curtain'));p.userData.curtain=curtain;break;
    }
    case 'book':{const colors=['#854f43','#497770','#b29157','#596c83'],c=colors[id.length%4];mesh(p,'box',material('cover',c),[0,.29,0],[.19,.58,.4]);mesh(p,'box',ivory(),[.005,.29,.012],[.15,.53,.37]);mesh(p,'box',material('cover',c),[0,.29,.21],[.19,.58,.035]);for(const y of [.1,.45])mesh(p,'box',gold(),[0,y,.235],[.17,.025,.012]);break;}
    case 'desk':table(p,2,1.15,1.05);mesh(p,'box',darkWood(),[0,.78,-.4],[1.7,.4,.15]);if(id==='desk_vault')mesh(p,'box',material('desk-felt','#395b4d'),[0,1.14,0],[1.65,.015,.9]);break;
    case 'drawer':{const tray=dynamic(group(p,[0,.78,0],'drawer-slide'));mesh(tray,'box',wood(),[0,0,0],[1.4,.07,.65]);for(const x of [-.68,.68])mesh(tray,'box',darkWood(),[x,.12,0],[.06,.25,.65]);mesh(tray,'box',wood(),[0,.12,.34],[1.46,.3,.08]);mesh(tray,'sphere',gold(),[0,.12,.4],[.08,.05,.05]);p.userData.slide=tray;break;}
    case 'key':mesh(p,'torus',gold(),[0,1.2,0],[.12,.12,.12],[-Math.PI/2,0,0]);mesh(p,'box',gold(),[.2,1.2,0],[.3,.04,.05]);for(const x of [.29,.36])mesh(p,'box',gold(),[x,1.2,.06],[.04,.04,.12]);break;
    case 'clock':clock(p,id==='wall_clock'?solution.clockTime:solution.decoyTime,id==='grandfather_clock');break;
    case 'painting':case 'portrait':frame(p,id==='portrait');break;
    case 'globe':mesh(p,'cylinder',gold(),[0,1.15,0],[.28,.1,.28]);mesh(p,'cylinder',gold(),[0,1.4,0],[.05,.5,.05]);mesh(p,'sphere',material('globe','#487b85',{roughness:.6}),[0,1.75,0],[.4,.4,.4]);mesh(p,'torus',gold(),[0,1.75,0],[.47,.47,.47],[0,0,.3]);for(let i=0;i<7;i++)mesh(p,'sphere',material('land','#b5af70'),[Math.sin(i*2)*.31,1.75+Math.cos(i*2)*.2,.18],[.13,.11,.18]);break;
    case 'skull':skull(p,[0,.25,0],.3);break;
    case 'candles':for(let i=0;i<3;i++){let h=.25+i*.15;mesh(p,'cylinder',gold(),[(i-1)*.22,1.16,0],[.12,.05,.12]);mesh(p,'cylinder',ivory(),[(i-1)*.22,1.18+h/2,0],[.065,h,.065]);flame(p,[(i-1)*.22,1.24+h,0],.17);}break;
    case 'statue':mesh(p,'box',textured('stone'),[0,.15,0],[.7,.3,.7]);mesh(p,'sphere',darkMetal(),[0,.62,0],[.23,.38,.22]);mesh(p,'sphere',darkMetal(),[0,1.03,.03],[.25,.22,.23]);for(const x of [-.17,.17]){mesh(p,'cone',darkMetal(),[x,1.25,0],[.09,.24,.1]);mesh(p,'sphere',material('cat-eye','#83e7ba',{emissive:'#83e7ba',emissiveIntensity:.5}),[x*.7,1.06,.22],[.035,.04,.02]);}mesh(p,'torus',darkMetal(),[.14,.38,.05],[.27,.27,.27],[Math.PI/2,0,0]);break;
    case 'rug':cloth(p,id==='tarp');break;
    case 'door':door(p,id);break;
    case 'crate': {
      mesh(p,'box',wood(),[0,.55,0],[1.05,1.1,1.05]);for(const x of [-.43,.43])for(const z of [-.54,.54])mesh(p,'box',darkWood(),[x,.55,z],[.13,1.15,.07]);for(const y of [.13,.97])mesh(p,'box',darkWood(),[0,y,.56],[1.1,.13,.07]);mesh(p,'box',darkWood(),[0,.55,.59],[.1,1.3,.07],[0,0,-.65]);
      const number=id.split('_')[1],numberStyle={size:190,width:256,height:256,fg:'#172330',bg:'#fff0c8'};
      plaque(p,number,[0,.65,.64],.54,.54,numberStyle);
      const top=plaque(p,number,[0,1.108,0],.72,.72,numberStyle);top.rotation.x=-Math.PI/2;
      const side=plaque(p,number,[.532,.65,0],.54,.54,numberStyle);side.rotation.y=Math.PI/2;
      const label=dynamic(group(p,[0,0,0],'weight-label'));plaque(label,`${solution.crateWeights[id]} ק״ג`,[0,.22,.65],.85,.25,{size:82,bg:'#dec99f',fg:'#2a2620'});label.visible=false;break;
    }
    case 'scale':mesh(p,'box',darkMetal(),[0,.13,0],[1.9,.26,1.65]);mesh(p,'box',metal(),[0,.3,0],[1.85,.1,1.6]);mesh(p,'cylinder',darkMetal(),[0,1,-.63],[.08,1.5,.08]);
      mesh(p,'cylinder',gold(),[0,1.75,-.58],[.43,.16,.43],[Math.PI/2,0,0]);mesh(p,'cylinder',ivory(),[0,1.75,-.47],[.37,.02,.37],[Math.PI/2,0,0]);
      for(let i=0;i<9;i++){let a=-2.2+i*.55;mesh(p,'box',darkMetal(),[Math.sin(a)*.29,1.75+Math.cos(a)*.29,-.445],[.025,.06,.015],[0,0,-a]);}
      {const needle=dynamic(group(p,[0,1.75,-.42],'needle'));mesh(needle,'box',material('needle','#cb4b40'),[0,.13,0],[.03,.28,.02]);}plaque(p,'ק״ג',[0,1.6,-.4],.25,.12,{bg:'transparent',fg:'#473b2c',size:60});break;
    case 'sign':mesh(p,'box',darkWood(),[0,1.5,0],[1.4,.8,.1]);plaque(p,id==='gate_sign'?`${solution.target} ק״ג בדיוק`:'חריטה עתיקה',[0,1.5,.06],1.3,.65,{size:40});mesh(p,'box',wood(),[0,.7,0],[.12,1.4,.12]);break;
    case 'barrel':mesh(p,'sphere',wood(),[0,.65,0],[.55,.7,.55]);for(const y of [.2,.6,1.07])mesh(p,'torus',darkMetal(),[0,y,0],[.51,.51,.51],[Math.PI/2,0,0]);mesh(p,'cylinder',wood(),[0,1.25,0],[.43,.07,.43]);break;
    case 'sack':mesh(p,'sphere',material('burlap','#b8a273',{roughness:1}),[0,.48,0],[.43,.57,.36]);mesh(p,'torus',wood(),[0,.91,0],[.14,.14,.14],[Math.PI/2,0,0]);plaque(p,'9 ק״ג',[0,.5,.35],.4,.25,{fg:'#332b20',bg:'#d6c7a2'});break;
    case 'anvil':mesh(p,'box',darkWood(),[0,.3,0],[.8,.6,.8]);mesh(p,'box',metal(),[0,.8,0],[.45,.4,.4]);mesh(p,'box',metal(),[0,1.05,0],[1,.18,.5]);mesh(p,'cone',metal(),[.65,1.05,0],[.23,.6,.23],[0,0,-Math.PI/2]);break;
    case 'toolbox':chest(p,def);break;
    case 'magnifier':mesh(p,'torus',gold(),[0,.78,0],[.2,.2,.2]);mesh(p,'cylinder',darkWood(),[0,.48,0],[.06,.36,.06]);mesh(p,'sphere',material('lens','#acd0d8',{transparent:true,opacity:.3,metalness:.4}),[0,.78,0],[.17,.17,.03]);break;
    case 'mirror':mesh(p,'box',gold(),[0,1.8,0],[.9,1.6,.1]);mesh(p,'box',material('mirror','#aecad6',{metalness:.9,roughness:.13}),[0,1.8,.06],[.76,1.46,.02]);p.rotation.y=Math.PI/2;break;
    case 'poster':mesh(p,'plane',material(`poster-${id}`,'#fff',{map:id==='calendar'?paperMap('calendar'):artMap(false),side:THREE.DoubleSide}),[0,1.9,0],[1.2,1.65,1]);mesh(p,'cylinder',gold(),[0,2.74,0],[.035,1.25,.035],[0,0,Math.PI/2]);break;
    case 'armor':mesh(p,'box',darkWood(),[0,.1,0],[.8,.2,.7]);mesh(p,'sphere',metal(),[0,1.3,0],[.4,.5,.25]);mesh(p,'cylinder',darkMetal(),[0,1.85,0],[.12,.25,.12]);for(const x of [-1,1]){mesh(p,'sphere',metal(),[x*.45,1.6,0],[.24,.22,.2]);mesh(p,'cylinder',metal(),[x*.47,1.15,0],[.12,.7,.12]);mesh(p,'cylinder',metal(),[x*.22,.5,0],[.13,.8,.13]);mesh(p,'box',metal(),[x*.22,.15,.15],[.27,.2,.45]);}break;
    case 'banner':mesh(p,'box',gold(),[0,2.85,0],[1.35,.06,.06]);mesh(p,'plane',material('banner','#683c51',{side:THREE.DoubleSide}),[0,1.9,0],[1.1,1.8,1]);mesh(p,'plane',material('banner-stripe','#c8a35c',{side:THREE.DoubleSide}),[0,1.95,.01],[.08,1.65,1]);plaque(p,'◈',[0,2.2,.02],.65,.65,{bg:'transparent',fg:'#e5c991',size:95});p.rotation.y=Math.PI/2;break;
    case 'bones':skull(p,[0,.24,0],.23);for(let i=0;i<3;i++){const bone=group(p,[(i-1)*.26,.13,.4]);bone.rotation.y=i*.9;mesh(bone,'cylinder',ivory(),[0,0,0],[.045,.65,.045],[0,0,Math.PI/2]);for(const x of [-.3,.3])mesh(bone,'sphere',ivory(),[x,0,0],[.075,.06,.08]);}break;
    case 'vault_door': {
      for(const x of [-1.6,1.6])mesh(p,'box',darkMetal(),[x,1.65,-.2],[.3,3.5,.55]);for(const y of [0,3.3])mesh(p,'box',darkMetal(),[0,y,-.2],[3.5,.3,.55]);mesh(p,'torus',metal(),[0,1.7,.15],[1.5,1.5,1.5]);
      const hinge=dynamic(group(p,[-1.4,1.7,.25],'door-leaf'));
      mesh(hinge,'cylinder',metal(),[1.4,0,0],[1.34,.3,1.34],[Math.PI/2,0,0]);mesh(hinge,'torus',gold(),[1.4,0,.18],[1.12,1.12,1.12]);
      for(let i=0;i<12;i++){let a=i*TAU/12;mesh(hinge,'cylinder',darkMetal(),[1.4+Math.sin(a)*1.18,Math.cos(a)*1.18,.21],[.06,.08,.06],[Math.PI/2,0,0]);}
      mesh(hinge,'torus',darkMetal(),[1.4,0,.38],[.45,.45,.45]);for(let i=0;i<3;i++)mesh(hinge,'box',gold(),[1.4,0,.38],[.92,.055,.06],[0,0,i*Math.PI/3]);mesh(hinge,'sphere',gold(),[1.4,0,.4],[.13,.13,.1]);break;
    }
    case 'keypad': {
      mesh(p,'box',darkMetal(),[0,1.7,.44],[.5,.8,.2]);const screen=dynamic(mesh(p,'box',material('key-screen','#70e8c9',{emissive:'#70e8c9',emissiveIntensity:.7}).clone(),[0,1.95,.56],[.36,.13,.025],[0,0,0],'key-screen'));screen.userData.ownedMaterial=true;
      for(let i=0;i<12;i++)mesh(p,'box',material('key','#b3bfc4',{emissive:'#466b70',emissiveIntensity:.15}),[(i%3-1)*.12,1.77-Math.floor(i/3)*.12,.56],[.085,.075,.035]);break;
    }
    case 'seal': {
      const seal=dynamic(group(p,[0,0,0],'seal'));mesh(seal,'box',material('rust','#9f542e',{roughness:1}),[0,1.55,.49],[.38,.8,.14]);mesh(seal,'torus',gold(),[0,1.58,.61],[.17,.17,.17]);break;
    }
    case 'board':mesh(p,'box',darkWood(),[0,1.9,0],[2.1,1.75,.14]);mesh(p,'box',material('cork','#aa8759'),[0,1.9,.085],[1.95,1.6,.035]);
      // Background scraps are anonymous set dressing, distinct from the five hidden papers.
      for(let i=0;i<7;i++){mesh(p,'plane',material('board-scrap','#bfae8b',{map:paperMap('scrap')}),[(i%3-1)*.56,1.4+Math.floor(i/3)*.48,.11],[.43,.37,1],[0,0,(i-3)*.06]);mesh(p,'sphere',material('pin','#993f37'),[(i%3-1)*.56,1.54+Math.floor(i/3)*.48,.13],[.025,.025,.02]);}p.rotation.y=.6;break;
    case 'paper':case 'note':mesh(p,'box',ivory(),[0,.01,0],[.5,.02,.6]);mesh(p,'plane',material(`paper-${id}`,'#fff',{map:paperMap(id)}),[0,.022,0],[.48,.58,1],[-Math.PI/2,0,0]);if(id==='papers_pile')for(let i=0;i<4;i++)mesh(p,'box',ivory(),[0,-.02-i*.025,0],[.5,.02,.6],[0,i*.05,0]);break;
    case 'cabinet':cupboard(p,def);p.rotation.y=def.x<0?.4:-.4;break;
    case 'safe':mesh(p,'box',darkMetal(),[0,.5,0],[1.1,1,.8]);mesh(p,'box',metal(),[-.4,.5,.55],[.9,.85,.13],[0,-.6,.08]);mesh(p,'torus',gold(),[-.3,.5,.67],[.15,.15,.15]);break;
    case 'chest':chest(p,def);break;
    case 'coin':mesh(p,'cylinder',gold(),[0,.95,0],[.16,.035,.16]);break;
    case 'gold':{const rng=random(574);for(let i=0;i<32;i++)mesh(p,'cylinder',gold(),[(rng()-.5)*1.1,.08+rng()*.25,(rng()-.5)*.8],[.11,.045,.11],[rng()*.2,0,rng()*.2]);for(let i=0;i<3;i++)mesh(p,'box',gold(),[i*.28-.28,.2,-.3],[.24,.18,.45]);break;}
    case 'telescope':for(let i=0;i<3;i++)mesh(p,'cylinder',darkWood(),[Math.sin(i*TAU/3)*.3,.6,Math.cos(i*TAU/3)*.3],[.04,1.2,.04],[Math.cos(i*TAU/3)*.4,0,-Math.sin(i*TAU/3)*.4]);mesh(p,'cylinder',gold(),[0,1.4,0],[.16,1.5,.16],[.8,0,Math.PI/2]);mesh(p,'sphere',material('telescope-lens','#7ea8b1',{metalness:.7,roughness:.15}),[-.55,1.4,.42],[.17,.17,.04],[0,-.7,0]);break;
    default:mesh(p,'rounded',textured('cloth'),[0,.22,0],[.55,.4,.45]);mesh(p,'box',gold(),[0,.25,.23],[.28,.12,.025]);
  }
  compact(p,`${room}:${id}`);
  // Small models share a floor-level origin, so they sit on real furniture surfaces.
  if(def.parent&&!['crate','drawer','door','keypad','seal'].includes(def.kind)){
    const position=p.position.clone(),rotation=p.rotation.clone();p.position.set(0,0,0);p.rotation.set(0,0,0);p.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(p),height=bounds.max.y-bounds.min.y;
    p.children.forEach(child=>child.position.y-=bounds.min.y);
    const size={bottle:.48,book:.53,globe:.55,candles:.48,statue:.52,rack:.58,skull:.32,sack:1,chest:.4}[def.kind]||.38;
    p.scale.setScalar(Math.min(1,size/Math.max(.01,height))*(def.parent==='desk_drawer'?.55:1));p.position.copy(position);p.rotation.copy(rotation);
  }
  p.userData.restScale=p.scale.clone();p.visible=!def.hidden;return p;
}
function skull(parent,pos,s){const k=group(parent,pos);mesh(k,'sphere',ivory(),[0,0,0],[s,s*.9,s*.8]);for(const x of [-1,1])mesh(k,'sphere',darkMetal(),[x*s*.4,s*.06,s*.7],[s*.25,s*.27,s*.12]);mesh(k,'box',ivory(),[0,-s*.65,s*.35],[s*1.1,s*.5,s*.7]);for(let i=0;i<4;i++)mesh(k,'box',darkWood(),[(i-1.5)*s*.2,-s*.7,s*.72],[s*.04,s*.25,s*.02]);}

export function makeRobot(name,color){
  const root=group(null);root.name='robot';root.scale.setScalar(1.6);const body=group(root,[0,0,0],'robot-body');const shell=physical('robot-shell',color,{metalness:.25,roughness:.23,clearcoat:1,clearcoatRoughness:.12,emissive:color,emissiveIntensity:.07});const white=physical('robot-white','#f8fcff',{metalness:.05,roughness:.22,clearcoat:1,emissive:'#cde4ef',emissiveIntensity:.03});const joint=darkMetal();
  mesh(body,'rounded',shell,[0,.92,0],[.65,.6,.46]);mesh(body,'rounded',white,[0,.94,.25],[.4,.3,.06]);mesh(body,'sphere',material('chest-core',color,{emissive:color,emissiveIntensity:1.5}),[0,.98,.3],[.08,.08,.03]);
  const head=group(body,[0,1.48,0],'head');mesh(head,'rounded',shell,[0,0,0],[.87,.6,.62]);mesh(head,'rounded',white,[0,0,.32],[.73,.39,.08]);
  for(const [i,x] of [-.2,.2].entries()){mesh(head,'rounded',joint,[x,.02,.371],[.19,.19,.025]);mesh(head,'rounded',material('visor',color,{emissive:color,emissiveIntensity:2.4}),[x,.02,.39],[.115,.12,.02],[0,0,0],`eye-${i}`);}
  mesh(head,'cylinder',joint,[0,.4,0],[.025,.3,.025]);mesh(head,'sphere',material('antenna',color,{emissive:color,emissiveIntensity:2}),[0,.57,0],[.075,.075,.075]);
  for(const side of [-1,1]){const arm=group(body,[side*.47,1.13,0],side===1?'right-arm':'left-arm');mesh(arm,'sphere',joint,[0,0,0],[.13,.13,.13]);mesh(arm,'box',shell,[0,-.21,0],[.19,.34,.2]);mesh(arm,'sphere',white,[0,-.43,0],[.13,.13,.13]);const leg=group(body,[side*.21,.5,0],side===1?'right-leg':'left-leg');mesh(leg,'cylinder',joint,[0,-.17,0],[.09,.35,.09]);mesh(leg,'box',white,[0,-.39,.08],[.25,.17,.38]);}
  group(body,[.56,.9,.38],'held-slot');
  const beam=mesh(head,'cone',material('scan-beam',color,{transparent:true,opacity:.11,depthWrite:false,side:THREE.DoubleSide,emissive:color,emissiveIntensity:.4}),[0,0,1.15],[.6,1.7,.6],[-Math.PI/2,0,0],'scan');beam.visible=false;beam.castShadow=false;
  const contact=mesh(root,'plane',new THREE.MeshBasicMaterial({map:floorGlow(true),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}),[0,.018,0],[1.25,1.1,1],[-Math.PI/2,0,0]);contact.castShadow=false;contact.userData.ownedMaterial=true;
  const ring=mesh(root,'plane',new THREE.MeshBasicMaterial({map:floorGlow(),color,transparent:true,opacity:.5,depthWrite:false,blending:THREE.AdditiveBlending}),[0,.023,0],[1.9,1.9,1],[-Math.PI/2,0,0]);ring.castShadow=false;ring.userData.ownedMaterial=true;
  const label=new THREE.Sprite(new THREE.SpriteMaterial({map:textMap(name,{fg:'#071523',bg:color,size:80}),depthTest:false,depthWrite:false,transparent:true,toneMapped:false}));label.name='name-label';label.position.set(0,2.35,0);label.scale.set(1.9,.55,1);label.renderOrder=5;root.add(label);
  return root;
}
export function disposePropGeometry(){for(const g of geometries.values())g.dispose();for(const g of merged.values())g?.dispose();geometries.clear();merged.clear();}
