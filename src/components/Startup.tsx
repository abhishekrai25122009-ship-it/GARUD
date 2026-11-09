// Startup panel — skippable tactical boot sequence with instant entry bypass.

import { useState, useEffect } from 'react';
import { GarudEagle } from './GarudEagle';

const STEPS = [
  'Loading GARUD tactical airspace assets',
  'Initializing deterministic airspace simulation engine (seed locked)',
  'Building local synthetic schematic basemap & range rings',
  'Correlating synthetic radar tracks & geofence boundaries',
  'GARUD Airspace Defense Console initialized · Standby',
];

interface StartupProps {
  onEnter: () => void;
}

export default function Startup({ onEnter }: StartupProps) {
  const [stepIdx, setStepIdx] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const t0 = Date.now();
    const id = setInterval(() => {
      const elapsed = Date.now() - t0;
      const idx = Math.min(elapsed / 300, STEPS.length - 1);
      setStepIdx(Math.floor(idx));
      if (elapsed >= 1500 || idx >= STEPS.length - 1) {
        clearInterval(id);
        setDone(true);
      }
    }, 40);
    return () => clearInterval(id);
  }, []);

  const active = Math.min(stepIdx, STEPS.length - 1);

  return (
    <div className="startup" role="dialog" aria-label="GARUD Command Initialization">
      <div className="startup-card">
        <div className="startup-header">
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            <GarudEagle size={58} variant="full" title="GARUD Sovereign Emblem" />
          </div>
          <div className="startup-badge">RESTRICTED // SIMULATION PROTOCOL</div>
          <div className="startup-title">GARUD</div>
          <div className="startup-sub">AIRSPACE DEFENSE SYSTEM · SEE THE SKY. PROTECT THE HORIZON.</div>
        </div>

        <div className="startup-steps" aria-live="polite">
          {STEPS.map((s, i) => (
            <div key={i} className={`step ${i <= active ? 'ok' : 'wait'}`}>
              <span className="step-icon">{i <= active ? '✔' : '··'}</span>
              <span className="step-text">{s}</span>
            </div>
          ))}
        </div>

        <div className="startup-actions">
          <button
            type="button"
            className="btn primary startup-btn"
            onClick={onEnter}
          >
            {done ? 'ENTER GARUD DEFENSE CONSOLE' : 'LAUNCH CONSOLE (SKIP)'}
          </button>
        </div>

        <div className="startup-disclaimer">
          SYNTHETIC LOCAL SIMULATION · NO REAL MILITARY SENSORS OR DESTRUCTIVE CAPABILITIES
        </div>
      </div>
    </div>
  );
}
