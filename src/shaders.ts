export const reliefGLSL = `
uniform sampler2D heightMap; uniform vec2 heightRange; uniform float terrain;
uniform vec4 craters[8]; uniform float craterDepths[8]; uniform int craterCount;
float heightAt(vec2 p){vec2 packed=texture2D(heightMap,p).rg;return terrain*(heightRange.x+dot(packed,vec2(65280.,255.))/65535.*heightRange.y);}
float excavation(vec3 n){float h=0.;for(int i=0;i<8;i++){if(i>=craterCount)break;
 float radius=craters[i].w;if(radius<=0.)continue;
 float r=2.*asin(min(1.,.5*length(normalize(n)-craters[i].xyz)))/radius;
 float bowl=-craterDepths[i]*pow(max(0.,1.-r*r),2.);
 float rim=craterDepths[i]*.24*exp(-pow((r-1.)/.16,2.));
 h+=bowl+rim; }return h;}
`;
export const surfaceVertex = `
varying vec2 vUv;varying vec3 vNormal;varying vec3 vWorld;varying vec3 vObject;
${reliefGLSL}
void main(){vUv=uv;vec3 n=normalize(position);float h=heightAt(uv)+excavation(n);
 vec3 p=n*(1.+h);vObject=n;vNormal=normalize(mat3(modelMatrix)*n);
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
varying vec2 vUv;varying vec3 vNormal;varying vec3 vWorld;varying vec3 vObject;
${reliefGLSL}
${eclipseGLSL}
void main(){
 if(craterPatch<.5){for(int i=0;i<8;i++){if(i>=craterCount)break;float radius=craters[i].w;if(radius>0.&&2.*asin(min(1.,.5*length(normalize(vObject)-craters[i].xyz)))<radius*1.55)discard;}}
 vec2 uv=vUv;vec3 n=normalize(vNormal),s=normalize(sunDir),viewDir=normalize(cameraPosition-vWorld);
 // Metric elevation gradients perturb the same spherical tangent frame as geometry.
 if(reliefEnabled>.5){
  float du=(heightAt(uv+vec2(heightTexel.x,0.))-heightAt(uv-vec2(heightTexel.x,0.)))/(2.*heightTexel.x*6.2831853*max(.05,sin(uv.y*3.14159265)));
  float dv=(heightAt(uv+vec2(0.,heightTexel.y))-heightAt(uv-vec2(0.,heightTexel.y)))/(2.*heightTexel.y*3.14159265);
  vec3 east=normalize(vec3(vObject.z,0.,-vObject.x));vec3 north=normalize(cross(vObject,east));
  n=normalize(n-objectNormalMatrix*east*du-objectNormalMatrix*north*dv);
 }
 // Geometric derivatives shade the excavated bowl and raised rim.
 for(int i=0;i<8;i++){if(i>=craterCount)break;float a=2.*asin(min(1.,.5*length(normalize(vObject)-craters[i].xyz)))/max(craters[i].w,.000001);
  if(a<1.5){vec3 gn=normalize(cross(dFdx(vWorld),dFdy(vWorld)));if(dot(gn,n)<0.)gn=-gn;n=gn;}}
 vec2 sampleUv=uv;
 // Very small differential zonal drift; it illustrates weather, not a forecast.
 if(giant>.5)sampleUv.x+=sin(uv.y*75.)*sin(time*.012)*.0008;
 vec2 globeUv=sampleUv;
 if(tiled>.5)sampleUv=((sampleUv-tileRect.xy)/tileRect.zw*512.+1.)/514.;
 vec3 albedo=pow(texture2D(dayMap,sampleUv).rgb,vec3(2.2));
 if(tiled>.5&&detailBlend<1.){
  vec2 parentUv=globeUv;if(parentTiled>.5)parentUv=((globeUv-parentRect.xy)/parentRect.zw*512.+1.)/514.;
  albedo=mix(pow(texture2D(parentMap,parentUv).rgb,vec3(2.2)),albedo,detailBlend);
 }
 albedo*=albedoScale;
 if(earth>.5){float water=texture2D(specularMap,uv).r;albedo=mix(albedo,max(albedo,vec3(.004,.015,.037)),water);}
 float ndl=dot(n,s),vis=sunlight(vWorld,s);
 float cloudShadow=1.;
 if(earth>.5&&cloudAmount>.5){vec3 localSun=transpose(objectNormalMatrix)*s;
  vec3 east=normalize(vec3(vObject.z,0.,-vObject.x));vec3 north=normalize(cross(vObject,east));
  vec2 offset=vec2(dot(localSun,east)/max(.05,sin(uv.y*3.14159265)),dot(localSun,north))*.0004/max(.07,ndl);
  cloudShadow=1.-texture2D(cloudMap,uv+offset+vec2(cloudOffset,0.)).r*.7;}
 vec3 color=albedo*(.016+max(ndl,0.)*1.75*vis*cloudShadow);
 if(earth>.5){
  vec3 night=pow(texture2D(nightMap,uv).rgb,vec3(2.2));color+=night*(1.-smoothstep(-.2,.05,ndl))*1.3;
  float ocean=texture2D(specularMap,uv).r;vec3 halfD=normalize(s+viewDir);
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
 for(int i=0;i<8;i++){if(i>=craterCount)break;float r=2.*asin(min(1.,.5*length(normalize(vObject)-craters[i].xyz)))/max(craters[i].w,.000001);
  color*=1.-.6*(1.-smoothstep(.65,1.45,r));}
 if(star>.5)color=albedo*2.3+vec3(.26,.085,.008);
 gl_FragColor=vec4(color,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;
export const simpleVertex = `varying vec2 vUv;varying vec3 vNormal;varying vec3 vWorld;varying vec3 vLocal;
void main(){vUv=uv;vLocal=position;vNormal=normalize(mat3(modelMatrix)*normal);vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`;
export const cloudFragment = `uniform sampler2D cloudMap;uniform vec3 sunDir;uniform float cloudOffset;
varying vec2 vUv;varying vec3 vNormal;varying vec3 vWorld;
${eclipseGLSL}
void main(){vec2 uv=vUv+vec2(cloudOffset,0.);float density=texture2D(cloudMap,uv).r;
 float d=dot(normalize(vNormal),normalize(sunDir));float vis=sunlight(vWorld,normalize(sunDir));
 // Offset samples give the cloud deck self-shadow and a soft forward-lit edge.
 float ridge=texture2D(cloudMap,uv+vec2(.0015,.0008)).r;
 vec3 c=mix(vec3(.23,.32,.43),vec3(1.),smoothstep(-.1,.45,d));
 c*=.035+max(0.,d)*vis*(1.35-.35*ridge);
 c+=vec3(.42,.16,.055)*exp(-pow(d/.14,2.))*vis;
 gl_FragColor=vec4(c,clamp(density*1.4-.05,0.,.94));
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
