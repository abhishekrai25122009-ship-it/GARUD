// GARUD JARVIS-Style Synthesized Command Voice System.
// Uses local window.speechSynthesis to produce calm, synthetic, authoritative
// airspace defense command announcements. Fully event-driven, deduplicated,
// and respects operator mute settings.

let voiceEnabled = true;
const lastSpokenMap = new Map<string, number>();
const DEDUPE_WINDOW_MS = 3800;

export function isVoiceSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

export function setVoiceEnabled(enabled: boolean): void {
  voiceEnabled = enabled;
  if (!enabled && typeof window !== 'undefined' && window.speechSynthesis) {
    try {
      window.speechSynthesis.cancel();
    } catch {}
  }
}

export function isVoiceEnabled(): boolean {
  return voiceEnabled;
}

function selectBestVoice(synth: SpeechSynthesis): SpeechSynthesisVoice | null {
  const voices = synth.getVoices();
  if (!voices || voices.length === 0) return null;

  // Search for preferred JARVIS-like baritone / crisp synthetic English voices
  const preferredNames = [
    'daniel',
    'google uk english male',
    'george',
    'oliver',
    'arthur',
    'natural',
    'en-gb',
  ];

  for (const pref of preferredNames) {
    const match = voices.find(
      (v) => v.name.toLowerCase().includes(pref) || v.lang.toLowerCase().includes(pref),
    );
    if (match) return match;
  }

  // Fallback to any English voice
  const enVoice = voices.find((v) => v.lang.startsWith('en'));
  if (enVoice) return enVoice;

  return voices[0] ?? null;
}

/**
 * Announce a tactical command message.
 * @param phrase The speech text to synthesize
 * @param priority If true, interrupts any current utterance (for critical alerts / target down)
 */
export function speakTactical(phrase: string, priority = false): void {
  if (!voiceEnabled || !isVoiceSupported()) return;

  const now = Date.now();
  const lastTime = lastSpokenMap.get(phrase) ?? 0;
  if (now - lastTime < DEDUPE_WINDOW_MS) {
    return;
  }
  lastSpokenMap.set(phrase, now);

  try {
    const synth = window.speechSynthesis;
    if (priority && synth.speaking) {
      synth.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(phrase);
    const voice = selectBestVoice(synth);
    if (voice) {
      utterance.voice = voice;
    }

    // JARVIS aesthetic: slightly lower pitch, crisp measured cadence
    utterance.rate = 1.02;
    utterance.pitch = 0.92;
    utterance.volume = 0.88;

    synth.speak(utterance);
  } catch (err) {
    // Graceful silent recovery if audio device or speech synth is blocked
    console.debug('Speech synthesis unavailable:', err);
  }
}
