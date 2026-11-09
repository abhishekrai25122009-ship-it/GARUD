// Seeded randomness and small geometry helpers.
// Every deterministic draw in the simulation flows through the RNG below so
// a scenario reset with the same seed reproduces the same run.

import type { Vec3 } from './types';

// Arbitrary demonstration origin, away from real sensitive facilities.
// All short-distance lat/lng conversions use this origin.
export const ORIGIN = { lat: 38.5, lon: -98.5 };
export const METRES_PER_DEG_LAT = 111320;

export function createRNG(seed: number) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s >>> 0) / 4294967296; // [0, 1)
  };
}

export function randRange(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

export function randInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function normalizeHeading(deg: number): number {
  let h = ((deg % 360) + 360) % 360;
  return h;
}

// Horizontal distance in metres between two Vec3 positions (z ignored).
export function horizontalDist(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export function dist3(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

// Velocity (m/s) from heading (deg clockwise from north) and speed.
// x east, y north: heading 0 (north) => +y, heading 90 (east) => +x.
export function velFromHeading(headingDeg: number, speed: number): { vx: number; vy: number } {
  const h = ((headingDeg * Math.PI) / 180);
  return { vx: speed * Math.sin(h), vy: speed * Math.cos(h) };
}

// Heading (deg clockwise from north) from a velocity vector.
export function headingFromVel(vx: number, vy: number): number {
  if (vx === 0 && vy === 0) return 0;
  return normalizeHeading(((Math.atan2(vx, vy) * 180) / Math.PI) + 360);
}

// ---- Display adapter: metres <-> lat/lng (short-distance approximation) ----
// 1 degree of latitude ~= 111320 m; a degree of longitude scales by cos(lat).
// Valid only for short distances (a few tens of km) around ORIGIN. Never mix
// these degree values with metre-based geometry inside the engine.

export function metresToLatLng(
  x: number,
  y: number,
  origin: { lat: number; lon: number } = ORIGIN,
): { lat: number; lng: number } {
  const lat = origin.lat + y / METRES_PER_DEG_LAT;
  const lng =
    origin.lon +
    x / (METRES_PER_DEG_LAT * Math.cos((origin.lat * Math.PI) / 180));
  return { lat, lng };
}

export function latLngToMetres(
  lat: number,
  lng: number,
  origin: { lat: number; lon: number } = ORIGIN,
): { x: number; y: number } {
  const y = (lat - origin.lat) * METRES_PER_DEG_LAT;
  const x =
    (lng - origin.lon) * METRES_PER_DEG_LAT * Math.cos((origin.lat * Math.PI) / 180);
  return { x, y };
}

export function isFiniteVec(v: Vec3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}
