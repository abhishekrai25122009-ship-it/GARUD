// Deterministic single-loop simulation for GARUD.
// Fixed 0.1 s steps, seeded randomness, one loop owner with cleanup.
// All geometry is in local metres (x east, y north, z altitude).
// Latitude/longitude conversion happens only in the display adapter.

import type {
  Alert,
  ForecastSample,
  Observation,
  SimEvent,
  SimMetrics,
  SimReport,
  TrackDef,
  TrackSnapshot,
  Vec3,
} from './types';
import {
  STEP,
  OBS_INTERVAL,
  FORECAST_HORIZON,
  FORECAST_STEP,
  STALE_S,
  LOST_S,
  RESOLVE_CLEAR_S,
  ESTIMATE_WINDOW_S,
} from './types';
import { inZone, projectedEntry, type Zone } from './geofence';
import { createRNG, randRange, velFromHeading, horizontalDist } from './math';
import { estimateVelocity, constantVelocityForecast, speedFromVel } from './forecast';
import { SCENARIOS, PROTECTED_ZONE, scenarioById } from './scenarios';
import { AlertManager, alertId, type AlertManagerOptions, type AlertCondition } from './alerts';

const DEFAULT_SEED = 20240101;
const BUILD = '01';
const LABEL = 'GARUD / BUILD 01';

function nowPerf(): number {
  return typeof performance !== 'undefined' ? performance.now() : 0;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function validObservation(o: Observation): boolean {
  return (
    isFiniteNumber(o.t) &&
    isFiniteNumber(o.arrival) &&
    isFiniteNumber(o.x) &&
    isFiniteNumber(o.y) &&
    isFiniteNumber(o.z)
  );
}

// ---- Internal track state ----

interface TrackState {
  def: TrackDef;
  pos: Vec3; // synthetic truth position
  vel: { vx: number; vy: number; vz: number };
  heading: number;
  speed: number;
  observations: Observation[];
  lastObsT: number | null;
  appliedEvents: Set<number>;
  inLossWindow: boolean;
  obsClock: number; // next observation measurement time
  acquired: boolean;
  zoneEnteredAt: number | null; // first time truth entered zone
}

// ---- Simulation ----

export class Sim {
  private time = 0;
  private paused = true;
  private speedMultiplier: 1 | 2 | 4 = 1;
  private scenario: ScenarioDef;
  private seed = DEFAULT_SEED;
  private rng: () => number;
  private obsAccum = 0;

  private tracks = new Map<string, TrackState>();
  private zones: Zone[] = [];
  private alertManager: AlertManager;

  private events: SimEvent[] = [];
  private maxEvents = 500;
  private forecastSamples: Array<ForecastSample & { trackId?: string }> = [];
  private interventions: Array<{ trackId: string; t: number; heading: number; speed: number }> = [];
  private notes: string[] = [];
  private incidents: Array<{ trackId: string; type: string; t: number; note: string }> = [];

  private customized = false;
  private warningLeadRecorded = new Set<string>();
  private warningLeadTime: number | null = null;

  private observers = new Set<(view: SimView) => void>();
  private raf: number | null = null;
  private realStart = 0;

  constructor(opts?: { seed?: number; scenarioId?: string }) {
    this.seed = opts?.seed ?? DEFAULT_SEED;
    this.rng = createRNG(this.seed);
    const scen = scenarioById(opts?.scenarioId ?? 'routine') ?? SCENARIOS[0];
    this.scenario = { ...scen, tracks: scen.tracks.map((t) => ({ ...t })) };
    this.zones = [wrapZone(PROTECTED_ZONE)];
    const optsMgr: AlertManagerOptions = {
      onEvent: (ev) => this.logEvent(ev),
      now: () => this.time,
    };
    this.alertManager = new AlertManager(optsMgr);
    this.reset(false);
  }

  // ---- Lifecycle ----

  start(): void {
    if (!this.paused) return;
    this.paused = false;
    this.realStart = typeof performance !== 'undefined' ? performance.now() : 0;
    this.schedule();
    this.logEvent({
      t: this.time,
      realT: nowPerf(),
      type: 'scenario',
      trackId: null,
      message: `Scenario "${this.scenario.name}" started`,
    });
    this.notify();
  }

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    if (this.raf !== null) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }
    this.notify();
  }

  toggle(): void {
    if (this.paused) this.start(); else this.pause();
  }

  dispose(): void {
    this.pause();
    this.observers.clear();
  }

  setSpeed(multiplier: 1 | 2 | 4): void {
    this.speedMultiplier = multiplier;
    this.notify();
  }

  // ---- Scenario / reset ----

  setScenario(scenarioId: string): void {
    const wasPaused = this.paused;
    if (!wasPaused) this.pause();
    const scen = scenarioById(scenarioId) ?? SCENARIOS[0];
    this.scenario = { ...scen, tracks: scen.tracks.map((t) => ({ ...t })) };
    this.customized = false;
    this.warningLeadRecorded = new Set();
    this.warningLeadTime = null;
    this.forecastSamples = [];
    this.reset(true);
    if (!wasPaused) this.start();
  }

  resetScenario(): void {
    const paused = this.paused;
    if (!paused) this.pause();
    this.reset(true);
    if (!paused) this.start();
  }

  private reset(clearLog = true): void {
    this.time = 0;
    this.obsAccum = 0;
    this.tracks.clear();
    this.alertManager = new AlertManager({
      onEvent: (ev) => this.logEvent(ev),
      now: () => this.time,
    });
    this.events = [];
    if (clearLog) {
      this.forecastSamples = [];
      this.notes = [];
      this.incidents = [];
      this.interventions = [];
    }
    this.customized = false;
    this.warningLeadRecorded = new Set();
    this.warningLeadTime = null;

    for (const def of this.scenario.tracks) {
      const { vx, vy } = velFromHeading(def.heading, def.speed);
      const state: TrackState = {
        def,
        pos: { ...def.pos },
        vel: { vx, vy, vz: 0 },
        heading: def.heading,
        speed: def.speed,
        observations: [],
        lastObsT: null,
        appliedEvents: new Set(),
        inLossWindow: false,
        obsClock: 0,
        acquired: false,
        zoneEnteredAt: null,
      };
      // Seed an initial observation so tracks start live and estimating.
      this.ingest(state, { t: 0, arrival: 0, x: def.pos.x, y: def.pos.y, z: def.pos.z });
      state.obsClock = OBS_INTERVAL;
      this.tracks.set(def.id, state);
    }

    this.notify();
  }

  // ---- Operator actions ----

  acknowledge(alertIdStr: string): boolean {
    return this.alertManager.acknowledge(alertIdStr);
  }

  addNote(trackId: string, note: string): void {
    this.notes.push(note);
    this.alertManager.addNote(trackId, note);
  }

  escalate(trackId: string): void {
    this.incidents.push({
      trackId,
      type: 'escalation',
      t: this.time,
      note: `Operator escalated track ${trackId} for supervisor review`,
    });
    this.alertManager.escalate(trackId);
  }

  // Optional intervention while paused: change a track's heading/speed.
  intervene(trackId: string, heading: number, speed: number): boolean {
    if (!this.paused) return false;
    const state = this.tracks.get(trackId);
    if (!state) return false;
    state.heading = heading;
    state.speed = speed;
    const { vx, vy } = velFromHeading(heading, speed);
    state.vel = { vx, vy, vz: state.vel.vz };
    this.interventions.push({ trackId, t: this.time, heading, speed });
    this.customized = true;
    this.logEvent({
      t: this.time,
      realT: nowPerf(),
      type: 'intervention',
      trackId,
      message: `Operator intervention: ${trackId} heading ${heading.toFixed(0)}°, ${speed.toFixed(0)} m/s`,
    });
    this.notify();
    return true;
  }

  // Simulated advisory for a selected synthetic track (local scenario event only).
  simulateAdvisory(trackId: string, acknowledged: boolean): void {
    const state = this.tracks.get(trackId);
    if (!state) return;
    this.logEvent({
      t: this.time,
      realT: nowPerf(),
      type: 'advisory',
      trackId,
      message: `Simulated advisory sent to ${trackId}: ${acknowledged ? 'acknowledged' : 'no response'} (local scenario event, not real communication)`,
    });
    if (!acknowledged) {
      this.incidents.push({
        trackId,
        type: 'advisory-no-response',
        t: this.time,
        note: `Track ${trackId} did not respond to simulated advisory`,
      });
    }
    this.notify();
  }

  // Public observation injector (for tests / malformed-record handling).
  ingestObservation(trackId: string, o: Observation): boolean {
    const state = this.tracks.get(trackId);
    if (!state) return false;
    return this.ingest(state, o);
  }

  private ingest(state: TrackState, o: Observation): boolean {
    if (!validObservation(o)) return false; // reject malformed
    if (state.lastObsT !== null && o.t <= state.lastObsT) return false; // duplicate / out-of-order
    state.observations.push(o);
    state.lastObsT = o.t;
    if (!state.acquired) {
      state.acquired = true;
      this.logEvent({
        t: o.t,
        realT: nowPerf(),
        type: 'acquired',
        trackId: state.def.id,
        message: `Track acquired: ${state.def.callsign} (${state.def.id})`,
      });
    }
    return true;
  }

  // ---- Fixed step ----

  // Public for testing only.
  stepForTest(dt: number): void {
    this.step(dt);
  }

  private step(dt: number): void {
    this.time += dt;
    this.obsAccum += dt;

    // Apply scheduled course-change events.
    for (const state of this.tracks.values()) {
      const events = state.def.events ?? [];
      for (const ev of events) {
        if (state.appliedEvents.has(ev.t)) continue;
        if (this.time >= ev.t - 1e-9) {
          state.heading = ev.heading;
          state.speed = ev.speed;
          const { vx, vy } = velFromHeading(ev.heading, ev.speed);
          state.vel = { vx, vy, vz: state.vel.vz };
          state.appliedEvents.add(ev.t);
          this.logEvent({
            t: this.time,
            realT: nowPerf(),
            type: 'scenario',
            trackId: state.def.id,
            message: `${state.def.callsign} scheduled course change at t=${ev.t.toFixed(0)}`,
          });
        }
      }
    }

    // Update loss-window membership and emit contact-lost/recovered transitions.
    for (const state of this.tracks.values()) {
      const windows = state.def.lossWindows ?? [];
      const inWindow = windows.some((w) => this.time >= w.tStart - 1e-9 && this.time <= w.tEnd + 1e-9);
      if (inWindow && !state.inLossWindow) {
        state.inLossWindow = true;
        this.logEvent({
          t: this.time,
          realT: nowPerf(),
          type: 'lost',
          trackId: state.def.id,
          message: `Telemetry lost: ${state.def.callsign}`,
        });
      }
      if (!inWindow && state.inLossWindow) {
        state.inLossWindow = false;
        this.logEvent({
          t: this.time,
          realT: nowPerf(),
          type: 'recovered',
          trackId: state.def.id,
          message: `Telemetry recovered: ${state.def.callsign}`,
        });
      }
    }

    // Move truth.
    for (const state of this.tracks.values()) {
      state.pos.x += state.vel.vx * dt;
      state.pos.y += state.vel.vy * dt;
      state.pos.z += state.vel.vz * dt;
    }

    // Emit observations at 1 Hz sim rate.
    while (this.obsAccum >= OBS_INTERVAL - 1e-9) {
      this.obsAccum -= OBS_INTERVAL;
      const measT = this._nextObsTime();
      for (const state of this.tracks.values()) {
        if (state.inLossWindow) continue;
        const obs: Observation = {
          t: measT,
          arrival: measT,
          x: state.pos.x + randRange(this.rng, -20, 20),
          y: state.pos.y + randRange(this.rng, -20, 20),
          z: state.pos.z + randRange(this.rng, -8, 8),
        };
        this.ingest(state, obs);
      }
    }

    this.evaluateAndAlert();
  }

  private obsGlobalClock = 0;
  private _nextObsTime(): number {
    this.obsGlobalClock += OBS_INTERVAL;
    return this.obsGlobalClock;
  }

  private evaluateAndAlert(): void {
    const conditions: Map<string, AlertCondition> = new Map();

    for (const state of this.tracks.values()) {
      const obs = state.observations;
      const last = obs.length ? obs[obs.length - 1] : null;
      const age = state.lastObsT === null ? null : this.time - state.lastObsT;
      let freshness: 'live' | 'stale' | 'lost' = 'live';
      if (age === null) freshness = 'stale';
      else if (age > LOST_S) freshness = 'lost';
      else if (age > STALE_S) freshness = 'stale';

      const est = estimateVelocity(obs, this.time, ESTIMATE_WINDOW_S);
      let extrapolating = false;
      let estVel: { vx: number; vy: number; vz: number } | null = null;
      let forecastState: 'estimating' | 'ready' | 'expired' = 'estimating';
      let estPos: Vec3 = { ...state.pos };

      if (freshness === 'lost') {
        forecastState = 'expired';
      } else if (est) {
        forecastState = 'ready';
        estVel = est;
        extrapolating = age !== null && age > 2;
        const base = last ? { ...last } : { ...state.pos };
        const dt = age === null ? 0 : age;
        estPos = {
          x: base.x + est.vx * dt,
          y: base.y + est.vy * dt,
          z: base.z + est.vz * dt,
        };
      }

      const { positions, times } = constantVelocityForecast(
        estPos,
        estVel ?? { vx: 0, vy: 0, vz: 0 },
        FORECAST_HORIZON,
        FORECAST_STEP,
      );
      const forecast = freshness === 'lost' ? [] : positions;
      const forecastTimes = freshness === 'lost' ? [] : times;

      const zone = this.zones[0];
      const inZ = inZone(estPos, zone);
      if (inZ && state.zoneEnteredAt === null) {
        state.zoneEnteredAt = this.time;
        this.recordWarningLead(state.def.id);
      }

      let projectedEntryT: number | null = null;
      if (!inZ && forecast.length) {
        projectedEntryT = projectedEntry(forecast, forecastTimes, zone);
      }

      // Metrics: record a 10 s forecast sample each second per track.
      if (forecastState === 'ready' && estVel) {
        const tRounded = Math.floor(this.time * 10) / 10;
        const dup = this.forecastSamples.some(
          (s) => (s.trackId ?? state.def.id) === state.def.id && Math.abs(s.t - tRounded) < 1e-6,
        );
        if (!dup) {
          this.forecastSamples.push({
            trackId: state.def.id,
            t: tRounded,
            targetT: tRounded + 10,
            forecast: {
              x: estPos.x + estVel.vx * 10,
              y: estPos.y + estVel.vy * 10,
              z: estPos.z + estVel.vz * 10,
            },
          });
        }
        for (const s of this.forecastSamples) {
          if (s.trackId !== state.def.id || s.error !== undefined) continue;
          if (s.targetT <= this.time + 1e-6) {
            const actual = { ...state.pos }; // approximation at target time
            s.error = horizontalDist(s.forecast, actual);
            s.actual = actual;
          }
        }
      }

      const condReasons: string[] = [];
      let intrusionActive = false;
      let lead: number | null = null;
      if (projectedEntryT !== null) lead = projectedEntryT - this.time;
      if (inZ) {
        intrusionActive = true;
        condReasons.push(`Currently inside ${zone.name}`);
      } else if (projectedEntryT !== null) {
        intrusionActive = true;
        condReasons.push(`Projected to enter ${zone.name} in ${lead!.toFixed(0)} s`);
      }
      if (state.def.auth === 'unknown') {
        condReasons.push('Authorization not on file (not indicative of hostility)');
      }
      if (intrusionActive) {
        conditions.set(alertId(state.def.id, 'intrusion'), {
          rule: 'intrusion',
          active: true,
          severity: this.severityForLead(lead),
          projectedEntryT,
          reasons: condReasons,
          uncertain: extrapolating || freshness === 'stale',
        });
      }

      if (freshness === 'lost') {
        conditions.set(alertId(state.def.id, 'lostContact'), {
          rule: 'lostContact',
          active: true,
          severity: 'warning',
          projectedEntryT: null,
          reasons: [`No telemetry for ${age!.toFixed(0)} s — position uncertain`],
          uncertain: true,
        });
      } else if (freshness === 'stale') {
        conditions.set(alertId(state.def.id, 'staleContact'), {
          rule: 'staleContact',
          active: true,
          severity: 'info',
          projectedEntryT: null,
          reasons: [`Telemetry aging: ${age!.toFixed(0)} s since last measurement`],
          uncertain: false,
        });
      }

      if (state.def.auth === 'unknown' && !intrusionActive) {
        conditions.set(alertId(state.def.id, 'unknownAuth'), {
          rule: 'unknownAuth',
          active: true,
          severity: 'info',
          projectedEntryT: null,
          reasons: ['Authorization not on file — treat as unidentified, not hostile'],
          uncertain: false,
        });
      }
    }

    this.alertManager.evaluate(conditions);
  }

  private severityForLead(lead: number | null): 'info' | 'warning' | 'critical' {
    if (lead === null) return 'warning';
    return lead < 10 ? 'critical' : 'warning';
  }

  private recordWarningLead(trackId: string): void {
    if (this.warningLeadRecorded.has(trackId)) return;
    let earliest: number | null = null;
    for (const a of this.alertManager.all) {
      if (a.trackId !== trackId || a.rule !== 'intrusion') continue;
      if (earliest === null || a.raisedT < earliest) earliest = a.raisedT;
    }
    if (earliest !== null && earliest < this.time) {
      this.warningLeadTime = this.time - earliest;
      this.warningLeadRecorded.add(trackId);
    }
  }

  private logEvent(ev: SimEvent): void {
    this.events.push(ev);
    if (this.events.length > this.maxEvents) this.events = this.events.slice(-this.maxEvents);
  }

  get recentEvents(): SimEvent[] {
    return [...this.events].slice(-60);
  }

  // ---- Metrics ----

  get metrics(): SimMetrics {
    const scored = this.forecastSamples.filter((s) => s.error !== undefined);
    const meanError =
      scored.length > 0
        ? scored.reduce((sum, s) => sum + (s.error ?? 0), 0) / scored.length
        : null;
    return {
      forecast10sMeanError: meanError,
      scoredSamples: scored.length,
      warningLeadTime: this.warningLeadTime,
    };
  }

  // ---- Snapshot ----

  get view(): SimView {
    const tracks: TrackSnapshot[] = [];
    for (const state of this.tracks.values()) {
      const obs = state.observations;
      const last = obs.length ? obs[obs.length - 1] : null;
      const age = state.lastObsT === null ? null : this.time - state.lastObsT;
      let freshness: 'live' | 'stale' | 'lost' = 'live';
      if (age === null) freshness = 'stale';
      else if (age > LOST_S) freshness = 'lost';
      else if (age > STALE_S) freshness = 'stale';

      const est = estimateVelocity(obs, this.time, ESTIMATE_WINDOW_S);
      let extrapolating = false;
      let estVel: { vx: number; vy: number; vz: number } | null = null;
      let forecastState: 'estimating' | 'ready' | 'expired' = 'estimating';
      let estPos: Vec3 = { ...state.pos };

      if (freshness === 'lost') {
        forecastState = 'expired';
      } else if (est) {
        forecastState = 'ready';
        estVel = est;
        extrapolating = age !== null && age > 2;
        const base = last ? { ...last } : { ...state.pos };
        const dt = age === null ? 0 : age;
        estPos = {
          x: base.x + est.vx * dt,
          y: base.y + est.vy * dt,
          z: base.z + est.vz * dt,
        };
      }

      const { positions, times } = constantVelocityForecast(
        estPos,
        estVel ?? { vx: 0, vy: 0, vz: 0 },
        FORECAST_HORIZON,
        FORECAST_STEP,
      );
      const forecast = freshness === 'lost' ? [] : positions;
      const forecastTimes = freshness === 'lost' ? [] : times;

      const zone = this.zones[0];
      const inZ = inZone(estPos, zone);
      const vert = state.pos.z >= zone.floor && state.pos.z <= zone.ceiling;
      let projectedEntryT: number | null = null;
      if (!inZ && forecast.length) {
        projectedEntryT = projectedEntry(forecast, forecastTimes, zone);
      }

      const speed = speedFromVel(state.vel.vx, state.vel.vy);
      tracks.push({
        id: state.def.id,
        callsign: state.def.callsign,
        auth: state.def.auth,
        registry: state.def.registry,
        pos: { ...state.pos },
        vel: { x: state.vel.vx, y: state.vel.vy, z: state.vel.vz },
        heading: state.heading,
        speed,
        observations: obs,
        lastObservationT: state.lastObsT,
        freshness,
        age: age ?? 0,
        estVel: estVel ? { x: estVel.vx, y: estVel.vy, z: estVel.vz } : null,
        estPos,
        forecast,
        forecastT: forecastTimes,
        forecastState,
        extrapolating,
        inZone: inZ,
        verticalInBand: vert,
        projectedEntryT,
      });
    }

    tracks.sort((a, b) => (a.callsign < b.callsign ? -1 : a.callsign > b.callsign ? 1 : 0));

    return {
      time: this.time,
      paused: this.paused,
      speed: this.speedMultiplier,
      scenarioId: this.scenario.id,
      scenarioName: this.scenario.name,
      tracks,
      alerts: this.alertManager.active,
      events: this.recentEvents,
      metrics: this.metrics,
      customized: this.customized,
      seed: this.seed,
    };
  }

  subscribe(fn: (view: SimView) => void): () => void {
    this.observers.add(fn);
    fn(this.view);
    return () => this.observers.delete(fn);
  }

  private notify(): void {
    const v = this.view;
    for (const fn of this.observers) fn(v);
  }

  private schedule(): void {
    if (this.raf !== null) return;
    if (typeof requestAnimationFrame === 'undefined') return; // headless / test env
    const loop = () => {
      this.raf = null;
      if (this.paused) return;
      const now = typeof performance !== 'undefined' ? performance.now() : 0;
      const elapsed = (now - this.realStart) / 1000;
      let steps = Math.floor(elapsed * this.speedMultiplier / STEP);
      if (steps > 0) {
        steps = Math.min(steps, 200); // cap catch-up after tab hidden
        for (let i = 0; i < steps; i++) this.step(STEP);
        this.realStart = now;
        this.notify();
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  // ---- Report ----

  generateReport(): SimReport {
    return {
      label: LABEL,
      build: BUILD,
      scenario: this.scenario.name,
      seed: this.seed,
      duration: this.time,
      config: {
        step: STEP,
        obsInterval: OBS_INTERVAL,
        forecastHorizon: FORECAST_HORIZON,
        staleS: STALE_S,
        lostS: LOST_S,
        resolveClearS: RESOLVE_CLEAR_S,
        zone: this.zones[0],
      },
      incidents: [...this.incidents],
      notes: [...this.notes],
      interventions: [...this.interventions],
      metrics: this.metrics,
      limitations: [
        'Synthetic simulation only — no real sensors, AI, or live airspace data.',
        'Short-distance lat/lng approximation valid only near the demonstration origin.',
        'Forecasts assume constant velocity and degrade during manoeuvres.',
        'Unknown authorization is not treated as hostile.',
        'Alerts are rule-based advisory outputs for operator review only.',
      ],
      generatedAt: nowPerf(),
    };
  }
}

export interface SimView {
  time: number;
  paused: boolean;
  speed: 1 | 2 | 4;
  scenarioId: string;
  scenarioName: string;
  tracks: TrackSnapshot[];
  alerts: Alert[];
  events: SimEvent[];
  metrics: SimMetrics;
  customized: boolean;
  seed: number;
}

function wrapZone(o: {
  id: string;
  name: string;
  centre: { x: number; y: number };
  radius: number;
  floor: number;
  ceiling: number;
}): Zone {
  return {
    id: o.id,
    name: o.name,
    centre: o.centre,
    radius: o.radius,
    floor: o.floor,
    ceiling: o.ceiling,
  };
}

interface ScenarioDef {
  id: string;
  name: string;
  short: string;
  description: string;
  tracks: TrackDef[];
}

export type {
  Alert,
  SimEvent,
  SimMetrics,
  SimReport,
  TrackSnapshot,
  Vec3,
  Observation,
  TrackDef,
} from './types';
export type { Zone } from './geofence';
