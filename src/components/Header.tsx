import { useState, useEffect } from 'react';
import type { DefconLevel } from './StrategicAlertModal';
import { GarudEagle } from './GarudEagle';

interface HeaderProps {
  scenarioName: string;
  time: number;
  audioOn: boolean;
  ambienceOn: boolean;
  voiceOn?: boolean;
  onToggleAudio: () => void;
  onAmbience: (on: boolean) => void;
  onToggleVoice?: () => void;
  currentDefcon: DefconLevel;
  onOpenStrategicAlert: () => void;
  onOpenIntercept: () => void;
  onOpenJetScramble: () => void;
  activeView: 'radar' | 'orbital';
  onToggleView: (view: 'radar' | 'orbital') => void;
  onOpenShortcuts: () => void;
  workspaceCollapsed: boolean;
  onToggleWorkspaceCollapsed: () => void;
}

const DEFCON_COLORS: Record<DefconLevel, string> = {
  5: '#4ade80',
  4: '#38d9d6',
  3: '#f59e0b',
  2: '#f97316',
  1: '#ef4444',
};

export default function Header({
  scenarioName,
  time,
  audioOn,
  ambienceOn,
  voiceOn = true,
  onToggleAudio,
  onAmbience,
  onToggleVoice,
  currentDefcon,
  onOpenStrategicAlert,
  onOpenIntercept,
  onOpenJetScramble,
  activeView,
  onToggleView,
  onOpenShortcuts,
  workspaceCollapsed,
  onToggleWorkspaceCollapsed,
}: HeaderProps) {
  const [utcTime, setUtcTime] = useState<string>('');

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setUtcTime(now.toUTCString().slice(17, 25) + ' Z');
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  const m = Math.floor(time / 60);
  const s = Math.floor(time % 60);
  const simTime = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

  return (
    <header className="blacksite-header" role="banner">
      {/* Brand & Eagle Emblem */}
      <div className="header-brand-group">
        <div className="wing-emblem-badge garud-emblem-badge" title="GARUD Tactical Airspace Defense Emblem">
          <GarudEagle size={32} variant="badge" title="GARUD Tactical Airspace Defense Emblem" />
        </div>
        <div className="wordmark-container">
          <div className="main-wordmark">
            GARUD <span className="blacksite-tag">DEFENSE</span>
            <span className="build-ver">/ BUILD 02</span>
          </div>
          <div className="sub-wordmark">AIRSPACE DEFENSE SYSTEM · SEE THE SKY. PROTECT THE HORIZON.</div>
        </div>
      </div>

      {/* Persistent SIMULATION MODE Badge */}
      <div className="persistent-sim-badge" title="Explicit Disclaimer: Local simulation exercise only">
        <span className="pulse-dot green" />
        <span className="sim-text">SIMULATION MODE · SYNTHETIC EXERCISE</span>
      </div>

      {/* Telemetry Pills: Scenario & Time */}
      <div className="header-pills-group">
        <div className="header-pill">
          <span className="pill-lbl">SCENARIO:</span>
          <strong className="pill-val cyan">{scenarioName}</strong>
        </div>
        <div className="header-pill">
          <span className="pill-lbl">SIM T:</span>
          <strong className="pill-val green font-mono">{simTime}</strong>
        </div>
        <div className="header-pill hide-mobile">
          <span className="pill-lbl">UTC:</span>
          <strong className="pill-val font-mono">{utcTime}</strong>
        </div>
      </div>

      <div className="header-spacer" />

      {/* Action Controls & Modules */}
      <div className="header-actions-group">
        {/* DEFCON Posture Button */}
        <button
          type="button"
          className="defcon-header-btn"
          onClick={onOpenStrategicAlert}
          style={{ borderColor: DEFCON_COLORS[currentDefcon], color: DEFCON_COLORS[currentDefcon] }}
          title="Open Strategic Alert (DEFCON) Console"
        >
          <span className="defcon-bullet" style={{ background: DEFCON_COLORS[currentDefcon] }} />
          DEFCON {currentDefcon}
        </button>

        {/* Intercept Simulation Launcher */}
        <button
          type="button"
          className="btn small intercept-header-btn"
          onClick={onOpenIntercept}
          title="Initiate Intercept Simulation Exercise"
        >
          ⚡ INTERCEPT EXERCISE
        </button>

        {/* Jet Scramble Launcher (Part C) */}
        <button
          type="button"
          className="btn small jet-header-btn"
          onClick={onOpenJetScramble}
          title="Initiate Fictional Fighter-Jet Scramble Exercise"
        >
          ✈ JET SCRAMBLE
        </button>

        {/* View Switcher: Radar vs Orbital */}
        <div className="view-mode-switcher">
          <button
            type="button"
            className={`btn small ${activeView === 'radar' ? 'active' : ''}`}
            onClick={() => onToggleView('radar')}
          >
            RADAR
          </button>
          <button
            type="button"
            className={`btn small ${activeView === 'orbital' ? 'active' : ''}`}
            onClick={() => onToggleView('orbital')}
          >
            ORBITAL
          </button>
        </div>

        {/* Audio & Voice Toggles */}
        <button
          type="button"
          className={`audio-toggle ${audioOn ? 'on' : 'off'}`}
          onClick={onToggleAudio}
          title={audioOn ? 'Disable Tactical Audio' : 'Enable Tactical Audio Feedback'}
          aria-pressed={audioOn}
        >
          {audioOn ? '🔊 AUDIO ON' : '🔇 AUDIO OFF'}
        </button>

        <button
          type="button"
          className={`audio-toggle voice-toggle ${voiceOn ? 'on' : 'off'}`}
          onClick={onToggleVoice}
          title={voiceOn ? 'Disable JARVIS Tactical Command Voice' : 'Enable JARVIS Tactical Command Voice'}
          aria-pressed={voiceOn}
        >
          {voiceOn ? '🎙 VOICE ON' : '🎙 VOICE OFF'}
        </button>

        <button
          type="button"
          className={`toggle ${ambienceOn ? 'on' : ''}`}
          onClick={() => onAmbience(!ambienceOn)}
          title="Toggle Tactical Sub-bass Ambience Drone"
          aria-pressed={ambienceOn}
          disabled={!audioOn}
        >
          DRONE
        </button>

        {/* Keyboard Shortcuts Guide */}
        <button
          type="button"
          className="btn small hotkeys-btn"
          onClick={onOpenShortcuts}
          title="View Keyboard Shortcuts (?)"
        >
          ⌨
        </button>

        {/* Workspace Collapse/Expand */}
        <button
          type="button"
          className="btn small"
          onClick={onToggleWorkspaceCollapsed}
          title={workspaceCollapsed ? 'Expand Workspace' : 'Collapse Sidebar'}
          aria-label={workspaceCollapsed ? 'Expand workspace to show inspector and alerts' : 'Collapse workspace to show larger radar'}
        >
          {workspaceCollapsed ? '↳' : '↲'}
        </button>
      </div>
    </header>
  );
}
