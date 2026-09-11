import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { PLANETS, ELEMENTS } from "./data.ts";
import {
  BODIES,
  MOONS,
  parentOf,
  satellitePosition,
  ephemerides,
  hasEphemeris,
} from "./satellites.ts";
import {
  surfaceVertex,
  surfaceFragment,
  simpleVertex,
  cloudFragment,
  atmosphereFragment,
} from "./shaders.ts";
import { TerrainStream } from "./terrain.ts";
import { closeUpNearPlane } from "./detail.ts";
import type { Dataset } from "./terrain.ts";
import { ImpactSequence } from "./impact-scene.ts";
import { AsteroidBelt } from "./belt.ts";
import { CosmicScene } from "./cosmic-scene.ts";
import type { CosmicDestination } from "./cosmic-data.ts";
import type { Playback } from "./impact-scene.ts";
import type { Planet } from "./data.ts";
import { AU, planetPosition } from "./physics.ts";
import type { SolarSystem, ImpactInput, ImpactResult } from "./physics.ts";

type World = {
  root: THREE.Group;
  spin: THREE.Group;
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  clouds?: THREE.Mesh;
  atmosphere?: THREE.Mesh;
  scars: THREE.Group;
  label: HTMLButtonElement;
  stream?: TerrainStream;
};
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,246,220,1)");
  g.addColorStop(0.14, "rgba(255,200,120,.9)");
  g.addColorStop(0.4, "rgba(255,118,35,.25)");
  g.addColorStop(1, "rgba(255,60,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
export class Observatory {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, 1, 0.005, 5000);
  controls: OrbitControls;
  worlds = new Map<string, World>();
  view: "planet" | "system" | "moons" | "cosmic" = "planet";
  cosmic?: CosmicScene;
  cosmicDays = 0;
  private cosmicSeconds = 0;
  private cosmicFocus?: string;
  private cosmicLabels = new Map<string, HTMLElement>();
  private solarPixelRatio?: number;
  onCosmicSelect: (id: string) => void = () => {};
  selected = "earth";
  trueScale = false;
  showOrbits = true;
  showLabels = true;
  root = new THREE.Group();
  orbitGroup = new THREE.Group();
  belt: AsteroidBelt;
  showBelt = true;
  private beltLabel: HTMLSpanElement;
  private beltTick = 0;
  private systemCamera: "oblique" | "top" | "edge" | "inner" | "belt" =
    "oblique";
  worldGroup = new THREE.Group();
  targetLocal: THREE.Vector3 | null = null;
  aiming = false;
  targetMarker: THREE.Group;
  private manager = new THREE.LoadingManager();
  private loader: THREE.TextureLoader;
  private textures = new Map<string, THREE.Texture>();
  private glow = glowTexture();
  private assetsReady = false;
  private readyCallback?: () => void;
  private desiredCamera: THREE.Vector3 | null = null;
  private followAsteroid = false;
  private selectedJD = 2451545;
  private mobile = false;
  private venusSurface = false;
  entry: ImpactSequence | null = null;
  private datasets: Record<string, Dataset> = {};
  private highQuality = true;
  private autoDetail = true;
  private terrainEnabled = true;
  private detailTick = 0;
  private lastSimulation?: SolarSystem;
  private sunlight = new THREE.DirectionalLight(0xffefdc, 2);
  private eclipseDemo = false;
  private moonParent = "earth";
  private moonGuides = new THREE.Group();
  private localCamera = new THREE.Vector3();
  private guideJD = 0;
  private guideTick = 0;
  onDetail: (text: string) => void = () => {};
  onPlayback: (value: Playback) => void = () => {};
  onSelect: (id: string) => void = () => {};
  onTarget: (lat: number, lon: number) => void = () => {};
  onFrame: (fps: number) => void = () => {};
  container: HTMLElement;
  labelContainer: HTMLElement;
  private frameCounter = 0;
  private fpsTime = 0;
  constructor(
    container: HTMLElement,
    labelContainer: HTMLElement,
    onReady: () => void,
    onError: (message: string) => void,
  ) {
    this.container = container;
    this.labelContainer = labelContainer;
    this.mobile = innerWidth < 760;
    this.belt = new AsteroidBelt(this.mobile ? 2000 : 4800);
    this.beltLabel = document.createElement("span");
    this.beltLabel.id = "belt-label";
    this.beltLabel.textContent = "Main asteroid belt";
    this.beltLabel.hidden = true;
    labelContainer.append(this.beltLabel);
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(
      Math.min(devicePixelRatio, this.mobile ? 1.6 : 2),
    );
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;
    container.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Interactive 3D solar system. Drag to orbit, pinch or scroll to zoom.",
    );
    this.renderer.domElement.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      onError(
        "The graphics context was interrupted. Reload to reopen the observatory.",
      );
    });
    this.readyCallback = onReady;
    this.manager.onLoad = () => {
      this.assetsReady = true;
    };
    this.manager.onError = (url) =>
      onError(`A planet texture could not load: ${url}. Reload to try again.`);
    this.loader = new THREE.TextureLoader(this.manager);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.enablePan = false;
    this.controls.minDistance = 1.12;
    this.controls.maxDistance = 12;
    this.controls.rotateSpeed = 0.55;
    this.controls.zoomSpeed = 0.75;
    this.controls.addEventListener("start", () => {
      this.desiredCamera = null;
    });
    this.scene.add(this.root);
    this.root.add(this.worldGroup, this.orbitGroup, this.belt);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.14));
    this.sunlight.position.set(-4, 3, 6);
    this.scene.add(this.sunlight);
    this.scene.add(this.moonGuides);
    this.makeStars();
    for (const p of BODIES) this.makeWorld(p);
    this.makeOrbits();
    this.targetMarker = this.makeTarget();
    this.focus("earth", true);
    void fetch("/tiles/manifest.json")
      .then((r) => {
        if (!r.ok) throw new Error("Detail manifest unavailable");
        return r.json();
      })
      .then((data) => {
        this.datasets = data;
        this.prepareDetail();
      })
      .catch(() => this.onDetail("Base imagery · detail unavailable"));
    new ResizeObserver(() => this.resize()).observe(container);
    let down = { x: 0, y: 0 };
    container.addEventListener("pointerdown", (e) => {
      down = { x: e.clientX, y: e.clientY };
    });
    container.addEventListener("pointerup", (e) => {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) < 7)
        this.pick(e.clientX, e.clientY);
    });
  }
  texture(name: string) {
    if (!this.textures.has(name)) {
      const t = this.loader.load(`/textures/${name}?v=20260911`);
      t.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      t.wrapS = THREE.RepeatWrapping;
      if (name.endsWith("-height.png")) {
        t.generateMipmaps = false;
        t.minFilter = THREE.LinearFilter;
      }
      this.textures.set(name, t);
    }
    return this.textures.get(name)!;
  }
  makeWorld(p: Planet) {
    const root = new THREE.Group(),
      spin = new THREE.Group(),
      scars = new THREE.Group();
    root.add(spin);
    spin.rotation.z = (p.tilt * Math.PI) / 180;
    const uniforms: Record<string, THREE.IUniform> = {
      dayMap: { value: this.texture(p.id + ".jpg") },
      nightMap: { value: this.texture("earth-night.jpg") },
      cloudMap: { value: this.texture("clouds.jpg") },
      specularMap: { value: this.texture("earth-specular.jpg") },
      sunDir: { value: new THREE.Vector3(-3, 1.5, 4) },
      earth: { value: p.id === "earth" ? 1 : 0 },
      star: { value: p.id === "sun" ? 1 : 0 },
      heightMap: { value: this.texture("earth.jpg") },
      heightRange: { value: new THREE.Vector2(0, 0) },
      heightTexel: { value: new THREE.Vector2(1 / 4096, 1 / 2048) },
      terrain: { value: 1 },
      reliefEnabled: { value: 0 },
      objectNormalMatrix: { value: new THREE.Matrix3() },
      craters: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) },
      craterDepths: { value: new Float32Array(8) },
      craterCount: { value: 0 },
      tiled: { value: 0 },
      tileRect: { value: new THREE.Vector4(0, 0, 1, 1) },
      parentMap: { value: this.texture(p.id + ".jpg") },
      parentRect: { value: new THREE.Vector4(0, 0, 1, 1) },
      parentTiled: { value: 0 },
      detailBlend: { value: 1 },
      cloudAmount: { value: 1 },
      cloudOffset: { value: 0 },
      time: { value: 0 },
      giant: { value: p.kind === "gas" || p.kind === "ice" ? 1 : 0 },
      occluders: {
        value: Array.from({ length: 8 }, () => new THREE.Vector4()),
      },
      occluderCount: { value: 0 },
      sunAngular: { value: 0.00465 },
      bodyCenter: { value: new THREE.Vector3() },
      bodyRadius: { value: 1 },
    };
    uniforms.albedoScale = {
      value: p.id === "moon" ? 0.4 : p.id === "mercury" ? 0.65 : 1,
    };
    uniforms.craterPatch = { value: 0 };
    const mat = new THREE.ShaderMaterial({
      vertexShader: surfaceVertex,
      fragmentShader: surfaceFragment,
      uniforms,
    });
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(
        1,
        this.mobile ? 96 : 160,
        this.mobile ? 64 : 100,
      ),
      mat,
    );
    spin.add(mesh);
    mesh.add(scars);
    mesh.userData.id = p.id;
    let air: THREE.Mesh | undefined;
    if (p.atmosphere) {
      const scaleHeight = p.atmosphere.height / p.radius,
        shell = 1 + Math.min(0.16, scaleHeight * 14);
      const beta =
        p.id === "earth"
          ? new THREE.Vector3(5.8, 13.5, 33.1).multiplyScalar(1e-6 * p.radius)
          : new THREE.Vector3(0.35, 0.5, 0.8)
              .divideScalar(scaleHeight)
              .multiplyScalar(p.id === "titan" ? 0.18 : 0.06);
      air = new THREE.Mesh(
        new THREE.SphereGeometry(shell, 96, 64),
        new THREE.ShaderMaterial({
          vertexShader: simpleVertex,
          fragmentShader: atmosphereFragment,
          uniforms: {
            cameraLocal: { value: new THREE.Vector3() },
            sunDir: uniforms.sunDir,
            beta: { value: beta },
            hazeColor: {
              value:
                p.id === "titan"
                  ? new THREE.Vector3(1.8, 1, 0.35)
                  : p.id === "venus"
                    ? new THREE.Vector3(1.3, 1, 0.6)
                    : new THREE.Vector3(1, 1, 1),
            },
            shell: { value: shell },
            scaleHeight: { value: scaleHeight },
          },
          transparent: true,
          side: THREE.BackSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          depthTest: false,
        }),
      );
      root.add(air);
    }
    let clouds: THREE.Mesh | undefined;
    if (p.id === "earth") {
      clouds = new THREE.Mesh(
        new THREE.SphereGeometry(1.0012, 128, 80),
        new THREE.ShaderMaterial({
          vertexShader: simpleVertex,
          fragmentShader: cloudFragment,
          uniforms,
          transparent: true,
          depthWrite: false,
        }),
      );
      spin.add(clouds);
    }
    if (p.id === "saturn" || p.id === "uranus") {
      const inner = p.id === "saturn" ? 1.23 : 1.8,
        outer = p.id === "saturn" ? 2.32 : 2.06;
      const geo = new THREE.RingGeometry(inner, outer, 180, 8),
        positions = geo.attributes.position,
        uv = geo.attributes.uv;
      for (let i = 0; i < positions.count; i++)
        uv.setXY(
          i,
          (Math.hypot(positions.getX(i), positions.getY(i)) - inner) /
            (outer - inner),
          0.5,
        );
      const rings = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({
          map: this.texture("saturn-ring.png"),
          color: p.id === "saturn" ? "#dccdab" : "#6c9d9e",
          transparent: true,
          opacity: p.id === "saturn" ? 0.87 : 0.3,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      rings.rotation.x = -Math.PI / 2;
      spin.add(rings);
    }
    if (p.id === "sun") {
      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.glow,
          color: "#ffb86c",
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          opacity: 0.75,
        }),
      );
      halo.scale.setScalar(6);
      root.add(halo);
    }
    const label = document.createElement("button");
    label.className = "world-label";
    label.textContent = p.name;
    label.ariaLabel = `Focus ${p.name}`;
    label.onclick = () => this.onSelect(p.id);
    this.labelContainer.append(label);
    this.worlds.set(p.id, {
      root,
      spin,
      mesh,
      material: mat,
      clouds,
      atmosphere: air,
      scars,
      label,
    });
    this.worldGroup.add(root);
  }
  makeStars() {
    const random = rng(2517),
      n = this.mobile ? 2600 : 5500,
      pos = new Float32Array(n * 3),
      colors = new Float32Array(n * 3),
      sizes = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const z = random() * 2 - 1,
        a = random() * Math.PI * 2,
        r = 1200,
        rr = Math.sqrt(1 - z * z);
      pos.set([Math.cos(a) * rr * r, z * r, Math.sin(a) * rr * r], i * 3);
      const b = 0.25 + random() * 0.6;
      colors.set(
        [b * (0.8 + random() * 0.2), b * (0.9 + random() * 0.1), b],
        i * 3,
      );
      sizes[i] = random() > 0.99 ? 2.2 : 0.5 + random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
    const m = new THREE.ShaderMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      vertexShader: `attribute float size;varying vec3 c;void main(){c=color;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=size*1.6;}`,
      fragmentShader: `varying vec3 c;void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;gl_FragColor=vec4(c,smoothstep(.5,.05,d)*.8);}`,
    });
    this.scene.add(new THREE.Points(g, m));
  }
  mapPosition(pos: number[], id: string) {
    const v = new THREE.Vector3(pos[0], pos[2], -pos[1]);
    if (this.trueScale) return v.multiplyScalar(1.15);
    if (id === "sun") return v.multiplyScalar(3);
    const idx = PLANETS.findIndex((p) => p.id === id),
      a = ELEMENTS[id][0][0];
    return v.multiplyScalar((3.7 + idx * 2.8) / a);
  }
  mapRadius(p: Planet) {
    // Positions are in AU: radii must use exactly the same conversion.
    if (this.trueScale) return (p.radius / AU) * 1.15;
    return p.id === "sun"
      ? 0.95
      : 0.12 + Math.pow(p.radius / 6371000, 0.52) * 0.14;
  }
  makeOrbits() {
    for (const child of [...this.orbitGroup.children]) {
      this.orbitGroup.remove(child);
      (child as THREE.Line).geometry.dispose();
      ((child as THREE.Line).material as THREE.Material).dispose();
    }
    for (const p of PLANETS.slice(1)) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 256; i++) {
        const pos = planetPosition(p.id, 2451545 + (p.year * i) / 256);
        pts.push(this.mapPosition(pos, p.id));
      }
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({
          color: p.color,
          transparent: true,
          opacity: 0.18,
        }),
      );
      this.orbitGroup.add(line);
    }
  }
  makeTarget() {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.034, 0.037, 48),
      new THREE.MeshBasicMaterial({
        color: "#e9ba7d",
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthTest: false,
      }),
    );
    group.add(ring);
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2,
        pts = [
          new THREE.Vector3(Math.cos(a) * 0.046, Math.sin(a) * 0.046, 0),
          new THREE.Vector3(Math.cos(a) * 0.068, Math.sin(a) * 0.068, 0),
        ];
      group.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color: "#e9ba7d", depthTest: false }),
        ),
      );
    }
    group.renderOrder = 10;
    return group;
  }
  resize() {
    const { width: w, height: h } = this.container.getBoundingClientRect();
    const previousAspect = this.camera.aspect;
    this.mobile = innerWidth < 760;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (
      this.view === "system" &&
      this.systemCamera === "belt" &&
      Math.abs(previousAspect - this.camera.aspect) > 0.001
    )
      this.setSystemCamera("belt");
    if (
      this.view === "cosmic" &&
      Math.abs(previousAspect - this.camera.aspect) > 0.001
    )
      this.resetCosmicCamera();
  }
  openCosmic(destination: CosmicDestination) {
    this.closeCosmic();
    this.clearEvent();
    this.disposeDetail();
    this.aiming = false;
    this.targetLocal = null;
    this.targetMarker.removeFromParent();
    this.eclipseDemo = false;
    this.worldGroup.visible = false;
    this.orbitGroup.visible = false;
    this.belt.visible = false;
    this.beltLabel.hidden = true;
    this.moonGuides.visible = false;
    for (const world of this.worlds.values()) world.label.hidden = true;
    this.cosmic = new CosmicScene(destination, this.mobile);
    this.scene.add(this.cosmic.group);
    this.view = "cosmic";
    this.cosmicDays = this.cosmicSeconds = 0;
    this.cosmicFocus = undefined;
    this.solarPixelRatio = this.renderer.getPixelRatio();
    if (destination.kind === "black-hole")
      this.renderer.setPixelRatio(
        Math.min(this.solarPixelRatio, this.mobile ? 1 : 1.25),
      );
    this.renderer.domElement.setAttribute(
      "aria-label",
      `Interactive 3D view of ${destination.name}. Drag to orbit, pinch or scroll to zoom.`,
    );
    this.focusCosmicBody();
  }
  private closeCosmic() {
    if (!this.cosmic) return;
    this.cosmic.group.removeFromParent();
    this.cosmic.dispose();
    this.cosmic = undefined;
    for (const label of this.cosmicLabels.values()) label.remove();
    this.cosmicLabels.clear();
    this.worldGroup.visible = true;
    if (this.solarPixelRatio !== undefined)
      this.renderer.setPixelRatio(this.solarPixelRatio);
    this.solarPixelRatio = undefined;
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Interactive 3D solar system. Drag to orbit, pinch or scroll to zoom.",
    );
  }
  advanceCosmic(dt: number, speed: number) {
    this.cosmicDays += dt * speed;
    this.cosmicSeconds += dt;
  }
  focusCosmicBody(id?: string) {
    const cosmic = this.cosmic;
    if (!cosmic) return;
    this.cosmicFocus = cosmic.destination.bodies.some((body) => body.id === id)
      ? id
      : undefined;
    cosmic.setFocus(this.cosmicFocus);
    cosmic.update(this.cosmicDays, this.cosmicSeconds);
    const target = cosmic
      .getTargets()
      .find((body) => body.id === this.cosmicFocus);
    const origin = target?.position ?? new THREE.Vector3();
    cosmic.group.position.copy(origin).negate();
    const pose = cosmic.cameraFor(this.cosmicFocus);
    const fit = Math.max(1, 1 / this.camera.aspect);
    this.controls.target.copy(pose.target).sub(origin);
    this.camera.position
      .copy(pose.position)
      .sub(pose.target)
      .multiplyScalar(fit)
      .add(this.controls.target);
    this.controls.minDistance = pose.minDistance;
    this.controls.maxDistance = pose.maxDistance * fit;
    this.desiredCamera = null;
    // Close-ups use a floating origin so tiny, true-scale worlds retain precision.
    this.camera.near = Math.max(
      1e-9,
      Math.min(0.005, (target?.radius ?? 1) * 0.01),
    );
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }
  resetCosmicCamera() {
    this.focusCosmicBody(this.cosmicFocus);
  }
  setCosmicScale(real: boolean) {
    this.cosmic?.setScale(real);
    this.resetCosmicCamera();
  }
  setCosmicComparison(show: boolean) {
    this.cosmic?.setComparison(show);
    this.focusCosmicBody();
  }
  private updateCosmic(now: number) {
    const cosmic = this.cosmic!;
    cosmic.update(this.cosmicDays, this.cosmicSeconds);
    const targets = cosmic.getTargets();
    const focus = targets.find((body) => body.id === this.cosmicFocus);
    cosmic.group.position.copy(focus?.position ?? new THREE.Vector3()).negate();
    cosmic.group.updateWorldMatrix(true, true);
    this.controls.update();
    this.camera.updateMatrixWorld();
    const rect = this.container.getBoundingClientRect();
    for (const target of targets) {
      let label = this.cosmicLabels.get(target.id);
      if (!label) {
        const selectable = cosmic.destination.bodies.some(
          (body) => body.id === target.id,
        );
        label = document.createElement(selectable ? "button" : "span");
        label.className = "world-label cosmic-label";
        label.textContent = target.name;
        label.dataset.cosmicTarget = target.id;
        if (selectable) {
          label.setAttribute("aria-label", `Focus ${target.name}`);
          label.onclick = () => this.onCosmicSelect(target.id);
        }
        this.labelContainer.append(label);
        this.cosmicLabels.set(target.id, label);
      }
      const anchor = target.position.clone().add(cosmic.group.position);
      // Put comparison labels outside the stellar disks; single-object views
      // already identify their subject in the heading and need no center tag.
      if (cosmic.destination.kind === "star") {
        const screenUp = new THREE.Vector3().setFromMatrixColumn(
          this.camera.matrixWorld,
          1,
        );
        anchor.addScaledVector(screenUp, -target.radius * 1.15);
      }
      const projected = anchor.project(this.camera);
      label.hidden =
        !!focus ||
        (cosmic.destination.kind !== "system" && targets.length === 1) ||
        projected.z > 1 ||
        projected.z < -1 ||
        Math.abs(projected.x) > 1 ||
        Math.abs(projected.y) > 1;
      label.style.transform = `translate(${(projected.x * 0.5 + 0.5) * rect.width}px,${(-projected.y * 0.5 + 0.5) * rect.height + 14}px)`;
    }
    for (const [id, label] of this.cosmicLabels)
      if (!targets.some((body) => body.id === id)) label.hidden = true;
    this.renderer.render(this.scene, this.camera);
    this.finishFrame(now);
  }
  focus(id: string, instant = false) {
    this.closeCosmic();
    this.clearEvent();
    this.eclipseDemo = false;
    this.moonGuides.visible = false;
    this.disposeDetail();
    this.selected = id;
    this.view = "planet";
    this.targetLocal = null;
    this.aiming = false;
    this.targetMarker.removeFromParent();
    for (const [key, w] of this.worlds) {
      w.root.visible = key === id;
      w.root.position.set(0, 0, 0);
      w.root.scale.setScalar(1);
      w.label.hidden = true;
    }
    this.orbitGroup.visible = false;
    this.belt.visible = false;
    this.beltLabel.hidden = true;
    this.controls.target.set(0, 0, 0);
    this.controls.minDistance = 1.003;
    this.controls.maxDistance = 180;
    this.loadEphemerides(parentOf(id));
    const distance = id === "saturn" ? 7 : 4.8;
    if (this.lastSimulation) {
      const sim = this.lastSimulation,
        b = sim.bodies.find((b) => b.id === parentOf(id))!,
        s = sim.bodies[0].position;
      this.worlds
        .get(id)!
        .material.uniforms.sunDir.value.set(
          s[0] - b.position[0],
          s[2] - b.position[2],
          b.position[1] - s[1],
        )
        .normalize();
    }
    const sun = (
      this.worlds.get(id)!.material.uniforms.sunDir.value as THREE.Vector3
    )
      .clone()
      .normalize();
    this.desiredCamera = sun
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.7)
      .add(new THREE.Vector3(0, 0.15, 0))
      .normalize()
      .multiplyScalar(distance);
    if (instant) {
      this.camera.position.copy(this.desiredCamera);
      this.desiredCamera = null;
    }
    this.controls.update();
    this.prepareDetail();
  }
  system() {
    this.closeCosmic();
    this.clearEvent();
    this.eclipseDemo = false;
    this.moonGuides.visible = false;
    this.disposeDetail();
    this.view = "system";
    this.targetMarker.removeFromParent();
    this.controls.target.set(0, 0, 0);
    this.controls.minDistance = 3;
    this.controls.maxDistance = 150;
    this.desiredCamera = new THREE.Vector3(2, 35, 43);
    this.orbitGroup.visible = this.showOrbits;
    this.systemCamera = "oblique";
    this.belt.visible = this.showBelt;
    this.belt.update(this.selectedJD, this.trueScale);
    for (const [id, w] of this.worlds)
      w.root.visible = PLANETS.some((p) => p.id === id);
  }
  setBelt(show: boolean) {
    this.showBelt = show;
    this.belt.visible = this.view === "system" && show;
    this.beltLabel.hidden = !this.belt.visible;
  }
  setScale(real: boolean) {
    this.trueScale = real;
    this.makeOrbits();
    this.belt.update(this.selectedJD, real);
    if (this.view === "system") this.setSystemCamera(this.systemCamera);
  }
  zoom(multiplier: number) {
    this.desiredCamera = null;
    this.camera.position
      .sub(this.controls.target)
      .multiplyScalar(multiplier)
      .clampLength(this.controls.minDistance, this.controls.maxDistance)
      .add(this.controls.target);
    this.controls.update();
  }
  setQuality(high: boolean) {
    this.highQuality = high;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, high ? 2 : 1));
    this.resize();
  }
  setClouds(show: boolean) {
    const clouds = this.worlds.get("earth")?.clouds;
    if (clouds) clouds.visible = show;
    this.worlds.get("earth")!.material.uniforms.cloudAmount.value = show
      ? 1
      : 0;
  }
  setVenusSurface(show: boolean) {
    this.venusSurface = show;
    this.worlds.get("venus")!.material.uniforms.dayMap.value = this.texture(
      show ? "venus-surface.jpg" : "venus.jpg",
    );
    this.disposeDetail();
    this.prepareDetail();
  }
  setEarthHD(show: boolean) {
    this.autoDetail = show;
    this.disposeDetail();
    this.prepareDetail();
  }
  setTarget(local: THREE.Vector3) {
    this.targetLocal = local.normalize();
    const w = this.worlds.get(this.selected)!;
    w.mesh.add(this.targetMarker);
    this.targetMarker.position.copy(local).multiplyScalar(1.01);
    this.targetMarker.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      local,
    );
    const lat = (Math.asin(local.y) * 180) / Math.PI,
      lon = (Math.atan2(local.z, -local.x) * 180) / Math.PI;
    this.onTarget(lat, lon);
    this.aiming = false;
  }
  pick(x: number, y: number) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((x - rect.left) / rect.width) * 2 - 1,
      (-(y - rect.top) / rect.height) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(pointer, this.camera);
    if (this.view === "cosmic") {
      const id = this.cosmic?.pick(ray);
      if (id && this.cosmic?.destination.bodies.some((body) => body.id === id))
        this.onCosmicSelect(id);
      return;
    }
    if (this.view !== "planet") {
      const hit = ray.intersectObjects(
        [...this.worlds.values()]
          .filter((w) => w.root.visible)
          .map((w) => w.mesh),
      )[0];
      if (hit) this.onSelect(hit.object.userData.id);
    } else if (this.aiming) {
      const w = this.worlds.get(this.selected)!;
      const hit = ray.intersectObject(w.mesh, false)[0];
      if (hit) this.setTarget(w.mesh.worldToLocal(hit.point.clone()));
    }
  }
  launch(
    input: ImpactInput,
    result: ImpactResult,
    onHit: () => void,
    onFinish: () => void,
    recordScar = true,
  ) {
    this.clearEvent();
    const world = this.worlds.get(this.selected)!;
    if (!this.targetLocal) {
      world.mesh.updateWorldMatrix(true, false);
      this.setTarget(
        world.mesh.worldToLocal(this.camera.position.clone()).normalize(),
      );
    }
    this.entry = new ImpactSequence(
      BODIES.find((p) => p.id === this.selected)!,
      input,
      result,
      this.targetLocal!,
      this.glow,
      this.mobile,
      () => {
        if (recordScar) this.addCrater(result);
        if (this.followAsteroid) this.impactCamera("site");
        onHit();
      },
      onFinish,
    );
    this.entry.onProgress = (value) => this.onPlayback(value);
    world.mesh.add(this.entry.group);
    this.targetMarker.removeFromParent();
    this.impactCamera("approach");
  }
  impactCamera(mode: "approach" | "site" | "planet" | "debris") {
    if (!this.entry || !this.targetLocal) return;
    this.followAsteroid = mode === "approach" && this.entry.time < 3.5;
    this.camera.near = this.followAsteroid
      ? Math.max(1e-8, this.entry.incomingRadius * 0.03)
      : 0.00002;
    this.camera.updateProjectionMatrix();
    if (this.followAsteroid) {
      this.desiredCamera = null;
      this.controls.minDistance = this.entry.incomingRadius * 2;
      return;
    }
    const w = this.worlds.get(this.selected)!,
      p = BODIES.find((p) => p.id === this.selected)!;
    w.mesh.updateWorldMatrix(true, false);
    const normal = w.mesh.localToWorld(this.targetLocal.clone()).normalize();
    if (mode === "planet") {
      this.controls.target.set(0, 0, 0);
      this.controls.minDistance = 1.003;
      this.desiredCamera = normal.clone().multiplyScalar(3.7);
      return;
    }
    if (mode === "debris") {
      this.controls.target.set(0, 0, 0);
      this.controls.minDistance = 1.003;
      this.desiredCamera = normal
        .clone()
        .multiplyScalar(6)
        .add(new THREE.Vector3(0, 2, 0));
      this.entry.showPaths(true);
      return;
    }
    const crater = this.entry.result.craterDiameter / (2 * p.radius),
      height = Math.max(0.004, Math.min(0.6, crater * 5));
    const tangent = new THREE.Vector3(0, 1, 0).cross(normal).normalize();
    this.controls.target.copy(normal);
    this.controls.minDistance = Math.max(0.003, height * 0.3);
    this.controls.maxDistance = 180;
    this.desiredCamera = normal
      .clone()
      .multiplyScalar(1 + height * 0.85)
      .addScaledVector(tangent, height * 1.7)
      .add(new THREE.Vector3(0, height * 0.5, 0));
  }
  private addCrater(result: ImpactResult) {
    if (result.outcome !== "crater" || !this.targetLocal) return;
    const p = BODIES.find((p) => p.id === this.selected)!,
      w = this.worlds.get(p.id)!,
      u = w.material.uniforms;
    const count = u.craterCount.value as number,
      index = (w.mesh.userData.craterCursor ?? 0) % 8;
    w.mesh.userData.craterCursor = index + 1;
    u.craters.value[index].set(
      this.targetLocal.x,
      this.targetLocal.y,
      this.targetLocal.z,
      Math.min(0.35, result.craterDiameter / (2 * p.radius)),
    );
    u.craterDepths.value[index] = Math.min(0.05, result.craterDepth / p.radius);
    u.craterCount.value = Math.min(8, count + 1);
    for (const old of [...w.scars.children])
      if (old.userData.craterIndex === index) {
        old.removeFromParent();
        (old as THREE.Mesh).geometry.dispose();
        ((old as THREE.Mesh).material as THREE.Material).dispose();
      }
    // A dense local patch resolves even a small crater; the parent surface is cut
    // out in the fragment shader so its coarse triangles cannot fill the bowl.
    const radius = u.craters.value[index].w,
      extent = Math.min(0.85, radius * 1.75),
      segments = this.mobile ? 64 : 128;
    const geo = new THREE.PlaneGeometry(
        extent * 2,
        extent * 2,
        segments,
        segments,
      ),
      pos = geo.attributes.position,
      uv = geo.attributes.uv;
    const rotation = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        this.targetLocal,
      ),
      n = new THREE.Vector3();
    const centerU =
      (Math.atan2(this.targetLocal.z, -this.targetLocal.x) / (Math.PI * 2) +
        1) %
      1;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i),
        y = pos.getY(i);
      n.set(x, y, Math.sqrt(Math.max(0.01, 1 - x * x - y * y)))
        .normalize()
        .applyQuaternion(rotation);
      pos.setXYZ(i, n.x, n.y, n.z);
      let longitude = (Math.atan2(n.z, -n.x) / (Math.PI * 2) + 1) % 1;
      if (longitude - centerU > 0.5) longitude -= 1;
      if (longitude - centerU < -0.5) longitude += 1;
      uv.setXY(i, longitude, Math.acos(-n.y) / Math.PI);
    }
    geo.computeVertexNormals();
    const mat = new THREE.ShaderMaterial({
      vertexShader: surfaceVertex,
      fragmentShader: surfaceFragment,
      uniforms: { ...u, craterPatch: { value: 1 } },
      polygonOffset: true,
      polygonOffsetFactor: -8,
      polygonOffsetUnits: -8,
    });
    const patch = new THREE.Mesh(geo, mat);
    patch.userData.craterIndex = index;
    w.scars.add(patch);
  }
  clearScars() {
    for (const w of this.worlds.values()) {
      w.material.uniforms.craterCount.value = 0;
      w.mesh.userData.craterCursor = 0;
      for (const obj of [...w.scars.children]) {
        obj.removeFromParent();
        (obj as THREE.Mesh).geometry.dispose();
        ((obj as THREE.Mesh).material as THREE.Material).dispose();
      }
    }
  }
  clearEvent() {
    this.followAsteroid = false;
    this.camera.near = 0.005;
    this.camera.updateProjectionMatrix();
    if (this.entry) {
      this.entry.dispose();
      this.entry = null;
    }
  }
  setTerrain(show: boolean) {
    this.terrainEnabled = show;
    for (const w of this.worlds.values())
      w.material.uniforms.terrain.value = show ? 1 : 0;
  }
  private disposeDetail() {
    for (const w of this.worlds.values()) {
      w.stream?.dispose();
      w.stream = undefined;
      w.material.colorWrite = true;
      w.material.depthWrite = true;
    }
  }
  private loadingEphemerides = new Set<string>();
  private loadEphemerides(parent: string) {
    for (const moon of MOONS.filter((m) => m.parent === parent)) {
      if (ephemerides.has(moon.id) || this.loadingEphemerides.has(moon.id))
        continue;
      this.loadingEphemerides.add(moon.id);
      void fetch(`/ephemerides/${moon.id}.json`)
        .then((r) => {
          if (!r.ok) throw new Error("Ephemeris unavailable");
          return r.json();
        })
        .then((data) => {
          ephemerides.set(moon.id, data);
          if (this.view === "moons" && this.moonParent === parent)
            this.refreshMoonGuides();
        })
        .catch(() => {})
        .finally(() => this.loadingEphemerides.delete(moon.id));
    }
  }
  private prepareDetail() {
    if (this.view !== "planet") return;
    const w = this.worlds.get(this.selected)!,
      p = BODIES.find((p) => p.id === this.selected)!;
    const datasetId =
        this.selected === "venus" && this.venusSurface
          ? "venus-surface"
          : this.selected,
      dataset = this.datasets[datasetId];
    if (
      dataset &&
      (dataset.maxLevel ?? 0) > 0 &&
      this.autoDetail &&
      !w.stream
    ) {
      w.stream = new TerrainStream(
        datasetId,
        dataset,
        w.material.uniforms,
        this.mobile ? 40 : 80,
      );
      w.mesh.add(w.stream.group);
    }
    const height = this.datasets[this.selected + "-height"];
    if (height) {
      w.material.uniforms.heightMap.value = this.texture(
        this.selected + "-height.png",
      );
      w.material.uniforms.heightRange.value.set(
        height.min! / p.radius,
        (height.max! - height.min!) / p.radius,
      );
      w.material.uniforms.reliefEnabled.value = 1;
      if (!this.entry)
        this.controls.minDistance = 1 + height.max! / p.radius + 0.001;
    }
  }
  private refreshMoonGuides() {
    this.guideJD = this.selectedJD;
    for (const obj of [...this.moonGuides.children]) {
      obj.removeFromParent();
      (obj as THREE.Line).geometry.dispose();
      ((obj as THREE.Line).material as THREE.Material).dispose();
    }
    const parent = PLANETS.find((p) => p.id === this.moonParent)!;
    for (const m of MOONS.filter((m) => m.parent === this.moonParent)) {
      const table = ephemerides.get(m.id);
      let start = this.selectedJD;
      if (table && hasEphemeris(m.id, start))
        start = Math.max(
          table.start - 69.184 / 86400,
          Math.min(
            start,
            table.start +
              table.step * (table.states.length - 1) -
              m.year -
              69.184 / 86400,
          ),
        );
      const points = Array.from({ length: 257 }, (_, i) =>
        new THREE.Vector3(
          ...satellitePosition(m, start + (m.year * i) / 256),
        ).divideScalar(parent.radius),
      );
      this.moonGuides.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(points),
          new THREE.LineBasicMaterial({
            color: m.color,
            transparent: true,
            opacity: 0.3,
          }),
        ),
      );
    }
  }
  satellites(parent: string) {
    this.focus(parent);
    this.view = "moons";
    this.moonParent = parent;
    this.disposeDetail();
    this.moonGuides.visible = true;
    this.refreshMoonGuides();
    const p = PLANETS.find((p) => p.id === parent)!,
      moons = MOONS.filter((m) => m.parent === parent);
    for (const m of moons) this.worlds.get(m.id)!.root.visible = true;
    const reach = Math.max(...moons.map((m) => m.orbit.a / p.radius));
    this.controls.minDistance = 1.05;
    this.controls.maxDistance = reach * 5;
    this.controls.target.set(0, 0, 0);
    this.desiredCamera = new THREE.Vector3(0.1, 0.65, 1)
      .normalize()
      .multiplyScalar(reach * 3.4);
  }
  demonstrateEclipse() {
    this.focus("jupiter");
    this.eclipseDemo = true;
    const sun = this.worlds.get("jupiter")!.material.uniforms.sunDir
      .value as THREE.Vector3;
    this.desiredCamera = sun
      .clone()
      .normalize()
      .multiplyScalar(3.4)
      .add(new THREE.Vector3(0, 0.3, 0));
  }
  setSystemCamera(mode: "oblique" | "top" | "edge" | "inner" | "belt") {
    this.systemCamera = mode;
    this.controls.target.set(0, 0, 0);
    if (mode === "belt") {
      const radius = this.trueScale ? 4.1 : 17.2;
      const halfFov = Math.atan(
        Math.tan((this.camera.fov * Math.PI) / 360) *
          Math.min(
            1,
            this.container.clientWidth /
              Math.max(1, this.container.clientHeight),
          ),
      );
      this.controls.maxDistance = 200;
      this.desiredCamera = new THREE.Vector3(0, 0.9, 0.45)
        .normalize()
        .multiplyScalar((radius / Math.sin(halfFov)) * 1.12);
      return;
    }
    this.desiredCamera =
      mode === "top"
        ? new THREE.Vector3(0, 75, 0.01)
        : mode === "edge"
          ? new THREE.Vector3(0, 1.2, 65)
          : mode === "inner"
            ? new THREE.Vector3(
                0,
                this.trueScale ? 3.5 : 15,
                this.trueScale ? 5 : 20,
              )
            : new THREE.Vector3(2, 35, 43);
  }
  update(sim: SolarSystem, dt: number, now: number) {
    if (this.view === "cosmic" && this.cosmic) {
      this.updateCosmic(now);
      return;
    }
    this.lastSimulation = sim;
    this.selectedJD = sim.jd;
    const sun = sim.bodies[0].position;
    const selectedParent = parentOf(this.selected),
      parent = PLANETS.find((p) => p.id === selectedParent)!;
    const parentBody = sim.bodies.find((b) => b.id === selectedParent)!;
    const sunlight = new THREE.Vector3(
      sun[0] - parentBody.position[0],
      sun[2] - parentBody.position[2],
      parentBody.position[1] - sun[1],
    ).normalize();
    this.sunlight.position.copy(sunlight).multiplyScalar(30);
    for (const p of BODIES) {
      const w = this.worlds.get(p.id)!,
        u = w.material.uniforms;
      if (!this.entry) {
        w.spin.rotation.set(0, 0, (p.tilt * Math.PI) / 180);
        w.mesh.rotation.y =
          ((((sim.jd - 2451545) * 24) / p.rotation) * Math.PI * 2) %
          (Math.PI * 2);
        if (w.clouds) w.clouds.rotation.y = w.mesh.rotation.y;
      }
      u.time.value = now / 1000;
      u.cloudOffset.value = Math.sin((sim.jd - 2451545) * 0.025) * 0.003;
      u.occluderCount.value = 0;
      if (this.view === "system") {
        const b = sim.bodies.find((b) => b.id === p.id);
        if (!b) {
          w.root.visible = false;
          w.label.hidden = true;
          continue;
        }
        w.root.position.copy(
          this.mapPosition(
            b.position.map((v, i) => v - sun[i]),
            p.id,
          ),
        );
        w.root.scale.setScalar(this.mapRadius(p));
        (u.sunDir.value as THREE.Vector3).copy(w.root.position).negate();
      } else {
        (u.sunDir.value as THREE.Vector3).copy(sunlight);
        if (this.view === "moons") {
          const moon = MOONS.find((m) => m.id === p.id);
          w.root.visible =
            p.id === this.moonParent || moon?.parent === this.moonParent;
          if (moon && moon.parent === this.moonParent) {
            w.root.position
              .set(...satellitePosition(moon, sim.jd))
              .divideScalar(parent.radius);
            w.root.scale.setScalar(moon.radius / parent.radius);
          }
        }
        u.sunAngular.value =
          0.00465047 /
          Math.hypot(...parentBody.position.map((v, i) => v - sun[i]));
        const moon = MOONS.find((m) => m.id === this.selected);
        if (this.view === "planet" && p.id === this.selected) {
          if (moon) {
            const pos = new THREE.Vector3(...satellitePosition(moon, sim.jd))
              .negate()
              .divideScalar(moon.radius);
            u.occluders.value[0].set(
              pos.x,
              pos.y,
              pos.z,
              parent.radius / moon.radius,
            );
            u.occluderCount.value = 1;
          } else {
            const moons = MOONS.filter((m) => m.parent === p.id);
            moons.forEach((m, i) => {
              const pos = new THREE.Vector3(
                ...satellitePosition(m, sim.jd),
              ).divideScalar(p.radius);
              if (this.eclipseDemo && i === 0)
                pos.copy(sunlight).multiplyScalar(m.orbit.a / p.radius);
              u.occluders.value[i].set(
                pos.x,
                pos.y,
                pos.z,
                m.radius / p.radius,
              );
            });
            u.occluderCount.value = moons.length;
          }
        }
      }
      w.root.updateWorldMatrix(true, true);
      u.objectNormalMatrix.value.setFromMatrix4(w.mesh.matrixWorld);
      u.bodyCenter.value.copy(w.root.position);
      u.bodyRadius.value = w.root.scale.x;
      w.label.hidden =
        this.view === "planet" || !this.showLabels || !w.root.visible;
      if (!w.label.hidden) {
        const projected = w.root.position.clone().project(this.camera);
        const rect = this.container.getBoundingClientRect();
        w.label.style.transform = `translate(${(projected.x * 0.5 + 0.5) * rect.width}px,${(-projected.y * 0.5 + 0.5) * rect.height + 12}px)`;
        w.label.style.display = projected.z > 1 ? "none" : "";
      }
    }
    if (this.view === "moons") {
      if (
        now - this.guideTick > 2000 &&
        Math.abs(sim.jd - this.guideJD) > 0.5
      ) {
        this.guideTick = now;
        this.refreshMoonGuides();
      }
      const visible = [...this.worlds.values()].filter((w) => w.root.visible);
      for (const w of visible) {
        let i = 0;
        for (const other of visible) {
          if (other === w) continue;
          w.material.uniforms.occluders.value[i++].set(
            other.root.position.x,
            other.root.position.y,
            other.root.position.z,
            other.root.scale.x,
          );
        }
        w.material.uniforms.occluderCount.value = i;
      }
    }
    if (this.desiredCamera) {
      this.camera.position.lerp(this.desiredCamera, 1 - Math.exp(-dt * 4));
      if (this.camera.position.distanceTo(this.desiredCamera) < 0.0001)
        this.desiredCamera = null;
    }
    this.controls.update();
    const credits = document.getElementById("ephemeris-credit");
    if (credits) {
      const family = MOONS.filter((m) => m.parent === parentOf(this.selected));
      credits.textContent =
        family.length && family.every((m) => hasEphemeris(m.id, sim.jd))
          ? "Moon positions: JPL Horizons vectors (2026–2027)"
          : "Moon positions: approximate reference orbits";
    }
    if (this.view === "planet") {
      const w = this.worlds.get(this.selected)!;
      this.localCamera.copy(this.camera.position);
      w.mesh.worldToLocal(this.localCamera);
      const pixels =
        (this.container.clientHeight *
          Math.min(devicePixelRatio, this.mobile ? 1.8 : 2)) /
        (2 * Math.tan((this.camera.fov * Math.PI) / 360));
      if (w.stream) {
        const ready = w.stream.update(
          this.localCamera,
          pixels,
          this.highQuality,
          now,
        );
        w.material.colorWrite = !ready;
        w.material.depthWrite = !ready;
      }
      const altitude = Math.max(
        0,
        ((this.localCamera.length() - 1) *
          BODIES.find((p) => p.id === this.selected)!.radius) /
          1000,
      );
      const dataset = this.datasets[this.selected],
        detail = w.stream
          ? `${2 ** Math.max(1, w.stream.activeLevel)}K detail${w.stream.pending ? " · refining" : ""}`
          : "Base map";
      if (now - this.detailTick > 150) {
        this.detailTick = now;
        this.onDetail(
          `${altitude.toLocaleString(undefined, { maximumFractionDigits: 0 })} km altitude · ${detail}${dataset && dataset.maxLevel === w.stream?.activeLevel ? " · source limit" : ""}`,
        );
      }
    }
    this.entry?.update(dt);
    if (this.followAsteroid && this.entry && this.entry.time >= 3.5)
      this.impactCamera("site");
    if (this.followAsteroid && this.entry) {
      const position = this.entry.incomingPosition();
      const outward = position.clone().normalize();
      const tangent = new THREE.Vector3(0, 1, 0).cross(outward).normalize();
      this.controls.target.copy(position);
      this.camera.position
        .copy(position)
        .addScaledVector(outward, this.entry.incomingRadius * 7)
        .addScaledVector(tangent, this.entry.incomingRadius * 3);
      this.controls.update();
    }
    this.beltLabel.hidden = this.view !== "system" || !this.showBelt;
    if (this.view === "system" && this.showBelt) {
      this.belt.visible = true;
      this.belt.points.material.uniforms.pixelRatio.value =
        this.renderer.getPixelRatio();
      if (now - this.beltTick > 50) {
        this.beltTick = now;
        this.belt.update(sim.jd, this.trueScale);
      }
      const radius = this.trueScale ? 3.2 : 16.5;
      const anchor = new THREE.Vector3(radius * 0.8, 0, radius * 0.6).project(
        this.camera,
      );
      this.beltLabel.hidden =
        anchor.z > 1 || Math.abs(anchor.x) > 1 || Math.abs(anchor.y) > 1;
      this.beltLabel.style.transform = `translate(${(anchor.x * 0.5 + 0.5) * this.container.clientWidth}px,${(-anchor.y * 0.5 + 0.5) * this.container.clientHeight + 20}px) translate(-50%,0)`;
    }
    // Ray marching must use the camera that renders this frame, after damping,
    // zoom, and encounter tracking. A one-frame lag tears the atmospheric limb.
    for (const w of this.worlds.values()) {
      if (!w.root.visible || !w.atmosphere) continue;
      const a = w.atmosphere.material as THREE.ShaderMaterial;
      a.uniforms.cameraLocal.value
        .copy(this.camera.position)
        .sub(w.root.position)
        .divideScalar(w.root.scale.x);
    }
    if (this.view === "planet" && !this.entry) {
      const p = BODIES.find((p) => p.id === this.selected)!;
      const relief = this.terrainEnabled
        ? (this.datasets[this.selected + "-height"]?.max ?? 0) / p.radius
        : 0;
      const near = closeUpNearPlane(this.camera.position.length(), relief);
      if (Math.abs(near - this.camera.near) > 0.000001) {
        this.camera.near = near;
        this.camera.updateProjectionMatrix();
      }
    }
    this.renderer.render(this.scene, this.camera);
    this.finishFrame(now);
  }
  private finishFrame(now: number) {
    if (this.assetsReady && this.readyCallback && !this.desiredCamera) {
      this.readyCallback();
      this.readyCallback = undefined;
    }
    this.frameCounter++;
    if (now - this.fpsTime > 2000) {
      const fps = Math.round((this.frameCounter * 1000) / (now - this.fpsTime));
      this.onFrame(fps);
      if (this.highQuality) {
        const ratio = this.renderer.getPixelRatio(),
          ceiling = Math.min(
            devicePixelRatio,
            this.cosmic?.destination.kind === "black-hole"
              ? this.mobile
                ? 1
                : 1.25
              : this.mobile
                ? 1.8
                : 2,
          );
        if (fps < 28 && ratio > 0.8) {
          this.renderer.setPixelRatio(Math.max(0.8, ratio - 0.2));
          this.resize();
        } else if (fps > 52 && ratio < ceiling) {
          this.renderer.setPixelRatio(Math.min(ceiling, ratio + 0.1));
          this.resize();
        }
      }
      this.frameCounter = 0;
      this.fpsTime = now;
    }
  }
  screenshot() {
    const a = document.createElement("a");
    a.download = `asterion-${this.cosmic ? (this.cosmicFocus ?? this.cosmic.destination.id) : this.selected}.png`;
    a.href = this.renderer.domElement.toDataURL("image/png");
    a.click();
  }
}
