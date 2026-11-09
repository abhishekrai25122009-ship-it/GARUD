// Local Web Audio tones for GARUD. Audio is disabled until the operator
// explicitly enables it through a user gesture. No autoplay, no continuous
// siren, no weapon sounds.

type ToneType = 'warning' | 'lost' | 'ack';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = false;
let volume = 0.4;

const lastPlay = new Map<ToneType, number>();
const RATE_LIMIT_MS = 700;

function ensure(): AudioContext {
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) throw new Error('Web Audio not available');
    ctx = new AC();
    master = ctx.createGain();
    master.connect(ctx.destination);
    master.gain.value = volume;
  }
  return ctx;
}

export function audioEnabled(): boolean {
  return enabled && !!ctx;
}

export function setAudio(on: boolean, vol?: number): void {
  enabled = on;
  if (vol !== undefined) {
    volume = Math.max(0, Math.min(1, vol));
    if (master) master.gain.value = volume;
  }
  if (on && !ctx) ensure();
}

export function setVolume(vol: number): void {
  volume = Math.max(0, Math.min(1, vol));
  if (master) master.gain.value = volume;
}

export function getVolume(): number {
  return volume;
}

export function playTone(type: ToneType): void {
  if (!enabled || !ctx) return;
  const now = ctx.currentTime;
  const last = lastPlay.get(type) ?? 0;
  if (now - last < RATE_LIMIT_MS / 1000) return;
  lastPlay.set(type, now);

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.connect(gain);
  gain.connect(master!);

  const start = now;
  const end = start + 0.04;
  const off = start + 0.22;

  const cfg: Record<ToneType, { f: number; gain: number }> = {
    warning: { f: 920, gain: 0.12 },
    lost: { f: 520, gain: 0.1 },
    ack: { f: 1350, gain: 0.08 },
  };
  const c = cfg[type];
  osc.frequency.setValueAtTime(c.f, start);
  osc.frequency.exponentialRampToValueAtTime(c.f * 0.85, off);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(c.gain, end);
  gain.gain.exponentialRampToValueAtTime(0.001, off);

  osc.start(start);
  osc.stop(off);
}

// Quiet optional ambience drone, off by default.
let drone: OscillatorNode | null = null;
let droneGain: GainNode | null = null;

export function setAmbience(on: boolean): void {
  if (!enabled || !ctx) return;
  if (on && !drone) {
    const c = ctx;
    drone = c.createOscillator();
    drone.type = 'sine';
    drone.frequency.value = 110;
    droneGain = c.createGain();
    droneGain.gain.value = 0.015;
    drone.connect(droneGain);
    droneGain.connect(c.destination);
    drone.start();
  }
  if (!on && drone) {
    drone.stop();
    drone = null;
    droneGain = null;
  }
}
