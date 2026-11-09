import { useState, useCallback, useEffect, useRef } from 'react';
import { Sim } from './engine/sim';
import type { SimReport, SimView } from './engine/sim';
import Header from './components/Header';
import ControlStrip from './components/ControlStrip';
import MapView, { type MapHandle } from './components/MapView';
import Airspace3D from './components/Airspace3D';
import Roster from './components/Roster';
import Inspector from './components/Inspector';
import AlertsPanel from './components/AlertsPanel';
import Terminal from './components/Terminal';
import CommandCentreStatus from './components/CommandCentreStatus';
import Startup from './components/Startup';
import { GarudEagle } from './components/GarudEagle';
import ReportDialog from './components/ReportDialog';
import OrbitalView from './components/OrbitalView';
import InterceptExerciseModal from './components/InterceptExerciseModal';
import JetScrambleModal from './components/JetScrambleModal';
import StrategicAlertModal, { type DefconLevel } from './components/StrategicAlertModal';
import KeyboardShortcutsModal from './components/KeyboardShortcutsModal';
import { setAudio, playTone, setAmbience } from './lib/audio';
import { speakTactical, setVoiceEnabled } from './lib/voice';
import { usePrefersReducedMotion } from './lib/motion';
import type {
  AnimationStyle,
  InterceptorState,
  JetScrambleState,
  MissionSummaryData,
} from './types/intercept';
import './index.css';

const SCENARIO_CARDS = [
  {
    id: 'routine',
    name: 'Routine Civil Traffic',
    blurb: 'All active transponders authorized. Normal airspace transit with zero intrusions.',
  },
  {
    id: 'boundary',
    name: 'Boundary Approach & Breach',
    blurb: 'Unidentified contact closes on the protected zone perimeter. Demonstrates alert escalation.',
  },
  {
    id: 'course',
    name: 'Tactical Course Diversion',
    blurb: 'Approaching contact vectors away prior to breach. Illustrates forecast prediction updates.',
  },
  {
    id: 'loss',
    name: 'Signal Loss & Recovery',
    blurb: 'Intermittent transponder loss. Demonstrates stale extrapolation, lost contact, and radar re-acquisition.',
  },
];

const JET_CORRIDOR = [
  { x: 12000, y: -6000 }, // Forward Air Station East
  { x: 10000, y: 4000 },  // Alpha Turn
  { x: 0, y: 12000 },     // North Sector Point
  { x: -12000, y: 4000 }, // West Sector Point
  { x: -8000, y: -8000 }, // South Recovery Turn
  { x: 12000, y: -6000 }, // Base Recovery
];

// Fictional interceptor pacing per animation preset (local grid m/s only).
// These are visual-sequence pacing values for the local synthetic grid — they
// are NOT real weapon speeds, ranges, or performance specifications.
const INTERCEPT_SPEEDS: Record<AnimationStyle, number> = {
  quick: 680,
  cruise: 520,
  cinematic: 440,
  // Legacy preset ids kept in sync so older state never falls back silently.
  'quick-streak': 680,
  'ion-trail': 520,
  'arc-display': 440,
};

function scrollToId(id: string): void {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function formatSimTime(t: number): string {
  const m = Math.floor(t / 60);
  const sec = Math.floor(t % 60);
  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

function WingMark({ title, size }: { title?: string; size?: number }) {
  return (
    <GarudEagle
      size={size ?? 38}
      variant="badge"
      title={title ?? 'GARUD Airspace Defense Emblem'}
    />
  );
}

function Hero({
  onOpenConsole,
  onSeeHow,
}: {
  onOpenConsole: () => void;
  onSeeHow: () => void;
}) {
  return (
    <section id="overview" className="hero">
      <div className="hero-inner">
        <div className="hero-kicker">GARUD · AIRSPACE DEFENSE SYSTEM</div>
        <h1>Defend the Sky. Correlate Every Signal.</h1>
        <p className="hero-sub">
          High-performance aerospace situational awareness console with deterministic synthetic radar
          simulations, constant-velocity motion forecasts, tactical intercept exercises, and strategic alert postures.
        </p>
        <div className="hero-actions">
          <button type="button" className="btn primary" onClick={onOpenConsole}>
            Enter GARUD Defense Console
          </button>
          <button type="button" className="btn" onClick={onSeeHow}>
            System Architecture
          </button>
        </div>
      </div>
      <div className="hero-art" aria-hidden="true">
        <svg viewBox="0 0 420 220" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="210" cy="110" r="96" stroke="#1a3d32" strokeWidth="1.5" strokeDasharray="3 6" />
          <circle cx="210" cy="110" r="70" stroke="#00f0ff" strokeWidth="1.2" strokeDasharray="2 5" opacity="0.6" />
          <line x1="210" y1="110" x2="280" y2="40" stroke="#00f0ff" strokeWidth="1.5" opacity="0.8" />
          <path
            d="M40 150 C110 90, 160 60, 210 60 C260 60, 310 90, 380 150"
            stroke="#4ade80"
            strokeWidth="1.5"
            strokeDasharray="2 5"
            opacity="0.8"
          />
          <path
            d="M70 176 C140 130, 190 108, 210 108 C230 108, 280 130, 350 176"
            stroke="#00f0ff"
            strokeWidth="1.5"
            strokeDasharray="1 6"
            opacity="0.7"
          />
          <path d="M20 30 L60 30 L40 12 Z" fill="#4ade80" opacity="0.5" />
          <path d="M400 30 L360 30 L380 12 Z" fill="#f59e0b" opacity="0.5" />
        </svg>
      </div>
    </section>
  );
}

function HowItWorks() {
  const stages = [
    { title: 'Synthetic Telemetry', text: 'Seeded 1 Hz observations with timestamped position & altitude.' },
    { title: 'Velocity Estimation', text: 'Moving-window velocity vectors from verified observations.' },
    { title: 'Motion Projection', text: 'Constant-velocity forecast over configured 20-second horizon.' },
    { title: 'Boundary Verification', text: 'Protected-zone cylindrical geometry and flight-level constraints.' },
    { title: 'Explained Advisory', text: 'Auditable alert rules with explicit reasons & time-to-breach.' },
  ];
  return (
    <section id="how" className="how">
      <div className="section-head">
        <div className="kicker">DEFENCE ARCHITECTURE</div>
        <h2>Deterministic Signal Correlation</h2>
        <p>
          Designed for human-in-the-loop tactical decision making: every alert provides verifiable
          mathematical justification, lead time, and forecast verification.
        </p>
      </div>
      <div className="how-diagram">
        <svg viewBox="0 0 960 140" role="img" aria-label="Synthetic telemetry to explained alerts flow">
          {stages.map((stage, index) => {
            const x = 30 + index * 185;
            const y = 35;
            return (
              <g key={stage.title}>
                {index > 0 && (
                  <path
                    d={`M ${x - 25} ${y + 30} L ${x} ${y + 30}`}
                    stroke="#00f0ff"
                    strokeWidth="1.5"
                    strokeDasharray="2 2"
                    markerEnd="url(#how-arrow)"
                    opacity="0.7"
                  />
                )}
                <rect x={x} y={y} width="160" height="60" rx="4" fill="#0c1813" stroke="#263b2e" />
                <text x={x + 80} y={y + 24} textAnchor="middle" fontSize="12" fill="#00f0ff" fontWeight="600" fontFamily="monospace">
                  {stage.title}
                </text>
                <text x={x + 80} y={y + 44} textAnchor="middle" fontSize="9.5" fill="#94a3b8">
                  {stage.text}
                </text>
              </g>
            );
          })}
          <defs>
            <marker id="how-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0 0 L6 3 L0 6 Z" fill="#00f0ff" />
            </marker>
          </defs>
        </svg>
      </div>
      <div className="how-note">
        <strong>OPERATOR VERIFICATION MANDATE:</strong> Alerts are explainable decision-support outputs. Automated lethal response is prohibited.
      </div>
    </section>
  );
}

function ScenarioGallery({
  onRunScenario,
}: {
  onRunScenario: (id: string) => void;
}) {
  return (
    <section id="scenarios" className="scenarios">
      <div className="section-head">
        <div className="kicker">DEFENCE DRILLS</div>
        <h2>Simulated Tactical Pressures</h2>
        <p>Four repeatable scenarios testing radar correlation, alert management, and escort procedures.</p>
      </div>
      <div className="scenario-grid">
        {SCENARIO_CARDS.map((card) => (
          <div className="scenario-card" key={card.id}>
            <div className="scenario-mark" aria-hidden="true">
              <svg viewBox="0 0 60 40" width="80" height="50">
                <circle cx="30" cy="20" r="16" fill="none" stroke="#00f0ff" strokeWidth="1.5" strokeDasharray="3 3" />
                <path d="M22 20 L30 8 L38 20 Z" fill="#4ade80" />
              </svg>
            </div>
            <h3>{card.name}</h3>
            <p>{card.blurb}</p>
            <button type="button" className="btn small" onClick={() => onRunScenario(card.id)}>
              Run Exercise Drill
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function Results({ view }: { view: SimView | null }) {
  const metrics = view?.metrics ?? null;
  const scored = metrics?.scoredSamples ?? 0;
  const meanError = metrics?.forecast10sMeanError ?? null;
  const warningLead = metrics?.warningLeadTime ?? null;

  return (
    <section id="results" className="results">
      <div className="section-head">
        <div className="kicker">METRICS & BOUNDARIES</div>
        <h2>Computational Run Telemetry</h2>
        <p>Real-time forecast error scoring from current simulation state.</p>
      </div>
      <div className="results-grid">
        <div className="result-card">
          <div className="result-value font-mono cyan">
            {scored > 0 && meanError !== null ? `${meanError.toFixed(1)} m` : 'Awaiting samples'}
          </div>
          <div className="result-label">Forecast Mean Error (10s Horizon)</div>
        </div>
        <div className="result-card">
          <div className="result-value font-mono green">{scored}</div>
          <div className="result-label">Scored Forecast Samples</div>
        </div>
        <div className="result-card">
          <div className="result-value font-mono amber">
            {warningLead !== null ? `${warningLead.toFixed(0)} s` : 'Perimeter Clear'}
          </div>
          <div className="result-label">Warning Lead Time (Entry Alert)</div>
        </div>
      </div>
      <div className="results-limits">
        <h3>Operational Boundaries of Simulation</h3>
        <ul>
          <li>All tracks, coordinates, and observations are synthetically computed using local coordinates.</li>
          <li>Constant-velocity projection assumption; kinematic degradation occurs during high-g maneuvers.</li>
          <li>Zero connection to live FAA/ATC systems, real radar hardware, or weapon command links.</li>
          <li>Designed for training, user-interface evaluation, and procedural drills only.</li>
        </ul>
      </div>
    </section>
  );
}

function SiteNav({ onOpenConsole }: { onOpenConsole: () => void }) {
  const [open, setOpen] = useState(false);
  const links = [
    { id: 'overview', label: 'Overview' },
    { id: 'console', label: 'Command Console' },
    { id: 'how', label: 'Architecture' },
    { id: 'scenarios', label: 'Drills' },
    { id: 'results', label: 'Results' },
  ];
  return (
    <header className="site-nav">
      <a className="site-brand" href="#overview">
        <WingMark size={32} title="GARUD Airspace Defense Emblem" />
        <span>GARUD</span>
      </a>
      <nav className={`site-links ${open ? 'open' : ''}`}>
        {links.map((l) => (
          <a key={l.id} href={`#${l.id}`} onClick={() => setOpen(false)}>
            {l.label}
          </a>
        ))}
        <button
          type="button"
          className="btn small"
          onClick={() => {
            setOpen(false);
            onOpenConsole();
          }}
        >
          Launch Console
        </button>
      </nav>
      <button
        type="button"
        className="btn small site-nav-toggle"
        aria-expanded={open}
        aria-controls="site-nav-menu"
        onClick={() => setOpen((o) => !o)}
      >
        Menu
      </button>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="site-footer">
      <WingMark size={48} title="GARUD Airspace Defense Emblem" />
      <div className="site-footer-tag">SEE THE SKY. PROTECT THE HORIZON.</div>
      <div className="site-footer-sub">
        GARUD // AIRSPACE DEFENSE SYSTEM · BUILD 02
      </div>
      <div className="site-footer-sub">
        Deterministic synthetic simulation. Operator review remains essential.
      </div>
    </footer>
  );
}

function HelpDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="dialog-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="dialog help-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="help-head">
          <strong className="cyan">TACTICAL OPERATING PROCEDURES</strong>
          <button type="button" className="btn small" onClick={onClose}>
            ✕ Close
          </button>
        </div>
        <ol className="help-steps">
          <li>Select a tactical scenario from the control strip (e.g. Boundary Approach).</li>
          <li>Inspect radar contacts by clicking directly on scope markers or the roster.</li>
          <li>Review unidentified contacts in the Inspector console.</li>
          <li>Click <strong>INITIATE INTERCEPT SIMULATION</strong> to authorize a simulated escort.</li>
          <li>Select visual presentation styles (Quick Streak, Ion Trail, Arc Display, Cinematic).</li>
          <li>Launch <strong>JET SCRAMBLE EXERCISE</strong> for synthetic defensive patrol formations.</li>
          <li>Adjust strategic readiness via the <strong>DEFCON</strong> posture console.</li>
          <li>Export comprehensive incident records (JSON / CSV) for after-action review.</li>
        </ol>
        <div className="help-note">
          Press <strong>?</strong> at any time to inspect full keyboard hotkeys.
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const simRef = useRef<Sim | null>(null);
  const mapRef = useRef<MapHandle | null>(null);
  const [startup, setStartup] = useState(true);
  const [view, setView] = useState<SimView | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [audioOn, setAudioOn] = useState(false);
  const [ambienceOn, setAmbienceOn] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);
  const [report, setReport] = useState<SimReport | null>(null);
  const [focusConsole, setFocusConsole] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<'map' | 'tracks' | 'alerts' | 'events'>('map');
  const [workspaceCollapsed, setWorkspaceCollapsed] = useState(true);
  const workspaceClass = workspaceCollapsed ? 'collapsed' : '';

  // Feature 4: Strategic Alert State
  const [defcon, setDefcon] = useState<DefconLevel>(5);
  const [strategicModalOpen, setStrategicModalOpen] = useState(false);

  // Feature 5: Orbital View State
  const [activeView, setActiveView] = useState<'radar' | 'orbital'>('radar');

  // Feature 3 & Part B: Intercept Exercise State
  const [selectedStyle, setSelectedStyle] = useState<AnimationStyle>('cinematic');
  const [interceptModalOpen, setInterceptModalOpen] = useState(false);
  const [interceptorState, setInterceptorState] = useState<InterceptorState | null>(null);

  // Encounter result feedback (once per result): frozen targets on success,
  // one-shot scope feedback at the encounter location, and mission tallies.
  const [encounterFeedback, setEncounterFeedback] = useState<{ targetId: string; pos: { x: number; y: number; z: number }; outcome: "success" | "miss"; key: string; t: number } | null>(null);
  const [disabledTrackIds, setDisabledTrackIds] = useState<Set<string>>(new Set());
  const [frozenTrackPositions, setFrozenTrackPositions] = useState<
    Record<string, { x: number; y: number; z: number; heading: number }>
  >({});
  const [missionCounts, setMissionCounts] = useState({ intercepted: 0, missed: 0 });
  // Identity guard: the terminal event-log entry of a result is created exactly
  // once, so re-renders (e.g. a post-run preset switch) never re-fire effects.
  const handledResultRef = useRef<object | null>(null);

  // Part C: Fighter-Jet Scramble Exercise State
  const [jetScrambleModalOpen, setJetScrambleModalOpen] = useState(false);
  const [jetScrambleState, setJetScrambleState] = useState<JetScrambleState | null>(null);

  const lastAlertIds = useRef<Set<string>>(new Set<string>());
  const lastLostTracks = useRef<Set<string>>(new Set<string>());

  // Ref to always read live simulation tracks in the animation loop
  const viewRef = useRef<SimView | null>(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  // Respect the OS reduced-motion preference for the intercept animation.
  const reducedMotion = usePrefersReducedMotion();

  // Simulation initialization
  useEffect(() => {
    const sim = new Sim({ seed: 20240101, scenarioId: 'routine' });
    simRef.current = sim;
    const unsub = sim.subscribe((v) => setView(v));
    return () => unsub();
  }, []);

  // Audio tone triggers on new alerts
  useEffect(() => {
    if (!view || !simRef.current) return;

    const currentAlertIds = new Set<string>(view.alerts.map((a) => a.id));
    const newAlerts = view.alerts.filter((a) => !lastAlertIds.current.has(a.id));
    lastAlertIds.current = currentAlertIds;

    for (const a of newAlerts) {
      if (a.severity === 'critical') {
        playTone('warning');
        speakTactical('Warning. Unidentified contact breach detected in defense sector.', true);
      } else if (a.severity === 'warning') {
        playTone('warning');
        speakTactical('Advisory. Track deviation near protected zone.');
      }
      // Do NOT auto-select a track on new alerts. The operator must explicitly
      // select a contact; the camera must remain under manual control.
    }

    const currentlyLost = new Set<string>(
      view.tracks.filter((t) => t.freshness === 'lost').map((t) => t.id)
    );
    const newlyLost = [...currentlyLost].filter((id) => !lastLostTracks.current.has(id));
    lastLostTracks.current = currentlyLost;
    for (const _ of newlyLost) playTone('lost');
  }, [view, selectedId]);

  // =========================================================================
  // INDEPENDENT INTERCEPT ANIMATION LOOP (Part A & Part B)
  // Runs independently of view.paused. Uses requestAnimationFrame & performance.now()
  // =========================================================================
  const isInterceptorRunning = Boolean(
    interceptorState &&
      !interceptorState.paused &&
      !['complete', 'miss', 'aborted', 'idle'].includes(interceptorState.stage)
  );

  useEffect(() => {
    if (!isInterceptorRunning) return;

    let animId = 0;
    let stepId: ReturnType<typeof setInterval> | null = null;
    let lastTime = performance.now();

    const advance = (dt: number) => {
      // Reject negative deltas: the first rAF timestamp can precede the
      // performance.now() captured when the loop started, which would rewind
      // elapsed time and progress. Clamp the upper bound to prevent leaps.
      const clamped = Math.max(0, Math.min(dt, 0.25));

      setInterceptorState((prev) => {
        if (!prev || prev.paused || ['complete', 'miss', 'aborted', 'idle'].includes(prev.stage)) {
          return prev;
        }

        const target = viewRef.current?.tracks.find((t) => t.id === prev.targetId);
        const targetPos = target?.estPos ?? target?.pos ?? { x: 0, y: 0, z: 22000 };

        let newX: number;
        let newY: number;

        const maxDuration =
          prev.totalDuration ?? (prev.style === 'quick' || prev.style === 'quick-streak' ? 11 : 16);
        const newElapsed = prev.elapsed + clamped;
        const tRatio = Math.min(1, newElapsed / maxDuration);

        // Curved display path: the cinematic preset (and its legacy arc alias)
        // rides a quadratic bezier through the lofted control point.
        if ((prev.style === 'arc-display' || prev.style === 'cinematic') && prev.arcControl) {
          const omt = 1 - tRatio;
          const p0 = prev.originPos;
          const p1 = prev.arcControl;
          const p2 = targetPos;
          newX = omt * omt * p0.x + 2 * omt * tRatio * p1.x + tRatio * tRatio * p2.x;
          newY = omt * omt * p0.y + 2 * omt * tRatio * p1.y + tRatio * tRatio * p2.y;
        } else {
          // Direct proportional guidance path: vectors all the way from origin to moving target
          newX = prev.originPos.x + (targetPos.x - prev.originPos.x) * tRatio;
          newY = prev.originPos.y + (targetPos.y - prev.originPos.y) * tRatio;
        }

        const newZ = 500 + ((targetPos.z ?? 22000) - 500) * tRatio;
        const moveDx = newX - prev.pos.x;
        const moveDy = newY - prev.pos.y;
        const targetHeading =
          Math.hypot(moveDx, moveDy) > 0.05
            ? ((Math.atan2(moveDx, moveDy) * 180) / Math.PI + 360) % 360
            : prev.heading;

        const dist = Math.hypot(targetPos.x - newX, targetPos.y - newY);
        const progress = Math.min(100, tRatio * 100);

        // Append to trail history
        const newTrail = [...prev.trailHistory, { x: newX, y: newY, t: newElapsed }].slice(-60);

        let nextStage = prev.stage;
        const newEvents = [...prev.eventLog];

        if (dist <= 250 || tRatio >= 1 || newElapsed >= maxDuration) {
          // At intercept point, align exact coordinates with target
          const plannedMiss = prev.targetOutcome === 'miss';
          if (!plannedMiss) {
            newX = targetPos.x;
            newY = targetPos.y;
          }
          nextStage = plannedMiss ? 'miss' : 'complete';
          if (!plannedMiss) {
            speakTactical('Interception confirmed. Target down. Airspace secure.', true);
          } else {
            speakTactical('Advisory. Intercept contact separated. Target remains active.');
          }
          newEvents.push({
            t: newElapsed,
            timeStr: formatSimTime(newElapsed),
            stage: nextStage,
            text: plannedMiss
              ? `EXERCISE MISS: Evasive separation at ${Math.round(dist)}m — contact not established. Target remains ACTIVE.`
              : `EXERCISE COMPLETE: Target intercepted. Rendezvous and neutralization confirmed at encounter point.`,
            type: plannedMiss ? 'warn' : 'success',
          });
          // Result tone plays once, in the result side-effect below, and only
          // when audio is enabled.
        } else if (dist <= 2000 && prev.stage !== 'rendezvous') {
          nextStage = 'rendezvous';
          speakTactical('Interception in progress. Terminal rendezvous initiated.');
          newEvents.push({
            t: newElapsed,
            timeStr: formatSimTime(newElapsed),
            stage: 'rendezvous',
            text: `Terminal rendezvous initiated. Matching target altitude and vector. Standoff range: ${Math.round(dist)}m.`,
            type: 'info',
          });
        } else if (newElapsed >= 3.5 && prev.stage === 'scramble') {
          nextStage = 'vector';
          newEvents.push({
            t: newElapsed,
            timeStr: formatSimTime(newElapsed),
            stage: 'vector',
            text: `Vector lock established. Closure rate ${Math.round(prev.speed)} m/s. Range: ${(dist / 1000).toFixed(1)} km.`,
            type: 'info',
          });
        }

        return {
          ...prev,
          pos: { x: newX, y: newY, z: newZ },
          heading: targetHeading,
          distanceToTarget: dist,
          elapsed: newElapsed,
          // Completion must show a full bar even when rendezvous happens early;
          // Math.max keeps the bar monotonic if a mid-run preset switch changes
          // the progress denominator.
          progress:
            nextStage === 'complete' || nextStage === 'miss'
              ? 100
              : Math.max(prev.progress, progress),
          stage: nextStage,
          trailHistory: newTrail,
          eventLog: newEvents,
        };
      });
    };

    if (reducedMotion) {
      // Reduced motion: stepped 4 Hz presentation instead of per-frame animation.
      stepId = setInterval(() => advance(0.25), 250);
    } else {
      const tick = (now: number) => {
        const deltaSec = (now - lastTime) / 1000;
        lastTime = now;
        advance(deltaSec);
        animId = requestAnimationFrame(tick);
      };
      animId = requestAnimationFrame(tick);
    }

    return () => {
      if (animId) cancelAnimationFrame(animId);
      if (stepId !== null) clearInterval(stepId);
    };
  }, [isInterceptorRunning, reducedMotion]);

  // =========================================================================
  // ENCOUNTER RESULT SIDE-EFFECTS (once per result)
  // Success: freeze the target on the scope, spawn one-shot impact feedback,
  //          log a timestamped timeline note, count the intercept, play the
  //          optional enabled-audio tone.
  // Miss:    spawn the miss indicator only, keep the target active, log and
  //          count the miss. No success effect of any kind.
  // =========================================================================
  useEffect(() => {
    const st = interceptorState;
    if (!st || (st.stage !== 'complete' && st.stage !== 'miss')) return;
    const terminalEvent = st.eventLog[st.eventLog.length - 1];
    if (!terminalEvent || handledResultRef.current === terminalEvent) return;
    handledResultRef.current = terminalEvent;

    const outcome = st.stage === 'complete' ? 'success' : 'miss';
    const track = viewRef.current?.tracks.find((t) => t.id === st.targetId);
    const pos = track?.estPos ?? track?.pos ?? st.pos;
    const callsign = track?.callsign ?? st.targetId;

    setEncounterFeedback({
      targetId: st.targetId,
      pos: { x: pos.x, y: pos.y, z: pos.z },
      t: viewRef.current?.time ?? 0,
      outcome,
      key: st.targetId,
    });

    if (outcome === 'success') {
      setDisabledTrackIds((prev) => new Set(prev).add(st.targetId));
      setFrozenTrackPositions((prev) => ({
        ...prev,
        [st.targetId]: {
          x: pos.x,
          y: pos.y,
          z: pos.z,
          heading: track?.heading ?? st.heading,
        },
      }));
      setMissionCounts((prev) => ({ ...prev, intercepted: prev.intercepted + 1 }));
      simRef.current?.addNote(
        st.targetId,
        `EXERCISE SUCCESS — ${callsign} (${st.targetId}) DISABLED / INTERCEPTED by INT-ALPHA at T+${formatSimTime(st.elapsed)}. Encounter position frozen on scope.`,
      );
      playTone('ack'); // no-ops unless the operator enabled audio
    } else {
      setMissionCounts((prev) => ({ ...prev, missed: prev.missed + 1 }));
      simRef.current?.addNote(
        st.targetId,
        `EXERCISE MISS — ${callsign} (${st.targetId}) evaded INT-ALPHA contact at T+${formatSimTime(st.elapsed)}. Target remains ACTIVE.`,
      );
    }
  }, [interceptorState]);

  // =========================================================================
  // FIGHTER-JET SCRAMBLE ANIMATION LOOP (Part C)
  // Animates VIPER Flight along predetermined patrol circuit
  // =========================================================================
  const isJetScrambleRunning = Boolean(
    jetScrambleState &&
      !jetScrambleState.paused &&
      !['complete', 'aborted', 'idle'].includes(jetScrambleState.stage)
  );

  useEffect(() => {
    if (!isJetScrambleRunning) return;

    let animId: number;
    let lastTime = performance.now();
    const totalDuration = 24; // 24 second circuit

    const tick = (now: number) => {
      const deltaSec = (now - lastTime) / 1000;
      lastTime = now;
      // Reject negative deltas: the first rAF timestamp can precede the
      // performance.now() captured at start/resume, which rewound elapsed
      // time (the drill read "-0.4 s" and progress moved backwards).
      const dt = Math.max(0, Math.min(deltaSec, 0.1));

      setJetScrambleState((prev) => {
        if (!prev || prev.paused || ['complete', 'aborted', 'idle'].includes(prev.stage)) {
          return prev;
        }

        const newElapsed = prev.elapsed + dt;
        const progress = Math.min(100, (newElapsed / totalDuration) * 100);

        // Corridor segment interpolation
        const corridor = prev.flightCorridor ?? JET_CORRIDOR;
        if (!corridor || corridor.length < 2) return prev;
        const numSegments = Math.max(1, corridor.length - 1);
        const safeElapsed = Number.isFinite(newElapsed) && newElapsed >= 0 ? newElapsed : 0;
        const normTime = Math.max(0, Math.min(0.9999, safeElapsed / totalDuration));
        const segmentFloat = normTime * numSegments;
        const segmentIdx = Math.max(0, Math.min(Math.floor(segmentFloat), numSegments - 1));
        const segT = Math.max(0, Math.min(1, segmentFloat - segmentIdx));

        const pA = corridor[segmentIdx] ?? corridor[0];
        const pB = corridor[segmentIdx + 1] ?? corridor[corridor.length - 1] ?? pA;

        // Lead jet position
        const leadX = pA.x + (pB.x - pA.x) * segT;
        const leadY = pA.y + (pB.y - pA.y) * segT;
        const segDx = pB.x - pA.x;
        const segDy = pB.y - pA.y;
        const heading = ((Math.atan2(segDx, segDy) * 180) / Math.PI + 360) % 360;

        // Wingman jet offset (echelon right: -350m East, -200m North)
        const wingX = leadX - 350;
        const wingY = leadY - 200;

        let nextStage = prev.stage;
        const newEvents = [...prev.eventLog];

        if (newElapsed >= totalDuration) {
          nextStage = 'complete';
          newEvents.push({
            t: newElapsed,
            timeStr: formatSimTime(newElapsed),
            stage: 'complete',
            text: 'VIPER Flight completed 360° defensive sector sweep. Safe recovery logged.',
            type: 'success',
          });
          playTone('ack');
        } else if (newElapsed >= 18 && prev.stage !== 'return') {
          nextStage = 'return';
          newEvents.push({
            t: newElapsed,
            timeStr: formatSimTime(newElapsed),
            stage: 'return',
            text: 'Patrol complete. Joining controlled recovery descent corridor.',
            type: 'info',
          });
        } else if (newElapsed >= 9 && prev.stage !== 'patrol') {
          nextStage = 'patrol';
          newEvents.push({
            t: newElapsed,
            timeStr: formatSimTime(newElapsed),
            stage: 'patrol',
            text: 'Perimeter sector sweep active. Sensors sweeping 360° buffer boundary.',
            type: 'info',
          });
        } else if (newElapsed >= 4.5 && prev.stage === 'launch') {
          nextStage = 'airborne';
          newEvents.push({
            t: newElapsed,
            timeStr: formatSimTime(newElapsed),
            stage: 'airborne',
            text: 'Airborne passing FL280. Establishing echelon-right patrol formation.',
            type: 'info',
          });
        }

        const leadTrail = [...prev.jets[0].trail, { x: leadX, y: leadY }].slice(-50);
        const wingTrail = [...prev.jets[1].trail, { x: wingX, y: wingY }].slice(-50);

        return {
          ...prev,
          elapsed: newElapsed,
          progress,
          stage: nextStage,
          eventLog: newEvents,
          jets: [
            {
              ...prev.jets[0],
              pos: { x: leadX, y: leadY, z: 28000 },
              heading,
              trail: leadTrail,
            },
            {
              ...prev.jets[1],
              pos: { x: wingX, y: wingY, z: 27800 },
              heading,
              trail: wingTrail,
            },
          ],
        };
      });

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [isJetScrambleRunning]);

  // Audio Toggles
  const toggleAudio = useCallback(() => {
    const on = !audioOn;
    setAudio(on);
    setAudioOn(on);
    if (on) playTone('ack');
  }, [audioOn]);

  const handleToggleAmbience = useCallback(
    (on: boolean) => {
      setAmbience(on);
      setAmbienceOn(on);
    },
    []
  );

  const toggleVoice = useCallback(() => {
    const next = !voiceOn;
    setVoiceOn(next);
    setVoiceEnabled(next);
    if (next) speakTactical('JARVIS command voice active.', true);
  }, [voiceOn]);

  // Playback & Scenario Controls
  const onScenario = useCallback((id: string) => {
    simRef.current?.setScenario(id);
    setSelectedId(null);
    setInterceptorState(null);
    setJetScrambleState(null);
    // New scenario = new mission: clear encounter results and tallies.
    setEncounterFeedback(null);
    setDisabledTrackIds(new Set());
    setFrozenTrackPositions({});
    setMissionCounts({ intercepted: 0, missed: 0 });
    handledResultRef.current = null;
  }, []);

  const fitScene = useCallback(() => {
    mapRef.current?.fitScene();
  }, []);

  const onPauseResume = useCallback(() => {
    simRef.current?.toggle();
  }, []);

  const onReset = useCallback(() => {
    simRef.current?.resetScenario();
    setSelectedId(null);
    setInterceptorState(null);
    setJetScrambleState(null);
    // Full reset clears frozen targets, feedback and mission tallies.
    setEncounterFeedback(null);
    setDisabledTrackIds(new Set());
    setFrozenTrackPositions({});
    setMissionCounts({ intercepted: 0, missed: 0 });
    handledResultRef.current = null;
    fitScene();
  }, [fitScene]);

  const onFitScene = useCallback(() => {
    fitScene();
  }, [fitScene]);

  const onSpeed = useCallback((s: 1 | 2 | 4) => {
    simRef.current?.setSpeed(s);
  }, []);

  const onSelect = useCallback((id: string | null) => {
    setSelectedId(id);
  }, []);

  const onAck = useCallback((alertId: string) => {
    simRef.current?.acknowledge(alertId);
    playTone('ack');
  }, []);

  const onEscalate = useCallback(() => {
    const tr = view?.tracks.find((t) => t.id === selectedId);
    if (!tr) return;
    simRef.current?.escalate(tr.id);
    playTone('ack');
  }, [view, selectedId]);

  const onNote = useCallback(
    (note: string) => {
      const tr = view?.tracks.find((t) => t.id === selectedId);
      if (!tr || !note.trim()) return;
      simRef.current?.addNote(tr.id, note.trim());
    },
    [view, selectedId]
  );

  const onAdvisory = useCallback(
    (ack: boolean) => {
      const tr = view?.tracks.find((t) => t.id === selectedId);
      if (!tr) return;
      simRef.current?.simulateAdvisory(tr.id, ack);
      if (!ack) playTone('warning');
      else playTone('ack');
    },
    [view, selectedId]
  );

  const onExport = useCallback(() => {
    if (!simRef.current) return;
    setReport(simRef.current.generateReport());
    setReportOpen(true);
  }, []);

  const onEnterConsole = useCallback(() => {
    setStartup(false);
    setAudio(true);
    setAudioOn(true);
    playTone('ack');
    simRef.current?.start();
    speakTactical('GARUD airspace defense systems online. Radar grid active.', true);
  }, []);

  // Intercept Exercise Handlers (Feature 3 & Part B)
  const handleSelectStyle = useCallback((style: AnimationStyle) => {
    setSelectedStyle(style);
    setInterceptorState((prev) => {
      if (!prev) return null;
      const baseSpeed = INTERCEPT_SPEEDS[style];
      return {
        ...prev,
        style,
        speed: baseSpeed,
        closureRate: baseSpeed,
      };
    });
  }, []);

  const handleStartIntercept = useCallback(
    (tgtId: string, style?: AnimationStyle, outcome?: 'success' | 'miss') => {
      const origin = { x: 0, y: -8000 };
      const chosenStyle = style ?? selectedStyle;
      const targetTrack = viewRef.current?.tracks.find((t) => t.id === tgtId);
      const targetPos = targetTrack?.estPos ?? targetTrack?.pos ?? { x: 0, y: 0, z: 22000 };
      const initialDist = Math.hypot(targetPos.x - origin.x, targetPos.y - origin.y);
      const initialHdg = ((Math.atan2(targetPos.x - origin.x, targetPos.y - origin.y) * 180) / Math.PI + 360) % 360;

      // Arc display lateral control point
      const midX = (origin.x + targetPos.x) / 2;
      const midY = (origin.y + targetPos.y) / 2;
      const arcControl = { x: midX - 4500, y: midY + 3000 };

      const targetDuration =
        chosenStyle === 'quick' || chosenStyle === 'quick-streak'
          ? 11
          : chosenStyle === 'cruise' || chosenStyle === 'ion-trail'
            ? 15
            : 19;
      const baseSpeed = Math.max(Math.round(initialDist / targetDuration), INTERCEPT_SPEEDS[chosenStyle]);

      // A new run replaces any previous one-shot encounter feedback.
      setEncounterFeedback(null);

      setInterceptorState({
        callsign: 'GARUD-INT-ALPHA',
        pos: { ...origin, z: 500 },
        heading: initialHdg,
        speed: baseSpeed,
        altitude: targetPos.z ?? 22000,
        targetId: tgtId,
        stage: 'scramble',
        progress: 0,
        elapsed: 0,
        distanceToTarget: initialDist,
        closureRate: baseSpeed,
        originPos: origin,
        style: chosenStyle,
        paused: false,
        targetOutcome: outcome ?? 'success',
        totalDuration: targetDuration,
        trailHistory: [{ x: origin.x, y: origin.y, t: 0 }],
        arcControl,
        eventLog: [
          {
            t: 0,
            timeStr: '00:00.0',
            stage: 'scramble',
            text: `Tactical intercept simulation initialized [PRESET: ${chosenStyle.toUpperCase()}]. Scramble authorized for asset INT-ALPHA targeting ${tgtId}.`,
            type: 'info',
          },
        ],
      });
      playTone('ack');
      speakTactical('Tactical interceptor launched. Vectoring asset to target.', true);
    },
    [selectedStyle]
  );

  const handlePauseResumeIntercept = useCallback(() => {
    setInterceptorState((prev) => (prev ? { ...prev, paused: !prev.paused } : null));
  }, []);

  const handleAbortIntercept = useCallback(() => {
    if (!interceptorState) return;
    setInterceptorState((prev) =>
      prev
        ? {
            ...prev,
            stage: 'aborted',
            eventLog: [
              ...prev.eventLog,
              {
                t: prev.elapsed,
                timeStr: formatSimTime(prev.elapsed),
                stage: 'aborted',
                text: 'EXERCISE ABORTED: Simulated interceptor abort sequence registered by controller.',
                type: 'warn',
              },
            ],
          }
        : null
    );
  }, [interceptorState]);

  const handleResetIntercept = useCallback(() => {
    setInterceptorState(null);
    // Return to setup view; mission tallies and frozen contacts persist as the
    // session record until the scenario itself is reset.
    setEncounterFeedback(null);
    handledResultRef.current = null;
  }, []);

  const handleReplayIntercept = useCallback(() => {
    const tgt = interceptorState?.targetId || selectedId || viewRef.current?.tracks[0]?.id || '';
    const st = interceptorState?.style || selectedStyle;
    const outcome = interceptorState?.targetOutcome || 'success';
    handleStartIntercept(tgt, st, outcome);
  }, [interceptorState, selectedId, selectedStyle, handleStartIntercept]);

  // Fighter-Jet Scramble Handlers (Part C)
  const handleStartScramble = useCallback(() => {
    const origin = JET_CORRIDOR[0];
    setJetScrambleState({
      stage: 'launch',
      progress: 0,
      elapsed: 0,
      paused: false,
      flightCorridor: JET_CORRIDOR,
      jets: [
        {
          id: 'VIPER-01',
          callsign: 'VIPER-01 [LEAD]',
          pos: { x: origin.x, y: origin.y, z: 5000 },
          heading: 340,
          speed: 380,
          altitude: 5000,
          trail: [{ x: origin.x, y: origin.y }],
        },
        {
          id: 'VIPER-02',
          callsign: 'VIPER-02 [WING]',
          pos: { x: origin.x - 350, y: origin.y - 200, z: 4900 },
          heading: 340,
          speed: 380,
          altitude: 4900,
          trail: [{ x: origin.x - 350, y: origin.y - 200 }],
        },
      ],
      eventLog: [
        {
          t: 0,
          timeStr: '00:00.0',
          stage: 'launch',
          text: 'JET SCRAMBLE EXERCISE: VIPER Flight cleared for defensive scramble from Forward Air Station East.',
          type: 'info',
        },
      ],
    });
    playTone('ack');
    speakTactical('VIPER combat patrol airborne. Commencing defensive perimeter sweep.', true);
  }, []);

  const handlePauseResumeScramble = useCallback(() => {
    setJetScrambleState((prev) => (prev ? { ...prev, paused: !prev.paused } : null));
  }, []);

  const handleAbortScramble = useCallback(() => {
    if (!jetScrambleState) return;
    setJetScrambleState((prev) =>
      prev
        ? {
            ...prev,
            stage: 'aborted',
            eventLog: [
              ...prev.eventLog,
              {
                t: prev.elapsed,
                timeStr: formatSimTime(prev.elapsed),
                stage: 'aborted',
                text: 'SCRAMBLE EXERCISE ABORTED: Formation returning to base via direct vector.',
                type: 'warn',
              },
            ],
          }
        : null
    );
  }, [jetScrambleState]);

  const handleResetScramble = useCallback(() => {
    setJetScrambleState(null);
  }, []);

  const handleReplayScramble = useCallback(() => {
    handleStartScramble();
  }, [handleStartScramble]);

  // Global Keyboard Shortcuts (Feature 6 & Part E)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement)?.tagName)) {
        return;
      }
      if (event.key === ' ') {
        event.preventDefault();
        onPauseResume();
      } else if (event.key === 'r' || event.key === 'R') {
        event.preventDefault();
        onReset();
      } else if (event.key === '1') {
        onSpeed(1);
      } else if (event.key === '2') {
        onSpeed(2);
      } else if (event.key === '4') {
        onSpeed(4);
      } else if (event.key === 'f' || event.key === 'F') {
        fitScene();
      } else if (event.key === 'i' || event.key === 'I') {
        setInterceptModalOpen((o) => !o);
      } else if (event.key === 'j' || event.key === 'J') {
        setJetScrambleModalOpen((o) => !o);
      } else if (event.key === 'd' || event.key === 'D') {
        setStrategicModalOpen((o) => !o);
      } else if (event.key === 'o' || event.key === 'O') {
        setActiveView((v) => (v === 'radar' ? 'orbital' : 'radar'));
      } else if (event.key === '?') {
        setShortcutsOpen((o) => !o);
      } else if (event.key === 'a' || event.key === 'A') {
        toggleAudio();
      } else if (event.key === 'Escape') {
        setHelpOpen(false);
        setReportOpen(false);
        setInterceptModalOpen(false);
        setJetScrambleModalOpen(false);
        setStrategicModalOpen(false);
        setShortcutsOpen(false);
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onPauseResume, onReset, onSpeed, fitScene, toggleAudio]);

  const scrollToConsole = useCallback(() => {
    scrollToId('console');
  }, []);

  const scrollToHow = useCallback(() => {
    scrollToId('how');
  }, []);

  const runScenario = useCallback(
    (id: string) => {
      onScenario(id);
      setSelectedId(null);
      scrollToConsole();
    },
    [onScenario, scrollToConsole]
  );

  // Guard against white screen
  if (startup) return <Startup onEnter={onEnterConsole} />;

  if (!view) {
    return (
      <div className="startup" role="status" aria-label="Loading Console">
        <div className="startup-card">
          <div className="startup-badge">RESTRICTED // INITIALIZING</div>
          <div className="startup-title">GARUD</div>
          <div className="startup-sub">AIRSPACE DEFENSE SYSTEM · Correlating synthetic telemetry streams…</div>
          <div className="spinner" style={{ margin: '16px auto' }} />
        </div>
      </div>
    );
  }

  const track = view.tracks.find((t) => t.id === selectedId) ?? null;

  // Mission summary: detected/active derived from live view data, result
  // tallies accumulated once per exercise outcome this session.
  const missionSummary: MissionSummaryData = {
    detected: view.tracks.length,
    active: view.tracks.filter((t) => !disabledTrackIds.has(t.id)).length,
    intercepted: missionCounts.intercepted,
    missed: missionCounts.missed,
  };

  return (
    <div className={`garud-page blacksite-app ${focusConsole ? 'console-focus' : ''}`}>
      {!focusConsole && <SiteNav onOpenConsole={scrollToConsole} />}
      {!focusConsole && <Hero onOpenConsole={scrollToConsole} onSeeHow={scrollToHow} />}

      <main>
        <section id="how" className={focusConsole ? 'hidden-section' : ''}>
          <HowItWorks />
        </section>

        <section id="console" className={focusConsole ? 'console-focused' : ''}>
          {/* Tactical Header */}
          <Header
            scenarioName={view.scenarioName}
            time={view.time}
            audioOn={audioOn}
            ambienceOn={ambienceOn}
            voiceOn={voiceOn}
            onToggleAudio={toggleAudio}
            onAmbience={handleToggleAmbience}
            onToggleVoice={toggleVoice}
            currentDefcon={defcon}
            onOpenStrategicAlert={() => setStrategicModalOpen(true)}
            onOpenIntercept={() => setInterceptModalOpen(true)}
            onOpenJetScramble={() => setJetScrambleModalOpen(true)}
            activeView={activeView}
            onToggleView={setActiveView}
            onOpenShortcuts={() => setShortcutsOpen(true)}
            workspaceCollapsed={workspaceCollapsed}
            onToggleWorkspaceCollapsed={() => setWorkspaceCollapsed((c) => !c)}
          />

          {/* Sub-Header Toolbar */}
          <div className="console-toolbar">
            <span className="console-toolbar-label font-mono">
              GARUD COMMAND CENTRE // OPERATIONAL SYNTHETIC ENVIRONMENT
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn small"
                onClick={() => setShortcutsOpen(true)}
              >
                ⌨ Keybinds (?)
              </button>
              <button
                type="button"
                className="btn small"
                onClick={() => setHelpOpen(true)}
              >
                Procedures
              </button>
              <button
                type="button"
                className="btn small"
                onClick={() => setFocusConsole((f) => !f)}
              >
                {focusConsole ? 'Exit Fullscreen' : 'Focus Console'}
              </button>
            </div>
          </div>

          {/* Control Strip & Mission Stats */}
          <ControlStrip
            view={view}
            onScenario={onScenario}
            onPauseResume={onPauseResume}
            onReset={onReset}
            onFitScene={onFitScene}
            onSpeed={onSpeed}
            onExport={onExport}
          />

          {/* Mobile responsive tabs */}
          <div className="tabbar">
            <button
              type="button"
              className={`tab ${mobileTab === 'map' ? 'active' : ''}`}
              onClick={() => setMobileTab('map')}
            >
              Radar Scope
            </button>
            <button
              type="button"
              className={`tab ${mobileTab === 'tracks' ? 'active' : ''}`}
              onClick={() => setMobileTab('tracks')}
            >
              Tracks ({view.tracks.length})
            </button>
            <button
              type="button"
              className={`tab ${mobileTab === 'alerts' ? 'active' : ''}`}
              onClick={() => setMobileTab('alerts')}
            >
              Alerts ({view.alerts.length})
            </button>
            <button
              type="button"
              className={`tab ${mobileTab === 'events' ? 'active' : ''}`}
              onClick={() => setMobileTab('events')}
            >
              Terminal
            </button>
          </div>

          {/* Central Workspace: Roster, Radar/Orbital, Inspector & Alerts */}
          <div className={`workspace tab-${mobileTab} ${workspaceClass}`}>
            {/* Left Column: Track Roster */}
            <Roster
              tracks={view.tracks}
              selectedId={selectedId}
              onSelect={onSelect}
              disabledTrackIds={disabledTrackIds}
              interceptorState={interceptorState}
              className={mobileTab === 'tracks' ? 'tab-visible' : ''}
            />

            {/* Center Column: Radar Map or Orbital Surveillance */}
            <div className={`panel map-cell ${mobileTab === 'map' ? 'tab-visible' : ''}`}>
              {activeView === 'radar' ? (
                <Airspace3D
                  ref={mapRef}
                  view={view}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  showTrails={true}
                  showForecasts={true}
                  showLabels={true}
                  interceptorState={interceptorState}
                  jetScrambleState={jetScrambleState}
                  defcon={defcon}
                  disabledTrackIds={disabledTrackIds}
                  frozenTrackPositions={frozenTrackPositions}
                  encounterFeedback={encounterFeedback}
                  onInitiateIntercept={() => setInterceptModalOpen(true)}
                  onInitiateScramble={() => setJetScrambleModalOpen(true)}
                  fallback={
                    <MapView
                      ref={mapRef}
                      view={view}
                      selectedId={selectedId}
                      onSelect={onSelect}
                      showTrails={true}
                      showForecasts={true}
                      showLabels={true}
                      interceptorState={interceptorState}
                      jetScrambleState={jetScrambleState}
                      selectedStyle={selectedStyle}
                      onSelectStyle={handleSelectStyle}
                      onInitiateIntercept={() => setInterceptModalOpen(true)}
                      onInitiateScramble={() => setJetScrambleModalOpen(true)}
                      defcon={defcon}
                      disabledTrackIds={disabledTrackIds}
                      frozenTrackPositions={frozenTrackPositions}
                      encounterFeedback={encounterFeedback}
                    />
                  }
                />
              ) : (
                <OrbitalView onReturnToRadar={() => setActiveView('radar')} />
              )}
            </div>

            {/* Right Column: Track Inspector & Alert Queue - hidden when collapsed */}
            {workspaceCollapsed ? null : (
              <div className={`panel right-tactical-column ${mobileTab === 'alerts' ? 'tab-visible' : ''}`}>
                <Inspector
                  track={track}
                  alerts={view.alerts}
                  events={view.events}
                  onAck={onAck}
                  onEscalate={onEscalate}
                  onNote={onNote}
                  onAdvisory={onAdvisory}
                  onInitiateIntercept={(tgtId) => {
                    setSelectedId(tgtId);
                    setInterceptModalOpen(true);
                  }}
                  disabledTrackIds={disabledTrackIds}
                  interceptorState={interceptorState}
                  paused={view.paused}
                />
                <AlertsPanel
                  alerts={view.alerts}
                  onAck={onAck}
                  onSelectTrack={onSelect}
                />
              </div>
            )}
          </div>

          {/* Bottom Row: Command-Centre Status (mission summary & sensor health) */}
          <CommandCentreStatus summary={missionSummary} tracks={view.tracks} />

          {/* Bottom Row: Incident Terminal */}
          <Terminal
            events={view.events}
            onSelectTrack={onSelect}
            className={mobileTab === 'events' ? 'tab-visible' : undefined}
          />
        </section>

        <section id="scenarios" className={focusConsole ? 'hidden-section' : ''}>
          <ScenarioGallery onRunScenario={runScenario} />
        </section>

        <section id="results" className={focusConsole ? 'hidden-section' : ''}>
          <Results view={view} />
        </section>
      </main>

      {!focusConsole && <SiteFooter />}

      {/* Modals & Dialogs */}
      <ReportDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        report={report}
      />

      <HelpDrawer
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
      />

      <KeyboardShortcutsModal
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />

      <InterceptExerciseModal
        open={interceptModalOpen}
        onClose={() => setInterceptModalOpen(false)}
        tracks={view.tracks}
        selectedTrackId={selectedId}
        interceptorState={interceptorState}
        selectedStyle={selectedStyle}
        onSelectStyle={handleSelectStyle}
        onStartExercise={handleStartIntercept}
        onPauseResumeExercise={handlePauseResumeIntercept}
        onAbortExercise={handleAbortIntercept}
        onResetExercise={handleResetIntercept}
        onReplayExercise={handleReplayIntercept}
      />

      <JetScrambleModal
        open={jetScrambleModalOpen}
        onClose={() => setJetScrambleModalOpen(false)}
        scrambleState={jetScrambleState}
        onStartScramble={handleStartScramble}
        onPauseResumeScramble={handlePauseResumeScramble}
        onAbortScramble={handleAbortScramble}
        onResetScramble={handleResetScramble}
        onReplayScramble={handleReplayScramble}
      />

      <StrategicAlertModal
        open={strategicModalOpen}
        onClose={() => setStrategicModalOpen(false)}
        currentDefcon={defcon}
        onSetDefcon={(lvl) => {
          setDefcon(lvl);
          speakTactical(`Strategic alert posture updated. DEFCON ${lvl} active.`);
        }}
      />
    </div>
  );
}
