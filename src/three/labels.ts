// Canvas-texture billboard labels for the 3D viewport.
// Text is drawn with locally available monospace fonts on an offscreen
// canvas; nothing is fetched from the network. Labels use size-attenuation
// off sprites so callsigns stay readable at any zoom level, and each canvas
// is only redrawn when its content actually changes.

import {
  CanvasTexture,
  Color,
  LinearFilter,
  MathUtils,
  PerspectiveCamera,
  Sprite,
  SpriteMaterial,
} from 'three';

export type LabelTone = 'green' | 'amber' | 'red' | 'cyan' | 'blue' | 'grey' | 'white';

const TONE_COLORS: Record<LabelTone, { text: string; border: string; bg: string }> = {
  green: { text: '#56B8F9', border: '#263951', bg: 'rgba(12, 20, 35, 0.88)' },
  amber: { text: '#FFC568', border: '#664a20', bg: 'rgba(28, 20, 10, 0.88)' },
  red: { text: '#FF647C', border: '#66202e', bg: 'rgba(30, 10, 16, 0.88)' },
  cyan: { text: '#48D9F5', border: '#1e4860', bg: 'rgba(8, 22, 38, 0.9)' },
  blue: { text: '#3478F6', border: '#1c3e7a', bg: 'rgba(10, 20, 40, 0.88)' },
  grey: { text: '#72869F', border: '#263951', bg: 'rgba(12, 20, 35, 0.88)' },
  white: { text: '#F0F6FF', border: '#365072', bg: 'rgba(17, 29, 48, 0.9)' },
};

const CANVAS_SCALE = 3; // supersample for crisp text

export class LabelSprite {
  readonly sprite: Sprite;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: CanvasTexture;
  private material: SpriteMaterial;
  private lastText = '';
  private lastTone: LabelTone = 'white';
  private lastSelected = false;
  /** Screen-height fraction the label occupies. */
  readonly screenFraction: number;

  constructor(lines: string[], tone: LabelTone, screenFraction = 0.052) {
    this.screenFraction = screenFraction;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 360;
    this.canvas.height = 96;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable for label rendering');
    this.ctx = ctx;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.minFilter = LinearFilter;
    this.texture.magFilter = LinearFilter;
    this.material = new SpriteMaterial({
      map: this.texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.sprite = new Sprite(this.material);
    this.sprite.renderOrder = 900;
    this.sprite.scale.set(0.1, 0.026, 1);
    this.draw(lines, tone, false);
  }

  /**
   * Size the billboard in world units so it always occupies `screenFraction`
   * of the viewport height, regardless of camera distance. Without this a
   * 0.05-unit sprite is sub-pixel once the camera frames the full sector.
   */
  updateScreenScale(camera: PerspectiveCamera): void {
    const dist = Math.max(camera.position.distanceTo(this.sprite.position), 1);
    const vFov = MathUtils.degToRad(camera.fov);
    const worldH = MathUtils.clamp(
      2 * dist * Math.tan(vFov / 2) * this.screenFraction,
      0.4,
      400,
    );
    const worldW = worldH * (this.canvas.width / this.canvas.height);
    this.sprite.scale.set(worldW, worldH, 1);
  }

  /** Redraw only when content or tone changed; cheap to call per frame. */
  update(lines: string[], tone: LabelTone, selected: boolean): void {
    const text = lines.join('\n');
    if (text === this.lastText && tone === this.lastTone && selected === this.lastSelected) return;
    this.draw(lines, tone, selected);
  }

  private draw(lines: string[], tone: LabelTone, selected: boolean): void {
    this.lastText = lines.join('\n');
    this.lastTone = tone;
    this.lastSelected = selected;

    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const colors = TONE_COLORS[tone];
    const padX = 14;
    const rowH = 34;
    const boxH = Math.min(h, 14 + lines.length * rowH);
    const boxY = (h - boxH) / 2;

    ctx.fillStyle = colors.bg;
    ctx.strokeStyle = selected ? '#B59AFF' : colors.border;
    ctx.lineWidth = selected ? 5 : 3;
    const r = 10;
    ctx.beginPath();
    ctx.moveTo(padX + r, boxY);
    ctx.arcTo(w - padX, boxY, w - padX, boxY + boxH, r);
    ctx.arcTo(w - padX, boxY + boxH, padX, boxY + boxH, r);
    ctx.arcTo(padX, boxY + boxH, padX, boxY, r);
    ctx.arcTo(padX, boxY, w - padX, boxY, r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${22 * CANVAS_SCALE * 0.55}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    lines.forEach((line, i) => {
      ctx.fillStyle = i === 0 ? colors.text : '#A7B8CE';
      ctx.fillText(line, w / 2, boxY + 12 + rowH * i + rowH / 2 - 4, w - padX * 2 - 10);
    });

    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
    this.material.dispose();
  }
}

/** Small canvas sprite used for one-off markers (apogee, base pad, etc.). */
export interface MarkerSprite {
  sprite: Sprite;
  updateScreenScale: (camera: PerspectiveCamera) => void;
  dispose: () => void;
}

export function makeMarkerSprite(
  text: string,
  color: string,
  screenFraction = 0.04,
): MarkerSprite {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 80;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = 'rgba(3, 12, 14, 0.8)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.fillRect(4, 12, canvas.width - 8, canvas.height - 24);
    ctx.strokeRect(4, 12, canvas.width - 8, canvas.height - 24);
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 26px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width - 24);
  }
  const texture = new CanvasTexture(canvas);
  const material = new SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
  const sprite = new Sprite(material);
  sprite.renderOrder = 890;
  sprite.scale.set(0.09, 0.022, 1);
  return {
    sprite,
    updateScreenScale: (camera: PerspectiveCamera) => {
      const dist = Math.max(camera.position.distanceTo(sprite.position), 1);
      const vFov = MathUtils.degToRad(camera.fov);
      const worldH = MathUtils.clamp(
        2 * dist * Math.tan(vFov / 2) * screenFraction,
        0.4,
        400,
      );
      sprite.scale.set(worldH * (canvas.width / canvas.height), worldH, 1);
    },
    dispose: () => {
      texture.dispose();
      material.dispose();
    },
  };
}

export function toneForColor(hex: number): string {
  return `#${new Color(hex).getHexString()}`;
}
