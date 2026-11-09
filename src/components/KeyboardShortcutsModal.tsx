interface KeyboardShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

export default function KeyboardShortcutsModal({
  open,
  onClose,
}: KeyboardShortcutsModalProps) {
  if (!open) return null;

  const shortcuts = [
    { key: 'Space', desc: 'Toggle Simulation Play / Pause' },
    { key: 'R', desc: 'Reset Current Scenario' },
    { key: '1, 2, 4', desc: 'Set Simulation Speed Multiplier (1×, 2×, 4×)' },
    { key: 'F', desc: 'Fit Radar Scene to View' },
    { key: 'I', desc: 'Open / Toggle Intercept Simulation Console' },
    { key: 'D', desc: 'Open / Toggle Strategic Alert (DEFCON) Console' },
    { key: 'O', desc: 'Toggle Orbital View / Radar View' },
    { key: 'A', desc: 'Toggle Tactical Audio Feedback' },
    { key: 'Esc', desc: 'Close Modal / Deselect Track' },
    { key: '?', desc: 'Open This Keyboard Shortcuts Guide' },
  ];

  return (
    <div className="dialog-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Keyboard Shortcuts">
      <div className="dialog shortcuts-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="shortcuts-head">
          <div className="shortcuts-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M8 16h8" />
            </svg>
            GARUD TACTICAL KEYBOARD CONTROLS
          </div>
          <button type="button" className="btn small" onClick={onClose}>
            ✕ Close
          </button>
        </div>

        <div className="shortcuts-list">
          {shortcuts.map((sc, i) => (
            <div key={i} className="shortcut-row">
              <kbd className="shortcut-key font-mono">{sc.key}</kbd>
              <span className="shortcut-desc">{sc.desc}</span>
            </div>
          ))}
        </div>

        <div className="dialog-actions">
          <button type="button" className="btn primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
