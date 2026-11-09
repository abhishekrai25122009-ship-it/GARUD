// Constant-velocity forecasting and velocity estimation from observations.

import type { Observation, Vec3 } from './types';
import { headingFromVel } from './math';

// Least-squares constant-velocity fit over recent observations.
// Returns null when there are not enough usable observations.
export function estimateVelocity(
  observations: Observation[],
  now: number,
  windowS = 8,
): { vx: number; vy: number; vz: number } | null {
  const recent = observations.filter(
    (o) => Number.isFinite(o.t) && now - o.t <= windowS && o.t <= now + 1e-6,
  );
  if (recent.length < 2) return null;

  // Require at least two distinct timestamps.
  const distinct = new Set(recent.map((o) => o.t));
  if (distinct.size < 2) return null;

  recent.sort((a, b) => a.t - b.t);
  const t0 = recent[0].t;
  let sx = 0,
    sy = 0,
    sz = 0,
    st = 0,
    stt = 0,
    stx = 0,
    sty = 0,
    stz = 0;
  for (const o of recent) {
    const tt = o.t - t0;
    sx += o.x;
    sy += o.y;
    sz += o.z;
    st += tt;
    stt += tt * tt;
    stx += tt * o.x;
    sty += tt * o.y;
    stz += tt * o.z;
  }
  const n = recent.length;
  const denom = n * stt - st * st;
  if (denom === 0) return null;
  const vx = (n * stx - st * sx) / denom;
  const vy = (n * sty - st * sy) / denom;
  const vz = (n * stz - st * sz) / denom;
  return { vx, vy, vz };
}

// Constant-velocity forecast positions from a starting point.
export function constantVelocityForecast(
  start: Vec3,
  vel: { vx: number; vy: number; vz: number },
  horizon = 20,
  step = 0.5,
): { positions: Vec3[]; times: number[] } {
  const positions: Vec3[] = [];
  const times: number[] = [];
  for (let t = step; t <= horizon + 1e-9; t += step) {
    positions.push({
      x: start.x + vel.vx * t,
      y: start.y + vel.vy * t,
      z: start.z + vel.vz * t,
    });
    times.push(t);
  }
  return { positions, times };
}

export function speedFromVel(vx: number, vy: number): number {
  return Math.hypot(vx, vy);
}

export function trackHeading(vx: number, vy: number): number {
  return headingFromVel(vx, vy);
}
