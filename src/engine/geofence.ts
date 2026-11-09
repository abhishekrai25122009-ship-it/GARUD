// Protected-zone geometry. Zone is a circle with an altitude floor/ceiling.
// All inputs are local metres.

import type { Vec3 } from './types';
import { horizontalDist } from './math';

export interface Zone {
  id: string;
  name: string;
  centre: { x: number; y: number };
  radius: number; // metres, horizontal
  floor: number; // altitude metres
  ceiling: number; // altitude metres
}

export function horizontalInZone(pos: Vec3, zone: Zone): boolean {
  return horizontalDist(pos, { x: zone.centre.x, y: zone.centre.y, z: 0 }) <= zone.radius;
}

export function verticalInBand(z: number, zone: Zone): boolean {
  return z >= zone.floor && z <= zone.ceiling;
}

export function inZone(pos: Vec3, zone: Zone): boolean {
  return horizontalInZone(pos, zone) && verticalInBand(pos.z, zone);
}

// Earliest forecast point that lies inside the zone. Returns the sim time of
// entry, or null when no forecast point enters. If already inside, returns
// the current time (caller may special-case "already inside").
export function projectedEntry(
  positions: Vec3[],
  times: number[],
  zone: Zone,
): number | null {
  for (let i = 0; i < positions.length; i++) {
    if (inZone(positions[i], zone)) return times[i];
  }
  return null;
}
