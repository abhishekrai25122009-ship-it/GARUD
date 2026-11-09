import { useState } from 'react';
import type { TrackSnapshot } from '../engine/sim';
import type { AnimationStyle, InterceptorState } from '../types/intercept';

interface InterceptExerciseModalProps {
  open: boolean;
  onClose: () => void;
  tracks: TrackSnapshot[];
  selectedTrackId: string | null;
  interceptorState: InterceptorState | null;
  selectedStyle: AnimationStyle;
  onSelectStyle: (style: AnimationStyle) => void;
  onStartExercise: (targetId: string, style: AnimationStyle, outcome?: 'success' | 'miss') => void;
  onPauseResumeExercise: () => void;
  onAbortExercise: () => void;
  onResetExercise: () => void;
  onReplayExercise: () => void;
}

const STYLE_OPTIONS: Array<{
  id: AnimationStyle;
  name: string;
  badge: string;
  desc: string;
  icon: string;
}> = [
  {
    id: 'quick',
    name: 'QUICK',
    badge: 'RAPID SEQUENCE',
    desc: 'Short, high-tempo visual sequence with luminous streak & quick encounter.',
    icon: '⚡',
  },
  {
    id: 'cruise',
    name: 'CRUISE',
    badge: 'SMOOTH TRAIL',
    desc: 'Longer, smooth visual sequence with balanced tactical contrail & telemetry escort.',
    icon: '💠',
  },
  {
    id: 'cinematic',
    name: 'CINEMATIC',
    badge: 'CURVED DISPLAY',
    desc: 'Curved display trajectory with apogee beacon, launch ignition rings & full HUD lock-on.',
    icon: '🎬',
  },
];

export default function InterceptExerciseModal({
  open,
  onClose,
  tracks,
  selectedTrackId,
  interceptorState,
  selectedStyle,
  onSelectStyle,
  onStartExercise,
  onPauseResumeExercise,
  onAbortExercise,
  onResetExercise,
  onReplayExercise,
}: InterceptExerciseModalProps) {
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [plannedOutcome, setPlannedOutcome] = useState<'success' | 'miss'>('success');

  const targetId = selectedTargetId ?? selectedTrackId ?? tracks[0]?.id ?? '';

  if (!open) return null;

  const currentTrack = tracks.find((t) => t.id === targetId) ?? tracks[0] ?? null;
  const isRunning =
    interceptorState &&
    ['scramble', 'vector', 'rendezvous'].includes(interceptorState.stage);
  const isPaused = interceptorState?.paused ?? false;
  const isComplete = interceptorState?.stage === 'complete';
  const isMiss = interceptorState?.stage === 'miss';
  const isAborted = interceptorState?.stage === 'aborted';

  const stages = [
    { id: 'scramble', name: 'STAGE 1: SCRAMBLE', desc: 'Interceptor launch from Garud Airbase' },
    { id: 'vector', name: 'STAGE 2: VECTOR GUIDANCE', desc: 'Radar-directed closure vector' },
    { id: 'rendezvous', name: 'STAGE 3: RENDEZVOUS', desc: 'Terminal approach & visual escort' },
    {
      id: isMiss ? 'miss' : 'complete',
      name: isMiss ? 'STAGE 4: MISS / EVADED' : 'STAGE 4: COMPLETE',
      desc: isMiss ? 'Target maintained lateral standoff' : 'Escort established & verified',
    },
  ];

  const currentStageIdx =
    interceptorState?.stage === 'scramble'
      ? 0
      : interceptorState?.stage === 'vector'
      ? 1
      : interceptorState?.stage === 'rendezvous'
      ? 2
      : interceptorState?.stage === 'complete' || interceptorState?.stage === 'miss'
      ? 3
      : -1;

  return (
    <div className="dialog-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Intercept Exercise Console">
      <div className="dialog intercept-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="intercept-header">
          <div className="intercept-badge">
            <span className="live-pulse" /> FICTIONAL DEFENCE EXERCISE · NON-OPERATIONAL SIMULATION
          </div>
          <div className="intercept-title">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
            TACTICAL INTERCEPT SIMULATION CONSOLE
          </div>
          <div className="intercept-subtitle">
            Local simulated escort & correlation drill. Disclosed synthetic trial only.
          </div>
        </div>

        {/* Legal & Safety Disclosure */}
        <div className="intercept-disclosure">
          <strong>EXERCISE DISCLOSURE & LIMITS:</strong> Fictional training presentation only.
          Simulated interceptor path is purely demonstrative and does NOT connect to live weapons,
          military targeting, or operational air traffic systems. Target aircraft are never damaged or altered.
        </div>

        {/* Content based on status */}
        {!isRunning && !isComplete && !isMiss && !isAborted ? (
          /* Confirmation & Setup View */
          <div className="intercept-setup">
            <div className="setup-grid">
              <div className="setup-col">
                <label className="field-label">TARGET TRACK SELECTION</label>
                <select
                  className="select full-width"
                  value={targetId}
                  onChange={(e) => setSelectedTargetId(e.target.value)}
                >
                  {tracks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.callsign} ({t.id}) — {t.auth.toUpperCase()} · FL{Math.round(t.pos.z / 100)}
                    </option>
                  ))}
                </select>

                {currentTrack && (
                  <div className="target-summary-card">
                    <div className="summary-title">SELECTED TRACK ASSESSMENT</div>
                    <div className="summary-row">
                      <span className="lbl">Callsign / ID:</span>
                      <span className="val bold cyan">{currentTrack.callsign} ({currentTrack.id})</span>
                    </div>
                    <div className="summary-row">
                      <span className="lbl">Authorization:</span>
                      <span className={`val ${currentTrack.auth === 'authorized' ? 'green' : 'amber'}`}>
                        {currentTrack.auth.toUpperCase()} ({currentTrack.registry})
                      </span>
                    </div>
                    <div className="summary-row">
                      <span className="lbl">Speed / Heading:</span>
                      <span className="val">{Math.round(currentTrack.speed)} m/s ({Math.round(currentTrack.speed * 1.944)} kt) @ {Math.round(currentTrack.heading)}°</span>
                    </div>
                    <div className="summary-row">
                      <span className="lbl">Altitude:</span>
                      <span className="val">{Math.round(currentTrack.pos.z)} ft (FL{Math.round(currentTrack.pos.z / 100)})</span>
                    </div>
                    <div className="summary-row">
                      <span className="lbl">Freshness:</span>
                      <span className="val uppercase">{currentTrack.freshness}</span>
                    </div>
                    <div className="summary-row">
                      <span className="lbl">Protected Zone:</span>
                      <span className={`val ${currentTrack.inZone ? 'coral' : 'green'}`}>
                        {currentTrack.inZone ? 'BREACHED / INSIDE' : 'CLEAR / OUTSIDE'}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="setup-col">
                {/* Part B: Visual Style Selector */}
                <label className="field-label">ANIMATION VISUAL STYLE PRESET</label>
                <div className="style-selector-grid">
                  {STYLE_OPTIONS.map((opt) => {
                    const isSelected = selectedStyle === opt.id;
                    return (
                      <div
                        key={opt.id}
                        className={`style-card ${isSelected ? 'selected' : ''}`}
                        onClick={() => onSelectStyle(opt.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onSelectStyle(opt.id);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        aria-pressed={isSelected}
                      >
                        <div className="style-card-head">
                          <span className="style-icon">{opt.icon}</span>
                          <span className="style-name">{opt.name}</span>
                          <span className="style-badge">{opt.badge}</span>
                        </div>
                        <div className="style-desc">{opt.desc}</div>
                      </div>
                    );
                  })}
                </div>

                <div className="interceptor-profile-card">
                  <div className="profile-row">
                    <span>CALLSIGN:</span>
                    <strong className="cyan">GARUD-INT-ALPHA (GARUD-X1)</strong>
                  </div>
                  <div className="profile-row">
                    <span>BASE:</span>
                    <strong>GARUD AIRBASE (LOCAL GRID 0, -8000)</strong>
                  </div>
                  <div className="profile-row">
                    <span>PROTOCOL:</span>
                    <strong>TACTICAL INTERCEPT & IDENTIFICATION DRILL</strong>
                  </div>
                </div>

                {/* Simulated Encounter Outcome Mode Selector */}
                <div className="outcome-selection-card">
                  <label className="field-label">SIMULATED ENCOUNTER OUTCOME</label>
                  <div className="outcome-btn-group">
                    <button
                      type="button"
                      className={`outcome-mode-btn ${plannedOutcome === 'success' ? 'active-success' : ''}`}
                      onClick={() => setPlannedOutcome('success')}
                      title="Simulates positive rendezvous encounter, disabling/escorting target with visual impact flash"
                    >
                      ✔ SIMULATE SUCCESS (Disable Target)
                    </button>
                    <button
                      type="button"
                      className={`outcome-mode-btn ${plannedOutcome === 'miss' ? 'active-miss' : ''}`}
                      onClick={() => setPlannedOutcome('miss')}
                      title="Simulates target evasion where contact maintains standoff and remains active"
                    >
                      ⚠ SIMULATE MISS (Target Evasion)
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="dialog-actions">
              <button type="button" className="btn" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="btn primary btn-scramble"
                onClick={() => onStartExercise(targetId, selectedStyle, plannedOutcome)}
                disabled={!currentTrack}
              >
                ⚡ AUTHORIZE SIMULATED SCRAMBLE
              </button>
            </div>
          </div>
        ) : (
          /* Active / Completed / Aborted Progress View */
          <div className="intercept-active-hud">
            {/* Visual Style Switcher Pill Bar */}
            <div className="active-style-switcher">
              <span className="switcher-lbl">ANIMATION PRESET:</span>
              <div className="style-pills">
                {STYLE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`style-pill-btn ${interceptorState?.style === opt.id ? 'active' : ''}`}
                    onClick={() => onSelectStyle(opt.id)}
                    title={opt.desc}
                  >
                    {opt.icon} {opt.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Run context: selected preset, target and exercise status */}
            <div className="run-context-row font-mono">
              <span>
                TARGET:{' '}
                <strong className="cyan">
                  {currentTrack ? `${currentTrack.callsign} (${currentTrack.id})` : '—'}
                </strong>
              </span>
              <span>
                PRESET:{' '}
                <strong className="cyan">
                  {STYLE_OPTIONS.find((o) => o.id === interceptorState?.style)?.name ??
                    (interceptorState?.style ?? selectedStyle).toUpperCase()}
                </strong>
              </span>
              <span>
                STATUS:{' '}
                <strong
                  className={
                    isPaused
                      ? 'amber'
                      : isComplete
                      ? 'green'
                      : isMiss
                      ? 'amber'
                      : isAborted
                      ? 'coral'
                      : 'cyan'
                  }
                >
                  {isPaused
                    ? 'PAUSED'
                    : isComplete
                    ? 'SUCCESS — TARGET DISABLED / INTERCEPTED'
                    : isMiss
                    ? 'MISS — TARGET ACTIVE'
                    : isAborted
                    ? 'ABORTED'
                    : `RUNNING · ${(interceptorState?.stage ?? '').toUpperCase()}`}
                </strong>
              </span>
            </div>

            {/* Stages Bar */}
            <div className="stages-bar">
              {stages.map((st, i) => {
                const isActive = currentStageIdx === i;
                const isPassed = currentStageIdx > i || isComplete;
                return (
                  <div
                    key={st.id}
                    className={`stage-step ${isActive ? 'active' : ''} ${isPassed ? 'passed' : ''}`}
                  >
                    <div className="step-num">{isPassed ? '✔' : i + 1}</div>
                    <div className="step-content">
                      <div className="step-title">{st.name}</div>
                      <div className="step-desc">{st.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Metrics Grid */}
            <div className="telemetry-bar">
              <div className="telemetry-box">
                <div className="telemetry-label">EXERCISE STAGE</div>
                <div className={`telemetry-value uppercase ${isComplete ? 'green' : isAborted ? 'coral' : isPaused ? 'amber' : 'cyan'}`}>
                  {isPaused ? 'PAUSED' : interceptorState?.stage}
                </div>
              </div>
              <div className="telemetry-box">
                <div className="telemetry-label">SIMULATED TIME</div>
                <div className="telemetry-value font-mono">
                  {interceptorState ? `${interceptorState.elapsed.toFixed(1)} s` : '0.0 s'}
                </div>
              </div>
              <div className="telemetry-box">
                <div className="telemetry-label">RANGE TO TARGET</div>
                <div className="telemetry-value font-mono">
                  {interceptorState
                    ? interceptorState.distanceToTarget > 1000
                      ? `${(interceptorState.distanceToTarget / 1000).toFixed(2)} km`
                      : `${Math.round(interceptorState.distanceToTarget)} m`
                    : '--'}
                </div>
              </div>
              <div className="telemetry-box">
                <div className="telemetry-label">CLOSURE RATE</div>
                <div className="telemetry-value font-mono">
                  {interceptorState ? `${Math.round(interceptorState.closureRate)} m/s` : '--'}
                </div>
              </div>
              <div className="telemetry-box">
                <div className="telemetry-label">INTERCEPTOR FLIGHT</div>
                <div className="telemetry-value font-mono">
                  {interceptorState ? `FL${Math.round(interceptorState.altitude / 100)} @ ${Math.round(interceptorState.heading)}°` : '--'}
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="progress-section">
              <div className="progress-meta">
                <span>SIMULATION PROGRESS</span>
                <span>{Math.round(interceptorState?.progress ?? 0)}%</span>
              </div>
              <div className="progress-track">
                <div
                  className={`progress-fill ${isComplete ? 'fill-complete' : isAborted ? 'fill-aborted' : ''}`}
                  style={{ width: `${interceptorState?.progress ?? 0}%` }}
                />
              </div>
            </div>

            {/* Outcome Banners */}
            {isComplete && (
              <div className="outcome-banner success">
                <div className="outcome-title">✔ ENCOUNTER SUCCESS — TARGET DISABLED / INTERCEPTED</div>
                <div className="outcome-desc">
                  Simulated interceptor INT-ALPHA executed precision closure vector. Target contact{' '}
                  <strong className="cyan">{currentTrack?.callsign}</strong> is now{' '}
                  <strong className="green">DISABLED / INTERCEPTED</strong>. Encounter coordinates frozen;
                  impact dispersal flash registered on tactical scope.
                </div>
                <div className="outcome-target-badge green">
                  TARGET CLASSIFICATION: DISABLED / INTERCEPTED
                </div>
              </div>
            )}

            {isMiss && (
              <div className="outcome-banner miss">
                <div className="outcome-title">⚠ ENCOUNTER MISS — TARGET EVADED (REMAINS ACTIVE)</div>
                <div className="outcome-desc">
                  Simulated interceptor was unable to close within lethal escort boundary. Target contact{' '}
                  <strong className="cyan">{currentTrack?.callsign}</strong> maintained lateral standoff distance,
                  evaded contact, and remains <strong className="amber">ACTIVE</strong> along its route.
                </div>
                <div className="outcome-target-badge amber">
                  TARGET CLASSIFICATION: ACTIVE (EVADED)
                </div>
              </div>
            )}

            {isAborted && (
              <div className="outcome-banner aborted">
                <div className="outcome-title">⚠ EXERCISE ABORTED BY OPERATOR</div>
                <div className="outcome-desc">
                  Scramble profile cancelled. Simulated interceptor returning to Garud Airbase recovery pattern. Target remains active.
                </div>
              </div>
            )}

            {/* Tactical Event Log */}
            <div className="event-log-container">
              <div className="log-header">CHRONOLOGICAL EXERCISE TELEMETRY LOG</div>
              <div className="log-body">
                {interceptorState?.eventLog.map((ev, idx) => (
                  <div key={idx} className={`log-entry ${ev.type}`}>
                    <span className="log-time">+{ev.timeStr}</span>
                    <span className="log-stage">[{ev.stage.toUpperCase()}]</span>
                    <span className="log-text">{ev.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions Bar */}
            <div className="dialog-actions">
              {isRunning && (
                <>
                  <button
                    type="button"
                    className="btn"
                    onClick={onPauseResumeExercise}
                    title={isPaused ? 'Resume Exercise Animation' : 'Pause Exercise Animation'}
                  >
                    {isPaused ? '▶ Resume' : '❚❚ Pause'}
                  </button>
                  <button
                    type="button"
                    className="btn danger"
                    onClick={onAbortExercise}
                  >
                    ⚠ Abort Exercise
                  </button>
                </>
              )}

              {(isComplete || isMiss || isAborted) && (
                <>
                  <button
                    type="button"
                    className="btn primary"
                    onClick={onReplayExercise}
                  >
                    ↺ Replay Exercise
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={onResetExercise}
                  >
                    ↺ Reset Setup
                  </button>
                </>
              )}

              <button type="button" className="btn" onClick={onClose}>
                {isRunning ? 'Dock / Watch Radar Scope' : 'Close'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
