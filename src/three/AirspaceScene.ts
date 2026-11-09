// AirspaceScene — the live 3D airspace viewport.
//
// Owns the WebGL renderer, environment (horizon dome, haze fog, ground grid,
// radar rings + rotating sweep), protected-zone cylinder geometry, sensor
// stations, track entities (model + trail + forecast + altitude stem +
// velocity vector + label), exercise assets (interceptor / VIPER flight),
// and encounter effects. Simulation state stays authoritative: every object
// is positioned through the single transform in ./coords, and sync() is the
// only path from SimView data into the scene.

import {
  AdditiveBlending,
  AmbientLight,
  BackSide,
  Box3,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  DynamicDrawUsage,
  FogExp2,
  Group,
  HemisphereLight,
  Line,
  LineBasicMaterial,
  LineDashedMaterial,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PMREMGenerator,
  Raycaster,
  RingGeometry,
  Scene,
  Sphere,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';

import type { SimView, TrackSnapshot } from '../engine/sim';
import { PROTECTED_ZONE } from '../engine/scenarios';
import { headingFromVel } from '../engine/math';
import type { InterceptorState, JetScrambleState } from '../types/intercept';
import { CameraRig, type CameraMode, MIN_POLAR, MAX_POLAR } from './camera';
import { displayAltitudeMetres, headingToYaw, simPointToWorld, WORLD_SCALE } from './coords';
import { EncounterEffect, type EncounterOutcome } from './effects';
import { LabelSprite, makeMarkerSprite, type LabelTone } from './labels';
import {
  createModelForKind,
  createSensorStation,
  tintModel,
  type AircraftModel,
  type ModelKind,
} from './models';

const MAX_TRAIL_POINTS = 160;
const MAX_FORECAST_POINTS = 48;
const MAX_GUIDE_POINTS = 41;
const RANGE_RINGS_SIM_M = [5000, 10000, 15000, 20000, 25000];
const SWEEP_SECONDS_PER_REV = 8;
// VIPER jets report flight levels in the scramble exercise's event log rather
// than a metre altitude. The 3D view places them at a fixed illustrative
// display height and labels them as such instead of inventing telemetry.
const ILLUSTRATIVE_JET_ALT_M = 1500;

export interface SyncOptions {
  selectedId: string | null;
  showTrails: boolean;
  showForecasts: boolean;
  showLabels: boolean;
  showSweep: boolean;
  showRings: boolean;
  showGrid: boolean;
  defcon: number;
  /** Tracks frozen by a successful intercept exercise (display-only). */
  frozenTracks?: Record<string, { x: number; y: number; z: number; heading: number }>;
  disabledTrackIds?: Set<string>;
}

interface TrackEntity {
  model: AircraftModel;
  label: LabelSprite;
  trail: Line;
  trailPositions: Float32Array;
  trailColors: Float32Array;
  forecast: Line;
  forecastPositions: Float32Array;
  stem: Line;
  stemPositions: Float32Array;
  vector: Line;
  vectorPositions: Float32Array;
  groundRing: Mesh;
  lastTrailCount: number;
  lastForecastCount: number;
  statusColor: Color;
  meshes: Mesh[];
}

interface ExerciseEntity {
  model: AircraftModel;
  label: LabelSprite;
  trail: Line;
  trailPositions: Float32Array;
  trailColors: Float32Array;
  lastTrailCount: number;
}

type LineKind = 'trail' | 'forecast' | 'stem' | 'vector' | 'guide';

function kindForTrack(track: TrackSnapshot): ModelKind {
  // Mirrors MapView.getTrackAircraftKind so both scopes classify identically.
  const cs = track.callsign.toUpperCase();
  if (cs.includes('INT-') || cs.includes('GARUD') || cs.includes('ALPHA')) return 'interceptor';
  if (cs.includes('VIPER') || cs.includes('FIGHTER') || cs.includes('STRIKE')) return 'fighter';
  if (cs.includes('UNID') || track.auth === 'unknown' || cs.includes('DRONE') || cs.includes('UAV')) return 'drone';
  return 'civil';
}

function statusColorFor(track: TrackSnapshot, disabled: boolean): Color {
  if (disabled) return new Color(0x67e8b5);
  if (track.freshness === 'lost') return new Color(0x72869f);
  if (track.inZone) return new Color(0xff647c);
  if (track.auth === 'unknown') return new Color(0xffc568);
  return new Color(0x56b8f9);
}

function toneFor(track: TrackSnapshot, disabled: boolean): LabelTone {
  if (disabled) return 'cyan';
  if (track.freshness === 'lost') return 'grey';
  if (track.inZone) return 'red';
  if (track.auth === 'unknown') return 'amber';
  return 'green';
}

function flOf(z: number): string {
  return `FL${Math.max(0, Math.round(z / 100))}`;
}

function dynamicAttr(array: Float32Array): BufferAttribute {
  const attr = new BufferAttribute(array, 3);
  attr.setUsage(DynamicDrawUsage);
  return attr;
}

interface ActiveDrag {
  pointerId: number;
  button: number;
  startX: number;
  startY: number;
  startTheta: number;
  startPhi: number;
  startTarget: Vector3;
  panRight: Vector3;
  panUp: Vector3;
  panScale: number;
  isPan: boolean;
}

export class AirspaceScene {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private rig: CameraRig;
  private clockLast = 0;
  private raf = 0;
  private disposed = false;
  private reducedMotion = false;
  private sweepAngle = 0;
  private paused = false;

  private container: HTMLElement;
  private resizeObserver: ResizeObserver | null = null;
  private windowResize: (() => void) | null = null;

  // Environment
  private sweepMesh: Mesh;
  private gridGroup: Group;
  private ringsGroup: Group;
  private defconRings: Mesh[] = [];
  private stationRotors: Group[] = [];
  private envDispose: (() => void) | null = null;

  // Entities
  private tracks = new Map<string, TrackEntity>();
  private interceptor: ExerciseEntity | null = null;
  private jets: ExerciseEntity[] = [];
  private interceptorGuide: Line | null = null;
  private baseMarker: { sprite: ReturnType<typeof makeMarkerSprite>; ring: Mesh } | null = null;
  private effects: EncounterEffect[] = [];
  private lastEffectKey: string | null = null;

  private zoneLabel: LabelSprite;

  // Interaction
  private raycaster = new Raycaster();
  private pointerDown: { x: number; y: number } | null = null;
  private activeDrag: ActiveDrag | null = null;
  private onSelect: ((id: string | null) => void) | null = null;
  private onModeChange: ((mode: CameraMode) => void) | null = null;
  private onFitRequested: (() => void) | null = null;
  private pickTargets: Mesh[] = [];
  private lastView: SimView | null = null;
  private lastInterceptor: InterceptorState | null = null;
  private lastScramble: JetScrambleState | null = null;

  private disposables: Array<{ dispose: () => void }> = [];

  constructor(container: HTMLElement) {
    this.container = container;

    const width = Math.max(container.clientWidth, 100);
    const height = Math.max(container.clientHeight, 100);

    this.renderer = new WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(
      Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2),
    );
    this.renderer.setSize(width, height, false);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.touchAction = 'none'; // block page scroll while operating the viewport
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.setAttribute('aria-label', '3D airspace viewport — use arrow keys to orbit, plus and minus to zoom');
    container.appendChild(this.renderer.domElement);

    this.rig = new CameraRig(width / height);

    this.scene.background = new Color(0x080d18);
    this.scene.fog = new FogExp2(0x080d18, 0.00035);

    const env = this.buildEnvironment();
    this.sweepMesh = env.sweep;
    this.gridGroup = env.grid;
    this.ringsGroup = env.rings;

    this.buildZone();
    this.buildStations();

    this.zoneLabel = new LabelSprite(
      [PROTECTED_ZONE.name.toUpperCase(), `0 – ${PROTECTED_ZONE.ceiling} M · R ${PROTECTED_ZONE.radius} M`],
      'cyan',
      0.05,
    );
    const zoneWorld = simPointToWorld({
      x: PROTECTED_ZONE.centre.x,
      y: PROTECTED_ZONE.centre.y,
      z: PROTECTED_ZONE.ceiling,
    });
    this.zoneLabel.sprite.position.set(zoneWorld.x, zoneWorld.y + 70, zoneWorld.z);
    this.scene.add(this.zoneLabel.sprite);

    this.bindPointer();
    this.startLoop();
    this.observeResize();
  }

  // ------------------------------------------------------------------
  // Environment
  // ------------------------------------------------------------------

  private buildEnvironment(): { sweep: Mesh; grid: Group; rings: Group } {
    this.scene.add(new HemisphereLight(0x263951, 0x080d18, 1.15));
    this.scene.add(new AmbientLight(0x16253a, 0.65));
    const key = new DirectionalLight(0xd4e9ff, 1.3);
    key.position.set(-1400, 2600, 900);
    this.scene.add(key);
    const rim = new DirectionalLight(0x48d9f5, 0.5);
    rim.position.set(1200, 900, -1600);
    this.scene.add(rim);

    // Cheap procedural environment map for subtle metallic reflections.
    try {
      const pmrem = new PMREMGenerator(this.renderer);
      const envCanvas = document.createElement('canvas');
      envCanvas.width = 64;
      envCanvas.height = 32;
      const ctx = envCanvas.getContext('2d');
      if (ctx) {
        const grad = ctx.createLinearGradient(0, 0, 0, 32);
        grad.addColorStop(0, '#0c1423');
        grad.addColorStop(0.5, '#16253a');
        grad.addColorStop(1, '#080d18');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 64, 32);
      }
      const envTex = new CanvasTexture(envCanvas);
      const rt = pmrem.fromEquirectangular(envTex);
      this.scene.environment = rt.texture;
      this.envDispose = () => {
        rt.dispose();
        pmrem.dispose();
      };
      envTex.dispose();
    } catch {
      // Reflections are optional; the scene remains fully functional without.
      this.envDispose = null;
    }

    // Horizon dome: curved gradient sky, viewed from inside.
    const domeGeo = new SphereGeometry(9000, 32, 16);
    const domeCanvas = document.createElement('canvas');
    domeCanvas.width = 8;
    domeCanvas.height = 128;
    const dctx = domeCanvas.getContext('2d');
    if (dctx) {
      const grad = dctx.createLinearGradient(0, 0, 0, 128);
      grad.addColorStop(0, '#04070d');
      grad.addColorStop(0.42, '#080d18');
      grad.addColorStop(0.55, '#0c1423');
      grad.addColorStop(0.62, '#111d30');
      grad.addColorStop(1, '#080d18');
      dctx.fillStyle = grad;
      dctx.fillRect(0, 0, 8, 128);
    }
    const domeTex = new CanvasTexture(domeCanvas);
    const domeMat = new MeshBasicMaterial({
      map: domeTex,
      side: BackSide,
      fog: false,
      depthWrite: false,
    });
    const dome = new Mesh(domeGeo, domeMat);
    this.scene.add(dome);
    this.disposables.push(domeGeo, domeMat, domeTex);

    // Ground disc with a soft radial gradient.
    const groundGeo = new CircleGeometry(7000, 64);
    const groundCanvas = document.createElement('canvas');
    groundCanvas.width = 256;
    groundCanvas.height = 256;
    const gctx = groundCanvas.getContext('2d');
    if (gctx) {
      const grad = gctx.createRadialGradient(128, 128, 10, 128, 128, 128);
      grad.addColorStop(0, '#111d30');
      grad.addColorStop(0.55, '#0c1423');
      grad.addColorStop(1, '#080d18');
      gctx.fillStyle = grad;
      gctx.fillRect(0, 0, 256, 256);
    }
    const groundTex = new CanvasTexture(groundCanvas);
    const groundMat = new MeshStandardMaterial({ map: groundTex, roughness: 0.94, metalness: 0.08 });
    const ground = new Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);
    this.disposables.push(groundGeo, groundMat, groundTex);

    // Coordinate grid (1 km sim cells -> 200 world units).
    const grid = this.buildGrid(6000, 200);
    this.scene.add(grid);

    // Range rings + azimuth radials centred on the protected zone.
    const rings = new Group();
    const zoneWorld = simPointToWorld({ x: PROTECTED_ZONE.centre.x, y: PROTECTED_ZONE.centre.y, z: 0 });
    rings.position.set(zoneWorld.x, 1.5, zoneWorld.z);
    for (const rm of RANGE_RINGS_SIM_M) {
      const r = rm * WORLD_SCALE;
      const geo = new RingGeometry(Math.max(r - 3, 1), r, 128);
      const mat = new MeshBasicMaterial({
        color: 0x263951,
        transparent: true,
        opacity: 0.55,
        side: DoubleSide,
        depthWrite: false,
      });
      const ring = new Mesh(geo, mat);
      ring.rotation.x = -Math.PI / 2;
      rings.add(ring);
      this.disposables.push(geo, mat);
    }
    const radialPts: number[] = [];
    for (let deg = 0; deg < 360; deg += 45) {
      const rad = (deg * Math.PI) / 180;
      radialPts.push(0, 0, 0, Math.sin(rad) * 25000 * WORLD_SCALE, 0, -Math.cos(rad) * 25000 * WORLD_SCALE);
    }
    const radialGeo = new BufferGeometry();
    radialGeo.setAttribute('position', new BufferAttribute(new Float32Array(radialPts), 3));
    const radialMat = new LineBasicMaterial({ color: 0x16253a, transparent: true, opacity: 0.55 });
    const radials = new Line(radialGeo, radialMat);
    radials.position.y = 0.5;
    rings.add(radials);
    this.disposables.push(radialGeo, radialMat);
    this.scene.add(rings);

    // Rotating radar sweep fan at the zone centre.
    const sweepGeo = new CircleGeometry(24000 * WORLD_SCALE, 64, 0, MathUtils.degToRad(26));
    const sweepMat = new MeshBasicMaterial({
      color: 0x48d9f5,
      transparent: true,
      opacity: 0.08,
      side: DoubleSide,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    const sweep = new Mesh(sweepGeo, sweepMat);
    sweep.rotation.x = -Math.PI / 2;
    sweep.position.set(zoneWorld.x, 2.5, zoneWorld.z);
    this.scene.add(sweep);
    this.disposables.push(sweepGeo, sweepMat);

    // Strategic alert rings (DEFCON <= 2).
    for (const mult of [1.35, 1.9]) {
      const r = PROTECTED_ZONE.radius * mult * WORLD_SCALE;
      const geo = new RingGeometry(Math.max(r - 6, 1), r, 96);
      const mat = new MeshBasicMaterial({
        color: 0xf97316,
        transparent: true,
        opacity: 0,
        side: DoubleSide,
        depthWrite: false,
      });
      const mesh = new Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(zoneWorld.x, 3.5, zoneWorld.z);
      mesh.visible = false;
      this.scene.add(mesh);
      this.defconRings.push(mesh);
      this.disposables.push(geo, mat);
    }

    return { sweep, grid, rings };
  }

  private buildGrid(halfExtent: number, step: number): Group {
    const group = new Group();
    const pts: number[] = [];
    for (let v = -halfExtent; v <= halfExtent; v += step) {
      pts.push(-halfExtent, 0, v, halfExtent, 0, v);
      pts.push(v, 0, -halfExtent, v, 0, halfExtent);
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3));
    const mat = new LineBasicMaterial({ color: 0x1b2d45, transparent: true, opacity: 0.45 });
    const lines = new Line(geo, mat);
    lines.position.y = 0.6;
    group.add(lines);
    this.disposables.push(geo, mat);
    return group;
  }

  private buildZone(): void {
    const centre = simPointToWorld({ x: PROTECTED_ZONE.centre.x, y: PROTECTED_ZONE.centre.y, z: 0 });
    const radius = PROTECTED_ZONE.radius * WORLD_SCALE;
    const height = displayAltitudeMetres(PROTECTED_ZONE.ceiling) * WORLD_SCALE;

    const wallGeo = new CylinderGeometry(radius, radius, height, 64, 1, true);
    const wallMat = new MeshBasicMaterial({
      color: 0x48d9f5,
      transparent: true,
      opacity: 0.02,
      side: DoubleSide,
      depthWrite: false,
    });
    const walls = new Mesh(wallGeo, wallMat);
    walls.position.set(centre.x, height / 2, centre.z);
    this.scene.add(walls);
    this.disposables.push(wallGeo, wallMat);

    // Top + bottom boundary rings.
    const ringSpecs: Array<{ y: number; opacity: number }> = [
      { y: 1, opacity: 0.55 },
      { y: height, opacity: 0.3 },
    ];
    for (const spec of ringSpecs) {
      const geo = new RingGeometry(Math.max(radius - 2.5, 1), radius, 96);
      const mat = new MeshBasicMaterial({
        color: 0x48d9f5,
        transparent: true,
        opacity: spec.opacity,
        side: DoubleSide,
        depthWrite: false,
      });
      const ring = new Mesh(geo, mat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(centre.x, spec.y, centre.z);
      this.scene.add(ring);
      this.disposables.push(geo, mat);
    }

    // Configured buffer warning ring (amber).
    const bufferR = PROTECTED_ZONE.bufferRadius * WORLD_SCALE;
    const bufGeo = new RingGeometry(Math.max(bufferR - 3, 1), bufferR, 96);
    const bufMat = new MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.4,
      side: DoubleSide,
      depthWrite: false,
    });
    const buf = new Mesh(bufGeo, bufMat);
    buf.rotation.x = -Math.PI / 2;
    buf.position.set(centre.x, 1.2, centre.z);
    this.scene.add(buf);
    this.disposables.push(bufGeo, bufMat);
  }

  private buildStations(): void {
    const stations: Array<{ x: number; y: number; label: string }> = [
      { x: PROTECTED_ZONE.centre.x + PROTECTED_ZONE.bufferRadius + 420, y: 0, label: 'EAST RIDGE STN' },
      { x: -2200, y: 1400, label: 'WEST MESA STN' },
      { x: 0, y: -8000, label: 'GARUD AIRBASE' },
    ];
    for (const s of stations) {
      const station = createSensorStation(0x00f0ff);
      const world = simPointToWorld({ x: s.x, y: s.y, z: 0 });
      station.group.position.set(world.x, 0, world.z);
      station.group.scale.setScalar(2.2);
      this.scene.add(station.group);
      this.stationRotors.push(station.rotor);
      this.stationRotors.push(station.rotor);
      const marker = makeMarkerSprite(s.label, '#2dd4bf', 0.036);
      marker.sprite.position.set(world.x, 26, world.z);
      this.scene.add(marker.sprite);
      this.disposables.push(marker);
      station.group.traverse((obj) => {
        const mesh = obj as Mesh;
        if (mesh.isMesh) this.disposables.push(mesh.geometry, mesh.material as { dispose: () => void });
      });
    }
  }

  // ------------------------------------------------------------------
  // Simulation sync
  // ------------------------------------------------------------------

  private headingOf(track: TrackSnapshot): number {
    if (typeof track.heading === 'number') return track.heading;
    if (track.vel) return headingFromVel(track.vel.x, track.vel.y);
    return 0;
  }

  sync(
    view: SimView,
    opts: SyncOptions,
    interceptorState: InterceptorState | null,
    jetState: JetScrambleState | null,
    interceptorTarget: { x: number; y: number; z: number } | null,
  ): void {
    if (this.disposed) return;
    this.lastView = view;
    this.lastInterceptor = interceptorState;
    this.lastScramble = jetState;
    this.paused = view.paused;
    this.syncTracks(view, opts);
    this.syncInterceptor(interceptorState, interceptorTarget);
    this.syncJets(jetState);
    this.syncDefcon(opts.defcon);
    this.setSweepVisible(opts.showSweep);
    this.setRingsVisible(opts.showRings);
    this.setGridVisible(opts.showGrid);
  }

  private syncTracks(view: SimView, opts: SyncOptions): void {
    const seen = new Set<string>();

    for (const track of view.tracks) {
      seen.add(track.id);
      const frozen = opts.frozenTracks?.[track.id];
      const disabled = opts.disabledTrackIds?.has(track.id) ?? false;
      let entity = this.tracks.get(track.id);
      if (!entity) {
        entity = this.createTrackEntity(track);
        this.tracks.set(track.id, entity);
        this.scene.add(entity.model.group);
        this.scene.add(entity.label.sprite);
        this.scene.add(entity.trail);
        this.scene.add(entity.forecast);
        this.scene.add(entity.stem);
        this.scene.add(entity.vector);
        this.scene.add(entity.groundRing);
        this.pickTargets.push(...entity.meshes);
      }

      // Position source precedence matches the 2D scope: frozen exercise
      // position, else estimated position, else last truth position.
      const src = frozen
        ? { x: frozen.x, y: frozen.y, z: frozen.z }
        : track.estPos ?? track.observations[track.observations.length - 1] ?? track.pos;
      const world = simPointToWorld(src);
      entity.model.group.position.set(world.x, world.y, world.z);
      entity.label.sprite.position.set(world.x, world.y + 35, world.z);
      const heading = frozen ? frozen.heading : this.headingOf(track);
      entity.model.group.rotation.y = headingToYaw(heading);

      // Status colour + label.
      const color = statusColorFor(track, disabled);
      if (!entity.statusColor.equals(color)) {
        entity.statusColor.copy(color);
        tintModel(entity.model, color);
      }
      const isSelected = opts.selectedId === track.id;
      if (opts.showLabels) {
        const kindTag =
          entity.model.kind === 'drone' ? 'DRONE'
          : entity.model.kind === 'fighter' ? 'FTR'
          : entity.model.kind === 'interceptor' ? 'INT'
          : 'CIV';
        const freshnessTag =
          track.freshness === 'lost' ? ' · LOST' : track.freshness === 'stale' ? ' · STALE' : '';
        const line1 = `[${kindTag}] ${track.callsign}${freshnessTag}`;
        const line2 = disabled
          ? `INTERCEPTED · ${flOf(src.z)}`
          : `${flOf(src.z)} · HDG ${Math.round(heading).toString().padStart(3, '0')}°`;
        entity.label.update([line1, line2], toneFor(track, disabled), isSelected);
      }
      entity.label.sprite.visible = opts.showLabels;

      // Selection ground ring (violet accent when selected).
      const ringMat = entity.groundRing.material as MeshBasicMaterial;
      ringMat.color.set(isSelected ? 0xb59aff : color);
      ringMat.opacity = isSelected ? 0.95 : 0.35;
      entity.groundRing.position.set(world.x, 1.8, world.z);
      entity.groundRing.scale.setScalar(isSelected ? 1.5 : 1);

      // Altitude stem (ground -> model) for depth cueing.
      const stemArr = entity.stemPositions;
      stemArr[0] = world.x; stemArr[1] = 2; stemArr[2] = world.z;
      stemArr[3] = world.x; stemArr[4] = world.y; stemArr[5] = world.z;
      (entity.stem.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
      const stemMat = entity.stem.material as LineBasicMaterial;
      stemMat.color.copy(color);
      stemMat.opacity = isSelected ? 0.5 : 0.22;

      // Heading velocity vector (nose points -Z at rest -> world dir after yaw).
      const speed = frozen ? 0 : track.speed;
      const vecLen = MathUtils.clamp(speed * 1.1, 20, 130);
      const rad = headingToYaw(heading);
      const dirX = -Math.sin(rad);
      const dirZ = -Math.cos(rad);
      const vecArr = entity.vectorPositions;
      vecArr[0] = world.x; vecArr[1] = world.y; vecArr[2] = world.z;
      vecArr[3] = world.x + dirX * vecLen; vecArr[4] = world.y; vecArr[5] = world.z + dirZ * vecLen;
      (entity.vector.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
      const vecMat = entity.vector.material as LineBasicMaterial;
      vecMat.color.copy(color);
      entity.vector.visible = !disabled && speed > 1;

      // Trail from observation history (authoritative telemetry).
      if (opts.showTrails && !disabled) {
        const obs = track.observations.slice(-MAX_TRAIL_POINTS);
        entity.trail.visible = obs.length > 1;
        if (obs.length > 1 && obs.length !== entity.lastTrailCount) {
          entity.lastTrailCount = obs.length;
          const arr = entity.trailPositions;
          const col = entity.trailColors;
          for (let i = 0; i < MAX_TRAIL_POINTS; i++) {
            const o = obs[i];
            if (!o) continue;
            const p = simPointToWorld(o);
            arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z;
            const fade = 0.12 + 0.6 * (i / Math.max(obs.length - 1, 1));
            col[i * 3] = color.r * fade;
            col[i * 3 + 1] = color.g * fade;
            col[i * 3 + 2] = color.b * fade;
          }
          entity.trail.geometry.setDrawRange(0, obs.length);
          (entity.trail.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
          (entity.trail.geometry.getAttribute('color') as BufferAttribute).needsUpdate = true;
        }
      } else {
        entity.trail.visible = false;
        entity.lastTrailCount = -1;
      }

      // Forecast trajectory: only for the selected, healthy track.
      const wantForecast =
        opts.showForecasts && isSelected && !disabled && track.forecastState === 'ready' && track.forecast.length > 1;
      if (wantForecast) {
        const fc = track.forecast.slice(0, MAX_FORECAST_POINTS);
        entity.forecast.visible = true;
        if (fc.length !== entity.lastForecastCount) {
          entity.lastForecastCount = fc.length;
          const arr = entity.forecastPositions;
          const start = simPointToWorld(src);
          arr[0] = start.x; arr[1] = start.y; arr[2] = start.z;
          for (let i = 0; i < fc.length; i++) {
            const p = simPointToWorld(fc[i]);
            arr[(i + 1) * 3] = p.x; arr[(i + 1) * 3 + 1] = p.y; arr[(i + 1) * 3 + 2] = p.z;
          }
          entity.forecast.geometry.setDrawRange(0, fc.length + 1);
          (entity.forecast.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
          entity.forecast.computeLineDistances();
        }
      } else {
        entity.forecast.visible = false;
        entity.lastForecastCount = -1;
      }
    }

    // Remove entities for tracks that disappeared.
    for (const [id, entity] of this.tracks) {
      if (seen.has(id)) continue;
      this.scene.remove(entity.model.group);
      this.scene.remove(entity.label.sprite);
      this.scene.remove(entity.trail);
      this.scene.remove(entity.forecast);
      this.scene.remove(entity.stem);
      this.scene.remove(entity.vector);
      this.scene.remove(entity.groundRing);
      this.disposeTrackEntity(entity);
      this.tracks.delete(id);
      this.pickTargets = this.pickTargets.filter((m) => !entity.meshes.includes(m));
    }
  }

  private createTrackEntity(track: TrackSnapshot): TrackEntity {
    const kind = kindForTrack(track);
    const initialColor = statusColorFor(track, false);
    const model = createModelForKind(kind, initialColor.getHex());
    model.group.scale.setScalar(kind === 'drone' ? 3.8 : 4.4);

    const label = new LabelSprite(['--', '--'], toneFor(track, false), 0.05);

    const trailGeo = new BufferGeometry();
    const trailPositions = new Float32Array(MAX_TRAIL_POINTS * 3);
    const trailColors = new Float32Array(MAX_TRAIL_POINTS * 3);
    trailGeo.setAttribute('position', dynamicAttr(trailPositions));
    trailGeo.setAttribute('color', dynamicAttr(trailColors));
    const trailMat = new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false });
    const trail = new Line(trailGeo, trailMat);
    const forecastGeo = new BufferGeometry();
    const forecastPositions = new Float32Array((MAX_FORECAST_POINTS + 1) * 3);
    forecastGeo.setAttribute('position', dynamicAttr(forecastPositions));
    const forecastMat = new LineDashedMaterial({
      color: 0x38bdf8,
      dashSize: 30,
      gapSize: 20,
      transparent: true,
      opacity: 0.85,
    });
    const forecast = new Line(forecastGeo, forecastMat);

    const stemGeo = new BufferGeometry();
    const stemPositions = new Float32Array(6);
    stemGeo.setAttribute('position', dynamicAttr(stemPositions));
    const stemMat = new LineBasicMaterial({ color: initialColor, transparent: true, opacity: 0.22 });
    const stem = new Line(stemGeo, stemMat);

    const vectorGeo = new BufferGeometry();
    const vectorPositions = new Float32Array(6);
    vectorGeo.setAttribute('position', dynamicAttr(vectorPositions));
    const vectorMat = new LineBasicMaterial({ color: initialColor, transparent: true, opacity: 0.7 });
    const vector = new Line(vectorGeo, vectorMat);

    const ringGeo = new RingGeometry(20, 24, 32);
    const ringMat = new MeshBasicMaterial({
      color: initialColor,
      transparent: true,
      opacity: 0.3,
      side: DoubleSide,
      depthWrite: false,
    });
    const groundRing = new Mesh(ringGeo, ringMat);
    groundRing.rotation.x = -Math.PI / 2;

    this.disposables.push(
      trailGeo, trailMat,
      forecastGeo, forecastMat,
      stemGeo, stemMat,
      vectorGeo, vectorMat,
      ringGeo, ringMat,
    );

    return {
      model,
      label,
      trail,
      trailPositions,
      trailColors,
      forecast,
      forecastPositions,
      stem,
      stemPositions,
      vector,
      vectorPositions,
      groundRing,
      lastTrailCount: -1,
      lastForecastCount: -1,
      statusColor: initialColor.clone(),
      meshes: meshesOf(model.group),
    };
  }

  private disposeTrackEntity(entity: TrackEntity): void {
    entity.label.dispose();
    for (const mesh of entity.meshes) {
      mesh.geometry.dispose();
      (mesh.material as { dispose: () => void }).dispose();
    }
  }

  private syncInterceptor(
    state: InterceptorState | null,
    target: { x: number; y: number; z: number } | null,
  ): void {
    if (!state) {
      if (this.interceptor) {
        this.removeExerciseEntity(this.interceptor);
        this.interceptor = null;
      }
      if (this.baseMarker) {
        this.scene.remove(this.baseMarker.sprite.sprite);
        this.scene.remove(this.baseMarker.ring);
        this.baseMarker.sprite.dispose();
        this.baseMarker.ring.geometry.dispose();
        (this.baseMarker.ring.material as MeshBasicMaterial).dispose();
        this.baseMarker = null;
      }
      return;
    }

    // Base pad marker at the interceptor origin (only while an exercise exists).
    if (!this.baseMarker) {
      const originWorld = simPointToWorld({ x: state.originPos.x, y: state.originPos.y, z: 0 });
      const sprite = makeMarkerSprite('INT BASE · PAD ALPHA', '#00f0ff', 0.04);
      sprite.sprite.position.set(originWorld.x, 22, originWorld.z);
      this.scene.add(sprite.sprite);
      const ringGeo = new RingGeometry(40, 46, 48);
      const ringMat = new MeshBasicMaterial({
        color: 0x00f0ff, transparent: true, opacity: 0.6, side: DoubleSide, depthWrite: false,
      });
      const ring = new Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(originWorld.x, 1.5, originWorld.z);
      this.scene.add(ring);
      this.baseMarker = { sprite, ring };
      this.disposables.push(ringGeo, ringMat);
    }

    if (!this.interceptor) {
      const model = createModelForKind('interceptor', 0x00f0ff);
      model.group.scale.setScalar(4.2);
      const label = new LabelSprite(['INT-ALPHA', 'SCRAMBLE'], 'cyan', 0.05);
      const trailGeo = new BufferGeometry();
      const trailPositions = new Float32Array(MAX_TRAIL_POINTS * 3);
      const trailColors = new Float32Array(MAX_TRAIL_POINTS * 3);
      trailGeo.setAttribute('position', dynamicAttr(trailPositions));
      trailGeo.setAttribute('color', dynamicAttr(trailColors));
      const trailMat = new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false });
      const trail = new Line(trailGeo, trailMat);
      this.scene.add(model.group);
      this.scene.add(label.sprite);
      this.scene.add(trail);
      this.disposables.push(trailGeo, trailMat);
      this.interceptor = { model, label, trail, trailPositions, trailColors, lastTrailCount: -1 };
      this.pickTargets.push(...meshesOf(model.group));
    }

    const ent = this.interceptor;
    const world = simPointToWorld(state.pos);
    ent.model.group.position.set(world.x, world.y, world.z);
    ent.label.sprite.position.set(world.x, world.y + 35, world.z);
    ent.model.group.rotation.y = headingToYaw(state.heading);

    const quick = state.style === 'quick' || state.style === 'quick-streak';
    const accent = quick ? 0xfde047 : 0x00f0ff;
    tintModel(ent.model, new Color(accent));

    ent.label.update(
      [
        `INT-ALPHA [${state.stage.toUpperCase()}]`,
        `${Math.round(state.distanceToTarget)} M · ${Math.round(state.closureRate)} M/S`,
      ],
      quick ? 'white' : 'cyan',
      false,
    );

    // Trail from the exercise's own history — same coordinates the model used.
    const hist = state.trailHistory.slice(-MAX_TRAIL_POINTS);
    if (hist.length > 1 && hist.length !== ent.lastTrailCount) {
      ent.lastTrailCount = hist.length;
      const arr = ent.trailPositions;
      const col = ent.trailColors;
      const c = new Color(accent);
      for (let i = 0; i < MAX_TRAIL_POINTS; i++) {
        const h = hist[i];
        if (!h) continue;
        const p = simPointToWorld({ x: h.x, y: h.y, z: state.pos.z });
        arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z;
        const fade = 0.15 + 0.75 * (i / Math.max(hist.length - 1, 1));
        col[i * 3] = c.r * fade; col[i * 3 + 1] = c.g * fade; col[i * 3 + 2] = c.b * fade;
      }
      ent.trail.geometry.setDrawRange(0, hist.length);
      (ent.trail.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
      (ent.trail.geometry.getAttribute('color') as BufferAttribute).needsUpdate = true;
    }
    ent.trail.visible = hist.length > 1;

    // Planned-trajectory guide: lofted bezier for arc presets, direct line
    // toward the target otherwise. The model itself follows the App's own
    // integrated position, so object and trajectory stay aligned.
    if (state.style === 'arc-display' || state.style === 'cinematic') {
      if (state.arcControl) this.updateArcGuide(state, accent);
    } else if (target) {
      this.updateDirectGuide(state, target, accent);
    } else if (this.interceptorGuide) {
      this.interceptorGuide.visible = false;
    }
  }

  private updateArcGuide(state: InterceptorState, accent: number): void {
    if (!state.arcControl) return;
    const pts: Vector3[] = [];
    const o = simPointToWorld({ x: state.originPos.x, y: state.originPos.y, z: state.pos.z });
    const c = simPointToWorld({ x: state.arcControl.x, y: state.arcControl.y, z: state.pos.z });
    const t = simPointToWorld(state.pos);
    for (let i = 0; i < MAX_GUIDE_POINTS; i++) {
      const s = i / (MAX_GUIDE_POINTS - 1);
      const om = 1 - s;
      pts.push(
        new Vector3(
          om * om * o.x + 2 * om * s * c.x + s * s * t.x,
          om * om * o.y + 2 * om * s * c.y + s * s * t.y,
          om * om * o.z + 2 * om * s * c.z + s * s * t.z,
        ),
      );
    }
    this.setGuide(pts, accent);
  }

  private updateDirectGuide(
    state: InterceptorState,
    target: { x: number; y: number; z: number },
    accent: number,
  ): void {
    const from = simPointToWorld(state.pos);
    const to = simPointToWorld(target);
    this.setGuide(
      [new Vector3(from.x, from.y, from.z), new Vector3(to.x, to.y, to.z)],
      accent,
    );
  }

  private setGuide(points: Vector3[], accent: number): void {
    if (!this.interceptorGuide) {
      const geo = new BufferGeometry();
      geo.setAttribute('position', dynamicAttr(new Float32Array(MAX_GUIDE_POINTS * 3)));
      const mat = new LineDashedMaterial({
        color: accent,
        dashSize: 18,
        gapSize: 12,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
      });
      this.interceptorGuide = new Line(geo, mat);
      this.interceptorGuide.visible = false;
      this.scene.add(this.interceptorGuide);
      this.disposables.push(geo, mat);
    }
    const guide = this.interceptorGuide;
    (guide.material as LineDashedMaterial).color.setHex(accent);
    const arr = guide.geometry.getAttribute('position') as BufferAttribute;
    const data = arr.array as Float32Array;
    const n = Math.min(points.length, MAX_GUIDE_POINTS);
    for (let i = 0; i < n; i++) {
      data[i * 3] = points[i].x;
      data[i * 3 + 1] = points[i].y;
      data[i * 3 + 2] = points[i].z;
    }
    arr.needsUpdate = true;
    guide.geometry.setDrawRange(0, n);
    guide.computeLineDistances();
    guide.visible = true;
  }

  private syncJets(state: JetScrambleState | null): void {
    if (!state) {
      for (const jet of this.jets) this.removeExerciseEntity(jet);
      this.jets = [];
      return;
    }
    while (this.jets.length < state.jets.length) {
      const model = createModelForKind('fighter', 0x38bdf8);
      model.group.scale.setScalar(7.0);
      const label = new LabelSprite(['VIPER', '--'], 'blue', 0.052);
      const trailGeo = new BufferGeometry();
      const trailPositions = new Float32Array(MAX_TRAIL_POINTS * 3);
      const trailColors = new Float32Array(MAX_TRAIL_POINTS * 3);
      trailGeo.setAttribute('position', dynamicAttr(trailPositions));
      trailGeo.setAttribute('color', dynamicAttr(trailColors));
      const trailMat = new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false });
      const trail = new Line(trailGeo, trailMat);
      this.scene.add(model.group);
      this.scene.add(label.sprite);
      this.scene.add(trail);
      this.disposables.push(trailGeo, trailMat);
      this.jets.push({ model, label, trail, trailPositions, trailColors, lastTrailCount: -1 });
      this.pickTargets.push(...meshesOf(model.group));
    }

    state.jets.forEach((jet, i) => {
      const ent = this.jets[i];
      if (!ent) return;
      // Map simulation altitude via displayAltitudeMetres compression so formation flies gracefully
      const world = simPointToWorld(jet.pos);
      ent.model.group.position.set(world.x, world.y, world.z);
      ent.label.sprite.position.set(world.x, world.y + 35, world.z);
      ent.model.group.rotation.y = headingToYaw(jet.heading);
      ent.label.update([jet.callsign, `${flOf(jet.pos.z)} · PATROL`], 'blue', false);

      const hist = jet.trail.slice(-MAX_TRAIL_POINTS);
      if (hist.length > 1 && hist.length !== ent.lastTrailCount) {
        ent.lastTrailCount = hist.length;
        const arr = ent.trailPositions;
        const col = ent.trailColors;
        const c = new Color(0x38bdf8);
        for (let j = 0; j < MAX_TRAIL_POINTS; j++) {
          const h = hist[j];
          if (!h) continue;
          const p = simPointToWorld({ x: h.x, y: h.y, z: jet.pos.z });
          arr[j * 3] = p.x; arr[j * 3 + 1] = p.y; arr[j * 3 + 2] = p.z;
          const fade = 0.2 + 0.75 * (j / Math.max(hist.length - 1, 1));
          col[j * 3] = c.r * fade; col[j * 3 + 1] = c.g * fade; col[j * 3 + 2] = c.b * fade;
        }
        ent.trail.geometry.setDrawRange(0, hist.length);
        (ent.trail.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
        (ent.trail.geometry.getAttribute('color') as BufferAttribute).needsUpdate = true;
      }
      ent.trail.visible = hist.length > 1;
    });
  }

  private removeExerciseEntity(ent: ExerciseEntity): void {
    this.scene.remove(ent.model.group);
    this.scene.remove(ent.label.sprite);
    this.scene.remove(ent.trail);
    ent.label.dispose();
    for (const mesh of meshesOf(ent.model.group)) {
      mesh.geometry.dispose();
      (mesh.material as { dispose: () => void }).dispose();
    }
    this.pickTargets = this.pickTargets.filter(
      (m) => !meshesOf(ent.model.group).includes(m),
    );
  }

  private syncDefcon(defcon: number): void {
    const active = defcon <= 2;
    for (const ring of this.defconRings) {
      const mat = ring.material as MeshBasicMaterial;
      mat.color.setHex(defcon === 1 ? 0xef4444 : 0xf97316);
      mat.opacity = active ? 0.45 : 0;
      ring.visible = active;
    }
  }

  // ------------------------------------------------------------------
  // Encounter effects (fire exactly once per outcome key)
  // ------------------------------------------------------------------

  playEncounter(position: { x: number; y: number; z: number }, outcome: EncounterOutcome, key: string): void {
    if (this.lastEffectKey === key) return; // exactly-once guard
    this.lastEffectKey = key;
    const world = simPointToWorld(position);
    const effect = new EncounterEffect(
      this.scene,
      new Vector3(world.x, world.y, world.z),
      outcome,
      this.reducedMotion,
    );
    this.effects.push(effect);
  }

  /** Clear effect history so a replayed exercise can fire again. */
  resetEncounterKey(): void {
    this.lastEffectKey = null;
  }

  // ------------------------------------------------------------------
  // Interaction & loop
  // ------------------------------------------------------------------

  private bindPointer(): void {
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointercancel', this.onPointerCancel);
    el.addEventListener('lostpointercapture', this.onLostPointerCapture);
    window.addEventListener('blur', this.onWindowBlur);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('dblclick', this.onDblClick);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;
    this.pointerDown = { x: e.clientX, y: e.clientY };
    const isPan = e.button === 2 || e.button === 1 || (e.button === 0 && e.shiftKey);

    const wasRadar = this.rig.currentMode === 'radar';
    if (!isPan && wasRadar) {
      this.onModeChange?.('airspace');
    }

    try {
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {}

    const cam = this.rig.camera;
    cam.updateMatrixWorld();
    const panRight = new Vector3(1, 0, 0).applyQuaternion(cam.quaternion).normalize();
    const panUp = new Vector3(0, 1, 0).applyQuaternion(cam.quaternion).normalize();
    const height = Math.max(this.container.clientHeight, 100);
    const fovRad = MathUtils.degToRad(cam.fov);
    const panScale = (this.rig.distance * 2 * Math.tan(fovRad / 2)) / height;

    this.rig.setDragging(true);
    this.activeDrag = {
      pointerId: e.pointerId,
      button: e.button,
      startX: e.clientX,
      startY: e.clientY,
      startTheta: this.rig.currentSpherical.theta,
      startPhi: this.rig.currentSpherical.phi,
      startTarget: this.rig.targetPoint.clone(),
      panRight,
      panUp,
      panScale,
      isPan,
    };
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.activeDrag || e.pointerId !== this.activeDrag.pointerId) return;

    const totalDx = e.clientX - this.activeDrag.startX;
    const totalDy = e.clientY - this.activeDrag.startY;

    if (this.activeDrag.isPan) {
      // Screen-aligned panning: dragging right moves target left relative to camera,
      // dragging down moves target up relative to camera.
      const newTarget = this.activeDrag.startTarget
        .clone()
        .addScaledVector(this.activeDrag.panRight, -totalDx * this.activeDrag.panScale)
        .addScaledVector(this.activeDrag.panUp, totalDy * this.activeDrag.panScale);
      this.rig.setTargetDirect(newTarget);
    } else {
      // Orbit: smooth 360-degree horizontal rotation and clamped vertical elevation
      const sensitivity = 0.0055;
      const newTheta = this.activeDrag.startTheta - totalDx * sensitivity;
      const newPhi = MathUtils.clamp(
        this.activeDrag.startPhi + totalDy * sensitivity,
        MIN_POLAR,
        MAX_POLAR,
      );
      this.rig.setOrbitDirect(newTheta, newPhi);
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    try {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {}

    const drag = this.activeDrag;
    this.activeDrag = null;
    this.rig.setDragging(false);

    const down = this.pointerDown;
    this.pointerDown = null;

    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    if (moved > 6 || (drag && drag.isPan) || e.button !== 0) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.rig.camera);
    const hits = this.raycaster.intersectObjects(this.pickTargets, false);
    if (hits.length > 0) {
      this.onSelect?.(this.findTrackIdForMesh(hits[0].object as Mesh));
    } else {
      this.onSelect?.(null);
    }
  };

  private onPointerCancel = (e: PointerEvent): void => {
    try {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {}
    this.activeDrag = null;
    this.pointerDown = null;
    this.rig.setDragging(false);
  };

  private onLostPointerCapture = (): void => {
    this.activeDrag = null;
    this.pointerDown = null;
    this.rig.setDragging(false);
  };

  private onWindowBlur = (): void => {
    this.activeDrag = null;
    this.pointerDown = null;
    this.rig.setDragging(false);
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    const clampedDelta = Math.max(-100, Math.min(100, e.deltaY));
    const factor = Math.exp(clampedDelta * 0.0018);
    this.rig.zoom(factor);
  };

  private onDblClick = (e: MouseEvent): void => {
    e.preventDefault();
    this.fitScene(this.lastView, this.lastInterceptor, this.lastScramble);
    this.onFitRequested?.();
  };

  private findTrackIdForMesh(mesh: Mesh): string | null {
    for (const [id, entity] of this.tracks) {
      if (entity.meshes.includes(mesh)) return id;
    }
    for (const [i, jet] of this.jets.entries()) {
      if (meshesOf(jet.model.group).includes(mesh)) {
        return `VIPER-0${i + 1}`;
      }
    }
    return null;
  }

  setSelectHandler(fn: ((id: string | null) => void) | null): void {
    this.onSelect = fn;
  }

  setModeChangeHandler(fn: ((mode: CameraMode) => void) | null): void {
    this.onModeChange = fn;
  }

  setFitHandler(fn: (() => void) | null): void {
    this.onFitRequested = fn;
  }

  /** Subscribe to WebGL context loss; returns an unsubscribe function. */
  addContextLostListener(fn: () => void): () => void {
    const el = this.renderer.domElement;
    const handler = (): void => fn();
    el.addEventListener('webglcontextlost', handler);
    return () => el.removeEventListener('webglcontextlost', handler);
  }

  private startLoop(): void {
    this.clockLast = performance.now();
    const tick = (now: number): void => {
      if (this.disposed) return;
      const dt = Math.min((now - this.clockLast) / 1000, 0.1);
      this.clockLast = now;
      this.step(dt);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private sweepVisible = true;

  private step(dt: number): void {
    // Radar sweep: rotates only while the simulation is live; static under
    // reduced-motion.
    this.sweepMesh.visible = this.sweepVisible;
    if (this.sweepVisible && !this.paused && !this.reducedMotion) {
      this.sweepAngle += (dt / SWEEP_SECONDS_PER_REV) * Math.PI * 2;
      this.sweepMesh.rotation.z = -this.sweepAngle;
    }

    if (!this.reducedMotion) {
      for (const rotor of this.stationRotors) rotor.rotation.y += dt * 0.6;
      const pulse = 1 + Math.sin(performance.now() / 600) * 0.04;
      for (const ring of this.defconRings) {
        if (ring.visible) ring.scale.setScalar(pulse);
      }
    }

    this.effects = this.effects.filter((fx) => {
      const alive = fx.update(dt);
      if (!alive) fx.dispose();
      return alive;
    });

    const cam = this.rig.camera;
    this.zoneLabel.updateScreenScale(cam);
    for (const ent of this.tracks.values()) {
      if (ent.label.sprite.visible) ent.label.updateScreenScale(cam);
    }
    if (this.interceptor?.label.sprite.visible) {
      this.interceptor.label.updateScreenScale(cam);
    }
    for (const jet of this.jets) {
      if (jet.label.sprite.visible) jet.label.updateScreenScale(cam);
    }

    this.rig.update(dt);
    this.renderer.render(this.scene, this.rig.camera);
  }

  setSweepVisible(visible: boolean): void {
    this.sweepVisible = visible;
  }

  setGridVisible(visible: boolean): void {
    this.gridGroup.visible = visible;
  }

  setRingsVisible(visible: boolean): void {
    this.ringsGroup.visible = visible;
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
  }

  // ---- Camera API ----

  setCameraMode(mode: CameraMode, selectedWorld?: Vector3 | null): void {
    if (mode === 'follow' && selectedWorld) {
      this.rig.setMode('follow', selectedWorld);
      this.rig.focusOn(selectedWorld, 320);
      return;
    }
    if (mode === 'radar') {
      const zone = simPointToWorld({ x: PROTECTED_ZONE.centre.x, y: PROTECTED_ZONE.centre.y, z: 0 });
      this.rig.setMode('radar', new Vector3(zone.x, zone.y, zone.z));
      return;
    }
    this.rig.setMode('airspace');
  }

  getCameraMode(): CameraMode {
    return this.rig.currentMode;
  }

  orbit(dx: number, dy: number): void {
    this.rig.orbit(dx, dy);
  }

  zoom(factor: number): void {
    this.rig.zoom(factor);
  }

  pan(dx: number, dy: number): void {
    this.rig.pan(dx, dy);
  }

  resetCamera(): void {
    this.rig.reset();
  }

  /** Fit the protected zone + every live track (MapHandle.fitScene). */
  fitScene(view: SimView | null, interceptorState: InterceptorState | null, jetScrambleState?: JetScrambleState | null): void {
    // If operator is actively dragging the camera, do not override framing.
    if (this.rig.isUserDragging) return;

    const box = new Box3();
    const zoneMid = simPointToWorld({
      x: PROTECTED_ZONE.centre.x,
      y: PROTECTED_ZONE.centre.y,
      z: PROTECTED_ZONE.ceiling / 2,
    });
    box.expandByPoint(new Vector3(zoneMid.x, zoneMid.y, zoneMid.z));
    box.expandByPoint(simPointToWorld({ x: 0, y: -8000, z: 0 }));
    let count = 0;
    if (view) {
      for (const track of view.tracks) {
        const src = track.estPos ?? track.pos;
        const w = simPointToWorld(src);
        box.expandByPoint(new Vector3(w.x, w.y, w.z));
        count++;
      }
    }
    if (interceptorState) {
      const w = simPointToWorld(interceptorState.pos);
      box.expandByPoint(new Vector3(w.x, w.y, w.z));
      const o = simPointToWorld({ x: interceptorState.originPos.x, y: interceptorState.originPos.y, z: 0 });
      box.expandByPoint(new Vector3(o.x, o.y, o.z));
    }
    if (jetScrambleState) {
      for (const jet of jetScrambleState.jets) {
        const w = simPointToWorld({ x: jet.pos.x, y: jet.pos.y, z: ILLUSTRATIVE_JET_ALT_M });
        box.expandByPoint(new Vector3(w.x, w.y, w.z));
      }
    }
    if (count === 0 && !interceptorState) {
      // Frame the protected zone and interceptor base so the camera
      // isn't frustum-culling the entire scene when no tracks are synced yet.
      const zoneWorld = simPointToWorld({ x: PROTECTED_ZONE.centre.x, y: PROTECTED_ZONE.centre.y, z: 0 });
      const radius = PROTECTED_ZONE.radius * WORLD_SCALE;
      box.expandByPoint(new Vector3(zoneWorld.x + radius, zoneWorld.y, zoneWorld.z));
      box.expandByPoint(new Vector3(zoneWorld.x - radius, zoneWorld.y, zoneWorld.z));
      box.expandByPoint(new Vector3(zoneWorld.x, zoneWorld.y - 8000, zoneWorld.z));
    }
    const sphere = box.getBoundingSphere(new Sphere());
    this.rig.fitSphere(sphere.center, sphere.radius);
  }

  /** Smoothly focus the camera on a world point (track selection). */
  focusWorld(world: Vector3): void {
    this.rig.focusOn(world, 340);
  }

  /** Look up the current world position of a track by id. */
  worldOfTrack(view: SimView, id: string): Vector3 | null {
    const track = view.tracks.find((t) => t.id === id);
    if (!track) return null;
    const src = track.estPos ?? track.observations[track.observations.length - 1] ?? track.pos;
    const w = simPointToWorld(src);
    return new Vector3(w.x, w.y, w.z);
  }

  private observeResize(): void {
    const update = (): void => {
      if (this.disposed) return;
      const w = Math.max(this.container.clientWidth, 100);
      const h = Math.max(this.container.clientHeight, 100);
      this.renderer.setPixelRatio(Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2));
      this.renderer.setSize(w, h, false);
      this.rig.setAspect(w / h);
    };
    update();
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(update);
      this.resizeObserver.observe(this.container);
    } else {
      this.windowResize = update;
      window.addEventListener('resize', update);
    }
  }

  resize(): void {
    if (this.disposed) return;
    const w = Math.max(this.container.clientWidth, 100);
    const h = Math.max(this.container.clientHeight, 100);
    this.renderer.setSize(w, h, false);
    this.rig.setAspect(w / h);
  }

  updateFollowTarget(world: Vector3): void {
    if (this.rig.currentMode !== 'follow') return;
    this.rig.updateFollowTarget(world);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.raf !== 0) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
    this.resizeObserver?.disconnect();
    if (this.windowResize) {
      window.removeEventListener('resize', this.windowResize);
    }
    const dom = this.renderer.domElement;
    dom.removeEventListener('pointerdown', this.onPointerDown);
    dom.removeEventListener('pointermove', this.onPointerMove);
    dom.removeEventListener('pointerup', this.onPointerUp);
    dom.removeEventListener('pointercancel', this.onPointerCancel);
    dom.removeEventListener('lostpointercapture', this.onLostPointerCapture);
    window.removeEventListener('blur', this.onWindowBlur);
    dom.removeEventListener('wheel', this.onWheel);
    dom.removeEventListener('dblclick', this.onDblClick);
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables.length = 0;
    if (this.envDispose) {
      this.envDispose();
      this.envDispose = null;
    }
    this.zoneLabel.dispose();
    for (const ent of this.tracks.values()) this.disposeTrackEntity(ent);
    this.tracks.clear();
    if (this.interceptor) this.removeExerciseEntity(this.interceptor);
    for (const jet of this.jets) this.removeExerciseEntity(jet);
    if (this.baseMarker) {
      this.baseMarker.sprite.dispose();
      this.baseMarker.ring.geometry.dispose();
      (this.baseMarker.ring.material as MeshBasicMaterial).dispose();
    }
    if (this.interceptorGuide) {
      this.interceptorGuide.geometry.dispose();
      (this.interceptorGuide.material as LineDashedMaterial).dispose();
    }
    this.renderer.dispose();
    if (dom.parentElement === this.container) {
      this.container.removeChild(dom);
    }
  }
}

function meshesOf(root: Group): Mesh[] {
  const out: Mesh[] = [];
  root.traverse((obj) => {
    const m = obj as Mesh;
    if (m.isMesh) out.push(m);
  });
  return out;
}

export type { LineKind };
