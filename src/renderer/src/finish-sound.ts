/**
 * A short, soft two-note chime when a coworker finishes a job. It is drawn with Web Audio, so
 * there is no sound file to ship or load. Any failure is silent: a sound is only a comfort.
 */
let context: AudioContext | null = null;
let lastPlayedAt = 0;
/** Several coworkers finishing together make one chime, not a burst. */
const QUIET_GAP_MS = 1_500;

export function playFinishSound(now = Date.now()): boolean {
  if (now - lastPlayedAt < QUIET_GAP_MS) return false;
  lastPlayedAt = now;
  try {
    const Audio = window.AudioContext;
    if (!Audio) return false;
    context ??= new Audio();
    const audio = context;
    if (audio.state === "suspended") void audio.resume().catch(() => undefined);
    const start = audio.currentTime + 0.02;
    for (const [index, frequency] of [659.25, 880].entries()) {
      const at = start + index * 0.14;
      const tone = audio.createOscillator();
      const volume = audio.createGain();
      tone.type = "sine";
      tone.frequency.value = frequency;
      volume.gain.setValueAtTime(0.0001, at);
      volume.gain.exponentialRampToValueAtTime(0.09, at + 0.02);
      volume.gain.exponentialRampToValueAtTime(0.0001, at + 0.32);
      tone.connect(volume).connect(audio.destination);
      tone.start(at);
      tone.stop(at + 0.34);
    }
    return true;
  } catch {
    return false;
  }
}
