import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PLANETS, ELEMENTS } from './data.ts';
import type { Planet } from './data.ts';
import { planetPosition } from './physics.ts';
import type { SolarSystem, ImpactInput, ImpactResult } from './physics.ts';

type World = {root:THREE.Group; spin:THREE.Group; mesh:THREE.Mesh; material:THREE.ShaderMaterial; clouds?:THREE.Mesh; scars:THREE.Group; label:HTMLButtonElement};
const vertex=`varying vec2 vUv; varying vec3 vNormal; varying vec3 vWorld;
void main(){vUv=uv;vNormal=normalize(mat3(modelMatrix)*normal);vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`;
const surface=`uniform sampler2D dayMap;uniform sampler2D nightMap;uniform vec3 sunDir;uniform vec3 tint;uniform float earth;uniform float star;
varying vec2 vUv;varying vec3 vNormal;varying vec3 vWorld;
void main(){vec3 n=normalize(vNormal);vec3 viewDir=normalize(cameraPosition-vWorld);float d=dot(n,normalize(sunDir));
vec3 day=texture2D(dayMap,vUv).rgb;day=pow(day,vec3(2.2));
float diffuse=max(d,0.);vec3 color=day*(.025+diffuse*1.5);
if(earth>.5){vec3 night=pow(texture2D(nightMap,vUv).rgb,vec3(2.2));color+=night*smoothstep(.12,-.2,d)*1.3;
float ocean=step(day.r*1.3,day.b)*step(day.g*.9,day.b);vec3 halfD=normalize(normalize(sunDir)+viewDir);color+=vec3(.38,.5,.6)*pow(max(dot(n,halfD),0.),75.)*ocean*diffuse;
float rim=pow(1.-max(dot(n,viewDir),0.),3.5);color+=vec3(.04,.22,.52)*rim*smoothstep(-.3,.8,d);}
if(star>.5)color=day*2.3+vec3(.26,.085,.008);
gl_FragColor=vec4(color,1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;
const atmosphere=`uniform vec3 glow;uniform vec3 sunDir;varying vec3 vNormal;varying vec3 vWorld;
void main(){vec3 n=normalize(vNormal);vec3 v=normalize(cameraPosition-vWorld);float rim=pow(max(0.,1.-abs(dot(n,v))),3.);
float light=smoothstep(-.35,.8,dot(n,normalize(sunDir)));gl_FragColor=vec4(glow,rim*light*.56);}`;

function rng(seed:number){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t^=t+Math.imul(t^t>>>7,61|t);return ((t^t>>>14)>>>0)/4294967296;};}
function glowTexture(){const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d')!;const g=ctx.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,'rgba(255,246,220,1)');g.addColorStop(.14,'rgba(255,200,120,.9)');g.addColorStop(.4,'rgba(255,118,35,.25)');g.addColorStop(1,'rgba(255,60,0,0)');ctx.fillStyle=g;ctx.fillRect(0,0,128,128);return new THREE.CanvasTexture(c);}
function craterTexture(gas=false){
 const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d')!;
 const g=ctx.createRadialGradient(128,128,0,128,128,126);
 g.addColorStop(0,gas?'rgba(23,14,12,.92)':'rgba(25,13,8,.95)');g.addColorStop(.4,'rgba(38,20,12,.94)');g.addColorStop(.57,'rgba(85,53,28,.87)');g.addColorStop(.7,gas?'rgba(58,37,25,.4)':'rgba(187,128,64,.78)');g.addColorStop(.79,'rgba(70,42,22,.45)');g.addColorStop(1,'rgba(30,20,10,0)');ctx.fillStyle=g;ctx.fillRect(0,0,256,256);
 const random=rng(42);for(let i=0;i<2200;i++){const x=random()*256,y=random()*256,r=Math.hypot(x-128,y-128)/128;if(r<.88){ctx.fillStyle=`rgba(${random()>.5?'237,186,111':'0,0,0'},${.12*(1-r)})`;ctx.fillRect(x,y,random()*3,random()*3);}}
 return new THREE.CanvasTexture(c);
}

export class Observatory {
 renderer:THREE.WebGLRenderer;scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(38,1,.005,5000);controls:OrbitControls;
 worlds=new Map<string,World>();view:'planet'|'system'='planet';selected='earth';trueScale=false;showOrbits=true;showLabels=true;
 root=new THREE.Group();orbitGroup=new THREE.Group();belt=new THREE.Group();worldGroup=new THREE.Group();
 targetLocal:THREE.Vector3|null=null;aiming=false;targetMarker:THREE.Group;
 private manager=new THREE.LoadingManager();private loader:THREE.TextureLoader;private textures=new Map<string,THREE.Texture>();
 private glow=glowTexture();private crater=craterTexture();private gasScar=craterTexture(true);
 private desiredCamera:THREE.Vector3|null=null;private selectedJD=2451545;private mobile=false;private lastSpinJD=0;
 private entry:{group:THREE.Group;rock:THREE.Mesh;trail:THREE.Line;flash:THREE.Sprite;ring:THREE.Mesh;dust:THREE.Points;velocities:Float32Array;result:ImpactResult;input:ImpactInput;t:number;done:boolean;recordScar:boolean;onFinish:()=>void;onHit:()=>void}|null=null;
 onSelect:(id:string)=>void=()=>{};onTarget:(lat:number,lon:number)=>void=()=>{};onFrame:(fps:number)=>void=()=>{};
 container:HTMLElement;labelContainer:HTMLElement;private frameCounter=0;private fpsTime=0;private reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 constructor(container:HTMLElement,labelContainer:HTMLElement,onReady:()=>void,onError:(message:string)=>void){
  this.container=container;this.labelContainer=labelContainer;this.mobile=innerWidth<760;
  this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance',preserveDrawingBuffer:true});
  this.renderer.setPixelRatio(Math.min(devicePixelRatio,this.mobile?1.6:2));this.renderer.setClearColor(0x000000,0);this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.3;
  container.append(this.renderer.domElement);this.renderer.domElement.setAttribute('aria-label','Interactive 3D solar system. Drag to orbit, pinch or scroll to zoom.');
  this.renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();onError('The graphics context was interrupted. Reload to reopen the observatory.');});
  this.manager.onLoad=onReady;this.manager.onError=url=>onError(`A planet texture could not load: ${url}. Reload to try again.`);this.loader=new THREE.TextureLoader(this.manager);
  this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=true;this.controls.dampingFactor=.07;this.controls.enablePan=false;this.controls.minDistance=1.12;this.controls.maxDistance=12;this.controls.rotateSpeed=.55;this.controls.zoomSpeed=.75;
  this.controls.addEventListener('start',()=>{this.desiredCamera=null;});
  this.scene.add(this.root);this.root.add(this.worldGroup,this.orbitGroup,this.belt);this.scene.add(new THREE.AmbientLight(0xffffff,.14));
  const light=new THREE.DirectionalLight(0xffefdc,2);light.position.set(-4,3,6);this.scene.add(light);
  this.makeStars();
  for(const p of PLANETS)this.makeWorld(p);
  this.makeOrbits();this.makeBelt();this.targetMarker=this.makeTarget();
  this.focus('earth',true);
  new ResizeObserver(()=>this.resize()).observe(container);
  let down={x:0,y:0};container.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY};});
  container.addEventListener('pointerup',e=>{if(Math.hypot(e.clientX-down.x,e.clientY-down.y)<7)this.pick(e.clientX,e.clientY);});
 }
 texture(name:string){if(!this.textures.has(name)){const t=this.loader.load(`/textures/${name}`);t.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());this.textures.set(name,t);}return this.textures.get(name)!;}
 makeWorld(p:Planet){
  const root=new THREE.Group(),spin=new THREE.Group(),scars=new THREE.Group();root.add(spin);spin.rotation.z=p.tilt*Math.PI/180;
  const mat=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:surface,uniforms:{dayMap:{value:this.texture(p.id+'.jpg')},nightMap:{value:this.texture('earth-night.jpg')},sunDir:{value:new THREE.Vector3(-3,1.5,4)},tint:{value:new THREE.Color(p.color)},earth:{value:p.id==='earth'?1:0},star:{value:p.id==='sun'?1:0}}});
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,this.mobile?80:128,this.mobile?48:80),mat);spin.add(mesh);mesh.add(scars);mesh.userData.id=p.id;
  if(p.atmosphere){
   const a=new THREE.Mesh(new THREE.SphereGeometry(1.018,80,48),new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:atmosphere,uniforms:{glow:{value:new THREE.Color(p.id==='earth'?'#4d9cff':p.color)},sunDir:mat.uniforms.sunDir},transparent:true,side:THREE.BackSide,blending:THREE.AdditiveBlending,depthWrite:false}));root.add(a);
  }
  let clouds:THREE.Mesh|undefined;
  if(p.id==='earth'){
   clouds=new THREE.Mesh(new THREE.SphereGeometry(1.005,96,64),new THREE.MeshPhongMaterial({map:this.texture('clouds.jpg'),alphaMap:this.texture('clouds.jpg'),transparent:true,opacity:.52,depthWrite:false,shininess:8}));spin.add(clouds);
  }
  if(p.id==='saturn'||p.id==='uranus'){
   const inner=p.id==='saturn'?1.23:1.8,outer=p.id==='saturn'?2.32:2.06;
   const geo=new THREE.RingGeometry(inner,outer,180,8),positions=geo.attributes.position,uv=geo.attributes.uv;
   for(let i=0;i<positions.count;i++)uv.setXY(i,(Math.hypot(positions.getX(i),positions.getY(i))-inner)/(outer-inner),.5);
   const rings=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({map:this.texture('saturn-ring.png'),color:p.id==='saturn'?'#dccdab':'#6c9d9e',transparent:true,opacity:p.id==='saturn'?.87:.3,side:THREE.DoubleSide,depthWrite:false}));rings.rotation.x=-Math.PI/2;spin.add(rings);
  }
  if(p.id==='sun'){
   const halo=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glow,color:'#ffb86c',blending:THREE.AdditiveBlending,depthWrite:false,opacity:.75}));halo.scale.setScalar(6);root.add(halo);
  }
  const label=document.createElement('button');label.className='world-label';label.textContent=p.name;label.ariaLabel=`Focus ${p.name}`;label.onclick=()=>this.onSelect(p.id);this.labelContainer.append(label);
  this.worlds.set(p.id,{root,spin,mesh,material:mat,clouds,scars,label});this.worldGroup.add(root);
 }
 makeStars(){
  const random=rng(2517),n=this.mobile?2600:5500,pos=new Float32Array(n*3),colors=new Float32Array(n*3),sizes=new Float32Array(n);
  for(let i=0;i<n;i++){const z=random()*2-1,a=random()*Math.PI*2,r=1200,rr=Math.sqrt(1-z*z);pos.set([Math.cos(a)*rr*r,z*r,Math.sin(a)*rr*r],i*3);const b=.25+random()*.6;colors.set([b*(.8+random()*.2),b*(.9+random()*.1),b],i*3);sizes[i]=random()>.99?2.2:.5+random();}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('color',new THREE.BufferAttribute(colors,3));g.setAttribute('size',new THREE.BufferAttribute(sizes,1));
  const m=new THREE.ShaderMaterial({vertexColors:true,transparent:true,depthWrite:false,vertexShader:`attribute float size;varying vec3 c;void main(){c=color;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=size*1.6;}`,fragmentShader:`varying vec3 c;void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;gl_FragColor=vec4(c,smoothstep(.5,.05,d)*.8);}`});this.scene.add(new THREE.Points(g,m));
 }
 mapPosition(pos:number[],id:string){
  const v=new THREE.Vector3(pos[0],pos[2],-pos[1]);
  if(this.trueScale)return v.multiplyScalar(1.15);
  if(id==='sun')return v.multiplyScalar(3);
  const idx=PLANETS.findIndex(p=>p.id===id),a=ELEMENTS[id][0][0];return v.multiplyScalar((3.7+idx*2.8)/a);
 }
 makeOrbits(){
  for(const child of [...this.orbitGroup.children]){this.orbitGroup.remove(child);(child as THREE.Line).geometry.dispose();((child as THREE.Line).material as THREE.Material).dispose();}
  for(const p of PLANETS.slice(1)){
   const pts:THREE.Vector3[]=[];for(let i=0;i<=256;i++){const pos=planetPosition(p.id,2451545+p.year*i/256);pts.push(this.mapPosition(pos,p.id));}
   const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:p.color,transparent:true,opacity:.18}));this.orbitGroup.add(line);
  }
 }
 makeBelt(){
  const random=rng(21),pos=new Float32Array(1800*3);
  for(let i=0;i<1800;i++){const a=random()*Math.PI*2,r=15.5+random()*1.5;pos.set([Math.cos(a)*r,(random()-.5)*.25,Math.sin(a)*r],i*3);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));this.belt.add(new THREE.Points(g,new THREE.PointsMaterial({color:'#a99c87',size:.025,transparent:true,opacity:.3,sizeAttenuation:true})));
 }
 makeTarget(){
  const group=new THREE.Group();const ring=new THREE.Mesh(new THREE.RingGeometry(.034,.037,48),new THREE.MeshBasicMaterial({color:'#e9ba7d',transparent:true,opacity:.9,side:THREE.DoubleSide,depthTest:false}));group.add(ring);
  for(let i=0;i<4;i++){const a=i*Math.PI/2,pts=[new THREE.Vector3(Math.cos(a)*.046,Math.sin(a)*.046,0),new THREE.Vector3(Math.cos(a)*.068,Math.sin(a)*.068,0)];group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:'#e9ba7d',depthTest:false})));}group.renderOrder=10;return group;
 }
 resize(){
  const {width:w,height:h}=this.container.getBoundingClientRect();this.mobile=innerWidth<760;this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();
 }
 focus(id:string,instant=false){
  this.clearEvent();this.selected=id;this.view='planet';this.targetLocal=null;this.aiming=false;this.targetMarker.removeFromParent();
  for(const [key,w] of this.worlds){w.root.visible=key===id;w.root.position.set(0,0,0);w.root.scale.setScalar(1);w.label.hidden=true;}
  this.orbitGroup.visible=false;this.belt.visible=false;this.controls.target.set(0,0,0);this.controls.minDistance=1.08;this.controls.maxDistance=18;
  const distance=id==='saturn'?7:4.8;
  const sun=(this.worlds.get(id)!.material.uniforms.sunDir.value as THREE.Vector3).clone().normalize();
  this.desiredCamera=sun.applyAxisAngle(new THREE.Vector3(0,1,0),.7).add(new THREE.Vector3(0,.15,0)).normalize().multiplyScalar(distance);
  if(instant){this.camera.position.copy(this.desiredCamera);this.desiredCamera=null;}
  this.controls.update();
 }
 system(){
  this.clearEvent();this.view='system';this.targetMarker.removeFromParent();this.controls.target.set(0,0,0);this.controls.minDistance=3;this.controls.maxDistance=150;this.desiredCamera=new THREE.Vector3(2,35,43);this.orbitGroup.visible=this.showOrbits;this.belt.visible=!this.trueScale;
  for(const w of this.worlds.values())w.root.visible=true;
 }
 setScale(real:boolean){this.trueScale=real;this.makeOrbits();this.belt.visible=this.view==='system'&&!real;}
 zoom(multiplier:number){this.desiredCamera=null;this.camera.position.sub(this.controls.target).multiplyScalar(multiplier).clampLength(this.controls.minDistance,this.controls.maxDistance).add(this.controls.target);this.controls.update();}
 setQuality(high:boolean){this.renderer.setPixelRatio(Math.min(devicePixelRatio,high?2:1));this.resize();}
 setClouds(show:boolean){const clouds=this.worlds.get('earth')?.clouds;if(clouds)clouds.visible=show;}
 setVenusSurface(show:boolean){this.worlds.get('venus')!.material.uniforms.dayMap.value=this.texture(show?'venus-surface.jpg':'venus.jpg');}
 setEarthHD(show:boolean){this.worlds.get('earth')!.material.uniforms.dayMap.value=this.texture(show?'earth-hd.jpg':'earth.jpg');}
 setTarget(local:THREE.Vector3){
  this.targetLocal=local.normalize();const w=this.worlds.get(this.selected)!;w.mesh.add(this.targetMarker);this.targetMarker.position.copy(local).multiplyScalar(1.01);this.targetMarker.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),local);
  const lat=Math.asin(local.y)*180/Math.PI,lon=Math.atan2(local.z,-local.x)*180/Math.PI;this.onTarget(lat,lon);this.aiming=false;
 }
 pick(x:number,y:number){
  const rect=this.renderer.domElement.getBoundingClientRect();const pointer=new THREE.Vector2((x-rect.left)/rect.width*2-1,-(y-rect.top)/rect.height*2+1);const ray=new THREE.Raycaster();ray.setFromCamera(pointer,this.camera);
  if(this.view==='system'){
   const hit=ray.intersectObjects([...this.worlds.values()].map(w=>w.mesh))[0];if(hit)this.onSelect(hit.object.userData.id);
  }else if(this.aiming){const w=this.worlds.get(this.selected)!;const hit=ray.intersectObject(w.mesh,false)[0];if(hit)this.setTarget(w.mesh.worldToLocal(hit.point.clone()));}
 }
 launch(input:ImpactInput,result:ImpactResult,onHit:()=>void,onFinish:()=>void,recordScar=true){
  this.clearEvent();const w=this.worlds.get(this.selected)!;
  if(!this.targetLocal){const direction=this.camera.position.clone().normalize();this.setTarget(w.mesh.worldToLocal(direction));}
  const normal=this.targetLocal!;const group=new THREE.Group();group.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),normal);w.mesh.add(group);
  const rockGeo=new THREE.IcosahedronGeometry(1,2),random=rng(67);const pos=rockGeo.attributes.position;for(let i=0;i<pos.count;i++){const f=.8+random()*.4;pos.setXYZ(i,pos.getX(i)*f,pos.getY(i)*f,pos.getZ(i)*f);}rockGeo.computeVertexNormals();
  const rock=new THREE.Mesh(rockGeo,new THREE.MeshStandardMaterial({color:'#6e6052',roughness:1,emissive:'#fa541c',emissiveIntensity:.5}));rock.scale.setScalar(Math.max(.012,Math.min(.07,Math.sqrt(input.diameter)*.00065)));group.add(rock);
  const tailGeo=new THREE.BufferGeometry().setFromPoints(Array.from({length:80},()=>new THREE.Vector3()));const trail=new THREE.Line(tailGeo,new THREE.LineBasicMaterial({color:'#f6b05a',transparent:true,opacity:.8}));group.add(trail);
  const flash=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glow,blending:THREE.AdditiveBlending,depthWrite:false,opacity:0}));flash.position.set(0,0,1.025);group.add(flash);
  const ring=new THREE.Mesh(new THREE.RingGeometry(.94,1,160),new THREE.MeshBasicMaterial({color:'#ffd39d',transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false}));group.add(ring);
  const n=this.mobile?280:800,dustGeo=new THREE.BufferGeometry(),coords=new Float32Array(n*3),velocities=new Float32Array(n*3);
  for(let i=0;i<n;i++){const a=random()*Math.PI*2,vel=.1+random()*.65;velocities.set([Math.cos(a)*vel,Math.sin(a)*vel,.12+random()*.65],i*3);coords.set([0,0,1.01],i*3);}dustGeo.setAttribute('position',new THREE.BufferAttribute(coords,3));
  const dust=new THREE.Points(dustGeo,new THREE.PointsMaterial({color:'#ffc18a',size:.012,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending}));group.add(dust);
  this.entry={group,rock,trail,flash,ring,dust,velocities,result,input,t:0,done:false,recordScar,onHit,onFinish};
  // Ensure the selected surface point is visible before the event.
  const targetWorld=w.mesh.localToWorld(normal.clone()).normalize();this.desiredCamera=targetWorld.clone().multiplyScalar(this.selected==='saturn'?6.5:4.5).add(new THREE.Vector3(0,.3,0));
 }
 private scar(event:NonNullable<Observatory['entry']>){
  const {result,input}=event;if(result.outcome==='airburst'||result.outcome==='meteorites')return;
  const planet=PLANETS.find(p=>p.id===this.selected)!,size=result.outcome==='crater'?result.craterDiameter/planet.radius*.5:Math.sqrt(input.diameter)*.001;
  const radius=Math.min(.35,Math.max(.016,size));
  const geo=new THREE.PlaneGeometry(radius*2,radius*2,20,20),pos=geo.attributes.position;
  for(let i=0;i<pos.count;i++){const x=pos.getX(i),y=pos.getY(i);pos.setZ(i,Math.sqrt(Math.max(.01,1-x*x-y*y))+ .002);}
  const decal=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({map:result.outcome==='crater'?this.crater:this.gasScar,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}));decal.quaternion.copy(event.group.quaternion);this.worlds.get(this.selected)!.scars.add(decal);
  const scars=this.worlds.get(this.selected)!.scars;if(scars.children.length>16){const first=scars.children[0] as THREE.Mesh;scars.remove(first);first.geometry.dispose();(first.material as THREE.Material).dispose();}
 }
 clearScars(){for(const w of this.worlds.values())for(const obj of [...w.scars.children]){w.scars.remove(obj);(obj as THREE.Mesh).geometry.dispose();((obj as THREE.Mesh).material as THREE.Material).dispose();}}
 clearEvent(){if(this.entry){this.entry.group.removeFromParent();this.entry.group.traverse(obj=>{const mesh=obj as THREE.Mesh;if(mesh.geometry)mesh.geometry.dispose();if(mesh.material){const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];mats.forEach(m=>m.dispose());}});this.entry=null;}}
 private updateEvent(dt:number){
  const e=this.entry;if(!e||e.done)return;e.t+=dt;
  const travel=3.3,elapsed=e.t-travel;
  if(elapsed<0){
   const f=1-e.t/travel,angle=e.input.angle*Math.PI/180,dis=3.5*f*f;
   const loc=(d:number)=>new THREE.Vector3(-d*Math.cos(angle),d*.15,1.01+d*Math.sin(angle));
   e.rock.position.copy(loc(dis));e.rock.rotation.x+=dt*2;e.rock.rotation.y+=dt;
   const attr=e.trail.geometry.attributes.position;for(let i=0;i<attr.count;i++){const v=loc(dis+i/attr.count*.75);attr.setXYZ(i,v.x,v.y,v.z);}attr.needsUpdate=true;
   e.flash.position.copy(e.rock.position);e.flash.scale.setScalar(.18);e.flash.material.opacity=.55;
  }else{
   if(e.rock.visible){e.rock.visible=false;e.trail.visible=false;if(e.recordScar)this.scar(e);e.onHit();}
   const airborne=e.result.outcome==='airburst';const z=airborne?1.01+Math.max(.025,e.result.burstAltitude/PLANETS.find(p=>p.id===this.selected)!.radius):1.015;
   e.flash.position.set(0,0,z);const strength=Math.min(2.5,.35+Math.log10(e.result.entryEnergy/1e10+1)*.22);
   e.flash.scale.setScalar((.1+elapsed*1.4)*strength);e.flash.material.opacity=this.reduced?.2:Math.max(0,.95-elapsed*.35);
   const radius=Math.min(.94,.02+Math.sqrt(elapsed)*.34*strength);e.ring.scale.setScalar(radius);e.ring.position.set(0,0,Math.sqrt(1-radius*radius)+.009);(e.ring.material as THREE.MeshBasicMaterial).opacity=Math.max(0,.75-elapsed*.15);
   const attr=e.dust.geometry.attributes.position;for(let i=0;i<attr.count;i++){const v=e.velocities;attr.setXYZ(i,v[i*3]*elapsed*.6,v[i*3+1]*elapsed*.6,z+v[i*3+2]*elapsed*.5-elapsed*elapsed*.065);}attr.needsUpdate=true;(e.dust.material as THREE.PointsMaterial).opacity=Math.max(0,1-elapsed*.22);
   if(elapsed>5){e.done=true;e.onFinish();e.flash.material.opacity=0;(e.ring.material as THREE.MeshBasicMaterial).opacity=0;(e.dust.material as THREE.PointsMaterial).opacity=0;}
  }
 }
 update(sim:SolarSystem,dt:number,now:number){
  this.selectedJD=sim.jd;const sun=sim.bodies[0].position;
  for(const p of PLANETS){const w=this.worlds.get(p.id)!;const b=sim.bodies.find(b=>b.id===p.id)!;
   if(!this.entry||this.entry.done){w.spin.rotation.set(0,0,p.tilt*Math.PI/180);w.mesh.rotation.y=((sim.jd-2451545)*24/p.rotation*Math.PI*2)%(Math.PI*2);if(w.clouds)w.clouds.rotation.y=w.mesh.rotation.y;}
   if(this.view==='system'){
    w.root.position.copy(this.mapPosition(b.position.map((v,i)=>v-sun[i]),p.id));const s=p.id==='sun'?.95:.12+Math.pow(p.radius/6371000,.52)*.14;w.root.scale.setScalar(s);
    (w.material.uniforms.sunDir.value as THREE.Vector3).copy(w.root.position).negate();
    w.label.hidden=!this.showLabels;const projected=w.root.position.clone().project(this.camera);const rect=this.container.getBoundingClientRect();
    w.label.style.transform=`translate(${(projected.x*.5+.5)*rect.width}px,${(-projected.y*.5+.5)*rect.height+12}px)`;w.label.style.display=projected.z>1?'none':'';
   }else{
    // Sunward direction in the same ecliptic world frame as the orbit model.
    (w.material.uniforms.sunDir.value as THREE.Vector3).set(sun[0]-b.position[0],sun[2]-b.position[2],b.position[1]-sun[1]).normalize();
   }
  }
  if(this.desiredCamera){this.camera.position.lerp(this.desiredCamera,1-Math.exp(-dt*4));if(this.camera.position.distanceTo(this.desiredCamera)<.01)this.desiredCamera=null;}
  this.controls.update();this.updateEvent(dt);this.renderer.render(this.scene,this.camera);
  this.frameCounter++;if(now-this.fpsTime>1000){this.onFrame(Math.round(this.frameCounter*1000/(now-this.fpsTime)));this.frameCounter=0;this.fpsTime=now;}
 }
 screenshot(){const a=document.createElement('a');a.download=`asterion-${this.selected}.png`;a.href=this.renderer.domElement.toDataURL('image/png');a.click();}
}
