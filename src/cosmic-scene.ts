import * as THREE from "three";
import { cosmicOrbitPosition } from "./cosmic-data.ts";
import type { CosmicBody, CosmicDestination } from "./cosmic-data.ts";
import {
  cosmicVertex,
  stellarFragment,
  coronaFragment,
  exoplanetFragment,
  blackHoleVertex,
  blackHoleFragment,
} from "./cosmic-shaders.ts";

const AU_KM = 149597870.7;
const SUN_RADIUS_KM = 695700;

export interface CosmicTarget {
  id: string;
  name: string;
  position: THREE.Vector3;
  radius: number;
}

export interface CosmicCamera {
  position: THREE.Vector3;
  target: THREE.Vector3;
  minDistance: number;
  maxDistance: number;
}

type CosmicWorld = {
  body: CosmicBody;
  root: THREE.Group;
  surface: THREE.Mesh;
  radius: number;
  materials: THREE.ShaderMaterial[];
};

/** Destination artwork shares the main Observatory renderer. All returned
 * positions are group-local. No DOM, network fetches or second WebGL context.
 */
export class CosmicScene {
  readonly group = new THREE.Group();
  readonly destination: CosmicDestination;
  readonly modelNote: string;
  private readonly mobile: boolean;
  private worlds: CosmicWorld[] = [];
  private comparison?: CosmicWorld;
  private orbits = new THREE.Group();
  private real = false;
  private comparisonVisible = false;
  private focusId?: string;
  private elapsedDays = 0;
  private visualSeconds = 0;
  private disposed = false;

  constructor(destination: CosmicDestination, mobile: boolean) {
    this.destination = destination;
    this.mobile = mobile;
    this.modelNote =
      destination.kind === "black-hole"
        ? "Illustrative thin accretion disk with approximate light bending around a nonrotating Schwarzschild reference; gas brightness and colors are illustrative, not an EHT image or a numerical general-relativity solution."
        : "Surface colors, weather, stellar convection and rotation are illustrative; exoplanet surfaces have not been resolved. Orbital periods and physical sizes follow the source catalogue.";
    this.group.name = `cosmic-${destination.id}`;
    this.orbits.name = "cosmic-orbits";
    this.group.add(this.orbits);
    for (const [index, body] of destination.bodies.entries()) {
      const world = this.makeWorld(body, index);
      this.worlds.push(world);
      this.group.add(world.root);
    }
    this.setScale(false);
  }

  private makeWorld(body: CosmicBody, index: number): CosmicWorld {
    const root = new THREE.Group();
    root.name = body.id;
    const materials: THREE.ShaderMaterial[] = [];
    let surface: THREE.Mesh;
    if (body.role === "black-hole") {
      const material = new THREE.ShaderMaterial({
        vertexShader: blackHoleVertex,
        fragmentShader: blackHoleFragment(this.mobile),
        uniforms: {
          eye: { value: new THREE.Vector3() },
          tint: { value: new THREE.Color(body.color) },
          time: { value: 0 },
        },
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
      });
      surface = new THREE.Mesh(new THREE.SphereGeometry(18, 48, 32), material);
      surface.onBeforeRender = (_renderer, _scene, camera) => {
        camera.getWorldPosition(material.uniforms.eye.value);
        surface.worldToLocal(material.uniforms.eye.value);
      };
      materials.push(material);
    } else {
      const star = body.role === "star";
      const uniforms = {
        tint: { value: new THREE.Color(body.color) },
        time: { value: 0 },
        seed: { value: 3.71 + index * 9.13 },
        giant: { value: body.appearance === "red-supergiant" ? 1 : 0 },
        style: {
          value:
            body.appearance === "gas-giant"
              ? 2
              : body.appearance === "oceanic"
                ? 1
                : 0,
        },
        sunPosition: { value: new THREE.Vector3() },
      };
      const material = new THREE.ShaderMaterial({
        vertexShader: cosmicVertex,
        fragmentShader: star ? stellarFragment : exoplanetFragment,
        uniforms,
      });
      surface = new THREE.Mesh(
        new THREE.SphereGeometry(
          1,
          this.mobile ? 80 : 128,
          this.mobile ? 48 : 80,
        ),
        material,
      );
      if (!star) {
        surface.onBeforeRender = () => {
          const host = this.worlds.find((world) => world.body.role === "star");
          if (host) host.root.getWorldPosition(uniforms.sunPosition.value);
          else this.group.getWorldPosition(uniforms.sunPosition.value);
        };
      }
      materials.push(material);
      if (star) {
        const corona = new THREE.ShaderMaterial({
          vertexShader: cosmicVertex,
          fragmentShader: coronaFragment,
          uniforms: {
            tint: { value: new THREE.Color(body.color) },
            time: { value: 0 },
            activity: { value: body.appearance === "red-dwarf" ? 1.4 : 1 },
          },
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.BackSide,
        });
        const shell = new THREE.Mesh(
          new THREE.SphereGeometry(1.14, 64, 40),
          corona,
        );
        shell.name = `${body.id}-corona`;
        root.add(shell);
        materials.push(corona);
      }
    }
    surface.name = `${body.id}-surface`;
    root.add(surface);
    return { body, root, surface, radius: 1, materials };
  }

  private unitsPerAU() {
    const farthest = Math.max(
      ...this.destination.bodies.map((body) => body.orbit?.semiMajorAU ?? 0),
      0.001,
    );
    return 18 / farthest;
  }

  private displayRadius(body: CosmicBody) {
    if (body.role === "black-hole") return 1;
    if (this.destination.kind === "star") {
      return (1.8 * body.radiusKm) / this.destination.bodies[0].radiusKm;
    }
    if (this.real) return (body.radiusKm / AU_KM) * this.unitsPerAU();
    return body.role === "star"
      ? 1.15
      : 0.18 + Math.pow(body.radiusKm / 6371, 0.55) * 0.14;
  }

  private mapPosition(body: CosmicBody, days: number) {
    const position = new THREE.Vector3(...cosmicOrbitPosition(body, days));
    if (!body.orbit) return position;
    if (this.real) return position.multiplyScalar(this.unitsPerAU());
    const ordered = this.destination.bodies
      .filter((entry) => entry.orbit)
      .sort((a, b) => a.orbit!.semiMajorAU - b.orbit!.semiMajorAU);
    const index = ordered.findIndex((entry) => entry.id === body.id);
    return position.multiplyScalar((4 + index * 2.3) / body.orbit.semiMajorAU);
  }

  setScale(real: boolean) {
    if (this.disposed) return;
    this.real = real;
    for (const world of this.worlds) {
      world.radius = this.displayRadius(world.body);
      world.root.scale.setScalar(world.radius);
    }
    this.disposeObjects(this.orbits);
    for (const body of this.destination.bodies) {
      if (!body.orbit) continue;
      const points: THREE.Vector3[] = [];
      for (let i = 0; i <= 256; i++)
        points.push(this.mapPosition(body, (body.orbit.periodDays * i) / 256));
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({
          color: body.color,
          transparent: true,
          opacity: 0.24,
          depthWrite: false,
        }),
      );
      line.name = `${body.id}-orbit`;
      this.orbits.add(line);
    }
    this.update(this.elapsedDays, this.visualSeconds);
  }

  setComparison(show: boolean) {
    if (this.disposed || this.destination.kind !== "star") return;
    this.comparisonVisible = show;
    if (show && !this.comparison) {
      const body: CosmicBody = {
        id: "sun-comparison",
        name: "Sun · to scale",
        role: "star",
        radiusKm: SUN_RADIUS_KM,
        massSolar: 1,
        temperatureK: 5772,
        color: "#ffe1a6",
        appearance: "sunlike",
        description:
          "Our Sun shown with the same physical radius scale as this star.",
      };
      this.comparison = this.makeWorld(body, 13);
      this.comparison.radius = this.displayRadius(body);
      this.comparison.root.scale.setScalar(this.comparison.radius);
      this.comparison.root.position.set(
        1.8 + this.comparison.radius + 0.8,
        0,
        0,
      );
      this.group.add(this.comparison.root);
    }
    this.applyVisibility();
  }

  /** Isolate close-ups without changing the catalogue or orbital calculation. */
  setFocus(id?: string) {
    if (this.disposed) return;
    this.focusId = this.getTargets().some((target) => target.id === id)
      ? id
      : undefined;
    this.applyVisibility();
  }

  private applyVisibility() {
    this.orbits.visible = !this.focusId;
    for (const world of this.worlds)
      world.root.visible = !this.focusId || world.body.id === this.focusId;
    if (this.comparison)
      this.comparison.root.visible =
        this.comparisonVisible &&
        (!this.focusId || this.focusId === this.comparison.body.id);
  }

  update(elapsedDays: number, visualSeconds: number) {
    if (this.disposed) return;
    this.elapsedDays = Number.isFinite(elapsedDays) ? elapsedDays : 0;
    this.visualSeconds = Number.isFinite(visualSeconds) ? visualSeconds : 0;
    for (const world of this.worlds) {
      world.root.position.copy(this.mapPosition(world.body, this.elapsedDays));
      // Artistic rotation is independent of the measured orbital period.
      if (world.body.role !== "black-hole")
        world.surface.rotation.y =
          this.visualSeconds * (world.body.role === "star" ? 0.009 : 0.035);
      for (const material of world.materials)
        material.uniforms.time.value = this.visualSeconds;
    }
    if (this.comparison) {
      this.comparison.surface.rotation.y = this.visualSeconds * 0.009;
      for (const material of this.comparison.materials)
        material.uniforms.time.value = this.visualSeconds;
    }
    this.group.updateMatrixWorld(true);
  }

  getTargets(): CosmicTarget[] {
    const targets = [...this.worlds];
    if (this.comparisonVisible && this.comparison)
      targets.push(this.comparison);
    return targets.map((world) => ({
      id: world.body.id,
      name: world.body.name,
      position: world.root.position.clone(),
      radius: world.radius,
    }));
  }

  cameraFor(id?: string): CosmicCamera {
    if (this.destination.kind === "black-hole") {
      return {
        position: new THREE.Vector3(0, 8, 36),
        target: new THREE.Vector3(),
        minDistance: 3.2,
        maxDistance: 120,
      };
    }
    const targets = this.getTargets();
    const selected = targets.find((target) => target.id === id);
    if (selected) {
      const offset = new THREE.Vector3(0.9, 0.65, 4.1).multiplyScalar(
        selected.radius,
      );
      const body = this.destination.bodies.find((body) => body.id === id);
      if (body?.role === "planet") {
        const sunlight = selected.position.clone().negate().normalize();
        const tangent = new THREE.Vector3()
          .crossVectors(sunlight, new THREE.Vector3(0, 1, 0))
          .normalize();
        offset
          .copy(sunlight)
          .multiplyScalar(0.84)
          .addScaledVector(tangent, 0.5)
          .add(new THREE.Vector3(0, 0.2, 0))
          .normalize()
          .multiplyScalar(selected.radius * 4.25);
      }
      return {
        position: selected.position.clone().add(offset),
        target: selected.position.clone(),
        minDistance: selected.radius * 1.075,
        maxDistance: Math.max(selected.radius * 30, 100),
      };
    }
    if (this.destination.kind === "star") {
      const bounds = new THREE.Box3();
      for (const target of targets) {
        bounds.expandByPoint(
          target.position.clone().addScalar(target.radius * 1.2),
        );
        bounds.expandByPoint(
          target.position.clone().addScalar(-target.radius * 1.2),
        );
      }
      const target = bounds.getCenter(new THREE.Vector3());
      const extent =
        Math.max(...bounds.getSize(new THREE.Vector3()).toArray()) / 2;
      return {
        position: target
          .clone()
          .add(new THREE.Vector3(0.2, 0.14, 3.8).multiplyScalar(extent)),
        target,
        minDistance: 1.93,
        maxDistance: 80,
      };
    }
    const extent = Math.max(
      4,
      ...this.destination.bodies
        .filter((body) => body.orbit)
        .map(
          (body) =>
            this.mapPosition(body, 0).length() /
            (1 - (body.orbit?.eccentricity ?? 0)),
        ),
    );
    return {
      position: new THREE.Vector3(0, extent * 1.65, extent * 2.8),
      target: new THREE.Vector3(),
      minDistance: Math.max(this.worlds[0].radius * 1.1, 0.05),
      maxDistance: 250,
    };
  }

  pick(raycaster: THREE.Raycaster): string | undefined {
    let closest = Infinity;
    let selected: string | undefined;
    const intersection = new THREE.Vector3();
    for (const target of this.getTargets()) {
      if (this.focusId && target.id !== this.focusId) continue;
      const center = this.group.localToWorld(target.position);
      const sphere = new THREE.Sphere(
        center,
        target.radius * this.group.scale.x,
      );
      if (!raycaster.ray.intersectSphere(sphere, intersection)) continue;
      const distance = intersection.distanceTo(raycaster.ray.origin);
      if (
        distance >= raycaster.near &&
        distance <= raycaster.far &&
        distance < closest
      ) {
        closest = distance;
        selected = target.id;
      }
    }
    return selected;
  }

  private disposeObjects(group: THREE.Group) {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    group.traverse((object) => {
      if (
        object instanceof THREE.Mesh ||
        object instanceof THREE.Line ||
        object instanceof THREE.Points
      ) {
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material)
          ? object.material
          : [object.material])
          materials.add(material);
      }
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    group.clear();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.disposeObjects(this.group);
    this.worlds.length = 0;
    this.comparison = undefined;
  }
}
