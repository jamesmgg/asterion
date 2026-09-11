import { craterProfileGLSL, craterMaterialGLSL } from "./craters.ts";

export const reliefGLSL = `
uniform sampler2D heightMap; uniform vec2 heightRange; uniform float terrain;
uniform vec4 craters[8]; uniform float craterDepths[8]; uniform int craterCount;
uniform float craterComplexities[8];uniform float craterAges[8];
${craterProfileGLSL}
float heightAt(vec2 p){vec2 packed=texture2D(heightMap,p).rg;return terrain*(heightRange.x+dot(packed,vec2(65280.,255.))/65535.*heightRange.y);}
vec2 craterCoordinates(vec3 n,int i){
 vec3 c=craters[i].xyz;vec3 east=normalize(cross(abs(c.y)>.99?vec3(1.,0.,0.):vec3(0.,1.,0.),c));
 vec3 north=cross(c,east);float x=dot(n,east),y=dot(n,north);
 return vec2(2.*asin(min(1.,.5*length(normalize(n)-c)))/max(craters[i].w,1e-8),length(vec2(x,y))<1e-8?0.:atan(y,x));
}
int craterOwner(vec3 n){int owner=-1;float nearest=2.09,newest=-1.;
 // Use the patch whose dense inner rings best resolve this point. Age only
 // breaks coincident ties; excavation and materials have their own chronology.
 for(int i=0;i<8;i++){if(i>=craterCount)break;float r=craterCoordinates(n,i).x;
 if(craters[i].w>0.&&r<2.09&&(r<nearest-1e-5||(abs(r-nearest)<=1e-5&&craterAges[i]>newest))){owner=i;nearest=r;newest=craterAges[i];}}
 return owner;
}
float excavation(vec3 n){float h=0.;for(int i=0;i<8;i++){if(i>=craterCount)break;
 vec2 c=craterCoordinates(n,i);if(c.x>=2.1)continue;
 float remain=1.;
 for(int j=0;j<8;j++){if(j>=craterCount)break;if(craterAges[j]>craterAges[i])remain*=smoothstep(1.,1.8,craterCoordinates(n,j).x);}
 h+=craterProfile(c.x,c.y,craterDepths[i],craterComplexities[i])*remain;
 }return h;}
vec3 spherePoint(vec2 p){float t=p.y*3.14159265359,phi=p.x*6.28318530718;return vec3(-cos(phi)*sin(t),-cos(t),sin(phi)*sin(t));}
`;
export const surfaceVertex = `
varying vec2 vUv;varying vec3 vNormal;varying vec3 vWorld;varying vec3 vObject;
uniform float craterPatch;uniform float craterPatchIndex;uniform vec2 groundResolution;
${reliefGLSL}
vec3 groundVertex(vec2 uv){return spherePoint(uv)*(1.+heightAt(uv));}
// Match the surrounding terrain's triangle plane at the edge of a dense patch.
// Its imagery LODs all share this lattice, so loading a sharper tile never moves it.
float planeRadius(vec3 n,vec3 a,vec3 b,vec3 c){vec3 normal=cross(b-a,c-a);return dot(a,normal)/dot(n,normal);}
float groundPlane(vec2 p,out float coarseRadius){vec2 cell=vec2(fract(p.x),clamp(p.y,0.,.9999999))*groundResolution;
 vec2 f=fract(cell),lo=floor(cell)/groundResolution,stepUV=1./groundResolution;
 vec3 a=groundVertex(lo),b=groundVertex(lo+vec2(stepUV.x,0.)),c=groundVertex(lo+vec2(0.,stepUV.y)),d=groundVertex(lo+stepUV);
 vec3 n=spherePoint(p),diagonal=cross(b,c);
 vec3 first=lo.y<.5/groundResolution.y?d:lo.y>1.-1.5/groundResolution.y?a:dot(n,diagonal)*dot(a,diagonal)>=0.?a:d;
 float baseline=planeRadius(n,first,b,c);
 first+=normalize(first)*excavation(normalize(first));b+=normalize(b)*excavation(normalize(b));c+=normalize(c)*excavation(normalize(c));
 coarseRadius=planeRadius(n,first,b,c);
 return baseline;
}
void main(){vUv=uv;vec3 n=normalize(position);float h=heightAt(uv)+excavation(n);
 vec3 p=n*(1.+h);
 if(craterPatch>.5){float r=craterCoordinates(n,int(craterPatchIndex)).x;float coarse;float baseline=groundPlane(uv,coarse);p=n*mix(baseline+excavation(n),coarse,smoothstep(1.65,2.04,r));}
 // Cutouts and replacement patches use actual radial surface positions. UV
 // interpolation on a coarse triangle otherwise shifts a small patch sideways.
 vObject=p;vNormal=normalize(mat3(modelMatrix)*n);
 vec4 world=modelMatrix*vec4(p,1.);vWorld=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}
`;
export const eclipseGLSL = `
uniform vec4 occluders[8];uniform int occluderCount;uniform float sunAngular;
float diskVisible(float r,float R,float d){
 if(d>=r+R)return 1.;if(d<=abs(R-r))return R>=r?0.:1.-R*R/(r*r);
 float area=r*r*acos(clamp((d*d+r*r-R*R)/(2.*d*r),-1.,1.))+R*R*acos(clamp((d*d+R*R-r*r)/(2.*d*R),-1.,1.))-.5*sqrt(max(0.,(-d+r+R)*(d+r-R)*(d-r+R)*(d+r+R)));
 return clamp(1.-area/(3.14159265*r*r),0.,1.);
}
float sunlight(vec3 point,vec3 sun){float visible=1.;for(int i=0;i<8;i++){if(i>=occluderCount)break;
 vec3 delta=occluders[i].xyz-point;float dis=length(delta);float angular=asin(clamp(occluders[i].w/dis,0.,1.));
 if(dot(delta,sun)>0.)visible*=diskVisible(sunAngular,angular,atan(length(cross(normalize(delta),sun)),dot(normalize(delta),sun)));}return visible;}
`;
export const surfaceFragment = `
uniform sampler2D dayMap;uniform sampler2D nightMap;uniform sampler2D cloudMap;uniform sampler2D specularMap;
uniform vec3 sunDir;uniform float earth;uniform float star;uniform float cloudAmount;
uniform vec4 tileRect;uniform float tiled;uniform float time;uniform float giant;
uniform sampler2D parentMap;uniform vec4 parentRect;uniform float parentTiled;uniform float detailBlend;
uniform float reliefEnabled;uniform vec2 heightTexel;uniform mat3 objectNormalMatrix;
uniform float cloudOffset;uniform float albedoScale;uniform float craterPatch;
uniform float craterPatchIndex;uniform float patchTiled;uniform vec4 patchRect;
uniform int craterStart;uniform vec4 cloudClear;
varying vec2 vUv;varying vec3 vNormal;varying vec3 vWorld;varying vec3 vObject;
${reliefGLSL}
${eclipseGLSL}
${craterMaterialGLSL}
// A tile's longitude interval can border 0/1. Choose its equivalent continuous
// coordinate before applying the gutter transform; wrapping UVs in the shader
// would otherwise turn a one-pixel footprint into a whole-globe mip lookup.
vec2 tileUv(vec2 uv,vec4 rect){uv.x+=floor(rect.x+rect.z*.5-uv.x+.5);return ((uv-rect.xy)/rect.zw*512.+1.)/514.;}
void main(){
 vec3 objectN=normalize(vObject);
 // Geometry carries continuous longitude across each triangle. Let the global
 // texture's RepeatWrapping handle its seam, preserving texture derivatives.
 vec2 uv=vUv;
 if(craterPatch>.5){uv=vec2(atan(objectN.z,-objectN.x)/6.28318530718,acos(clamp(-objectN.y,-1.,1.))/3.14159265359);uv.x+=floor(vUv.x-uv.x+.5);}
 vec2 globeUv=uv;
 // Very small differential zonal drift; it illustrates weather, not a forecast.
 if(giant>.5)globeUv.x+=sin(uv.y*75.)*sin(time*.012)*.0008;
 // Capture the complete fragment quad before patch clipping discards a neighbor.
 // Implicit texture derivatives after that divergent discard are undefined.
 vec2 uvDx=dFdx(uv),uvDy=dFdy(uv),globeDx=dFdx(globeUv),globeDy=dFdy(globeUv);
 vec3 geometricN=cross(dFdx(vWorld),dFdy(vWorld));
 int owner=craterOwner(objectN);
 if(craterPatch>.5){if(owner!=int(craterPatchIndex))discard;
  vec2 clippedUv=vec2(fract(uv.x),uv.y);
  if(patchTiled>.5&&(clippedUv.x<patchRect.x||clippedUv.y<patchRect.y||clippedUv.x>=patchRect.x+patchRect.z||clippedUv.y>=patchRect.y+patchRect.w))discard;
 }else if(owner>=0){for(int i=0;i<8;i++){if(i>=craterCount)break;if(craterCoordinates(objectN,i).x<1.98)discard;}}
 // A narrow, unchanged outer guard shares the ground's imagery and shading.
 // It covers triangle-edge rounding without moving terrain into the clouds.
 vec3 n=normalize(vNormal),s=normalize(sunDir),viewDir=normalize(cameraPosition-vWorld);
 // Metric elevation gradients perturb the same spherical tangent frame as geometry.
 if(reliefEnabled>.5){
  float du=(heightAt(uv+vec2(heightTexel.x,0.))-heightAt(uv-vec2(heightTexel.x,0.)))/(2.*heightTexel.x*6.2831853*max(.05,sin(uv.y*3.14159265)));
  float dv=(heightAt(uv+vec2(0.,heightTexel.y))-heightAt(uv-vec2(0.,heightTexel.y)))/(2.*heightTexel.y*3.14159265);
  vec3 east=normalize(vec3(vObject.z,0.,-vObject.x));vec3 north=normalize(cross(vObject,east));
  n=normalize(n-objectNormalMatrix*east*du-objectNormalMatrix*north*dv);
 }
 // Geometric derivatives shade the excavated bowl and raised rim.
 if(owner>=0){float altered=0.;for(int i=0;i<8;i++){if(i>=craterCount)break;altered=max(altered,1.-smoothstep(1.25,1.8,craterCoordinates(objectN,i).x));}
 vec3 gn=normalize(geometricN);if(dot(gn,n)<0.)gn=-gn;n=normalize(mix(n,gn,altered));}
 vec2 sampleUv=globeUv,sampleScale=vec2(1.);
 if(tiled>.5){sampleUv=tileUv(sampleUv,tileRect);sampleScale=(512./514.)/tileRect.zw;}
 vec3 albedo=pow(textureGrad(dayMap,sampleUv,globeDx*sampleScale,globeDy*sampleScale).rgb,vec3(2.2));
 if(tiled>.5&&detailBlend<1.){
  vec2 parentUv=globeUv,parentScale=vec2(1.);if(parentTiled>.5){parentUv=tileUv(globeUv,parentRect);parentScale=(512./514.)/parentRect.zw;}
  albedo=mix(pow(textureGrad(parentMap,parentUv,globeDx*parentScale,globeDy*parentScale).rgb,vec3(2.2)),albedo,detailBlend);
 }
 albedo*=albedoScale;
 if(earth>.5){float water=textureGrad(specularMap,uv,uvDx,uvDy).r;albedo=mix(albedo,max(albedo,vec3(.004,.015,.037)),water);}
 float disturbance=0.;
 if(owner>=0){for(int step=0;step<8;step++){if(step>=craterCount)break;int i=int(mod(float(craterStart+step),8.));
  vec2 c=craterCoordinates(objectN,i);if(c.x>=2.1)continue;disturbance=1.-(1.-disturbance)*(1.-craterDisturbance(c.x,c.y));albedo=craterAlbedo(c.x,c.y,craterComplexities[i],albedo);}}
 float ndl=dot(n,s),vis=sunlight(vWorld,s);
 float cloudShadow=1.;
 if(earth>.5&&cloudAmount>.5){vec3 localSun=transpose(objectNormalMatrix)*s;
  vec3 east=normalize(vec3(vObject.z,0.,-vObject.x));vec3 north=normalize(cross(vObject,east));
  vec2 offset=vec2(dot(localSun,east)/max(.05,sin(uv.y*3.14159265)),dot(localSun,north))*.0004/max(.07,ndl);
  float clear=cloudClear.w>0.?1.-smoothstep(.65,1.,length(objectN-cloudClear.xyz)/cloudClear.w):0.;
  cloudShadow=1.-textureGrad(cloudMap,uv+offset+vec2(cloudOffset,0.),uvDx,uvDy).r*.7*(1.-clear);}
 vec3 color=albedo*(.016+max(ndl,0.)*1.75*vis*cloudShadow);
 if(earth>.5){
  vec3 night=pow(textureGrad(nightMap,uv,uvDx,uvDy).rgb,vec3(2.2));color+=night*(1.-smoothstep(-.2,.05,ndl))*1.3*(1.-disturbance);
  float ocean=textureGrad(specularMap,uv,uvDx,uvDy).r*(1.-disturbance);vec3 halfD=normalize(s+viewDir);
  // Rough dielectric water (GGX + Smith masking + Schlick Fresnel). The broad
  // distribution and ~2% normal reflectance avoid a painted-on white lamp spot.
  float nl=max(ndl,0.),nv=max(dot(n,viewDir),.001),nh=max(dot(n,halfD),0.);
  float a2=pow(.55,4.);float denom=nh*nh*(a2-1.)+1.;
  float distribution=a2/(3.14159265*denom*denom);
  float masking=2.*nl/(nl+sqrt(a2+(1.-a2)*nl*nl)+.00001);
  masking*=2.*nv/(nv+sqrt(a2+(1.-a2)*nv*nv));
  float fresnel=.0204+.9796*pow(1.-max(dot(halfD,viewDir),0.),5.);
  float reflection=distribution*masking*fresnel/(4.*max(nl*nv,.0001));
  color+=vec3(1.,.97,.92)*reflection*ocean*nl*vis*cloudShadow*1.75;
 }
 if(star>.5)color=albedo*2.3+vec3(.26,.085,.008);
 gl_FragColor=vec4(color,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;
export const simpleVertex = `varying vec2 vUv;varying vec3 vNormal;varying vec3 vWorld;varying vec3 vLocal;
void main(){vUv=uv;vLocal=position;vNormal=normalize(mat3(modelMatrix)*normal);vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`;
export const cloudFragment = `uniform sampler2D cloudMap;uniform vec3 sunDir;uniform float cloudOffset;uniform vec4 cloudClear;
varying vec2 vUv;varying vec3 vNormal;varying vec3 vWorld;varying vec3 vLocal;
${eclipseGLSL}
void main(){vec2 uv=vUv+vec2(cloudOffset,0.);float density=texture2D(cloudMap,uv).r;
 float d=dot(normalize(vNormal),normalize(sunDir));float vis=sunlight(vWorld,normalize(sunDir));
 // Offset samples give the cloud deck self-shadow and a soft forward-lit edge.
 float ridge=texture2D(cloudMap,uv+vec2(.0015,.0008)).r;
 vec3 c=mix(vec3(.23,.32,.43),vec3(1.),smoothstep(-.1,.45,d));
 c*=.035+max(0.,d)*vis*(1.35-.35*ridge);
 c+=vec3(.42,.16,.055)*exp(-pow(d/.14,2.))*vis;
 float clear=cloudClear.w>0.?1.-smoothstep(.65,1.,length(normalize(vLocal)-cloudClear.xyz)/cloudClear.w):0.;
 gl_FragColor=vec4(c,clamp(density*1.4-.05,0.,.94)*(1.-clear));
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;
export const atmosphereFragment = `
uniform vec3 cameraLocal;uniform vec3 sunDir;uniform vec3 beta;uniform vec3 hazeColor;uniform float shell;uniform float scaleHeight;
varying vec3 vLocal;
vec2 sphere(vec3 o,vec3 d,float r){float b=dot(o,d),c=dot(o,o)-r*r,h=b*b-c;if(h<0.)return vec2(1e5,-1e5);h=sqrt(h);return vec2(-b-h,-b+h);}
float density(vec3 p){return exp(-max(0.,length(p)-1.)/scaleHeight);}
void main(){vec3 ray=normalize(vLocal-cameraLocal);vec2 at=sphere(cameraLocal,ray,shell);float begin=max(0.,at.x),end=at.y;
 vec2 ground=sphere(cameraLocal,ray,1.);if(ground.x>0.)end=min(end,ground.x);
 if(end<=begin)discard;float stepSize=(end-begin)/12.;vec3 sum=vec3(0.);float optical=0.;vec3 sun=normalize(sunDir);
 for(int i=0;i<12;i++){
  vec3 p=cameraLocal+ray*(begin+(float(i)+.5)*stepSize);float rho=density(p);optical+=rho*stepSize*.5;
  float lightDistance=sphere(p,sun,shell).y;float lightOptical=0.;
  vec2 shadow=sphere(p,sun,1.);float lit=shadow.x>0.?0.:1.;
  for(int j=0;j<4;j++)lightOptical+=density(p+sun*lightDistance*(float(j)+.5)/4.)*lightDistance/4.;
  sum+=rho*stepSize*exp(-beta*(optical+lightOptical))*lit;optical+=rho*stepSize*.5;
 }
 float cosine=dot(ray,sun);float phase=.0596831*(1.+cosine*cosine);
 vec3 scatter=sum*beta*phase*3.;
 float mie=pow(max(0.,cosine),32.)*.1;scatter+=sum*vec3(20.)*mie;
 gl_FragColor=vec4(scatter*hazeColor,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;
