// Single source of truth for mapping simulation coordinates into the 3D
// scene. The simulation stays authoritative: it works in local metres
// (x east, y north, z altitude above ground). The 3D viewport renders in
// world units via ONE consistent transform used by models, trails,
// forecasts, zone geometry, labels and effects alike, so nothing can
// drift away from its tracked position.

// Metres -> world units. The scenario spans ~7 km around the protected
// zone plus an interceptor base at (0, -8000); 0.2 keeps the default
// camera framing comfortable without shrinking aircraft icons.
export const WORLD_SCALE = 0.2;

// Displayed altitude is linear with true altitude up to 4000 m (covers the
// protected-zone ceiling and every civil track). Exercise assets such as the
// interceptor scramble (22000) and VIPER jets (28000) carry illustrative
// display altitudes far above the zone; presenting those 1:1 would float them
// out of frame, so higher values are compressed. This is a *presentation*
// mapping only — labels always show the simulation's own values, and every
// consumer (model, trail, forecast, marker) uses the same function.
const LINEAR_CEILING_M = 4000;
const HIGH_ALT_COMPRESSION = 0.12;

export function displayAltitudeMetres(z: number): number {
  if (!Number.isFinite(z) || z <= 0) return 0;
  if (z <= LINEAR_CEILING_M) return z;
  return LINEAR_CEILING_M + (z - LINEAR_CEILING_M) * HIGH_ALT_COMPRESSION;
}

export interface WorldPoint {
  x: number;
  y: number;
  z: number;
}

// Simulation metres -> world units. World: +X east, +Y up, -Z north.
export function simPointToWorld(p: { x: number; y: number; z: number }): WorldPoint {
  return {
    x: p.x * WORLD_SCALE,
    y: displayAltitudeMetres(p.z) * WORLD_SCALE,
    // Adding 0 normalises IEEE-754 negative zero (0 * -WORLD_SCALE is -0),
    // which breaks strict coordinate equality for points on the origin.
    z: -p.y * WORLD_SCALE + 0,
  };
}

// Simulation heading (deg clockwise from north) -> Y-axis rotation in
// radians for models whose nose points along -Z at rest.
export function headingToYaw(headingDeg: number): number {
  return (-headingDeg * Math.PI) / 180;
}
