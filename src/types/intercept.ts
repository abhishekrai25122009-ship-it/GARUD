// Fictional local intercept exercise and jet scramble types.
// All trajectory logic is purely synthetic and non-operational.

export type InterceptStage =
  | 'idle'
  | 'confirming'
  | 'scramble'
  | 'vector'
  | 'rendezvous'
  | 'complete'
  | 'miss'
  | 'aborted';

export type AnimationStyle =
  | 'quick'
  | 'cruise'
  | 'cinematic'
  | 'quick-streak'
  | 'ion-trail'
  | 'arc-display';

export interface InterceptEvent {
  t: number;
  timeStr: string;
  stage: InterceptStage;
  text: string;
  type: 'info' | 'warn' | 'success' | 'alert';
}

export interface InterceptorState {
  callsign: string;
  pos: { x: number; y: number; z: number };
  heading: number;
  speed: number; // m/s
  altitude: number; // ft
  targetId: string;
  stage: InterceptStage;
  progress: number; // 0 to 100
  elapsed: number; // seconds
  distanceToTarget: number; // metres
  closureRate: number; // m/s
  eventLog: InterceptEvent[];
  originPos: { x: number; y: number };
  style: AnimationStyle;
  paused: boolean;
  trailHistory: Array<{ x: number; y: number; t: number }>;
  arcControl?: { x: number; y: number };
  targetOutcome?: 'success' | 'miss';
  totalDuration?: number;
}

export interface EncounterFeedback {
  targetId: string;
  pos: { x: number; y: number; z: number };
  t: number;
  outcome: 'success' | 'miss';
  key: string;
}

export interface MissionSummaryData {
  detected: number;
  active: number;
  intercepted: number;
  missed: number;
}

// Fictional Fighter-Jet Scramble Exercise Types (Part C)
export type JetScrambleStage =
  | 'idle'
  | 'confirming'
  | 'launch'
  | 'airborne'
  | 'patrol'
  | 'return'
  | 'complete'
  | 'aborted';

export interface JetAsset {
  id: string;
  callsign: string;
  pos: { x: number; y: number; z: number };
  heading: number;
  speed: number; // m/s
  altitude: number; // ft
  trail: Array<{ x: number; y: number }>;
}

export interface JetScrambleEvent {
  t: number;
  timeStr: string;
  stage: JetScrambleStage;
  text: string;
  type: 'info' | 'warn' | 'success';
}

export interface JetScrambleState {
  stage: JetScrambleStage;
  progress: number; // 0 to 100
  elapsed: number; // seconds
  paused: boolean;
  jets: JetAsset[];
  eventLog: JetScrambleEvent[];
  flightCorridor: Array<{ x: number; y: number }>;
}
