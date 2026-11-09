import { useState, useEffect } from 'react';

interface SatelliteDef {
  id: string;
  name: string;
  type: string;
  altitude: number; // km
  speed: number; // km/s
  period: number; // minutes
  inclination: number; // deg
  coverageRadius: number; // km
  status: 'nominal' | 'scanning' | 'transmitting';
  sensor: string;
  angle: number; // initial orbital phase in radians
  orbitRadiusX: number;
  orbitRadiusY: number;
  color: string;
}

const SATELLITES: SatelliteDef[] = [
  {
    id: 'SAT-01',
    name: 'SKYGUARD-ORB-01',
    type: 'Synthetic Aperture Radar (SAR)',
    altitude: 512,
    speed: 7.61,
    period: 94.8,
    inclination: 51.6,
    coverageRadius: 650,
    status: 'scanning',
    sensor: 'X-Band High-Resolution SAR (0.5m synth)',
    angle: 0.4,
    orbitRadiusX: 320,
    orbitRadiusY: 130,
    color: '#00f0ff',
  },
  {
    id: 'SAT-02',
    name: 'BLACKSITE-EYE-02',
    type: 'Multi-Spectral Optical Recon',
    altitude: 485,
    speed: 7.68,
    period: 94.2,
    inclination: 97.4,
    coverageRadius: 480,
    status: 'transmitting',
    sensor: 'VNIR/SWIR Thermal Optical Imager',
    angle: 2.1,
    orbitRadiusX: 260,
    orbitRadiusY: 180,
    color: '#4ade80',
  },
  {
    id: 'SAT-03',
    name: 'GARUD-RELAY-03',
    type: 'Tactical High-Bandwidth Comms',
    altitude: 1040,
    speed: 7.32,
    period: 105.4,
    inclination: 28.5,
    coverageRadius: 1200,
    status: 'nominal',
    sensor: 'Phased-Array Laser Inter-Satellite Link',
    angle: 4.2,
    orbitRadiusX: 380,
    orbitRadiusY: 90,
    color: '#f59e0b',
  },
];

interface OrbitalViewProps {
  onReturnToRadar: () => void;
}

export default function OrbitalView({ onReturnToRadar }: OrbitalViewProps) {
  const [selectedSatId, setSelectedSatId] = useState<string>('SAT-01');
  const [phase, setPhase] = useState<number>(0);

  // Subtle continuous orbit animation
  useEffect(() => {
    let animId: number;
    let lastT = performance.now();
    const update = (now: number) => {
      const dt = (now - lastT) / 1000;
      lastT = now;
      setPhase((p) => (p + dt * 0.15) % (Math.PI * 2));
      animId = requestAnimationFrame(update);
    };
    animId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animId);
  }, []);

  const selectedSat = SATELLITES.find((s) => s.id === selectedSatId) ?? SATELLITES[0];

  return (
    <div className="orbital-view-container" role="region" aria-label="Orbital Surveillance Visualization">
      {/* Top Banner */}
      <div className="orbital-top-bar">
        <div className="orbital-title-group">
          <span className="orbital-badge">SYNTHETIC ORBITAL LAYER // RESTRICTED</span>
          <span className="orbital-title">LOW-EARTH SPACE SURVEILLANCE MATRIX</span>
          <span className="orbital-fictional-notice">
            FICTIONAL SIMULATION · SYNTHETIC CONSTELLATION ONLY
          </span>
        </div>
        <div className="orbital-actions">
          <button
            type="button"
            className="btn primary return-radar-btn"
            onClick={onReturnToRadar}
          >
            ◀ RETURN TO AIRSPACE RADAR
          </button>
        </div>
      </div>

      <div className="orbital-main">
        {/* SVG Orbital Canvas */}
        <div className="orbital-canvas-wrapper">
          <svg
            viewBox="-450 -250 900 500"
            className="orbital-svg"
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              {/* Radial gradient for Earth curvature */}
              <radialGradient id="earth-glow" cx="0%" cy="100%" r="100%">
                <stop offset="0%" stopColor="#0c2017" stopOpacity="0.9" />
                <stop offset="70%" stopColor="#06120c" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#030805" stopOpacity="0.95" />
              </radialGradient>
              <linearGradient id="atmo-glow" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.4" />
                <stop offset="30%" stopColor="#22c55e" stopOpacity="0.15" />
                <stop offset="100%" stopColor="#000000" stopOpacity="0" />
              </linearGradient>
              <filter id="sat-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Earth horizon arc */}
            <path
              d="M -500 240 Q 0 110 500 240 L 500 350 L -500 350 Z"
              fill="url(#earth-glow)"
              stroke="#263b2e"
              strokeWidth="1.5"
            />
            {/* Atmospheric horizon glow */}
            <path
              d="M -500 240 Q 0 110 500 240"
              fill="none"
              stroke="#00f0ff"
              strokeWidth="2.5"
              strokeOpacity="0.5"
              filter="url(#sat-glow)"
            />

            {/* Ground protected zone sector projection on Earth */}
            <g transform="translate(0, 150)">
              <ellipse cx="0" cy="0" rx="90" ry="24" fill="#00f0ff" fillOpacity="0.08" stroke="#00f0ff" strokeWidth="1" strokeDasharray="3 3" />
              <text x="0" y="4" textAnchor="middle" fill="#00f0ff" fontSize="9" fontFamily="monospace" opacity="0.8">
                GARUD DEFENDED AIRSPACE GROUND SECTOR
              </text>
            </g>

            {/* Orbital Tracks & Satellites */}
            {SATELLITES.map((sat) => {
              const currentAngle = sat.angle + phase * (7.6 / sat.speed);
              const satX = Math.cos(currentAngle) * sat.orbitRadiusX;
              const satY = Math.sin(currentAngle) * sat.orbitRadiusY - 20;
              const isSelected = selectedSatId === sat.id;

              return (
                <g key={sat.id}>
                  {/* Orbital Ellipse */}
                  <ellipse
                    cx="0"
                    cy="-20"
                    rx={sat.orbitRadiusX}
                    ry={sat.orbitRadiusY}
                    fill="none"
                    stroke={sat.color}
                    strokeWidth={isSelected ? 1.5 : 1}
                    strokeOpacity={isSelected ? 0.6 : 0.25}
                    strokeDasharray={isSelected ? '4 3' : '2 5'}
                  />

                  {/* Coverage sensor cone from satellite down to ground */}
                  {isSelected && (
                    <polygon
                      points={`${satX},${satY} -80,150 80,150`}
                      fill={sat.color}
                      fillOpacity="0.07"
                      stroke={sat.color}
                      strokeOpacity="0.3"
                      strokeWidth="0.8"
                    />
                  )}

                  {/* Satellite marker group */}
                  <g
                    transform={`translate(${satX}, ${satY})`}
                    onClick={() => setSelectedSatId(sat.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    {/* Highlight ring if selected */}
                    {isSelected && (
                      <circle
                        cx="0"
                        cy="0"
                        r="16"
                        fill="none"
                        stroke={sat.color}
                        strokeWidth="1.5"
                        strokeDasharray="3 2"
                      />
                    )}

                    {/* Satellite icon: body + solar wings */}
                    <rect x="-4" y="-4" width="8" height="8" fill={sat.color} rx="1" />
                    {/* Left wing */}
                    <line x1="-12" y1="0" x2="-4" y2="0" stroke={sat.color} strokeWidth="2.5" />
                    <rect x="-13" y="-3" width="7" height="6" fill="#081410" stroke={sat.color} strokeWidth="0.8" />
                    {/* Right wing */}
                    <line x1="4" y1="0" x2="12" y2="0" stroke={sat.color} strokeWidth="2.5" />
                    <rect x="6" y="-3" width="7" height="6" fill="#081410" stroke={sat.color} strokeWidth="0.8" />

                    {/* Label */}
                    <text
                      x="0"
                      y="-12"
                      textAnchor="middle"
                      fill={isSelected ? '#ffffff' : sat.color}
                      fontSize="10"
                      fontFamily="monospace"
                      fontWeight={isSelected ? '700' : '400'}
                    >
                      {sat.name}
                    </text>
                  </g>
                </g>
              );
            })}

            {/* Grid overlay lines */}
            <line x1="-420" y1="0" x2="420" y2="0" stroke="#1d3a2b" strokeWidth="0.8" strokeDasharray="3 6" opacity="0.4" />
            <line x1="0" y1="-220" x2="0" y2="220" stroke="#1d3a2b" strokeWidth="0.8" strokeDasharray="3 6" opacity="0.4" />
            <text x="-430" y="15" fill="#3d5a45" fontSize="9" fontFamily="monospace">EQUATORIAL REF 000°</text>
            <text x="5" y="-210" fill="#3d5a45" fontSize="9" fontFamily="monospace">POLAR AXIS 90°N</text>
          </svg>
        </div>

        {/* Selected Satellite Telemetry Sidebar */}
        <div className="orbital-sidebar">
          <div className="sat-card">
            <div className="sat-card-head">
              <span className="sat-name" style={{ color: selectedSat.color }}>
                {selectedSat.name}
              </span>
              <span className={`sat-status-pill status-${selectedSat.status}`}>
                {selectedSat.status.toUpperCase()}
              </span>
            </div>
            <div className="sat-type">{selectedSat.type}</div>

            <div className="sat-telemetry-grid">
              <div className="sat-field">
                <span className="sat-lbl">ORBITAL ALTITUDE:</span>
                <span className="sat-val font-mono">{selectedSat.altitude} km</span>
              </div>
              <div className="sat-field">
                <span className="sat-lbl">ORBITAL VELOCITY:</span>
                <span className="sat-val font-mono">{selectedSat.speed} km/s</span>
              </div>
              <div className="sat-field">
                <span className="sat-lbl">PERIOD:</span>
                <span className="sat-val font-mono">{selectedSat.period} min</span>
              </div>
              <div className="sat-field">
                <span className="sat-lbl">INCLINATION:</span>
                <span className="sat-val font-mono">{selectedSat.inclination}°</span>
              </div>
              <div className="sat-field">
                <span className="sat-lbl">GROUND SWATH:</span>
                <span className="sat-val font-mono">{selectedSat.coverageRadius} km</span>
              </div>
              <div className="sat-field full">
                <span className="sat-lbl">PAYLOAD SENSOR:</span>
                <span className="sat-val">{selectedSat.sensor}</span>
              </div>
            </div>
          </div>

          {/* Constellation Selector List */}
          <div className="constellation-list">
            <div className="constellation-head">SYNTHETIC ORBITAL ASSETS</div>
            {SATELLITES.map((sat) => (
              <div
                key={sat.id}
                className={`constellation-item ${selectedSatId === sat.id ? 'active' : ''}`}
                onClick={() => setSelectedSatId(sat.id)}
                role="button"
                tabIndex={0}
              >
                <div className="item-color-dot" style={{ background: sat.color }} />
                <div className="item-info">
                  <div className="item-name">{sat.name}</div>
                  <div className="item-meta">{sat.altitude} km · {sat.type}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="orbital-disclaimer-box">
            Synthetic orbital layer for tactical demonstration. No live ephemeris or NORAD feeds.
          </div>
        </div>
      </div>
    </div>
  );
}
