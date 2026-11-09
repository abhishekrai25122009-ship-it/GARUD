import type { Alert } from '../engine/sim';

interface AlertsPanelProps {
  alerts: Alert[];
  onAck: (id: string) => void;
  onSelectTrack: (id: string | null) => void;
}

export default function AlertsPanel({ alerts, onAck, onSelectTrack }: AlertsPanelProps) {
  return (
    <section className="panel alerts-panel" aria-label="Priority Alerts">
      <div className="panel-header">
        <span>TACTICAL ALERT QUEUE</span>
        <span className={`alert-count-pill font-mono ${alerts.length > 0 ? 'active' : ''}`}>
          {alerts.length} ACTIVE
        </span>
      </div>
      <div className="panel-body alerts-body">
        <div className="alerts-list">
          {alerts.length === 0 ? (
            <div className="empty-alerts">
              <span className="green">✔</span> Airspace perimeter nominal. No active violations.
            </div>
          ) : (
            alerts.map((a) => (
              <div
                key={a.id}
                className={`alert-card sev-${a.severity} ${a.acknowledged ? 'acknowledged' : 'unacknowledged'}`}
                onClick={() => onSelectTrack(a.trackId ?? null)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectTrack(a.trackId ?? null);
                  }
                }}
              >
                <div className="alert-head">
                  <span className="alert-track-id font-mono">{a.trackId}</span>
                  <span className={`alert-sev-badge sev-${a.severity}`}>{a.severity.toUpperCase()}</span>
                  {a.projectedEntryT !== null && (
                    <span className="alert-entry-t font-mono">
                      Entry +{a.projectedEntryT.toFixed(0)}s
                    </span>
                  )}
                </div>

                <div className="alert-reasons">{a.reasons.join(' • ')}</div>

                <div className="alert-meta font-mono">
                  <span>Auth: {a.auth.toUpperCase()}</span>
                  <span>·</span>
                  <span>Age {a.age.toFixed(0)}s</span>
                  <span>·</span>
                  <span className={a.acknowledged ? 'green' : 'amber'}>
                    {a.acknowledged ? 'ACKNOWLEDGED' : 'UNACKNOWLEDGED'}
                  </span>
                </div>

                <div className="alert-actions-bar">
                  <button
                    type="button"
                    className={`btn small ${a.acknowledged ? '' : 'primary'}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onAck(a.id);
                    }}
                  >
                    {a.acknowledged ? '✔ Acknowledged' : 'Acknowledge Alert'}
                  </button>
                  <button
                    type="button"
                    className="btn small"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectTrack(a.trackId ?? null);
                    }}
                  >
                    Inspect Contact ➔
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
