// Compact orbit/pan/zoom camera rig for the 3D airspace viewport.
// Implements the three tactical camera modes (TOP-DOWN RADAR, 3D AIRSPACE,
// TRACK FOLLOW), smooth eased transitions, and a full keyboard-accessible
// alternative to every mouse gesture. No external control library needed.

import {
  MathUtils,
  PerspectiveCamera,
  Spherical,
  Vector3,
} from 'three';

export type CameraMode = 'radar' | 'airspace' | 'follow';

interface RigState {
  target: Vector3;
  spherical: Spherical;
}

const NORTH = new Vector3(0, 0, -1);

const MODE_DEFAULTS: Record<CameraMode, { polar: number; distance: number }> = {
  // Straight above, north up the screen.
  radar: { polar: 0.015, distance: 1350 },
  // Oblique tactical perspective.
  airspace: { polar: MathUtils.degToRad(58), distance: 1500 },
  // Follow starts close; distance preserved per-selection.
  follow: { polar: MathUtils.degToRad(64), distance: 420 },
};

export const MIN_POLAR = 0.04; // ~2.3 degrees off pole to avoid gimbal singularity
export const MAX_POLAR = MathUtils.degToRad(86); // ~86 degrees; keeps view above ground
export const MIN_DISTANCE = 200;
export const MAX_DISTANCE = 5200;

// Pan target clamp prevents the camera from drifting to extreme distances
// when panning at long range; ±6000 world units is the safe operational zone.
export const PAN_TARGET_CLAMP = 6000;

export class CameraRig {
  readonly camera: PerspectiveCamera;
  private target = new Vector3(0, 0, 0);
  private spherical = new Spherical(1500, MODE_DEFAULTS.airspace.polar, 0);
  private desired: RigState = {
    target: this.target.clone(),
    spherical: new Spherical(this.spherical.radius, this.spherical.phi, this.spherical.theta),
  };
  private mode: CameraMode = 'airspace';
  private followPos = new Vector3();
  private easing = true;
  private isDragging = false;

  constructor(aspect: number) {
    this.camera = new PerspectiveCamera(50, aspect, 5, 20000);
    this.camera.up.copy(NORTH); // screen-up = world north (-Z) for the top-down radar mode
    this.applyImmediate();
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  get currentMode(): CameraMode {
    return this.mode;
  }

  get isUserDragging(): boolean {
    return this.isDragging;
  }

  get currentSpherical(): Spherical {
    return this.spherical;
  }

  /** Set dragging state; disables conflicting damping while user drags. */
  setDragging(dragging: boolean): void {
    this.isDragging = dragging;
    if (dragging) {
      this.easing = false;
    } else {
      // Synchronize desired state directly to current position on release
      // so there is no residual overshoot, snap, or rubber-banding.
      this.desired.target.copy(this.target);
      this.desired.spherical.copy(this.spherical);
      this.easing = false;
      this.applyImmediate();
    }
  }

  /** Direct 1:1 orbit manipulation during user drag. */
  setOrbitDirect(theta: number, phi: number): void {
    if (this.mode === 'radar') {
      this.mode = 'airspace';
    }
    const clampedPhi = MathUtils.clamp(phi, MIN_POLAR, MAX_POLAR);
    this.spherical.theta = theta;
    this.spherical.phi = clampedPhi;
    this.desired.spherical.theta = theta;
    this.desired.spherical.phi = clampedPhi;
    this.applyImmediate();
  }

  /** Direct 1:1 pan manipulation during user drag. */
  setTargetDirect(target: Vector3): void {
    const clampedX = Math.max(-PAN_TARGET_CLAMP, Math.min(PAN_TARGET_CLAMP, target.x));
    const clampedY = Math.max(-PAN_TARGET_CLAMP, Math.min(PAN_TARGET_CLAMP, target.y));
    const clampedZ = Math.max(-PAN_TARGET_CLAMP, Math.min(PAN_TARGET_CLAMP, target.z));
    this.target.set(clampedX, clampedY, clampedZ);
    this.desired.target.copy(this.target);
    this.applyImmediate();
  }

  /** Switch tactical camera mode with an eased transition. */
  setMode(mode: CameraMode, focusPoint?: Vector3): void {
    this.mode = mode;
    const defaults = MODE_DEFAULTS[mode];
    this.desired.spherical.phi = defaults.polar;
    this.desired.spherical.radius = defaults.distance;
    if (mode === 'radar' && focusPoint) {
      this.desired.target.copy(focusPoint);
    } else if (mode === 'airspace' && focusPoint) {
      this.desired.target.copy(focusPoint);
    }
    if (mode === 'radar') {
      // Keep north at screen top.
      this.desired.spherical.theta = 0;
    }
    if (mode === 'follow') {
      this.followPos.copy(this.desired.target);
    }
    this.easing = true;
  }

  /** Ease the camera onto a specific world point (track focus). */
  focusOn(worldPoint: Vector3, distance = 420): void {
    this.desired.target.copy(worldPoint);
    this.desired.spherical.radius = MathUtils.clamp(distance, MIN_DISTANCE, MAX_DISTANCE);
    if (this.mode === 'follow') {
      this.followPos.copy(worldPoint);
    }
    this.easing = true;
  }

  /** Snap target while following a moving object; keeps user orbit angles. */
  updateFollowTarget(worldPoint: Vector3): void {
    if (this.mode !== 'follow' || this.isDragging) return;
    // Smooth the follow point so tracking feels stable, never jittery.
    this.followPos.lerp(worldPoint, 0.14);
    this.desired.target.copy(this.followPos);
  }

  /** Fit an arbitrary world-space bounding sphere. */
  fitSphere(centre: Vector3, radius: number): void {
    this.desired.target.copy(centre);
    const fov = this.camera.fov * (Math.PI / 180);
    const dist = MathUtils.clamp((radius / Math.sin(fov / 2)) * 1.12, MIN_DISTANCE, MAX_DISTANCE);
    this.desired.spherical.radius = dist;
    this.easing = true;
  }

  reset(): void {
    this.setMode('airspace', new Vector3(0, 0, 0));
    this.desired.spherical.theta = -0.6; // default three-quarter tactical bearing
    this.easing = true;
  }

  // ---- Direct manipulation (mouse + keyboard feed these) ----

  orbit(deltaTheta: number, deltaPhi: number): void {
    if (this.mode === 'radar') {
      this.mode = 'airspace';
      if (this.desired.spherical.phi < 0.25) {
        this.desired.spherical.phi = 0.25;
      }
    }
    this.desired.spherical.theta += deltaTheta;
    this.desired.spherical.phi = MathUtils.clamp(
      this.desired.spherical.phi + deltaPhi,
      MIN_POLAR,
      MAX_POLAR,
    );
    this.easing = true;
  }

  zoom(factor: number): void {
    this.desired.spherical.radius = MathUtils.clamp(
      this.desired.spherical.radius * factor,
      MIN_DISTANCE,
      MAX_DISTANCE,
    );
    this.easing = true;
  }

  /** Pan across the airspace plane (screen-relative). */
  pan(dx: number, dy: number): void {
    const offset = new Vector3().setFromSpherical(this.desired.spherical);
    const forward = offset.clone().multiplyScalar(-1).normalize();
    const right = new Vector3().crossVectors(forward, this.camera.up).normalize();
    const upFlat = new Vector3().crossVectors(right, forward).normalize();
    const scale = this.desired.spherical.radius * 0.0016;
    this.desired.target.addScaledVector(right, dx * scale);
    this.desired.target.addScaledVector(upFlat, dy * scale);
    // Clamp the target so panning at long range doesn't drag the camera
    // to extreme distances outside the operational zone.
    this.desired.target.x = Math.max(-PAN_TARGET_CLAMP, Math.min(PAN_TARGET_CLAMP, this.desired.target.x));
    this.desired.target.y = Math.max(-PAN_TARGET_CLAMP, Math.min(PAN_TARGET_CLAMP, this.desired.target.y));
    this.desired.target.z = Math.max(-PAN_TARGET_CLAMP, Math.min(PAN_TARGET_CLAMP, this.desired.target.z));
    this.easing = true;
  }

  /** Enable or disable follow mode. When on, the camera tracks the selected contact. */
  setFollow(on: boolean): void {
    this.easing = true;
    if (on) {
      this.mode = 'follow';
    } else {
      // Exit follow without resuming manual framing; keep desired state as-is.
      this.mode = 'airspace';
    }
  }

  /** Clear the follow target, returning camera to manual control. */
  clearFollow(): void {
    this.mode = 'airspace';
    this.easing = true;
  }

  /** Per-frame update; dt in seconds. */
  update(dt: number): void {
    // If user is actively dragging or easing is inactive, do not interpolate.
    if (this.isDragging || !this.easing) {
      this.applyImmediate();
      return;
    }

    // Guard against negative or non-finite deltas. A negative delta would
    // make the eased factor negative and extrapolate the orbit away from its
    // target instead of toward it (the camera can fly to ±1e8 units).
    const safeDt = Number.isFinite(dt) ? Math.max(dt, 0) : 0;
    const k = MathUtils.clamp(1 - Math.exp(-safeDt * 7.5), 0, 1);
    this.target.lerp(this.desired.target, Math.min(k, 1));
    this.spherical.radius = MathUtils.lerp(this.spherical.radius, this.desired.spherical.radius, Math.min(k, 1));
    this.spherical.phi = MathUtils.lerp(this.spherical.phi, this.desired.spherical.phi, Math.min(k, 1));
    this.spherical.theta = MathUtils.lerp(this.spherical.theta, this.desired.spherical.theta, Math.min(k, 1));
    if (
      Math.abs(this.spherical.radius - this.desired.spherical.radius) < 0.05 &&
      Math.abs(this.spherical.phi - this.desired.spherical.phi) < 0.0004 &&
      Math.abs(this.spherical.theta - this.desired.spherical.theta) < 0.0004 &&
      this.target.distanceToSquared(this.desired.target) < 0.01
    ) {
      this.easing = false;
    }
    this.applyImmediate();
  }

  private applyImmediate(): void {
    const offset = new Vector3().setFromSpherical(this.spherical);
    this.camera.position.copy(this.target).add(offset);
    if (this.mode === 'radar' || this.spherical.phi < 0.08) {
      // Top-down: screen-up must be world north (-Z), so look-at cannot
      // reuse the default +Y up (would be degenerate looking straight down).
      this.camera.up.copy(NORTH);
    } else {
      this.camera.up.set(0, 1, 0);
    }
    this.camera.lookAt(this.target);
  }

  /** Read-only view of the orbit target (for tooltips/HUD). */
  get targetPoint(): Vector3 {
    return this.target;
  }

  get distance(): number {
    return this.spherical.radius;
  }
}
