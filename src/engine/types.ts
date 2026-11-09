// Shared types and constants for the GARUD simulation.
// All geometry inside the engine is in local metres: x east, y north,
// z altitude above fictional flat ground. Latitude/longitude is only
// produced by the display adapter (see math.metresToLatLng) and is never
// mixed with metre-based geometry.

export const STEP = 0.1; // fixed simulation step, seconds
export const OBS_INTERVAL = 1.0; // nominal observation period, seconds
export const FORECAST_HORIZON = 20; // seconds
export const FORECAST_STEP = 0.5; // forecast sample spacing, seconds
export const STALE_S = 5; // seconds without observation -> stale
export const LOST_S = 15; // seconds without observation -> lost
export const RESOLVE_CLEAR_S = 6; // sustained clear seconds before an alert resolves
export const MIN_OBS_FOR_ESTIMATE = 2;
export const ESTIMATE_WINDOW_S = 8; // observation window used for velocity estimation

export const ORIGIN = { lat: 38.5, lon: -98.5 }; // arbitrary demonstration origin
export const METRES_PER_DEG_LAT = 111320; // short-distance approximation

export type TrackId = string;
export type Auth = 'authorized' | 'unknown';
export type Freshness = 'live' | 'stale' | 'lost';
export type ForecastState = 'estimating' | 'ready' | 'expired';
export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertRule =
  | 'intrusion'
  | 'zoneEntry'
  | 'lostContact'
  | 'staleContact'
  | 'unknownAuth';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
export interface Vec2 {
  x: number;
  y: number;
}

export interface Observation {
  t: number; // measurement time (sim seconds)
  arrival: number; // arrival time at console (sim seconds)
  x: number;
  y: number;
  z: number;
}

export interface TrackEvent {
  t: number; // sim time the event applies
  heading: number; // deg clockwise from north
  speed: number; // m/s
}

export interface TrackDef {
  id: TrackId;
  callsign: string;
  auth: Auth;
  registry: string; // fictional local registry basis
  pos: Vec3; // start position (metres)
  heading: number; // deg clockwise from north
  speed: number; // m/s
  events?: TrackEvent[]; // scheduled course changes
  lossWindows?: { tStart: number; tEnd: number }[]; // telemetry outage windows
}

export interface TrackSnapshot {
  id: TrackId;
  callsign: string;
  auth: Auth;
  registry: string;
  pos: Vec3;
  vel: Vec3;
  heading: number;
  speed: number;
  observations: Observation[];
  lastObservationT: number | null;
  freshness: Freshness;
  age: number; // seconds since latest observation
  estVel: Vec3 | null;
  estPos: Vec3;
  forecast: Vec3[]; // absolute positions (metres)
  forecastT: number[]; // sim times
  forecastState: ForecastState;
  extrapolating: boolean;
  inZone: boolean;
  verticalInBand: boolean;
  projectedEntryT: number | null; // sim time of projected zone entry
}

export interface Alert {
  id: string;
  trackId: TrackId;
  rule: AlertRule;
  severity: AlertSeverity;
  zone: string;
  projectedEntryT: number | null;
  auth: Auth;
  age: number;
  reasons: string[];
  acknowledged: boolean;
  resolved: boolean;
  raisedT: number;
  updatedT: number;
  uncertain: boolean; // true when loss of contact is involved
}

export interface SimEvent {
  t: number; // sim time
  realT: number; // performance.now()
  type:
    | 'acquired'
    | 'warning'
    | 'advisory'
    | 'acknowledgement'
    | 'lost'
    | 'recovered'
    | 'escalated'
    | 'intervention'
    | 'note'
    | 'scenario';
  trackId: TrackId | null;
  message: string;
}

export interface Scenario {
  id: string;
  name: string;
  short: string;
  description: string;
  tracks: TrackDef[];
}

export interface ForecastSample {
  t: number; // sim time the forecast was taken
  targetT: number; // t + 10
  forecast: Vec3;
  actual?: Vec3;
  error?: number;
}

export interface SimMetrics {
  forecast10sMeanError: number | null;
  scoredSamples: number;
  warningLeadTime: number | null; // seconds
}

export interface SimReport {
  label: string;
  build: string;
  scenario: string;
  seed: number;
  duration: number;
  config: Record<string, unknown>;
  incidents: Array<{ trackId: TrackId; type: string; t: number; note: string }>;
  notes: string[];
  interventions: Array<{ trackId: TrackId; t: number; heading: number; speed: number }>;
  metrics: SimMetrics;
  limitations: string[];
  generatedAt: number;
}
