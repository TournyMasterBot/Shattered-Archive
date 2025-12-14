import type { AudioSettings, BeepSound, InclusionRule } from './audio-settings-store';
import { getAudioAssetBlob } from './audio-asset-store';

const BEL = 7;

function lineHasBellChar(line: string): boolean {
  return line.indexOf('\u0007') !== -1;
}

function matchesAny(line: string, patterns: string[]): boolean {
  for (let i = 0; i < patterns.length; i++) {
    const p = patterns[i];
    if (!p) continue;
    if (line.indexOf(p) !== -1) return true;
  }
  return false;
}

function matchIncludeRule(line: string, rules: InclusionRule[]): InclusionRule | null {
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    if (!r?.enabled) continue;
    if (!r?.pattern) continue;
    if (line.indexOf(r.pattern) !== -1) return r;
  }
  return null;
}

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  return audioCtx;
}

async function ensureRunning(ctx: AudioContext) {
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      // ignore
    }
  }
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function playOscBeep(ctx: AudioContext, sound: Extract<BeepSound, { kind: 'osc' }>) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = sound.type ?? 'sine';
  osc.frequency.value = Math.max(50, Math.min(6000, sound.frequencyHz));
  gain.gain.value = clamp01(sound.volume);

  osc.connect(gain);
  gain.connect(ctx.destination);

  const now = ctx.currentTime;
  const dur = Math.max(10, Math.min(4000, sound.durationMs)) / 1000;

  // soften clicks
  gain.gain.setValueAtTime(gain.gain.value, now);
  gain.gain.linearRampToValueAtTime(0.0001, now + dur);

  osc.start(now);
  osc.stop(now + dur);
}

// Cache decoded buffers by assetId/url to avoid repeated decode work
const decodedCache = new Map<string, AudioBuffer>();

async function decodeToBuffer(ctx: AudioContext, key: string, blob: Blob): Promise<AudioBuffer | null> {
  const cached = decodedCache.get(key);
  if (cached) return cached;

  try {
    const arr = await blob.arrayBuffer();
    const buf = await ctx.decodeAudioData(arr);
    decodedCache.set(key, buf);
    return buf;
  } catch {
    return null;
  }
}

async function playBuffer(ctx: AudioContext, buffer: AudioBuffer, volume: number) {
  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  gain.gain.value = clamp01(volume);

  src.buffer = buffer;
  src.connect(gain);
  gain.connect(ctx.destination);
  src.start();
}

export async function playBeepSound(sound: BeepSound) {
  const ctx = getAudioContext();
  if (!ctx) return;

  await ensureRunning(ctx);

  if (sound.kind === 'osc') {
    playOscBeep(ctx, sound);
    return;
  }

  if (sound.kind === 'asset') {
    const blob = await getAudioAssetBlob(sound.assetId);
    if (!blob) return;

    const buffer = await decodeToBuffer(ctx, `asset:${sound.assetId}`, blob);
    if (!buffer) return;

    await playBuffer(ctx, buffer, sound.volume);
    return;
  }

  if (sound.kind === 'file') {
    // NOTE: this fetches/decodes; use sparingly
    try {
      const res = await fetch(sound.url);
      const blob = await res.blob();
      const buffer = await decodeToBuffer(ctx, `url:${sound.url}`, blob);
      if (!buffer) return;
      await playBuffer(ctx, buffer, sound.volume);
    } catch {
      // ignore
    }
  }
}

export type BeepDecision =
  | { shouldBeep: false }
  | { shouldBeep: true; sound: BeepSound; reason: 'bell' | 'include' };

export function decideBeepForLine(line: string, settings: AudioSettings): BeepDecision {
  if (!settings.beepsEnabled) return { shouldBeep: false };

  // exclusions win
  if (settings.excludePatterns.length > 0 && matchesAny(line, settings.excludePatterns)) {
    return { shouldBeep: false };
  }

  // inclusion can force beeps (even without BEL)
  if (settings.includeRules.length > 0) {
    const rule = matchIncludeRule(line, settings.includeRules);
    if (rule) {
      return { shouldBeep: true, sound: rule.sound ?? settings.defaultBeep, reason: 'include' };
    }
  }

  // default: BEL
  if (settings.beepOnBellChar && lineHasBellChar(line)) {
    return { shouldBeep: true, sound: settings.defaultBeep, reason: 'bell' };
  }

  return { shouldBeep: false };
}

export async function tryBeepForLine(line: string, settings: AudioSettings) {
  const decision = decideBeepForLine(line, settings);
  if (!decision.shouldBeep) return;
  await playBeepSound(decision.sound);
}
