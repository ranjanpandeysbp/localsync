/** Lightweight chime for new quotes — no external audio file needed. */

let ctx: AudioContext | null = null;
let unlocked = false;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

/** Call once after any user gesture so browsers allow sound later. */
export async function unlockNotificationSound(): Promise<void> {
  const audio = getCtx();
  if (!audio) return;
  if (audio.state === "suspended") {
    try {
      await audio.resume();
    } catch {
      return;
    }
  }
  unlocked = true;
}

function tone(
  audio: AudioContext,
  frequency: number,
  start: number,
  duration: number,
  gainValue: number,
) {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

/** Two-tone bell that rings when a provider sends a quote. */
let lastRingAt = 0;

export async function playQuoteBell(): Promise<void> {
  const now = Date.now();
  if (now - lastRingAt < 1200) return;
  lastRingAt = now;

  const audio = getCtx();
  if (!audio) return;
  try {
    if (audio.state === "suspended") await audio.resume();
    unlocked = true;
    const t = audio.currentTime;
    // Classic doorbell-ish ding-dong
    tone(audio, 880, t, 0.35, 0.28);
    tone(audio, 1174.7, t, 0.28, 0.12);
    tone(audio, 659.25, t + 0.28, 0.55, 0.32);
    tone(audio, 880, t + 0.28, 0.4, 0.1);
  } catch {
    /* autoplay blocked or unsupported */
  }
}

export function isSoundUnlocked(): boolean {
  return unlocked;
}
