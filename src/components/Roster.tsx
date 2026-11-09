import { useMemo, useState } from 'react';
import type { TrackSnapshot } from '../engine/sim';
import type { InterceptorState } from '../types/intercept';
import { classificationShortLabel, classifyTrack } from '../lib/classification';

interface RosterProps {
  tracks: TrackSnapshot[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  disabledTrackIds?: Set<string>;
  interceptorState?: InterceptorState | null;
  className?: string;
}

type RosterFilter = 'all' | 'unknown' | 'authorized' | 'inzone' | 'intercepted' | 'stale';
type SortField = 'callsign' | 'altitude' | 'speed';

export default function Roster({
  tracks,
  selectedId,
  onSelect,
  disabledTrackIds,
  interceptorState,
  className,
}: RosterProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<RosterFilter>('all');
  const [sortBy, setSortBy] = useState<SortField>('callsign');

  const filteredAndSorted = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    let result = tracks.filter((t) => {
      // Search filter
      const matchesSearch =
        !term ||
        t.callsign.toLowerCase().includes(term) ||
        t.id.toLowerCase().includes(term) ||
        t.registry.toLowerCase().includes(term);

      if (!matchesSearch) return false;

      // Category filter
      const isDisabled = disabledTrackIds?.has(t.id) ?? false;
      if (filter === 'intercepted') return isDisabled;
      if (filter === 'unknown') return t.auth === 'unknown' && !isDisabled;
      if (filter === 'authorized') return t.auth === 'authorized' && !isDisabled;
      if (filter === 'inzone') return t.inZone && !isDisabled;
      if (filter === 'stale') return t.freshness !== 'live' && !isDisabled;
      return true;
    });

    // Sort
    result = [...result].sort((a, b) => {
      if (sortBy === 'altitude') return b.pos.z - a.pos.z;
      if (sortBy === 'speed') return b.speed - a.speed;
      return a.callsign.localeCompare(b.callsign);
    });

    return result;
  }, [tracks, searchTerm, filter, sortBy, disabledTrackIds]);

  const disabledCount = tracks.filter((t) => disabledTrackIds?.has(t.id)).length;
  const liveCount = tracks.length - disabledCount;
  const unknownCount = tracks.filter((t) => t.auth === 'unknown' && !disabledTrackIds?.has(t.id)).length;
  const inZoneCount = tracks.filter((t) => t.inZone && !disabledTrackIds?.has(t.id)).length;

  return (
    <section className={`panel roster-panel ${className ?? ''}`} aria-label="Track Roster">
      <div className="panel-header">
        <span>TRACK ROSTER</span>
        <span className="roster-count-badge font-mono">
          {liveCount}/{tracks.length} LIVE{disabledCount > 0 ? ` · ${disabledCount} INTERCEPTED` : ''}
        </span>
      </div>

      <div className="panel-body roster-body">
        {/* Search Input */}
        <div className="search-wrapper">
          <input
            type="text"
            className="search roster-search"
            placeholder="Search callsign, UUID, registry…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => setSearchTerm('')}
            >
              ✕
            </button>
          )}
        </div>

        {/* Tactical Filter Chips */}
        <div className="filter-chips-row">
          <button
            type="button"
            className={`filter-chip ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            ALL ({tracks.length})
          </button>
          <button
            type="button"
            className={`filter-chip amber ${filter === 'unknown' ? 'active' : ''}`}
            onClick={() => setFilter('unknown')}
          >
            UNID ({unknownCount})
          </button>
          <button
            type="button"
            className={`filter-chip green ${filter === 'authorized' ? 'active' : ''}`}
            onClick={() => setFilter('authorized')}
          >
            AUTH
          </button>
          <button
            type="button"
            className={`filter-chip red ${filter === 'inzone' ? 'active' : ''}`}
            onClick={() => setFilter('inzone')}
          >
            ZONE ({inZoneCount})
          </button>
          {disabledCount > 0 && (
            <button
              type="button"
              className={`filter-chip red ${filter === 'intercepted' ? 'active' : ''}`}
              onClick={() => setFilter('intercepted')}
            >
              INTCP ({disabledCount})
            </button>
          )}
          <button
            type="button"
            className={`filter-chip ${filter === 'stale' ? 'active' : ''}`}
            onClick={() => setFilter('stale')}
          >
            STALE
          </button>
        </div>

        {/* Sort selector */}
        <div className="roster-sort-row">
          <span className="sort-lbl">SORT:</span>
          {(['callsign', 'altitude', 'speed'] as SortField[]).map((field) => (
            <button
              key={field}
              type="button"
              className={`sort-btn ${sortBy === field ? 'active' : ''}`}
              onClick={() => setSortBy(field)}
            >
              {field === 'callsign' ? 'Callsign' : field === 'altitude' ? 'Alt' : 'Spd'}
            </button>
          ))}
        </div>

        {/* Track Rows List */}
        <div className="track-list" role="list">
          {filteredAndSorted.length === 0 ? (
            <div className="empty">No matching radar contacts.</div>
          ) : (
            filteredAndSorted.map((tr) => {
              const isSelected = selectedId === tr.id;
              const isDisabled = disabledTrackIds?.has(tr.id) ?? false;
              const isIntercepting =
                interceptorState?.targetId === tr.id &&
                ['scramble', 'vector', 'rendezvous'].includes(interceptorState.stage);
              const isUnknown = tr.auth === 'unknown';
              const fl = Math.round(tr.pos.z / 100);
              const cls = classifyTrack(tr);

              // Distinct status strictly based on simulation & exercise state
              let statusTag = 'TRACKED';
              let statusClass = 'tracked';
              if (isDisabled) {
                statusTag = 'INTERCEPTED';
                statusClass = 'intercepted';
              } else if (isIntercepting) {
                statusTag = 'INTERCEPTING';
                statusClass = 'intercepting';
              } else if (tr.freshness === 'lost') {
                statusTag = 'LOST';
                statusClass = 'lost';
              } else if (tr.inZone) {
                statusTag = 'IN ZONE';
                statusClass = 'in-zone';
              } else if (tr.projectedEntryT !== null && tr.projectedEntryT > 0) {
                statusTag = 'ENTERING';
                statusClass = 'entering';
              } else if (isUnknown) {
                statusTag = 'INTERCEPT READY';
                statusClass = 'intercept-ready';
              }

              return (
                <div
                  key={tr.id}
                  className={`track-row ${isSelected ? 'selected' : ''} ${tr.inZone ? 'in-zone' : ''} ${isDisabled ? 'intercepted' : ''}`}
                  onClick={() => onSelect(tr.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelect(tr.id);
                    }
                  }}
                >
                  <div
                    className={`dot-status ${isDisabled ? 'intercepted-dot' : tr.freshness} ${
                      isUnknown && !isDisabled ? 'unknown-dot' : ''
                    }`}
                  />

                  <div className="track-main-info">
                    <div className="track-callsign-line">
                      <span className="callsign font-mono">{tr.callsign}</span>
                      {isDisabled ? (
                        <span className="zone-tag intercepted-tag">INTERCEPTED</span>
                      ) : isIntercepting ? (
                        <span className="zone-tag intercepting-tag">ENGAGING</span>
                      ) : tr.inZone ? (
                        <span className="zone-tag">ZONE</span>
                      ) : null}
                    </div>

                    <div className="track-sub-telemetry font-mono">
                      {isDisabled ? (
                        <span className="intercepted-sub">NEUTRALIZED · FROZEN AT FL{fl}</span>
                      ) : (
                        <>
                          <span>FL{fl}</span>
                          <span>·</span>
                          <span>{Math.round(tr.speed * 1.944)}kt</span>
                          <span>·</span>
                          <span>{Math.round(tr.heading)}°</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="track-badge-col">
                    <span
                      className={`roster-auth-badge ${tr.auth} ${cls === 'UNKNOWN' ? 'cls-unknown' : ''}`}
                      title={`Classification: ${cls}`}
                    >
                      {classificationShortLabel(cls)}
                    </span>
                    <span className={`roster-fresh-badge ${statusClass}`}>
                      {statusTag}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
