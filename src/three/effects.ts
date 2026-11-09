// Restrained, non-graphic intercept encounter effects: a brief stylized
// flash, expanding translucent rings, and fading particles. Everything is
// procedural (no textures loaded), time-driven, self-disposing, and honours
// reduced-motion by collapsing to a single static ring + label.

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  RingGeometry,
  Scene,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import { makeMarkerSprite } from './labels';

export type EncounterOutcome = 'success' | 'miss';

interface TimedRing {
  mesh: Mesh;
  delay: number;
  life: number;
  maxRadius: number;
}

export class EncounterEffect {
  private root = new Group();
  private rings: TimedRing[] = [];
  private particles: Points | null = null;
  private velocities: Float32Array | null = null;
  private flash: Sprite | null = null;
  private badge: { sprite: Sprite; dispose: () => void } | null = null;
  private elapsed = 0;
  private readonly life: number;
  private disposed = false;
  private readonly scene: Scene;

  constructor(
    scene: Scene,
    position: Vector3,
    outcome: EncounterOutcome,
    reducedMotion: boolean,
  ) {
    this.scene = scene;
    this.life = reducedMotion ? 2.4 : outcome === 'success' ? 2.6 : 1.8;
    this.root.position.copy(position);
    scene.add(this.root);

    if (outcome === 'success') {
      this.buildSuccess(reducedMotion);
    } else {
      this.buildMiss(reducedMotion);
    }
  }

  private buildSuccess(reducedMotion: boolean): void {
    const ringColor = new Color(0x4ade80);
    const ringColor2 = new Color(0x00f0ff);

    if (reducedMotion) {
      // Static single ring, no expansion, no particles.
      const geo = new RingGeometry(70, 76, 48);
      const mesh = new Mesh(
        geo,
        new MeshBasicMaterial({
          color: ringColor,
          transparent: true,
          opacity: 0.7,
          side: DoubleSide,
          depthWrite: false,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      this.root.add(mesh);
      this.rings.push({ mesh, delay: 0, life: this.life, maxRadius: 76 });
    } else {
      const specs = [
        { delay: 0, life: 0.9, max: 150, color: ringColor, width: 10 },
        { delay: 0.12, life: 1.3, max: 240, color: ringColor2, width: 6 },
        { delay: 0.26, life: 1.7, max: 330, color: ringColor, width: 3 },
      ];
      for (const spec of specs) {
        const geo = new RingGeometry(1, 1 + spec.width / 10, 56);
        const mesh = new Mesh(
          geo,
          new MeshBasicMaterial({
            color: spec.color,
            transparent: true,
            opacity: 0,
            side: DoubleSide,
            blending: AdditiveBlending,
            depthWrite: false,
          }),
        );
        mesh.rotation.x = -Math.PI / 2;
        this.root.add(mesh);
        this.rings.push({ mesh, delay: spec.delay, life: spec.life, maxRadius: spec.max });
      }

      // Short bright flash sprite (locally drawn radial gradient).
      this.flash = makeRadialFlashSprite();
      this.flash.scale.set(40, 40, 1);
      this.root.add(this.flash);

      // Fading particles: 40 points with radial velocities.
      const count = 40;
      const positions = new Float32Array(count * 3);
      this.velocities = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const theta = (i / count) * Math.PI * 2 + (i % 3) * 0.21;
        const elevation = ((i % 5) - 2) * 0.14;
        const speed = 55 + (i % 7) * 14;
        this.velocities[i * 3] = Math.cos(theta) * speed;
        this.velocities[i * 3 + 1] = elevation * speed;
        this.velocities[i * 3 + 2] = Math.sin(theta) * speed;
      }
      const geo = new BufferGeometry();
      geo.setAttribute('position', new BufferAttribute(positions, 3));
      const mat = new PointsMaterial({
        color: 0xa7f3d0,
        size: 7,
        transparent: true,
        opacity: 0.85,
        blending: AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      });
      this.particles = new Points(geo, mat);
      this.root.add(this.particles);
    }

    this.badge = makeMarkerSprite('SIM-RESOLVED · TRACK FROZEN', '#4ade80', 0.045);
    this.badge.sprite.position.set(0, 90, 0);
    this.root.add(this.badge.sprite);
  }

  private buildMiss(reducedMotion: boolean): void {
    const amber = new Color(0xf59e0b);
    const geo = new RingGeometry(80, 85, 48);
    const mesh = new Mesh(
      geo,
      new MeshBasicMaterial({
        color: amber,
        transparent: true,
        opacity: reducedMotion ? 0.7 : 0,
        side: DoubleSide,
        depthWrite: false,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    this.root.add(mesh);
    this.rings.push({ mesh, delay: 0, life: reducedMotion ? this.life : 1.1, maxRadius: 85 });
    this.badge = makeMarkerSprite('MISS · TARGET REMAINS ACTIVE', '#f59e0b', 0.045);
    this.badge.sprite.position.set(0, 90, 0);
    this.root.add(this.badge.sprite);
  }

  /** Advance animation. Returns true while still active. */
  update(dt: number): boolean {
    if (this.disposed) return false;
    this.elapsed += dt;
    const t = this.elapsed;

    for (const ring of this.rings) {
      const local = t - ring.delay;
      if (local <= 0) continue;
      const mat = ring.mesh.material as MeshBasicMaterial;
      if (local >= ring.life) {
        mat.opacity = 0;
        continue;
      }
      const p = local / ring.life;
      // Ease-out expansion with linear fade.
      const eased = 1 - Math.pow(1 - p, 2.2);
      const scale = 1 + eased * (ring.maxRadius - 1) ;
      ring.mesh.scale.setScalar(Math.max(scale, 1));
      mat.opacity = (1 - p) * 0.85;
    }

    if (this.flash) {
      const mat = this.flash.material as Sprite['material'] & { opacity: number };
      if (t < 0.5) {
        const p = t / 0.5;
        this.flash.scale.setScalar(40 + p * 160);
        mat.opacity = (1 - p) * 0.9;
      } else {
        mat.opacity = 0;
      }
    }

    if (this.particles && this.velocities) {
      const posAttr = this.particles.geometry.getAttribute('position') as BufferAttribute;
      const arr = posAttr.array as Float32Array;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i] += this.velocities[i] * dt;
        arr[i + 1] += this.velocities[i + 1] * dt;
        arr[i + 2] += this.velocities[i + 2] * dt;
        // Gentle drag + downward drift.
        this.velocities[i] *= 1 - dt * 1.4;
        this.velocities[i + 1] = this.velocities[i + 1] * (1 - dt * 1.4) - dt * 18;
        this.velocities[i + 2] *= 1 - dt * 1.4;
      }
      posAttr.needsUpdate = true;
      const mat = this.particles.material as PointsMaterial;
      mat.opacity = Math.max(0, 0.85 * (1 - t / (this.life * 0.8)));
    }

    if (this.badge) {
      // Badge fades with the effect tail.
      const mat = this.badge.sprite.material as Sprite['material'] & { opacity: number };
      mat.opacity = Math.max(0, Math.min(1, (this.life - t) / 0.6));
    }

    return t < this.life;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const ring of this.rings) {
      ring.mesh.geometry.dispose();
      (ring.mesh.material as MeshBasicMaterial).dispose();
    }
    if (this.particles) {
      this.particles.geometry.dispose();
      (this.particles.material as PointsMaterial).dispose();
    }
    if (this.flash) {
      this.flash.material.map?.dispose();
      this.flash.material.dispose();
    }
    this.badge?.dispose();
    this.scene.remove(this.root);
    this.rings = [];
    this.particles = null;
    this.flash = null;
    this.badge = null;
  }
}

function makeRadialFlashSprite(): Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.35, 'rgba(167,243,208,0.55)');
    grad.addColorStop(1, 'rgba(74,222,128,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
  }
  const texture = new CanvasTexture(canvas);
  const material = new SpriteMaterial({
    map: texture,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });
  const sprite = new Sprite(material);
  sprite.renderOrder = 950;
  return sprite;
}
