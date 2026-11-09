// Airspace3D — React host for the 3D airspace viewport.
//
// Responsibilities: WebGL capability detection with a graceful fallback to
// the legacy 2D SVG radar scope, the camera-mode toolbar (TOP-DOWN RADAR /
// 3D AIRSPACE / TRACK FOLLOW) with tooltips and keyboard equivalents,
// reduced-motion handling, pointer + keyboard camera gestures (with page
// scroll suppression while the viewport is focused), encounter-effect
// plumbing, and complete cleanup on unmount.

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type { ReactNode, Ref } from 'react';

import type { SimView } from '../engine/sim';
import { usePrefersReducedMotion } from '../lib/motion';
import type { InterceptorState, JetScrambleState } from '../types/intercept';
import type { MapHandle } from './MapView';
import { AirspaceScene, type SyncOptions } from '../three/AirspaceScene';
import type { CameraMode } from '../three/camera';
import type { EncounterOutcome } from '../three/effects';

export type { MapHandle };

export interface Airspace3DProps {
  view: SimView;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  showTrails: boolean;
  showForecasts: boolean;
  showLabels: boolean;
  ref?: Ref<MapHandle>;
  interceptorState?: InterceptorState | null;
  jetScrambleState?: JetScrambleState | null;
  onInitiateIntercept?: () => void;
  onInitiateScramble?: () => void;
  defcon?: number;
  disabledTrackIds?: Set<string>;
  frozenTrackPositions?: Record<string, { x: number; y: number; z: number; heading: number }>;
  /** One-shot encounter outcome from the intercept exercise result state. */
  encounterFeedback?: { targetId: string; pos: { x: number; y: number; z: number }; outcome: EncounterOutcome; key: string } | null;
  /** Rendered instead when WebGL is unavailable or fails at runtime. */
  fallback: ReactNode;
  /** If true, the camera follows the selected contact. */
  followOn?: boolean;
}

function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl2') ??
      canvas.getContext('webgl') ??
      canvas.getContext('experimental-webgl');
    return Boolean(gl);
  } catch {
    return false;
  }
}

const CAMERA_MODES: Array<{ id: CameraMode; label: string; hint: string }> = [
  { id: 'radar', label: 'TOP-DOWN RADAR', hint: 'Orthographic-feel plan view, north up (keyboard: 1)' },
  { id: 'airspace', label: '3D AIRSPACE', hint: 'Oblique tactical perspective with orbit & pan (keyboard: 2)' },
];

export default function Airspace3D({
  view,
  selectedId,
  onSelect,
  showTrails,
  showForecasts,
  showLabels,
  ref,
  interceptorState,
  jetScrambleState,
  onInitiateIntercept,
  onInitiateScramble,
  defcon = 5,
  disabledTrackIds,
  frozenTrackPositions,
  encounterFeedback,
  fallback,
  followOn = false,
}: Airspace3DProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<AirspaceScene | null>(null);
  const framedScenarioRef = useRef<string | null>(null);
  const framedExerciseRef = useRef(false);
  const [webglFailed, setWebglFailed] = useState(false);
  const [cameraMode, setCameraMode] = useState<CameraMode>('airspace');
  const [hint, setHint] = useState<string | null>(null);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  const showHint = useCallback((msg: string) => {
    setHint(msg);
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => setHint(null), 2800);
  }, []);
  // Keep the selection handler fresh without re-initializing the scene.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Latest props for the render loop without re-creating the scene.
  const latest = useRef({
    view,
    selectedId,
    showTrails,
    showForecasts,
    showLabels,
    defcon,
    interceptorState,
    jetScrambleState,
    disabledTrackIds,
    frozenTrackPositions,
    followOn,
  });
  latest.current = {
    view,
    selectedId,
    showTrails,
    showForecasts,
    showLabels,
    defcon,
    interceptorState,
    jetScrambleState,
    disabledTrackIds,
    frozenTrackPositions,
    followOn,
  };

  // ---- Scene lifecycle -------------------------------------------------
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!isWebGLAvailable()) {
      setWebglFailed(true);
      return;
    }
    let scene: AirspaceScene | null = null;
    try {
      scene = new AirspaceScene(host);
    } catch (err) {
      console.warn('3D viewport initialization failed; falling back to 2D radar.', err);
      setWebglFailed(true);
      return;
    }
    sceneRef.current = scene;
    // Frame the camera to the full scene (tracks + protected zone) so the
    // default view isn't too close or pointed away from the airspace.
    scene.fitScene(
      latest.current.view,
      latest.current.interceptorState ?? null,
      latest.current.jetScrambleState ?? null,
    );
    scene.setSelectHandler((id) => onSelectRef.current(id));
    scene.setModeChangeHandler((mode) => setCameraMode(mode));
    scene.setFitHandler(() => showHint('Airspace framed to encompass all active contacts'));
    const unsubscribeLost = scene.addContextLostListener(() => setWebglFailed(true));
    const disposeScene = scene;
    return () => {
      unsubscribeLost();
      disposeScene.dispose();
      sceneRef.current = null;
    };
    // Scene is created once; selection handler reads from a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Non-passive wheel listener: React's synthetic wheel handler is passive at
  // the root, so it cannot cancel page scroll. This native listener prevents page
  // scroll on container margins and only zooms if not already handled by the WebGL canvas.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const onWheelNative = (e: WheelEvent): void => {
      e.preventDefault(); // never scroll the page while operating the viewport
      if (e.target === host) {
        const clampedDelta = Math.max(-100, Math.min(100, e.deltaY));
        const factor = Math.exp(clampedDelta * 0.0018);
        sceneRef.current?.zoom(factor);
      }
    };
    host.addEventListener('wheel', onWheelNative, { passive: false });
    return () => host.removeEventListener('wheel', onWheelNative);
  }, [webglFailed]);

  // ---- Sync simulation state into the scene ----------------------------
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || webglFailed) return;
    const l = latest.current;
    const opts: SyncOptions = {
      selectedId: l.selectedId,
      showTrails: l.showTrails,
      showForecasts: l.showForecasts,
      showLabels: l.showLabels,
      showSweep: true,
      showRings: true,
      showGrid: true,
      defcon: l.defcon,
      frozenTracks: l.frozenTrackPositions,
      disabledTrackIds: l.disabledTrackIds,
    };
    const target = l.interceptorState
      ? l.view.tracks.find((t) => t.id === l.interceptorState?.targetId)?.estPos ?? null
      : null;
    scene.sync(l.view, opts, l.interceptorState ?? null, l.jetScrambleState ?? null, target);
    // Frame the camera once at mount so the initial view contains the full sector.
// Do not re-fit on every simulation update, which would override the operator's
// zoom, pan and camera mode. A one-shot drill fit runs when a scramble starts
// to bring the VIPER circuit into view.
if (framedScenarioRef.current !== l.view.scenarioId) {
  framedScenarioRef.current = l.view.scenarioId;
  // One-time initial fit when tracks first arrive.
  scene.fitScene(l.view, l.interceptorState ?? null, l.jetScrambleState ?? null);
}
const drillRunning = Boolean(
  l.jetScrambleState &&
    ['launch', 'airborne', 'patrol', 'return'].includes(l.jetScrambleState.stage)
);
if (drillRunning && !framedExerciseRef.current) {
  framedExerciseRef.current = true;
  scene.fitScene(l.view, l.interceptorState ?? null, l.jetScrambleState ?? null);
} else if (!drillRunning) {
  framedExerciseRef.current = false;
}
  }, [
    view,
    selectedId,
    showTrails,
    showForecasts,
    showLabels,
    defcon,
    interceptorState,
    jetScrambleState,
    disabledTrackIds,
    frozenTrackPositions,
    webglFailed,
  ]);

  // Follow-mode camera tracks the selected contact.
  //
  // FOLLOW is OFF by default. It must be enabled explicitly via the toolbar
  // button or the '3' key. When active, the camera follows the selected track
  // while preserving the operator's orbit angles. Turning FOLLOW OFF immediately
  // restores manual camera control.
  //
  // The follow state is driven solely by the camera mode ('follow' vs 'airspace'/‘radar’).
  // It must NOT re-trigger when selectedId changes alone — that would steal control.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || webglFailed) return;
    // When entering follow mode, frame once on the selected contact.
    // Subsequent ticks are driven by the rig's per-frame update and
    // operator input; we do not re-intercept selectedId changes here
    // (changing selection alone should not move the camera).
    // The dependency array includes selectedId and view so that oxlint
    // does not flag missing deps; the guard condition below ensures
    // the camera only moves when explicitly in follow mode with a track.
    if (cameraMode === 'follow' && selectedId) {
      const world = scene.worldOfTrack(view, selectedId);
      if (world) {
        scene.focusWorld(world);
      }
    }
    // If follow is off (cameraMode !== 'follow'), ensure we do not
    // steal control by snapping the camera to any track.
    // Mode is already managed by the toolbar / '3' key handler.
  }, [cameraMode, selectedId, view, webglFailed]);

  // Selecting a contact highlights it and shows information without
  // automatically moving or zooming the camera. The operator can click
  // "Focus" or "Follow" separately if desired.
  // Removed: auto-zoom/auto-focus on selection change.

  // Reduced motion preference reaches the scene.
  useEffect(() => {
    sceneRef.current?.setReducedMotion(reducedMotion);
  }, [reducedMotion]);

  // ---- Encounter effects (exactly once per feedback key) ---------------
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !encounterFeedback) return;
    scene.playEncounter(
      encounterFeedback.pos,
      encounterFeedback.outcome,
      encounterFeedback.key,
    );
  }, [encounterFeedback, webglFailed]);

  // New intercept exercise -> allow the next encounter to fire.
  useEffect(() => {
    if (interceptorState?.stage === 'scramble') {
      sceneRef.current?.resetEncounterKey();
    }
  }, [interceptorState?.stage]);

  // FOLLOW: camera tracks the selected contact when enabled.
  // Toggling FOLLOW off immediately restores manual camera control
  // without resetting the operator's current framing.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || webglFailed) return;
    // When follow is turned on, have the scene request the world pos
    // of the selected track each sync cycle; the rig.updateFollowTarget
    // in AirspaceScene will smoothly interpolate it.
    if (followOn && selectedId) {
      const world = scene.worldOfTrack(view, selectedId);
      if (world) scene.updateFollowTarget(world);
    }
    // When follow is turned off, exit follow mode but keep the current
    // camera framing; do not refit or re-centre.
    if (!followOn) {
      // no-op: camera framing is preserved by the rig
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followOn, selectedId, webglFailed]);

  // ---- Camera controls -------------------------------------------------

  const applyCameraMode = useCallback((mode: CameraMode) => {
    const scene = sceneRef.current;
    if (!scene) return;
    const world = latest.current.selectedId
      ? scene.worldOfTrack(latest.current.view, latest.current.selectedId)
      : null;
    scene.setCameraMode(mode, world);
    setCameraMode(mode);
    setHint(null);
  }, []);

  const handleToggleFollow = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (cameraMode === 'follow') {
      scene.setCameraMode('airspace');
      setCameraMode('airspace');
      showHint('TRACK FOLLOW disengaged — manual 3D orbit active');
      return;
    }
    const id = latest.current.selectedId;
    if (!id) {
      showHint('Select a contact first, then switch to TRACK FOLLOW.');
      return;
    }
    const world = scene.worldOfTrack(latest.current.view, id);
    scene.setCameraMode('follow', world);
    setCameraMode('follow');
    showHint(`TRACK FOLLOW: tracking contact ${id}`);
  }, [cameraMode, showHint]);

  const handleResetCamera = useCallback(() => {
    sceneRef.current?.resetCamera();
    setCameraMode('airspace');
    showHint('Camera reset to default 3D airspace perspective');
  }, [showHint]);

  const handleFit = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.fitScene(
      latest.current.view,
      latest.current.interceptorState ?? null,
      latest.current.jetScrambleState ?? null,
    );
    showHint('Airspace framed to encompass all active contacts');
  }, [showHint]);

  const handleZoom = useCallback((factor: number) => {
    sceneRef.current?.zoom(factor);
  }, []);

  const handleLocate = useCallback(() => {
    const scene = sceneRef.current;
    const id = latest.current.selectedId;
    if (!scene || !id) {
      showHint('Select a contact first to focus the camera');
      return;
    }
    const world = scene.worldOfTrack(latest.current.view, id);
    if (world) {
      scene.focusWorld(world);
      showHint(`Camera focused on ${id}`);
    }
  }, [showHint]);

  // Keyboard-accessible camera gestures while the viewport has focus.
  // All handlers preventDefault so the page never scrolls under the user.
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const scene = sceneRef.current;
      if (!scene) return;
      const step = e.shiftKey ? 0.004 : 0.018;
      let handled = true;
      switch (e.key) {
        case 'ArrowLeft':
          if (e.shiftKey) scene.pan(-60, 0);
          else scene.orbit(-step, 0);
          break;
        case 'ArrowRight':
          if (e.shiftKey) scene.pan(60, 0);
          else scene.orbit(step, 0);
          break;
        case 'ArrowUp':
          if (e.shiftKey) scene.pan(0, -60);
          else scene.orbit(0, -step);
          break;
        case 'ArrowDown':
          if (e.shiftKey) scene.pan(0, 60);
          else scene.orbit(0, step);
          break;
        case '+':
        case '=':
          scene.zoom(0.85);
          break;
        case '-':
        case '_':
          scene.zoom(1.18);
          break;
        case 'Home':
          handleResetCamera();
          break;
        case '1':
          applyCameraMode('radar');
          break;
        case '2':
          applyCameraMode('airspace');
          break;
        case '3':
          handleToggleFollow();
          break;
        case 'f':
        case 'F':
          handleFit();
          break;
        case 'Enter':
          handleLocate();
          break;
        default:
          handled = false;
      }
      if (handled) {
        e.preventDefault();
        e.stopPropagation(); // keep viewport keys away from global shortcuts
      }
    },
    [applyCameraMode, handleToggleFollow, handleFit, handleLocate, handleResetCamera],
  );

  // Page scroll suppression for the viewport is handled by a native
  // non-passive wheel listener registered above (React's synthetic wheel
  // event is passive at the root and cannot cancel scrolling).

  // ---- Imperative handle (App's MapHandle contract) --------------------
  useImperativeHandle(
    ref,
    () => ({
      fitScene: handleFit,
      locateSelected: handleLocate,
      zoomIn: () => handleZoom(0.8),
      zoomOut: () => handleZoom(1.25),
      resetView: handleResetCamera,
    }),
    [handleFit, handleLocate, handleZoom, handleResetCamera],
  );

  // ---- Render ----------------------------------------------------------

  if (webglFailed) {
    return (
      <section aria-label="GARUD Tactical Airspace (2D fallback)" className="blacksite-radar-container">
        <div className="radar-toolbar">
          <div className="radar-title-badge">
            <span className="radar-scope-icon" />
            <span className="radar-title-text">3D VIEW UNAVAILABLE — 2D RADAR SCOPE ACTIVE</span>
            <span className="radar-coord-system">WEBGL NOT PRESENT OR CONTEXT LOST</span>
          </div>
        </div>
        <div className="webgl-fallback-banner" role="status">
          The 3D airspace viewport requires WebGL, which is unavailable in this browser or was
          interrupted. The legacy 2D radar scope below remains fully operational.
        </div>
        <div className="radar-viewport">{fallback}</div>
      </section>
    );
  }

  return (
    <section aria-label="GARUD 3D Tactical Airspace" className="blacksite-radar-container airspace3d">
      <div className="radar-toolbar">
        <div className="radar-title-badge">
          <span className="radar-scope-icon" />
          <span className="radar-title-text">3D AIRSPACE // SECTOR ALPHA</span>
          <span className="radar-coord-system">LOCAL METRE GRID · SYNTHETIC RETURN</span>
        </div>

        <div className="radar-controls-group" role="group" aria-label="Camera modes">
          {CAMERA_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`radar-btn ${cameraMode === m.id ? 'active-mode' : ''}`}
              title={m.hint}
              aria-pressed={cameraMode === m.id}
              onClick={() => applyCameraMode(m.id)}
            >
              {m.label}
            </button>
          ))}
          <button
            type="button"
            className={`radar-btn ${cameraMode === 'follow' ? 'active-mode' : ''}`}
            title="Camera smoothly tracks the selected contact (keyboard: 3)"
            onClick={handleToggleFollow}
            aria-pressed={cameraMode === 'follow'}
          >
            {cameraMode === 'follow' ? '📡 FOLLOWING' : '📡 TRACK FOLLOW'}
          </button>
          <button type="button" className="radar-btn" title="Zoom In (+)" onClick={() => handleZoom(0.8)}>
            + Zoom
          </button>
          <button type="button" className="radar-btn" title="Zoom Out (−)" onClick={() => handleZoom(1.25)}>
            − Zoom
          </button>
          <button
            type="button"
            className="radar-btn"
            title="Fit all active tracks & protected zone (F)"
            onClick={handleFit}
          >
            ⌞ Fit All
          </button>
          <button
            type="button"
            className="radar-btn"
            title="Focus camera on selected contact (Enter)"
            onClick={handleLocate}
            disabled={!selectedId}
          >
            🎯 Focus
          </button>
          <button
            type="button"
            className="radar-btn"
            title="Reset camera to default 3D airspace view (Home)"
            onClick={handleResetCamera}
          >
            ↺ Reset
          </button>
        </div>
      </div>

      <div
        ref={hostRef}
        className="airspace3d-viewport"
        tabIndex={0}
        role="application"
        aria-label="3D airspace viewport. Arrow keys orbit, Shift+arrows pan, plus and minus zoom, 1/2/3 switch camera mode, Home resets."
        onKeyDown={onKeyDown}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Scene canvas is appended here by AirspaceScene. */}

        <div className="airspace3d-hud airspace3d-hud-tl" aria-hidden="true">
          <span className="hud-line">MODE: {CAMERA_MODES.find((m) => m.id === cameraMode)?.label}</span>
          <span className="hud-line dim">DRAG ORBIT · RIGHT-DRAG PAN · WHEEL ZOOM</span>
          <span className="hud-line dim">KEYS: ARROWS · SHIFT+ARROWS · ± · 1/2/3 · HOME</span>
        </div>

        <div className="airspace3d-hud airspace3d-hud-tr" aria-hidden="true">
          <span className="hud-line">N ↑ · LOCAL METRE GRID</span>
          <span className="hud-line dim">ALT: TRUE METRES (EX. ASSETS LABELLED)</span>
        </div>

        {hint && (
          <div className="airspace3d-hint" role="status">
            {hint}
          </div>
        )}

        <div className="airspace3d-legend" aria-hidden="true">
          <span className="legend-dot green" /> CIV
          <span className="legend-dot amber" /> UNID
          <span className="legend-dot red" /> IN ZONE / FROZEN
          <span className="legend-dot cyan" /> EXERCISE
        </div>
      </div>

      <div className="radar-bottom-strip">
        <span>GRID: LOCAL METRES (N/E)</span>
        <span className="cyan">3D VIEWPORT · WEBGL</span>
        <span className="green">UPDATE RATE: SIM-DRIVEN</span>
        <div className="radar-exercise-buttons">
          {onInitiateScramble && (
            <button type="button" className="btn small radar-scramble-action" onClick={onInitiateScramble}>
              ✈ JET SCRAMBLE
            </button>
          )}
          {onInitiateIntercept && (
            <button type="button" className="btn small radar-intercept-action" onClick={onInitiateIntercept}>
              ⚡ INTERCEPT SIMULATION
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
