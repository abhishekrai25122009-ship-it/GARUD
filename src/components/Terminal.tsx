import { useState, useMemo } from 'react';
import type { SimEvent } from '../engine/sim';

interface TerminalProps {
  events: SimEvent[];
  onSelectTrack: (id: string | null) => void;
  className?: string;
}

const KIND_COLOR: Record<string, string> = {
  acquired: '#4ade80',
  warning: '#f59e0b',
  advisory: '#38d9d6',
  acknowledgement: '#4ade80',
  lost: '#ef4444',
  recovered: '#4ade80',
  escalated: '#ef4444',
  intervention: '#f59e0b',
  note: '#94a3b8',
  scenario: '#38d9d6',
  exercise: '#00f0ff',
};

export default function Terminal({ events, onSelectTrack, className }: TerminalProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const filteredEvents = useMemo(() => {
    let list = events.slice().reverse();
    if (categoryFilter === 'alerts') {
      list = list.filter((e) => ['warning', 'lost', 'escalated'].includes(e.type));
    } else if (categoryFilter === 'scenario') {
      // Exercise results are logged as timestamped notes, so surface those
      // alongside scenario/intervention events under the exercise filter.
      list = list.filter(
        (e) =>
          ['scenario', 'intervention', 'exercise'].includes(e.type) ||
          (e.type === 'note' && e.message.startsWith('EXERCISE')),
      );
    } else if (categoryFilter === 'notes') {
      list = list.filter((e) => e.type === 'note');
    }
    return list.slice(0, 150);
  }, [events, categoryFilter]);

  return (
    <section className={`terminal blacksite-terminal ${collapsed ? 'collapsed' : ''} ${className ?? ''}`} aria-label="Incident Terminal Log">
      <div className="terminal-bar" onClick={() => setCollapsed(!collapsed)} role="button" tabIndex={0}>
        <div className="terminal-title">
          <span className="terminal-icon">▶</span>
          <span>GARUD INCIDENT TIMELINE & DISPATCH LOG</span>
          <span className="terminal-badge font-mono">{events.length} EVENTS</span>
        </div>

        {/* Filter categories */}
        {!collapsed && (
          <div className="terminal-filters" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={`term-filter-btn ${categoryFilter === 'all' ? 'active' : ''}`}
              onClick={() => setCategoryFilter('all')}
            >
              ALL
            </button>
            <button
              type="button"
              className={`term-filter-btn amber ${categoryFilter === 'alerts' ? 'active' : ''}`}
              onClick={() => setCategoryFilter('alerts')}
            >
              ALERTS & LOST
            </button>
            <button
              type="button"
              className={`term-filter-btn cyan ${categoryFilter === 'scenario' ? 'active' : ''}`}
              onClick={() => setCategoryFilter('scenario')}
            >
              EXERCISE / SCENARIO
            </button>
            <button
              type="button"
              className={`term-filter-btn ${categoryFilter === 'notes' ? 'active' : ''}`}
              onClick={() => setCategoryFilter('notes')}
            >
              NOTES
            </button>
          </div>
        )}

        <div className="terminal-collapse-toggle">
          <span>{collapsed ? '▲ EXPAND' : '▼ MINIMIZE'}</span>
        </div>
      </div>

      {!collapsed && (
        <div className="terminal-log font-mono">
          {filteredEvents.length === 0 ? (
            <div className="empty-log">No events recorded in this category.</div>
          ) : (
            filteredEvents.map((ev, index) => {
              const color = KIND_COLOR[ev.type] ?? '#94a3b8';
              return (
                <div
                  key={`${ev.t}-${ev.type}-${ev.trackId ?? 'none'}-${index}`}
                  className={`event-row ${ev.trackId ? 'clickable' : ''}`}
                  onClick={() => ev.trackId && onSelectTrack(ev.trackId)}
                  title={ev.trackId ? `Inspect track ${ev.trackId}` : ev.message}
                >
                  <span className="ev-col-time">{formatSimTime(ev.t)}</span>
                  <span className="ev-col-type" style={{ color }}>
                    [{ev.type.toUpperCase()}]
                  </span>
                  {ev.trackId && (
                    <span className="ev-col-track" style={{ color }}>
                      {ev.trackId}
                    </span>
                  )}
                  <span className="ev-col-msg">{ev.message}</span>
                </div>
              );
            })
          )}
          {events.length > 150 && (
            <div className="truncation-note">
              Older events stored in deterministic memory. Export full JSON for complete archive.
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function formatSimTime(t: number): string {
  const m = Math.floor(t / 60);
  const sec = Math.floor(t % 60);
  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}
