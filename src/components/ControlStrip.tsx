import type { SimView } from '../engine/sim';

interface ControlStripProps {
  view: SimView;
  onScenario: (id: string) => void;
  onPauseResume: () => void;
  onReset: () => void;
  onFitScene: () => void;
  onSpeed: (s: 1 | 2 | 4) => void;
  onExport: () => void;
}

export default function ControlStrip({
  view,
  onScenario,
  onPauseResume,
  onReset,
  onFitScene,
  onSpeed,
  onExport,
}: ControlStripProps) {
  const unknownCount = view.tracks.filter((t) => t.auth === 'unknown').length;
  const inZoneCount = view.tracks.filter((t) => t.inZone).length;
  const lostCount = view.tracks.filter((t) => t.freshness === 'lost').length;
  const metrics = view.metrics;
  const meanError = metrics?.forecast10sMeanError ?? null;
  const leadTime = metrics?.warningLeadTime ?? null;

  return (
    <div className="blacksite-control-strip" role="toolbar" aria-label="Simulation Controls & Mission Statistics">
      {/* Playback & Scenario Controls */}
      <div className="control-section playback-controls">
        <div className="control-item">
          <label className="ctrl-label">SCENARIO</label>
          <select
            className="select scenario-select"
            value={view.scenarioId}
            onChange={(e) => onScenario(e.target.value)}
          >
            <option value="routine">Routine Traffic (Clear)</option>
            <option value="boundary">Boundary Approach (Intrusion Drill)</option>
            <option value="course">Course Change (Diversion)</option>
            <option value="loss">Signal Loss & Recovery</option>
          </select>
        </div>

        <button
          type="button"
          className={`btn ${view.paused ? 'primary btn-start' : 'danger btn-pause'}`}
          onClick={onPauseResume}
          title={view.paused ? 'Resume Simulation (Space)' : 'Pause Simulation (Space)'}
        >
          {view.paused ? '▶ RESUME SIM' : '❚❚ PAUSE'}
        </button>

        <button
          type="button"
          className="btn"
          onClick={onReset}
          title="Reset Simulation Scenario (R)"
        >
          ↺ Reset
        </button>

        <button
          type="button"
          className="btn"
          onClick={onFitScene}
          title="Fit Radar Scope to All Targets (F)"
        >
          ⌞ Fit Scope
        </button>

        {/* Speed Controls */}
        <div className="speed-button-group">
          <span className="ctrl-label">RATE</span>
          {([1, 2, 4] as const).map((s) => (
            <button
              key={s}
              type="button"
              className={`btn small speed-btn ${view.speed === s ? 'active' : ''}`}
              onClick={() => onSpeed(s)}
              title={`Simulate at ${s}× real-time speed`}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>

      {/* Mission Statistics HUD */}
      <div className="control-section mission-stats-hud">
        <div className="stat-card" title="Total active radar contacts">
          <span className="stat-lbl">CONTACTS</span>
          <span className="stat-val font-mono">{view.tracks.length}</span>
        </div>

        <div className="stat-card" title="Uncorrelated radar returns">
          <span className="stat-lbl">UNIDENTIFIED</span>
          <span className={`stat-val font-mono ${unknownCount > 0 ? 'amber' : 'green'}`}>
            {unknownCount}
          </span>
        </div>

        <div className="stat-card" title="Contacts inside protected zone">
          <span className="stat-lbl">INTRUSIONS</span>
          <span className={`stat-val font-mono ${inZoneCount > 0 ? 'coral' : 'green'}`}>
            {inZoneCount}
          </span>
        </div>

        <div className="stat-card hide-tablet" title="Contacts with degraded telemetry">
          <span className="stat-lbl">LOST SIGNAL</span>
          <span className={`stat-val font-mono ${lostCount > 0 ? 'coral' : ''}`}>
            {lostCount}
          </span>
        </div>

        <div className="stat-card hide-tablet" title="Measured constant-velocity forecast mean error">
          <span className="stat-lbl">FCST ERR (10s)</span>
          <span className="stat-val font-mono cyan">
            {meanError !== null ? `${meanError.toFixed(1)}m` : 'Measuring…'}
          </span>
        </div>

        <div className="stat-card hide-mobile" title="Warning lead time prior to boundary breach">
          <span className="stat-lbl">WARNING LEAD</span>
          <span className="stat-val font-mono green">
            {leadTime !== null ? `${leadTime.toFixed(0)}s` : 'Active'}
          </span>
        </div>
      </div>

      {/* Export Action */}
      <div className="control-section export-section">
        <button
          type="button"
          className="btn small export-btn"
          onClick={onExport}
          title="Export Comprehensive Local Incident Report (JSON & CSV)"
        >
          📥 EXPORT REPORT
        </button>
      </div>
    </div>
  );
}
