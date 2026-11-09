// Display-adapter helpers: local metres <-> lat/lng for radar overlays.
// This is the ONLY place where latitude/longitude degrees are produced.
// All simulation geometry stays in metres (x east, y north).

import { metresToLatLng } from '../engine/math';

export const MAP_X_MIN = -3000;
export const MAP_X_MAX = 3400;
export const MAP_Y_MIN = -3000;
export const MAP_Y_MAX = 3400;

const SW = metresToLatLng(MAP_X_MIN, MAP_Y_MIN);
const NE = metresToLatLng(MAP_X_MAX, MAP_Y_MAX);

export const MAP_BOUNDS: [number[], number[]] = [[SW.lat, SW.lng], [NE.lat, NE.lng]];

export function metresToLatLngPoint(x: number, y: number): [number, number] {
  const { lat, lng } = metresToLatLng(x, y);
  return [lat, lng];
}

export const ZONE_POS = metresToLatLngPoint(600, 0);

export function formatTime(s: number | null): string {
  if (s === null || !Number.isFinite(s)) return '--:--';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export function formatSpeed(v: number): string {
  return `${Math.round(v)} m/s`;
}

export function formatAltitude(v: number): string {
  return `${Math.round(v)} ft`; // schematic display unit label, fictional
}

export function formatM(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return 'Awaiting samples';
  return `${v.toFixed(1)} m`;
}
