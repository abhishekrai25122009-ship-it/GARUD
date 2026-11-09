import { useState } from 'react';
import type { Alert, SimEvent, TrackSnapshot } from '../engine/sim';
import type { InterceptorState } from '../types/intercept';
import {
  CONFIDENCE_MEANING,
  classifyTrack,
  classificationKind,
  detectionConfidence,
} from '../lib/classification';

interface InspectorProps {
  track: TrackSnapshot | null;
  alerts: Alert[];
  events: SimEvent[];
  onAck: (alertId: string) => void;
  onEscalate: () => void;
  onNote: (note: string) => void;
  onAdvisory: (ack: boolean) => void;
  onInitiateIntercept?: (trackId: string) => void;
  disabledTrackIds?: Set<string>;
  interceptorState?: InterceptorState | null;
  paused: boolean;
}

function getCardinalDirection(angle: number): string {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(((angle % 360) / 22.5)) % 16;
  return directions[index];
}

export default function Inspector({
  track,
  alerts,
  events,
  onAck,
  onEscalate,
  onNote,
  onAdvisory,
  onInitiateIntercept,
  disabledTrackIds,
  interceptorState,
}: InspectorProps) {
  const [operatorNote, setOperatorNote] = useState('');

  if (!track) {
    return (
      <section className="panel inspector-panel" aria-label="Track Inspector">
        <div className="panel-header">
          <span>TRACK INSPECTOR // UNCORRELATED TELEMETRY</span>
        </div>
        <div className="panel-body">
          <div className="empty-tactical-state">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="empty-icon">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
            <div className="empty-title">NO TRACK SELECTED</div>
            <div className="empty-sub">
              Select an aircraft from the roster or click any radar target to examine telemetry,
              zone entry projections, and conduct threat assessment.
            </div>
          </div>
        </div>
      </section>
    );
  }

  const isDisabled = disabledTrackIds?.has(track.id) ?? false;
  const isIntercepting =
    interceptorState?.targetId === track.id &&
    ['scramble', 'vector', 'rendezvous'].includes(interceptorState.stage);

  const associatedAlerts = alerts.filter((a) => a.trackId === track.id);
  const highestAlert = associatedAlerts.length > 0 ? associatedAlerts[0] : null;

  // Track event history
  const trackEvents = events
    .filter((e) => e.trackId === track.id)
    .slice(0, 8);

  const speedKnots = Math.round(track.speed * 1.94384);
  const flightLevel = Math.round(track.pos.z / 100);
  const cardinal = getCardinalDirection(track.heading);

  const freshColor =
    isDisabled
      ? '#ef4444'
      : track.freshness === 'live'
      ? '#4ade80'
      : track.freshness === 'stale'
      ? '#f59e0b'
      : '#ef4444';

  const cls = classifyTrack(track);
  const clsKind = classificationKind(cls);
  const confidence = detectionConfidence(track);

  const handleAddNote = () => {
    if (!operatorNote.trim()) return;
    onNote(operatorNote);
    setOperatorNote('');
  };

  return (
    <section className="panel inspector-panel" aria-label={`Inspector for ${track.callsign}`}>
      <div className="panel-header">
        <span>TRACK TELEMETRY // {track.callsign}</span>
        <span className={`status-pill ${isDisabled ? 'intercepted' : isIntercepting ? 'intercepting' : track.freshness}`}>
          {isDisabled ? 'INTERCEPTED' : isIntercepting ? 'INTERCEPTING' : track.freshness.toUpperCase()}
        </span>
      </div>

      <div className="panel-body inspector-body">
        {/* Callsign & Identity Header Card */}
        <div className="inspector-card track-id-card">
          <div className="track-id-top">
            <div>
              <div className="track-callsign font-mono">{track.callsign}</div>
              <div className="track-uuid font-mono">ID: {track.id}</div>
            </div>
            <div className="track-auth-badge">
              <span className={`auth-badge ${isDisabled ? 'intercepted' : track.auth}`}>
                {isDisabled ? 'INTERCEPTED' : track.auth === 'authorized' ? 'AUTHORIZED' : 'UNIDENTIFIED'}
              </span>
            </div>
          </div>
          <div className="track-registry">
            REGISTRY BASIS: <strong>{track.registry}</strong>
          </div>
        </div>

        {/* Tactical Classification Notice */}
        <div className={`assessment-classification-box ${isDisabled ? 'intercepted-box' : ''}`}>
          <div className="class-title">
            {isDisabled
              ? 'TACTICAL OUTCOME: INTERCEPTED / DISABLED'
              : `ASSESSMENT: ${track.auth === 'authorized' ? 'CORRELATED CIVIL TRAFFIC' : 'UNCORRELATED / UNVERIFIED'}`}
          </div>
          <div className="class-desc">
            {isDisabled ? (
              <>
                <strong>Confirmed Interception:</strong> Simulated tactical escort by INT-ALPHA completed. Target neutralized and frozen on scope.
              </>
            ) : track.auth === 'unknown' ? (
              <>
                <strong>Notice:</strong> Contact does not match active flight-plans. Unidentified status indicates absence of verified transponder correlation; it does <em>NOT</em> establish hostile intent.
              </>
            ) : (
              'Flight plan and transponder squawk fully verified against local civil authority registry.'
            )}
          </div>
        </div>

        {/* Three-way simulated track classification */}
        <div className="inspector-card classification-card">
          <div className="card-lbl">TRACK CLASSIFICATION</div>
          <span className={`classification-badge ${clsKind}`}>{cls}</span>
          <div className="class-desc">
            {cls === 'FRIENDLY SIMULATION' &&
              'Local flight-plan/transponder correlation verified by the synthetic registry. Friendly traffic in this exercise.'}
            {cls === 'UNIDENTIFIED' &&
              'No verified correlation, but the synthetic feed is tracking the contact live. Absence of correlation is not hostile intent.'}
            {cls === 'UNKNOWN' &&
              'No verified correlation and no fresh observation (stale/lost feed), so the tracker cannot confirm the contact state.'}
          </div>
        </div>

        {/* Simulated detection confidence with explicit meaning */}
        <div className="inspector-card confidence-card">
          <div className="conf-head">
            <span className="card-lbl">SIMULATED DETECTION CONFIDENCE</span>
            <span className="conf-value font-mono">{confidence}%</span>
          </div>
          <div
            className="conf-track"
            role="meter"
            aria-valuenow={confidence}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Simulated detection confidence"
          >
            <div className="conf-fill" style={{ width: `${confidence}%` }} />
          </div>
          <div className="conf-note">{CONFIDENCE_MEANING}</div>
        </div>

        {/* Telemetry Vectors Grid */}
        <div className="inspector-telemetry-grid">
          <div className="telemetry-cell">
            <span className="lbl">GROUND SPEED</span>
            <span className="val font-mono">{isDisabled ? '0 m/s' : `${Math.round(track.speed)} m/s`}</span>
            <span className="sub font-mono">{isDisabled ? 'FROZEN' : `${speedKnots} kt`}</span>
          </div>

          <div className="telemetry-cell">
            <span className="lbl">ALTITUDE</span>
            <span className="val font-mono">{Math.round(track.pos.z)} ft</span>
            <span className="sub font-mono">FL{flightLevel}</span>
          </div>

          <div className="telemetry-cell">
            <span className="lbl">BEARING / HDG</span>
            <span className="val font-mono">{Math.round(track.heading)}°</span>
            <span className="sub font-mono">{isDisabled ? 'FROZEN' : cardinal}</span>
          </div>

          <div className="telemetry-cell">
            <span className="lbl">OBSERVATIONS</span>
            <span className="val font-mono">{track.observations.length} pts</span>
            <span className="sub font-mono" style={{ color: freshColor }}>
              {isDisabled ? 'INTERCEPTED' : `Age ${track.age.toFixed(1)}s`}
            </span>
          </div>
        </div>

        {/* Protected Zone Threat Status */}
        <div className="inspector-card zone-status-card">
          <div className="card-lbl">PROTECTED ZONE STATUS</div>
          <div className="zone-status-row">
            <span className={`zone-val ${track.inZone ? 'danger' : 'safe'}`}>
              {track.inZone ? '⚠ INSIDE PROTECTED ZONE' : '✔ OUTSIDE PROTECTED ZONE'}
            </span>
          </div>
          <div className="zone-eligibility-row font-mono" style={{ marginTop: '6px', fontSize: '11px' }}>
            <span className="dim">INTERCEPT ELIGIBILITY: </span>
            <strong className={isDisabled ? 'red' : track.auth === 'unknown' ? 'cyan' : 'green'}>
              {isDisabled ? 'INTERCEPTED (COMPLETE)' : track.auth === 'unknown' ? 'ELIGIBLE (SIMULATION READY)' : 'INELIGIBLE (AUTHORIZED CIVIL)'}
            </strong>
          </div>
          {track.projectedEntryT !== null && (
            <div className="zone-projection-alert">
              <span>PROJECTED ENTRY LEAD TIME:</span>
              <strong className="cyan font-mono">
                +{track.projectedEntryT.toFixed(0)} s
              </strong>
            </div>
          )}
          {track.extrapolating && (
            <div className="zone-extrapolate-note">
              Position extrapolated via constant-velocity model (signal degraded).
            </div>
          )}
        </div>

        {/* Active Alert Information if any */}
        {highestAlert && (
          <div className={`inspector-card alert-summary-card sev-${highestAlert.severity}`}>
            <div className="alert-summary-head">
              <span className="alert-sev uppercase">{highestAlert.severity} ALERT</span>
              <span className="alert-rule font-mono">RULE: {highestAlert.rule}</span>
            </div>
            <div className="alert-reasons">{highestAlert.reasons.join(' · ')}</div>
            <div className="alert-actions-inline">
              <button
                type="button"
                className="btn small"
                onClick={() => onAck(highestAlert.id)}
              >
                {highestAlert.acknowledged ? '✔ Acknowledged' : 'Acknowledge Alert'}
              </button>
            </div>
          </div>
        )}

        {/* Chronological Track Event Log */}
        <div className="inspector-card track-history-card">
          <div className="card-lbl">CHRONOLOGICAL TRACK EVENT LOG</div>
          <div className="track-events-list">
            {trackEvents.length === 0 ? (
              <div className="no-events font-mono">Continuous nominal telemetry.</div>
            ) : (
              trackEvents.map((ev, i) => (
                <div key={i} className="track-event-row">
                  <span className="ev-time font-mono">{Math.floor(ev.t)}s</span>
                  <span className="ev-type font-mono">{ev.type}</span>
                  <span className="ev-msg">{ev.message}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Tactical Actions Strip */}
        <div className="inspector-actions-section">
          <div className="card-lbl">TACTICAL OPERATOR ACTIONS</div>

          {/* Prominent Intercept Exercise Launcher */}
          {isDisabled ? (
            <button
              type="button"
              className="btn full-width disabled-action-btn"
              disabled
            >
              ✔ TARGET INTERCEPTED & NEUTRALIZED
            </button>
          ) : isIntercepting ? (
            <button
              type="button"
              className="btn primary full-width intercept-btn active-pulse"
              disabled
            >
              ⚡ INTERCEPT SIMULATION IN PROGRESS…
            </button>
          ) : onInitiateIntercept && (
            <button
              type="button"
              className="btn primary full-width intercept-btn"
              onClick={() => onInitiateIntercept(track.id)}
            >
              ⚡ INITIATE INTERCEPT SIMULATION ON {track.callsign}
            </button>
          )}

          <div className="btn-row">
            <button
              type="button"
              className="btn small danger"
              onClick={onEscalate}
              disabled={isDisabled}
              title="Escalate alert status for this track"
            >
              Escalate Track
            </button>
            <button
              type="button"
              className="btn small"
              onClick={() => onAdvisory(false)}
              disabled={isDisabled}
              title="Simulate advisory radio inquiry with no response"
            >
              Radio Query (No Resp)
            </button>
            <button
              type="button"
              className="btn small"
              onClick={() => onAdvisory(true)}
              disabled={isDisabled}
              title="Simulate advisory radio inquiry with acknowledgement"
            >
              Radio Query (Ack)
            </button>
          </div>

          {/* Operator Note Input */}
          <div className="operator-note-box">
            <label className="note-label">LOG OPERATOR DISPATCH NOTE</label>
            <div className="note-input-row">
              <input
                type="text"
                className="search note-input"
                placeholder="Log tactical note for incident record..."
                value={operatorNote}
                onChange={(e) => setOperatorNote(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
              />
              <button
                type="button"
                className="btn small"
                onClick={handleAddNote}
                disabled={!operatorNote.trim()}
              >
                Log Note
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
