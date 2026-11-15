import * as THREE from 'three';

// All canvases/materials are cached across the four worlds. Nothing is downloaded
// except Three.js and the font; even the paintings and tile decals are procedural.
const textures = new Map();
const materials = new Map();
export const palette = { red:'#f74f60', yellow:'#ffd255', blue:'#589dff', orange:'#ff8735', green:'#80ee8b', purple:'#b485ff', black:'#302b37', brown:'#8d6741', silver:'#dce9ee', clear:'#b7ebef' };
export function random(seed=42) { let s=seed>>>0; return ()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;}; }
export function canvasTexture(key, draw, width=512, height=512, color=true) {
  if(textures.has(key)) return textures.get(key);
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  draw(canvas.getContext('2d'),width,height);
  const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=color?THREE.SRGBColorSpace:THREE.NoColorSpace;
  tex.anisotropy=8;textures.set(key,tex);return tex;
}
export function surface(kind, rough=false) {
  return canvasTexture(`${kind}-${rough}`, (c,w,h)=>{
    const rng=random(8791); const fill=(col,x,y,ww,hh)=>{c.fillStyle=col;c.fillRect(x,y,ww,hh);};
    if(kind==='wood') {
      fill(rough?'#999':'#30251c',0,0,w,h);
      for(let row=0;row<8;row++) {const yy=row*64;
        for(let col=-1;col<3;col++) {const xx=col*256+(row%2)*128;
          fill(rough?`hsl(0 0% ${50+rng()*25}%)`:`hsl(${26+rng()*8} 33% ${28+rng()*8}%)`,xx+2,yy+2,252,60);
          for(let j=0;j<28;j++){c.strokeStyle=rough?'#bbb3':'#1a110d30';c.lineWidth=.5+rng()*1.2;c.beginPath();let gy=yy+4+rng()*54;c.moveTo(xx,gy);c.bezierCurveTo(xx+80,gy+rng()*5,xx+160,gy-4,xx+256,gy+1);c.stroke();}
          fill(rough?'#aaa':'#201b16',xx+12,yy+9,3,3);fill(rough?'#aaa':'#201b16',xx+238,yy+48,3,3);
        }
      }
    } else if(kind==='stone') {
      fill(rough?'#ddd':'#302f31',0,0,w,h);
      for(let row=0;row<8;row++)for(let col=-1;col<4;col++){let x=col*170+(row%2)*85,y=row*64,v=31+rng()*15;
        fill(rough?`hsl(0 0% ${60+rng()*25}%)`:`hsl(32 8% ${v}%)`,x+3,y+3,164,58);
        c.strokeStyle=rough?'#ddd':'#b7ab9033';c.strokeRect(x+5,y+5,160,54);
        for(let j=0;j<50;j++)fill(rough?'#9993':'#1a1c2230',x+rng()*160,y+rng()*58,2+rng()*9,1+rng()*3);
      }
    } else if(kind==='metal') {
      fill(rough?'#888':'#6d7d85',0,0,w,h);
      for(let i=0;i<2200;i++){let y=rng()*h;c.strokeStyle=rough?`rgba(255,255,255,${rng()*.2})`:`rgba(${rng()>.5?'225,237,240':'21,35,43'},${rng()*.16})`;c.beginPath();c.moveTo(rng()*w,y);c.lineTo(rng()*w,y);c.stroke();}
      c.strokeStyle=rough?'#bbb':'#27373f';c.lineWidth=3;c.strokeRect(2,2,w-4,h-4);
      for(const x of [15,w-15])for(const y of [15,h-15]){c.fillStyle=rough?'#ddd':'#35454e';c.beginPath();c.arc(x,y,4,0,Math.PI*2);c.fill();}
    } else if(kind==='cloth') {
      fill(rough?'#aaa':'#697e77',0,0,w,h);
      for(let i=0;i<w;i+=4){fill('#e2dcc224',i,0,1,h);fill('#1d343028',0,i,w,1);}
      for(let i=0;i<15;i++){const x=rng()*w,y=rng()*h;c.fillStyle='#35483e30';c.beginPath();c.ellipse(x,y,20+rng()*50,5+rng()*12,rng()*3,0,7);c.fill();}
      c.strokeStyle='#c8b88e';c.lineWidth=5;c.strokeRect(12,12,w-24,h-24);
    } else if(kind==='rug') {
      fill('#6f3544',0,0,w,h);c.strokeStyle='#caa36a';c.lineWidth=9;c.strokeRect(24,24,w-48,h-48);c.lineWidth=3;c.strokeRect(40,40,w-80,h-80);
      for(let x=80;x<w-60;x+=70)for(let y=80;y<h-60;y+=70){c.save();c.translate(x,y);c.rotate(Math.PI/4);c.strokeStyle='#c89464';c.strokeRect(-18,-18,36,36);c.fillStyle='#334851';c.fillRect(-9,-9,18,18);c.restore();}
      for(let y=0;y<h;y+=3)fill('#efdab60b',0,y,w,1);
    } else {
      fill(rough?'#ccc':'#74756f',0,0,w,h);
      for(let i=0;i<22000;i++){let v=rng()>.5?'255,255,255':'0,0,0';fill(`rgba(${v},${rng()*.10})`,rng()*w,rng()*h,1+rng()*3,1+rng()*2);}
      c.strokeStyle=rough?'#999':'#353a3b';c.lineWidth=2;c.strokeRect(0,0,w,h);
    }
  });
}
export function material(name, color='#ffffff', options={}) {
  const key=`${name}:${color}:${JSON.stringify(options)}`;
  if(materials.has(key))return materials.get(key);
  const m=new THREE.MeshStandardMaterial({color,roughness:.72,envMapIntensity:.08,...options});materials.set(key,m);return m;
}
export function physical(name,color,options={}){
  const key=`physical:${name}:${color}:${JSON.stringify(options)}`;
  if(!materials.has(key))materials.set(key,new THREE.MeshPhysicalMaterial({color,roughness:.3,envMapIntensity:.2,...options}));
  return materials.get(key);
}
export function labelMaterial(text,options={}){
  const key=`label:${text}:${JSON.stringify(options)}`;
  // Ink stays legible under the key light, instead of blowing out like metal.
  if(!materials.has(key))materials.set(key,new THREE.MeshBasicMaterial({map:textMap(text,options),side:THREE.DoubleSide}));
  return materials.get(key);
}
export function frostMap(){
  return canvasTexture('frost',(c,w,h)=>{
    const rng=random(321);c.fillStyle='#7d9da7';c.fillRect(0,0,w,h);
    for(let i=0;i<11000;i++){c.fillStyle=`rgba(240,255,255,${rng()*.23})`;c.fillRect(rng()*w,rng()*h,1+rng()*3,1+rng()*3);}
    // Branching fractures, rather than parallel strips resembling fabric.
    for(let i=0;i<22;i++){let x=rng()*w,y=rng()*h;c.beginPath();c.moveTo(x,y);for(let j=0;j<7;j++){x+=(rng()-.5)*100;y+=(rng()-.5)*100;c.lineTo(x,y);if(j%2===0){c.lineTo(x+35,y-22);c.moveTo(x,y);}}c.strokeStyle='#efffff99';c.lineWidth=1+rng()*2;c.stroke();}
    const edge=c.createRadialGradient(w/2,h/2,80,w/2,h/2,w*.66);edge.addColorStop(0,'#e8ffff00');edge.addColorStop(1,'#efffffee');c.fillStyle=edge;c.fillRect(0,0,w,h);
  });
}
export function backdropMap(color){
  return canvasTexture(`backdrop:${color}`,(c,w,h)=>{
    const g=c.createRadialGradient(w*.48,h*.62,0,w*.48,h*.62,w*.75);g.addColorStop(0,color);g.addColorStop(.7,'#263844');g.addColorStop(1,'#1b2938');c.fillStyle=g;c.fillRect(0,0,w,h);
  },512,256);
}
export function floorGlow(shadow=false){
  return canvasTexture(`floor-glow:${shadow}`,(c,w,h)=>{
    const g=c.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);g.addColorStop(0,shadow?'#000000b0':'#ffffff44');g.addColorStop(.45,shadow?'#00000070':'#ffffff88');g.addColorStop(.64,shadow?'#00000025':'#ffffff44');g.addColorStop(1,'#00000000');c.fillStyle=g;c.fillRect(0,0,w,h);
  },128,128);
}
export function textured(kind,color='#ffffff') {
  const key=`surface:${kind}:${color}`;if(materials.has(key))return materials.get(key);
  const m=new THREE.MeshStandardMaterial({color,envMapIntensity:.12,map:surface(kind),roughnessMap:kind==='rug'?null:surface(kind,true),roughness:kind==='metal'?.54:.94,metalness:kind==='metal'?.67:0,bumpMap:surface(kind,true),bumpScale:kind==='stone'?.065:.025});materials.set(key,m);return m;
}
export function textMap(text,{fg='#fcf2d6',bg='#19232d',size=42,width=512,height=128}={}) {
  return canvasTexture(`text:${text}:${fg}:${bg}:${size}:${width}:${height}`,(c,w,h)=>{
    c.clearRect(0,0,w,h);if(bg!=='transparent'){c.fillStyle=bg;c.fillRect(0,0,w,h);c.strokeStyle='#e8cb8d60';c.lineWidth=4;c.strokeRect(5,5,w-10,h-10);}
    c.direction='rtl';c.textAlign='center';c.textBaseline='middle';c.font=`700 ${size}px Heebo, "Segoe UI", Arial`;c.fillStyle=fg;c.fillText(text,w/2,h/2+2,w-20);
  },width,height);
}
export function clockMap(){
  return canvasTexture('clock-dial',(c,w,h)=>{
    c.fillStyle='#fff3d3';c.fillRect(0,0,w,h);c.translate(w/2,h/2);
    c.strokeStyle='#30291f';
    for(let i=0;i<60;i++){const a=i*Math.PI/30,outer=w*.47,inner=w*(i%5===0?.415:.447);c.lineWidth=i%5===0?5:2;c.beginPath();c.moveTo(Math.sin(a)*inner,-Math.cos(a)*inner);c.lineTo(Math.sin(a)*outer,-Math.cos(a)*outer);c.stroke();}
    c.fillStyle='#242831';c.font='bold 54px Arial';c.textAlign='center';c.textBaseline='middle';
    for(let i=1;i<=12;i++){const a=i*Math.PI/6;c.fillText(String(i),Math.sin(a)*w*.34,-Math.cos(a)*h*.34);}
  });
}
export function tileMap(n) {
  const colors=['#65776c','#124dcc','#187634','#c32325','#302284','#8c2522','#087b82','#242832','#6d6a68'];
  return canvasTexture(`tile:${n}`,(c,w,h)=>{
    const unknown=n==='unknown',rng=random(742);c.fillStyle=unknown?'#41454b':'#d2c7ad';c.fillRect(0,0,w,h);
    for(let i=0;i<1700;i++){c.fillStyle=rng()>.5?'#ffffff12':'#00000012';c.fillRect(rng()*w,rng()*h,2+rng()*4,2+rng()*4);}
    c.strokeStyle=unknown?'#777d7a':'#f1e6c9';c.lineWidth=7;c.strokeRect(7,7,w-14,h-14);c.strokeStyle='#171d2855';c.lineWidth=4;c.strokeRect(17,17,w-34,h-34);
    if(unknown){c.strokeStyle='#b9bec31c';c.lineWidth=2;for(let x=-h;x<w;x+=24){c.beginPath();c.moveTo(x,0);c.lineTo(x+h,h);c.stroke();}return;}
    if(n==='mine'){
      const scorch=c.createRadialGradient(128,128,20,128,128,140);scorch.addColorStop(0,'#130d0cff');scorch.addColorStop(.7,'#30211de8');scorch.addColorStop(1,'#30211d00');c.fillStyle=scorch;c.fillRect(0,0,w,h);
      // Draw the skull explicitly so it does not depend on OS emoji fonts.
      c.fillStyle='#ffe4bd';c.beginPath();c.ellipse(128,105,65,64,0,0,Math.PI*2);c.fill();c.fillRect(89,145,78,48);c.fillStyle='#231a19';for(const x of [102,154]){c.beginPath();c.ellipse(x,112,19,24,0,0,Math.PI*2);c.fill();}c.beginPath();c.moveTo(128,131);c.lineTo(116,151);c.lineTo(140,151);c.fill();for(let x=101;x<160;x+=18)c.fillRect(x,169,6,27);
    }else{c.textAlign='center';c.textBaseline='middle';c.font='900 202px Arial';c.fillStyle=colors[n];c.fillText(n===0?'·':String(n),w/2,h/2+12);}
  },256,256);
}
export function glowMap(smoke=false) {
  return canvasTexture(`glow:${smoke}`,(c,w,h)=>{const g=c.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);g.addColorStop(0,smoke?'#ddd9ccdd':'#ffffffff');g.addColorStop(.2,smoke?'#b1b5b3aa':'#fff2b8ee');g.addColorStop(.55,smoke?'#a4aaa075':'#ff9d4e55');g.addColorStop(1,'#00000000');c.fillStyle=g;c.fillRect(0,0,w,h);},128,128);
}
export function artMap(portrait=false){
  return canvasTexture(`art:${portrait}`,(c,w,h)=>{let g=c.createLinearGradient(0,0,0,h);g.addColorStop(0,'#273c4a');g.addColorStop(1,'#a59063');c.fillStyle=g;c.fillRect(0,0,w,h);
    c.fillStyle='#dfc797';c.beginPath();c.arc(380,100,50,0,7);c.fill();
    for(let i=0;i<5;i++){c.fillStyle=['#3c5760','#3d5c59','#385349','#233e3d','#182d32'][i];c.beginPath();c.moveTo(0,h);for(let x=0;x<=w;x+=20)c.lineTo(x,210+i*38+Math.sin(x/90+i)*45);c.lineTo(w,h);c.fill();}
    if(portrait){c.fillStyle='#142733';c.beginPath();c.ellipse(256,470,130,180,0,0,7);c.fill();c.fillStyle='#b89e77';c.beginPath();c.ellipse(256,240,66,91,0,0,7);c.fill();c.fillStyle='#352f27';c.fillRect(185,140,140,60);c.fillRect(160,192,190,17);c.fillStyle='#28252a';c.fillRect(213,238,30,8);c.fillRect(273,238,30,8);}
    c.fillStyle='#b0924f20';c.fillRect(0,0,w,h);
  });
}
// Neutral markings only: readable puzzle facts remain in the engine's discoveries.
export function paperMap(kind='paper'){
  return canvasTexture(`paper:${kind}`,(c,w,h)=>{
    const rng=random(kind.length*741);c.fillStyle=kind==='map'?'#b9ae81':'#ddcfaa';c.fillRect(0,0,w,h);
    for(let i=0;i<1000;i++){c.fillStyle='#7863450c';c.fillRect(rng()*w,rng()*h,2,2);}
    c.strokeStyle='#665f4d';c.lineWidth=3;
    if(kind==='map'){for(let i=0;i<7;i++){c.beginPath();c.moveTo(0,60+i*58);for(let x=0;x<=w;x+=20)c.lineTo(x,60+i*58+Math.sin(x/75+i)*38);c.stroke();}c.beginPath();c.arc(390,120,55,0,7);c.stroke();c.beginPath();c.moveTo(390,55);c.lineTo(390,185);c.moveTo(325,120);c.lineTo(455,120);c.stroke();}
    else if(kind==='calendar'){c.fillStyle='#8e4a40';c.fillRect(0,0,w,85);for(let y=140;y<470;y+=65)for(let x=40;x<470;x+=65){c.strokeRect(x,y,45,45);c.fillStyle='#6f6652';c.fillRect(x+16,y+17,12,9);}}
    else {for(let y=65;y<h-40;y+=30){c.globalAlpha=.3+rng()*.3;c.fillStyle='#675b48';c.fillRect(35,y,180+rng()*245,5);}c.globalAlpha=1;c.strokeStyle='#914c3d';c.beginPath();c.arc(390,390,48,0,7);c.stroke();}
    c.strokeStyle='#7d6b4833';c.strokeRect(12,12,w-24,h-24);
  });
}
export function disposeAssets(){for(const t of textures.values())t.dispose();for(const m of materials.values())m.dispose();textures.clear();materials.clear();}
