// Procedural close-up surfaces are illustrations, not resolved observations.
const noise = `
float hash(vec3 p){p=fract(p*.3183099+vec3(.11,.17,.13));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise3(p);p=p*2.03+vec3(13.1,7.7,3.4);a*=.5;}return v;}
`;

export const cosmicVertex = `
varying vec3 vPoint;varying vec3 vNormal;varying vec3 vWorld;
void main(){vPoint=normalize(position);vNormal=normalize(mat3(modelMatrix)*normal);vec4 world=modelMatrix*vec4(position,1.);vWorld=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}
`;

export const stellarFragment = `
uniform vec3 tint;uniform float time;uniform float seed;uniform float giant;
varying vec3 vPoint;varying vec3 vNormal;varying vec3 vWorld;
${noise}
void main(){
 vec3 p=vPoint;float mu=max(0.,dot(normalize(vNormal),normalize(cameraPosition-vWorld)));
 float convection=fbm(p*mix(17.,5.,giant)+vec3(seed,time*.009,0.));
 float cells=noise3(p*mix(95.,26.,giant)+fbm(p*13.)*2.+vec3(0.,time*.023,seed));
 float fine=fbm(p*320.+vec3(seed,0.,time*.018));
 float spots=smoothstep(.68,.82,fbm(p*8.+seed))*smoothstep(.12,.4,abs(p.y));
 float brightness=(.56+convection*.52+cells*.21+fine*.15)*(1.-spots*.64);
 vec3 color=tint*brightness*(.35+.65*pow(mu,.42));
 color=mix(color,color+vec3(.19,.105,.024),giant*.2*convection);
 gl_FragColor=vec4(color,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}
`;

export const coronaFragment = `
uniform vec3 tint;uniform float time;uniform float activity;
varying vec3 vPoint;varying vec3 vNormal;varying vec3 vWorld;
${noise}
void main(){vec3 n=normalize(vNormal),eye=normalize(cameraPosition-vWorld);
 float mu=abs(dot(n,eye));float projectedRadius=sqrt(max(0.,1.-mu*mu));
 float edge=exp(-max(0.,projectedRadius-.8772)*34.)*(1.-smoothstep(.93,1.,projectedRadius));
 float streamer=fbm(vPoint*15.+vec3(time*.014,0,0));
 float alpha=edge*(.055+streamer*.08)*activity;
 gl_FragColor=vec4(tint*(.75+streamer),alpha);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}
`;

export const exoplanetFragment = `
uniform vec3 tint;uniform vec3 sunPosition;uniform float time;uniform float seed;uniform float style;
varying vec3 vPoint;varying vec3 vNormal;varying vec3 vWorld;
${noise}
void main(){
 vec3 p=vPoint;vec3 n=normalize(vNormal),s=normalize(sunPosition-vWorld),eye=normalize(cameraPosition-vWorld);
 float continents=fbm(p*4.5+seed),terrain=fbm(p*22.+seed),grain=fbm(p*135.+seed);
 vec3 color;
 if(style>1.5){
  float latitude=p.y+sin(atan(p.z,p.x)*6.+p.y*18.)*.014;
  float ribbons=sin(latitude*72.+fbm(p*9.+seed)*7.);
  float storm=fbm(p*15.+vec3(seed,time*.009,0.));
  color=tint*mix(.5,1.2,smoothstep(-.9,.9,ribbons))*(.77+storm*.37);
  color=mix(color,vec3(.77,.69,.57),smoothstep(.56,.76,storm)*.5);
 }else if(style>.5){
  float land=smoothstep(.49,.52,continents);
  vec3 ocean=vec3(.008,.052,.12)*(1.+terrain*.7);
  vec3 ground=mix(vec3(.065,.10,.055),vec3(.28,.24,.14),smoothstep(.4,.7,terrain));
  color=mix(ocean,ground,land);
  float ice=smoothstep(.79,.94,abs(p.y)+terrain*.14);color=mix(color,vec3(.65,.72,.74),ice);
  float clouds=smoothstep(.55,.74,fbm(p*8.+vec3(time*.004,seed,0.)));
  color=mix(color,vec3(.76,.79,.8),clouds*.86);
 }else{
  color=tint*(.37+terrain*.8+grain*.18);
  float basins=smoothstep(.48,.7,continents);color=mix(color,color*.53,basins);
  color=mix(color,color*vec3(1.12,.91,.72),smoothstep(.52,.7,terrain)*.5);
 }
 // Differentiate unit surface normals, never world positions: physical display
 // radii span orders of magnitude and must not amplify the apparent relief.
 vec3 dx=dFdx(vNormal),dy=dFdy(vNormal);float area=max(length(cross(dx,dy)),.0000000001);
 vec3 bump=(dFdx(terrain)*cross(n,dy)+dFdy(terrain)*cross(dx,n))/area;
 bump*=.003;bump/=max(1.,length(bump)/.2);
 n=normalize(n+bump*(1.-step(1.5,style)));
 float daylight=max(0.,dot(n,s));
 color*=.028+daylight*1.35;
 float rim=pow(1.-max(0.,dot(n,eye)),3.5)*smoothstep(-.1,.35,dot(n,s));
 if(style>.5&&style<1.5)color+=vec3(.065,.16,.3)*rim*.43;
 gl_FragColor=vec4(color,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}
`;

export const blackHoleVertex = `
varying vec3 vLocal;
void main(){vLocal=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}
`;

/** Approximate Schwarzschild ray bending in units of Rs=2GM/c². The synthetic
 * thin disk starts at the nonrotating ISCO (3 Rs). Finite integration and
 * illustrative emissivity are not a numerical GR/EHT reconstruction.
 */
export function blackHoleFragment(mobile: boolean) {
  return `
uniform vec3 eye;uniform vec3 tint;uniform float time;
varying vec3 vLocal;
${noise}
vec3 diskColor(vec3 p,vec3 ray){
 float r=length(p.xz),angle=atan(p.z,p.x);
 float flow=angle-time*.035/pow(r/3.,1.5);
 vec3 gas=vec3(cos(flow)*r,sin(flow)*r,r*.32);
 float eddies=fbm(gas*.9+vec3(0.,0.,time*.007));
 float band=.88+.12*sin(r*7.+eddies*11.+sin(flow*3.+r)*.7);
 float turbulence=.61+.49*fbm(gas*3.+eddies*2.);
 float inner=smoothstep(3.,3.7,r),outer=1.-smoothstep(9.,13.,r);
 float temperature=pow(3./max(3.,r),.75);
 vec3 hot=mix(vec3(1.,.19,.018),vec3(1.,.79,.37),temperature);
 hot=mix(hot,vec3(1.,.96,.83),smoothstep(.72,1.,temperature)*.45);
 hot*=mix(vec3(1.),normalize(tint)*1.25,.24);
 vec3 velocity=normalize(vec3(-p.z,0.,p.x));
 float beaming=pow(clamp(1./(1.+dot(velocity,ray)*.43/sqrt(max(1.,r/3.))),.58,1.65),2.);
 return hot*band*turbulence*inner*outer*temperature*beaming*2.4;
}
void main(){
 vec3 ray=normalize(vLocal-eye);float b=dot(eye,ray),c=dot(eye,eye)-324.;
 float nearT=max(0.,-b-sqrt(max(0.,b*b-c)));
 vec3 p=eye+ray*(nearT+.001),v=ray;float angular2=dot(cross(p,v),cross(p,v));
 vec3 emission=vec3(0.);float opacity=0.,captured=0.;
 for(int i=0;i<${mobile ? 72 : 112};i++){
  float r=length(p);if(r<1.015){captured=1.;break;}if(r>18.1&&dot(p,v)>0.)break;
  float stepSize=clamp(r*.115,${mobile ? ".11" : ".065"},1.25);
  vec3 acceleration=-1.5*angular2*p/pow(max(r,1.),5.);
  vec3 next=p+v*stepSize+.5*acceleration*stepSize*stepSize;
  float nextR=length(next);
  vec3 nextAcceleration=-1.5*angular2*next/pow(max(nextR,1.),5.);
  v+=(acceleration+nextAcceleration)*(.5*stepSize);
  if(p.y*next.y<0.){
   float t=-p.y/(next.y-p.y);vec3 hit=mix(p,next,t);float diskR=length(hit.xz);
   if(diskR>3.&&diskR<13.){vec3 light=diskColor(hit,normalize(v));
    float a=.86*smoothstep(3.,3.5,diskR)*(1.-smoothstep(9.,13.,diskR));
    emission+=(1.-opacity)*light*a;opacity+=(1.-opacity)*a;}
  }
  float diskR=length(p.xz);float haze=exp(-abs(p.y)*9.)*smoothstep(2.8,3.4,diskR)*(1.-smoothstep(10.,14.,diskR));
  emission+=(1.-opacity)*vec3(1.,.24,.032)*haze*stepSize*.07;
  p=next;
 }
 float alpha=max(opacity,captured);alpha=max(alpha,clamp(length(emission)*.3,0.,.7));
 if(alpha<.002)discard;
 gl_FragColor=vec4(emission/max(alpha,.001),alpha);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}
`;
}
