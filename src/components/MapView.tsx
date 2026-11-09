import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type { Ref } from 'react';

import { PROTECTED_ZONE } from '../engine/scenarios';
import type { SimView, TrackSnapshot } from '../engine/sim';
import { headingFromVel } from '../engine/math';
import { MAP_X_MAX, MAP_X_MIN, MAP_Y_MAX, MAP_Y_MIN } from '../lib/geo';
import { usePrefersReducedMotion } from '../lib/motion';
import type { AnimationStyle, EncounterFeedback, InterceptorState, JetScrambleState } from '../types/intercept';
import type { DefconLevel } from './StrategicAlertModal';

export interface MapHandle {
  fitScene: () => void;
  locateSelected: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
}

interface MapViewProps {
  view: SimView;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  showTrails: boolean;
  showForecasts: boolean;
  showLabels: boolean;
  ref?: Ref<MapHandle>;
  interceptorState?: InterceptorState | null;
  jetScrambleState?: JetScrambleState | null;
  selectedStyle?: AnimationStyle;
  onSelectStyle?: (style: AnimationStyle) => void;
  onInitiateIntercept?: () => void;
  onInitiateScramble?: () => void;
  defcon?: DefconLevel;
  disabledTrackIds?: Set<string>;
  frozenTrackPositions?: Record<string, { x: number; y: number; z: number; heading: number }>;
  encounterFeedback?: EncounterFeedback | null;
}

interface ViewBox {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

interface Size {
  width: number;
  height: number;
}

const SCENE_PAD = 350;
const FIT_PAD = 120;
const LOCATE_HALF = 350;
const GRID_STEP = 2000;

// Crisp recognizable tactical silhouettes (32x32 viewbox centered at 16,16)

// 1. Fictional Interceptor: Supersonic needle + forward canards + cranked delta + twin stabilizers
const INTERCEPTOR_SILHOUETTE_PATH =
  'M16 1 L18 8 L22 10 L19 12 L20 18 L30 25 L27 27 L18 23 L18 29 L21 31 L16 30 L11 31 L14 29 L14 23 L5 27 L2 25 L12 18 L13 12 L10 10 L14 8 Z';

// 2. Fighter Aircraft: Twin-engine combat fighter with wingtip hardpoints & twin tailfins
const FIGHTER_SILHOUETTE_PATH =
  'M16 2 L18 8 L20 12 L30 20 L29 23 L20 20 L19 27 L24 30 L22 31 L18 29 L16 30 L14 29 L10 31 L8 30 L13 27 L12 20 L3 23 L2 20 L12 12 L14 8 Z';

// 3. Drone: Swept flying-wing UAV with central payload dome
const DRONE_SILHOUETTE_PATH =
  'M16 4 L22 10 L30 18 L28 21 L20 18 L18 25 L21 28 L20 30 L16 28 L12 30 L11 28 L14 25 L12 18 L4 21 L2 18 L10 10 Z';

// 4. Civil Aircraft: Swept low-wing commercial transport / GA twin-turbofan
const CIVIL_SILHOUETTE_PATH =
  'M16 2 L18 10 L30 19 L30 22 L18 18 L18 26 L23 29 L23 31 L16 29 L9 31 L9 29 L14 26 L14 18 L2 22 L2 19 L14 10 Z';

export type AircraftKind = 'interceptor' | 'fighter' | 'drone' | 'civil';

function getTrackAircraftKind(track: TrackSnapshot): AircraftKind {
  const callsign = track.callsign.toUpperCase();
  if (callsign.includes('INT-') || callsign.includes('GARUD') || callsign.includes('ALPHA')) {
    return 'interceptor';
  }
  if (callsign.includes('VIPER') || callsign.includes('FIGHTER') || callsign.includes('STRIKE')) {
    return 'fighter';
  }
  if (callsign.includes('UNID') || track.auth === 'unknown' || callsign.includes('DRONE') || callsign.includes('UAV')) {
    return 'drone';
  }
  return 'civil';
}

function sceneViewBox(): ViewBox {
  const minX = MAP_X_MIN - SCENE_PAD;
  const maxX = MAP_X_MAX + SCENE_PAD;
  const minY = -MAP_Y_MAX - SCENE_PAD;
  const maxY = -MAP_Y_MIN + SCENE_PAD;
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

function fitViewBox(view: SimView, interceptorState?: InterceptorState | null): ViewBox {
  const zone = PROTECTED_ZONE;
  const radius = Math.max(zone.radius, zone.bufferRadius);
  let minX = zone.centre.x - radius;
  let maxX = zone.centre.x + radius;
  let minY = -zone.centre.y - radius;
  let maxY = -zone.centre.y + radius;

  const includeDisplay = (pos: DisplayPos) => {
    minX = Math.min(minX, pos.x - 40);
    maxX = Math.max(maxX, pos.x + 40);
    minY = Math.min(minY, pos.y - 40);
    maxY = Math.max(maxY, pos.y + 40);
  };

  for (const track of view.tracks) {
    const pos = trackPosition(track);
    if (!pos) continue;
    includeDisplay(pos);
  }

  // The interceptor base (world 0, -8000) sits far outside the default scene
  // bounds, so an active exercise must extend the fit to its launch site,
  // current position and target drift — otherwise the moving marker renders
  // clipped outside the SVG viewport for most of the run.
  if (interceptorState) {
    includeDisplay({ x: interceptorState.originPos.x, y: -interceptorState.originPos.y });
    includeDisplay({ x: interceptorState.pos.x, y: -interceptorState.pos.y });
    const target = view.tracks.find((t) => t.id === interceptorState.targetId);
    if (target) {
      for (const fp of displayPoints(target.forecast)) includeDisplay(fp);
    }
    // Quadratic-bezier arc stays within the convex hull of its control points.
    if (
      (interceptorState.style === 'arc-display' || interceptorState.style === 'cinematic') &&
      interceptorState.arcControl
    ) {
      includeDisplay({ x: interceptorState.arcControl.x, y: -interceptorState.arcControl.y });
    }
  }

  const width = Math.max(maxX - minX + FIT_PAD * 2, 500);
  const height = Math.max(maxY - minY + FIT_PAD * 2, 500);
  return { minX: minX - FIT_PAD, minY: minY - FIT_PAD, width, height };
}

function locateViewBox(track: TrackSnapshot): ViewBox {
  const pos = trackPosition(track);
  if (!pos) return sceneViewBox();
  const half = LOCATE_HALF;
  return { minX: pos.x - half, minY: pos.y - half, width: half * 2, height: half * 2 };
}

interface DisplayPos {
  x: number;
  y: number;
}

function trackPosition(track: TrackSnapshot): DisplayPos | null {
  const last = track.observations[track.observations.length - 1];
  const position = track.estPos ?? last;
  if (!position) return null;
  const x = position.x;
  const y = -position.y;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function displayPoints(
  points: ReadonlyArray<{ x: number; y: number }>,
): DisplayPos[] {
  const out: DisplayPos[] = [];
  for (const point of points) {
    const x = point.x;
    const y = -point.y;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    out.push({ x, y });
  }
  return out;
}

function headingOf(track: TrackSnapshot): number {
  const velocity = track.estVel;
  const heading = velocity
    ? headingFromVel(velocity.x, velocity.y)
    : track.heading;
  return Number.isFinite(heading) ? heading : 0;
}

export default function MapView({
  view,
  selectedId,
  onSelect,
  showTrails: initialShowTrails,
  showForecasts: initialShowForecasts,
  showLabels: initialShowLabels,
  ref,
  interceptorState,
  jetScrambleState,
  onInitiateIntercept,
  onInitiateScramble,
  selectedStyle,
  onSelectStyle,
  defcon,
  disabledTrackIds,
  frozenTrackPositions,
  encounterFeedback,
}: MapViewProps) {
  const [viewBox, setViewBox] = useState<ViewBox>(() => sceneViewBox());
  const [size, setSize] = useState<Size>({ width: 800, height: 600 });
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Layer toggles
  const [layerSweep, setLayerSweep] = useState(true);
  const [layerRings, setLayerRings] = useState(true);
  const [layerGrid, setLayerGrid] = useState(true);
  const [layerTrails, setLayerTrails] = useState(initialShowTrails);
  const [layerForecast, setLayerForecast] = useState(initialShowForecasts);
  const [layerLabels, setLayerLabels] = useState(initialShowLabels);
  const [showLegend, setShowLegend] = useState(false);

  // Drag panning state
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; boxX: number; boxY: number }>({
    mouseX: 0,
    mouseY: 0,
    boxX: 0,
    boxY: 0,
  });

  // Radar sweep angle animation
  const [sweepAngle, setSweepAngle] = useState(0);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    // Reduced motion: keep the scope beam static instead of sweeping.
    if (reducedMotion) return;

    let animId: number;
    let lastTime = performance.now();
    const tick = (now: number) => {
      const delta = (now - lastTime) / 1000;
      lastTime = now;
      if (layerSweep && !view.paused) {
        setSweepAngle((prev) => (prev + delta * 90) % 360); // 4 seconds per full sweep
      }
      animId = requestAnimationFrame(tick);
    };
    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [layerSweep, view.paused, reducedMotion]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const update = () =>
      setSize({
        width: Math.max(element.clientWidth, 200),
        height: Math.max(element.clientHeight, 200),
      });
    update();
    if (typeof ResizeObserver === 'undefined') {
      const onResize = () => update();
      window.addEventListener('resize', onResize);
      return () => window.removeEventListener('resize', onResize);
    }
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const handleFitScene = useCallback(() => {
    setViewBox(fitViewBox(view, interceptorState));
  }, [view, interceptorState]);

  // Auto-fit the scope when a new intercept exercise launches so the base,
  // flight corridor and target start inside the visible viewBox. Also refits
  // once if the operator switches to the arc preset mid-run (its lofted curve
  // extends beyond the straight-line corridor). Guarded by refs so per-frame
  // telemetry updates never re-fit (which would fight panning).
  const prevInterceptStageRef = useRef<string | undefined>(undefined);
  const prevArcActiveRef = useRef(false);
  useEffect(() => {
    const stage = interceptorState?.stage;
    const justStarted = stage === 'scramble' && prevInterceptStageRef.current !== 'scramble';
    prevInterceptStageRef.current = stage;
    const arcActive =
      (stage === 'scramble' || stage === 'vector' || stage === 'rendezvous') &&
      (interceptorState?.style === 'arc-display' || interceptorState?.style === 'cinematic');
    const arcJustActivated = arcActive && !prevArcActiveRef.current;
    prevArcActiveRef.current = arcActive;
    if (justStarted || arcJustActivated) {
      setViewBox(fitViewBox(view, interceptorState));
    }
  }, [interceptorState, view]);

  const handleResetScene = useCallback(() => {
    setViewBox(sceneViewBox());
  }, []);

  const handleLocateSelected = useCallback(() => {
    const track = view.tracks.find((t) => t.id === selectedId) ?? null;
    if (!track) return;
    setViewBox(locateViewBox(track));
  }, [view, selectedId]);

  const handleZoom = useCallback((factor: number) => {
    setViewBox((prev) => {
      const newWidth = Math.max(prev.width * factor, 300);
      const newHeight = Math.max(prev.height * factor, 300);
      const cx = prev.minX + prev.width / 2;
      const cy = prev.minY + prev.height / 2;
      return {
        minX: cx - newWidth / 2,
        minY: cy - newHeight / 2,
        width: newWidth,
        height: newHeight,
      };
    });
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      fitScene: handleFitScene,
      locateSelected: handleLocateSelected,
      zoomIn: () => handleZoom(0.75),
      zoomOut: () => handleZoom(1.33),
      resetView: handleResetScene,
    }),
    [handleFitScene, handleLocateSelected, handleZoom, handleResetScene],
  );

  // Mouse drag pan handlers
  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Primary click only
    setIsDragging(true);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      boxX: viewBox.minX,
      boxY: viewBox.minY,
    };
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const scaleX = viewBox.width / size.width;
    const scaleY = viewBox.height / size.height;
    const dx = (e.clientX - dragStartRef.current.mouseX) * scaleX;
    const dy = (e.clientY - dragStartRef.current.mouseY) * scaleY;
    setViewBox((prev) => ({
      ...prev,
      minX: dragStartRef.current.boxX - dx,
      minY: dragStartRef.current.boxY - dy,
    }));
  };

  const onMouseUp = () => {
    setIsDragging(false);
  };

  // Wheel zoom handler
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.15 : 0.87;
    handleZoom(factor);
  };

  const box = viewBox;
  const scale = Math.min(size.width / box.width, size.height / box.height);
  const pxW = box.width * scale;
  const pxH = box.height * scale;
  const offsetX = (size.width - pxW) / 2;
  const offsetY = (size.height - pxH) / 2;
  const pxMinX = offsetX;
  const pxMinY = offsetY;
  const px = (m: { x: number; y: number }) => ({
    x: offsetX + (m.x - box.minX) * scale,
    y: offsetY + (m.y - box.minY) * scale,
  });

  // Coordinate grid lines
  const gridLines: Array<{ x?: number; y?: number }> = [];
  if (layerGrid) {
    const firstGridX = Math.ceil(box.minX / GRID_STEP) * GRID_STEP;
    for (let x = firstGridX; x < box.minX + box.width; x += GRID_STEP) {
      gridLines.push({ x });
    }
    const firstGridY = Math.ceil(box.minY / GRID_STEP) * GRID_STEP;
    for (let y = firstGridY; y < box.minY + box.height; y += GRID_STEP) {
      gridLines.push({ y });
    }
  }

  const zone = PROTECTED_ZONE;
  const zoneCentre = px({ x: zone.centre.x, y: -zone.centre.y });
  const zoneRadius = zone.radius * scale;
  const zoneBufferRadius = zone.bufferRadius * scale;

  // Concentric radar range rings (in metres): 5km, 10km, 15km, 20km, 25km
  const rangeRingsMeters = [5000, 10000, 15000, 20000, 25000];

  // Interceptor display positions
  const interceptorDisplayPos = interceptorState
    ? px({ x: interceptorState.pos.x, y: -interceptorState.pos.y })
    : null;
  const originDisplayPos = interceptorState
    ? px({ x: interceptorState.originPos.x, y: -interceptorState.originPos.y })
    : null;

  // Target contact for interceptor
  const tgtTrack = interceptorState
    ? view.tracks.find((t) => t.id === interceptorState.targetId) ?? null
    : null;
  const tgtDisplayPos = tgtTrack ? trackPosition(tgtTrack) : null;
  const tgtPx = tgtDisplayPos ? px(tgtDisplayPos) : null;

  return (
    <section
      aria-label="GARUD Tactical Airspace Radar"
      className="blacksite-radar-container"
    >
      {/* Radar Toolbar Header */}
      <div className="radar-toolbar">
        <div className="radar-title-badge">
          <span className="radar-scope-icon" />
          <span className="radar-title-text">RADAR SCOPE // SECTOR ALPHA</span>
          <span className="radar-coord-system">LOCAL METRE GRID · SYNTHETIC RETURN</span>
        </div>

        {/* Viewport & Zoom Controls */}
        <div className="radar-controls-group">
          <button
            type="button"
            className="radar-btn"
            title="Zoom In"
            onClick={() => handleZoom(0.75)}
          >
            + Zoom
          </button>
          <button
            type="button"
            className="radar-btn"
            title="Zoom Out"
            onClick={() => handleZoom(1.33)}
          >
            − Zoom
          </button>
          <button
            type="button"
            className="radar-btn"
            title="Fit All Active Tracks & Protected Zone"
            onClick={handleFitScene}
          >
            ⌞ Fit View
          </button>
          <button
            type="button"
            className="radar-btn"
            title="Locate Selected Track"
            onClick={handleLocateSelected}
            disabled={!selectedId}
          >
            🎯 Locate
          </button>
          <button
            type="button"
            className="radar-btn"
            title="Reset Scope to Default Scene"
            onClick={handleResetScene}
          >
            ↺ Reset
          </button>
        </div>

        {/* Layer Toggles */}
        <div className="radar-layers-group">
          <button
            type="button"
            className={`radar-layer-pill ${layerSweep ? 'active' : ''}`}
            onClick={() => setLayerSweep(!layerSweep)}
            title="Toggle Radar Sweep Beam"
          >
            SWEEP
          </button>
          <button
            type="button"
            className={`radar-layer-pill ${layerRings ? 'active' : ''}`}
            onClick={() => setLayerRings(!layerRings)}
            title="Toggle Range Rings & Radials"
          >
            RINGS
          </button>
          <button
            type="button"
            className={`radar-layer-pill ${layerGrid ? 'active' : ''}`}
            onClick={() => setLayerGrid(!layerGrid)}
            title="Toggle Coordinate Grid"
          >
            GRID
          </button>
          <button
            type="button"
            className={`radar-layer-pill ${layerTrails ? 'active' : ''}`}
            onClick={() => setLayerTrails(!layerTrails)}
            title="Toggle History Trails"
          >
            TRAILS
          </button>
          <button
            type="button"
            className={`radar-layer-pill ${layerForecast ? 'active' : ''}`}
            onClick={() => setLayerForecast(!layerForecast)}
            title="Toggle Forecast Trajectories"
          >
            FORECAST
          </button>
          <button
            type="button"
            className={`radar-layer-pill ${layerLabels ? 'active' : ''}`}
            onClick={() => setLayerLabels(!layerLabels)}
            title="Toggle Callsign & FL Labels"
          >
            TAGS
          </button>
          <button
            type="button"
            className={`radar-layer-pill ${showLegend ? 'active' : ''}`}
            onClick={() => setShowLegend(!showLegend)}
            title="Toggle Tactical Legend"
          >
            LEGEND
          </button>
        </div>
      </div>

      {/* SVG Radar Display Viewport */}
      <div
        ref={containerRef}
        className="radar-viewport"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
        style={{ cursor: isDragging ? 'grabbing' : 'crosshair' }}
      >
        <svg
          viewBox={`0 0 ${Math.max(size.width, 1)} ${Math.max(size.height, 1)}`}
          width="100%"
          height="100%"
          style={{ display: 'block', width: '100%', height: '100%', userSelect: 'none' }}
        >
          <defs>
            {/* Radar Sweep Gradient Fan */}
            <linearGradient id="sweep-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.35" />
              <stop offset="60%" stopColor="#00f0ff" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#00f0ff" stopOpacity="0" />
            </linearGradient>

            {/* Quick Streak Luminous Glow */}
            <filter id="streak-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Ion Trail Particle Glow */}
            <filter id="ion-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Target Reticle Filter Glow */}
            <filter id="reticle-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Coordinate Grid Lines */}
          {gridLines.map((line, index) =>
            line.x === undefined ? (
              <line
                key={`gy-${index}`}
                x1={pxMinX}
                x2={pxMinX + pxW}
                y1={px({ x: box.minX, y: line.y ?? 0 }).y}
                y2={px({ x: box.minX, y: line.y ?? 0 }).y}
                stroke="#1b2d45"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
            ) : (
              <line
                key={`gx-${index}`}
                x1={px({ x: line.x, y: box.minY }).x}
                x2={px({ x: line.x, y: box.minY }).x}
                y1={pxMinY}
                y2={pxMinY + pxH}
                stroke="#1b2d45"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
            ),
          )}

          {/* Range Rings & Azimuth Radials */}
          {layerRings && (
            <g className="radar-range-rings">
              {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
                const rad = ((deg - 90) * Math.PI) / 180;
                const rMax = 30000 * scale;
                const x2 = zoneCentre.x + Math.cos(rad) * rMax;
                const y2 = zoneCentre.y + Math.sin(rad) * rMax;
                return (
                  <g key={`bearing-${deg}`}>
                    <line
                      x1={zoneCentre.x}
                      y1={zoneCentre.y}
                      x2={x2}
                      y2={y2}
                      stroke="#16253a"
                      strokeWidth={1}
                      strokeDasharray="4 6"
                      opacity={0.6}
                    />
                    <text
                      x={zoneCentre.x + Math.cos(rad) * (26000 * scale)}
                      y={zoneCentre.y + Math.sin(rad) * (26000 * scale)}
                      textAnchor="middle"
                      fontSize={9}
                      fill="#72869f"
                      fontFamily="ui-monospace, monospace"
                    >
                      {deg.toString().padStart(3, '0')}°
                    </text>
                  </g>
                );
              })}

              {rangeRingsMeters.map((rm) => {
                const rPx = rm * scale;
                return (
                  <g key={`ring-${rm}`}>
                    <circle
                      cx={zoneCentre.x}
                      cy={zoneCentre.y}
                      r={rPx}
                      fill="none"
                      stroke="#263951"
                      strokeWidth={1}
                      strokeDasharray="2 4"
                    />
                    <text
                      x={zoneCentre.x + rPx + 4}
                      y={zoneCentre.y - 4}
                      fontSize={9}
                      fill="#72869f"
                      fontFamily="ui-monospace, monospace"
                    >
                      {`${rm / 1000} KM`}
                    </text>
                  </g>
                );
              })}
            </g>
          )}

          {/* Abstract Strategic Alert Waves (Part D) when DEFCON <= 2 */}
          {defcon && defcon <= 2 && (
            <g className="strategic-alert-waves">
              <circle
                cx={zoneCentre.x}
                cy={zoneCentre.y}
                r={zoneRadius * 1.3}
                fill="none"
                stroke={defcon === 1 ? '#ef4444' : '#f97316'}
                strokeWidth={2}
                strokeDasharray="8 6"
                opacity={0.5}
              />
              <circle
                cx={zoneCentre.x}
                cy={zoneCentre.y}
                r={zoneRadius * 1.8}
                fill="none"
                stroke={defcon === 1 ? '#ef4444' : '#f97316'}
                strokeWidth={1.5}
                strokeDasharray="4 6"
                opacity={0.35}
              />
            </g>
          )}

          {/* Radar Sweep Animation (originating from Zone Centre) */}
          {layerSweep && (
            <g className="radar-sweep-beam">
              {(() => {
                const sweepRad = ((sweepAngle - 90) * Math.PI) / 180;
                const sweepLen = 28000 * scale;
                const sx = zoneCentre.x + Math.cos(sweepRad) * sweepLen;
                const sy = zoneCentre.y + Math.sin(sweepRad) * sweepLen;

                const trailAngle = sweepRad - (28 * Math.PI) / 180;
                const tx = zoneCentre.x + Math.cos(trailAngle) * sweepLen;
                const ty = zoneCentre.y + Math.sin(trailAngle) * sweepLen;

                return (
                  <>
                    <path
                      d={`M ${zoneCentre.x} ${zoneCentre.y} L ${tx} ${ty} A ${sweepLen} ${sweepLen} 0 0 1 ${sx} ${sy} Z`}
                      fill="url(#sweep-gradient)"
                      opacity={0.4}
                    />
                    <line
                      x1={zoneCentre.x}
                      y1={zoneCentre.y}
                      x2={sx}
                      y2={sy}
                      stroke="#00f0ff"
                      strokeWidth={1.5}
                      opacity={0.85}
                    />
                  </>
                );
              })()}
            </g>
          )}

          {/* North Direction Indicator Arrow */}
          <g transform={`translate(${size.width / 2} 24)`}>
            <path d="M0 0 L-6 -9 L6 -9 Z" fill="#4ade80" />
            <text
              x={0}
              y={-12}
              textAnchor="middle"
              fontSize={11}
              fontWeight={700}
              fill="#4ade80"
              fontFamily="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
            >
              N (000°)
            </text>
          </g>

          {/* Protected Zone and Buffer Zone */}
          <circle
            cx={zoneCentre.x}
            cy={zoneCentre.y}
            r={zoneRadius}
            fill="#00f0ff"
            fillOpacity={0.05}
            stroke="#00f0ff"
            strokeWidth={Math.max(1.5, 2 * scale)}
          />
          <circle
            cx={zoneCentre.x}
            cy={zoneCentre.y}
            r={zoneBufferRadius}
            fill="none"
            stroke="#f59e0b"
            strokeWidth={Math.max(1, scale)}
            strokeDasharray="8 6"
            opacity={0.7}
          />
          <text
            x={zoneCentre.x}
            y={zoneCentre.y - zoneRadius - 12}
            textAnchor="middle"
            fontSize={11}
            fill="#38d9d6"
            fontFamily="ui-monospace, monospace"
            fontWeight={600}
          >
            {`PROTECTED ZONE // ${zone.name} (${zone.floor}–${zone.ceiling}m)`}
          </text>

          {/* Standard Simulated Tracks with Crisp SVG Silhouettes & Distinct Symbology */}
          {view.tracks.map((track) => {
            const rawPosition = trackPosition(track);
            if (!rawPosition) return null;

            const isDisabled = disabledTrackIds?.has(track.id) ?? false;
            const frozenPos = frozenTrackPositions?.[track.id];
            const position = isDisabled && frozenPos ? { x: frozenPos.x, y: -frozenPos.y } : rawPosition;

            const points = displayPoints(track.observations.slice(-160)).map((p) => px(p));
            const showTrail = layerTrails && points.length > 1;

            const isSelected = selectedId === track.id;
            const forecastPoints =
              layerForecast && isSelected && !isDisabled && track.forecastState === 'ready'
                ? [position, ...displayPoints(track.forecast)]
                : [];
            const forecastPathPoints = forecastPoints
              .map((p) => px(p))
              .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));

            const heading = isDisabled && frozenPos ? frozenPos.heading : headingOf(track);
            const lost = track.freshness === 'lost';
            const stale = track.freshness === 'stale';
            const isUnknown = track.auth === 'unknown';
            const kind = getTrackAircraftKind(track);

            const markerColor = isDisabled
              ? '#ef4444'
              : lost
              ? '#64748b'
              : track.inZone
              ? '#ef4444'
              : isUnknown
              ? '#f59e0b'
              : '#4ade80';

            const markerPos = px(position);

            return (
              <g key={track.id} className={`track-marker-entity ${isDisabled ? 'disabled-target' : ''}`}>
                {showTrail && !isDisabled && (
                  <polyline
                    points={points.map((p) => `${p.x},${p.y}`).join(' ')}
                    fill="none"
                    stroke={markerColor}
                    strokeWidth={kind === 'fighter' ? 2 : 1.5}
                    opacity={kind === 'drone' ? 0.6 : 0.4}
                    strokeDasharray={kind === 'drone' || stale ? '4 3' : undefined}
                  />
                )}

                {layerForecast && forecastPathPoints.length > 0 && (
                  <g className="track-forecast-layer">
                    <polyline
                      points={forecastPathPoints.map((p) => `${p.x},${p.y}`).join(' ')}
                      fill="none"
                      stroke="#00f0ff"
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      opacity={0.85}
                    />
                    {forecastPathPoints.map((pt, i) =>
                      i % 4 === 0 && i > 0 ? (
                        <circle
                          key={`fc-pt-${i}`}
                          cx={pt.x}
                          cy={pt.y}
                          r={2.5}
                          fill="#00f0ff"
                          opacity={0.7}
                        />
                      ) : null,
                    )}
                  </g>
                )}

                <g
                  transform={`translate(${markerPos.x - 16} ${markerPos.y - 16})`}
                  onClick={() => onSelect(track.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelect(track.id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  style={{ cursor: 'pointer' }}
                >
                  {isSelected && (
                    <g transform="translate(16, 16)" filter="url(#reticle-glow)">
                      <circle cx={0} cy={0} r={22} fill="none" stroke="#B59AFF" strokeWidth={1} strokeDasharray="4 4" opacity={0.8} />
                      <path d="M -18 -12 L -18 -18 L -12 -18" fill="none" stroke="#B59AFF" strokeWidth={2} />
                      <path d="M 12 -18 L 18 -18 L 18 -12" fill="none" stroke="#B59AFF" strokeWidth={2} />
                      <path d="M -18 12 L -18 18 L -12 18" fill="none" stroke="#B59AFF" strokeWidth={2} />
                      <path d="M 12 18 L 18 18 L 18 12" fill="none" stroke="#B59AFF" strokeWidth={2} />
                    </g>
                  )}

                  {/* Orient aircraft in the exact direction of travel */}
                  <g transform={`rotate(${heading} 16 16)`}>
                    {!isDisabled && (
                      <line
                        x1={16}
                        y1={16}
                        x2={16}
                        y2={16 - Math.min(Math.max(track.speed * scale * 4, 16), 40)}
                        stroke={markerColor}
                        strokeWidth={1.5}
                        strokeDasharray="2 2"
                        opacity={0.8}
                      />
                    )}

                    {/* Distinct SVG silhouettes: Interceptor, Fighter, Drone, Civil */}
                    {kind === 'drone' ? (
                      <g className="aircraft-drone-marker">
                        <path
                          d={DRONE_SILHOUETTE_PATH}
                          fill={isDisabled ? '#2a0a0a' : lost ? '#1e293b' : '#0c1812'}
                          stroke={markerColor}
                          strokeWidth={isSelected ? 2.5 : 1.5}
                          strokeDasharray={stale ? '4 3' : undefined}
                          strokeLinejoin="round"
                        />
                        {/* Central Avionics Sensor Dome */}
                        <circle cx={16} cy={12} r={2.5} fill={isDisabled ? '#ef4444' : '#f59e0b'} opacity={0.9} />
                        {/* Restrained propulsion heat shimmer */}
                        {!isDisabled && <circle cx={16} cy={27} r={1.5} fill="#f59e0b" opacity={0.7} />}
                      </g>
                    ) : kind === 'fighter' ? (
                      <g className="aircraft-fighter-marker">
                        <path
                          d={FIGHTER_SILHOUETTE_PATH}
                          fill={lost ? '#1e293b' : '#082f49'}
                          stroke={markerColor}
                          strokeWidth={isSelected ? 2.5 : 1.5}
                          strokeDasharray={stale ? '4 3' : undefined}
                          strokeLinejoin="round"
                        />
                        {/* Twin tactical afterburner exhausts */}
                        {!isDisabled && (
                          <>
                            <circle cx={13.5} cy={29} r={1.8} fill="#38bdf8" opacity={0.85} />
                            <circle cx={18.5} cy={29} r={1.8} fill="#38bdf8" opacity={0.85} />
                          </>
                        )}
                      </g>
                    ) : kind === 'interceptor' ? (
                      <g className="aircraft-interceptor-marker">
                        <path
                          d={INTERCEPTOR_SILHOUETTE_PATH}
                          fill={lost ? '#1e293b' : '#022c22'}
                          stroke={markerColor}
                          strokeWidth={isSelected ? 2.5 : 1.5}
                          strokeDasharray={stale ? '4 3' : undefined}
                          strokeLinejoin="round"
                        />
                        {!isDisabled && <circle cx={16} cy={30} r={2.5} fill="#00f0ff" opacity={0.9} />}
                      </g>
                    ) : (
                      <g className="aircraft-civil-marker">
                        <path
                          d={CIVIL_SILHOUETTE_PATH}
                          fill={lost ? '#1e293b' : '#081610'}
                          stroke={markerColor}
                          strokeWidth={isSelected ? 2.5 : 1.5}
                          strokeDasharray={stale ? '4 3' : undefined}
                          strokeLinejoin="round"
                        />
                      </g>
                    )}

                    {/* Disabled target static indicator */}
                    {isDisabled && (
                      <g>
                        <line x1={8} y1={8} x2={24} y2={24} stroke="#ef4444" strokeWidth={1.5} />
                        <line x1={24} y1={8} x2={8} y2={24} stroke="#ef4444" strokeWidth={1.5} />
                      </g>
                    )}
                  </g>

                  {layerLabels && (
                    <g transform="translate(16, 32)">
                      <rect
                        x={-50}
                        y={0}
                        width={100}
                        height={16}
                        fill="#07100b"
                        fillOpacity={0.88}
                        stroke={isDisabled ? '#ef4444' : isSelected ? '#00f0ff' : '#1e382b'}
                        strokeWidth={isDisabled ? 1.2 : 0.8}
                        rx={2}
                      />
                      <text
                        x={0}
                        y={11}
                        textAnchor="middle"
                        fontSize={9}
                        fill={isDisabled ? '#ef4444' : isSelected ? '#00f0ff' : markerColor}
                        fontFamily="ui-monospace, monospace"
                        fontWeight={700}
                      >
                        {isDisabled
                          ? `[DISABLED] ${track.callsign}`
                          : kind === 'drone'
                          ? `[DRONE] ${track.callsign} · FL${Math.round(track.pos.z / 100)}`
                          : kind === 'fighter'
                          ? `[FTR] ${track.callsign} · FL${Math.round(track.pos.z / 100)}`
                          : kind === 'interceptor'
                          ? `[INT] ${track.callsign} · FL${Math.round(track.pos.z / 100)}`
                          : `[CIV] ${track.callsign} · FL${Math.round(track.pos.z / 100)}`}
                      </text>
                    </g>
                  )}
                </g>
              </g>
            );
          })}

          {/* ===============================================================
             FEATURE 3 / PART B: INTERCEPT SIMULATION (CORRECT SVG COORDINATES)
             =============================================================== */}
          {interceptorState && interceptorDisplayPos && originDisplayPos && (
            <g className="interceptor-svg-layer">
              {/* 1. Trajectory paths rendered directly in root SVG space */}
              {(interceptorState.style === 'quick' || interceptorState.style === 'quick-streak') && (
                <g className="quick-streak-layer" filter="url(#streak-glow)">
                  {/* Trailing fast luminous polyline (short fading trail) */}
                  {interceptorState.trailHistory.length > 1 && (
                    <polyline
                      points={interceptorState.trailHistory
                        .slice(-14)
                        .map((pt) => {
                          const dp = px({ x: pt.x, y: -pt.y });
                          return `${dp.x},${dp.y}`;
                        })
                        .join(' ')}
                      fill="none"
                      stroke="#fef08a"
                      strokeWidth={3.5}
                      strokeLinecap="round"
                      opacity={0.95}
                    />
                  )}
                  {/* Flight lead vector to target */}
                  {tgtPx && (
                    <line
                      x1={interceptorDisplayPos.x}
                      y1={interceptorDisplayPos.y}
                      x2={tgtPx.x}
                      y2={tgtPx.y}
                      stroke="#fef08a"
                      strokeWidth={1.5}
                      strokeDasharray="2 3"
                      opacity={0.65}
                    />
                  )}
                </g>
              )}

              {(interceptorState.style === 'cruise' || interceptorState.style === 'ion-trail') && (
                <g className="ion-trail-layer" filter="url(#ion-glow)">
                  {interceptorState.trailHistory.length > 1 && (
                    <polyline
                      points={interceptorState.trailHistory
                        .slice(-50)
                        .map((pt) => {
                          const dp = px({ x: pt.x, y: -pt.y });
                          return `${dp.x},${dp.y}`;
                        })
                        .join(' ')}
                      fill="none"
                      stroke="#00f0ff"
                      strokeWidth={2.8}
                      strokeLinecap="round"
                      opacity={0.85}
                    />
                  )}
                  {/* Particle pulse nodes along contrail */}
                  {interceptorState.trailHistory
                    .slice(-50)
                    .filter((_, i) => i % 4 === 0)
                    .map((pt, i) => {
                      const dp = px({ x: pt.x, y: -pt.y });
                      return (
                        <circle
                          key={`ion-pt-${i}`}
                          cx={dp.x}
                          cy={dp.y}
                          r={2.5}
                          fill="#00f0ff"
                          opacity={0.75}
                        />
                      );
                    })}
                  {tgtPx && (
                    <line
                      x1={interceptorDisplayPos.x}
                      y1={interceptorDisplayPos.y}
                      x2={tgtPx.x}
                      y2={tgtPx.y}
                      stroke="#00f0ff"
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      opacity={0.7}
                    />
                  )}
                </g>
              )}

              {(interceptorState.style === 'cinematic' || interceptorState.style === 'arc-display') && (
                <g className="arc-display-layer">
                  {/* Curved Quadratic Bezier Arc Guide & Apogee Waypoint */}
                  {tgtPx && interceptorState.arcControl && (
                    <>
                      <path
                        d={`M ${originDisplayPos.x} ${originDisplayPos.y} Q ${px({ x: interceptorState.arcControl.x, y: -interceptorState.arcControl.y }).x} ${px({ x: interceptorState.arcControl.x, y: -interceptorState.arcControl.y }).y} ${tgtPx.x} ${tgtPx.y}`}
                        fill="none"
                        stroke="#38d9d6"
                        strokeWidth={1.8}
                        strokeDasharray="5 5"
                        opacity={0.7}
                      />
                      {/* Apogee Waypoint Indicator */}
                      <g
                        transform={`translate(${px({ x: interceptorState.arcControl.x, y: -interceptorState.arcControl.y }).x}, ${px({ x: interceptorState.arcControl.x, y: -interceptorState.arcControl.y }).y})`}
                      >
                        <circle cx={0} cy={0} r={5} fill="none" stroke="#38d9d6" strokeWidth={1.5} />
                        <circle cx={0} cy={0} r={2} fill="#38d9d6" />
                        <text
                          x={8}
                          y={3}
                          fill="#38d9d6"
                          fontSize={8.5}
                          fontFamily="monospace"
                          fontWeight={600}
                        >
                          ARC APOGEE WAYPOINT
                        </text>
                      </g>
                    </>
                  )}
                  {/* Historical path flown */}
                  {interceptorState.trailHistory.length > 1 && (
                    <polyline
                      points={interceptorState.trailHistory
                        .map((pt) => {
                          const dp = px({ x: pt.x, y: -pt.y });
                          return `${dp.x},${dp.y}`;
                        })
                        .join(' ')}
                      fill="none"
                      stroke="#38d9d6"
                      strokeWidth={2.5}
                      opacity={0.9}
                    />
                  )}
                </g>
              )}

              {interceptorState.style === 'cinematic' && (
                <g className="cinematic-layer">
                  {/* Launch blast ring at origin during scramble */}
                  {interceptorState.elapsed < 4 && (
                    <g className="cinematic-blast">
                      <circle
                        cx={originDisplayPos.x}
                        cy={originDisplayPos.y}
                        r={Math.min(interceptorState.elapsed * 20, 60)}
                        fill="none"
                        stroke="#fbbf24"
                        strokeWidth={2}
                        opacity={Math.max(0, 1 - interceptorState.elapsed / 4)}
                      />
                      <circle
                        cx={originDisplayPos.x}
                        cy={originDisplayPos.y}
                        r={Math.min(interceptorState.elapsed * 12, 35)}
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth={1.5}
                        opacity={Math.max(0, 1 - interceptorState.elapsed / 4)}
                      />
                      <text
                        x={originDisplayPos.x}
                        y={originDisplayPos.y - 12}
                        textAnchor="middle"
                        fill="#fbbf24"
                        fontSize={8.5}
                        fontFamily="monospace"
                        fontWeight={700}
                      >
                        SCRAMBLE IGNITION
                      </text>
                    </g>
                  )}
                  {/* Dual-tone guided trajectory */}
                  {interceptorState.trailHistory.length > 1 && (
                    <polyline
                      points={interceptorState.trailHistory
                        .map((pt) => {
                          const dp = px({ x: pt.x, y: -pt.y });
                          return `${dp.x},${dp.y}`;
                        })
                        .join(' ')}
                      fill="none"
                      stroke="#00f0ff"
                      strokeWidth={2.5}
                      strokeDasharray="6 3"
                      opacity={0.9}
                    />
                  )}
                  {/* Converging target lock crosshair on target */}
                  {tgtPx && (
                    <g transform={`translate(${tgtPx.x}, ${tgtPx.y})`}>
                      <circle cx={0} cy={0} r={18} fill="none" stroke="#fbbf24" strokeWidth={1.5} strokeDasharray="3 3" />
                      <line x1={-24} y1={0} x2={-12} y2={0} stroke="#fbbf24" strokeWidth={1.5} />
                      <line x1={12} y1={0} x2={24} y2={0} stroke="#fbbf24" strokeWidth={1.5} />
                      <line x1={0} y1={-24} x2={0} y2={-12} stroke="#fbbf24" strokeWidth={1.5} />
                      <line x1={0} y1={12} x2={0} y2={24} stroke="#fbbf24" strokeWidth={1.5} />
                      <text
                        x={0}
                        y={-22}
                        textAnchor="middle"
                        fill="#fbbf24"
                        fontSize={8}
                        fontFamily="monospace"
                        fontWeight={700}
                      >
                        LOCK-ON [INT-ALPHA]
                      </text>
                    </g>
                  )}
                  {/* Visual Escort Standoff Correlation when in rendezvous or complete */}
                  {(interceptorState.stage === 'rendezvous' || interceptorState.stage === 'complete') && tgtPx && (
                    <g className="cinematic-escort-lock">
                      <circle
                        cx={tgtPx.x}
                        cy={tgtPx.y}
                        r={Math.max(24, Math.min(60, interceptorState.distanceToTarget * scale))}
                        fill="none"
                        stroke="#4ade80"
                        strokeWidth={1.5}
                        strokeDasharray="3 3"
                        opacity={0.8}
                      />
                      <line
                        x1={interceptorDisplayPos.x}
                        y1={interceptorDisplayPos.y}
                        x2={tgtPx.x}
                        y2={tgtPx.y}
                        stroke="#4ade80"
                        strokeWidth={1.5}
                        strokeDasharray="2 2"
                        opacity={0.85}
                      />
                      {interceptorState.stage === 'complete' && (
                        <text
                          x={(interceptorDisplayPos.x + tgtPx.x) / 2}
                          y={(interceptorDisplayPos.y + tgtPx.y) / 2 - 8}
                          textAnchor="middle"
                          fill="#4ade80"
                          fontSize={8.5}
                          fontFamily="monospace"
                          fontWeight={800}
                        >
                          ESCORT ESTABLISHED · VISUAL LOCK
                        </text>
                      )}
                    </g>
                  )}
                </g>
              )}

              {/* 2. Interceptor Supersonic Fighter Icon (Translated cleanly to interceptorDisplayPos) */}
              <g
                transform={`translate(${interceptorDisplayPos.x - 16} ${interceptorDisplayPos.y - 16})`}
                className="interceptor-icon-group"
              >
                <g transform={`rotate(${interceptorState.heading} 16 16)`}>
                  {/* Engine exhaust plume */}
                  <circle
                    cx={16}
                    cy={30}
                    r={interceptorState.style === 'quick-streak' ? 5 : 4}
                    fill={interceptorState.style === 'quick-streak' ? '#fde047' : '#00f0ff'}
                    opacity={0.8}
                  />
                  <path
                    d={INTERCEPTOR_SILHOUETTE_PATH}
                    fill={interceptorState.style === 'quick' || interceptorState.style === 'quick-streak' ? '#fde047' : '#00f0ff'}
                    stroke="#ffffff"
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                  />
                </g>

                {/* Tactical HUD Tag */}
                <g transform="translate(16, -14)">
                  <rect
                    x={-55}
                    y={-8}
                    width={110}
                    height={16}
                    fill="#03141f"
                    stroke={interceptorState.style === 'quick' || interceptorState.style === 'quick-streak' ? '#fde047' : '#00f0ff'}
                    strokeWidth={1}
                    rx={2}
                  />
                  <text
                    x={0}
                    y={4}
                    textAnchor="middle"
                    fontSize={9}
                    fill={interceptorState.style === 'quick' || interceptorState.style === 'quick-streak' ? '#fde047' : '#00f0ff'}
                    fontFamily="monospace"
                    fontWeight={700}
                  >
                    {`INT-ALPHA [${interceptorState.stage.toUpperCase()}]`}
                  </text>
                </g>
              </g>
            </g>
          )}

          {/* ===============================================================
             FEATURE C: FIGHTER-JET SCRAMBLE EXERCISE (VIPER FLIGHT FORMATION)
             =============================================================== */}
          {jetScrambleState && jetScrambleState.jets.length > 0 && (
            <g className="jet-scramble-layer">
              {/* Air Corridor Circuit Guide (predetermined flight loop) */}
              <polygon
                points={jetScrambleState.flightCorridor
                  .map((pt) => {
                    const dp = px({ x: pt.x, y: -pt.y });
                    return `${dp.x},${dp.y}`;
                  })
                  .join(' ')}
                fill="none"
                stroke="#38bdf8"
                strokeWidth={1.2}
                strokeDasharray="6 6"
                opacity={0.35}
              />

              {/* Render Each Fighter Jet in Formation */}
              {jetScrambleState.jets.map((jet) => {
                const jetPos = px({ x: jet.pos.x, y: -jet.pos.y });
                return (
                  <g key={jet.id}>
                    {/* Jet Trail */}
                    {jet.trail.length > 1 && (
                      <polyline
                        points={jet.trail
                          .map((pt) => {
                            const dp = px({ x: pt.x, y: -pt.y });
                            return `${dp.x},${dp.y}`;
                          })
                          .join(' ')}
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth={1.5}
                        strokeDasharray="3 3"
                        opacity={0.65}
                      />
                    )}

                    {/* Fighter Jet Marker Icon */}
                    <g transform={`translate(${jetPos.x - 16} ${jetPos.y - 16})`}>
                      <g transform={`rotate(${jet.heading} 16 16)`}>
                        <circle cx={13.5} cy={29} r={2} fill="#38bdf8" opacity={0.8} />
                        <circle cx={18.5} cy={29} r={2} fill="#38bdf8" opacity={0.8} />
                        <path
                          d={FIGHTER_SILHOUETTE_PATH}
                          fill="#082f49"
                          stroke="#38bdf8"
                          strokeWidth={1.5}
                          strokeLinejoin="round"
                        />
                      </g>
                      {/* Jet Tag */}
                      <g transform="translate(16, 32)">
                        <rect x={-32} y={0} width={64} height={14} fill="#04121d" stroke="#38bdf8" strokeWidth={0.8} rx={2} />
                        <text x={0} y={10} textAnchor="middle" fontSize={8.5} fill="#38bdf8" fontFamily="monospace" fontWeight={700}>
                          {jet.callsign}
                        </text>
                      </g>
                    </g>
                  </g>
                );
              })}
            </g>
          )}

          {/* ===============================================================
             ENCOUNTER FEEDBACK (SUCCESS IMPACT FLASH & PARTICLES / MISS BADGE)
             =============================================================== */}
          {encounterFeedback && (
            <g className="encounter-feedback-layer">
              {encounterFeedback.outcome === 'success' ? (
                <g
                  transform={`translate(${px({ x: encounterFeedback.pos.x, y: -encounterFeedback.pos.y }).x}, ${px({ x: encounterFeedback.pos.x, y: -encounterFeedback.pos.y }).y})`}
                  className="impact-encounter-group"
                >
                  {/* Central Impact Flash */}
                  <circle cx={0} cy={0} r={24} fill="#ffffff" opacity={0.9} filter="url(#streak-glow)" className="impact-flash-burst" />
                  {/* Expanding Shockwaves */}
                  <circle cx={0} cy={0} r={36} fill="none" stroke="#4ade80" strokeWidth={2.5} opacity={0.85} className="impact-shockwave-1" />
                  <circle cx={0} cy={0} r={52} fill="none" stroke="#00f0ff" strokeWidth={1.5} strokeDasharray="4 4" opacity={0.6} className="impact-shockwave-2" />
                  {/* Fading Radial Spark Particles */}
                  {[0, 36, 72, 108, 144, 180, 216, 252, 288, 324].map((deg, i) => {
                    const rad = (deg * Math.PI) / 180;
                    const dist = 36 + (i % 3) * 10;
                    return (
                      <circle
                        key={`spark-${i}`}
                        cx={Math.cos(rad) * dist}
                        cy={Math.sin(rad) * dist}
                        r={2.5}
                        fill="#4ade80"
                        opacity={0.85}
                        className="impact-particle-spark"
                      />
                    );
                  })}
                  {/* Success Encounter Badge */}
                  <g transform="translate(0, -42)">
                    <rect x={-80} y={-10} width={160} height={20} fill="#021a10" stroke="#4ade80" strokeWidth={1.5} rx={3} />
                    <text x={0} y={4} textAnchor="middle" fill="#4ade80" fontSize={9.5} fontFamily="monospace" fontWeight={800}>
                      ✔ SUCCESS: TARGET DISABLED
                    </text>
                  </g>
                </g>
              ) : (
                <g
                  transform={`translate(${px({ x: encounterFeedback.pos.x, y: -encounterFeedback.pos.y }).x}, ${px({ x: encounterFeedback.pos.x, y: -encounterFeedback.pos.y }).y})`}
                  className="miss-encounter-group"
                >
                  <circle cx={0} cy={0} r={32} fill="none" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 4" opacity={0.8} />
                  <g transform="translate(0, -36)">
                    <rect x={-75} y={-10} width={150} height={20} fill="#1a1202" stroke="#f59e0b" strokeWidth={1.2} rx={3} />
                    <text x={0} y={4} textAnchor="middle" fill="#f59e0b" fontSize={9} fontFamily="monospace" fontWeight={800}>
                      ⚠ MISS: TARGET EVADED
                    </text>
                  </g>
                </g>
              )}
            </g>
          )}
        </svg>

        {/* Tactical Legend Box overlay */}
        {showLegend && (
          <div className="radar-legend-card">
            <div className="legend-title">TACTICAL RADAR SYMBOLOGY</div>
            <div className="legend-row">
              <span className="legend-symbol chevron green" />
              <span>Authorized Civil Aircraft</span>
            </div>
            <div className="legend-row">
              <span className="legend-symbol diamond amber" />
              <span>Unidentified Drone / UAV</span>
            </div>
            <div className="legend-row">
              <span className="legend-symbol chevron red" />
              <span>Disabled / Intercepted Contact</span>
            </div>
            <div className="legend-row">
              <span className="legend-symbol jet cyan" />
              <span>Simulated Interceptor (Exercise)</span>
            </div>
            <div className="legend-row">
              <span className="legend-symbol fighter-jet blue" />
              <span>VIPER Fighter Scramble</span>
            </div>
            <div className="legend-row">
              <span className="legend-line cyan dashed" />
              <span>Constant-Velocity Motion Forecast</span>
            </div>
            <div className="legend-row">
              <span className="legend-line amber dashed" />
              <span>Configured Buffer Boundary</span>
            </div>
          </div>
        )}
      </div>

      {/* Radar Bottom Status Strip */}
      <div className="radar-bottom-strip">
        <span>GRID: LOCAL METRES (N/E)</span>
        <span className="cyan">RINGS: 5KM / 10KM / 15KM / 20KM / 25KM</span>
        <span className="green">UPDATE RATE: 1000 MS SYNTHETIC</span>

        <div className="radar-exercise-buttons">
          {/* Part B: Compact Animation Style Selector with 3 Presets */}
          <div className="radar-style-pills" title="Select Interceptor Animation Preset">
            <span className="style-pills-label">PRESET:</span>
            {([
              { id: 'quick', label: '⚡ QUICK' },
              { id: 'cruise', label: '💠 CRUISE' },
              { id: 'cinematic', label: '🎬 CINEMATIC' },
            ] as const).map((opt) => {
              const currentStyle = interceptorState ? interceptorState.style : (selectedStyle ?? 'cinematic');
              const isActive =
                currentStyle === opt.id ||
                (opt.id === 'quick' && currentStyle === 'quick-streak') ||
                (opt.id === 'cruise' && (currentStyle === 'ion-trail' || currentStyle === 'arc-display'));
              return (
                <button
                  key={opt.id}
                  type="button"
                  className={`radar-style-btn ${isActive ? 'active' : ''}`}
                  onClick={() => onSelectStyle?.(opt.id)}
                  title={`Switch to ${opt.label} Animation Preset`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {onInitiateScramble && (
            <button
              type="button"
              className="btn small radar-scramble-action"
              onClick={onInitiateScramble}
            >
              ✈ JET SCRAMBLE
            </button>
          )}
          {onInitiateIntercept && (
            <button
              type="button"
              className="btn small radar-intercept-action"
              onClick={onInitiateIntercept}
            >
              ⚡ INTERCEPT SIMULATION
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
