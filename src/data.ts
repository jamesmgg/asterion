export interface Planet {
  id: string; name: string; kind: 'rocky'|'gas'|'ice'|'star';
  mass: number; radius: number; color: string; tilt: number; rotation: number;
  atmosphere: {density:number;height:number}|null; targetDensity: number;
  description: string; subtitle: string; temperature: string; year: number;
}
export const SUN_MASS = 1.98847e30;
export const PLANETS: Planet[] = [
 {id:'sun',name:'Sun',kind:'star',mass:SUN_MASS,radius:695700000,color:'#ffb554',tilt:7.25,rotation:609.12,atmosphere:null,targetDensity:0,description:'The star that holds eight worlds in its gravitational embrace. Its light takes about eight minutes to reach Earth.',subtitle:'Our nearest star',temperature:'5,772 K',year:0},
 {id:'mercury',name:'Mercury',kind:'rocky',mass:3.3011e23,radius:2439700,color:'#baa99b',tilt:.034,rotation:1407.6,atmosphere:null,targetDensity:3000,description:'An ancient, cratered world with almost no atmosphere. Here, even small impactors reach the ground at cosmic speeds.',subtitle:'A world written in craters',temperature:'167 °C',year:87.969},
 {id:'venus',name:'Venus',kind:'rocky',mass:4.8675e24,radius:6051800,color:'#e5c792',tilt:2.64,rotation:-5832.5,atmosphere:{density:65,height:15900},targetDensity:2900,description:'Beneath its luminous clouds lies a volcanic surface. A crushing carbon-dioxide atmosphere shields it from smaller asteroids.',subtitle:'The veiled world',temperature:'464 °C',year:224.701},
 {id:'earth',name:'Earth',kind:'rocky',mass:5.9722e24,radius:6371000,color:'#8bc9f3',tilt:23.44,rotation:23.9345,atmosphere:{density:1.225,height:8500},targetDensity:2750,description:'Our ocean world. A thin blue atmosphere protects a surface shaped by plate tectonics, water, and encounters from space.',subtitle:'A pale blue possibility',temperature:'15 °C',year:365.256},
 {id:'mars',name:'Mars',kind:'rocky',mass:6.4171e23,radius:3389500,color:'#e7a17e',tilt:25.19,rotation:24.6229,atmosphere:{density:.020,height:11100},targetDensity:2900,description:'Rust-colored deserts, giant volcanoes, and the scars of ancient impacts. Its thin atmosphere offers little protection.',subtitle:'The next horizon',temperature:'−65 °C',year:686.98},
 {id:'jupiter',name:'Jupiter',kind:'gas',mass:1.89813e27,radius:69911000,color:'#d5bb9c',tilt:3.13,rotation:9.925,atmosphere:{density:.16,height:27000},targetDensity:0,description:'A vast, banded giant with no solid surface. Incoming bodies break apart in its atmosphere, leaving luminous plumes and dark scars.',subtitle:'Gravity, on a grand scale',temperature:'−110 °C',year:4332.59},
 {id:'saturn',name:'Saturn',kind:'gas',mass:5.6834e26,radius:58232000,color:'#e8d6a6',tilt:26.73,rotation:10.656,atmosphere:{density:.19,height:59500},targetDensity:0,description:'Countless fragments of ice form its extraordinary rings. Beneath the pale clouds is a deep, turbulent hydrogen atmosphere.',subtitle:'An architecture of ice',temperature:'−140 °C',year:10759.22},
 {id:'uranus',name:'Uranus',kind:'ice',mass:8.6810e25,radius:25362000,color:'#a9e3e5',tilt:82.23,rotation:-17.24,atmosphere:{density:.42,height:27700},targetDensity:0,description:'A quiet cyan world rotating on its side. Methane colors its atmosphere above an interior rich in water, ammonia, and methane.',subtitle:'The sideways planet',temperature:'−195 °C',year:30688.5},
 {id:'neptune',name:'Neptune',kind:'ice',mass:1.02413e26,radius:24622000,color:'#789ee8',tilt:28.32,rotation:16.11,atmosphere:{density:.45,height:19700},targetDensity:0,description:'Cold, distant, and restless. Fast winds sweep across this ice giant at the edge of the planetary solar system.',subtitle:'Beyond the blue',temperature:'−200 °C',year:60182},
];
// JPL SSD Table 1: a, e, I, L, longitude of perihelion, longitude of node.
export const ELEMENTS: Record<string, [number[],number[]]> = {
 mercury:[[.38709927,.20563593,7.00497902,252.2503235,77.45779628,48.33076593],[.00000037,.00001906,-.00594749,149472.67411175,.16047689,-.12534081]],
 venus:[[.72333566,.00677672,3.39467605,181.9790995,131.60246718,76.67984255],[.0000039,-.00004107,-.0007889,58517.81538729,.00268329,-.27769418]],
 earth:[[1.00000261,.01671123,-.00001531,100.46457166,102.93768193,0],[.00000562,-.00004392,-.01294668,35999.37244981,.32327364,0]],
 mars:[[1.52371034,.09339410,1.84969142,-4.55343205,-23.94362959,49.55953891],[.00001847,.00007882,-.00813131,19140.30268499,.44441088,-.29257343]],
 jupiter:[[5.202887,.04838624,1.30439695,34.39644051,14.72847983,100.47390909],[-.00011607,-.00013253,-.00183714,3034.74612775,.21252668,.20469106]],
 saturn:[[9.53667594,.05386179,2.48599187,49.95424423,92.59887831,113.66242448],[-.0012506,-.00050991,.00193609,1222.49362201,-.41897216,-.28867794]],
 uranus:[[19.18916464,.04725744,.77263783,313.23810451,170.9542763,74.01692503],[-.00196176,-.00004397,-.00242939,428.48202785,.40805281,.04240589]],
 neptune:[[30.06992276,.00859048,1.77004347,-55.12002969,44.96476227,131.78422574],[.00026291,.00005105,.00035372,218.45945325,-.32241464,-.00508664]],
};
export const MATERIALS = {
 stone: {name:'Stony',density:3000,strength:1e6,heat:8e6,color:'#aca291'},
 iron: {name:'Iron',density:7800,strength:5e7,heat:8e6,color:'#a3b9c5'},
 ice: {name:'Icy',density:1000,strength:1e5,heat:3e6,color:'#b9efff'},
};
