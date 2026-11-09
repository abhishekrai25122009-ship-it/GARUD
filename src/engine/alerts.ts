// Rule-based, explainable alert evaluation with deduplication.
// Unknown authorization is never treated as hostile by itself.

import type {
  Alert,
  AlertRule,
  AlertSeverity,
  TrackSnapshot,
  SimEvent,
} from './types';
import type { Zone } from './geofence';

const ALERT_PREFIX = 'alert';

export function alertId(trackId: string, rule: AlertRule): string {
  return `${ALERT_PREFIX}:${trackId}:${rule}`;
}

export function ruleSeverity(rule: AlertRule, leadSeconds: number | null): AlertSeverity {
  if (rule === 'zoneEntry') return 'critical';
  if (rule === 'intrusion') {
    if (leadSeconds !== null && leadSeconds < 10) return 'critical';
    return 'warning';
  }
  if (rule === 'lostContact') return 'warning';
  if (rule === 'staleContact') return 'info';
  return 'info';
}

export interface AlertCondition {
  rule: AlertRule;
  active: boolean;
  severity: AlertSeverity;
  projectedEntryT: number | null;
  reasons: string[];
  uncertain: boolean;
}

// Evaluate every rule for every track at the current sim time.
export function evaluateConditions(
  tracks: TrackSnapshot[],
  zones: Zone[],
  now: number,
): Map<string, AlertCondition> {
  const out = new Map<string, AlertCondition>();
  const zone = zones[0];
  const zoneName = zone ? zone.name : 'Protected Zone';

  for (const tr of tracks) {
    // ---- intrusion / zone entry (from forecast + truth) ----
    const lead = tr.projectedEntryT !== null ? tr.projectedEntryT - now : null;
    const intrusionReasons: string[] = [];
    let intrusionActive = false;
    let intrusionUncertain = tr.extrapolating;

    if (tr.inZone) {
      intrusionActive = true;
      intrusionReasons.push(`Currently inside ${zoneName}`);
    } else if (tr.projectedEntryT !== null) {
      intrusionActive = true;
      intrusionReasons.push(
        `Projected to enter ${zoneName} in ${lead!.toFixed(0)} s`,
      );
    }
    if (tr.auth === 'unknown') {
      intrusionReasons.push('Authorization not on file (not indicative of hostility)');
    }
    if (intrusionActive) {
      out.set(
        alertId(tr.id, 'intrusion'),
        {
          rule: 'intrusion',
          active: true,
          severity: ruleSeverity('intrusion', lead),
          projectedEntryT: tr.projectedEntryT,
          reasons: intrusionReasons,
          uncertain: intrusionUncertain,
        },
      );
    }

    // ---- lost / stale contact ----
    if (tr.freshness === 'lost') {
      out.set(alertId(tr.id, 'lostContact'), {
        rule: 'lostContact',
        active: true,
        severity: 'warning',
        projectedEntryT: null,
        reasons: [`No telemetry for ${tr.age.toFixed(0)} s — position uncertain`],
        uncertain: true,
      });
    } else if (tr.freshness === 'stale') {
      out.set(alertId(tr.id, 'staleContact'), {
        rule: 'staleContact',
        active: true,
        severity: 'info',
        projectedEntryT: null,
        reasons: [`Telemetry aging: ${tr.age.toFixed(0)} s since last measurement`],
        uncertain: false,
      });
    }

    // ---- unknown authorization note ----
    if (tr.auth === 'unknown' && !intrusionActive) {
      out.set(alertId(tr.id, 'unknownAuth'), {
        rule: 'unknownAuth',
        active: true,
        severity: 'info',
        projectedEntryT: null,
        reasons: ['Authorization not on file — treat as unidentified, not hostile'],
        uncertain: false,
      });
    }
  }
  return out;
}

export interface AlertManagerOptions {
  onEvent: (ev: SimEvent) => void;
  now: () => number;
}

export class AlertManager {
  private alerts = new Map<string, Alert>();
  private clearSince = new Map<string, number | null>(); // rule key -> time condition first cleared
  private onEvent: (ev: SimEvent) => void;
  private now: () => number;

  constructor(opts: AlertManagerOptions) {
    this.onEvent = opts.onEvent;
    this.now = opts.now;
  }

  get active(): Alert[] {
    return [...this.alerts.values()].filter((a) => !a.resolved);
  }
  get all(): Alert[] {
    return [...this.alerts.values()];
  }

  acknowledge(id: string): boolean {
    const a = this.alerts.get(id);
    if (!a) return false;
    a.acknowledged = true;
    a.updatedT = this.now();
    this.onEvent({
      t: this.now(),
      realT: performance.now(),
      type: 'acknowledgement',
      trackId: a.trackId,
      message: `Operator acknowledged alert for ${a.trackId}`,
    });
    return true;
  }

  addNote(trackId: string, note: string): void {
    this.onEvent({
      t: this.now(),
      realT: performance.now(),
      type: 'note',
      trackId,
      message: note,
    });
  }

  escalate(trackId: string): void {
    this.onEvent({
      t: this.now(),
      realT: performance.now(),
      type: 'escalated',
      trackId,
      message: `Escalated for supervisor review — track ${trackId}`,
    });
  }

  // Feed evaluated conditions; returns the current active alerts.
  evaluate(conditions: Map<string, AlertCondition>): Alert[] {
    const now = this.now();
    const seen = new Set<string>();

    for (const [key, cond] of conditions) {
      seen.add(key);
      const existing = this.alerts.get(key);
      const severity = cond.severity;

      if (!existing) {
        const a: Alert = {
          id: key,
          trackId: key.split(':')[1],
          rule: cond.rule,
          severity,
          zone: 'Protected Zone',
          projectedEntryT: cond.projectedEntryT,
          auth: 'unknown',
          age: 0,
          reasons: cond.reasons,
          acknowledged: false,
          resolved: false,
          raisedT: now,
          updatedT: now,
          uncertain: cond.uncertain,
        };
        this.alerts.set(key, a);
        this.clearSince.set(key, null);
        if (severity !== 'info') {
          this.onEvent({
            t: now,
            realT: performance.now(),
            type: 'warning',
            trackId: a.trackId,
            message: `${severity.toUpperCase()}: ${cond.reasons.join('; ')}`,
          });
        }
        continue;
      }

      // Update an active alert in place (dedup by key).
      existing.severity = severity;
      existing.projectedEntryT = cond.projectedEntryT;
      existing.reasons = cond.reasons;
      existing.uncertain = cond.uncertain;
      existing.updatedT = now;
      this.clearSince.set(existing.id, null);
    }

    // Conditions that went away: start / advance the sustained-clear timer.
    for (const [key, a] of this.alerts) {
      if (seen.has(key)) continue;
      if (a.resolved) continue;
      const start = this.clearSince.get(key);
      if (start === null || start === undefined) {
        this.clearSince.set(key, now);
      } else if (now - start >= 6) {
        // RESOLVE_CLEAR_S sustained clear -> resolved.
        a.resolved = true;
        a.updatedT = now;
      }
    }

    return this.active;
  }
}
