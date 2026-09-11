import {
  EventDispatcher,
  MathUtils,
  PerspectiveCamera,
  Quaternion,
  Vector2,
  Vector3,
} from "three";

type Interaction = "orbit" | "zoom";
type ControlEvents = {
  start: { interaction: Interaction };
  change: {};
  end: { interaction: Interaction };
};
type Pointer = {
  point: Vector2;
  origin: Vector2;
  type: string;
  button: number;
};

/** A camera-relative globe gesture: drag, pinch and twist never share a fixed pole. */
export class GlobeControls extends EventDispatcher<ControlEvents> {
  target = new Vector3();
  enabled = true;
  enableDamping = true;
  dampingFactor = 0.07;
  enablePan = false;
  rotateSpeed = 1;
  zoomSpeed = 1;
  minDistance = 0;
  maxDistance = Infinity;
  /** Radius around target; zero gives ordinary trackball navigation for wide scenes. */
  surfaceRadius = 0;
  private pointers = new Map<number, Pointer>();
  private dragged = false;
  private gestureStarted = false;
  private interaction: Interaction = "orbit";
  private inertiaAxis = new Vector3(0, 1, 0);
  private inertiaAngle = 0;
  private lastMoveAt = 0;
  private lastUpdateAt = 0;
  private oldTouchAction: string;
  private lastPosition = new Vector3();
  private lastQuaternion = new Quaternion();
  private viewOffset = new Quaternion();
  private transitionDuration = 0;
  private transitionElapsed = 0;

  constructor(
    public object: PerspectiveCamera,
    public domElement: HTMLElement,
  ) {
    super();
    this.oldTouchAction = domElement.style.touchAction;
    domElement.style.touchAction = "none";
    domElement.addEventListener("pointerdown", this.pointerDown);
    domElement.addEventListener("pointermove", this.pointerMove);
    domElement.addEventListener("pointerup", this.pointerUp);
    domElement.addEventListener("pointercancel", this.pointerCancel);
    domElement.addEventListener("lostpointercapture", this.pointerCancel);
    domElement.addEventListener("wheel", this.wheel, { passive: false });
    domElement.addEventListener("contextmenu", this.contextMenu);
    this.update();
  }

  /** Remains true through pointerup so a completed gesture cannot become a surface tap. */
  get isDragging() {
    return this.dragged;
  }

  cancelMotion() {
    this.inertiaAngle = 0;
    this.lastMoveAt = 0;
    this.transitionDuration = 0;
  }

  /** Change orbit center immediately, easing the framing without moving the camera. */
  transitionTarget(target: Vector3, duration = 0.2) {
    const orientation = this.object.quaternion.clone();
    this.target.copy(target);
    this.object.lookAt(this.target);
    this.viewOffset.copy(this.object.quaternion).invert().multiply(orientation);
    this.object.quaternion.copy(orientation);
    this.transitionDuration = Math.max(0, duration);
    this.transitionElapsed = 0;
  }

  private pointerDown = (event: PointerEvent) => {
    if (!this.enabled || (event.pointerType !== "touch" && event.button > 1))
      return;
    event.preventDefault();
    if (this.pointers.has(event.pointerId)) return;
    if (this.pointers.size === 0) {
      this.dragged = false;
      this.gestureStarted = false;
      this.inertiaAngle = 0;
    } else {
      this.dragged = true;
      this.inertiaAngle = 0;
    }
    const point = new Vector2(event.clientX, event.clientY);
    this.pointers.set(event.pointerId, {
      point,
      origin: point.clone(),
      type: event.pointerType,
      button: event.button,
    });
    this.domElement.setPointerCapture(event.pointerId);
  };

  private pointerMove = (event: PointerEvent) => {
    const pointer = this.pointers.get(event.pointerId);
    if (!this.enabled || !pointer) return;
    event.preventDefault();
    const previous = pointer.point.clone();
    const touches = [...this.pointers.values()].filter(
      (p) => p.type === "touch",
    );
    const before = touches.length >= 2 ? this.touchFrame(touches) : undefined;
    pointer.point.set(event.clientX, event.clientY);
    if (pointer.point.distanceTo(pointer.origin) >= 6) this.dragged = true;
    if (!this.gestureStarted) {
      if (pointer.point.distanceTo(pointer.origin) <= 2) return;
      this.gestureStarted = true;
      this.interaction =
        pointer.button === 1 && pointer.type !== "touch" ? "zoom" : "orbit";
      this.dispatchEvent({ type: "start", interaction: this.interaction });
    }
    // A third finger cannot change which pair owns the gesture until a finger lifts.
    if (before) {
      const after = this.touchFrame(touches);
      this.orbit(after.center.clone().sub(before.center));
      if (before.distance > 8 && after.distance > 8) {
        this.dolly(Math.log(before.distance / after.distance) * this.zoomSpeed);
        const twist = Math.atan2(
          Math.sin(after.angle - before.angle),
          Math.cos(after.angle - before.angle),
        );
        const eye = this.object.position.clone().sub(this.target).normalize();
        this.object.up.applyAxisAngle(eye, twist).normalize();
      }
      // Releasing one finger should not continue an unintentional pinch/twist fling.
      this.inertiaAngle = 0;
    } else if (pointer.button === 1 && pointer.type !== "touch") {
      this.dolly((pointer.point.y - previous.y) * 0.006 * this.zoomSpeed);
    } else {
      this.orbit(pointer.point.clone().sub(previous));
    }
    this.lastMoveAt = performance.now();
    this.lookAtTarget();
  };

  private touchFrame(pointers: Pointer[]) {
    const a = pointers[0].point,
      b = pointers[1].point;
    return {
      center: a.clone().add(b).multiplyScalar(0.5),
      distance: a.distanceTo(b),
      angle: Math.atan2(b.y - a.y, b.x - a.x),
    };
  }

  private pointerUp = (event: PointerEvent) => {
    this.releasePointer(event, false);
  };
  private pointerCancel = (event: PointerEvent) => {
    this.releasePointer(event, true);
  };

  private releasePointer(event: PointerEvent, cancelled: boolean) {
    if (!this.pointers.delete(event.pointerId)) return;
    if (this.domElement.hasPointerCapture(event.pointerId))
      this.domElement.releasePointerCapture(event.pointerId);
    if (
      cancelled ||
      this.pointers.size > 0 ||
      performance.now() - this.lastMoveAt > 100
    )
      this.inertiaAngle = 0;
    if (this.pointers.size === 0 && this.gestureStarted) {
      this.gestureStarted = false;
      this.dispatchEvent({ type: "end", interaction: this.interaction });
    }
  }

  private orbit(delta: Vector2) {
    if (delta.lengthSq() < 1e-12) return;
    const rect = this.domElement.getBoundingClientRect();
    const eye = this.object.position.clone().sub(this.target);
    const distance = eye.length();
    if (distance < 1e-12) return;
    const direction = eye.clone().divideScalar(distance);
    const right = new Vector3()
      .crossVectors(this.object.up, direction)
      .normalize();
    const up = new Vector3().crossVectors(direction, right).normalize();
    const move = right.multiplyScalar(delta.x).addScaledVector(up, -delta.y);
    const axis = new Vector3().crossVectors(move, direction).normalize();
    // At the surface the camera-to-ground distance, rather than center distance,
    // sets how far a fingertip moves the visible terrain.
    const altitudeGain =
      this.surfaceRadius > 0
        ? MathUtils.clamp(
            (distance - this.surfaceRadius) / this.surfaceRadius,
            0.00002,
            1,
          )
        : 1;
    const angle =
      ((Math.PI * delta.length()) /
        Math.max(1, Math.min(rect.width, rect.height))) *
      this.rotateSpeed *
      altitudeGain;
    this.rotate(axis, angle);
    this.inertiaAxis.copy(axis);
    this.inertiaAngle = Math.min(angle, 0.025);
  }

  private rotate(axis: Vector3, angle: number) {
    const rotation = new Quaternion().setFromAxisAngle(axis, angle);
    this.object.position
      .sub(this.target)
      .applyQuaternion(rotation)
      .add(this.target);
    this.object.up.applyQuaternion(rotation).normalize();
  }

  private dolly(logScale: number) {
    const eye = this.object.position.clone().sub(this.target);
    const distance = eye.length();
    if (distance < 1e-12) return;
    const scale = Math.exp(MathUtils.clamp(logScale, -20, 20));
    // Zooming scales altitude near a planet, allowing measured terrain to be
    // approached gradually instead of slamming directly into minDistance.
    const base =
      this.surfaceRadius > 0
        ? Math.min(this.surfaceRadius, this.minDistance)
        : 0;
    const next = MathUtils.clamp(
      base + (distance - base) * scale,
      this.minDistance,
      this.maxDistance,
    );
    this.object.position.copy(
      eye.multiplyScalar(next / distance).add(this.target),
    );
  }

  private wheel = (event: WheelEvent) => {
    if (!this.enabled) return;
    event.preventDefault();
    this.inertiaAngle = 0;
    this.dispatchEvent({ type: "start", interaction: "zoom" });
    const pixels =
      event.deltaY *
      (event.deltaMode === 1
        ? 16
        : event.deltaMode === 2
          ? this.domElement.clientHeight
          : 1);
    this.dolly(pixels * 0.002 * this.zoomSpeed);
    this.lookAtTarget();
    this.dispatchEvent({ type: "end", interaction: "zoom" });
  };
  private contextMenu = (event: Event) => {
    if (this.enabled) event.preventDefault();
  };

  private lookAtTarget() {
    this.object.lookAt(this.target);
    if (this.transitionDuration > 0) {
      const progress = MathUtils.clamp(
        this.transitionElapsed / this.transitionDuration,
        0,
        1,
      );
      const offset = this.viewOffset
        .clone()
        .slerp(new Quaternion(), 1 - Math.pow(1 - progress, 3));
      this.object.quaternion.multiply(offset);
    }
    if (
      this.lastPosition.distanceToSquared(this.object.position) > 1e-18 ||
      1 - Math.abs(this.lastQuaternion.dot(this.object.quaternion)) > 1e-12
    ) {
      this.lastPosition.copy(this.object.position);
      this.lastQuaternion.copy(this.object.quaternion);
      this.dispatchEvent({ type: "change" });
    }
  }

  update(deltaSeconds?: number) {
    const now = performance.now();
    const seconds =
      deltaSeconds ??
      MathUtils.clamp((now - this.lastUpdateAt) / 1000, 1 / 240, 0.05);
    const frame = seconds * 60;
    this.lastUpdateAt = now;
    this.transitionElapsed += seconds;
    if (this.transitionElapsed >= this.transitionDuration)
      this.transitionDuration = 0;
    if (
      this.enabled &&
      this.enableDamping &&
      this.pointers.size === 0 &&
      this.inertiaAngle > 1e-5
    ) {
      this.inertiaAngle *= Math.pow(
        1 - MathUtils.clamp(this.dampingFactor * 2.5, 0.05, 0.95),
        frame,
      );
      this.rotate(this.inertiaAxis, this.inertiaAngle * frame);
    }
    const eye = this.object.position.clone().sub(this.target);
    if (eye.lengthSq() > 1e-20) {
      eye.clampLength(this.minDistance, this.maxDistance);
      this.object.position.copy(this.target).add(eye);
    }
    this.lookAtTarget();
  }

  dispose() {
    this.cancelMotion();
    for (const id of [...this.pointers.keys()]) {
      this.pointers.delete(id);
      if (this.domElement.hasPointerCapture(id))
        this.domElement.releasePointerCapture(id);
    }
    this.domElement.removeEventListener("pointerdown", this.pointerDown);
    this.domElement.removeEventListener("pointermove", this.pointerMove);
    this.domElement.removeEventListener("pointerup", this.pointerUp);
    this.domElement.removeEventListener("pointercancel", this.pointerCancel);
    this.domElement.removeEventListener(
      "lostpointercapture",
      this.pointerCancel,
    );
    this.domElement.removeEventListener("wheel", this.wheel);
    this.domElement.removeEventListener("contextmenu", this.contextMenu);
    this.domElement.style.touchAction = this.oldTouchAction;
  }
}
