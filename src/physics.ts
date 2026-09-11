import { ELEMENTS, MATERIALS, PLANETS, SUN_MASS } from './data.ts';
import type { Planet } from './data.ts';
export const G = 6.67430e-11;
export const AU = 149597870700;
export const DAY = 86400;
const GA = G * SUN_MASS * DAY ** 2 / AU ** 3;
const RAD = Math.PI / 180;
export type Vec3 = [number,number,number];
export const julianDate = (date:Date) => date.getTime() / 86400000 + 2440587.5;
export const fromJulian = (jd:number) => new Date((jd - 2440587.5) * 86400000);
export function solveKepler(m:number,e:number) {
 let E = m;
 for(let n=0;n<40;n++){const d=(E-e*Math.sin(E)-m)/(1-e*Math.cos(E));E-=d;if(Math.abs(d)<1e-13)break;}
 return E;
}
export function planetPosition(id:string,jd:number):Vec3 {
 if(id==='sun')return [0,0,0];
 const pair=ELEMENTS[id]; if(!pair)throw new Error('Unknown planet');
 const t=(jd-2451545)/36525;
 const [a,e,inc,L,peri,node]=pair[0].map((x,i)=>x+pair[1][i]*t);
 const M=((((L-peri)*RAD+Math.PI)%(Math.PI*2))+Math.PI*2)%(Math.PI*2)-Math.PI;
 const E=solveKepler(M,e), x=a*(Math.cos(E)-e), y=a*Math.sqrt(1-e*e)*Math.sin(E);
 const w=(peri-node)*RAD, n=node*RAD, I=inc*RAD;
 return [
  (Math.cos(w)*Math.cos(n)-Math.sin(w)*Math.sin(n)*Math.cos(I))*x+(-Math.sin(w)*Math.cos(n)-Math.cos(w)*Math.sin(n)*Math.cos(I))*y,
  (Math.cos(w)*Math.sin(n)+Math.sin(w)*Math.cos(n)*Math.cos(I))*x+(-Math.sin(w)*Math.sin(n)+Math.cos(w)*Math.cos(n)*Math.cos(I))*y,
  Math.sin(w)*Math.sin(I)*x+Math.cos(w)*Math.sin(I)*y
 ];
}
export interface Body { id:string; mass:number; position:Vec3; velocity:Vec3 }
export class SolarSystem {
 bodies:Body[]; jd:number;
 constructor(jd:number) {
  this.jd=jd;
  this.bodies=PLANETS.map(p=>({id:p.id,mass:p.mass/SUN_MASS,position:planetPosition(p.id,jd),velocity:planetPosition(p.id,jd+.01).map((v,i)=>(v-planetPosition(p.id,jd-.01)[i])/.02) as Vec3}));
  const total=this.bodies.reduce((s,b)=>s+b.mass,0);
  for(const field of ['position','velocity'] as const){
   const center=[0,0,0];for(const b of this.bodies)for(let i=0;i<3;i++)center[i]+=b.mass*b[field][i]/total;
   for(const b of this.bodies)for(let i=0;i<3;i++)b[field][i]-=center[i];
  }
 }
 acceleration():Vec3[]{
  const a:Vec3[]=this.bodies.map(()=>[0,0,0]);
  for(let i=0;i<this.bodies.length;i++)for(let j=i+1;j<this.bodies.length;j++){
   const d=this.bodies[j].position.map((v,k)=>v-this.bodies[i].position[k]);
   const inv=GA/Math.hypot(...d)**3;
   for(let k=0;k<3;k++){a[i][k]+=d[k]*inv*this.bodies[j].mass;a[j][k]-=d[k]*inv*this.bodies[i].mass;}
  }return a;
 }
 advance(days:number){
  if(!Number.isFinite(days)||Math.abs(days)>366)throw new Error('Advance must be finite and no more than 366 days per call');
  if(days===0)return;
  const steps=Math.ceil(Math.abs(days)/.125),dt=days/steps;
  let a=this.acceleration();
  for(let n=0;n<steps;n++){
   for(let j=0;j<this.bodies.length;j++)for(let k=0;k<3;k++){
    this.bodies[j].velocity[k]+=a[j][k]*dt/2;
    this.bodies[j].position[k]+=this.bodies[j].velocity[k]*dt;
   }
   a=this.acceleration();
   for(let j=0;j<this.bodies.length;j++)for(let k=0;k<3;k++)this.bodies[j].velocity[k]+=a[j][k]*dt/2;
  }
  this.jd+=days;
 }
 energy(){
  let E=0;for(let i=0;i<this.bodies.length;i++){
   const b=this.bodies[i];E+=.5*b.mass*Math.hypot(...b.velocity)**2;
   for(let j=i+1;j<this.bodies.length;j++)E-=GA*b.mass*this.bodies[j].mass/Math.hypot(...b.position.map((v,k)=>v-this.bodies[j].position[k]));
  }return E;
 }
 momentum():Vec3 {return [0,1,2].map(k=>this.bodies.reduce((s,b)=>s+b.mass*b.velocity[k],0)) as Vec3;}
}
export interface ImpactInput { diameter:number;speed:number;angle:number;material:keyof typeof MATERIALS }
export interface EntrySample { altitude:number;speed:number;mass:number;energy:number;time:number }
export interface ImpactResult {
 mass:number;entryEnergy:number;surfaceEnergy:number;surfaceSpeed:number;atmosphereEnergy:number;
 craterDiameter:number;craterDepth:number;transientDiameter:number;burstAltitude:number;
 outcome:'crater'|'airburst'|'atmospheric plume'|'meteorites';entryAltitude:number;
 samples:EntrySample[];duration:number;fragmented:boolean;remainingMass:number;bindingRatio:number;warnings:string[];
}
// An explicit reduced-order entry model. SI units internally; speed input is km/s.
// Constant-angle descent, exponential atmosphere, Cd=1, heat transfer Ch=.02,
// dynamic-pressure fragmentation with a capped 7x-radius pancake cloud.
export function calculateImpact(planet:Pick<Planet,'mass'|'radius'|'atmosphere'|'kind'|'targetDensity'>, input:ImpactInput):ImpactResult {
 const {diameter,speed,angle,material}=input;
 if(![diameter,speed,angle].every(Number.isFinite)||diameter<1||diameter>100000||speed<1||speed>100||angle<5||angle>90||!Object.hasOwn(MATERIALS,material))throw new Error('Impact inputs outside supported range');
 if(planet.kind==='star')throw new Error('Stellar impacts are outside this model');
 const mat=MATERIALS[material], mass=mat.density*Math.PI/6*diameter**3;
 const entryEnergy=.5*mass*(speed*1000)**2, entryAltitude=Math.max(100000,(planet.atmosphere?.height??0)*14);
 const sin=Math.sin(angle*RAD), mu=G*planet.mass, isGiant=planet.kind==='gas'||planet.kind==='ice';
 const floor=isGiant ? -(planet.atmosphere?.height??0)*8 : 0;
 let h=entryAltitude,v=speed*1000,m=mass,r=diameter/2,t=0, deposited=0,maxDeposit=0,burstAltitude=0,fragmented=false;
 const samples:EntrySample[]=[{altitude:h,speed:v,mass:m,energy:0,time:0}];
 for(let step=0;step<30000&&h>floor&&m>mass*1e-9;step++){
  const rho=planet.atmosphere ? planet.atmosphere.density*Math.exp(-h/planet.atmosphere.height):0;
  const q=.5*rho*v*v;
  if(q>mat.strength)fragmented=true;
  const dh=Math.min(100,h-floor);
  const dt=Math.min(.1,dh/Math.max(v*sin,1));
  if(fragmented)r=Math.min(diameter*3.5,r+Math.sqrt(Math.max(0,q-mat.strength)/mat.density)*dt);
  const area=Math.PI*r*r;
  const hNext=Math.max(floor,h-v*sin*dt);
  const vGravity=Math.sqrt(v*v+2*mu*(1/(planet.radius+hNext)-1/(planet.radius+h)));
  const nextV=vGravity*Math.exp(-.5*rho*area*vGravity*dt/Math.max(m,1));
  const loss=Math.min(m*.05,.02*.5*rho*area*vGravity**3/mat.heat*dt);
  const nextMass=m-loss;
  const dE=Math.max(0,.5*m*vGravity*vGravity-.5*nextMass*nextV*nextV);
  deposited+=dE;
  const perMeter=dE/Math.max(h-hNext,.001);
  if(perMeter>maxDeposit){maxDeposit=perMeter;burstAltitude=(h+hNext)/2;}
  t+=dt;h=hNext;v=nextV;m=nextMass;
  if(step%12===0)samples.push({altitude:h,speed:v,mass:m,energy:deposited,time:t});
  // Once below hypervelocity, remaining debris falls as meteorites; stop the
  // entry calculation rather than pretending to predict individual fragments.
  if(v<500&&fragmented)break;
 }
 const surfaceEnergy=h<=0&&!isGiant?.5*m*v*v:0;
 const surfaceSpeed=h<=0&&!isGiant?v:0;
 const energetic=surfaceSpeed>3000&&surfaceEnergy>entryEnergy*.01;
 const outcome:ImpactResult['outcome']=isGiant?'atmospheric plume':energetic?'crater':deposited>entryEnergy*.5?'airburst':'meteorites';
 const g=mu/planet.radius**2;
 const survivingDiameter=Math.cbrt(6*m/(Math.PI*mat.density));
 // Collins, Melosh & Marcus (2005), eq. 21: gravity-regime dry rock.
 const transientDiameter=outcome==='crater'?1.161*(mat.density/planet.targetDensity)**(1/3)*survivingDiameter**.78*surfaceSpeed**.44*g**(-.22)*sin**(1/3):0;
 const transition=3200*9.81/g;
 const craterDiameter=transientDiameter*1.25<transition?transientDiameter*1.25:1.17*transientDiameter**1.13/transition**.13;
 const craterDepth=craterDiameter<transition?craterDiameter*.2:294*(craterDiameter/1000)**.301;
 const bindingRatio=entryEnergy/(3*G*planet.mass**2/(5*planet.radius));
 const warnings:string[]=[];
 if(planet.kind==='rocky'&&planet.atmosphere)warnings.push('Atmospheric fragmentation is a simplified pancake model; airburst height is approximate.');
 if(planet.kind==='rocky')warnings.push('Crater estimate assumes uniform dry rock. Oceans, terrain, and target strength are not resolved.');
 if(craterDiameter<200&&craterDiameter>0)warnings.push('Small craters are outside the gravity-scaling regime.');
 if(craterDiameter>planet.radius*.05)warnings.push('Basin-scale event: local crater scaling is outside its reliable range.');
 if(isGiant)warnings.push('Gas/ice giant atmosphere is an illustrative extrapolation, not a validated depth or plume-size prediction.');
 if(angle<15)warnings.push('Very shallow entry: a fixed-angle trajectory does not resolve skip-out.');
 samples.push({altitude:h,speed:v,mass:m,energy:deposited,time:t});
 return {mass,entryEnergy,surfaceEnergy,surfaceSpeed,atmosphereEnergy:deposited,craterDiameter,craterDepth,transientDiameter,burstAltitude,entryAltitude,outcome,samples,duration:t,fragmented,remainingMass:m,bindingRatio,warnings};
}
