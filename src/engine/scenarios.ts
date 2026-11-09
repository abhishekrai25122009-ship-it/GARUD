// Four initial scenarios. All times are simulation seconds. Tracks are
// synthetic; every facility and zone is fictional.

import type { TrackDef, Scenario } from './types';

function track(
  id: string,
  callsign: string,
  auth: 'authorized' | 'unknown',
  registry: string,
  pos: { x: number; y: number; z: number },
  heading: number,
  speed: number,
  overrides?: Partial<TrackDef>,
): TrackDef {
  return {
    id,
    callsign,
    auth,
    registry,
    pos: { ...pos, z: pos.z ?? 1200 },
    heading,
    speed,
    ...overrides,
  };
}

function routineTrack(
  id: string,
  callsign: string,
  pos: { x: number; y: number; z: number },
  heading: number,
  speed: number,
): TrackDef {
  return track(id, callsign, 'authorized', 'On file — scheduled VFR flight', pos, heading, speed);
}

const BACKGROUND: TrackDef[] = [
  routineTrack('t-1', 'N722GA', { x: -2400, y: -900, z: 1500 }, 70, 52),
  routineTrack('t-2', 'N881KA', { x: -1200, y: 1400, z: 1800 }, 110, 48),
  routineTrack('t-3', 'N904MA', { x: 400, y: -2200, z: 1600 }, 20, 55),
  routineTrack('t-4', 'N117PA', { x: 1600, y: 700, z: 1400 }, 290, 50),
  routineTrack('t-5', 'N440SA', { x: -800, y: 2600, z: 1700 }, 300, 46),
  routineTrack('t-6', 'N563JA', { x: 2500, y: -1800, z: 1500 }, 180, 53),
];

// From (-1800, -600) toward the zone centre (600, 0): heading ≈ 76°.
const UNID = track(
  't-7',
  'UNID-07',
  'unknown',
  'Not listed in fictional registry',
  { x: -1800, y: -600, z: 1100 },
  76,
  60,
);

export const SCENARIOS: Scenario[] = [
  {
    id: 'routine',
    name: 'Routine traffic',
    short: 'All authorized, no intrusion',
    description:
      'Six authorized civil tracks in the vicinity of the fictional test area. ' +
      'No protected-zone intrusion is expected.',
    tracks: [...BACKGROUND],
  },
  {
    id: 'boundary',
    name: 'Boundary approach',
    short: 'Unknown track enters the protected zone',
    description:
      'One unidentified track heads straight for the fictional protected zone. ' +
      'The forecast computes a warning before actual entry.',
    tracks: [...BACKGROUND.slice(0, 5), UNID],
  },
  {
    id: 'course',
    name: 'Course change',
    short: 'Approaching track turns away',
    description:
      'An unidentified track approaches the zone, then turns away before ' +
      'entering. The forecast responds to observations and the warning resolves.',
    tracks: [
      ...BACKGROUND.slice(0, 5),
      track(
        't-7',
        'UNID-07',
        'unknown',
        'Not listed in fictional registry',
        { x: -1800, y: -600, z: 1100 },
        76,
        60,
        {
          events: [
            // At t=12 turn hard away from the zone.
            { t: 12, heading: 250, speed: 55 },
          ],
        },
      ),
    ],
  },
  {
    id: 'loss',
    name: 'Signal loss',
    short: 'Track drops out then recovers',
    description:
      'One track stops emitting telemetry, goes stale then lost, and ' +
      'later recovers. Forecasts expire while contact is lost.',
    tracks: [
      ...BACKGROUND.slice(0, 5),
      track(
        't-7',
        'UNID-07',
        'unknown',
        'Not listed in fictional registry',
        { x: -1400, y: -400, z: 1100 },
        76,
        60,
        {
          lossWindows: [{ tStart: 6, tEnd: 24 }],
        },
      ),
    ],
  },
];

export function scenarioById(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

export function defaultScenario(): Scenario {
  return SCENARIOS[0];
}

export const PROTECTED_ZONE = {
  id: 'zone-1',
  name: 'Protected Zone Alpha',
  centre: { x: 600, y: 0 },
  radius: 600,
  floor: 0,
  ceiling: 3000,
  // Warning buffer ring, represented in this configuration only.
  bufferRadius: 900,
};
