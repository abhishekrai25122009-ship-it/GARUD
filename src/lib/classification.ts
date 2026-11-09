// Local, simulated track classification & detection-confidence helpers.
// Both are derived purely from existing TrackSnapshot fields (auth, freshness,
// observation history, extrapolation state). Nothing here is a real sensor
// measurement or an intelligence assessment — the labels describe the synthetic
// tracker's own data quality only.

import type { TrackSnapshot } from '../engine/sim';

export type TrackClassification = 'FRIENDLY SIMULATION' | 'UNIDENTIFIED' | 'UNKNOWN';

/**
 * Three-way simulated classification:
 * - FRIENDLY SIMULATION — transponder/flight-plan correlation verified locally.
 * - UNIDENTIFIED        — no verified correlation, but the synthetic feed is
 *                         still tracking the contact live.
 * - UNKNOWN             — no verified correlation AND the feed has no fresh
 *                         observation (stale/lost), so the tracker cannot even
 *                         confirm the contact's current state.
 */
export function classifyTrack(track: TrackSnapshot): TrackClassification {
  if (track.auth === 'authorized') return 'FRIENDLY SIMULATION';
  return track.freshness === 'live' ? 'UNIDENTIFIED' : 'UNKNOWN';
}

export function classificationShortLabel(cls: TrackClassification): string {
  if (cls === 'FRIENDLY SIMULATION') return 'FRND';
  if (cls === 'UNIDENTIFIED') return 'UNID';
  return 'UNK';
}

export function classificationKind(cls: TrackClassification): 'friendly' | 'unidentified' | 'unknown' {
  if (cls === 'FRIENDLY SIMULATION') return 'friendly';
  if (cls === 'UNIDENTIFIED') return 'unidentified';
  return 'unknown';
}

/**
 * Illustrative 0-100 detection-confidence score for display only.
 * Derived locally from signal freshness, observation count and whether the
 * position is currently extrapolated. It does not indicate threat, intent or
 * real sensor performance.
 */
export function detectionConfidence(track: TrackSnapshot): number {
  const freshBase =
    track.freshness === 'live' ? 0.72 : track.freshness === 'stale' ? 0.45 : 0.2;
  const observationBoost = Math.min(0.18, track.observations.length * 0.02);
  const extrapolationPenalty = track.extrapolating ? 0.15 : 0;
  const clamped = Math.max(0.05, Math.min(0.99, freshBase + observationBoost - extrapolationPenalty));
  return Math.round(clamped * 100);
}

export const CONFIDENCE_MEANING =
  'Simulated meaning: an illustrative score of how fresh and complete the synthetic track data is ' +
  '(signal freshness + observation count − extrapolation penalty). Higher = the local tracker holds ' +
  'fresher, better-sampled data. It is not a real sensor measurement and says nothing about intent.';
