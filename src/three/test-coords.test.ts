import { describe, it, expect } from 'vitest';
import { PROTECTED_ZONE } from '../engine/scenarios';
import { simPointToWorld } from './coords';
import { CameraRig } from './camera';
import { Box3, Vector3, Sphere } from 'three';

describe('Three.js coordinates and camera test', () => {
  it('calculates world coordinates correctly', () => {
    const p1 = simPointToWorld({ x: 0, y: 0, z: 0 });
    console.log('Origin world:', p1);
    expect(p1.x).toBe(0);
    expect(p1.y).toBe(0);
    expect(p1.z).toBe(0);

    const pZone = simPointToWorld({ x: PROTECTED_ZONE.centre.x, y: PROTECTED_ZONE.centre.y, z: PROTECTED_ZONE.ceiling });
    console.log('Zone world:', pZone);
  });

  it('tests CameraRig radar mode vs fitSphere', () => {
    const rig = new CameraRig(800 / 600);
    console.log('Initial rig camera position:', rig.camera.position);

    rig.setMode('radar', new Vector3(120, 0, 0));
    rig.update(0.1);
    console.log('Radar mode camera position:', rig.camera.position);
    console.log('Radar mode camera up:', rig.camera.up);

    // Now test what fitSphere does
    const box = new Box3();
    box.expandByPoint(new Vector3(120, 300, 0));
    box.expandByPoint(new Vector3(0, 0, 1600)); // interceptor base
    const sphere = box.getBoundingSphere(new Sphere());
    console.log('Sphere center:', sphere.center, 'radius:', sphere.radius);
    rig.fitSphere(sphere.center, sphere.radius);
    rig.update(0.1);
    console.log('After fitSphere camera position:', rig.camera.position);
    console.log('After fitSphere camera target:', rig.targetPoint);
  });
});
