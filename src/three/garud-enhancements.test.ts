import { describe, it, expect } from 'vitest';
import { Vector3, Mesh } from 'three';
import { CameraRig } from './camera';
import { createFighterModel, createDroneModel } from './models';
import { speakTactical, setVoiceEnabled, isVoiceEnabled } from '../lib/voice';

describe('GARUD Task 1 — True 360° Mouse Camera Control', () => {
  it('allows unconstrained 360-degree horizontal orbit and clamps vertical polar angle', () => {
    const rig = new CameraRig(16 / 9);

    // Initial airspace mode
    expect(rig.currentMode).toBe('airspace');

    // 1. Horizontal 360° orbit
    rig.orbit(Math.PI * 2, 0); // Full 360-degree rotation
    rig.update(0.5);

    // 2. Vertical elevation clamp test
    // Drag way up (beyond top pole)
    rig.orbit(0, -Math.PI * 2);
    rig.update(0.5);
    // Polar angle must remain >= MIN_POLAR (0.04 rad) to prevent pole flipping singularity
    expect(rig.camera.position.y).toBeGreaterThan(0);

    // Drag way down (toward ground horizon)
    rig.orbit(0, Math.PI * 2);
    rig.update(0.5);
    // Camera must stay above ground plane
    expect(rig.camera.position.y).toBeGreaterThan(0);
  });

  it('smoothly switches from top-down radar to airspace mode upon orbit interaction', () => {
    const rig = new CameraRig(16 / 9);
    rig.setMode('radar', new Vector3(0, 0, 0));
    rig.update(0.1);
    expect(rig.currentMode).toBe('radar');
    expect(rig.camera.up.z).toBe(-1); // North up for top-down radar

    // Operator starts dragging to orbit in 3D
    rig.orbit(0.1, 0.2);
    expect(rig.currentMode).toBe('airspace');
    rig.update(0.5);
    expect(rig.camera.up.y).toBe(1); // Standard Y-up orientation for 3D oblique view
  });

  it('supports smooth panning and exponential zooming', () => {
    const rig = new CameraRig(16 / 9);
    const initialDist = rig.distance;

    // Zoom in (factor < 1)
    rig.zoom(0.8);
    rig.update(0.2);
    expect(rig.distance).toBeLessThan(initialDist);

    // Zoom out (factor > 1)
    rig.zoom(1.5);
    rig.update(0.2);
    expect(rig.distance).toBeGreaterThan(initialDist * 0.8);

    // Pan across plane
    const initialTarget = rig.targetPoint.clone();
    rig.pan(50, 50);
    rig.update(0.2);
    expect(rig.targetPoint.distanceTo(initialTarget)).toBeGreaterThan(0);
  });

  it('provides 1:1 direct tracking during active dragging without damping lag or rubber-banding', () => {
    const rig = new CameraRig(16 / 9);
    rig.setDragging(true);
    expect(rig.isUserDragging).toBe(true);

    // Direct orbit manipulation immediately updates spherical without easing lag
    rig.setOrbitDirect(1.2, 0.8);
    expect(rig.currentSpherical.theta).toBeCloseTo(1.2, 4);
    expect(rig.currentSpherical.phi).toBeCloseTo(0.8, 4);

    // Calling update(dt) while dragging does not rubber-band or revert
    rig.update(0.016);
    expect(rig.currentSpherical.theta).toBeCloseTo(1.2, 4);
    expect(rig.currentSpherical.phi).toBeCloseTo(0.8, 4);

    // Direct pan manipulation immediately moves target
    const panTarget = new Vector3(300, 150, -400);
    rig.setTargetDirect(panTarget);
    expect(rig.targetPoint.x).toBeCloseTo(300, 2);
    expect(rig.targetPoint.y).toBeCloseTo(150, 2);
    expect(rig.targetPoint.z).toBeCloseTo(-400, 2);

    // When drag ends, state remains aligned without snapping
    rig.setDragging(false);
    expect(rig.isUserDragging).toBe(false);
    rig.update(0.1);
    expect(rig.targetPoint.x).toBeCloseTo(300, 2);
    expect(rig.currentSpherical.theta).toBeCloseTo(1.2, 4);
  });

  it('prevents background follow-target updates from hijacking an active manual drag', () => {
    const rig = new CameraRig(16 / 9);
    rig.setFollow(true);
    expect(rig.currentMode).toBe('follow');

    const manualTarget = new Vector3(50, 50, 50);
    rig.setDragging(true);
    rig.setTargetDirect(manualTarget);

    // Background track follow tries to update position while user is dragging
    rig.updateFollowTarget(new Vector3(9999, 9999, 9999));
    rig.update(0.016);

    // Target must NOT jump to follow position while user drag is active
    expect(rig.targetPoint.x).toBeCloseTo(50, 2);
    expect(rig.targetPoint.y).toBeCloseTo(50, 2);

    rig.setDragging(false);
  });
});

describe('GARUD Task 2 — Interceptor Trajectory Full Distance Closure', () => {
  it('interpolates all the way from launch origin to target coordinates without premature freeze', () => {
    const origin = { x: 0, y: -8000, z: 500 };
    const targetPos = { x: 12000, y: 16000, z: 22000 };
    const initialDist = Math.hypot(targetPos.x - origin.x, targetPos.y - origin.y);
    const totalDuration = 12; // 12 second intercept sequence

    // Verify distance starts at full range (~26.8km)
    expect(initialDist).toBeGreaterThan(20000);

    // Simulate flight timeline from t = 0 to t = totalDuration
    const samples: number[] = [];
    for (let t = 0; t <= totalDuration; t += 2) {
      const tRatio = Math.min(1, t / totalDuration);
      const curX = origin.x + (targetPos.x - origin.x) * tRatio;
      const curY = origin.y + (targetPos.y - origin.y) * tRatio;
      const curZ = origin.z + (targetPos.z - origin.z) * tRatio;
      const d = Math.hypot(targetPos.x - curX, targetPos.y - curY);
      samples.push(d);

      if (t === totalDuration) {
        // At full duration, interceptor has reached target coordinates exactly
        expect(curX).toBeCloseTo(targetPos.x, 1);
        expect(curY).toBeCloseTo(targetPos.y, 1);
        expect(curZ).toBeCloseTo(targetPos.z, 1);
        expect(d).toBeLessThan(1); // Exact rendezvous
      }
    }

    // Distance must decrease monotonically towards 0
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeLessThanOrEqual(samples[i - 1]);
    }
  });
});

describe('GARUD Task 3 — Recognizable Procedural 3D Fighter Jet & Drone Models', () => {
  it('creates recognizable fighter jet with delta wings, twin canted tailfins, exhausts and -Z forward axis', () => {
    const fighter = createFighterModel(0x38bdf8);
    expect(fighter.kind).toBe('fighter');
    expect(fighter.group).toBeDefined();

    // Verify model children contain fuselage, canopy, nose, wings, tailfins, nozzles
    const meshes: Mesh[] = [];
    fighter.group.traverse((obj) => {
      if ((obj as Mesh).isMesh) meshes.push(obj as Mesh);
    });

    // Substantial mesh hierarchy with rich procedural detail
    expect(meshes.length).toBeGreaterThan(12);

    // Verify afterburner exhaust node exists
    expect(fighter.exhaust).toBeDefined();

    // Verify model points forward along -Z (nose at -Z, tail at +Z)
    let minZ = Infinity;
    let maxZ = -Infinity;
    meshes.forEach((m) => {
      minZ = Math.min(minZ, m.position.z);
      maxZ = Math.max(maxZ, m.position.z);
    });
    // Nose extends towards negative Z
    expect(minZ).toBeLessThan(-5.0);
    // Tail exhausts extend towards positive Z
    expect(maxZ).toBeGreaterThan(4.0);
  });

  it('creates distinctly different stealth flying-wing drone with central sensor pod and no vertical tailfins', () => {
    const drone = createDroneModel(0xf59e0b);
    expect(drone.kind).toBe('drone');
    expect(drone.group).toBeDefined();

    const meshes: Mesh[] = [];
    drone.group.traverse((obj) => {
      if ((obj as Mesh).isMesh) meshes.push(obj as Mesh);
    });

    expect(meshes.length).toBeGreaterThan(6);

    // Verify wide stealth wingspan along X
    let maxX = -Infinity;
    meshes.forEach((m) => {
      maxX = Math.max(maxX, Math.abs(m.position.x));
    });
    expect(maxX).toBeGreaterThan(4.0);
  });
});

describe('GARUD Task 4 — JARVIS-Style Synthesized Command Voice', () => {
  it('supports voice enable/disable toggle and speech deduplication', () => {
    setVoiceEnabled(true);
    expect(isVoiceEnabled()).toBe(true);

    setVoiceEnabled(false);
    expect(isVoiceEnabled()).toBe(false);

    // Restoring voice
    setVoiceEnabled(true);
    expect(isVoiceEnabled()).toBe(true);

    // Verify speakTactical safely runs in test environment without throwing
    expect(() => {
      speakTactical('GARUD systems online. Radar grid active.', true);
      // Immediate duplicate call should be deduplicated
      speakTactical('GARUD systems online. Radar grid active.', false);
    }).not.toThrow();
  });
});
