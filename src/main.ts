import '@fontsource/outfit/400.css';
import '@fontsource/outfit/500.css';
import '@fontsource/outfit/600.css';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import './style.css';
import { PLANETS, MATERIALS } from './data.ts';
import { SolarSystem, calculateImpact, julianDate, fromJulian, G } from './physics.ts';
import type { ImpactInput, ImpactResult } from './physics.ts';
import { Observatory } from './scene.ts';

const $=<T extends HTMLElement=HTMLElement>(selector:string)=>document.querySelector<T>(selector)!;
const icon=(name:string)=>{
 const paths:Record<string,string>={orbit:'<ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-35 12 12)"/><circle cx="12" cy="12" r="6"/><circle cx="20" cy="6" r="1.5" fill="currentColor"/>',impact:'<path d="m4 20 7-7M6 4l6 6M13 3l3 3M20 9l-3-3M4 11l3 3"/><circle cx="15" cy="14" r="5"/><path d="m13 12 1-1m2 5 1-1"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',plus:'<path d="M12 5v14M5 12h14"/>',minus:'<path d="M5 12h14"/>',reset:'<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',play:'<path d="m8 5 11 7-11 7Z" fill="currentColor"/>',pause:'<path d="M8 5v14M16 5v14" stroke-width="3"/>',target:'<circle cx="12" cy="12" r="6"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5"/>',camera:'<path d="M3 7h4l2-3h6l2 3h4v13H3Z"/><circle cx="12" cy="13" r="4"/>',expand:'<path d="M3 9V3h6m6 0h6v6M3 15v6h6m6 0h6v-6"/>',chevron:'<path d="m6 9 6 6 6-6"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',download:'<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',volume:'<path d="m11 4-5 5H2v6h4l5 5ZM16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>'};
 return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]??paths.orbit}</svg>`;
};
const app=$('#app');
app.innerHTML=`
 <div class="ambient"></div>
 <header class="topbar">
  <a class="brand" href="/" aria-label="Asterion home">${icon('orbit')}<span>Asterion<small>Orbital observatory</small></span></a>
  <nav class="view-switch" aria-label="View"><button id="planet-view" class="active">${icon('orbit')}<span>Planet view</span></button><button id="system-view" aria-label="Solar system">${icon('expand')}<span>Solar system</span></button></nav>
  <div class="header-right"><span class="live-dot"></span><span class="local-tag">Your corner of the cosmos</span><button id="science" class="icon-button" aria-label="Science & sources" title="Science & sources">${icon('info')}</button></div>
 </header>
 <main>
  <div id="universe"></div><div id="world-labels"></div>
  <section class="observation" aria-label="Selected world">
   <div class="planet-class"><span id="planet-kind">Terrestrial planet</span><span id="planet-index">03 / 08</span></div>
   <h1 id="planet-name">Earth</h1><p class="subtitle" id="planet-subtitle">A pale blue possibility</p>
   <p class="description" id="planet-description"></p>
   <dl id="planet-facts"></dl>
   <button id="open-details" class="text-button">Inside this world ${icon('arrow')}</button>
  </section>
  <div id="system-settings" hidden><label>Distance scale<select id="distance-scale" aria-label="Distance scale"><option value="readable">Readable spacing</option><option value="true">True orbital distances</option></select></label><label class="toggle"><input type="checkbox" id="orbit-toggle" checked/><span>Orbit guides</span></label><label class="toggle"><input type="checkbox" id="label-toggle" checked/><span>Planet labels</span></label><p>Planet sizes enlarged for visibility.</p></div>
  <div class="view-tools"><button class="icon-button" id="zoom-in" aria-label="Zoom in" title="Zoom in">${icon('plus')}</button><button class="icon-button" id="zoom-out" aria-label="Zoom out" title="Zoom out">${icon('minus')}</button><span></span><button class="icon-button" id="reset-camera" aria-label="Reset camera" title="Reset camera">${icon('reset')}</button><button class="icon-button" id="capture" aria-label="Save image" title="Save image">${icon('camera')}</button><button class="icon-button" id="fullscreen" aria-label="Fullscreen" title="Fullscreen">${icon('expand')}</button></div>
  <div class="view-caption"><span class="crosshair">＋</span><span id="view-hint">Drag to orbit <i>·</i> Scroll or pinch to explore</span></div>
  <aside class="instrument" id="instrument">
   <div class="instrument-tabs"><button id="tab-explore" class="active" aria-label="Explore" aria-pressed="true">${icon('orbit')}Explore</button><button id="tab-impact" aria-label="Impact lab" aria-pressed="false">${icon('impact')}Impact lab</button><button id="collapse-panel" class="icon-button" aria-label="Collapse panel">${icon('chevron')}</button></div>
   <div class="instrument-body" id="explore-panel">
    <div class="section-intro"><span class="tiny-orbit">◌</span><div><h2>A closer look</h2><p>Every world tells a different story.</p></div></div>
    <div id="world-detail"></div>
    <div class="divider"></div><h3>Make yourself at home</h3>
    <div id="earth-options"><label class="toggle"><span>Cloud layer</span><input id="cloud-toggle" type="checkbox" checked/></label><label class="toggle"><span>8K Earth texture</span><input id="hd-toggle" type="checkbox"/></label></div>
    <label class="toggle" id="venus-options" hidden><span>Reveal volcanic surface</span><input id="venus-toggle" type="checkbox"/></label>
    <label class="toggle"><span>High render resolution</span><input id="quality-toggle" type="checkbox" checked/></label>
    <label class="toggle"><span>Impact sound cues</span><input id="sound-toggle" type="checkbox"/></label>
    <button class="lab-invitation" id="try-impact"><span>${icon('impact')}What happens on impact?</span><p>Send an asteroid. Watch the world respond.</p>${icon('arrow')}</button>
    <p class="quiet-note">Real masses and radii. Newtonian orbits.<br/>A universe made to be explored.</p>
   </div>
   <div class="instrument-body" id="impact-panel" hidden>
    <div class="section-intro"><span class="impact-symbol">${icon('impact')}</span><div><h2>Change the landscape</h2><p>One encounter. A lasting impression.</p></div></div>
    <div id="star-note" hidden>Solar plasma interactions are outside the impact model. Select a planet to launch an asteroid.</div>
    <fieldset id="impact-controls">
     <div class="control-label"><label for="diameter">Asteroid diameter</label><div class="number-unit"><input id="diameter" type="number" min="1" max="100000" value="100" step="1" aria-label="Asteroid diameter in meters"/><span>m</span></div></div>
     <input id="size-slider" type="range" min="0" max="5" step=".01" value="2" aria-label="Asteroid size"/>
     <div class="range-labels"><span>1 m</span><span>100 km</span></div>
     <div class="presets" aria-label="Impact presets"><button data-size="20" data-speed="19" data-angle="18">Chelyabinsk<small>20 m</small></button><button data-size="50" data-speed="17" data-angle="35">Tunguska<small>50 m</small></button><button data-size="10000" data-speed="20" data-angle="60">Chicxulub<small>10 km</small></button></div>
     <div class="control-label"><label for="velocity">Entry speed</label><output id="velocity-value">20 <span>km/s</span></output></div>
     <input id="velocity" type="range" min="11" max="72" step="1" value="20"/>
     <div class="control-label"><label for="angle">Entry angle</label><output id="angle-value">45<span>°</span></output></div>
     <input id="angle" type="range" min="5" max="90" step="1" value="45"/>
     <div class="angle-legend"><svg viewBox="0 0 90 28" aria-hidden="true"><path d="M0 25h90" stroke="#435773"/><path id="angle-line" d="M20 3 45 25" stroke="#efb975" stroke-width="1.5"/><circle cx="45" cy="25" r="2.5" fill="#efb975"/></svg><span>Measured from the horizon</span></div>
     <div class="control-label"><span>Composition</span><span id="density-value">3,000 kg/m³</span></div>
     <div class="material-switch" role="group" aria-label="Asteroid composition"><button data-material="stone" class="active" aria-pressed="true">Stony</button><button data-material="iron" aria-pressed="false">Iron</button><button data-material="ice" aria-pressed="false">Icy</button></div>
     <button id="aim" class="aim-button">${icon('target')}<span id="target-label">Choose an impact site</span></button>
     <div class="energy-preview"><span>Incoming kinetic energy</span><strong id="energy-preview">—</strong><small id="mass-preview">—</small></div>
     <button id="launch" class="launch-button" aria-label="Launch asteroid">${icon('impact')}<span>Launch asteroid</span>${icon('arrow')}</button>
    </fieldset>
    <div class="event-bar"><span id="event-status" role="status">Ready for an encounter</span><button id="replay" class="icon-button" aria-label="Replay impact" title="Replay impact" disabled>${icon('reset')}</button></div>
    <section id="impact-result" aria-label="Impact results" hidden></section>
    <div class="ledger" id="ledger" hidden><div class="ledger-heading"><h3>Your encounters</h3><button id="export" class="text-button" aria-label="Export encounters">${icon('download')}JSON</button></div><ol id="history-list"></ol><button id="clear" class="text-button">Clear encounters & scars</button></div>
    <p class="model-note">Impact physics is approximate. Effects and small scars are enlarged; the measurements show physical estimates. <button id="model-link">Read the model</button></p>
   </div>
  </aside>
  <div id="loading" role="status"><div class="loading-orbit"></div><p>Gathering the worlds</p><small>Loading locally hosted planetary maps</small></div>
  <div id="error" hidden role="alert"></div>
  <div id="toast" role="status" hidden></div>
 </main>
 <footer class="flight-deck">
  <div class="transport"><div class="time-control"><button id="pause" class="icon-button" aria-label="Pause simulation" title="Pause / play (Space)">${icon('pause')}</button><label class="time-speed"><span>Time flow</span><select id="speed" aria-label="Simulation speed"><option value="0.000011574074">Real time</option><option value="0.041666667" selected>1 hour / sec</option><option value="1">1 day / sec</option><option value="10">10 days / sec</option><option value="100">100 days / sec</option></select></label></div><div class="date-control"><input id="date" type="date" min="1800-01-01" max="2050-12-31" aria-label="Simulation date"/><button id="today" class="text-button">Now</button></div><span class="physics-status"><span class="live-dot"></span><span id="physics-status">9-body gravity</span><span id="fps">— fps</span></span></div>
  <nav class="planet-dock" aria-label="Destinations">${PLANETS.map(p=>`<button class="destination ${p.id==='earth'?'active':''}" data-planet="${p.id}" aria-label="Visit ${p.name}" aria-pressed="${p.id==='earth'}"><span class="planet-thumb ${p.id}" style="--planet-color:${p.color};background-image:url('/textures/${p.id}.jpg')"></span><span>${p.name}</span><i></i></button>`).join('')}</nav>
 </footer>
 <dialog id="science-modal" aria-labelledby="science-title"><div class="modal-head"><div><span class="modal-eyebrow">Behind the observatory</span><h2 id="science-title">The science, and its limits.</h2></div><button id="close-science" class="icon-button" aria-label="Close science">${icon('close')}</button></div><div class="modal-content">
  <p>Asterion combines a numerical solar-system model with a reduced-order impact experiment. The numbers come from physical models; the cinematic effects are illustrations.</p>
  <h3>Orbits & scale</h3><p>All eight planets and the Sun interact through Newtonian gravity. A velocity-Verlet integrator advances in steps no larger than 3 hours. Initial positions and velocities come from JPL’s approximate J2000 elements and century rates (1800–2050). Earth uses the Earth–Moon barycenter approximation. The model omits moons, relativity, tides, and small-body perturbations; it is not a navigation ephemeris. UTC is used as an approximation to the ephemeris time scale.</p>
  <p>True orbital distances preserve the AU distance ratios. Readable spacing separates neighboring orbits. Planet radii in the map are enlarged. Close-ups use a normalized planet radius, real rotation periods, approximate axial tilt, and sunward lighting. Prime meridians, clouds, and texture seasons are illustrative; the map’s orbit guides and asteroid belt are reference graphics, not integrated bodies.</p>
  <h3>Atmospheric entry</h3><p>Mass is ρπD³/6 and kinetic energy is ½mv². Speed is specified at the top of the modeled atmosphere. Gravity accelerates the incoming body. Numerical descent includes an exponential atmosphere, drag (Cᴅ = 1), ablation (Cʜ = 0.02), and fragmentation when dynamic pressure exceeds the material strength. A simplified spreading cloud is capped at seven times the initial radius. Entry angle remains fixed. Atmospheric density profiles, strength, and fragmentation introduce substantial uncertainty.</p>
  <h3>Craters & giant planets</h3><p>Dry-rock gravity-regime crater scaling follows Collins, Melosh & Marcus (2005), with local gravity and a gravity-scaled simple/complex transition. This is an estimate, not a hydrocode. Small strength-dominated craters, very shallow entries, basin-scale events, oceans, tsunamis, terrain, global climate, and planetary disruption are not resolved. Gas/ice giant impacts show atmospheric plumes without a solid-surface crater; their deep exponential atmospheres are illustrative extrapolations.</p>
  <p>The arrival animation, expanding ring, plume, ejecta, and minimum-size scar are cinematic. They do not resolve shock hydrodynamics. Orbital time pauses during an encounter, which is replayed in about eight seconds independently of the physical entry duration. Optional sound is an interface cue.</p>
  <h3>Sources & credits</h3><ul class="sources"><li><a href="https://ssd.jpl.nasa.gov/planets/approx_pos.html" target="_blank" rel="noreferrer">NASA JPL · Approximate positions of the planets</a></li><li><a href="https://ssd.jpl.nasa.gov/planets/phys_par.html" target="_blank" rel="noreferrer">NASA JPL · Planetary physical parameters</a></li><li><a href="https://doi.org/10.1111/j.1945-5100.2005.tb00157.x" target="_blank" rel="noreferrer">Collins, Melosh & Marcus · Earth Impact Effects Program (2005)</a></li><li><a href="https://www.solarsystemscope.com/textures/" target="_blank" rel="noreferrer">Planet maps by Solar System Scope / INOVE</a>, based on NASA imagery. <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>. Colors and unmapped areas include artistic adjustments. Maps are locally hosted and used with atmospheric and lighting effects.</li></ul>
  <h3>Controls</h3><p>Drag to orbit. Scroll or pinch to zoom. Use the destination dock to visit a world. In the impact lab, choose a site and tap the globe. Space pauses time; [ and ] change planets; Escape cancels targeting. Your last 20 encounters stay in this browser and can be exported.</p>
 </div></dialog>`;

let sim=new SolarSystem(julianDate(new Date())),selected='earth',paused=matchMedia('(prefers-reduced-motion: reduce)').matches,speed=1/24,material:ImpactInput['material']='stone',running=false;
let lastImpact:{input:ImpactInput;result:ImpactResult;planet:string}|null=null;
type Encounter={planet:string;diameter:number;speed:number;angle:number;material:string;outcome:string;energy:number;crater:number;timestamp:string};
let history:Encounter[]=[];
try{const stored=JSON.parse(localStorage.getItem('asterion-encounters')??'[]');if(Array.isArray(stored))history=stored.filter(e=>PLANETS.some(p=>p.id===e.planet)&&Number.isFinite(e.energy)&&Number.isFinite(e.diameter)&&typeof e.outcome==='string').slice(0,20);}catch{/* Storage is optional. */}
let scene:Observatory;
const toast=(message:string)=>{$('#toast').textContent=message;$('#toast').hidden=false;setTimeout(()=>$('#toast').hidden=true,4000);};
try{
 scene=new Observatory($('#universe'),$('#world-labels'),()=>{$('#loading').hidden=true;},message=>{$('#error').textContent=message;$('#error').hidden=false;$('#loading').hidden=true;});
}catch(error){$('#loading').hidden=true;$('#error').textContent='This browser could not start WebGL 2. Enable hardware acceleration or use a current Safari, Chrome, Edge, or Firefox browser.';$('#error').hidden=false;throw error;}
const number=(n:number,d=1)=>n.toLocaleString(undefined,{maximumFractionDigits:d});
const length=(meters:number)=>meters>=1000?`${number(meters/1000)} km`:`${number(meters)} m`;
const energy=(j:number)=>j/4.184e15>=1e3?`${number(j/4.184e18,2)} Gt TNT`:j/4.184e15>=1?`${number(j/4.184e15,2)} Mt TNT`:`${number(j/4.184e12,2)} kt TNT`;
const scientific=(n:number)=>n.toExponential(2).replace('e+',' × 10^');
const planet=()=>PLANETS.find(p=>p.id===selected)!;
function selectPlanet(id:string){
 selected=id;running=false;scene.focus(id);app.dataset.view='planet';app.dataset.body=id;$('#instrument').classList.remove('watching');
 $('#planet-view').classList.add('active');$('#system-view').classList.remove('active');$('#system-settings').hidden=true;
 document.querySelectorAll<HTMLButtonElement>('[data-planet]').forEach(b=>{b.classList.toggle('active',b.dataset.planet===id);b.setAttribute('aria-pressed',String(b.dataset.planet===id));});
 const p=planet();$('#planet-name').textContent=p.name;$('#planet-subtitle').textContent=p.subtitle;$('#planet-description').textContent=p.description;
 $('#planet-kind').textContent=p.kind==='rocky'?'Terrestrial planet':p.kind==='star'?'G-type main-sequence star':p.kind==='gas'?'Gas giant':'Ice giant';$('#planet-index').textContent=p.id==='sun'?'Our star':`${String(PLANETS.indexOf(p)).padStart(2,'0')} / 08`;
 $('#planet-facts').innerHTML=`<div><dt>Mean radius</dt><dd>${number(p.radius/1000)}<small>km</small></dd></div><div><dt>Surface gravity${p.kind==='gas'||p.kind==='ice'?'¹':''}</dt><dd>${number(G*p.mass/p.radius**2,2)}<small>m/s²</small></dd></div><div><dt>Escape velocity</dt><dd>${number(Math.sqrt(2*G*p.mass/p.radius)/1000)}<small>km/s</small></dd></div>`;
 $('#world-detail').innerHTML=`<div class="planet-summary"><span class="mini-planet" style="background-image:url('/textures/${p.id}.jpg')"></span><div><strong>${p.name}</strong><span>${p.subtitle}</span></div></div><dl class="detail-list"><div><dt>Mass</dt><dd>${scientific(p.mass)} kg</dd></div><div><dt>Rotation</dt><dd>${number(Math.abs(p.rotation))} hours${p.rotation<0?' ↶':''}</dd></div><div><dt>Orbit period</dt><dd>${p.year?number(p.year>1000?p.year/365.25:p.year)+(p.year>1000?' years':' days'):'—'}</dd></div><div><dt>Mean temperature</dt><dd>${p.temperature}</dd></div><div><dt>Atmosphere</dt><dd>${p.atmosphere?(p.kind==='rocky'?'Present':'Deep atmosphere'):'No solid atmosphere'}</dd></div></dl>${p.kind==='gas'||p.kind==='ice'?'<p class="quiet-note">¹ Gravity at the mean reference radius. This world has no accessible solid surface.</p>':''}`;
 $('#earth-options').hidden=id!=='earth';$('#venus-options').hidden=id!=='venus';$('#star-note').hidden=id!=='sun';$<HTMLFieldSetElement>('#impact-controls').disabled=id==='sun';
 $('#launch').innerHTML=`${icon('impact')}<span>Launch asteroid</span>${icon('arrow')}`;$('#target-label').textContent='Choose an impact site';$('#event-status').textContent='Ready for an encounter';$('#impact-result').hidden=true;$<HTMLButtonElement>('#replay').disabled=true;lastImpact=null;
 $('#view-hint').innerHTML='Drag to orbit <i>·</i> Scroll or pinch to explore';updatePreview();
}
function tab(name:'explore'|'impact'){
 $('#instrument').classList.remove('collapsed');app.dataset.panel=name;
 for(const t of ['explore','impact']){const active=t===name;$('#'+t+'-panel').hidden=!active;$('#tab-'+t).classList.toggle('active',active);$('#tab-'+t).setAttribute('aria-pressed',String(active));}
 if(name==='impact'&&scene.view==='system')selectPlanet(selected);
}
function inputValues():ImpactInput {return {diameter:Number($<HTMLInputElement>('#diameter').value),speed:Number($<HTMLInputElement>('#velocity').value),angle:Number($<HTMLInputElement>('#angle').value),material};}
function updatePreview(){
 const input=inputValues();if(!Number.isFinite(input.diameter)||input.diameter<1||input.diameter>100000){$<HTMLButtonElement>('#launch').disabled=true;$('#energy-preview').textContent='Enter 1–100,000 m';return;}
 $<HTMLButtonElement>('#launch').disabled=running||selected==='sun';
 $('#velocity-value').innerHTML=`${input.speed} <span>km/s</span>`;$('#angle-value').innerHTML=`${input.angle}<span>°</span>`;
 $('#density-value').textContent=`${number(MATERIALS[material].density,0)} kg/m³`;
 $('#angle-line').setAttribute('d',`M${45-Math.cos(input.angle*Math.PI/180)*27} ${25-Math.sin(input.angle*Math.PI/180)*27} 45 25`);
 const mass=MATERIALS[material].density*Math.PI/6*input.diameter**3;$('#energy-preview').textContent=energy(.5*mass*(input.speed*1000)**2);$('#mass-preview').textContent=`${scientific(mass)} kg of ${material==='ice'?'ice':material}`;
}
function updatePause(){
 $('#pause').innerHTML=icon(paused?'play':'pause');$('#pause').setAttribute('aria-label',paused?'Resume simulation':'Pause simulation');
 $('#physics-status').textContent=paused?'Orbital time paused':'9-body gravity';
}
function renderResult(result:ImpactResult,input:ImpactInput){
 const name=result.outcome==='crater'?'Surface crater':result.outcome==='airburst'?'Airburst':result.outcome==='atmospheric plume'?'Atmospheric plume':'Meteorite fall';
 const caption=result.outcome==='crater'?'The impactor reached the ground at hypervelocity.':result.outcome==='airburst'?'Most incoming energy was released in the atmosphere.':result.outcome==='atmospheric plume'?'The atmosphere absorbs the encounter. No solid crater.':'The body slowed below the modeled hypervelocity regime.';
 const samples=result.samples,maxAlt=result.entryAltitude,minAlt=Math.min(...samples.map(s=>s.altitude));
 const path=samples.map((s,i)=>`${i?'L':'M'}${24+s.speed/(input.speed*1000*1.15)*234},${10+(maxAlt-s.altitude)/(maxAlt-minAlt)*86}`).join(' ');
 $('#impact-result').innerHTML=`<div class="result-heading"><span class="result-dot"></span><h3>${name}</h3><span>Estimate</span></div><p>${caption}</p><dl class="result-stats">${result.craterDiameter>0?`<div><dt>Crater diameter</dt><dd>${length(result.craterDiameter)}</dd></div><div><dt>Crater depth</dt><dd>${length(result.craterDepth)}</dd></div>`:`<div><dt>${result.outcome==='atmospheric plume'?'Energy deposited':'Peak deposition altitude'}</dt><dd>${result.outcome==='atmospheric plume'?energy(result.atmosphereEnergy):length(Math.max(0,result.burstAltitude))}</dd></div>`}<div><dt>Ground speed</dt><dd>${result.surfaceSpeed?number(result.surfaceSpeed/1000)+' km/s':'—'}</dd></div><div><dt>Ground energy</dt><dd>${result.surfaceEnergy?energy(result.surfaceEnergy):'—'}</dd></div><div><dt>Atmospheric energy</dt><dd>${energy(result.atmosphereEnergy)}</dd></div><div><dt>Modeled entry time</dt><dd>${number(result.duration)} s</dd></div></dl><div class="entry-chart"><div><span>Atmospheric descent</span><span>Speed vs. altitude</span></div><svg viewBox="0 0 280 120" role="img" aria-label="Entry speed decreases as atmospheric drag and fragmentation act on the asteroid"><path d="M24 10v86h234M24 53h234" stroke="#25364c" fill="none"/><path d="${path}" fill="none" stroke="#efb975" stroke-width="2"/><text x="24" y="114">0</text><text x="230" y="114">${input.speed} km/s</text></svg></div><details><summary>Model notes</summary><ul>${result.warnings.map(w=>`<li>${w}</li>`).join('')}</ul><p>Animation speed, shock ring and scar visibility are illustrative. The trajectory plot uses the numerical entry solution.</p></details>`;
 $('#impact-result').hidden=false;
}
let audio:AudioContext|undefined;
function impactSound(){if(!$<HTMLInputElement>('#sound-toggle').checked)return;try{audio??=new AudioContext();void audio.resume();const buffer=audio.createBuffer(1,audio.sampleRate*2,audio.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*Math.exp(-i/audio.sampleRate*3);const source=audio.createBufferSource();source.buffer=buffer;const filter=audio.createBiquadFilter();filter.type='lowpass';filter.frequency.value=320;const gain=audio.createGain();gain.gain.value=.3;source.connect(filter).connect(gain).connect(audio.destination);source.start();}catch{/* Sound remains optional. */}}
function launch(replay=false){
 if(running||selected==='sun')return;
 let input:ImpactInput,result:ImpactResult;
 try{input=replay&&lastImpact?lastImpact.input:inputValues();result=replay&&lastImpact?lastImpact.result:calculateImpact(planet(),input);}catch{toast('Choose a diameter from 1 m to 100 km.');return;}
 paused=true;updatePause();running=true;$<HTMLButtonElement>('#launch').disabled=true;$<HTMLButtonElement>('#replay').disabled=true;$('#event-status').textContent='Incoming · orbital time paused';$('#impact-result').hidden=true;
 lastImpact={input:{...input},result,planet:selected};
 scene.launch(input,result,()=>{impactSound();$('#event-status').textContent='Contact · watching the aftermath';renderResult(result,input);},()=>{
  running=false;$<HTMLButtonElement>('#launch').disabled=false;$<HTMLButtonElement>('#replay').disabled=false;$('#event-status').textContent='Impact complete · time paused';
  $('#instrument').classList.remove('watching');$('#launch').innerHTML=`${icon('impact')}<span>Launch asteroid</span>${icon('arrow')}`;
  $('#event-status').scrollIntoView({block:'start',behavior:'smooth'});
  if(!replay){history.unshift({planet:selected,...input,outcome:result.outcome,energy:result.entryEnergy,crater:result.craterDiameter,timestamp:new Date().toISOString()});history=history.slice(0,20);saveHistory();}
 },!replay);
 $('#launch').innerHTML=`${icon('impact')}<span>Encounter in progress</span>`;
 if(innerWidth<760)$('#instrument').classList.add('watching');
}
function saveHistory(){try{localStorage.setItem('asterion-encounters',JSON.stringify(history));}catch{/* Private browsing can disable persistence. */}renderHistory();}
function renderHistory(){
 $('#ledger').hidden=history.length===0;const list=$('#history-list');list.replaceChildren();
 for(const e of history.slice(0,5)){const li=document.createElement('li'),p=PLANETS.find(p=>p.id===e.planet)!;const title=document.createElement('span');title.textContent=`${p.name} · ${length(e.diameter)}`;const value=document.createElement('small');value.textContent=`${e.outcome} · ${energy(e.energy)}`;li.append(title,value);list.append(li);}
}
function showScience(){$<HTMLDialogElement>('#science-modal').showModal();}
$('#science').onclick=showScience;$('#model-link').onclick=showScience;$('#close-science').onclick=()=>$<HTMLDialogElement>('#science-modal').close();
$('#science-modal').addEventListener('click',e=>{if(e.target===$('#science-modal')){const r=$('#science-modal').getBoundingClientRect();if((e as MouseEvent).clientX<r.left||(e as MouseEvent).clientX>r.right||(e as MouseEvent).clientY<r.top||(e as MouseEvent).clientY>r.bottom)$<HTMLDialogElement>('#science-modal').close();}});
document.querySelectorAll<HTMLButtonElement>('[data-planet]').forEach(b=>b.onclick=()=>selectPlanet(b.dataset.planet!));
$('#tab-explore').onclick=()=>tab('explore');$('#tab-impact').onclick=()=>tab('impact');$('#try-impact').onclick=()=>tab('impact');$('#open-details').onclick=()=>tab('explore');
$('#collapse-panel').onclick=()=>$('#instrument').classList.toggle('collapsed');
$('#system-view').onclick=()=>{running=false;scene.system();app.dataset.view='system';$('#system-settings').hidden=false;$('#planet-name').textContent='Solar system';$('#planet-subtitle').textContent='Eight worlds. One shared star.';$('#planet-kind').textContent='The grand tour';$('#planet-index').textContent='';$('#system-view').classList.add('active');$('#planet-view').classList.remove('active');$('#instrument').classList.add('collapsed');$('#planet-description').textContent='Follow the paths of eight planets, bound together by gravity. Select a world to get closer.';$('#view-hint').textContent='Select a planet · Scroll to explore';};
$('#planet-view').onclick=()=>selectPlanet(selected);
$<HTMLSelectElement>('#distance-scale').onchange=e=>scene.setScale((e.target as HTMLSelectElement).value==='true');
$<HTMLInputElement>('#orbit-toggle').onchange=e=>{scene.showOrbits=(e.target as HTMLInputElement).checked;scene.orbitGroup.visible=scene.showOrbits;};
$<HTMLInputElement>('#label-toggle').onchange=e=>scene.showLabels=(e.target as HTMLInputElement).checked;
$('#zoom-in').onclick=()=>scene.zoom(.8);$('#zoom-out').onclick=()=>scene.zoom(1.25);$('#reset-camera').onclick=()=>scene.view==='planet'?selectPlanet(selected):scene.system();
$('#capture').onclick=()=>{scene.screenshot();toast('Planet image saved.');};$('#fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('Use your browser’s fullscreen or Add to Home Screen option.');}};
$<HTMLInputElement>('#cloud-toggle').onchange=e=>scene.setClouds((e.target as HTMLInputElement).checked);$<HTMLInputElement>('#hd-toggle').onchange=e=>scene.setEarthHD((e.target as HTMLInputElement).checked);$<HTMLInputElement>('#venus-toggle').onchange=e=>scene.setVenusSurface((e.target as HTMLInputElement).checked);$<HTMLInputElement>('#quality-toggle').onchange=e=>scene.setQuality((e.target as HTMLInputElement).checked);
$<HTMLInputElement>('#diameter').oninput=()=>{const n=Number($<HTMLInputElement>('#diameter').value);if(n>0)$<HTMLInputElement>('#size-slider').value=String(Math.log10(n));updatePreview();};
$<HTMLInputElement>('#size-slider').oninput=()=>{$<HTMLInputElement>('#diameter').value=String(Math.round(10**Number($<HTMLInputElement>('#size-slider').value)));updatePreview();};
for(const id of ['velocity','angle'])$<HTMLInputElement>('#'+id).oninput=updatePreview;
document.querySelectorAll<HTMLButtonElement>('[data-size]').forEach(b=>b.onclick=()=>{$<HTMLInputElement>('#diameter').value=b.dataset.size!;$<HTMLInputElement>('#size-slider').value=String(Math.log10(Number(b.dataset.size)));$<HTMLInputElement>('#velocity').value=b.dataset.speed!;$<HTMLInputElement>('#angle').value=b.dataset.angle!;updatePreview();toast('Historical-size preset; outcomes depend on your selected world.');});
document.querySelectorAll<HTMLButtonElement>('[data-material]').forEach(b=>b.onclick=()=>{material=b.dataset.material as ImpactInput['material'];document.querySelectorAll<HTMLButtonElement>('[data-material]').forEach(m=>{m.classList.toggle('active',m===b);m.setAttribute('aria-pressed',String(m===b));});updatePreview();});
$('#aim').onclick=()=>{if(running)return;paused=true;updatePause();scene.aiming=true;$('#target-label').textContent='Tap a point on the planet';$('#view-hint').textContent='Tap the globe to set the impact site';if(innerWidth<760)$('#instrument').classList.add('collapsed');toast('Tap anywhere on the visible planet to aim.');};
scene.onTarget=(lat,lon)=>{$('#target-label').textContent=`${Math.abs(lat).toFixed(1)}° ${lat<0?'S':'N'}, ${Math.abs(lon).toFixed(1)}° ${lon<0?'W':'E'}`;$('#view-hint').textContent='Impact site selected';if(!running)$('#instrument').classList.remove('collapsed');};
scene.onSelect=selectPlanet;scene.onFrame=fps=>{$('#fps').textContent=`${fps} fps`;};
$('#launch').onclick=()=>launch();$('#replay').onclick=()=>launch(true);
$('#export').onclick=()=>{const payload={app:'Asterion',model:'Reduced-order entry + dry-rock crater scaling v1',exported:new Date().toISOString(),encounters:history};const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='asterion-encounters.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);};
$('#clear').onclick=()=>{history=[];saveHistory();scene.clearScars();toast('Encounter history and impact scars cleared.');};
$('#pause').onclick=()=>{if(running){toast('Orbital time stays paused during the encounter.');return;}paused=!paused;updatePause();};
$<HTMLSelectElement>('#speed').onchange=e=>speed=Number((e.target as HTMLSelectElement).value);
function resetDate(date:Date){if(!Number.isFinite(date.getTime())||date.getUTCFullYear()<1800||date.getUTCFullYear()>2050){toast('Choose a date from 1800 through 2050.');return;}running=false;scene.clearEvent();sim=new SolarSystem(julianDate(date));selectPlanet(selected);updateDate();}
$<HTMLInputElement>('#date').onchange=e=>resetDate(new Date((e.target as HTMLInputElement).value+'T12:00:00Z'));$('#today').onclick=()=>resetDate(new Date());
function updateDate(){if(document.activeElement!==$('#date'))$<HTMLInputElement>('#date').value=fromJulian(sim.jd).toISOString().slice(0,10);}
document.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA'].includes((e.target as HTMLElement).tagName)||$<HTMLDialogElement>('#science-modal').open)return;if(e.code==='Space'){e.preventDefault();$('#pause').click();}if(e.key==='['||e.key===']'){const i=PLANETS.findIndex(p=>p.id===selected);selectPlanet(PLANETS[(i+(e.key===']'?1:8))%9].id);}if(e.key==='Escape'){scene.aiming=false;$('#view-hint').textContent='Drag to orbit · Scroll or pinch to explore';}});
scene.update(sim,0,performance.now());selectPlanet('earth');tab('explore');if(innerWidth<760)$('#instrument').classList.add('collapsed');renderHistory();updatePause();updateDate();
let last=performance.now(),lastUI=last;
function animate(now:number){requestAnimationFrame(animate);const elapsed=Math.max(0,(now-last)/1000);last=now;if(document.hidden)return;const dt=Math.min(elapsed,.5);if(!paused&&!running){const days=dt*speed;const next=fromJulian(sim.jd+days);if(next.getUTCFullYear()<=2050)sim.advance(days);else{paused=true;updatePause();toast('Reached the model’s 2050 date limit.');}}scene.update(sim,dt,now);if(now-lastUI>500){updateDate();lastUI=now;}}
requestAnimationFrame(animate);
