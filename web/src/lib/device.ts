"use client";

export function vibrate(pattern: number | number[]) {
  try {
    // 화면을 한 번도 터치하지 않았으면 브라우저가 진동을 막고 콘솔 경고를 띄우므로 미리 건너뜀
    const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (ua && !ua.hasBeenActive) return;
    navigator.vibrate?.(pattern);
  } catch {
    /* iOS Safari 등 미지원 */
  }
}

let audioCtx: AudioContext | null = null;
/** 짧은 경고음 (사용자 터치 이후에만 소리 남: 브라우저 정책) */
export function beep(freq = 880, ms = 160) {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audioCtx ??= new Ctx();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = freq;
    gain.gain.value = 0.15;
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + ms / 1000);
  } catch {
    /* 무시 */
  }
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function shareLink(data: { title: string; text: string; url: string }) {
  if (navigator.share) {
    try {
      await navigator.share(data);
      return "shared" as const;
    } catch (e) {
      if ((e as Error).name === "AbortError") return "aborted" as const;
    }
  }
  return (await copyText(data.url)) ? ("copied" as const) : ("failed" as const);
}

