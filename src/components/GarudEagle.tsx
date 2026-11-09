export interface GarudEagleProps {
  size?: number;
  className?: string;
  variant?: 'full' | 'compact' | 'badge';
  title?: string;
}

/**
 * GARUD — Sovereign Airspace Defense System Emblem.
 * An original, unmistakable tactical eagle vector emblem featuring:
 * - Fierce, focused predator eye with amber-gold iris and target glint
 * - Formidable hooked raptor beak with tactical gold crest
 * - Swept-back aerodynamic plumage facets in deep charcoal and titanium
 * - Luminous aerospace cyan telemetry accents (#00f0ff, #38bdf8)
 * - Scalable geometry optimized for both small favicon (16-32px) and hi-res displays
 */
export function GarudEagle({
  size = 36,
  className = '',
  variant = 'compact',
  title = 'GARUD Airspace Defense Emblem',
}: GarudEagleProps) {
  const isFull = variant === 'full';
  const isBadge = variant === 'badge';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
      className={`garud-eagle-emblem ${className}`}
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}
    >
      <defs>
        {/* Aerospace Glow & Linear Gradients */}
        <filter id="garudGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>

        <linearGradient id="beakGold" x1="40" y1="22" x2="60" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="35%" stopColor="#fbbf24" />
          <stop offset="85%" stopColor="#d97706" />
          <stop offset="100%" stopColor="#92400e" />
        </linearGradient>

        <linearGradient id="eyeAmber" x1="34" y1="21" x2="42" y2="27" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fffbeb" />
          <stop offset="40%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>

        <linearGradient id="featherSlateDark" x1="10" y1="10" x2="40" y2="54" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1e293b" />
          <stop offset="50%" stopColor="#0f172a" />
          <stop offset="100%" stopColor="#070c14" />
        </linearGradient>

        <linearGradient id="featherSlateMid" x1="16" y1="12" x2="36" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#334155" />
          <stop offset="50%" stopColor="#1e293b" />
          <stop offset="100%" stopColor="#090d16" />
        </linearGradient>

        <linearGradient id="cyanAccent" x1="10" y1="10" x2="54" y2="54" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#00f0ff" />
        </linearGradient>

        <linearGradient id="crestWhite" x1="20" y1="6" x2="36" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="60%" stopColor="#e2e8f0" />
          <stop offset="100%" stopColor="#94a3b8" />
        </linearGradient>
      </defs>

      {/* Badge/Full: Background Tactical Shield / Radar Octagon */}
      {(isBadge || isFull) && (
        <g className="garud-shield-backdrop" opacity="0.9">
          {/* Subtle tactical hexagonal / shield ring */}
          <polygon
            points="32,2 58,16 58,48 32,62 6,48 6,16"
            fill="#060b11"
            stroke="#162c3d"
            strokeWidth="1.5"
          />
          <polygon
            points="32,6 54,18 54,46 32,58 10,46 10,18"
            fill="none"
            stroke="#00f0ff"
            strokeWidth="0.8"
            strokeDasharray="4 3"
            opacity="0.35"
          />
          {/* Cyan Corner Tactical Ticks */}
          <line x1="32" y1="3" x2="32" y2="8" stroke="#00f0ff" strokeWidth="1.5" opacity="0.8" />
          <line x1="32" y1="56" x2="32" y2="61" stroke="#00f0ff" strokeWidth="1.5" opacity="0.8" />
          <line x1="7" y1="17" x2="11" y2="19" stroke="#00f0ff" strokeWidth="1.5" opacity="0.8" />
          <line x1="57" y1="17" x2="53" y2="19" stroke="#00f0ff" strokeWidth="1.5" opacity="0.8" />
        </g>
      )}

      {/* EAGLE ANATOMY */}

      {/* 1. Primary Swept Feathers (Back of Head & Neck) */}
      {/* Lowest neck feather */}
      <polygon
        points="10,48 24,47 28,55 18,57"
        fill="url(#featherSlateDark)"
        stroke="#1e293b"
        strokeWidth="0.8"
      />
      {/* Mid-lower swept feather */}
      <polygon
        points="6,38 22,37 28,45 14,47"
        fill="url(#featherSlateDark)"
        stroke="#38bdf8"
        strokeWidth="0.5"
        strokeOpacity="0.4"
      />
      {/* Main middle swept feather - aggressive rake */}
      <polygon
        points="4,28 24,26 31,37 12,38"
        fill="url(#featherSlateMid)"
        stroke="#00f0ff"
        strokeWidth="0.8"
        strokeOpacity="0.6"
      />
      {/* Upper swept nape feather */}
      <polygon
        points="8,19 28,17 33,26 14,27"
        fill="url(#featherSlateMid)"
        stroke="#38bdf8"
        strokeWidth="0.6"
        strokeOpacity="0.5"
      />

      {/* 2. Top Crest Feathers (Supersonic Delta Sweep) */}
      <polygon
        points="14,10 32,10 36,18 20,18"
        fill="url(#crestWhite)"
        stroke="#f8fafc"
        strokeWidth="0.7"
      />
      {/* Forehead crest flare */}
      <polygon
        points="22,5 37,9 41,16 28,15"
        fill="url(#crestWhite)"
        stroke="#00f0ff"
        strokeWidth="0.6"
        strokeOpacity="0.7"
      />

      {/* 3. Main Head & Throat Body */}
      {/* Head core block */}
      <polygon
        points="27,15 42,16 45,23 38,36 26,45 23,32"
        fill="url(#featherSlateDark)"
        stroke="#0f172a"
        strokeWidth="1"
      />
      {/* Throat & Chest forward breastplate */}
      <polygon
        points="38,36 43,38 38,50 26,56 25,44"
        fill="url(#featherSlateMid)"
        stroke="#00f0ff"
        strokeWidth="0.7"
        strokeOpacity="0.5"
      />
      {/* Lower chin wedge */}
      <polygon
        points="38,36 44,37 41,43 36,43"
        fill="#090d16"
        stroke="#1e293b"
        strokeWidth="0.6"
      />

      {/* 4. Powerful Hooked Beak (Fierce Raptor Hook) */}
      {/* Upper Beak Body */}
      <path
        d="M42,21 L48,22 C53,23 58,26 60,31 C61.5,34.5 59.5,39 56.5,41.5 C55,42.8 53.5,42 54.5,39 C55.5,36 54,34 50,33.5 L42,33 Z"
        fill="url(#beakGold)"
        stroke="#f59e0b"
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
      {/* Beak Highlight Ridge (Upper dorsal edge) */}
      <path
        d="M43,21.5 C48,22.5 53,24.5 57,28 C59.5,30.5 60.5,33.5 59.8,36.5 C59.2,38.5 58,40.5 56.5,41.5 C55.8,42 55,41 55.4,39.5 C56.5,36 55.5,33.5 51,32.5 L43,32.2"
        fill="none"
        stroke="#fef08a"
        strokeWidth="1"
        strokeLinecap="round"
      />
      {/* Lower Beak / Cutting Gape */}
      <polygon
        points="42,33.5 50,34 46,38 41,36"
        fill="#b45309"
        stroke="#78350f"
        strokeWidth="0.6"
      />

      {/* 5. Fierce Eyebrow Ridge (Deep tactical overhang creating the commanding glare) */}
      <polygon
        points="31,19 44,20 46,23.5 39,23.5 33,22"
        fill="#020408"
        stroke="#00f0ff"
        strokeWidth="0.6"
      />
      <line
        x1="32"
        y1="20"
        x2="45"
        y2="21.5"
        stroke="#f8fafc"
        strokeWidth="1.2"
        strokeLinecap="round"
      />

      {/* 6. Sharp Predator Eye (Amber Iris + Reticle Pupil + Glint) */}
      {/* Eye Socket Shadow */}
      <polygon points="34,22.5 43,23.2 41.5,27.5 35,26.5" fill="#05080f" />
      {/* Amber Glowing Iris */}
      <path
        d="M35,24 C38,22.8 40.5,23.2 42.5,24.8 C41,27 38.5,27.2 35.8,25.8 Z"
        fill="url(#eyeAmber)"
        stroke="#fbbf24"
        strokeWidth="0.4"
      />
      {/* Dark Slit / Target Pupil */}
      <ellipse cx="38.5" cy="24.8" rx="1.5" ry="1.2" fill="#04060a" />
      {/* Cyan Radar-Lock Spark / Glint */}
      <circle cx="39.2" cy="24.4" r="0.65" fill="#00f0ff" filter="url(#garudGlow)" />
      <circle cx="39.2" cy="24.4" r="0.35" fill="#ffffff" />

      {/* 7. Tactical Cyber / Speed Lines (Echoing high-tech airspace sensors) */}
      {/* Cyan Cheekbone Accent */}
      <path
        d="M33,28 L40,29.5 L36,34"
        fill="none"
        stroke="url(#cyanAccent)"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.9"
      />
      {/* Throat Sensor Line */}
      <line
        x1="28"
        y1="40"
        x2="35"
        y2="42"
        stroke="#00f0ff"
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.75"
      />
      {/* Back Feather Accent Spine */}
      <path
        d="M8,28 L23,27 L18,34"
        fill="none"
        stroke="#38bdf8"
        strokeWidth="0.9"
        strokeLinecap="round"
        opacity="0.6"
      />
    </svg>
  );
}

/**
 * Full branded header lockup:
 * [GARUD EAGLE EMBLEM] + [GARUD / AIRSPACE DEFENSE SYSTEM / SEE THE SKY...]
 */
export function GarudBrandLockup({
  size = 38,
  compact = false,
}: {
  size?: number;
  compact?: boolean;
}) {
  return (
    <div className="garud-brand-lockup" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div className="garud-logo-frame" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <GarudEagle size={size} variant="badge" />
      </div>
      <div className="garud-text-group" style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          className="garud-brand-title font-header"
          style={{
            fontSize: compact ? '1.1rem' : '1.35rem',
            fontWeight: 900,
            letterSpacing: '0.12em',
            lineHeight: 1.1,
            color: '#f8fafc',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span>GARUD</span>
          <span
            className="garud-brand-badge font-mono"
            style={{
              fontSize: '0.62rem',
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: 3,
              background: 'rgba(0, 240, 255, 0.12)',
              border: '1px solid rgba(0, 240, 255, 0.45)',
              color: '#00f0ff',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            ADS-CORE
          </span>
        </div>
        <div
          className="garud-brand-subtitle font-mono"
          style={{
            fontSize: '0.62rem',
            fontWeight: 700,
            letterSpacing: '0.14em',
            color: '#94a3b8',
            marginTop: 2,
            textTransform: 'uppercase',
          }}
        >
          AIRSPACE DEFENSE SYSTEM
        </div>
        {!compact && (
          <div
            className="garud-brand-tagline font-mono"
            style={{
              fontSize: '0.55rem',
              letterSpacing: '0.18em',
              color: '#38bdf8',
              opacity: 0.85,
              marginTop: 1,
            }}
          >
            SEE THE SKY. PROTECT THE HORIZON.
          </div>
        )}
      </div>
    </div>
  );
}

export default GarudEagle;
