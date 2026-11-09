import { useState, useEffect, useRef } from 'react';

export type DefconLevel = 5 | 4 | 3 | 2 | 1;

export interface StrategicLogEntry {
  timestamp: string;
  level: DefconLevel;
  action: string;
  operator: string;
  status: 'nominal' | 'elevated' | 'critical' | 'cleared';
}

interface StrategicAlertModalProps {
  open: boolean;
  onClose: () => void;
  currentDefcon: DefconLevel;
  onSetDefcon: (lvl: DefconLevel) => void;
  onLogEvent?: (msg: string) => void;
}

const DEFCON_DETAILS: Record<
  DefconLevel,
  { code: string; label: string; desc: string; color: string; airPosture: string }
> = {
  5: {
    code: 'FADE OUT',
    label: 'PEACETIME READINESS',
    desc: 'Normal commercial traffic surveillance. Standard 30-min ground scramble alert.',
    color: '#4ade80',
    airPosture: 'Routine CAP (Combat Air Patrol) Standby',
  },
  4: {
    code: 'DOUBLE TAKE',
    label: 'ENHANCED SURVEILLANCE',
    desc: 'Increased radar sample rate and watch standing. Telemetry loss thresholds reduced.',
    color: '#38d9d6',
    airPosture: '15-Minute Alert Interceptors Staged',
  },
  3: {
    code: 'ROUND HOUSE',
    label: 'AIRSPACE GUARD ELEVATED',
    desc: 'Air force squadrons on 15-minute standby. Protected zone buffer monitoring active.',
    color: '#f59e0b',
    airPosture: '5-Minute Runway Alert Ready',
  },
  2: {
    code: 'FAST PACE',
    label: 'ARMED DEFENSE CONTINGENCY',
    desc: 'Armed combat air patrols aloft. Sector radar priority allocated to unknown contacts.',
    color: '#f97316',
    airPosture: 'Airborne CAP Over Protected Perimeter',
  },
  1: {
    code: 'COCKED PISTOL',
    label: 'MAXIMUM AIR DEFENSE READINESS',
    desc: 'Full simulated sector lockdown. Intercept simulations authorized on boundary violations.',
    color: '#ef4444',
    airPosture: 'Immediate Scramble & Intercept Authorized',
  },
};

export default function StrategicAlertModal({
  open,
  onClose,
  currentDefcon,
  onSetDefcon,
  onLogEvent,
}: StrategicAlertModalProps) {
  const [targetLevel, setTargetLevel] = useState<DefconLevel>(currentDefcon);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [countdownPaused, setCountdownPaused] = useState<boolean>(false);
  const [confirmStep, setConfirmStep] = useState<boolean>(false);
  const [log, setLog] = useState<StrategicLogEntry[]>([
    {
      timestamp: '00:00:01',
      level: 5,
      action: 'Initial baseline readiness logged',
      operator: 'BLACKSITE-SYS',
      status: 'nominal',
    },
  ]);
  const [showAAR, setShowAAR] = useState<boolean>(false);
  const timerRef = useRef<number | null>(null);

  // Handle countdown with pause/resume support
  useEffect(() => {
    if (countdown === null || countdownPaused) return;

    if (countdown > 0) {
      timerRef.current = window.setTimeout(() => {
        setCountdown((c) => {
          if (c === null || countdownPaused) return c;
          if (c <= 1) {
            // Completed transition on next tick
            window.setTimeout(() => {
              onSetDefcon(targetLevel);
              setConfirmStep(false);
              setCountdownPaused(false);
              const nowStr = new Date().toISOString().substring(11, 19);
              const newEntry: StrategicLogEntry = {
                timestamp: nowStr,
                level: targetLevel,
                action: `Simulated readiness elevated to DEFCON ${targetLevel} (${DEFCON_DETAILS[targetLevel].code})`,
                operator: 'CHIEF-TACTICAL-CONTROLLER',
                status: targetLevel <= 2 ? 'critical' : targetLevel === 3 ? 'elevated' : 'nominal',
              };
              setLog((prev) => [newEntry, ...prev]);
              onLogEvent?.(`STRATEGIC ALERT: Posture shifted to DEFCON ${targetLevel} (${DEFCON_DETAILS[targetLevel].code})`);
            }, 0);
            return null;
          }
          return c - 1;
        });
      }, 1000);
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }
  }, [countdown, countdownPaused, targetLevel, onSetDefcon, onLogEvent]);

  if (!open) return null;

  const handleStartCountdown = (lvl: DefconLevel) => {
    setTargetLevel(lvl);
    setConfirmStep(true);
  };

  const handleConfirmCountdown = () => {
    setCountdown(10); // 10 second countdown for realistic drill feel
    setCountdownPaused(false);
    const nowStr = new Date().toISOString().substring(11, 19);
    setLog((prev) => [
      {
        timestamp: nowStr,
        level: targetLevel,
        action: `Initiated 10s escalation countdown to DEFCON ${targetLevel}`,
        operator: 'CHIEF-TACTICAL-CONTROLLER',
        status: 'elevated',
      },
      ...prev,
    ]);
  };

  const handleTogglePauseCountdown = () => {
    setCountdownPaused(!countdownPaused);
  };

  const handleResetCountdown = () => {
    setCountdown(10);
    setCountdownPaused(false);
  };

  const handleCancelCountdown = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setCountdown(null);
    setCountdownPaused(false);
    setConfirmStep(false);
    const nowStr = new Date().toISOString().substring(11, 19);
    setLog((prev) => [
      {
        timestamp: nowStr,
        level: currentDefcon,
        action: 'Escalation sequence cancelled by operator',
        operator: 'CHIEF-TACTICAL-CONTROLLER',
        status: 'cleared',
      },
      ...prev,
    ]);
  };

  const handleResetDefcon5 = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setCountdown(null);
    setCountdownPaused(false);
    setConfirmStep(false);
    onSetDefcon(5);
    const nowStr = new Date().toISOString().substring(11, 19);
    setLog((prev) => [
      {
        timestamp: nowStr,
        level: 5,
        action: 'Readiness returned to standard peacetime DEFCON 5 (FADE OUT)',
        operator: 'CHIEF-TACTICAL-CONTROLLER',
        status: 'nominal',
      },
      ...prev,
    ]);
    onLogEvent?.('STRATEGIC ALERT: Readiness returned to DEFCON 5');
  };

  return (
    <div className="dialog-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Strategic Alert Exercise Console">
      <div className="dialog strategic-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Title & Persistent Disclaimer Banner */}
        <div className="strategic-header">
          <div className="strategic-badge">
            <span className="live-pulse amber" />
            FICTIONAL TRAINING SIMULATION · NON-OPERATIONAL DEFENCE EXERCISE
          </div>
          <div className="strategic-title">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            STRATEGIC DEFENCE READINESS SIMULATOR
          </div>
          <div className="strategic-sub">
            Abstract readiness training protocol. Fictional status transitions only — no real weapons or destructive targeting.
          </div>
        </div>

        {/* Current State Indicator */}
        <div className="defcon-status-display" style={{ borderColor: DEFCON_DETAILS[currentDefcon].color }}>
          <div className="defcon-num" style={{ color: DEFCON_DETAILS[currentDefcon].color }}>
            DEFCON {currentDefcon}
          </div>
          <div className="defcon-meta">
            <div className="defcon-codename" style={{ color: DEFCON_DETAILS[currentDefcon].color }}>
              CODE: {DEFCON_DETAILS[currentDefcon].code} — {DEFCON_DETAILS[currentDefcon].label}
            </div>
            <div className="defcon-desc">{DEFCON_DETAILS[currentDefcon].desc}</div>
            <div className="defcon-posture">
              AIR POSTURE: <strong>{DEFCON_DETAILS[currentDefcon].airPosture}</strong>
            </div>
          </div>
        </div>

        {/* Abstract Cinematic Visuals */}
        <div className="abstract-cinematic-banner" style={{ borderColor: DEFCON_DETAILS[currentDefcon].color }}>
          <svg viewBox="0 0 400 36" className="abstract-wave-svg" preserveAspectRatio="none">
            <path
              d="M 0 18 Q 50 2 100 18 T 200 18 T 300 18 T 400 18"
              fill="none"
              stroke={DEFCON_DETAILS[currentDefcon].color}
              strokeWidth="1.5"
              strokeDasharray="4 4"
              opacity="0.8"
            />
            <circle cx="200" cy="18" r="8" fill="none" stroke={DEFCON_DETAILS[currentDefcon].color} strokeWidth="1.5" opacity="0.6" />
          </svg>
          <span className="abstract-banner-text font-mono" style={{ color: DEFCON_DETAILS[currentDefcon].color }}>
            READINESS SECTOR GRID MONITORING // DEFCON {currentDefcon} {DEFCON_DETAILS[currentDefcon].code}
          </span>
        </div>

        {/* Emergency Countdown Overlay if active */}
        {countdown !== null && (
          <div className={`countdown-box ${countdownPaused ? 'paused' : ''}`}>
            <div className="countdown-warning">
              ⚠ TACTICAL ELEVATION DRILL IN PROGRESS · DEFCON {targetLevel} ({DEFCON_DETAILS[targetLevel].code})
            </div>
            <div className="countdown-timer font-mono">
              00:{countdown.toString().padStart(2, '0')}
            </div>
            <div className="countdown-instruction">
              {countdownPaused
                ? 'COUNTDOWN PAUSED BY CONTROLLER. Click Resume to proceed.'
                : 'Emergency synchronizing simulated airbase alert relays. Standby for posture change.'}
            </div>
            <div className="countdown-actions-row">
              <button
                type="button"
                className="btn small"
                onClick={handleTogglePauseCountdown}
              >
                {countdownPaused ? '▶ Resume Countdown' : '❚❚ Pause Countdown'}
              </button>
              <button
                type="button"
                className="btn small"
                onClick={handleResetCountdown}
              >
                ↺ Reset to 10s
              </button>
              <button
                type="button"
                className="btn small danger"
                onClick={handleCancelCountdown}
              >
                Cancel Sequence
              </button>
            </div>
          </div>
        )}

        {/* Confirmation step before countdown starts */}
        {confirmStep && countdown === null && (
          <div className="confirm-elevation-card">
            <div className="confirm-title">
              CONFIRM ELEVATION TO DEFCON {targetLevel} ({DEFCON_DETAILS[targetLevel].code})
            </div>
            <p className="confirm-desc">
              This drill will elevate simulated air defense readiness indicators and log a simulated
              strategic alert change. All participants acknowledge this is a local training exercise.
            </p>
            <div className="dialog-actions">
              <button type="button" className="btn" onClick={() => setConfirmStep(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                style={{
                  background: DEFCON_DETAILS[targetLevel].color,
                  color: '#070c09',
                  borderColor: DEFCON_DETAILS[targetLevel].color,
                  fontWeight: 700,
                }}
                onClick={handleConfirmCountdown}
              >
                PROCEED WITH SIMULATED ESCALATION
              </button>
            </div>
          </div>
        )}

        {/* DEFCON Selector Grid (when no countdown) */}
        {countdown === null && !confirmStep && (
          <div className="defcon-grid">
            {([5, 4, 3, 2, 1] as DefconLevel[]).map((lvl) => {
              const d = DEFCON_DETAILS[lvl];
              const isCurrent = currentDefcon === lvl;
              return (
                <div
                  key={lvl}
                  className={`defcon-card ${isCurrent ? 'current' : ''}`}
                  style={{ borderLeftColor: d.color }}
                >
                  <div className="defcon-card-top">
                    <span className="card-lvl" style={{ color: d.color }}>
                      DEFCON {lvl}
                    </span>
                    <span className="card-code">{d.code}</span>
                    {isCurrent && <span className="active-pill">ACTIVE POSTURE</span>}
                  </div>
                  <div className="card-desc">{d.desc}</div>
                  <div className="card-actions">
                    <button
                      type="button"
                      className={`btn small ${isCurrent ? 'active' : ''}`}
                      disabled={isCurrent}
                      onClick={() => handleStartCountdown(lvl)}
                    >
                      {isCurrent ? 'Currently Active' : `Simulate Elevation to ${lvl}`}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Command Acknowledgement Log */}
        <div className="command-log-section">
          <div className="command-log-header">
            <span>COMMAND ACKNOWLEDGEMENT & EXERCISE INCIDENT LOG</span>
            <button
              type="button"
              className="btn small"
              onClick={() => setShowAAR(!showAAR)}
            >
              {showAAR ? 'Hide AAR' : 'View After-Action Report (AAR)'}
            </button>
          </div>

          {showAAR ? (
            <div className="aar-container font-mono">
              <div className="aar-title">=== GARUD AIRSPACE DEFENSE EXERCISE AFTER-ACTION REPORT ===</div>
              <div className="aar-row">EXERCISE DESIGNATOR: GARUD-ADS-2026-X</div>
              <div className="aar-row">SECURITY PROTOCOL: STRICTLY FICTIONAL / LOCAL ENGINE</div>
              <div className="aar-row">CURRENT POSTURE: DEFCON {currentDefcon} ({DEFCON_DETAILS[currentDefcon].code})</div>
              <div className="aar-row">COMMAND LOG ENTRIES: {log.length} actions registered</div>
              <div className="aar-row">STATUS: Abstract visual simulation completed without real-world telemetry claims.</div>
            </div>
          ) : (
            <div className="command-log-table">
              {log.map((entry, i) => (
                <div key={i} className={`log-row status-${entry.status}`}>
                  <span className="col-time font-mono">{entry.timestamp}</span>
                  <span className="col-lvl" style={{ color: DEFCON_DETAILS[entry.level].color }}>
                    DEFCON {entry.level}
                  </span>
                  <span className="col-action">{entry.action}</span>
                  <span className="col-op font-mono">{entry.operator}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="dialog-actions">
          {currentDefcon !== 5 && (
            <button type="button" className="btn" onClick={handleResetDefcon5}>
              ↺ Step Down to DEFCON 5 (Peacetime)
            </button>
          )}
          <button type="button" className="btn primary" onClick={onClose}>
            Acknowledge & Close
          </button>
        </div>
      </div>
    </div>
  );
}
