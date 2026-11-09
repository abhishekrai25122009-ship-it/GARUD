import type { JetScrambleState } from '../types/intercept';

interface JetScrambleModalProps {
  open: boolean;
  onClose: () => void;
  scrambleState: JetScrambleState | null;
  onStartScramble: () => void;
  onPauseResumeScramble: () => void;
  onAbortScramble: () => void;
  onResetScramble: () => void;
  onReplayScramble: () => void;
}

const STAGES = [
  { id: 'launch', name: 'STAGE 1: LAUNCH', desc: 'Forward base scramble & afterburner climb' },
  { id: 'airborne', name: 'STAGE 2: AIRBORNE', desc: 'Passing FL280, establishing tactical formation' },
  { id: 'patrol', name: 'STAGE 3: DEFENSIVE PATROL', desc: 'Perimeter sector sweep along buffer boundary' },
  { id: 'return', name: 'STAGE 4: RETURN CORRIDOR', desc: 'Descent vector to recovery runway' },
  { id: 'complete', name: 'STAGE 5: COMPLETE', desc: 'Safe recovery logged & debrief complete' },
];

export default function JetScrambleModal({
  open,
  onClose,
  scrambleState,
  onStartScramble,
  onPauseResumeScramble,
  onAbortScramble,
  onResetScramble,
  onReplayScramble,
}: JetScrambleModalProps) {
  if (!open) return null;

  const isRunning =
    scrambleState &&
    ['launch', 'airborne', 'patrol', 'return'].includes(scrambleState.stage);
  const isPaused = scrambleState?.paused ?? false;
  const isComplete = scrambleState?.stage === 'complete';
  const isAborted = scrambleState?.stage === 'aborted';

  const currentStageIdx =
    scrambleState?.stage === 'launch'
      ? 0
      : scrambleState?.stage === 'airborne'
      ? 1
      : scrambleState?.stage === 'patrol'
      ? 2
      : scrambleState?.stage === 'return'
      ? 3
      : scrambleState?.stage === 'complete'
      ? 4
      : -1;

  const leadJet = scrambleState?.jets[0];

  return (
    <div className="dialog-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Jet Scramble Exercise Console">
      <div className="dialog jet-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="jet-header">
          <div className="jet-badge">
            <span className="live-pulse cyan" /> FICTIONAL TACTICAL DRILL · NON-OPERATIONAL SIMULATION
          </div>
          <div className="jet-title">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
            FIGHTER-JET SCRAMBLE EXERCISE CONSOLE
          </div>
          <div className="jet-subtitle">
            Scripted visual demonstration drill. Synthetic twin-ship patrol formation.
          </div>
        </div>

        {/* Fictional Disclaimer */}
        <div className="jet-disclosure">
          <strong>SCRIPTED DEMONSTRATION DISCLOSURE:</strong> This exercise renders illustrative synthetic
          formation aircraft along a predetermined perimeter circuit. No live aircraft, real-world airspace
          clearance, or military weapon systems are utilized.
        </div>

        {/* Setup / Confirmation or Live HUD */}
        {!isRunning && !isComplete && !isAborted ? (
          <div className="jet-setup">
            <div className="setup-grid">
              <div className="setup-col">
                <div className="summary-title">TACTICAL FLIGHT PROFILE</div>
                <div className="jet-profile-card">
                  <div className="profile-row">
                    <span>CALLSIGN FLIGHT:</span>
                    <strong className="cyan">VIPER FLIGHT (VIPER-01 & VIPER-02)</strong>
                  </div>
                  <div className="profile-row">
                    <span>AIRCRAFT TYPE:</span>
                    <strong>SYNTHETIC DELTA-WING AIR SUPERIORITY</strong>
                  </div>
                  <div className="profile-row">
                    <span>STAGING BASE:</span>
                    <strong>FORWARD AIR STATION EAST (GRID 12KM, -6KM)</strong>
                  </div>
                  <div className="profile-row">
                    <span>CRUISE VELOCITY:</span>
                    <strong>380 m/s (~Mach 1.15 sim)</strong>
                  </div>
                  <div className="profile-row">
                    <span>PATROL ALTITUDE:</span>
                    <strong className="green">FL280 (28,000 FT)</strong>
                  </div>
                  <div className="profile-row">
                    <span>MISSION DURATION:</span>
                    <strong>~22 SECONDS (SIMULATED RUNWAY-TO-RUNWAY)</strong>
                  </div>
                </div>
              </div>

              <div className="setup-col">
                <div className="summary-title">PREDETERMINED PATROL CIRCUIT</div>
                <div className="circuit-summary-box">
                  <div className="circuit-step">1. Scramble & Afterburner Climb Out</div>
                  <div className="circuit-step">2. Defensive Boundary Patrol Circuit (360° Sector Sweep)</div>
                  <div className="circuit-step">3. Tactical Formation Station Keeping</div>
                  <div className="circuit-step">4. Return via Controlled Inbound Corridor & Recovery</div>
                </div>
                <div className="setup-warning">
                  Explicit operator authorization required to launch synthetic scramble sequence.
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
                onClick={onStartScramble}
              >
                ⚡ AUTHORIZE JET SCRAMBLE DRILL
              </button>
            </div>
          </div>
        ) : (
          <div className="jet-active-hud">
            {/* Stages Bar */}
            <div className="stages-bar">
              {STAGES.map((st, i) => {
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

            {/* Telemetry Bar */}
            <div className="telemetry-bar">
              <div className="telemetry-box">
                <div className="telemetry-label">DRILL STATUS</div>
                <div className={`telemetry-value uppercase ${isComplete ? 'green' : isAborted ? 'coral' : isPaused ? 'amber' : 'cyan'}`}>
                  {isPaused ? 'PAUSED' : scrambleState?.stage}
                </div>
              </div>
              <div className="telemetry-box">
                <div className="telemetry-label">ELAPSED TIME</div>
                <div className="telemetry-value font-mono">
                  {scrambleState ? `${scrambleState.elapsed.toFixed(1)} s` : '0.0 s'}
                </div>
              </div>
              <div className="telemetry-box">
                <div className="telemetry-label">FORMATION LEAD</div>
                <div className="telemetry-value font-mono cyan">
                  VIPER-01 (LEAD)
                </div>
              </div>
              <div className="telemetry-box">
                <div className="telemetry-label">FLIGHT SPEED</div>
                <div className="telemetry-value font-mono">
                  {leadJet ? `${Math.round(leadJet.speed)} m/s` : '--'}
                </div>
              </div>
              <div className="telemetry-box">
                <div className="telemetry-label">ALTITUDE & HDG</div>
                <div className="telemetry-value font-mono">
                  {leadJet ? `FL${Math.round(leadJet.altitude / 100)} @ ${Math.round(leadJet.heading)}°` : '--'}
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="progress-section">
              <div className="progress-meta">
                <span>SCRAMBLE DRILL PROGRESS</span>
                <span>{Math.round(scrambleState?.progress ?? 0)}%</span>
              </div>
              <div className="progress-track">
                <div
                  className={`progress-fill ${isComplete ? 'fill-complete' : isAborted ? 'fill-aborted' : ''}`}
                  style={{ width: `${scrambleState?.progress ?? 0}%` }}
                />
              </div>
            </div>

            {/* Banner outcome */}
            {isComplete && (
              <div className="outcome-banner success">
                <div className="outcome-title">✔ JET SCRAMBLE DRILL COMPLETE</div>
                <div className="outcome-desc">
                  VIPER Flight completed 360° sector defensive patrol circuit. Safe recovery logged at Forward Air Station East.
                </div>
              </div>
            )}

            {isAborted && (
              <div className="outcome-banner aborted">
                <div className="outcome-title">⚠ JET SCRAMBLE DRILL ABORTED</div>
                <div className="outcome-desc">
                  Patrol profile cancelled by controller. Formation returning to base via immediate recovery vector.
                </div>
              </div>
            )}

            {/* Event Log */}
            <div className="event-log-container">
              <div className="log-header">CHRONOLOGICAL JET TELEMETRY LOG</div>
              <div className="log-body">
                {scrambleState?.eventLog.map((ev, idx) => (
                  <div key={idx} className={`log-entry ${ev.type}`}>
                    <span className="log-time">+{ev.timeStr}</span>
                    <span className="log-stage">[{ev.stage.toUpperCase()}]</span>
                    <span className="log-text">{ev.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="dialog-actions">
              {isRunning && (
                <>
                  <button
                    type="button"
                    className="btn"
                    onClick={onPauseResumeScramble}
                    title={isPaused ? 'Resume Scramble Drill' : 'Pause Scramble Drill'}
                  >
                    {isPaused ? '▶ Resume' : '❚❚ Pause'}
                  </button>
                  <button
                    type="button"
                    className="btn danger"
                    onClick={onAbortScramble}
                  >
                    ⚠ Abort Drill
                  </button>
                </>
              )}

              {(isComplete || isAborted) && (
                <>
                  <button
                    type="button"
                    className="btn primary"
                    onClick={onReplayScramble}
                  >
                    ↺ Replay Drill
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={onResetScramble}
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
