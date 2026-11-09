import type { TrackSnapshot } from '../engine/sim';
import type { MissionSummaryData } from '../types/intercept';

interface CommandCentreStatusProps {
  summary: MissionSummaryData;
  tracks: TrackSnapshot[];
}

function statTone(value: number, warnWhenPositive: boolean): string {
  if (value <= 0) return warnWhenPositive ? 'green' : '';
  return warnWhenPositive ? 'coral' : 'cyan';
}

/**
 * Compact display-only command-centre strip: mission summary (detected /
 * active / intercepted / missed) and sensor-feed health derived purely from
 * existing simulated track data. No controls — nothing here is interactive.
 */
export default function CommandCentreStatus({ summary, tracks }: CommandCentreStatusProps) {
  const live = tracks.filter((t) => t.freshness === 'live').length;
  const stale = tracks.filter((t) => t.freshness === 'stale').length;
  const lost = tracks.filter((t) => t.freshness === 'lost').length;
  const extrapolating = tracks.filter((t) => t.extrapolating).length;
  const meanAge =
    tracks.length > 0
      ? tracks.reduce((sum, t) => sum + t.age, 0) / tracks.length
      : 0;

  return (
    <div className="command-centre-strip" role="group" aria-label="Mission summary and sensor feed health">
      <div className="cc-panel">
        <span className="cc-title">MISSION SUMMARY</span>
        <div className="cc-stat" title="Tracks detected this scenario">
          <span className="lbl">DETECTED</span>
          <span className="val cyan font-mono">{summary.detected}</span>
        </div>
        <div className="cc-stat" title="Tracks still active (not intercepted)">
          <span className="lbl">ACTIVE</span>
          <span className={`val font-mono ${summary.active > 0 ? '' : 'green'}`}>{summary.active}</span>
        </div>
        <div className="cc-stat" title="Successful simulated intercepts this session">
          <span className="lbl">INTERCEPTED</span>
          <span className={`val font-mono ${summary.intercepted > 0 ? 'green' : ''}`}>
            {summary.intercepted}
          </span>
        </div>
        <div className="cc-stat" title="Simulated misses this session (target remained active)">
          <span className="lbl">MISSED</span>
          <span className={`val font-mono ${summary.missed > 0 ? 'amber' : ''}`}>{summary.missed}</span>
        </div>
        <span className="cc-note">Counts are local exercise results this session.</span>
      </div>

      <div className="cc-panel">
        <span className="cc-title">SENSOR FEED HEALTH (SIMULATED)</span>
        <div className="cc-stat" title="Tracks with fresh synthetic observations">
          <span className="lbl">LIVE</span>
          <span className={`val font-mono ${live > 0 ? 'green' : ''}`}>{live}</span>
        </div>
        <div className="cc-stat" title="Tracks whose newest observation is ageing">
          <span className="lbl">STALE</span>
          <span className={`val font-mono ${stale > 0 ? 'amber' : ''}`}>{stale}</span>
        </div>
        <div className="cc-stat" title="Tracks with no recent observation">
          <span className="lbl">LOST</span>
          <span className={`val font-mono ${statTone(lost, true)}`}>{lost}</span>
        </div>
        <div className="cc-stat" title="Mean seconds since newest observation across all tracks">
          <span className="lbl">MEAN OBS AGE</span>
          <span className="val font-mono">{meanAge.toFixed(1)}s</span>
        </div>
        <div className="cc-stat" title="Tracks currently positioned by constant-velocity extrapolation">
          <span className="lbl">EXTRAPOLATED</span>
          <span className={`val font-mono ${statTone(extrapolating, true)}`}>{extrapolating}</span>
        </div>
        <span className="cc-note">Derived from synthetic observation freshness only.</span>
      </div>
    </div>
  );
}
