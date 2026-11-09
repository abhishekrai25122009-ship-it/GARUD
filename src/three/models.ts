// Lightweight stylized low-poly models for the 3D airspace viewport.
// All geometry is generated locally (no external model/texture downloads)
// and every aircraft group is modelled with its nose pointing along -Z so
// `headingToYaw` rotation maps directly onto simulation headings.

import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointLight,
  RingGeometry,
  SphereGeometry,
  TorusGeometry,
} from 'three';

export type ModelKind = 'fighter' | 'drone' | 'interceptor' | 'civil' | 'sensor';

export interface AircraftModel {
  group: Group;
  /** Exhaust glow node so callers can pulse it restrainedly. */
  exhaust: Mesh | null;
  /** Body meshes whose emissive tint follows track status colour. */
  tintable: Mesh[];
  kind: ModelKind;
}

const BODY_DARK = 0x111d30;
const BODY_DARKER = 0x0c1423;

function standardBody(color: number, emissive: number): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity: 0.35,
    metalness: 0.4,
    roughness: 0.6,
    flatShading: true,
  });
}

function exhaustGlow(color: number, radius: number): Mesh {
  const mat = new MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.55,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  return new Mesh(new SphereGeometry(radius, 8, 6), mat);
}

function sweptWing3DGeometry(
  span: number,
  rootChord: number,
  tipChord: number,
  sweep: number,
  rootThickness = 0.32,
  tipThickness = 0.12,
): BufferGeometry {
  const half = span / 2;
  const rtH = rootThickness / 2;
  const tpH = tipThickness / 2;

  // 12 vertices: 4 at root (X=0), 4 at left tip (X=-half), 4 at right tip (X=half)
  const vertices = new Float32Array([
    // Root:
    0, rtH, -rootChord / 2,     // 0: top leading
    0, rtH, rootChord / 2,      // 1: top trailing
    0, -rtH, rootChord / 2,     // 2: bottom trailing
    0, -rtH, -rootChord / 2,    // 3: bottom leading

    // Left tip:
    -half, tpH, sweep - tipChord / 2,  // 4
    -half, tpH, sweep + tipChord / 2,  // 5
    -half, -tpH, sweep + tipChord / 2, // 6
    -half, -tpH, sweep - tipChord / 2, // 7

    // Right tip:
    half, tpH, sweep - tipChord / 2,   // 8
    half, tpH, sweep + tipChord / 2,   // 9
    half, -tpH, sweep + tipChord / 2,  // 10
    half, -tpH, sweep - tipChord / 2,  // 11
  ]);

  const indices = [
    // Left wing top:
    0, 4, 5,  0, 5, 1,
    // Left wing bottom:
    3, 2, 6,  3, 6, 7,
    // Left leading edge:
    0, 7, 4,  0, 3, 7,
    // Left trailing edge:
    1, 5, 6,  1, 6, 2,
    // Left tip cap:
    4, 7, 6,  4, 6, 5,

    // Right wing top:
    0, 1, 9,  0, 9, 8,
    // Right wing bottom:
    3, 10, 2, 3, 11, 10,
    // Right leading edge:
    0, 8, 11, 0, 11, 3,
    // Right trailing edge:
    1, 2, 10, 1, 10, 9,
    // Right tip cap:
    8, 9, 10, 8, 10, 11,
  ];

  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(vertices, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Twin-engine combat fighter: aerodynamic fuselage, pointed radome, swept wings, LERX strakes, twin canted tailfins, nozzles & afterburners. */
export function createFighterModel(accent = 0x38bdf8): AircraftModel {
  const group = new Group();
  const tintable: Mesh[] = [];

  const bodyMat = standardBody(BODY_DARK, accent);
  const metallicMat = new MeshStandardMaterial({
    color: 0x1a2638,
    metalness: 0.8,
    roughness: 0.35,
    flatShading: true,
  });

  // 1. Fuselage — central aerodynamic cylinder lying along Z
  const fuselage = new Mesh(new CylinderGeometry(0.72, 1.05, 9.6, 16), bodyMat);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.position.z = 0.2;
  group.add(fuselage);
  tintable.push(fuselage);

  // 2. Dorsal avionics spine running from cockpit to tail
  const spine = new Mesh(new BoxGeometry(0.55, 0.42, 7.2), bodyMat);
  spine.position.set(0, 0.72, 0.6);
  group.add(spine);
  tintable.push(spine);

  // 3. Cockpit forward chined body
  const forwardBody = new Mesh(new CylinderGeometry(0.52, 0.72, 3.6, 14), bodyMat);
  forwardBody.rotation.x = Math.PI / 2;
  forwardBody.position.set(0, 0.12, -4.6);
  group.add(forwardBody);
  tintable.push(forwardBody);

  // 4. Supersonic radome nose cone pointing toward -Z
  const nose = new Mesh(new ConeGeometry(0.52, 3.8, 16), bodyMat);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 0.12, -7.4);
  group.add(nose);
  tintable.push(nose);

  // 5. Needle pitot probe
  const pitot = new Mesh(new CylinderGeometry(0.04, 0.04, 1.2, 8), metallicMat);
  pitot.rotation.x = Math.PI / 2;
  pitot.position.set(0, 0.12, -9.6);
  group.add(pitot);

  // 6. Cockpit bubble canopy — glossy contrasting aerospace glass
  const canopyMat = new MeshStandardMaterial({
    color: 0x062029,
    emissive: accent,
    emissiveIntensity: 0.38,
    roughness: 0.15,
    metalness: 0.85,
    flatShading: true,
  });
  const canopy = new Mesh(
    new SphereGeometry(0.68, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    canopyMat,
  );
  canopy.scale.set(0.88, 0.85, 2.5);
  canopy.position.set(0, 0.72, -2.4);
  group.add(canopy);
  tintable.push(canopy);

  // 7. 3D Swept Delta Wings with aerodynamic thickness
  const wingGeo = sweptWing3DGeometry(12.6, 4.6, 1.6, 2.0, 0.28, 0.12);
  const wings = new Mesh(wingGeo, bodyMat);
  wings.position.set(0, 0.12, 0.6);
  group.add(wings);
  tintable.push(wings);

  // 8. Leading-Edge Root Extensions (LERX strakes)
  const strakeL = new Mesh(new BoxGeometry(0.55, 0.2, 4.2), bodyMat);
  strakeL.position.set(-1.05, 0.18, -1.8);
  group.add(strakeL);
  tintable.push(strakeL);
  const strakeR = strakeL.clone();
  strakeR.position.x = 1.05;
  group.add(strakeR);
  tintable.push(strakeR);

  // 9. Wingtip missile launch rails & air-to-air missiles
  const railGeo = new BoxGeometry(0.12, 0.14, 2.8);
  const missileBodyGeo = new CylinderGeometry(0.08, 0.08, 2.2, 8);
  const missileNoseGeo = new ConeGeometry(0.08, 0.4, 8);

  const leftRail = new Mesh(railGeo, metallicMat);
  leftRail.position.set(-6.3, 0.18, 1.6);
  const leftMissile = new Mesh(missileBodyGeo, bodyMat);
  leftMissile.rotation.x = Math.PI / 2;
  leftMissile.position.set(-6.3, 0.06, 1.6);
  const leftNose = new Mesh(missileNoseGeo, metallicMat);
  leftNose.rotation.x = -Math.PI / 2;
  leftNose.position.set(-6.3, 0.06, 0.3);
  group.add(leftRail, leftMissile, leftNose);

  const rightRail = new Mesh(railGeo, metallicMat);
  rightRail.position.set(6.3, 0.18, 1.6);
  const rightMissile = new Mesh(missileBodyGeo, bodyMat);
  rightMissile.rotation.x = Math.PI / 2;
  rightMissile.position.set(6.3, 0.06, 1.6);
  const rightNose = new Mesh(missileNoseGeo, metallicMat);
  rightNose.rotation.x = -Math.PI / 2;
  rightNose.position.set(6.3, 0.06, 0.3);
  group.add(rightRail, rightMissile, rightNose);

  // 10. Twin canted vertical tailfins (~16 deg cant angle)
  const finGeo = new BoxGeometry(0.14, 2.6, 1.8);
  const finL = new Mesh(finGeo, bodyMat);
  finL.position.set(-1.25, 1.35, 3.8);
  finL.rotation.z = 0.28;
  group.add(finL);
  tintable.push(finL);
  const finR = finL.clone();
  finR.position.x = 1.25;
  finR.rotation.z = -0.28;
  group.add(finR);
  tintable.push(finR);

  // 11. Swept horizontal tailplanes (stabilators)
  const tp = new Mesh(new BoxGeometry(4.2, 0.16, 1.6), bodyMat);
  tp.position.set(0, 0.15, 4.6);
  group.add(tp);
  tintable.push(tp);

  // 12. Twin titanium engine exhaust nozzles
  const nozzleGeo = new CylinderGeometry(0.52, 0.48, 1.4, 16);
  const nozzleL = new Mesh(nozzleGeo, metallicMat);
  nozzleL.rotation.x = Math.PI / 2;
  nozzleL.position.set(-0.62, 0.05, 5.2);
  const nozzleR = nozzleL.clone();
  nozzleR.position.x = 0.62;
  group.add(nozzleL, nozzleR);

  // Glowing afterburner cores
  const glowL = exhaustGlow(accent, 0.45);
  glowL.position.set(-0.62, 0.05, 5.8);
  const glowR = exhaustGlow(accent, 0.45);
  glowR.position.set(0.62, 0.05, 5.8);
  group.add(glowL, glowR);

  const afterburnerLight = new PointLight(accent, 5, 25, 2);
  afterburnerLight.position.set(0, 0.05, 5.6);
  group.add(afterburnerLight);

  return { group, exhaust: glowL, tintable, kind: 'fighter' };
}

/** Stealth Flying-Wing UAV: swept delta flying wing, dorsal intake, ventral 360° sensor pod. */
export function createDroneModel(accent = 0xf59e0b): AircraftModel {
  const group = new Group();
  const tintable: Mesh[] = [];

  const bodyMat = standardBody(BODY_DARKER, accent);
  const stealthSkin = new MeshStandardMaterial({
    color: 0x0c1423,
    metalness: 0.65,
    roughness: 0.45,
    flatShading: true,
  });

  // 1. Broad stealth flying-wing airframe with 3D thickness (nose pointing -Z)
  const wingGeo = sweptWing3DGeometry(10.8, 4.4, 1.4, 2.8, 0.42, 0.14);
  const flyingWing = new Mesh(wingGeo, bodyMat);
  flyingWing.position.set(0, 0, 0);
  group.add(flyingWing);
  tintable.push(flyingWing);

  // 2. Central blended avionics hump
  const centerHump = new Mesh(new BoxGeometry(2.6, 0.72, 4.2), bodyMat);
  centerHump.position.set(0, 0.12, 0);
  group.add(centerHump);
  tintable.push(centerHump);

  // 3. Dorsal flush air intake scoop
  const intake = new Mesh(new BoxGeometry(1.2, 0.35, 1.6), stealthSkin);
  intake.position.set(0, 0.42, -0.6);
  const intakeLip = new Mesh(new BoxGeometry(1.25, 0.08, 0.2), stealthSkin);
  intakeLip.position.set(0, 0.56, -1.4);
  group.add(intake, intakeLip);
  tintable.push(intake);

  // 4. Ventral 360° spherical FLIR / EO sensor turret
  const turretPod = new Mesh(
    new SphereGeometry(0.55, 16, 12),
    new MeshStandardMaterial({
      color: 0x0b1320,
      emissive: accent,
      emissiveIntensity: 0.45,
      metalness: 0.9,
      roughness: 0.15,
      flatShading: true,
    }),
  );
  turretPod.position.set(0, -0.38, -1.8);
  group.add(turretPod);
  tintable.push(turretPod);

  // Sensor optic lens ring
  const lens = new Mesh(
    new RingGeometry(0.12, 0.28, 16),
    new MeshBasicMaterial({ color: accent, side: DoubleSide, transparent: true, opacity: 0.9 }),
  );
  lens.position.set(0, -0.38, -2.32);
  group.add(lens);

  // 5. Wingtip stealth navigation emitter beacons
  const beaconMat = new MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.9 });
  const beaconL = new Mesh(new SphereGeometry(0.14, 8, 8), beaconMat);
  beaconL.position.set(-5.4, 0.05, 2.8);
  const beaconR = beaconL.clone();
  beaconR.position.x = 5.4;
  group.add(beaconL, beaconR);

  // 6. Recessed center stealth exhaust slot
  const exhaustSlot = new Mesh(new BoxGeometry(1.4, 0.24, 0.6), stealthSkin);
  exhaustSlot.position.set(0, 0.08, 2.2);
  group.add(exhaustSlot);

  const glow = exhaustGlow(accent, 0.32);
  glow.position.set(0, 0.08, 2.5);
  group.add(glow);

  return { group, exhaust: glow, tintable, kind: 'drone' };
}

/** Fictional interceptor: long needle fuselage, cranked delta, canards. */
export function createInterceptorModel(accent = 0x00f0ff): AircraftModel {
  const group = new Group();
  const tintable: Mesh[] = [];

  const bodyMat = standardBody(0x06231f, accent);
  const fuselage = new Mesh(new CylinderGeometry(0.42, 0.55, 8.2, 6), bodyMat);
  fuselage.rotation.x = Math.PI / 2;
  group.add(fuselage);
  tintable.push(fuselage);

  const nose = new Mesh(new ConeGeometry(0.42, 3.2, 6), bodyMat);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -5.6;
  group.add(nose);
  tintable.push(nose);

  const canards = new Mesh(sweptWing3DGeometry(3.2, 1.0, 0.4, 0.5, 0.16, 0.08), bodyMat);
  canards.position.set(0, 0.1, -2.4);
  group.add(canards);
  tintable.push(canards);

  const deltas = new Mesh(sweptWing3DGeometry(6.2, 3.0, 1.0, 1.8, 0.24, 0.1), bodyMat);
  deltas.position.z = 1.0;
  group.add(deltas);
  tintable.push(deltas);

  const finL = new Mesh(new BoxGeometry(0.1, 1.0, 1.3), bodyMat);
  finL.position.set(-0.55, 0.6, 2.6);
  finL.rotation.z = 0.4;
  group.add(finL);
  tintable.push(finL);
  const finR = finL.clone();
  finR.position.x = 0.55;
  finR.rotation.z = -0.4;
  group.add(finR);
  tintable.push(finR);

  const glow = exhaustGlow(accent, 0.4);
  glow.position.set(0, 0, 4.3);
  group.add(glow);

  const light = new PointLight(accent, 6, 40, 2);
  light.position.set(0, 0, 4.2);
  group.add(light);

  return { group, exhaust: glow, tintable, kind: 'interceptor' };
}

/** Civil transport: tube fuselage, straight low wing, single tail fin. */
export function createCivilModel(accent = 0x4ade80): AircraftModel {
  const group = new Group();
  const tintable: Mesh[] = [];

  const bodyMat = standardBody(BODY_DARK, accent);
  const fuselage = new Mesh(new CylinderGeometry(0.6, 0.8, 12.0, 12), bodyMat);
  fuselage.rotation.x = Math.PI / 2;
  group.add(fuselage);
  tintable.push(fuselage);

  const nose = new Mesh(new SphereGeometry(0.8, 8, 6), bodyMat);
  nose.position.z = -4.0;
  group.add(nose);
  tintable.push(nose);

  const wings = new Mesh(sweptWing3DGeometry(16.0, 3.6, 1.4, 0.9, 0.36, 0.14), bodyMat);
  wings.position.set(0, -0.5, 0.6);
  group.add(wings);
  tintable.push(wings);

  const fin = new Mesh(new BoxGeometry(0.24, 2.8, 2.8), bodyMat);
  fin.position.set(0, 1.4, 4.7);
  group.add(fin);
  tintable.push(fin);

  const tailplane = new Mesh(new BoxGeometry(6.0, 0.6, 1.8), bodyMat);
  tailplane.position.set(0, 0.7, 5.7);
  group.add(tailplane);
  tintable.push(tailplane);

  const glow = exhaustGlow(accent, 0.4);
  glow.position.set(0, 0, 6.1);
  group.add(glow);

  return { group, exhaust: glow, tintable, kind: 'civil' };
}

/** Ground sensor / radar station: pad, mast, slowly rotating sweep bar. */
export interface SensorStation extends AircraftModel {
  rotor: Group;
}

export function createSensorStation(accent = 0x00f0ff): SensorStation {
  const group = new Group();
  const tintable: Mesh[] = [];

  const baseMat = standardBody(0x0a1512, 0x0b2b26);
  const pad = new Mesh(new CylinderGeometry(2.6, 3.2, 0.8, 8), baseMat);
  pad.position.y = 0.4;
  group.add(pad);
  tintable.push(pad);

  const cab = new Mesh(new BoxGeometry(2.0, 1.4, 2.0), baseMat);
  cab.position.y = 1.5;
  group.add(cab);
  tintable.push(cab);

  const mast = new Mesh(new CylinderGeometry(0.16, 0.22, 4.0, 6), baseMat);
  mast.position.y = 4.2;
  group.add(mast);
  tintable.push(mast);

  const rotor = new Group();
  rotor.position.y = 6.3;
  const bar = new Mesh(
    new BoxGeometry(4.6, 0.18, 0.5),
    new MeshStandardMaterial({ color: 0x10201c, emissive: accent, emissiveIntensity: 0.5, flatShading: true }),
  );
  rotor.add(bar);
  const dish = new Mesh(
    new TorusGeometry(0.9, 0.12, 6, 12, Math.PI),
    new MeshStandardMaterial({ color: 0x132722, emissive: accent, emissiveIntensity: 0.35, side: DoubleSide, flatShading: true }),
  );
  dish.rotation.x = Math.PI / 2;
  dish.position.y = 0.4;
  rotor.add(dish);
  group.add(rotor);
  // rotor is a Group; tintable holds Mesh instances; tintable can remain empty for sensor stations

  const beacon = exhaustGlow(accent, 0.28);
  beacon.position.y = 7.2;
  group.add(beacon);

  return { group, exhaust: beacon, rotor, tintable, kind: 'sensor' };
}

export function createModelForKind(kind: ModelKind, accent?: number): AircraftModel {
  switch (kind) {
    case 'fighter':
      return createFighterModel(accent);
    case 'drone':
      return createDroneModel(accent);
    case 'interceptor':
      return createInterceptorModel(accent);
    case 'sensor':
      return createSensorStation(accent);
    case 'civil':
    default:
      return createCivilModel(accent);
  }
}

/** Recolour a model's tintable meshes toward a status colour. */
export function tintModel(model: AircraftModel, color: Color): void {
  for (const mesh of model.tintable) {
    const mat = mesh.material as MeshStandardMaterial;
    if (mat.emissive) {
      mat.emissive.copy(color);
    }
  }
}